"""La ventana del programa: solo Google Chrome, en modo aplicación, y el programa termina al cerrarla.

La prueba con navegador usa Chrome real sin ventana (CONTASII_NAVEGADOR permite indicar otro Chromium);
si el computador no lo tiene, se omite. Las demás reemplazan la ventana por una falsa.
"""

import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from unittest import mock

from contasii import navegador, web


def puerto_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def hay_chrome():
    try:
        navegador.buscar_navegador()
        return True
    except navegador.ErrorNavegador:
        return False


class VentanaFalsa:
    creadas = []

    def __init__(self, url, frente=True):
        self.url, self.frente, self.llamadas = url, frente, []
        VentanaFalsa.creadas.append(self)

    def marcar_reapertura(self):
        self.llamadas.append("reapertura")

    def cerrar_navegador(self):
        self.llamadas.append("cerrar")

    def esperar_cierre(self):
        # Mientras la ventana está abierta, el programa responde en su dirección.
        with urllib.request.urlopen(self.url + "api/ping", timeout=5) as r:
            self.llamadas.append(json.loads(r.read())["app"])

    def traer_al_frente(self):
        self.llamadas.append("frente")
        return self.frente


class TestSoloChrome(unittest.TestCase):
    def test_en_windows_busca_solo_chrome(self):
        entorno = {"PROGRAMFILES": r"C:\Program Files", "PROGRAMFILES(X86)": r"C:\Program Files (x86)",
                   "LOCALAPPDATA": r"C:\Users\p\AppData\Local"}
        with mock.patch.object(sys, "platform", "win32"), mock.patch.dict(os.environ, entorno), \
                mock.patch.object(navegador, "_chrome_en_registro", return_value=[]):
            os.environ.pop("CONTASII_NAVEGADOR", None)
            rutas = navegador.candidatos()
        self.assertEqual(len(rutas), 3)
        for r in rutas:
            self.assertTrue(r.endswith("chrome.exe"), r)
            self.assertNotIn("edge", r.lower())

    def test_sin_chrome_avisa_y_no_abre(self):
        avisos, puerto = [], puerto_libre()
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(navegador, "candidatos", return_value=[]), \
                mock.patch.object(web, "aviso", avisos.append):
            rc = web.main(["--carpeta", tmp, "--puerto", str(puerto)])
        self.assertEqual(rc, 1)
        self.assertEqual(avisos, [navegador.SIN_CHROME])
        self.assertIn("https://www.google.com/chrome/", avisos[0])
        self.assertFalse(web.ya_abierto(puerto))


class TestMain(unittest.TestCase):
    def setUp(self):
        VentanaFalsa.creadas = []
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_termina_al_cerrar_la_ventana(self):
        puerto = puerto_libre()
        with mock.patch.object(navegador, "buscar_navegador", return_value="chrome"), \
                mock.patch.object(navegador, "VentanaPrograma", VentanaFalsa):
            rc = web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto)])
        self.assertEqual(rc, 0)
        (v,) = VentanaFalsa.creadas
        self.assertEqual((v.url, v.llamadas), (f"http://127.0.0.1:{puerto}/", ["contasii", "cerrar"]))
        self.assertFalse(web.ya_abierto(puerto))  # el servidor se detuvo con la ventana

    def test_si_el_programa_abierto_termina_justo_ahora_se_abre_de_nuevo(self):
        # Se cerró la ventana y se hizo doble clic enseguida: el programa anterior terminó entre la primera
        # comprobación y la segunda. El nuevo no deja una ventana sin programa: se abre normalmente.
        puerto = puerto_libre()
        with mock.patch.object(web, "ya_abierto", side_effect=[True, False]), \
                mock.patch.object(web, "mostrar_abierto", return_value=False), \
                mock.patch.object(navegador, "buscar_navegador", return_value="chrome"), \
                mock.patch.object(navegador, "VentanaPrograma", VentanaFalsa):
            self.assertEqual(web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto)]), 0)
        (v,) = VentanaFalsa.creadas
        self.assertEqual(v.llamadas, ["contasii", "cerrar"])  # este proceso atendió la ventana nueva

    def test_segundo_doble_clic_muestra_la_ventana_abierta(self):
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        abierta = VentanaFalsa(f"http://127.0.0.1:{puerto}/")
        srv.app.ventana = abierta
        with mock.patch.object(navegador, "VentanaPrograma", VentanaFalsa):
            self.assertEqual(web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto)]), 0)
            self.assertEqual((abierta.llamadas, len(VentanaFalsa.creadas)), (["frente"], 1))
            # Sin la página del programa (la persona la cerró y quedó otra): se abre una ventana nueva.
            abierta.frente = False
            self.assertEqual(web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto)]), 0)
        self.assertEqual(abierta.llamadas, ["frente", "frente", "reapertura"])  # el abierto no se da por cerrado
        self.assertEqual(len(VentanaFalsa.creadas), 2)
        self.assertEqual(VentanaFalsa.creadas[1].url, f"http://127.0.0.1:{puerto}/")

    def test_api_ventana_sin_ventana(self):
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        self.assertFalse(web.mostrar_abierto(puerto))  # con --no-abrir no hay ventana que mostrar
        r = urllib.request.Request(f"http://127.0.0.1:{puerto}/api/ventana", data=b"{}", method="POST")
        with self.assertRaises(urllib.error.HTTPError) as e:  # sin la cabecera propia: rechazado
            urllib.request.urlopen(r, timeout=5)
        self.assertEqual(e.exception.code, 403)


class ProcesoFalso:
    def __init__(self, codigo):
        self.returncode = codigo

    def poll(self):
        return self.returncode


class TestEsperarCierre(unittest.TestCase):
    def ventana(self, codigo, segundos_abierto):
        v = object.__new__(navegador.VentanaPrograma)
        v.proc, v.reabierta, v.perfil = ProcesoFalso(codigo), 0.0, tempfile.mkdtemp()
        v.t_lanz, v.t_reloj, v._t_fin = time.monotonic() - segundos_abierto, time.time() - segundos_abierto, None
        self.addCleanup(shutil.rmtree, v.perfil, True)
        return v

    def esperar(self, v, seg):
        listo = threading.Event()
        threading.Thread(target=lambda: (v.esperar_cierre(intervalo=0.02, inicio=0.1), listo.set()), daemon=True).start()
        return listo.wait(seg)

    def test_chrome_que_termino_da_la_ventana_por_cerrada(self):
        # Chrome sin control (una política del equipo lo desactiva) que estuvo abierto un rato y terminó.
        self.assertTrue(self.esperar(self.ventana(0, 600), 3))

    def test_chrome_que_entrego_la_orden_a_otro_no_la_da_por_cerrada(self):
        # Ya había un Chrome con el perfil del programa (sin control): el lanzado terminó enseguida, sin dejar su
        # control listo, y la ventana vive en el otro. El programa sigue atendiendo en vez de apagarse en uso.
        for codigo in (0, 21):
            self.assertFalse(self.esperar(self.ventana(codigo, 0), 1), codigo)


@unittest.skipUnless(hay_chrome(), "no hay Google Chrome en este computador")
class TestVentanaReal(unittest.TestCase):
    def test_abre_en_modo_aplicacion_y_detecta_el_cierre(self):
        tmp, perfil = tempfile.mkdtemp(), tempfile.mkdtemp()
        srv, puerto = web.servidor(tmp, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{puerto}/"
        v = navegador.VentanaPrograma(url, perfil=perfil, headless=True)
        try:
            limite = time.monotonic() + 60  # primera apertura de Chrome en frío
            while not v.paginas() and time.monotonic() < limite:
                time.sleep(0.2)
            self.assertEqual([p["url"] for p in v.paginas()], [url])
            srv.app.ventana = v
            self.assertTrue(web.mostrar_abierto(puerto))
            cerrada = threading.Event()
            threading.Thread(target=lambda: (v.esperar_cierre(intervalo=0.3, inicio=10), cerrada.set()),
                             daemon=True).start()
            time.sleep(1)
            self.assertFalse(cerrada.is_set())  # con la ventana abierta, el programa sigue
            base = f"http://127.0.0.1:{v._devtools()}"
            for p in v.paginas():  # la persona cierra la ventana
                urllib.request.urlopen(f"{base}/json/close/{p['id']}", timeout=5).read()
            # ...y vuelve a hacer doble clic enseguida: el nuevo proceso avisa que abrirá otra ventana.
            self.assertFalse(web.mostrar_abierto(puerto))
            time.sleep(2)
            self.assertFalse(cerrada.is_set())  # mientras aparece la ventana nueva, el programa no se apaga
            urllib.request.urlopen(urllib.request.Request(f"{base}/json/new?{url}", method="PUT"), timeout=5).read()
            time.sleep(1)
            self.assertFalse(cerrada.is_set())
            for p in v.paginas():
                urllib.request.urlopen(f"{base}/json/close/{p['id']}", timeout=5).read()
            self.assertTrue(cerrada.wait(15))
            self.assertFalse(v.traer_al_frente())  # ya no hay página del programa que mostrar
            v.cerrar_navegador()  # Chrome quedó sin ventanas (sin pantalla no termina solo): se cierra
            self.assertIsNotNone(v.proc.wait(10))
        finally:
            v.cerrar()
            srv.shutdown()
            srv.server_close()
            shutil.rmtree(perfil, ignore_errors=True)
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
