"""Interfaz de línea de comandos. Uso: python -m contasii --db empresa.db <comando> ...

Ejecute `python -m contasii -h` para la lista de comandos.
"""

import argparse
import sys
from calendar import monthrange

from . import controles, honorarios, impuestos, obligaciones, rcv, reportes
from .libro import REGIMENES, Asiento, ErrorContable, Libro, Linea
from .parametros import ParametroFaltante, Parametros


def _rango(periodo=None, desde=None, hasta=None):
    if periodo:
        y, m = map(int, periodo.split("-"))
        return f"{periodo}-01", f"{periodo}-{monthrange(y, m)[1]:02d}"
    return desde or "0000-00-00", hasta or "9999-12-31"


def _params(periodo=None, anio=None):
    return Parametros(int(anio or periodo[:4]))


def _alertas(lista, titulo="ALERTAS"):
    if lista:
        print(f"\n{titulo}:")
        for a in lista:
            print(f"  • {a}")


def cmd_init(lib, a):
    lib.inicializar(a.rut, a.razon, a.tipo, a.regimen, a.giro or "")
    print(f"Base creada para {a.razon} ({a.rut}), régimen {a.regimen}: {REGIMENES[a.regimen]}")


def cmd_cuentas(lib, a):
    for c in lib.cuentas():
        print(f"{c['codigo']:<10} {'  ' if c['imputable'] else ''}{c['nombre']:<50} {c['tipo']}")


def cmd_asiento(lib, a):
    asi = Asiento(a.fecha, a.glosa, tipo=a.tipo)
    for txt in a.linea:
        partes = txt.split(":")
        if len(partes) < 3:
            raise ErrorContable(f"Línea {txt!r}: use cuenta:debe:haber[:rut]")
        asi.lineas.append(Linea(partes[0], debe=int(partes[1] or 0), haber=int(partes[2] or 0),
                                rut_aux=partes[3] if len(partes) > 3 else ""))
    print(f"Asiento N°{lib.registrar(asi)} registrado.")


def cmd_anular(lib, a):
    print(f"Asiento N°{a.numero} anulado con el contra-asiento N°{lib.anular(a.numero, a.fecha, a.motivo)}.")


def cmd_importar_rcv(lib, a):
    r = rcv.importar(lib, a.archivo, a.libro, a.periodo, a.modo)
    print(f"RCV {a.libro}s {a.periodo}: {r.importados} documentos importados, {r.duplicados} duplicados omitidos, "
          f"{len(r.asientos)} asientos generados.")
    _alertas(r.alertas)


def cmd_importar_honorarios(lib, a):
    r = honorarios.importar(lib, a.archivo, a.sentido, a.periodo, _params(a.periodo))
    print(f"Honorarios {a.sentido}s {a.periodo}: {r['importados']} boletas, {r['duplicados']} duplicadas, "
          f"{r['anuladas']} anuladas omitidas.")
    _alertas(r["alertas"])


def cmd_diario(lib, a):
    print(reportes.texto_diario(lib, *_rango(a.periodo, a.desde, a.hasta)))


def cmd_mayor(lib, a):
    print(reportes.texto_mayor(lib, a.cuenta, *_rango(a.periodo, a.desde, a.hasta)))


def cmd_balance(lib, a):
    print(reportes.texto_balance(lib, *_rango(a.periodo, a.desde, a.hasta)))


def cmd_resultados(lib, a):
    desde, hasta = _rango(a.periodo, a.desde, a.hasta)
    det, ing, gas, res = lib.estado_resultados(desde, hasta)
    print(reportes.encabezado(lib, f"ESTADO DE RESULTADOS {desde} a {hasta}"))
    for cod, nom, tipo, v in det:
        print(f"{cod:<10} {nom:<50} {reportes.pesos(v):>15}")
    print(f"\n{'Ingresos':<61}{reportes.pesos(ing):>15}\n{'Gastos y costos':<61}{reportes.pesos(gas):>15}"
          f"\n{'RESULTADO':<61}{reportes.pesos(res):>15}")


def cmd_f29(lib, a):
    params = _params(a.periodo)
    p = impuestos.propuesta_f29(lib, params, a.periodo, impuesto_unico_mes=a.impuesto_unico, tasa_ppm=a.tasa_ppm,
                                factor_uso_comun=a.factor_uso_comun, remanente_anterior=a.remanente_anterior)
    venc, notas = impuestos.vencimiento_f29(params, a.periodo, electronico=not a.papel)
    p.alertas += notas
    p.verificar = params.advertencias()
    print(reportes.texto_f29(lib, p, impuestos.codigos_f29(params), venc.isoformat()))
    if a.guardar_remanente:
        impuestos.guardar_remanente(lib, a.periodo, p.remanente_siguiente)
        print(f"\nRemanente {reportes.pesos(p.remanente_siguiente)} guardado para el período {a.periodo}.")
    if a.contabilizar:
        print(f"Asiento de centralización N°{impuestos.contabilizar_f29(lib, p)} registrado.")


def cmd_iusc(lib, a):
    params = _params(a.periodo)
    utm = params.utm(a.periodo)
    imp = impuestos.impuesto_unico(a.renta, utm, params.tabla_iusc())
    print(f"Renta tributable {reportes.pesos(a.renta)} — UTM {a.periodo} {reportes.pesos(utm)} — "
          f"Impuesto único {reportes.pesos(imp)}")
    _alertas(params.advertencias(), "[VERIFICAR]")


def cmd_vencimiento(lib, a):
    params = _params(a.periodo)
    f, notas = impuestos.vencimiento_f29(params, a.periodo, electronico=not a.papel)
    print(f"F29 del período {a.periodo}: vence el {f.isoformat()}")
    _alertas(notas)
    _alertas(params.advertencias(), "[VERIFICAR]")


def cmd_cerrar(lib, a):
    lib.cerrar_periodo(a.periodo)
    print(f"Período {a.periodo} cerrado. Ya no admite asientos; las correcciones van en el período abierto.")


def cmd_verificar(lib, a):
    p = lib.verificar_integridad()
    print("Integridad OK: numeración correlativa, asientos cuadrados y cadena de hashes intacta." if not p
          else "PROBLEMAS DE INTEGRIDAD:\n" + "\n".join(f"  • {x}" for x in p))
    return 0 if not p else 1


def cmd_controles(lib, a):
    print(reportes.encabezado(lib, f"CONTROLES DEL PERÍODO {a.periodo}"))
    for nombre, ok, detalle in controles.controles(lib, a.periodo):
        print(f"  • {nombre}: {'OK' if ok else 'REVISAR'} ({detalle})")
    print(f"  • Período {'CERRADO' if lib.periodo_cerrado(a.periodo) else 'abierto'}")


def cmd_exportar(lib, a):
    desde, hasta = _rango(a.periodo, a.desde, a.hasta)
    if a.csv:
        for r in reportes.exportar_csv(lib, a.csv, desde, hasta):
            print(f"Generado {r}")
    if a.excel:
        prop = codigos = None
        if a.periodo:
            params = _params(a.periodo)
            prop = impuestos.propuesta_f29(lib, params, a.periodo)
            codigos = {k: v.split(" ")[0] for k, v in impuestos.codigos_f29(params).items() if not k.startswith("_")}
        print(f"Generado {reportes.exportar_excel(lib, a.excel, desde, hasta, prop, codigos)}")


def cmd_obligaciones(lib, a):
    c = lib.contribuyente()
    print(reportes.encabezado(lib, "OBLIGACIONES DE REGISTRO Y DECLARACIÓN"))
    for ob, norma, estado in obligaciones.listar(c["regimen"]):
        marca = "" if estado == "VERIFICADO" else f" [{estado}]"
        print(f"  • {ob}\n      Norma: {norma}{marca}")
    print("\nLo marcado FUENTE_OFICIAL_INDIRECTA o PENDIENTE requiere lectura de la norma antes de usarse "
          "en un informe o ante el SII.")


def parser():
    ap = argparse.ArgumentParser(prog="contasii", description="Contabilidad automatizada para contribuyentes chilenos")
    ap.add_argument("--db", required=True, help="archivo SQLite del contribuyente (uno por RUT)")
    sp = ap.add_subparsers(dest="cmd", required=True)

    def rango(p):
        p.add_argument("--periodo", help="AAAA-MM")
        p.add_argument("--desde")
        p.add_argument("--hasta")

    p = sp.add_parser("init", help="crear la base del contribuyente")
    p.add_argument("--rut", required=True)
    p.add_argument("--razon", required=True)
    p.add_argument("--tipo", choices=["empresa", "persona_natural"], required=True)
    p.add_argument("--regimen", choices=list(REGIMENES), required=True)
    p.add_argument("--giro")
    p.set_defaults(f=cmd_init)

    sp.add_parser("cuentas", help="listar plan de cuentas").set_defaults(f=cmd_cuentas)

    p = sp.add_parser("asiento", help="registrar asiento manual")
    p.add_argument("--fecha", required=True)
    p.add_argument("--glosa", required=True)
    p.add_argument("--tipo", default="traspaso",
                   choices=["apertura", "ingreso", "egreso", "traspaso", "ajuste", "cierre"])
    p.add_argument("--linea", action="append", required=True, help="cuenta:debe:haber[:rut] (repetible)")
    p.set_defaults(f=cmd_asiento)

    p = sp.add_parser("anular", help="anular asiento con contra-asiento")
    p.add_argument("numero", type=int)
    p.add_argument("--fecha", required=True)
    p.add_argument("--motivo", required=True)
    p.set_defaults(f=cmd_anular)

    p = sp.add_parser("importar-rcv", help="importar detalle CSV del Registro de Compras y Ventas")
    p.add_argument("archivo")
    p.add_argument("--libro", choices=["compra", "venta"], required=True)
    p.add_argument("--periodo", required=True)
    p.add_argument("--modo", choices=["documento", "centralizado"], default="documento")
    p.set_defaults(f=cmd_importar_rcv)

    p = sp.add_parser("importar-honorarios", help="importar boletas de honorarios (CSV)")
    p.add_argument("archivo")
    p.add_argument("--sentido", choices=["recibido", "emitido"], required=True)
    p.add_argument("--periodo", required=True)
    p.set_defaults(f=cmd_importar_honorarios)

    for nombre, f, ayuda in (("diario", cmd_diario, "libro diario"), ("balance", cmd_balance, "balance de 8 columnas"),
                             ("resultados", cmd_resultados, "estado de resultados")):
        p = sp.add_parser(nombre, help=ayuda)
        rango(p)
        p.set_defaults(f=f)
    p = sp.add_parser("mayor", help="libro mayor de una cuenta")
    p.add_argument("cuenta")
    rango(p)
    p.set_defaults(f=cmd_mayor)

    p = sp.add_parser("f29", help="propuesta de trabajo del F29")
    p.add_argument("periodo")
    p.add_argument("--impuesto-unico", type=int, default=0)
    p.add_argument("--tasa-ppm", type=float, help="ej. 0.00125 = 0,125%%")
    p.add_argument("--factor-uso-comun", type=float, help="proporción de crédito de uso común (0 a 1)")
    p.add_argument("--remanente-anterior", type=int)
    p.add_argument("--papel", action="store_true", help="contribuyente sin plazo extendido (día 12)")
    p.add_argument("--guardar-remanente", action="store_true")
    p.add_argument("--contabilizar", action="store_true", help="registrar asiento de centralización de IVA/PPM")
    p.set_defaults(f=cmd_f29)

    p = sp.add_parser("iusc", help="impuesto único de segunda categoría de una renta")
    p.add_argument("renta", type=int)
    p.add_argument("--periodo", required=True)
    p.set_defaults(f=cmd_iusc)

    p = sp.add_parser("vencimiento", help="vencimiento del F29 de un período")
    p.add_argument("periodo")
    p.add_argument("--papel", action="store_true")
    p.set_defaults(f=cmd_vencimiento)

    p = sp.add_parser("cerrar", help="cerrar un período")
    p.add_argument("periodo")
    p.set_defaults(f=cmd_cerrar)

    sp.add_parser("verificar", help="verificar integridad del libro").set_defaults(f=cmd_verificar)

    p = sp.add_parser("controles", help="cuadraturas del período")
    p.add_argument("periodo")
    p.set_defaults(f=cmd_controles)

    p = sp.add_parser("exportar", help="exportar libros a Excel y/o CSV")
    rango(p)
    p.add_argument("--excel")
    p.add_argument("--csv", help="carpeta de salida")
    p.set_defaults(f=cmd_exportar)

    sp.add_parser("obligaciones", help="obligaciones según régimen").set_defaults(f=cmd_obligaciones)
    return ap


def main(argv=None):
    a = parser().parse_args(argv)
    lib = Libro(a.db)
    if a.cmd != "init" and not lib.contribuyente():
        print("La base no está inicializada: use el comando init.", file=sys.stderr)
        return 2
    try:
        return a.f(lib, a) or 0
    except (ErrorContable, ParametroFaltante, ValueError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
