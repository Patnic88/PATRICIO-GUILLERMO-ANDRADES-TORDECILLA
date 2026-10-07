"""Línea de comandos: python -m jurisbot <comando> ..."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date
from pathlib import Path

from . import db, suscripciones as sus
from .clasificar import clasificar, extraer_normas
from .fuentes import Recolector, cargar_config
from .importar import desde_carpeta, desde_manifiesto
from .modelo import FUENTES, TIPOS


def _clasificar_reglas(doc):
    doc.materias = clasificar(doc.titulo + "\n" + doc.texto)
    doc.normas_citadas = extraer_normas(doc.texto)
    doc.clasificado_por = "reglas"
    return doc


def cmd_fuentes(a):
    for c in cargar_config(a.config).values():
        estado = "verificada" if c.verificado else "SIN VERIFICAR"
        print(f"{c.clave:4} {c.nombre:48} {c.estrategia:15} {estado}")
        if c.nota:
            print(f"     {c.nota}")


def cmd_recolectar(a):
    con = db.conectar(a.db)
    config = cargar_config(a.config)[a.fuente]
    anios = a.anio or [date.today().year]
    existe = lambda ident: con.execute(
        "SELECT 1 FROM documentos WHERE fuente = ? AND identificador = ?", (a.fuente, ident)).fetchone()
    rec = Recolector(config, contacto=a.contacto)
    cuenta = {"nuevo": 0, "actualizado": 0, "sin_cambios": 0}
    for doc in rec.recolectar(anios, forzar=a.forzar, limite=a.limite,
                              omitir=(lambda i: False) if a.todo else existe):
        cuenta[db.guardar(con, _clasificar_reglas(doc))] += 1
        print(f"  {doc.clave}  {', '.join(doc.materias) or '(sin materia)'}")
    print(json.dumps(cuenta, ensure_ascii=False))


def cmd_importar(a):
    con = db.conectar(a.db)
    carpeta = Path(a.carpeta)
    if a.manifiesto:
        docs = desde_manifiesto(carpeta, Path(a.manifiesto))
    else:
        if not (a.fuente and a.tipo):
            sys.exit("Sin manifiesto debe indicar --fuente y --tipo")
        docs = desde_carpeta(carpeta, a.fuente, a.tipo)
    cuenta = {"nuevo": 0, "actualizado": 0, "sin_cambios": 0}
    for doc in docs:
        cuenta[db.guardar(con, _clasificar_reglas(doc))] += 1
        print(f"  {doc.clave}  {', '.join(doc.materias) or '(sin materia)'}")
    print(json.dumps(cuenta, ensure_ascii=False))


def cmd_clasificar_ia(a):
    from .proveedores_ia import ConfigIA, clasificar as clasificar_ia
    config = ConfigIA.desde_entorno(a.proveedor)
    if a.modelo:
        config.modelo = a.modelo
    con = db.conectar(a.db)
    sql = "SELECT clave, titulo, texto FROM documentos"
    if not a.todos:
        sql += " WHERE clasificado_por IS NULL OR clasificado_por = 'reglas'"
    filas = con.execute(sql + " LIMIT ?", (a.limite,)).fetchall()
    print(f"Proveedor: {config.etiqueta}")
    for f in filas:
        try:
            r, descartes = clasificar_ia(f["texto"], f["titulo"], config)
        except Exception as e:  # se informa y se sigue con el siguiente
            print(f"  ERROR {f['clave']}: {e}")
            continue
        db.actualizar_clasificacion(con, f["clave"], r.materias, r.normas_citadas,
                                    r.resumen, config.etiqueta)
        extra = f" ({len(descartes)} descartes)" if descartes else ""
        print(f"  {f['clave']}  {', '.join(r.materias)}{extra}")


def cmd_buscar(a):
    con = db.conectar(a.db)
    for d in db.buscar(con, texto=a.texto, fuentes=a.fuente, materias=a.materia,
                       desde=a.desde, hasta=a.hasta, limite=a.limite):
        print(f"{d['fecha'] or 's/f':10}  {d['clave']:40}  {', '.join(d['materias'])}")
        if d["titulo"]:
            print(f"            {d['titulo'][:110]}")


def cmd_verificar(a):
    con = db.conectar(a.db)
    estado = "rechazado" if a.rechazar else "verificado_fuente_oficial"
    db.marcar_verificacion(con, a.clave, estado)
    print(f"{a.clave}: {estado}")


def cmd_usuario(a):
    con = db.conectar(a.db)
    if a.accion == "crear":
        print("Clave API:", sus.crear_usuario(con, a.email, a.plan))
    else:
        sus.activar_plan(con, a.email, a.plan, a.hasta)
        print(f"{a.email}: plan {a.plan} vigente hasta {a.hasta}")


def cmd_alerta(a):
    con = db.conectar(a.db)
    u = sus.usuario_por_clave(con, a.clave_api)
    if not u:
        sys.exit("Clave API desconocida")
    print("Alerta", sus.crear_alerta(con, u, a.nombre, a.fuente or [], a.materia or [], a.consulta))


def cmd_boletin(a):
    con = db.conectar(a.db)
    u = sus.usuario_por_clave(con, a.clave_api)
    if not u:
        sys.exit("Clave API desconocida")
    if a.enviar:
        from .correo import config_smtp, enviar
        config = config_smtp()
        momento = db.ahora()
        cuerpo = sus.boletin_texto(sus.boletin(con, u, marcar_enviado=False))
        enviar(u["email"], "JurisBot: novedades de sus alertas", cuerpo, config)
        # Solo tras un envío exitoso se marcan las alertas: si falla, el próximo intento repite.
        sus.marcar_enviadas(con, u, momento)
        print(f"Boletín enviado a {u['email']}")
    else:
        print(sus.boletin_texto(sus.boletin(con, u, marcar_enviado=not a.prueba)))


def cmd_estadisticas(a):
    print(json.dumps(db.estadisticas(db.conectar(a.db)), ensure_ascii=False, indent=2))


def cmd_servir(a):
    from .servidor import servir
    servir(a.db, a.puerto, a.host)


def main(argv=None):
    p = argparse.ArgumentParser(prog="jurisbot", description="Recolector y clasificador de "
                                "jurisprudencia y doctrina administrativa chilena")
    p.add_argument("--db", default="jurisbot.db", help="archivo SQLite (por defecto jurisbot.db)")
    p.add_argument("-v", "--verbose", action="store_true")
    s = p.add_subparsers(dest="comando", required=True)

    x = s.add_parser("fuentes", help="lista las fuentes y su estado de verificación")
    x.add_argument("--config", default=None)
    x.set_defaults(f=cmd_fuentes)

    x = s.add_parser("recolectar", help="descarga documentos nuevos de una fuente")
    x.add_argument("fuente", choices=list(FUENTES))
    x.add_argument("--anio", type=int, action="append")
    x.add_argument("--limite", type=int)
    x.add_argument("--todo", action="store_true", help="vuelve a bajar también los ya guardados")
    x.add_argument("--forzar", action="store_true", help="usa una configuración no verificada")
    x.add_argument("--contacto", required=True, help="correo que se envía en el User-Agent")
    x.add_argument("--config", default=None)
    x.set_defaults(f=cmd_recolectar)

    x = s.add_parser("importar", help="importa PDF/HTML/TXT descargados a mano")
    x.add_argument("carpeta")
    x.add_argument("--manifiesto")
    x.add_argument("--fuente", choices=list(FUENTES))
    x.add_argument("--tipo", choices=sorted({t for ts in TIPOS.values() for t in ts}))
    x.set_defaults(f=cmd_importar)

    x = s.add_parser("clasificar-ia", help="clasifica y resume con IA (por defecto, modelo local gratuito)")
    x.add_argument("--proveedor", choices=["ollama", "compatible_openai", "anthropic"],
                   help="por defecto la variable JURISBOT_IA, o ollama")
    x.add_argument("--modelo", help="por defecto la variable JURISBOT_IA_MODELO")
    x.add_argument("--limite", type=int, default=20)
    x.add_argument("--todos", action="store_true", help="incluye los ya clasificados por IA")
    x.set_defaults(f=cmd_clasificar_ia)

    x = s.add_parser("buscar", help="búsqueda de texto completo")
    x.add_argument("texto", nargs="?", default="")
    x.add_argument("--fuente", action="append", choices=list(FUENTES))
    x.add_argument("--materia", action="append")
    x.add_argument("--desde", default="")
    x.add_argument("--hasta", default="")
    x.add_argument("--limite", type=int, default=20)
    x.set_defaults(f=cmd_buscar)

    x = s.add_parser("verificar", help="marca un documento como cotejado con la fuente oficial")
    x.add_argument("clave")
    x.add_argument("--rechazar", action="store_true")
    x.set_defaults(f=cmd_verificar)

    x = s.add_parser("usuario", help="crea usuarios o activa planes pagados")
    x.add_argument("accion", choices=["crear", "activar"])
    x.add_argument("email")
    x.add_argument("--plan", default="gratis", choices=list(sus.PLANES))
    x.add_argument("--hasta", help="AAAA-MM-DD (para activar)")
    x.set_defaults(f=cmd_usuario)

    x = s.add_parser("alerta", help="crea una alerta para un suscriptor")
    x.add_argument("clave_api")
    x.add_argument("nombre")
    x.add_argument("--fuente", action="append", choices=list(FUENTES))
    x.add_argument("--materia", action="append")
    x.add_argument("--consulta", default="")
    x.set_defaults(f=cmd_alerta)

    x = s.add_parser("boletin", help="genera el boletín de alertas de un suscriptor")
    x.add_argument("clave_api")
    x.add_argument("--prueba", action="store_true", help="no marca las alertas como enviadas")
    x.add_argument("--enviar", action="store_true", help="envía el boletín por correo (SMTP)")
    x.set_defaults(f=cmd_boletin)

    x = s.add_parser("estadisticas")
    x.set_defaults(f=cmd_estadisticas)

    x = s.add_parser("servir", help="levanta la interfaz web y la API")
    x.add_argument("--puerto", type=int, default=8000)
    x.add_argument("--host", default="127.0.0.1")
    x.set_defaults(f=cmd_servir)

    a = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO if a.verbose else logging.WARNING)
    if getattr(a, "config", "x") is None:
        from .fuentes.base import CONFIG_POR_DEFECTO
        a.config = CONFIG_POR_DEFECTO
    if a.comando == "usuario" and a.accion == "activar" and not a.hasta:
        p.error("activar requiere --hasta AAAA-MM-DD")
    try:
        a.f(a)
    except (NotImplementedError, PermissionError, ValueError, LookupError,
            OSError, sus.LimiteExcedido) as e:  # OSError incluye fallas de red y SMTP
        sys.exit(f"Error: {e}")


if __name__ == "__main__":
    main()
