"""Ventanas de Google Chrome que abre el programa. Usa solo Chrome.

1. La ventana del programa (VentanaPrograma): Chrome en modo aplicación, sin pestañas ni
   barra de direcciones, con un perfil propio que se conserva entre aperturas. Al cerrarla
   termina el programa.
2. La ventana del SII (Navegador): para que la persona ingrese al SII en la página oficial,
   con su clave tributaria o su Clave Única, en una ventana normal donde ve la dirección
   sii.cl. El programa no lee lo que se escribe en esa ventana: solo pregunta qué página
   está abierta y pide datos al SII desde esa misma página, con la sesión que la persona
   abrió. Usa un perfil temporal, separado del navegador habitual, que se borra al cerrarla.

Ambas se controlan con el protocolo de herramientas de desarrollo de Chromium (Chrome
DevTools Protocol), que escucha solo en 127.0.0.1. No requiere librerías externas: el
cliente WebSocket mínimo está aquí mismo.
"""

import base64
import hashlib
import itertools
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request


class ErrorNavegador(Exception):
    """Error que se muestra tal cual al usuario."""


# ------------------------------------------------------------------ buscar el navegador
SIN_CHROME = ("Mi Contabilidad funciona con Google Chrome y no lo encontré en este computador. Instálelo desde "
              "https://www.google.com/chrome/ y vuelva a abrir el programa.")


def _chrome_en_registro() -> list:
    """Ruta de chrome.exe que Windows registra al instalarlo (por usuario o para todo el equipo)."""
    try:
        import winreg
    except ImportError:
        return []
    out = []
    for raiz in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            with winreg.OpenKey(raiz, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe") as k:
                valor, _ = winreg.QueryValueEx(k, "")
                if valor:
                    out.append(valor.strip('"'))
        except OSError:
            continue
    return out


def candidatos() -> list:
    """Rutas posibles de Google Chrome, en orden de preferencia. CONTASII_NAVEGADOR permite indicar otra."""
    rutas = []
    propio = os.environ.get("CONTASII_NAVEGADOR")
    if propio:
        rutas.append(propio)
    if sys.platform == "win32":
        rutas += _chrome_en_registro()
        bases = [os.environ.get(v) for v in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
        rutas += [os.path.join(b, "Google", "Chrome", "Application", "chrome.exe") for b in bases if b]
    elif sys.platform == "darwin":
        rutas += ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                  os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")]
    else:
        for nombre in ("google-chrome", "google-chrome-stable"):
            r = shutil.which(nombre)
            if r:
                rutas.append(r)
    return rutas


def buscar_navegador() -> str:
    """Ruta de Google Chrome. Si no está instalado, ErrorNavegador con las instrucciones."""
    for r in candidatos():
        if r and os.path.isfile(r):
            return r
    raise ErrorNavegador(SIN_CHROME)


def _opciones_proceso() -> dict:
    opciones = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "stdin": subprocess.DEVNULL}
    if sys.platform == "win32":
        opciones["creationflags"] = 0x08000000  # CREATE_NO_WINDOW: sin consola extra
    return opciones


def carpeta_perfil_ventana() -> str:
    """Perfil de Chrome de la ventana del programa: separado del Chrome habitual y conservado entre aperturas."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    else:
        base = os.environ.get("XDG_CACHE_HOME") or os.path.join(os.path.expanduser("~"), ".cache")
    return os.path.join(base, "MiContabilidad", "ventana-chrome")


class VentanaPrograma:
    """La ventana del programa: Chrome en modo aplicación con un perfil propio.

    Como el perfil es solo del programa, cualquier página abierta en él es del programa (o un enlace que se
    abrió desde él). Cuando ya no queda ninguna, la persona cerró la ventana.
    """

    def __init__(self, url: str, ruta: str | None = None, perfil: str | None = None, headless: bool = False):
        self.url = url
        self.ruta = ruta or buscar_navegador()
        self.perfil = perfil or carpeta_perfil_ventana()
        os.makedirs(self.perfil, exist_ok=True)
        args = [self.ruta, f"--app={url}", f"--user-data-dir={self.perfil}", "--remote-debugging-port=0",
                "--no-first-run", "--no-default-browser-check", "--disable-default-apps", "--window-size=1280,860",
                "--lang=es-CL"]  # fechas en día-mes-año y textos de Chrome en español
        if headless:
            args += ["--headless=new", "--disable-gpu"]
        if sys.platform.startswith("linux") and os.geteuid() == 0:
            args.append("--no-sandbox")
        try:
            self.proc = subprocess.Popen(args, **_opciones_proceso())
        except OSError as e:
            raise ErrorNavegador(f"No se pudo abrir Google Chrome ({self.ruta}): {e}")

    def _devtools(self):
        try:
            with open(os.path.join(self.perfil, "DevToolsActivePort"), encoding="utf-8") as f:
                return int(f.read().split()[0])
        except (OSError, ValueError, IndexError):
            return None

    def paginas(self):
        """Páginas abiertas en el perfil del programa, o None si Chrome no responde."""
        puerto = self._devtools()
        if not puerto:
            return None
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{puerto}/json/list", timeout=3) as r:
                return [t for t in json.loads(r.read()) if t.get("type") == "page"]
        except (OSError, ValueError):
            return None

    def esperar_cierre(self, intervalo: float = 1.5, inicio: float = 60):
        """Vuelve cuando la persona cerró la ventana: dos consultas seguidas sin páginas (no un parpadeo al
        recargar). Mientras Chrome arranca (hasta `inicio` segundos) no se da por cerrada. Si Chrome no responde
        y nunca mostró páginas (por ejemplo, una política del equipo desactiva el control), espera a que termine
        el proceso de Chrome."""
        visto, fallos, t0 = False, 0, time.monotonic()
        while True:
            hay = self.paginas()
            if hay:
                visto, fallos = True, 0
            else:
                fallos += 1
                arrancando = not visto and time.monotonic() - t0 < inicio
                responde = hay is not None or visto or self.proc.poll() is not None
                if fallos >= 2 and not arrancando and responde:
                    return
            time.sleep(intervalo)

    def traer_al_frente(self) -> bool:
        """Muestra la ventana del programa delante de las demás (al hacer doble clic con el programa abierto)."""
        puerto, hay = self._devtools(), self.paginas() or []
        destino = next((t for t in hay if t.get("url", "").startswith(self.url)), None)
        if not puerto or not destino:  # sin la página del programa: quien llama abre otra ventana
            return False
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{puerto}/json/activate/{destino['id']}", timeout=3):
                return True
        except OSError:
            return False

    def cerrar(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=8)
        except (OSError, subprocess.TimeoutExpired):
            pass


# ------------------------------------------------------------------ WebSocket mínimo (RFC 6455)
class WebSocket:
    GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

    def __init__(self, host: str, puerto: int, ruta: str, timeout: float = 30):
        self.sock = socket.create_connection((host, puerto), timeout=timeout)
        clave = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {ruta} HTTP/1.1\r\nHost: {host}:{puerto}\r\nUpgrade: websocket\r\n"
                           f"Connection: Upgrade\r\nSec-WebSocket-Key: {clave}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        cabecera = b""
        while b"\r\n\r\n" not in cabecera:
            parte = self.sock.recv(4096)
            if not parte:
                raise ErrorNavegador("El navegador cerró la conexión de control.")
            cabecera += parte
        cabecera, resto = cabecera.split(b"\r\n\r\n", 1)
        self.resto = bytearray(resto)
        self.partes = []
        lineas = cabecera.decode("latin-1").split("\r\n")
        if " 101 " not in lineas[0] + " ":
            raise ErrorNavegador(f"El navegador rechazó la conexión de control: {lineas[0]}")
        esperado = base64.b64encode(hashlib.sha1((clave + self.GUID).encode()).digest()).decode()
        aceptado = next((l.split(":", 1)[1].strip() for l in lineas[1:] if l.lower().startswith("sec-websocket-accept:")), "")
        if aceptado != esperado:
            raise ErrorNavegador("Respuesta inválida del navegador al conectar.")
        self.envio = threading.Lock()

    def _marco(self, opcode: int, datos: bytes):
        largo = len(datos)
        cab = bytes([0x80 | opcode])
        if largo < 126:
            cab += bytes([0x80 | largo])
        elif largo < 65536:
            cab += bytes([0x80 | 126]) + struct.pack(">H", largo)
        else:
            cab += bytes([0x80 | 127]) + struct.pack(">Q", largo)
        mascara = os.urandom(4)
        cuerpo = bytes(b ^ mascara[i % 4] for i, b in enumerate(datos))
        with self.envio:
            self.sock.sendall(cab + mascara + cuerpo)

    def enviar(self, texto: str):
        self._marco(0x1, texto.encode("utf-8"))

    def _extraer(self):
        """Saca del búfer un marco completo (fin, opcode, datos) o devuelve None si aún no llega entero.

        No consume nada hasta tener el marco completo: si se agota el tiempo de espera a mitad
        de un marco, la conexión sigue en un estado coherente.
        """
        b = self.resto
        if len(b) < 2:
            return None
        largo, pos = b[1] & 0x7F, 2
        if largo == 126:
            if len(b) < 4:
                return None
            largo, pos = struct.unpack(">H", b[2:4])[0], 4
        elif largo == 127:
            if len(b) < 10:
                return None
            largo, pos = struct.unpack(">Q", b[2:10])[0], 10
        mascara = None
        if b[1] & 0x80:
            if len(b) < pos + 4:
                return None
            mascara, pos = bytes(b[pos:pos + 4]), pos + 4
        if len(b) < pos + largo:
            return None
        datos = bytes(b[pos:pos + largo])
        fin, opcode = bool(b[0] & 0x80), b[0] & 0x0F
        del b[:pos + largo]
        if mascara:
            datos = bytes(x ^ mascara[i % 4] for i, x in enumerate(datos))
        return fin, opcode, datos

    def recibir(self) -> str:
        while True:
            marco = self._extraer()
            if marco is None:
                parte = self.sock.recv(1 << 20)
                if not parte:
                    raise ErrorNavegador("Se cerró la ventana del navegador.")
                self.resto += parte
                continue
            fin, opcode, datos = marco
            if opcode == 0x8:
                raise ErrorNavegador("Se cerró la ventana del navegador.")
            if opcode == 0x9:
                self._marco(0xA, datos)
                continue
            if opcode == 0xA:
                continue
            self.partes.append(datos)
            if fin:
                texto = b"".join(self.partes).decode("utf-8", "replace")
                self.partes = []
                return texto

    def cerrar(self):
        try:
            self._marco(0x8, b"")
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


# ------------------------------------------------------------------ navegador controlado
class Navegador:
    """Una ventana de Google Chrome con un perfil temporal, controlada por el programa."""

    # La primera apertura de Chrome en un equipo lento (o recién encendido, con el antivirus revisando) puede
    # tardar más de 25 s en dejar listo su control (se vio 33 s en Windows de GitHub Actions): se espera hasta 60 s.
    def __init__(self, url: str, ruta: str | None = None, headless: bool = False, espera: float = 60):
        self.ruta = ruta or buscar_navegador()
        self.perfil = tempfile.mkdtemp(prefix="micontabilidad-sii-")
        args = [self.ruta, "--remote-debugging-port=0", f"--user-data-dir={self.perfil}", "--no-first-run",
                "--no-default-browser-check", "--disable-default-apps", "--new-window"]
        if headless:
            args += ["--headless=new", "--disable-gpu"]
        if sys.platform.startswith("linux") and os.geteuid() == 0:
            args.append("--no-sandbox")
        args.append(url)
        try:
            self.proc = subprocess.Popen(args, **_opciones_proceso())
        except OSError as e:
            shutil.rmtree(self.perfil, ignore_errors=True)
            raise ErrorNavegador(f"No se pudo abrir Google Chrome ({self.ruta}): {e}")
        self.ids = itertools.count(1)
        self.lock = threading.RLock()
        self.sesiones = {}
        try:
            self.puerto, ruta_ws = self._puerto(espera)
            self.ws = WebSocket("127.0.0.1", self.puerto, ruta_ws)
        except Exception:
            self.cerrar()
            raise

    def _puerto(self, espera):
        archivo = os.path.join(self.perfil, "DevToolsActivePort")
        limite = time.monotonic() + espera
        while time.monotonic() < limite:
            if self.proc.poll() is not None:
                raise ErrorNavegador("El navegador se cerró apenas se abrió. Si ya tenía una ventana abierta por el "
                                     "programa, ciérrela e intente de nuevo.")
            try:
                with open(archivo, encoding="utf-8") as f:
                    lineas = f.read().split()
                if len(lineas) >= 2:
                    return int(lineas[0]), lineas[1]
            except (OSError, ValueError):
                pass
            time.sleep(0.2)
        raise ErrorNavegador("El navegador no respondió a tiempo.")

    # ---- protocolo
    def comando(self, metodo: str, params: dict | None = None, sesion: str | None = None, timeout: float = 60):
        with self.lock:
            n = next(self.ids)
            msg = {"id": n, "method": metodo, "params": params or {}}
            if sesion:
                msg["sessionId"] = sesion
            try:
                self.ws.sock.settimeout(timeout)
                self.ws.enviar(json.dumps(msg))
            except OSError as e:
                raise ErrorNavegador(f"Se perdió la conexión con el navegador: {e}")
            while True:
                try:
                    r = json.loads(self.ws.recibir())
                except socket.timeout:
                    raise ErrorNavegador("El navegador tardó demasiado en responder.")
                except OSError as e:  # p. ej. la ventana se cerró mientras se esperaba la respuesta
                    raise ErrorNavegador(f"Se perdió la conexión con el navegador: {e}")
                if r.get("id") == n:
                    if "error" in r:
                        raise ErrorNavegador(f"{metodo}: {r['error'].get('message')}")
                    return r.get("result", {})

    def vivo(self) -> bool:
        return self.proc.poll() is None

    def pestanas(self) -> list:
        """Pestañas abiertas (tipo 'page'), con su id, url y título."""
        return [t for t in self.comando("Target.getTargets")["targetInfos"] if t.get("type") == "page"]

    def _sesion(self, target_id: str) -> str:
        if target_id not in self.sesiones:
            self.sesiones[target_id] = self.comando("Target.attachToTarget",
                                                    {"targetId": target_id, "flatten": True})["sessionId"]
        return self.sesiones[target_id]

    def en_pestana(self, target_id: str, metodo: str, params: dict | None = None, timeout: float = 60):
        """Comando dirigido a una pestaña. Si la conexión con la pestaña se perdió, se reconecta una vez."""
        try:
            return self.comando(metodo, params, sesion=self._sesion(target_id), timeout=timeout)
        except ErrorNavegador as e:
            if "session" not in str(e).lower():
                raise
            self.sesiones.pop(target_id, None)
            return self.comando(metodo, params, sesion=self._sesion(target_id), timeout=timeout)

    def evaluar(self, target_id: str, expresion: str, timeout: float = 120):
        """Ejecuta JavaScript en la pestaña y devuelve el valor (espera las promesas)."""
        r = self.en_pestana(target_id, "Runtime.evaluate",
                            {"expression": expresion, "awaitPromise": True, "returnByValue": True}, timeout=timeout)
        if "exceptionDetails" in r:
            d = r["exceptionDetails"]
            raise ErrorNavegador("Error en la página: " + (d.get("exception", {}).get("description") or d.get("text", "")))
        return r.get("result", {}).get("value")

    def ir(self, target_id: str, url: str, timeout: float = 60):
        """Abre la dirección en la pestaña sin esperar a que cargue.

        Page.navigate responde cuando el sitio contesta; timeout acota esa espera.
        """
        self.en_pestana(target_id, "Page.navigate", {"url": url}, timeout=timeout)

    def navegar(self, target_id: str, url: str, espera: float = 30):
        """Abre la dirección en la pestaña y espera a que termine de cargar (en total, a lo más «espera» s)."""
        limite = time.monotonic() + espera
        self.ir(target_id, url, timeout=espera)
        while time.monotonic() < limite:
            time.sleep(0.5)
            try:
                if self.evaluar(target_id, "document.readyState", timeout=10) == "complete":
                    return
            except ErrorNavegador:
                continue
        raise ErrorNavegador("La página tardó demasiado en cargar.")

    def nueva_pestana(self, url: str) -> str:
        return self.comando("Target.createTarget", {"url": url})["targetId"]

    def cookies(self) -> list:
        return self.comando("Storage.getCookies").get("cookies", [])

    def traer_al_frente(self, target_id: str):
        try:
            self.comando("Target.activateTarget", {"targetId": target_id})
        except ErrorNavegador:
            pass

    def cerrar(self):
        ws = getattr(self, "ws", None)
        if ws:
            try:
                with self.lock:
                    self.ws.sock.settimeout(5)
                    self.ws.enviar(json.dumps({"id": next(self.ids), "method": "Browser.close"}))
            except (OSError, ErrorNavegador):
                pass
            ws.cerrar()
        try:
            self.proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
        for _ in range(10):  # en Windows el navegador puede tardar en soltar los archivos del perfil
            shutil.rmtree(self.perfil, ignore_errors=True)
            if not os.path.exists(self.perfil):
                break
            time.sleep(0.5)
