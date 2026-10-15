"""La ventana del programa: solo Google Chrome, en modo aplicación, y el programa termina al cerrarla.

La prueba con navegador usa Chrome real sin ventana (CONTASII_NAVEGADOR permite indicar otro Chromium);
si el computador no lo tiene, se omite. Las demás reemplazan la ventana por una falsa.
"""

import collections
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
        self.url, self.frente, self.llamadas, self.reabierta, self.arrancando = url, frente, [], 0.0, False
        VentanaFalsa.creadas.append(self)

    def abriendo(self):
        return self.arrancando

    def pagina_pedida(self):
        self.arrancando = False

    def marcar_reapertura(self):
        self.llamadas.append("reapertura")

    def cerrar_navegador(self):
        self.llamadas.append("cerrar")

    def esperar_cierre(self):
        # Mientras la ventana está abierta, el programa responde en su dirección.
        with urllib.request.urlopen(self.url + "api/ping", timeout=5) as r:
            self.llamadas.append(json.loads(r.read())["app"])
        return self.reabierta

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
                mock.patch.object(web, "mostrar_abierto", return_value={}), \
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

    def test_mientras_termina_el_segundo_doble_clic_espera_y_se_abre_normalmente(self):
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        srv.app.ventana, srv.app.cerrando = VentanaFalsa(f"http://127.0.0.1:{puerto}/"), True
        self.assertEqual(web.mostrar_abierto(puerto), {"mostrada": False, "cerrando": True})
        threading.Timer(1.0, lambda: (srv.shutdown(), srv.server_close())).start()  # el programa termina
        t0 = time.monotonic()
        with mock.patch.object(navegador, "buscar_navegador", return_value="chrome"), \
                mock.patch.object(navegador, "VentanaPrograma", VentanaFalsa):
            self.assertEqual(web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto)]), 0)
        self.assertGreater(time.monotonic() - t0, 0.9)  # esperó que el anterior soltara el puerto
        self.assertEqual(VentanaFalsa.creadas[-1].llamadas, ["contasii", "cerrar"])  # y atendió su ventana

    def test_si_otro_doble_clic_ya_lo_abrio_se_muestra_esa_ventana(self):
        # Mientras el anterior termina, otro doble clic ya levantó el programa: se pide mostrar su ventana en vez
        # de esperar 20 s y abrir una segunda.
        with mock.patch.object(web, "ya_abierto", return_value=True), \
                mock.patch.object(web, "mostrar_abierto", side_effect=[{"mostrada": False, "cerrando": True},
                                                                       {"mostrada": True}]), \
                mock.patch.object(navegador, "VentanaPrograma", VentanaFalsa):
            t0 = time.monotonic()
            self.assertEqual(web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto_libre())]), 0)
        self.assertLess(time.monotonic() - t0, 5)
        self.assertEqual(VentanaFalsa.creadas, [])

    def test_doble_clic_mientras_la_ventana_aparece_no_abre_otra(self):
        # El programa anterior terminaba (responde «cerrando»); otro doble clic ya lo abrió de nuevo y su Chrome
        # todavía no muestra la página. Quien espera no abre una segunda ventana: la que arranca aparecerá sola.
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        nueva = srv.app.ventana = VentanaFalsa(f"http://127.0.0.1:{puerto}/")
        nueva.arrancando = True
        real, respuestas = web.mostrar_abierto, []

        def mostrar(p):
            respuestas.append({"mostrada": False, "cerrando": True} if not respuestas else real(p))
            return respuestas[-1]
        with mock.patch.object(web, "mostrar_abierto", mostrar), \
                mock.patch.object(navegador, "VentanaPrograma", VentanaFalsa):
            self.assertEqual(web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto)]), 0)
        self.assertEqual(respuestas[-1], {"mostrada": True, "abriendo": True})
        self.assertEqual(VentanaFalsa.creadas, [nueva])  # ninguna ventana más
        self.assertEqual(nueva.llamadas, [])  # ni se trajo al frente ni se dio por reabierta

    def test_dos_doble_clic_simultaneos_dejan_un_solo_programa(self):
        # Los dos vieron el puerto libre; el otro lo tomó primero y este quedó en el siguiente. Este no se queda
        # abierto: usa el programa del otro, cuya ventana está apareciendo.
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        otra = srv.app.ventana = VentanaFalsa(f"http://127.0.0.1:{puerto}/")
        otra.arrancando = True
        real, vistas, propios = web.ya_abierto, [], []

        def ya_abierto(p, timeout=1):
            vistas.append(p)
            return False if len(vistas) == 1 else real(p, timeout)  # la primera consulta llegó antes que el otro

        def servidor(*a, **k):
            propios.append(web_servidor(*a, **k))
            return propios[-1]
        web_servidor = web.servidor
        with mock.patch.object(web, "ya_abierto", ya_abierto), mock.patch.object(web, "servidor", servidor), \
                mock.patch.object(navegador, "buscar_navegador", return_value="chrome"), \
                mock.patch.object(navegador, "VentanaPrograma", VentanaFalsa):
            self.assertEqual(web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto)]), 0)
        self.assertEqual(VentanaFalsa.creadas, [otra])  # no se abrió una segunda ventana
        (propio, p), = propios
        self.assertNotEqual(p, puerto)
        self.assertEqual(propio.socket.fileno(), -1)  # y su servidor se cerró: no queda un segundo programa

    def test_si_el_puerto_queda_libre_y_otro_lo_toma_se_le_pregunta(self):
        # Dos esperan a que el anterior termine. Este ve el puerto libre, pero el otro lo toma un instante después
        # (su Chrome recién arranca): no se le abre una ventana sin preguntar; se arranca, se cede y se le pregunta.
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        otra = srv.app.ventana = VentanaFalsa(f"http://127.0.0.1:{puerto}/")
        otra.arrancando = True
        real_ya, real_mostrar, n = web.ya_abierto, web.mostrar_abierto, collections.Counter()

        def ya_abierto(p, timeout=1):
            n["ya"] += 1
            return False if n["ya"] == 2 else real_ya(p, timeout)  # 2.ª consulta: el anterior acaba de soltarlo

        def mostrar(p):
            n["mostrar"] += 1
            return {"mostrada": False, "cerrando": True} if n["mostrar"] == 1 else real_mostrar(p)
        with mock.patch.object(web, "ya_abierto", ya_abierto), mock.patch.object(web, "mostrar_abierto", mostrar), \
                mock.patch.object(navegador, "buscar_navegador", return_value="chrome"), \
                mock.patch.object(navegador, "VentanaPrograma", VentanaFalsa):
            self.assertEqual(web.main(["--carpeta", self.tmp.name, "--puerto", str(puerto)]), 0)
        self.assertEqual(VentanaFalsa.creadas, [otra])  # ninguna ventana más
        self.assertEqual(n["mostrar"], 2)  # se le preguntó al programa que tomó el puerto

    def test_la_pagina_pedida_marca_la_ventana_como_aparecida(self):
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        v = object.__new__(navegador.VentanaPrograma)  # Chrome sin control: sin DevToolsActivePort
        v.url, v.perfil, v.proc, v.reabierta, v.vista = f"http://127.0.0.1:{puerto}/", self.tmp.name, ProcesoFalso(None), 0.0, None
        v.t_lanz, v.t_reloj, v._t_fin = time.monotonic(), time.time(), None
        srv.app.ventana = v
        self.assertEqual(web.mostrar_abierto(puerto), {"mostrada": True, "abriendo": True})
        with urllib.request.urlopen(v.url, timeout=5) as r:  # la ventana aparece y pide la página
            self.assertIn(b"<html", r.read()[:200].lower())
        # Ya apareció: si no se puede traer al frente (sin control, o la persona la cerró), quien llamó abre otra.
        self.assertEqual(web.mostrar_abierto(puerto), {"mostrada": False})

    def test_un_puerto_en_uso_no_se_comparte(self):
        # En Windows, SO_REUSEADDR permitía abrir un segundo servidor en el mismo puerto: dos programas a la vez.
        primero, puerto = web.servidor(self.tmp.name, puerto_libre())
        self.addCleanup(primero.server_close)
        segundo, otro = web.servidor(self.tmp.name, puerto)
        self.addCleanup(segundo.server_close)
        self.assertNotEqual(otro, puerto)

    def test_al_reabrir_se_usa_el_mismo_puerto(self):
        # Cerrar y volver a abrir enseguida usa el mismo puerto (las conexiones recién cerradas no lo bloquean), así
        # la ventana conserva lo que recuerda (opciones del F29, último mes visto), que Chrome guarda por dirección.
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        for _ in range(3):
            self.assertTrue(web.ya_abierto(puerto))  # el servidor cierra cada conexión: quedan en TIME_WAIT
        srv.shutdown()
        srv.server_close()
        nuevo, otro = web.servidor(self.tmp.name, puerto)
        nuevo.server_close()
        self.assertEqual(otro, puerto)

    def test_api_ventana_sin_ventana(self):
        srv, puerto = web.servidor(self.tmp.name, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        self.assertFalse(web.mostrar_abierto(puerto).get("mostrada"))  # con --no-abrir no hay ventana que mostrar
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
        v.proc, v.reabierta, v.vista, v.perfil = ProcesoFalso(codigo), 0.0, None, tempfile.mkdtemp()
        v.url = "http://127.0.0.1:1/"
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
        # control listo, y la ventana vive en el otro, que tiene tomado el perfil. El programa sigue atendiendo.
        with mock.patch.object(navegador.VentanaPrograma, "_perfil_tomado", return_value=True):
            for codigo in (0, 21):
                self.assertFalse(self.esperar(self.ventana(codigo, 0), 1), codigo)

    def test_chrome_que_se_cayo_al_abrir_no_deja_el_programa_vivo(self):
        # Terminó enseguida sin control y nadie tiene tomado el perfil: no hay ventana; el programa termina.
        with mock.patch.object(navegador.VentanaPrograma, "_perfil_tomado", return_value=False):
            self.assertTrue(self.esperar(self.ventana(1, 0), 3))

    def test_abriendo(self):
        v = self.ventana(None, 1)  # Chrome lanzado hace 1 s, sin página todavía
        self.assertTrue(v.abriendo())
        v.vista = time.monotonic()  # ya mostró su página
        self.assertFalse(v.abriendo())
        v.marcar_reapertura()  # otro doble clic abre una ventana nueva: mientras no se vea, está abriéndose
        self.assertTrue(v.abriendo())
        v.vista = v.reabierta  # la página vieja se vio en el mismo instante del reloj (Windows mide de a ~16 ms)
        self.assertTrue(v.abriendo())
        self.assertFalse(self.ventana(None, 61).abriendo())  # pasó el plazo de arranque
        with mock.patch.object(navegador.VentanaPrograma, "_perfil_tomado", return_value=False):
            self.assertFalse(self.ventana(1, 1).abriendo())  # Chrome se cayó: no viene ninguna ventana
        with mock.patch.object(navegador.VentanaPrograma, "_perfil_tomado", return_value=True):
            self.assertTrue(self.ventana(0, 1).abriendo())  # entregó la orden a otro Chrome con el perfil

    def test_abriendo_hasta_que_se_pide_la_pagina(self):
        # Sin control de Chrome (política del equipo) la página nunca aparece en su lista; la señal es que la ventana
        # la pide al servidor. Un Chrome que arranca lento, en cambio, se sigue esperando el plazo completo.
        for sistema in ("darwin", "win32", "linux"):
            with mock.patch.object(navegador.sys, "platform", sistema):
                v = self.ventana(None, 40)
                self.assertTrue(v.abriendo(), sistema)
                v.pagina_pedida()
                self.assertFalse(v.abriendo(), sistema)
                v.marcar_reapertura()  # en Mac, con Chrome vivo sin ventanas, otro doble clic pide una ventana
                self.assertTrue(v.abriendo(), sistema)
                self.assertFalse(self.ventana(None, 61).abriendo(), sistema)

    @unittest.skipIf(sys.platform == "win32", "el candado de Chrome en Windows es otro archivo")
    def test_candado_del_perfil(self):
        v = self.ventana(0, 0)
        self.assertFalse(v._perfil_tomado())
        os.symlink(f"equipo-{os.getpid()}", os.path.join(v.perfil, "SingletonLock"))
        self.assertTrue(v._perfil_tomado())  # el dueño del candado está vivo
        os.remove(os.path.join(v.perfil, "SingletonLock"))
        os.symlink("equipo-999999999", os.path.join(v.perfil, "SingletonLock"))
        self.assertFalse(v._perfil_tomado())  # candado viejo de un Chrome que ya no existe


@unittest.skipUnless(hay_chrome(), "no hay Google Chrome en este computador")
class TestVentanaReal(unittest.TestCase):
    def sin_paginas(self, v, seg=15):
        limite = time.monotonic() + seg
        while v.paginas() and time.monotonic() < limite:
            time.sleep(0.1)
        self.assertEqual(v.paginas(), [])

    def test_abre_en_modo_aplicacion_y_detecta_el_cierre(self):
        tmp, perfil = tempfile.mkdtemp(), tempfile.mkdtemp()
        srv, puerto = web.servidor(tmp, puerto_libre())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{puerto}/"
        v = srv.app.ventana = navegador.VentanaPrograma(url, perfil=perfil, headless=True)
        try:
            # Doble clic mientras Chrome recién arranca: el programa responde que la ventana está apareciendo.
            self.assertEqual(web.mostrar_abierto(puerto), {"mostrada": True, "abriendo": True})
            limite = time.monotonic() + 60  # primera apertura de Chrome en frío
            while not v.paginas() and time.monotonic() < limite:
                time.sleep(0.2)
            self.assertEqual([p["url"] for p in v.paginas()], [url])
            self.assertEqual(web.mostrar_abierto(puerto), {"mostrada": True})
            cerrada = threading.Event()
            # Consultas cada 2 s: hay tiempo para el segundo doble clic entre que la página se va y el programa
            # decide que la ventana se cerró (dos consultas vacías seguidas).
            threading.Thread(target=lambda: (v.esperar_cierre(intervalo=2, inicio=10), cerrada.set()),
                             daemon=True).start()
            time.sleep(1)
            self.assertFalse(cerrada.is_set())  # con la ventana abierta, el programa sigue
            base = f"http://127.0.0.1:{v._devtools()}"
            for p in v.paginas():  # la persona cierra la ventana
                urllib.request.urlopen(f"{base}/json/close/{p['id']}", timeout=5).read()
            self.sin_paginas(v)  # Chrome cierra la página después de responder «Target is closing»
            # ...y vuelve a hacer doble clic enseguida: el nuevo proceso avisa que abrirá otra ventana.
            self.assertFalse(web.mostrar_abierto(puerto).get("mostrada"))
            # Un tercer doble clic mientras aparece esa ventana no pide otra más.
            self.assertEqual(web.mostrar_abierto(puerto), {"mostrada": True, "abriendo": True})
            time.sleep(2)
            self.assertFalse(cerrada.is_set())  # mientras aparece la ventana nueva, el programa no se apaga
            urllib.request.urlopen(urllib.request.Request(f"{base}/json/new?{url}", method="PUT"), timeout=5).read()
            time.sleep(3)  # la ve en una consulta
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
