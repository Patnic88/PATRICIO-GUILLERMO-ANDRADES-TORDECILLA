"""Interfaz gráfica local: un pequeño servidor que abre la contabilidad en el navegador.

Uso:  python -m contasii.web            (o doble clic en "Abrir contabilidad")

- Escucha solo en 127.0.0.1: nadie fuera del computador puede conectarse.
- Las empresas se guardan en la carpeta `mis_empresas/` (un archivo .db por RUT),
  junto a la UTM que el usuario ingresa (parametros_locales.json).
- No usa librerías externas (openpyxl solo para exportar a Excel). Solo se conecta a
  internet para las consultas al SII que la persona pide (conexión, certificado, estado de
  documentos y el ingreso al portal para traer el Registro de Compras y Ventas).
"""

import atexit
import base64
import collections
import csv
import io
import json
import os
import re
import sqlite3
import sys
import tempfile
import threading
import traceback
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import (controles, documentos, honorarios, impuestos, navegador, obligaciones, operaciones, rcv, reportes, sii_dte,
               sii_portal, sii_ws, tablas)
from . import rut as rutmod
from .libro import REGIMENES, Asiento, ErrorContable, Libro, Linea
from .parametros import ParametroFaltante, Parametros, guardar_utm_local

AQUI = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(AQUI, "web", "index.html")
NOMBRE_DB = re.compile(r"^[0-9]{1,8}-[0-9K]\.db$")
# En la papelera: <rut>__<AAAAMMDD-HHMMSS>[-N].db (fecha y hora en que se eliminó; N si se repite)
PAPELERA = "Papelera"
NOMBRE_PAPELERA = re.compile(r"^([0-9]{1,8}-[0-9K])__(\d{8}-\d{6})(?:-\d{1,3})?\.db$")
PERIODO = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")

REGIMEN_SIMPLE = {
    "14D8": "Pro Pyme Transparente (14 D N°8): la mayoría de las pymes pequeñas",
    "14D3": "Pro Pyme General (14 D N°3)",
    "14A": "Régimen General (14 A): empresas grandes",
    "PN_HONORARIOS": "Persona que emite boletas de honorarios",
}


class ErrorUsuario(Exception):
    """Error que se muestra tal cual al usuario."""


# ------------------------------------------------------------------ archivos del SII
def detectar_archivo(texto: str):
    """Reconoce qué archivo del SII es y resume su contenido, sin importarlo."""
    primera = texto.lstrip("﻿").splitlines()[0] if texto.strip() else ""
    enc = {rcv._norm(h) for h in re.split(r"[;,\t]", primera)}
    if "rutproveedor" in enc:
        tipo = "compra"
    elif "rutcliente" in enc:
        tipo = "venta"
    elif enc & {"brutos", "bruto", "montobruto", "honorariobruto"} and \
            enc & {"retenido", "retencion", "montoretenido", "retemisor", "retreceptor"}:
        emitidas = {"rutreceptor", "retemisor", "retreceptor", "liquidos"}
        tipo = "honorario_emitido" if enc & emitidas else "honorario_recibido"
    else:
        raise ErrorUsuario(
            "No reconozco este archivo. Debe ser el detalle de compras o de ventas del Registro de Compras y "
            "Ventas (RCV), o el informe de boletas de honorarios del SII: un CSV, un Excel (.xlsx), la planilla "
            "que descarga el SII (.xls) o la tabla copiada desde la página, con los títulos de las columnas.")
    if tipo in ("compra", "venta"):
        mapa, filas = rcv.leer_csv(texto)
        fechas = [rcv._fecha_iso(f.get(mapa["fecha"], "")) for f in filas if f.get(mapa["fecha"])]
        total = sum(rcv._entero(f.get(mapa["total"])) * (-1 if rcv._entero(f.get(mapa["tipo_dte"])) in rcv.NOTAS_CREDITO else 1)
                    for f in filas)
    else:
        mapa, filas = honorarios.leer(texto)
        g = lambda f, c: (f.get(mapa[c]) or "").strip() if c in mapa else ""
        sin_folio = [f for f in filas if not honorarios.folio_limpio(g(f, "folio"))]
        omitidas = sum(1 for f in sin_folio if honorarios.parece_boleta(g(f, "rut"), g(f, "bruto"), g(f, "folio")))
        filas = [f for f in filas if honorarios.folio_limpio(g(f, "folio")) and not honorarios.anulada(g(f, "estado"))]
        fechas = [rcv._fecha_iso(f.get(mapa["fecha"], "")) for f in filas if f.get(mapa["fecha"])]
        total = sum(rcv._entero(f.get(mapa["bruto"])) for f in filas)
    meses = collections.Counter(f[:7] for f in fechas)
    out = {"tipo": tipo, "documentos": len(filas), "total": total,
           "mes_sugerido": meses.most_common(1)[0][0] if meses else None}
    if tipo not in ("compra", "venta") and omitidas:
        out["omitidas"] = omitidas
    return out


def leer_contenido(b) -> str:
    """Contenido de un archivo subido (CSV, Excel, página HTML o tabla pegada) como texto CSV."""
    try:
        crudo = base64.b64decode(b.get("contenido") or "", validate=False)
    except ValueError:
        raise ErrorUsuario("No se pudo leer el archivo.")
    if not crudo.strip():
        raise ErrorUsuario("El archivo está vacío.")
    return tablas.a_csv(b.get("nombre") or "", crudo)


TIPOS_ARCHIVO = ("compra", "venta", "honorario_recibido", "honorario_emitido")
ENCABEZADO_BOLETA = "N° Boleta;Fecha;Estado;Rut;Nombre o Razón Social;Brutos;Retenido;Pagado"


def decodificar(b64: str) -> str:
    crudo = base64.b64decode(b64)
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return crudo.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ErrorUsuario("No se pudo leer el archivo.")


# ------------------------------------------------------------------ aplicación
class App:
    def __init__(self, carpeta: str, portal=None):
        self.carpeta = os.path.abspath(carpeta)
        os.makedirs(self.carpeta, exist_ok=True)
        self.local = os.path.join(self.carpeta, "parametros_locales.json")
        self.lock = threading.Lock()
        self._portal = portal
        self._lock_portal = threading.Lock()
        self.ventana = None  # navegador.VentanaPrograma, si el programa abrió su ventana

    @property
    def portal(self):
        """Conexión con el portal del SII (una ventana del navegador), creada al usarla por primera vez."""
        with self._lock_portal:
            if self._portal is None:
                self._portal = sii_portal.PortalSII()
            return self._portal

    def params(self, periodo):
        return Parametros(int(periodo[:4]), local=self.local)

    def libro(self, archivo) -> Libro:
        if not NOMBRE_DB.match(archivo or ""):
            raise ErrorUsuario("Empresa no válida.")
        ruta = os.path.join(self.carpeta, archivo)
        if not os.path.exists(ruta):
            raise ErrorUsuario("No encuentro esa empresa.")
        return Libro(ruta)

    def ping(self, q, b):
        return {"app": "contasii"}

    def info_carpeta(self, q, b):
        return {"carpeta": self.carpeta}

    def mostrar_ventana(self, q, b):
        """Doble clic con el programa ya abierto: muestra su ventana delante de las demás."""
        return {"mostrada": bool(self.ventana and self.ventana.traer_al_frente())}

    # ---- empresas
    def empresas(self, q, b):
        out = []
        for nombre in sorted(os.listdir(self.carpeta)):
            if NOMBRE_DB.match(nombre):
                lib = Libro(os.path.join(self.carpeta, nombre))
                c = lib.contribuyente()
                if c:
                    out.append({"archivo": nombre, "rut": rutmod.formatear(c["rut"]), "nombre": c["razon_social"],
                                "regimen": c["regimen"], "regimen_texto": REGIMEN_SIMPLE.get(c["regimen"], ""),
                                "tipo": c["tipo"]})
                lib.con.close()
        return {"empresas": out, "regimenes": REGIMEN_SIMPLE}

    def crear_empresa(self, q, b):
        rut = (b.get("rut") or "").strip()
        if not rutmod.es_valido(rut):
            raise ErrorUsuario("El RUT no es válido. Revise el número y el dígito verificador.")
        nombre = (b.get("nombre") or "").strip()
        if not nombre:
            raise ErrorUsuario("Escriba el nombre o razón social.")
        if b.get("regimen") not in REGIMENES:
            raise ErrorUsuario("Elija el régimen tributario.")
        tipo = "persona_natural" if b.get("tipo") == "persona_natural" else "empresa"
        archivo = rutmod.normalizar(rut) + ".db"
        ruta = os.path.join(self.carpeta, archivo)
        if os.path.exists(ruta):
            raise ErrorUsuario("Ya existe una contabilidad para ese RUT.")
        lib = Libro(ruta)
        lib.inicializar(rut, nombre, tipo, b["regimen"], (b.get("giro") or "").strip())
        lib.con.close()
        return {"archivo": archivo}

    # ---- eliminar empresas (van a la Papelera y se pueden restaurar)
    def _papelera(self):
        return os.path.join(self.carpeta, PAPELERA)

    @staticmethod
    def _mover(origen, destino):
        """Mueve la base y, si existe, su archivo de diario de SQLite. Falla si el destino ya existe."""
        if os.path.exists(destino):
            raise ErrorUsuario("Ya existe un archivo con ese nombre. Inténtelo de nuevo en un momento.")
        try:
            os.replace(origen, destino)
        except PermissionError:
            raise ErrorUsuario("No se pudo mover la contabilidad porque está en uso. Espere a que termine lo que se "
                               "está haciendo (por ejemplo, traer archivos del SII) e inténtelo de nuevo.")
        if os.path.exists(origen + "-journal"):
            os.replace(origen + "-journal", destino + "-journal")

    def eliminar_empresa(self, q, b):
        archivo = b.get("archivo") or ""
        if not NOMBRE_DB.match(archivo):
            raise ErrorUsuario("Empresa no válida.")
        ruta = os.path.join(self.carpeta, archivo)
        if not os.path.exists(ruta):
            raise ErrorUsuario("No encuentro esa empresa.")
        if (b.get("confirmar") or "") != archivo:
            raise ErrorUsuario("Falta confirmar la eliminación.")
        os.makedirs(self._papelera(), exist_ok=True)
        marca = datetime.now().strftime("%Y%m%d-%H%M%S")
        destino = os.path.join(self._papelera(), f"{archivo[:-3]}__{marca}.db")
        n = 1
        while os.path.exists(destino) and n < 999:
            n += 1
            destino = os.path.join(self._papelera(), f"{archivo[:-3]}__{marca}-{n}.db")
        self._mover(ruta, destino)
        return {"ok": True, "papelera": os.path.basename(destino)}

    def papelera(self, q, b):
        out = []
        carpeta = self._papelera()
        if os.path.isdir(carpeta):
            for nombre in sorted(os.listdir(carpeta), reverse=True):
                m = NOMBRE_PAPELERA.match(nombre)
                if not m:
                    continue
                nombre_emp = ""
                try:
                    # Solo lectura y siempre cerrada: abrirla con Libro le agregaría tablas y, si el archivo
                    # está dañado, dejaría la conexión abierta (en Windows, el archivo quedaría bloqueado).
                    con = sqlite3.connect(os.path.join(carpeta, nombre))
                    try:
                        c = con.execute("SELECT razon_social FROM contribuyente WHERE id=1").fetchone()
                    finally:
                        con.close()
                    nombre_emp = c[0] if c else ""
                except Exception:  # noqa: BLE001 - un archivo dañado igual se muestra para poder borrarlo
                    nombre_emp = "(no se pudo leer)"
                d = m.group(2)
                try:
                    rut_txt = rutmod.formatear(m.group(1))
                except Exception:  # noqa: BLE001 - un nombre con dígito verificador raro no debe ocultar los demás
                    rut_txt = m.group(1)
                out.append({"archivo": nombre, "rut": rut_txt, "nombre": nombre_emp,
                            "eliminada": f"{d[6:8]}-{d[4:6]}-{d[:4]} {d[9:11]}:{d[11:13]}",
                            "activa": os.path.exists(os.path.join(self.carpeta, m.group(1) + ".db"))})
        return {"papelera": out, "carpeta": carpeta}

    def _en_papelera(self, b):
        nombre = b.get("archivo") or ""
        m = NOMBRE_PAPELERA.match(nombre)
        ruta = os.path.join(self._papelera(), nombre)
        if not m or not os.path.exists(ruta):
            raise ErrorUsuario("No encuentro esa contabilidad en la papelera.")
        return m, ruta

    def restaurar_empresa(self, q, b):
        m, ruta = self._en_papelera(b)
        destino = os.path.join(self.carpeta, m.group(1) + ".db")
        if os.path.exists(destino):
            raise ErrorUsuario("Ya hay una contabilidad activa con ese RUT. Para restaurar esta, primero elimine la "
                               "activa.")
        self._mover(ruta, destino)
        return {"archivo": m.group(1) + ".db"}

    def borrar_definitivo(self, q, b):
        m, ruta = self._en_papelera(b)
        if rutmod.limpiar(b.get("confirmar") or "") != rutmod.limpiar(m.group(1)):
            raise ErrorUsuario("Para borrar para siempre, escriba el RUT de la empresa tal como aparece.")
        try:
            os.remove(ruta)
        except PermissionError:
            raise ErrorUsuario("No se pudo borrar el archivo porque está en uso. Inténtelo de nuevo en un momento.")
        if os.path.exists(ruta + "-journal"):
            os.remove(ruta + "-journal")
        return {"ok": True}

    # ---- resumen de una empresa
    def resumen(self, lib, q, b):
        c = lib.contribuyente()
        A = lib.cuenta_auto
        periodo = q.get("periodo")
        saldos = {s["codigo"]: s["debe"] - s["haber"] for s in lib.saldos()}
        docs = {}
        if periodo:
            for r in lib.con.execute("SELECT libro, COUNT(*) n, SUM(total) t FROM documento WHERE eliminado IS NULL "
                                     "AND periodo=? "
                                     "GROUP BY libro", (periodo,)):
                docs[r["libro"]] = {"n": r["n"], "total": r["t"]}
        periodos = [r[0] for r in lib.con.execute(
            "SELECT periodo FROM asiento UNION SELECT periodo FROM documento WHERE eliminado IS NULL ORDER BY 1 DESC")]
        utm = None
        if periodo:
            try:
                utm = self.params(periodo).utm(periodo)
            except ParametroFaltante:
                pass
        return {
            "rut": rutmod.formatear(c["rut"]), "nombre": c["razon_social"], "regimen": c["regimen"],
            "regimen_texto": REGIMEN_SIMPLE.get(c["regimen"], ""), "tipo": c["tipo"],
            "banco": saldos.get(A("banco"), 0), "caja": saldos.get(A("caja"), 0),
            "por_cobrar": saldos.get(A("clientes"), 0), "por_pagar": -saldos.get(A("proveedores"), 0),
            "documentos": docs, "periodos": periodos, "cerrado": lib.periodo_cerrado(periodo) if periodo else False,
            "asientos_mes": lib.con.execute("SELECT COUNT(*) FROM asiento WHERE periodo=?", (periodo,)).fetchone()[0]
            if periodo else 0,
            "utm": utm,
            "retencion_honorarios": self.params(periodo).valor_opcional("retencion_honorarios") if periodo else None,
            "f29_registrado": bool(periodo and documentos.f29_registrado(lib, periodo)),
        }

    # ---- importar
    def analizar(self, lib, q, b):
        return detectar_archivo(leer_contenido(b))

    def importar(self, lib, q, b):
        periodo = b.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes al que corresponde el archivo.")
        texto = leer_contenido(b)
        tipo = b.get("tipo") or detectar_archivo(texto)["tipo"]
        if tipo not in TIPOS_ARCHIVO:
            raise ErrorUsuario("Tipo de archivo no reconocido.")
        return self._importar_texto(lib, texto, tipo, periodo, b.get("nombre") or "archivo", b.get("modo") or "documento")

    def boleta_manual(self, lib, q, b):
        """Registra una boleta de honorarios escrita a mano, con las mismas validaciones que un archivo."""
        periodo = b.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes.")
        sentido = b.get("sentido")
        if sentido not in ("recibido", "emitido"):
            raise ErrorUsuario("Indique si la boleta la recibió (usted pagó) o la emitió (usted cobró).")
        folio = honorarios.folio_limpio(str(b.get("folio") or ""))
        if not folio:
            raise ErrorUsuario("Escriba el número de la boleta, solo con dígitos (y distinto de cero).")
        fecha = b.get("fecha") or ""
        if not FECHA.match(fecha):
            raise ErrorUsuario("Indique la fecha de la boleta.")
        try:
            date.fromisoformat(fecha)
        except ValueError:
            raise ErrorUsuario("La fecha de la boleta no es válida.")
        rut = (b.get("rut") or "").strip()
        if not rutmod.es_valido(rut):
            raise ErrorUsuario("El RUT no es válido. Revise el número y el dígito verificador.")
        nombre = " ".join(str(b.get("nombre") or "").split())
        if not nombre:
            raise ErrorUsuario("Escriba el nombre o razón social.")
        def monto(v, defecto):
            return int(str(defecto if v is None or str(v).strip() == "" else v).replace(".", "").strip())
        try:
            bruto, ret = monto(b.get("bruto"), ""), monto(b.get("retenido"), 0)
        except ValueError:
            raise ErrorUsuario("Escriba los montos como números enteros, por ejemplo 500000.")
        if bruto <= 0:
            raise ErrorUsuario("El monto bruto debe ser mayor que cero.")
        if not 0 <= ret <= bruto:
            raise ErrorUsuario("La retención no puede ser negativa ni mayor que el monto bruto.")
        d = date.fromisoformat(fecha)
        salida = io.StringIO()
        w = csv.writer(salida, delimiter=";", lineterminator="\n")
        w.writerow(ENCABEZADO_BOLETA.split(";"))
        w.writerow([folio, d.strftime("%d/%m/%Y"), "VIGENTE", rutmod.normalizar(rut), nombre, bruto, ret, bruto - ret])
        texto = salida.getvalue()
        return self._importar_texto(lib, texto, f"honorario_{sentido}", periodo, "ingreso manual")

    def _importar_texto(self, lib, texto, tipo, periodo, nombre, modo="documento"):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as f:
            f.write(texto)
            tmp = f.name
        try:
            if tipo in ("compra", "venta"):
                r = rcv.importar(lib, tmp, tipo, periodo, modo)
                res = {"importados": r.importados, "duplicados": r.duplicados, "alertas": r.alertas,
                       "documentos": r.documentos if modo == "documento" else []}
            elif tipo in ("honorario_recibido", "honorario_emitido"):
                r = honorarios.importar(lib, tmp, tipo.split("_")[1], periodo, self.params(periodo))
                res = {"importados": r["importados"], "duplicados": r["duplicados"], "alertas": r["alertas"],
                       "anuladas": r["anuladas"], "omitidas": r["omitidas"], "documentos": r["documentos"]}
            else:
                raise ErrorUsuario("Tipo de archivo no reconocido.")
        finally:
            os.unlink(tmp)
        lib.con.execute("UPDATE documento SET fuente=? WHERE fuente=?", (nombre, tmp))
        lib.con.commit()
        return res

    # ---- movimientos
    def catalogo(self, lib, q, b):
        return {
            "operaciones": [{"clave": k, "titulo": v[0], "ayuda": v[1], "pide_rut": v[3]}
                            for k, v in operaciones.OPERACIONES.items()],
            "medios": operaciones.MEDIOS,
            "pago_f29": [{"clave": k, "nombre": n, "pendiente": m}
                         for k, n, m in operaciones.sugerencia_pago_f29(lib)],
            "cuentas": [{"codigo": c["codigo"], "nombre": c["nombre"], "tipo": c["tipo"]}
                        for c in lib.cuentas() if c["imputable"] and c["activa"]],
        }

    def movimiento(self, lib, q, b):
        fecha = b.get("fecha", "")
        if not FECHA.match(fecha):
            raise ErrorUsuario("Indique la fecha.")
        op = b.get("operacion")
        rut = (b.get("rut") or "").strip()
        if rut and not rutmod.es_valido(rut):
            raise ErrorUsuario("El RUT indicado no es válido.")
        if op == "pago_f29":
            n = operaciones.registrar_pago_f29(lib, fecha, b.get("periodo") or fecha[:7], b.get("montos") or {},
                                               b.get("medio", "banco"))
        elif op == "avanzado":
            a = Asiento(fecha, (b.get("glosa") or "").strip() or "Asiento manual", tipo="traspaso", origen="manual")
            for l in b.get("lineas") or []:
                a.lineas.append(Linea(l.get("cuenta", ""), debe=int(l.get("debe") or 0),
                                      haber=int(l.get("haber") or 0)))
            n = lib.registrar(a)
        else:
            n = operaciones.registrar(lib, op, fecha, int(b.get("monto") or 0), b.get("medio", "banco"),
                                      (b.get("detalle") or "").strip(), rut)
        return {"numero": n}

    def anular(self, lib, q, b):
        motivo = b.get("motivo")
        motivo = motivo.strip() if isinstance(motivo, str) else ""
        if not motivo:
            raise ErrorUsuario("Indique el motivo de la anulación.")
        numero = b.get("numero")
        if isinstance(numero, str) and re.fullmatch(r"[0-9]{1,19}", numero.strip()):
            numero = int(numero)
        if isinstance(numero, bool) or not isinstance(numero, int) or not 1 <= numero <= documentos.MAX_ID:
            raise ErrorUsuario("Registro no válido.")
        # Anular solo el asiento de una factura o boleta dejaría el documento contando en el F29.
        no = documentos.motivo_no_anulable(lib, numero)
        if no:
            raise ErrorUsuario(no)
        orig = lib.con.execute("SELECT fecha, periodo FROM asiento WHERE numero=?", (numero,)).fetchone()
        if not orig:
            raise ErrorUsuario("Ese registro no existe.")
        # La anulación corrige un registro equivocado: se fecha igual que él para que su mes quede bien
        # (por ejemplo, el F29 que se anula para corregirlo y se vuelve a confirmar). Si ese mes ya está
        # cerrado, va en la fecha de hoy.
        fecha = orig["fecha"] if not lib.periodo_cerrado(orig["periodo"]) else date.today().isoformat()
        return {"numero": lib.anular(numero, fecha, motivo)}

    # ---- F29
    def _propuesta(self, lib, q):
        periodo = q.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes.")
        params = self.params(periodo)

        def num(k, conv):
            v = q.get(k)
            return conv(v) if v not in (None, "") else None

        p = impuestos.propuesta_f29(lib, params, periodo, impuesto_unico_mes=num("impuesto_unico", int) or 0,
                                    tasa_ppm=num("tasa_ppm", lambda x: float(x) / 100),
                                    factor_uso_comun=num("factor_uso_comun", lambda x: float(x) / 100),
                                    remanente_anterior=num("remanente_anterior", int))
        venc, notas = impuestos.vencimiento_f29(params, periodo, electronico=q.get("papel") != "1")
        p.alertas += notas
        p.verificar = params.advertencias()
        return p, venc, params

    def f29(self, lib, q, b):
        p, venc, params = self._propuesta(lib, q)
        cod = {k: v.split(" ")[0] for k, v in impuestos.codigos_f29(params).items() if not k.startswith("_")}
        ya = documentos.f29_registrado(lib, q["periodo"])
        return {"lineas": [{"clave": c, "texto": d, "monto": m, "codigo": cod.get(c, "")} for c, d, m in p.lineas],
                "total": p.total_a_pagar, "remanente_siguiente": p.remanente_siguiente,
                "vencimiento": venc.isoformat(), "alertas": p.alertas, "verificar": p.verificar,
                "contabilizado": bool(ya)}

    def f29_confirmar(self, lib, q, b):
        if lib.periodo_cerrado(b.get("periodo", "")):
            raise ErrorUsuario("El mes está cerrado.")
        if self.f29(lib, b, {})["contabilizado"]:
            raise ErrorUsuario("El impuesto de este mes ya fue registrado. Si necesita corregirlo, anule ese "
                               "movimiento en «Pagos y cobros» y vuelva a confirmar.")
        p, _, _ = self._propuesta(lib, b)
        impuestos.guardar_remanente(lib, p.periodo, p.remanente_siguiente)
        try:
            n = impuestos.contabilizar_f29(lib, p)
        except ErrorContable:
            n = None
        return {"numero": n}

    # ---- revisión y cierre
    def revision(self, lib, q, b):
        periodo = q.get("periodo", "")
        c = lib.contribuyente()
        return {"controles": [{"nombre": n, "ok": ok, "detalle": d} for n, ok, d in controles.controles(lib, periodo)],
                "cerrado": lib.periodo_cerrado(periodo),
                "obligaciones": [{"texto": t, "norma": n, "estado": e} for t, n, e in obligaciones.listar(c["regimen"])]}

    def cerrar(self, lib, q, b):
        periodo = b.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes.")
        lib.cerrar_periodo(periodo)
        return {"ok": True}

    # ---- libros
    def _rango(self, q):
        periodo = q.get("periodo")
        if periodo and PERIODO.match(periodo):
            y, m = map(int, periodo.split("-"))
            from calendar import monthrange
            return f"{periodo}-01", f"{periodo}-{monthrange(y, m)[1]:02d}"
        if q.get("anio", "").isdigit():
            return f"{q['anio']}-01-01", f"{q['anio']}-12-31"
        return "0000-00-00", "9999-12-31"

    def diario(self, lib, q, b):
        desde, hasta = self._rango(q)
        anulados = {r[0] for r in lib.con.execute("SELECT DISTINCT anula_a FROM asiento WHERE anula_a IS NOT NULL")
                    if lib.anulado_por(r[0])}
        return {"asientos": [{"numero": a["numero"], "fecha": a["fecha"], "glosa": a["glosa"], "origen": a["origen"],
                              "tipo": a["tipo"], "anulado": a["numero"] in anulados,
                              "de_documento": any(l["documento"] for l in ls),
                              "anulable": documentos.motivo_no_anulable(lib, a["numero"]) is None,
                              "lineas": [{"cuenta": l["cuenta"], "nombre": l["nombre"], "debe": l["debe"],
                                          "haber": l["haber"], "rut": l["rut_aux"] or ""} for l in ls]}
                             for a, ls in lib.libro_diario(desde, hasta)]}

    def mayor(self, lib, q, b):
        desde, hasta = self._rango(q)
        ini, filas = lib.libro_mayor(q.get("cuenta", ""), desde, hasta)
        return {"inicial": ini, "movimientos": filas}

    def balance(self, lib, q, b):
        desde, hasta = self._rango(q)
        filas, tot, res = lib.balance_8_columnas(hasta, desde)
        return {"filas": [{"codigo": c, "nombre": n, "v": v} for c, n, v in filas], "totales": tot, "resultado": res}

    def resultados(self, lib, q, b):
        desde, hasta = self._rango(q)
        det, ing, gas, res = lib.estado_resultados(desde, hasta)
        return {"detalle": [{"codigo": c, "nombre": n, "tipo": t, "monto": v} for c, n, t, v in det],
                "ingresos": ing, "gastos": gas, "resultado": res}

    def documentos(self, lib, q, b):
        periodo = q.get("periodo", "")
        campos = ("id", "libro", "tipo_dte", "rut_contraparte", "razon_social", "folio", "fecha", "neto", "exento", "iva",
                  "bruto", "retencion", "total")
        rows = lib.con.execute("SELECT * FROM documento WHERE periodo=? ORDER BY libro, fecha, folio", (periodo,)).fetchall()
        f29 = documentos.f29_registrado(lib, periodo) if PERIODO.match(periodo) else None
        return {"documentos": [{**{k: r[k] for k in campos}, "en_f29": bool(f29) and documentos.entro_en_f29(lib, r, f29)}
                               for r in rows if not r["eliminado"]],
                "eliminados": [{**{k: r[k] for k in campos}, "eliminado": r["eliminado"], "motivo": r["motivo_eliminado"],
                                "asiento": r["asiento_eliminado"]} for r in rows if r["eliminado"]],
                "tipos": rcv.TIPOS_DTE, "cerrado": lib.periodo_cerrado(periodo) if periodo else False,
                "f29_asiento": f29}

    def documentos_eliminar(self, lib, q, b):
        """Borra documentos importados: anula su asiento y los saca del F29 y de los libros."""
        ids = b.get("ids")
        if isinstance(ids, list) and len(ids) > 5000:
            raise ErrorUsuario("Demasiados documentos de una vez.")
        return documentos.eliminar(lib, ids, b.get("motivo", ""))

    def excel(self, lib, q, b):
        desde, hasta = self._rango(q)
        prop = codigos = None
        if q.get("periodo"):
            params = self.params(q["periodo"])
            prop = impuestos.propuesta_f29(lib, params, q["periodo"])
            codigos = {k: v.split(" ")[0] for k, v in impuestos.codigos_f29(params).items() if not k.startswith("_")}
        fd, tmp = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        try:
            reportes.exportar_excel(lib, tmp, desde, hasta, prop, codigos)
        except RuntimeError as e:
            os.unlink(tmp)
            raise ErrorUsuario(str(e))
        with open(tmp, "rb") as f:
            data = f.read()
        os.unlink(tmp)
        return data

    # ---- ajustes
    def utm(self, q, b):
        periodo, valor = b.get("periodo", ""), b.get("valor")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes de la UTM.")
        try:
            valor = int(str(valor).replace(".", "").strip())
        except ValueError:
            raise ErrorUsuario("Escriba la UTM como número, por ejemplo 72151.")
        if not 10000 <= valor <= 1000000:
            raise ErrorUsuario("Ese valor de UTM no parece correcto. Cópielo desde sii.cl > Valores y fechas.")
        guardar_utm_local(self.local, periodo, valor)
        return {"ok": True}

    # ---- conexión con el SII (prueba de certificado)
    @staticmethod
    def _ambiente(b):
        a = b.get("ambiente") or "certificacion"
        if a not in sii_ws.AMBIENTES:
            raise ErrorUsuario("Ambiente del SII no válido.")
        return a

    def sii_semilla(self, q, b):
        return sii_ws.obtener_semilla(self._ambiente(b))

    @staticmethod
    def _pfx(b):
        if not b.get("pfx"):
            raise ErrorUsuario("Elija el archivo de su certificado digital (.pfx o .p12).")
        try:
            return base64.b64decode(b["pfx"])
        except ValueError:
            raise ErrorUsuario("No se pudo leer el archivo del certificado.")

    def sii_certificado(self, q, b):
        _, cert = sii_ws.cargar_pfx(self._pfx(b), b.get("clave") or "")
        return sii_ws.info_certificado(cert)

    def sii_token(self, q, b):
        return sii_ws.probar_certificado(self._pfx(b), b.get("clave") or "", self._ambiente(b))

    def sii_estado(self, lib, q, b):
        periodo = b.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes.")
        libro_doc = b.get("libro") if b.get("libro") in ("compra", "venta") else None
        r = sii_dte.consultar_periodo(lib, periodo, self._pfx(b), b.get("clave") or "",
                                      (b.get("rut_consultante") or "").strip(), self._ambiente(b), libro_doc)
        if not r["resultados"]:
            raise ErrorUsuario("No hay facturas ni notas electrónicas importadas en este mes para consultar.")
        return r

    def sii_estados(self, lib, q, b):
        return {"estados": {str(k): v for k, v in sii_dte.ultimos_estados(lib, q.get("periodo", "")).items()}}

    def integridad(self, lib, q, b):
        return {"problemas": lib.verificar_integridad()}

    # ---- ingreso al portal del SII para traer el Registro de Compras y Ventas
    def portal_conectar(self, q, b):
        return self.portal.conectar()

    def portal_estado(self, q, b):
        return self.portal.estado()

    def portal_desconectar(self, q, b):
        return self.portal.desconectar()

    def cerrar_portal(self):
        if self._portal is not None:
            self._portal.desconectar()

    def portal_traer(self, lib, q, b):
        """Trae del SII el detalle de compras y ventas del mes. No registra nada: la persona confirma después."""
        periodo = b.get("periodo", "")
        if not PERIODO.match(periodo):
            raise ErrorUsuario("Elija el mes.")
        libros = [x for x in (b.get("libros") or ["compra", "venta"]) if x in sii_portal.EXPORTACION]
        if not libros:
            raise ErrorUsuario("Indique si quiere traer compras, ventas o ambas.")
        rut = lib.contribuyente()["rut"]
        out = []
        for libro in libros:
            try:
                texto = self.portal.descargar(rut, periodo, libro)
                if texto is None:
                    out.append({"libro": libro, "vacio": True})
                    continue
                info = detectar_archivo(texto)
                if info["tipo"] != libro:
                    raise ErrorUsuario("El SII entregó un archivo distinto del pedido.")
            except (sii_portal.ErrorPortal, ErrorUsuario, ErrorContable) as e:
                out.append({"libro": libro, "error": str(e)})
                continue
            out.append({"libro": libro, "nombre": f"RCV_{libro}s_{rutmod.normalizar(rut)}_{periodo}_SII.csv",
                        "analisis": info, "contenido": base64.b64encode(texto.encode("utf-8")).decode()})
        return {"resultados": out, "rut": rutmod.formatear(rut), "periodo": periodo}


SII = {"sii-semilla": "sii_semilla", "sii-certificado": "sii_certificado", "sii-token": "sii_token"}
# Todas por POST: exigen la cabecera X-Contasii, así ningún sitio externo puede abrir la ventana ni leer descargas.
PORTAL = {"conectar": "portal_conectar", "estado": "portal_estado", "desconectar": "portal_desconectar"}
GLOBAL = {"ping": ("GET", "ping"), "carpeta": ("GET", "info_carpeta"), "empresas": ("GET", "empresas"), "empresa": ("POST", "crear_empresa"), "utm": ("POST", "utm"),
          "empresa-eliminar": ("POST", "eliminar_empresa"), "papelera": ("GET", "papelera"),
          "papelera-restaurar": ("POST", "restaurar_empresa"), "papelera-borrar": ("POST", "borrar_definitivo")}
POR_EMPRESA = {
    "resumen": ("GET", "resumen"), "analizar": ("POST", "analizar"), "importar": ("POST", "importar"),
    "boleta": ("POST", "boleta_manual"),
    "catalogo": ("GET", "catalogo"), "movimiento": ("POST", "movimiento"), "anular": ("POST", "anular"),
    "f29": ("GET", "f29"), "f29-confirmar": ("POST", "f29_confirmar"), "revision": ("GET", "revision"),
    "cerrar": ("POST", "cerrar"), "diario": ("GET", "diario"), "mayor": ("GET", "mayor"),
    "balance": ("GET", "balance"), "resultados": ("GET", "resultados"), "documentos": ("GET", "documentos"),
    "documentos-eliminar": ("POST", "documentos_eliminar"),
    "excel": ("GET", "excel"), "integridad": ("GET", "integridad"), "sii-estados": ("GET", "sii_estados"),
}


def crear_manejador(app: App, puerto_ref: list):
    class Manejador(BaseHTTPRequestHandler):
        server_version = "contasii"

        def log_message(self, *a):
            pass

        def _host_ok(self):
            host = (self.headers.get("Host") or "").split(":")[0]
            return host in ("127.0.0.1", "localhost")

        def _enviar(self, codigo, cuerpo: bytes, tipo="application/json; charset=utf-8", extra=None):
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(cuerpo)

        def _json(self, codigo, obj):
            self._enviar(codigo, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

        def _manejar(self, metodo):
            if not self._host_ok():
                return self._enviar(403, b"forbidden", "text/plain")
            url = urlparse(self.path)
            if metodo == "GET" and url.path in ("/", "/index.html"):
                with open(HTML, "rb") as f:
                    return self._enviar(200, f.read(), "text/html; charset=utf-8",
                                        {"Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                                                                    "script-src 'self' 'unsafe-inline'; img-src 'self' data:"})
            if not url.path.startswith("/api/"):
                return self._enviar(404, b"no encontrado", "text/plain")
            if metodo == "POST" and self.headers.get("X-Contasii") != "1":
                return self._enviar(403, b"forbidden", "text/plain")  # evita envíos desde otros sitios
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            b = {}
            if metodo == "POST":
                largo = int(self.headers.get("Content-Length") or 0)
                if largo > 30 * 1024 * 1024:
                    return self._json(413, {"error": "El archivo es demasiado grande."})
                try:
                    b = json.loads(self.rfile.read(largo) or b"{}")
                except ValueError:  # JSON inválido, o un número con miles de dígitos
                    return self._json(400, {"error": "Solicitud inválida."})
                if not isinstance(b, dict):
                    return self._json(400, {"error": "Solicitud inválida."})
            partes = url.path.strip("/").split("/")[1:]  # sin 'api'
            try:
                if partes == ["ventana"] and metodo == "POST":
                    return self._json(200, app.mostrar_ventana(q, b))
                if len(partes) == 1 and partes[0] in SII and metodo == "POST":
                    # Las consultas al SII no tocan la contabilidad: no bloquean el resto del programa.
                    return self._json(200, getattr(app, SII[partes[0]])(q, b))
                if len(partes) == 2 and partes[0] == "sii-portal" and partes[1] in PORTAL and metodo == "POST":
                    return self._json(200, getattr(app, PORTAL[partes[1]])(q, b))
                if len(partes) == 3 and partes[0] == "e" and partes[2] == "sii-traer" and metodo == "POST":
                    # Trae los archivos del SII sin registrarlos: solo lee los datos de la empresa.
                    lib = app.libro(partes[1])
                    try:
                        return self._json(200, app.portal_traer(lib, q, b))
                    finally:
                        lib.con.close()
                if len(partes) == 3 and partes[0] == "e" and partes[2] == "sii-estado" and metodo == "POST":
                    # Consulta de estado de documentos: puede tardar; solo escribe su propio registro.
                    lib = app.libro(partes[1])
                    try:
                        return self._json(200, app.sii_estado(lib, q, b))
                    finally:
                        lib.con.close()
                with app.lock:
                    if len(partes) == 1 and partes[0] in GLOBAL and GLOBAL[partes[0]][0] == metodo:
                        res = getattr(app, GLOBAL[partes[0]][1])(q, b)
                    elif len(partes) == 3 and partes[0] == "e" and partes[2] in POR_EMPRESA \
                            and POR_EMPRESA[partes[2]][0] == metodo:
                        lib = app.libro(partes[1])
                        try:
                            res = getattr(app, POR_EMPRESA[partes[2]][1])(lib, q, b)
                        finally:
                            lib.con.close()
                    else:
                        return self._json(404, {"error": "Ruta no encontrada."})
                if isinstance(res, bytes):
                    nombre = f"contabilidad_{partes[1].replace('.db', '')}_{q.get('periodo') or 'todo'}.xlsx"
                    return self._enviar(200, res, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                        {"Content-Disposition": f'attachment; filename="{nombre}"'})
                return self._json(200, res)
            except (ErrorUsuario, ErrorContable, ParametroFaltante, rutmod.RutInvalido, sii_ws.ErrorSII,
                    sii_portal.ErrorPortal, navegador.ErrorNavegador, tablas.ErrorTabla) as e:
                return self._json(400, {"error": str(e)})
            except Exception as e:  # error inesperado: se informa sin detener el programa
                traceback.print_exc()
                return self._json(500, {"error": f"Error inesperado: {e}"})

        def do_GET(self):
            self._manejar("GET")

        def do_POST(self):
            self._manejar("POST")

    return Manejador


def servidor(carpeta: str, puerto: int = 8765, portal=None):
    app = App(carpeta, portal)
    ref = [puerto]
    for p in range(puerto, puerto + 20):
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", p), crear_manejador(app, ref))
            ref[0] = p
            srv.app = app
            return srv, p
        except OSError:
            continue
    raise OSError("No hay un puerto libre entre 8765 y 8784.")


def carpeta_por_defecto() -> str:
    """Donde se guardan las empresas.

    En el programa instalado (.exe) va a Documentos\\Mi Contabilidad, fuera de la
    carpeta del programa, para que sobreviva a actualizaciones y desinstalaciones.
    Ejecutado desde el código fuente, queda en contabilidad-sii/mis_empresas.
    """
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.expanduser("~"), "Documents", "Mi Contabilidad")
    return os.path.join(os.path.dirname(AQUI), "mis_empresas")


def ya_abierto(puerto: int) -> bool:
    """True si ya hay un programa de contabilidad respondiendo en ese puerto."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{puerto}/api/ping", timeout=1) as r:
            return json.loads(r.read()).get("app") == "contasii"
    except Exception:
        return False


def aviso(texto: str):
    """Mensaje para la persona: en Windows, un cuadro de diálogo (el programa no tiene consola)."""
    print(texto)
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, texto, "Mi Contabilidad", 0x40)  # MB_ICONINFORMATION
        except Exception:
            pass


def mostrar_abierto(puerto: int) -> bool:
    """Pide al programa que ya está abierto que muestre su ventana. True si lo hizo."""
    import urllib.request
    pedido = urllib.request.Request(f"http://127.0.0.1:{puerto}/api/ventana", data=b"{}", method="POST",
                                    headers={"X-Contasii": "1", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=5) as r:
            return bool(json.loads(r.read()).get("mostrada"))
    except Exception:
        return False


def main(argv=None):
    import argparse
    # El .exe no tiene consola (--windowed): sin salida estándar, lo impreso se descarta.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="Abre Mi Contabilidad en una ventana de Google Chrome")
    ap.add_argument("--carpeta", default=carpeta_por_defecto(), help="carpeta donde se guardan las empresas")
    ap.add_argument("--puerto", type=int, default=8765)
    ap.add_argument("--no-abrir", action="store_true",
                    help="no abrir la ventana: el programa queda atendiendo hasta que se detenga (pruebas)")
    a = ap.parse_args(argv)
    if ya_abierto(a.puerto):
        # Doble clic con el programa ya abierto: se muestra su ventana; si no tiene (--no-abrir), se abre una.
        if not a.no_abrir and not mostrar_abierto(a.puerto):
            try:
                navegador.VentanaPrograma(f"http://127.0.0.1:{a.puerto}/")
            except navegador.ErrorNavegador as e:
                aviso(str(e))
                return 1
        print("Mi Contabilidad ya estaba abierta; se mostró su ventana.")
        return 0
    if not a.no_abrir:
        try:
            navegador.buscar_navegador()
        except navegador.ErrorNavegador as e:
            aviso(str(e))
            return 1
    try:
        srv, p = servidor(a.carpeta, a.puerto)
    except OSError as e:
        aviso(f"No se pudo abrir Mi Contabilidad: {e}")
        return 1
    atexit.register(srv.app.cerrar_portal)  # al salir se cierra la ventana del SII, si quedó abierta
    url = f"http://127.0.0.1:{p}/"
    print(f"Mi Contabilidad atendiendo en {url}. Datos en: {os.path.abspath(a.carpeta)}")
    if a.no_abrir:
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
        return 0
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        srv.app.ventana = navegador.VentanaPrograma(url)
        srv.app.ventana.esperar_cierre()  # el programa termina cuando la persona cierra su ventana
    except navegador.ErrorNavegador as e:
        aviso(str(e))
        return 1
    except KeyboardInterrupt:
        pass
    finally:
        srv.shutdown()
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
