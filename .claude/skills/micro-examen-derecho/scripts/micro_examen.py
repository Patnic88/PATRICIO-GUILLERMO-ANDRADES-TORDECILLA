#!/usr/bin/env python3
"""micro_examen.py — motor del micro examen de derecho.

Hace el trabajo determinista para que el examen dure minutos y no se apoye en
la memoria del modelo: selecciona qué preguntar hoy (repetición espaciada),
registra resultados, controla vigencia de las fuentes y reporta el estado.

Sin dependencias externas. Los datos viven fuera de la skill (se conservan
aunque la skill se actualice):

    $MICRO_EXAMEN_DIR  o  ~/.micro-examen/
        banco.jsonl       ítems verificados (los únicos que se preguntan)
        pendientes.jsonl  ítems sin fuente confirmada (NUNCA se preguntan)
        progreso.csv      caja, próximo repaso y marcas por ítem
        historial.csv     una línea por respuesta, para métricas

Uso:
    micro_examen.py seleccionar [--n 6] [--modo estandar] [--materia laboral]
    micro_examen.py registrar lab-003=mal muni-011=bien:alta proc-002=parcial
    micro_examen.py agregar --archivo nuevos.jsonl [--dry-run]
    micro_examen.py estado [--materia laboral]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
from datetime import date, timedelta
from pathlib import Path

# Leitner: días hasta el próximo repaso según la caja alcanzada.
INTERVALOS = {1: 1, 2: 3, 3: 7, 4: 21, 5: 60}
CAJA_MAX = 5
MESES_VIGENCIA_DEFECTO = 12

CAMPOS_PROGRESO = [
    "id", "materia", "caja", "ultimo_repaso", "proximo_repaso",
    "aciertos", "parciales", "fallos", "racha", "ultimo_resultado", "riesgo",
]
CAMPOS_ITEM_OBLIGATORIOS = ["id", "materia", "pregunta", "elementos", "fuente", "verificado_el"]
TIPOS = ["recuerdo", "aplicacion", "discriminacion", "cita", "deteccion"]
MARCADORES_SIN_VERIFICAR = ["[verificar", "[pendiente", "[confirmar", "[por verificar"]


# --------------------------------------------------------------------------- datos

def dir_datos(cli: str | None = None) -> Path:
    ruta = cli or os.environ.get("MICRO_EXAMEN_DIR") or (Path.home() / ".micro-examen")
    d = Path(ruta).expanduser()
    d.mkdir(parents=True, exist_ok=True)
    for nombre in ("banco.jsonl", "pendientes.jsonl"):
        (d / nombre).touch()
    p = d / "progreso.csv"
    if not p.exists():
        with p.open("w", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, fieldnames=CAMPOS_PROGRESO).writeheader()
    h = d / "historial.csv"
    if not h.exists():
        with h.open("w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["fecha", "id", "materia", "resultado", "confianza", "caja_resultante"])
    return d


def leer_jsonl(ruta: Path) -> list[dict]:
    items = []
    for n, linea in enumerate(ruta.read_text(encoding="utf-8").splitlines(), 1):
        linea = linea.strip()
        if not linea or linea.startswith("//"):
            continue
        try:
            items.append(json.loads(linea))
        except json.JSONDecodeError as e:
            print(f"aviso: {ruta.name} línea {n} ilegible ({e}); se omite", file=sys.stderr)
    return items


def leer_progreso(d: Path) -> dict[str, dict]:
    with (d / "progreso.csv").open(encoding="utf-8") as f:
        return {fila["id"]: fila for fila in csv.DictReader(f) if fila.get("id")}


def escribir_progreso(d: Path, filas: dict[str, dict]) -> None:
    with (d / "progreso.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS_PROGRESO)
        w.writeheader()
        for fila in sorted(filas.values(), key=lambda r: r["id"]):
            w.writerow({c: fila.get(c, "") for c in CAMPOS_PROGRESO})


# --------------------------------------------------------------------------- validación

def validar_item(item: dict, ids_existentes: set[str]) -> list[str]:
    """Devuelve la lista de problemas. Lista vacía = el ítem puede preguntarse."""
    problemas = []
    for campo in CAMPOS_ITEM_OBLIGATORIOS:
        if not item.get(campo):
            problemas.append(f"falta '{campo}'")
    if item.get("id") in ids_existentes:
        problemas.append(f"id duplicado: {item.get('id')}")
    elementos = item.get("elementos")
    if elementos is not None and (not isinstance(elementos, list) or not all(isinstance(e, str) and e.strip() for e in elementos)):
        problemas.append("'elementos' debe ser una lista de textos no vacíos")
    if not item.get("url") and not item.get("documento"):
        problemas.append("falta 'url' o 'documento' (dónde consta la fuente)")
    if item.get("tipo") and item["tipo"] not in TIPOS:
        problemas.append(f"'tipo' inválido: {item['tipo']} (use {'/'.join(TIPOS)})")
    v = item.get("verificado_el")
    if v:
        try:
            if date.fromisoformat(str(v)) > date.today():
                problemas.append("'verificado_el' es una fecha futura")
        except ValueError:
            problemas.append("'verificado_el' no tiene formato AAAA-MM-DD")
    texto = json.dumps(item, ensure_ascii=False).lower()
    for marca in MARCADORES_SIN_VERIFICAR:
        if marca in texto:
            problemas.append(f"contiene marcador sin verificar: '{marca}]'")
            break
    return problemas


def vigente(item: dict, meses: int, hoy: date) -> bool:
    try:
        v = date.fromisoformat(str(item.get("verificado_el", "")))
    except ValueError:
        return False
    return (hoy - v).days <= int(meses * 30.44)


# --------------------------------------------------------------------------- selección

def estado_item(item: dict, prog: dict | None, hoy: date) -> tuple[str, int, int]:
    """(estado, caja, días de atraso). estado: nuevo | vencido | mantenimiento."""
    if not prog:
        return "nuevo", 0, 0
    caja = int(prog.get("caja") or 1)
    try:
        prox = date.fromisoformat(prog.get("proximo_repaso") or "")
    except ValueError:
        return "vencido", caja, 999
    atraso = (hoy - prox).days
    return ("vencido" if atraso >= 0 else "mantenimiento"), caja, max(atraso, 0)


def intercalar(items: list[dict]) -> list[dict]:
    """Evita dos ítems seguidos de la misma materia (interleaving)."""
    restantes, orden, previa = list(items), [], None
    while restantes:
        elegido = next((i for i in restantes if i.get("materia") != previa), restantes[0])
        restantes.remove(elegido)
        orden.append(elegido)
        previa = elegido.get("materia")
    return orden


def seleccionar(args) -> int:
    d = dir_datos(args.datos)
    hoy = date.fromisoformat(args.hoy) if args.hoy else date.today()
    banco = leer_jsonl(d / "banco.jsonl")
    prog = leer_progreso(d)
    rnd = random.Random(args.semilla if args.semilla is not None else hoy.toordinal())

    por_reverificar, candidatos = [], []
    for item in banco:
        if args.materia and item.get("materia", "").lower() != args.materia.lower():
            continue
        if not vigente(item, args.vigencia_meses, hoy):
            por_reverificar.append({"id": item.get("id"), "materia": item.get("materia"),
                                    "fuente": item.get("fuente"), "verificado_el": item.get("verificado_el")})
            continue
        p = prog.get(item.get("id", ""))
        est, caja, atraso = estado_item(item, p, hoy)
        candidatos.append({**item, "_estado": est, "_caja": caja, "_atraso": atraso,
                           "_riesgo": (p or {}).get("riesgo") in ("1", "si", "sí"),
                           "_ultimo": (p or {}).get("ultimo_resultado", "")})

    vencidos = sorted([c for c in candidatos if c["_estado"] == "vencido"],
                      key=lambda c: (not c["_riesgo"], c["_caja"], -c["_atraso"]))
    nuevos = [c for c in candidatos if c["_estado"] == "nuevo"]
    rnd.shuffle(nuevos)
    mantenimiento = [c for c in candidatos if c["_estado"] == "mantenimiento"]
    rnd.shuffle(mantenimiento)
    mantenimiento.sort(key=lambda c: c["_caja"])

    n = args.n or {"relampago": 4, "nuevos": 5, "errores": 6}.get(args.modo, 6)
    if args.modo == "relampago":
        cuotas = [(vencidos, n), (nuevos, n), (mantenimiento, n)]
    elif args.modo == "nuevos":
        cuotas = [(nuevos, n), (vencidos, n)]
    elif args.modo == "errores":
        fallando = [c for c in vencidos + mantenimiento if c["_riesgo"] or c["_caja"] <= 2 or c["_ultimo"] == "mal"]
        cuotas = [(fallando, n), (vencidos, n), (nuevos, n)]
    else:  # estandar: repaso vencido + algo nuevo + mantenimiento
        cuotas = [(vencidos, max(n - 2, 1)), (nuevos, 1), (mantenimiento, 1),
                  (vencidos, n), (nuevos, n), (mantenimiento, n)]

    elegidos, vistos = [], set()
    for grupo, cuota in cuotas:
        tomados = 0
        for c in grupo:
            if len(elegidos) >= n or tomados >= cuota:
                break
            if c["id"] in vistos:
                continue
            elegidos.append(c)
            vistos.add(c["id"])
            tomados += 1
    elegidos = intercalar(elegidos)

    salida = {
        "fecha": hoy.isoformat(),
        "modo": args.modo,
        "materia": args.materia,
        "items": [{k: v for k, v in c.items() if not k.startswith("_")} |
                  {"estado": c["_estado"], "caja": c["_caja"], "dias_atraso": c["_atraso"],
                   "riesgo": c["_riesgo"]} for c in elegidos],
        "resumen": {
            "banco": len(banco), "candidatos": len(candidatos), "vencidos_hoy": len(vencidos),
            "nuevos_disponibles": len(nuevos), "seleccionados": len(elegidos),
            "pendientes_sin_verificar": len(leer_jsonl(d / "pendientes.jsonl")),
        },
        "por_reverificar": por_reverificar,
        "datos": str(d),
    }
    if args.formato == "texto":
        print(f"Micro examen {hoy} · modo {args.modo} · {len(elegidos)} ítems")
        for i, c in enumerate(elegidos, 1):
            print(f"{i}. [{c.get('materia')}/{c.get('tipo', 'recuerdo')}] ({c['_estado']}, caja {c['_caja']}) {c['id']}")
            print(f"   {c.get('pregunta')}")
        if not elegidos:
            print("   (sin ítems: dar de alta en el banco antes de preguntar; nada de preguntas de memoria)")
        if por_reverificar:
            print(f"\nPor reverificar (no se preguntan): {len(por_reverificar)}")
    else:
        print(json.dumps(salida, ensure_ascii=False, indent=2))
    return 0


# --------------------------------------------------------------------------- registro

def registrar(args) -> int:
    d = dir_datos(args.datos)
    hoy = date.fromisoformat(args.hoy) if args.hoy else date.today()
    banco = {i.get("id"): i for i in leer_jsonl(d / "banco.jsonl")}
    prog = leer_progreso(d)
    historial, aplicados = [], []

    for par in args.resultados:
        if "=" not in par:
            print(f"error: '{par}' no tiene forma id=resultado", file=sys.stderr)
            return 2
        item_id, valor = par.split("=", 1)
        resultado, _, confianza = valor.partition(":")
        resultado, confianza = resultado.strip().lower(), confianza.strip().lower()
        if resultado not in ("bien", "parcial", "mal"):
            print(f"error: resultado inválido en '{par}' (bien|parcial|mal)", file=sys.stderr)
            return 2
        if item_id not in banco:
            print(f"error: '{item_id}' no está en banco.jsonl", file=sys.stderr)
            return 2

        fila = prog.get(item_id, {"id": item_id, "materia": banco[item_id].get("materia", ""),
                                  "caja": "1", "aciertos": "0", "parciales": "0", "fallos": "0",
                                  "racha": "0", "riesgo": "0"})
        caja = int(fila.get("caja") or 1)
        racha = int(fila.get("racha") or 0)
        if resultado == "bien":
            caja, racha = min(caja + 1, CAJA_MAX), racha + 1
            dias = INTERVALOS[caja]
            fila["aciertos"] = str(int(fila.get("aciertos") or 0) + 1)
            fila["riesgo"] = "0"  # respondió bien: deja de ser un error caro
        elif resultado == "parcial":
            racha = 0
            dias = max(INTERVALOS[caja] // 2, 1)
            fila["parciales"] = str(int(fila.get("parciales") or 0) + 1)
        else:
            caja, racha, dias = 1, 0, 1
            fila["fallos"] = str(int(fila.get("fallos") or 0) + 1)
            if confianza == "alta":
                fila["riesgo"] = "1"  # se equivocó estando seguro: el error caro

        fila.update({"materia": banco[item_id].get("materia", fila.get("materia", "")),
                     "caja": str(caja), "ultimo_repaso": hoy.isoformat(),
                     "proximo_repaso": (hoy + timedelta(days=dias)).isoformat(),
                     "racha": str(racha), "ultimo_resultado": resultado})
        prog[item_id] = fila
        historial.append([hoy.isoformat(), item_id, fila["materia"], resultado, confianza, caja])
        aplicados.append({"id": item_id, "resultado": resultado, "caja": caja,
                          "proximo_repaso": fila["proximo_repaso"], "riesgo": fila.get("riesgo") == "1"})

    escribir_progreso(d, prog)
    with (d / "historial.csv").open("a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(historial)
    print(json.dumps({"fecha": hoy.isoformat(), "registrados": aplicados}, ensure_ascii=False, indent=2))
    return 0


# --------------------------------------------------------------------------- alta de ítems

def agregar(args) -> int:
    d = dir_datos(args.datos)
    nuevos = leer_jsonl(Path(args.archivo).expanduser())
    ids = {i.get("id") for i in leer_jsonl(d / "banco.jsonl")}
    aceptados, rechazados = [], []

    for item in nuevos:
        problemas = validar_item(item, ids)
        if problemas:
            rechazados.append({"id": item.get("id", "(sin id)"), "problemas": problemas, "item": item})
        else:
            item.setdefault("tipo", "recuerdo")
            aceptados.append(item)
            ids.add(item["id"])

    if not args.dry_run:
        if aceptados:
            with (d / "banco.jsonl").open("a", encoding="utf-8") as f:
                for item in aceptados:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")
        if rechazados:
            with (d / "pendientes.jsonl").open("a", encoding="utf-8") as f:
                for r in rechazados:
                    f.write(json.dumps({**r["item"], "_problemas": r["problemas"]}, ensure_ascii=False) + "\n")

    print(json.dumps({
        "aceptados": [i["id"] for i in aceptados],
        "a_pendientes": [{"id": r["id"], "problemas": r["problemas"]} for r in rechazados],
        "dry_run": bool(args.dry_run), "datos": str(d),
    }, ensure_ascii=False, indent=2))
    return 1 if rechazados and args.estricto else 0


# --------------------------------------------------------------------------- estado

def estado(args) -> int:
    d = dir_datos(args.datos)
    hoy = date.fromisoformat(args.hoy) if args.hoy else date.today()
    banco = [i for i in leer_jsonl(d / "banco.jsonl")
             if not args.materia or i.get("materia", "").lower() == args.materia.lower()]
    prog = leer_progreso(d)

    por_materia, cajas, vencidos, riesgo, reverificar = {}, {c: 0 for c in range(1, CAJA_MAX + 1)}, [], [], []
    for item in banco:
        m = item.get("materia", "(sin materia)")
        por_materia[m] = por_materia.get(m, 0) + 1
        if not vigente(item, args.vigencia_meses, hoy):
            reverificar.append({"id": item.get("id"), "fuente": item.get("fuente"),
                                "verificado_el": item.get("verificado_el")})
            continue
        p = prog.get(item.get("id", ""))
        est, caja, atraso = estado_item(item, p, hoy)
        if p:
            cajas[caja] = cajas.get(caja, 0) + 1
            if p.get("riesgo") in ("1", "si", "sí"):
                riesgo.append({"id": item.get("id"), "fuente": item.get("fuente")})
        if est in ("vencido", "nuevo"):
            vencidos.append(item.get("id"))

    dias, aciertos, total = set(), 0, 0
    with (d / "historial.csv").open(encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            try:
                f_fecha = date.fromisoformat(fila["fecha"])
            except (ValueError, KeyError):
                continue
            dias.add(f_fecha)
            if (hoy - f_fecha).days <= 30:
                total += 1
                aciertos += fila.get("resultado") == "bien"

    racha = 0
    cursor = hoy
    while cursor in dias:
        racha += 1
        cursor -= timedelta(days=1)

    print(json.dumps({
        "fecha": hoy.isoformat(), "datos": str(d),
        "banco": len(banco), "por_materia": por_materia, "cajas": cajas,
        "para_hoy": len(vencidos), "racha_dias": racha,
        "aciertos_30_dias": f"{aciertos}/{total}" if total else "sin datos",
        "errores_con_alta_confianza": riesgo,
        "por_reverificar": reverificar,
        "pendientes_sin_verificar": len(leer_jsonl(d / "pendientes.jsonl")),
    }, ensure_ascii=False, indent=2))
    return 0


# --------------------------------------------------------------------------- cli

def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Motor del micro examen de derecho")
    p.add_argument("--datos", help="carpeta de datos (por defecto ~/.micro-examen)")
    p.add_argument("--hoy", help="fecha AAAA-MM-DD (para pruebas)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("seleccionar", help="elige los ítems de hoy")
    s.add_argument("--n", type=int, help="cantidad de ítems")
    s.add_argument("--modo", default="estandar", choices=["estandar", "relampago", "errores", "nuevos"])
    s.add_argument("--materia")
    s.add_argument("--vigencia-meses", type=int, default=MESES_VIGENCIA_DEFECTO)
    s.add_argument("--formato", default="json", choices=["json", "texto"])
    s.add_argument("--semilla", type=int)
    s.set_defaults(func=seleccionar)

    r = sub.add_parser("registrar", help="registra resultados: id=bien|parcial|mal[:alta|:baja]")
    r.add_argument("resultados", nargs="+")
    r.set_defaults(func=registrar)

    a = sub.add_parser("agregar", help="agrega ítems desde un .jsonl, validando fuente")
    a.add_argument("--archivo", required=True)
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("--estricto", action="store_true", help="salir con error si algo fue rechazado")
    a.set_defaults(func=agregar)

    e = sub.add_parser("estado", help="resumen del banco y del progreso")
    e.add_argument("--materia")
    e.add_argument("--vigencia-meses", type=int, default=MESES_VIGENCIA_DEFECTO)
    e.set_defaults(func=estado)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
