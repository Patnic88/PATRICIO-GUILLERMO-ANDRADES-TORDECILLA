"""Ventana del navegador del computador (Edge o Chrome) controlada por el programa.

Sirve para que la persona ingrese al SII en la página oficial, con su clave tributaria o
su Clave Única, en una ventana normal donde ve la dirección sii.cl. El programa no lee
lo que se escribe en esa ventana: solo pregunta qué página está abierta y pide datos al
SII desde esa misma página, con la sesión que la persona abrió.

La ventana usa un perfil temporal, separado del navegador habitual, que se borra al
cerrarla. Se controla con el protocolo de herramientas de desarrollo de Chromium
(Chrome DevTools Protocol), que escucha solo en 127.0.0.1. No requiere librerías
externas: el cliente WebSocket mínimo está aquí mismo.
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


class ErrorNavegador(Exception):
    """Error que se muestra tal cual al usuario."""


# ------------------------------------------------------------------ buscar el navegador
def candidatos() -> list:
    """Rutas posibles de Edge o Chrome, en orden de preferencia."""
    rutas = []
    propio = os.environ.get("CONTASII_NAVEGADOR")
    if propio:
        rutas.append(propio)
    if sys.platform == "win32":
        bases = [os.environ.get(v) for v in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA")]
        for rel in (("Microsoft", "Edge", "Application", "msedge.exe"), ("Google", "Chrome", "Application", "chrome.exe")):
            rutas += [os.path.join(b, *rel) for b in bases if b]
    elif sys.platform == "darwin":
        rutas += ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                  "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    else:
        for nombre in ("google-chrome", "google-chrome-stable", "microsoft-edge", "chromium", "chromium-browser"):
            r = shutil.which(nombre)
            if r:
                rutas.append(r)
    return rutas


def buscar_navegador() -> str:
    for r in candidatos():
        if r and os.path.isfile(r):
            return r
    raise ErrorNavegador("No encontré Microsoft Edge ni Google Chrome en este computador. Instale uno de los dos "
                         "y vuelva a intentarlo.")


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
        lineas = cabecera.decode("latin-1").split("\r\n")
        if " 101 " not in lineas[0] + " ":
            raise ErrorNavegador(f"El navegador rechazó la conexión de control: {lineas[0]}")
        esperado = base64.b64encode(hashlib.sha1((clave + self.GUID).encode()).digest()).decode()
        aceptado = next((l.split(":", 1)[1].strip() for l in lineas[1:] if l.lower().startswith("sec-websocket-accept:")), "")
        if aceptado != esperado:
            raise ErrorNavegador("Respuesta inválida del navegador al conectar.")
        self.envio = threading.Lock()

    def _exacto(self, n: int) -> bytes:
        while len(self.resto) < n:
            parte = self.sock.recv(max(65536, n - len(self.resto)))
            if not parte:
                raise ErrorNavegador("Se cerró la ventana del navegador.")
            self.resto += parte
        dato = bytes(self.resto[:n])
        del self.resto[:n]
        return dato

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

    def recibir(self) -> str:
        partes = []
        while True:
            b0, b1 = self._exacto(2)
            opcode, largo = b0 & 0x0F, b1 & 0x7F
            if largo == 126:
                largo = struct.unpack(">H", self._exacto(2))[0]
            elif largo == 127:
                largo = struct.unpack(">Q", self._exacto(8))[0]
            mascara = self._exacto(4) if b1 & 0x80 else None
            datos = self._exacto(largo)
            if mascara:
                datos = bytes(b ^ mascara[i % 4] for i, b in enumerate(datos))
            if opcode == 0x8:
                raise ErrorNavegador("Se cerró la ventana del navegador.")
            if opcode == 0x9:
                self._marco(0xA, datos)
                continue
            if opcode == 0xA:
                continue
            partes.append(datos)
            if b0 & 0x80:
                return b"".join(partes).decode("utf-8", "replace")

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
    """Una ventana de Edge o Chrome con un perfil temporal, controlada por el programa."""

    def __init__(self, url: str, ruta: str | None = None, headless: bool = False, espera: float = 25):
        self.ruta = ruta or buscar_navegador()
        self.perfil = tempfile.mkdtemp(prefix="micontabilidad-sii-")
        args = [self.ruta, "--remote-debugging-port=0", f"--user-data-dir={self.perfil}", "--no-first-run",
                "--no-default-browser-check", "--disable-default-apps", "--new-window"]
        if headless:
            args += ["--headless=new", "--disable-gpu"]
        if sys.platform.startswith("linux") and os.geteuid() == 0:
            args.append("--no-sandbox")
        args.append(url)
        opciones = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "stdin": subprocess.DEVNULL}
        if sys.platform == "win32":
            opciones["creationflags"] = 0x08000000  # CREATE_NO_WINDOW: sin consola extra
        try:
            self.proc = subprocess.Popen(args, **opciones)
        except OSError as e:
            shutil.rmtree(self.perfil, ignore_errors=True)
            raise ErrorNavegador(f"No se pudo abrir el navegador ({self.ruta}): {e}")
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
            self.ws.sock.settimeout(timeout)
            self.ws.enviar(json.dumps(msg))
            while True:
                try:
                    r = json.loads(self.ws.recibir())
                except socket.timeout:
                    raise ErrorNavegador("El navegador tardó demasiado en responder.")
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

    def evaluar(self, target_id: str, expresion: str, timeout: float = 120):
        """Ejecuta JavaScript en la pestaña y devuelve el valor (espera las promesas)."""
        r = self.comando("Runtime.evaluate", {"expression": expresion, "awaitPromise": True, "returnByValue": True},
                         sesion=self._sesion(target_id), timeout=timeout)
        if "exceptionDetails" in r:
            d = r["exceptionDetails"]
            raise ErrorNavegador("Error en la página: " + (d.get("exception", {}).get("description") or d.get("text", "")))
        return r.get("result", {}).get("value")

    def navegar(self, target_id: str, url: str, espera: float = 30):
        """Abre la dirección en la pestaña y espera a que termine de cargar."""
        sesion = self._sesion(target_id)
        self.comando("Page.navigate", {"url": url}, sesion=sesion)
        limite = time.monotonic() + espera
        while time.monotonic() < limite:
            time.sleep(0.5)
            try:
                listo = self.comando("Runtime.evaluate", {"expression": "document.readyState", "returnByValue": True},
                                     sesion=sesion, timeout=10).get("result", {}).get("value")
            except ErrorNavegador:
                continue
            if listo == "complete":
                return
        raise ErrorNavegador("La página del SII tardó demasiado en cargar.")

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
