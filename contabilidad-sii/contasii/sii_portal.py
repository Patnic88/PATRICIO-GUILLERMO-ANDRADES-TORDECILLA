"""Conexión con el portal del SII para traer el Registro de Compras y Ventas (RCV).

La persona ingresa al SII en una ventana de Google Chrome que abre el programa, en la
página oficial de ingreso, con su RUT y clave tributaria o con su Clave Única. El
programa no pide, no ve y no guarda la clave: usa la sesión que queda abierta en esa
ventana y se borra al cerrarla.

Verificado contra el SII real el 13-10-2026, sin credenciales:
- La página de ingreso (zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html)
  recibe, después de «?», la dirección a la que vuelve tras ingresar. Tiene el formulario
  de RUT y clave y el botón de Clave Única, que va a
  /cgi_AUT2000/InitClaveUnicaP.cgi?code=411&REF=<dirección> y de ahí a
  accounts.claveunica.gob.cl.
- La propia página del SII (AutAll.js, función «autenticado») considera ingresada a la
  persona cuando existe la cookie RUT_NS; DV_NS guarda el dígito verificador.
- Sin sesión, la aplicación del RCV (www4.sii.cl/consdcvinternetui/) redirige a la
  página de ingreso, también en un navegador real.

[VERIFICAR] con una sesión real, porque proviene de fuentes secundarias: el servicio de
exportación del detalle (getDetalleCompraExport / getDetalleVentaExport), el formato de
su cuerpo y la cookie TOKEN como «conversationId». Fuentes: SDK emisso-ai/emisso-sii,
packages/engine/src/rcv/index.ts (versión de mayo de 2026), y publicaciones de 2017-2024
sobre el mismo servicio. Si esa descarga automática falla, queda la vía asistida: todo
archivo que la persona descargue en esa ventana (botón «Descargar Detalles» del RCV)
llega al programa.
"""

import base64
import json
import os
import shutil
import tempfile
import threading
import time
import uuid
from urllib.parse import urlparse

from . import navegador
from . import rut as rutmod

URL_RCV = "https://www4.sii.cl/consdcvinternetui/"
# Verificado (13-10-2026) en el código público del SII, zeusr.sii.cl/admin/responsive_barranav.js:
# var urlCerrarSesion = "https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi" (enlace «Cerrar Sesión»).
URL_CERRAR_SESION = "https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi"
URL_INGRESO = "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?" + URL_RCV
DOMINIO = "sii.cl"
COOKIE_INGRESO, COOKIE_DV = "RUT_NS", "DV_NS"  # verificadas en AutAll.js del SII
COOKIE_TOKEN = "TOKEN"  # [VERIFICAR] fuente secundaria
SERVICIO = "services/data/facadeService/"
NAMESPACE = "cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService"
# libro -> (operación, servicio de exportación, acción reCAPTCHA). [VERIFICAR] fuente secundaria.
EXPORTACION = {"compra": ("COMPRA", "getDetalleCompraExport", "RCV_DETC"),
               "venta": ("VENTA", "getDetalleVentaExport", "RCV_DETV")}
TOKEN_RECAPTCHA_WEB = "t-o-k-e-n-web"  # valor que, según la fuente secundaria, envía la página del RCV
# Páginas donde la persona está ingresando: no se le cambia la página mientras está en ellas.
RUTAS_INGRESO = ("/AUT2000/", "/cgi_AUT2000/")
DOMINIOS_INGRESO = ("claveunica.gob.cl",)
# Pestañas propias del navegador (p. ej. chrome://downloads/ o, con otro Chromium indicado en
# CONTASII_NAVEGADOR, edge://downloads-hub/): no son del SII.
ESQUEMAS_INTERNOS = ("devtools:", "edge:", "chrome:", "chrome-extension:", "about:")
EXTENSIONES = (".csv", ".txt", ".xls", ".xlsx", ".htm", ".html")
MAX_ARCHIVO = 30 * 1024 * 1024

# Se ejecuta dentro de la página del RCV, con la sesión de la persona. Si la página tiene cargado
# reCAPTCHA v3 de Google, se pide ahí un código para la acción, como haría la propia página; si no,
# se envía el valor que describe la fuente secundaria. [VERIFICAR] con una sesión real: según la
# biblioteca devlas-cl/dte-sii (SiiPortalAuth.js, octubre de 2026) el detalle exige reCAPTCHA v3.
JS_PEDIR = r"""async (url, cuerpo) => {
  let recaptcha = "no";
  const limite = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);
  const lib = () => window.grecaptcha && (window.grecaptcha.enterprise || window.grecaptcha);
  try {
    const src = [...document.scripts].map(x => x.src || "").find(u => /recaptcha\/(api|enterprise)\.js/.test(u) && /[?&]render=/.test(u));
    const clave = src ? new URL(src).searchParams.get("render") : null;
    if (clave && clave !== "explicit") {
      // La biblioteca define «ready» enseguida y «execute» recién cuando termina de cargar: se espera
      // «ready» (con límite) antes de pedir el código, para no enviar el valor fijo por apuro.
      recaptcha = "error: reCAPTCHA no terminó de cargar";
      for (let i = 0; i < 60 && !(lib() && lib().ready); i++) await new Promise(ok => setTimeout(ok, 250));
      const g0 = lib();
      if (g0 && g0.ready) await limite(new Promise(ok => g0.ready(ok)), 15000, "reCAPTCHA no terminó de cargar");
      const g = lib();
      if (g && g.execute) {
        cuerpo.data.tokenRecaptcha = await limite(Promise.resolve(g.execute(clave, {action: cuerpo.data.accionRecaptcha})),
                                                  20000, "reCAPTCHA no respondió");
        recaptcha = "si";
      }
    }
  } catch (e) { recaptcha = "error: " + (e && e.message || e); }
  const r = await fetch(url, {method: "POST", credentials: "include",
    headers: {"Content-Type": "application/json;charset=UTF-8", "Accept": "application/json, text/plain, */*"},
    body: JSON.stringify(cuerpo)});
  const b = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return {estado: r.status, tipo: r.headers.get("content-type") || "", url: r.url, b64: btoa(s), recaptcha};
}"""


class ErrorPortal(Exception):
    """Error que se muestra tal cual al usuario."""


def cuerpo_exportacion(token: str, rut_empresa: str, periodo: str, libro: str):
    """Servicio y cuerpo de la solicitud que pide el detalle del mes. [VERIFICAR]"""
    if libro not in EXPORTACION:
        raise ErrorPortal("Solo se pueden traer compras o ventas.")
    operacion, servicio, accion = EXPORTACION[libro]
    cuerpo_rut, dv = rutmod.normalizar(rut_empresa).split("-")
    return servicio, {
        "metaData": {"namespace": f"{NAMESPACE}/{servicio}", "conversationId": token,
                     "transactionId": str(uuid.uuid4())},
        "data": {"rutEmisor": cuerpo_rut, "dvEmisor": dv, "ptributario": periodo.replace("-", ""),
                 "operacion": operacion, "estadoContab": "REGISTRO",
                 "tokenRecaptcha": TOKEN_RECAPTCHA_WEB, "accionRecaptcha": accion},
    }


def _texto(crudo: bytes) -> str:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return crudo.decode(enc)
        except UnicodeDecodeError:
            continue
    return crudo.decode("utf-8", "replace")


def interpretar(resp: dict, url_rcv: str = URL_RCV):
    """Convierte la respuesta del SII en el texto del CSV, o None si el mes no tiene documentos.

    Acepta las dos formas descritas por las fuentes: un JSON cuyo campo «data» trae las
    líneas del CSV, o el CSV directamente. Cualquier otra cosa se informa como error, sin
    suponer datos.
    """
    estado = resp.get("estado") or 0
    url_final = resp.get("url") or ""
    texto = _texto(base64.b64decode(resp.get("b64") or ""))
    if url_final and not url_final.startswith(url_rcv):
        raise ErrorPortal("La sesión del SII se cerró. Vuelva a ingresar con «Ingresar al SII».")
    if "<html" in texto[:600].lower():
        raise ErrorPortal("El SII respondió con una página en vez del archivo. Puede que la sesión haya expirado: "
                          "vuelva a ingresar.")
    try:
        datos = json.loads(texto)
    except ValueError:
        datos = None
    if isinstance(datos, dict):
        r = datos.get("respEstado") or {}
        cod = r.get("codRespuesta")
        if cod not in (None, 0, "0"):
            detalle = r.get("msgeRespuesta") or r.get("codError") or "sin detalle"
            raise ErrorPortal(f"El SII no entregó el detalle (código {cod}: {detalle}).")
    if estado in (401, 403):
        raise ErrorPortal("El SII rechazó la consulta: la sesión expiró o la persona que ingresó no tiene acceso a "
                          "esta empresa.")
    if estado >= 400:
        raise ErrorPortal(f"El SII respondió con el código {estado}.")
    if isinstance(datos, dict):
        d = datos.get("data")
        if d in (None, [], ""):
            return None
        if isinstance(d, str):
            lineas = d.splitlines()
        elif isinstance(d, list) and all(isinstance(x, str) for x in d):
            lineas = d
        else:
            raise ErrorPortal("El SII respondió en un formato que el programa no reconoce.")
        texto = "\n".join(x.rstrip("\r\n") for x in lineas)
    elif datos is not None:
        raise ErrorPortal("El SII respondió en un formato que el programa no reconoce.")
    texto = texto.lstrip("﻿")
    filas = [x for x in texto.splitlines() if x.strip()]
    if not filas:
        return None
    if ";" not in filas[0]:
        raise ErrorPortal("La respuesta del SII no es un detalle en formato CSV.")
    return "\n".join(filas) + "\n" if len(filas) > 1 else None


class PortalSII:
    """La conexión con el SII a través de una ventana del navegador. Hay una por programa."""

    def __init__(self, url_ingreso: str = URL_INGRESO, url_rcv: str = URL_RCV, dominio: str = DOMINIO,
                 crear_navegador=navegador.Navegador, headless: bool = False, url_cerrar: str = URL_CERRAR_SESION):
        self.url_ingreso, self.url_rcv, self.dominio, self.url_cerrar = url_ingreso, url_rcv, dominio, url_cerrar
        self.crear_navegador = crear_navegador
        self.headless = headless
        self.lock = threading.RLock()
        self.nav = None
        self.carpeta = None
        self.mensaje = ""
        self._abriendo_rcv = 0.0
        self._listo = False  # ya llegó al RCV una vez en esta conexión
        self._completo = {}  # pestaña del RCV -> cuándo se la vio terminar de cargar

    # ---- ventana
    def conectar(self) -> dict:
        """Abre la ventana en la página de ingreso del SII (o la trae al frente si ya está abierta)."""
        with self.lock:
            if self.nav and self.nav.vivo():
                ps = self._pestanas()
                if ps:
                    self.nav.traer_al_frente(ps[0]["targetId"])
                else:
                    self.nav.nueva_pestana(self.url_ingreso)
                return self.estado()
            self._cerrar()
            self.carpeta = tempfile.mkdtemp(prefix="micontabilidad-descargas-")
            try:
                self.nav = self.crear_navegador(self.url_ingreso, headless=self.headless)
            except navegador.ErrorNavegador as e:
                self._cerrar()
                raise ErrorPortal(str(e))
            try:
                self.nav.comando("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": self.carpeta})
            except navegador.ErrorNavegador:
                pass  # sin captura de descargas; la descarga automática sigue disponible
            self.mensaje = ""
            self._listo = False
            return self.estado()

    def desconectar(self) -> dict:
        """Cierra la sesión en el SII (si se ingresó) y luego la ventana.

        El SII limita las sesiones abiertas al mismo tiempo por RUT; cerrar solo la ventana deja la
        sesión abierta del lado del SII hasta que expire.
        """
        with self.lock:
            archivos = []
            try:
                # Lo que la persona alcanzó a descargar en la ventana se entrega antes de borrar la carpeta.
                archivos = self._archivos_nuevos(todos=True)
                self._cerrar_sesion_sii()
                archivos += self._archivos_nuevos(todos=True)
            except Exception:  # noqa: BLE001 - desconectar siempre debe cerrar la ventana y borrar el perfil
                pass
            finally:
                self._cerrar()
            self.mensaje = ""
            return {"estado": "desconectado", "mensaje": "", "archivos": archivos}

    def _cerrar_sesion_sii(self):
        if not self.nav or not self.nav.vivo():
            return False
        try:
            if not self._cookies().get(COOKIE_INGRESO):
                return False
            ps = self._pestanas()
            tid = ps[0]["targetId"] if ps else self.nav.nueva_pestana("about:blank")
            self.nav.navegar(tid, self.url_cerrar, espera=6)
            return True
        except (navegador.ErrorNavegador, OSError):
            return False  # sin respuesta del SII: la sesión expirará sola

    def _cerrar(self):
        if self.nav:
            try:
                self.nav.cerrar()
            except Exception:  # noqa: BLE001 - cerrar nunca debe impedir seguir
                pass
            self.nav = None
        if self.carpeta:
            shutil.rmtree(self.carpeta, ignore_errors=True)
            self.carpeta = None
        self._completo = {}

    # ---- estado
    def _pestanas(self) -> list:
        return [p for p in self.nav.pestanas() if not p.get("url", "").startswith(ESQUEMAS_INTERNOS)]

    def _cookies(self) -> dict:
        out = {}
        for c in self.nav.cookies():
            dom = c.get("domain", "").lstrip(".")
            if dom == self.dominio or dom.endswith("." + self.dominio):
                out[c["name"]] = c.get("value", "")
        return out

    def _es_ingreso(self, url: str) -> bool:
        u = urlparse(url)
        return any(r in u.path for r in RUTAS_INGRESO) or any(u.hostname and u.hostname.endswith(d)
                                                               for d in DOMINIOS_INGRESO)

    def _es_sii(self, url: str) -> bool:
        h = urlparse(url).hostname or ""
        return h == self.dominio or h.endswith("." + self.dominio)

    def _en_rcv(self, target_id: str) -> bool:
        try:
            v = self.nav.evaluar(target_id, "[location.href, document.readyState]", timeout=5)
        except navegador.ErrorNavegador:
            return False
        return bool(v) and v[0].startswith(self.url_rcv) and v[1] in ("interactive", "complete")

    def _pestana_rcv(self):
        for p in self._pestanas():
            if p.get("url", "").startswith(self.url_rcv) and self._en_rcv(p["targetId"]):
                return p["targetId"]
        return None

    def estado(self) -> dict:
        """Estado de la conexión y archivos descargados en la ventana desde la última consulta."""
        with self.lock:
            if not self.nav:
                return {"estado": "desconectado", "mensaje": self.mensaje, "archivos": []}
            archivos = self._archivos_nuevos()
            if not self.nav.vivo():
                self._cerrar()
                self.mensaje = "Se cerró la ventana del SII."
                return {"estado": "desconectado", "mensaje": self.mensaje, "archivos": archivos}
            try:
                cookies = self._cookies()
                ingresado = bool(cookies.get(COOKIE_INGRESO))
                usuario = ""
                if ingresado and cookies.get(COOKIE_DV):
                    try:
                        usuario = rutmod.formatear(f"{cookies[COOKIE_INGRESO]}-{cookies[COOKIE_DV]}")
                    except rutmod.RutInvalido:
                        usuario = ""
                if not ingresado:
                    self._listo = False
                    return {"estado": "esperando", "mensaje": "", "archivos": archivos}
                if self._listo or self._pestana_rcv():
                    # Una vez en el RCV, la persona puede recorrer otras páginas del SII en esa ventana:
                    # no se la devuelve al RCV; la descarga automática abre su propia pestaña si hace falta.
                    self._listo = True
                    return {"estado": "conectado", "usuario": usuario, "mensaje": "", "archivos": archivos}
                # Ingresó, pero la ventana quedó en otra página del SII (puede pasar con Clave Única):
                # se abre el RCV una vez, sin interrumpir si la persona sigue en la página de ingreso.
                if time.monotonic() - self._abriendo_rcv > 20:
                    ps = self._pestanas()
                    candidata = next((p for p in ps if self._es_sii(p.get("url", ""))
                                      and not self._es_ingreso(p.get("url", ""))), None)
                    if candidata:
                        self._abriendo_rcv = time.monotonic()
                        self.nav.ir(candidata["targetId"], self.url_rcv)
                    elif not ps:
                        self._abriendo_rcv = time.monotonic()
                        self.nav.nueva_pestana(self.url_rcv)
                return {"estado": "esperando", "usuario": usuario, "mensaje": "Abriendo el Registro de Compras y Ventas…",
                        "archivos": archivos}
            except navegador.ErrorNavegador as e:
                if not self.nav.vivo():
                    self._cerrar()
                    self.mensaje = "Se cerró la ventana del SII."
                    return {"estado": "desconectado", "mensaje": self.mensaje, "archivos": archivos}
                return {"estado": "esperando", "mensaje": str(e), "archivos": archivos}

    def _archivos_nuevos(self, todos: bool = False) -> list:
        """Archivos que la persona descargó en la ventana. Se entregan una vez y se borran del disco.

        Con todos=True no se espera a que el archivo lleve un segundo sin cambios (al desconectar).
        """
        out = []
        if not self.carpeta or not os.path.isdir(self.carpeta):
            return out
        ahora = time.time()
        for nombre in sorted(os.listdir(self.carpeta)):
            ruta = os.path.join(self.carpeta, nombre)
            if not nombre.lower().endswith(EXTENSIONES) or not os.path.isfile(ruta):
                continue
            try:
                st = os.stat(ruta)
                if not todos and ahora - st.st_mtime < 1:
                    continue  # se está terminando de escribir
                if st.st_size > MAX_ARCHIVO:
                    os.remove(ruta)
                    continue
                with open(ruta, "rb") as f:
                    datos = f.read()
                os.remove(ruta)
            except OSError:
                continue
            out.append({"nombre": nombre, "contenido": base64.b64encode(datos).decode()})
        return out

    # ---- descarga automática
    def descargar(self, rut_empresa: str, periodo: str, libro: str):
        """Pide al SII el detalle del mes (compras o ventas) desde la ventana conectada.

        Devuelve el texto del CSV, o None si el SII no tiene documentos de ese mes.
        """
        with self.lock:
            if not self.nav or not self.nav.vivo():
                raise ErrorPortal("Primero ingrese al SII con el botón «Ingresar al SII».")
            try:
                if not self._cookies().get(COOKIE_INGRESO):
                    raise ErrorPortal("Termine de ingresar al SII en la ventana que se abrió y vuelva a intentarlo.")
                tid = self._pestana_rcv()
                tid = self._esperar_rcv(tid) if tid else self._abrir_rcv()
                token = self._cookies().get(COOKIE_TOKEN)
                if not token:
                    raise ErrorPortal("No encontré la sesión del Registro de Compras y Ventas (cookie TOKEN).")
                servicio, cuerpo = cuerpo_exportacion(token, rut_empresa, periodo, libro)
                expresion = f"({JS_PEDIR})({json.dumps(self.url_rcv + SERVICIO + servicio)}, {json.dumps(cuerpo)})"
                resp = self.nav.evaluar(tid, expresion, timeout=180)
            except navegador.ErrorNavegador as e:
                raise ErrorPortal(f"No se pudo consultar al SII: {e}")
        if not isinstance(resp, dict):
            raise ErrorPortal("El SII no respondió.")
        try:
            return interpretar(resp, self.url_rcv)
        except ErrorPortal as e:
            rc = str(resp.get("recaptcha") or "")
            if rc.startswith("error"):
                raise ErrorPortal(f"{e} La verificación reCAPTCHA de la página falló ({rc[6:].strip()}); espere unos "
                                  f"segundos y presione «Traer» otra vez.")
            raise

    def _abrir_rcv(self, espera: float = 40) -> str:
        """Abre el RCV en una pestaña nueva y espera a que la aplicación termine de cargar."""
        return self._esperar_rcv(self.nav.nueva_pestana(self.url_rcv), espera)

    def _esperar_rcv(self, tid: str, espera: float = 40) -> str:
        """Espera a que la pestaña del RCV termine de cargar y le da 3 s a la aplicación para iniciar su
        sesión con el SII (solo la primera vez que se la ve cargada)."""
        limite = time.monotonic() + espera
        while time.monotonic() < limite:
            try:
                v = self.nav.evaluar(tid, "[location.href, document.readyState]", timeout=5)
            except navegador.ErrorNavegador:
                v = None
            if v and v[0].startswith(self.url_rcv) and v[1] == "complete":
                visto = self._completo.setdefault(tid, time.monotonic())
                falta = 3 - (time.monotonic() - visto)
                if falta > 0:
                    time.sleep(falta)
                return tid
            if v and self._es_ingreso(v[0]):
                raise ErrorPortal("La sesión del SII expiró. Vuelva a ingresar en la ventana del SII.")
            time.sleep(0.5)
        raise ErrorPortal("El Registro de Compras y Ventas tardó demasiado en abrir.")
