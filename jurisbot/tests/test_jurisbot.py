"""Pruebas. Ejecutar desde la carpeta jurisbot/:  python -m unittest -v

Todos los textos de prueba son FICTICIOS: no reproducen sentencias ni dictámenes
reales, y sus roles y números son inventados para probar el código.
"""
import json
import sys
import tempfile
import threading
import unittest
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jurisbot import db, suscripciones as sus  # noqa: E402
from jurisbot.clasificar import clasificar, extraer_normas, extraer_rol, normalizar  # noqa: E402
from jurisbot.clasificar_ia import ClasificacionIA, clasificar_con_claude, validar  # noqa: E402
from jurisbot.fuentes.base import ConfigFuente, Recolector, Respuesta  # noqa: E402
from jurisbot.importar import desde_carpeta, desde_manifiesto  # noqa: E402
from jurisbot.modelo import Documento  # noqa: E402
from jurisbot.texto import extraer_enlaces, html_a_texto  # noqa: E402

LABORAL_MUNICIPAL = """TEXTO FICTICIO DE PRUEBA.
Santiago, Rol N° 99.999-2099. Se deduce recurso de unificación de jurisprudencia en
juicio sobre relación laboral entre una persona contratada a honorarios y la
Municipalidad. El trabajador alega subordinación y dependencia y la nulidad del despido.
Se invocan los artículos 7 y 162 del Código del Trabajo, la Ley N° 18.883 y la
Ley 18.695, además del artículo 19 N° 16 de la Constitución Política.
El alcalde sostuvo que el vínculo se rige por el Estatuto Administrativo."""

TRIBUTARIO = """TEXTO FICTICIO DE PRUEBA. Circular de ejemplo sobre IVA: el contribuyente
podrá usar el crédito fiscal según el Decreto Ley N° 825 y el artículo 23 del
Código Tributario. El Servicio de Impuestos Internos instruye sobre la factura electrónica."""


class Clasificador(unittest.TestCase):
    def test_materias_laboral_municipal(self):
        m = clasificar(LABORAL_MUNICIPAL)
        self.assertIn("laboral", m)
        self.assertIn("municipal", m)
        self.assertNotIn("tributario", m)

    def test_tributario(self):
        self.assertEqual(clasificar(TRIBUTARIO)[0], "tributario")

    def test_texto_sin_materia(self):
        self.assertEqual(clasificar("Texto breve sin términos jurídicos."), [])

    def test_repetir_un_termino_no_basta(self):
        self.assertEqual(clasificar("despido " * 30), [])

    def test_normalizar_quita_tildes_y_numero(self):
        self.assertEqual(normalizar("Ley N° 18.695 Organización"), "ley 18.695 organizacion")

    def test_extraer_normas_literalmente(self):
        n = extraer_normas(LABORAL_MUNICIPAL)
        self.assertIn("Ley N° 18.883", n)
        self.assertIn("Ley N° 18.695", n)
        self.assertIn("Art. 162 Código del Trabajo", n)
        self.assertIn("Art. 19 N° 16 Constitución Política", n)
        self.assertIn("D.L. N° 825", extraer_normas(TRIBUTARIO))
        self.assertIn("Art. 23 Código Tributario", extraer_normas(TRIBUTARIO))

    def test_no_inventa_normas(self):
        self.assertEqual(extraer_normas("Sin referencias normativas."), [])

    def test_rol(self):
        self.assertEqual(extraer_rol(LABORAL_MUNICIPAL), "99.999-2099")
        self.assertEqual(extraer_rol("sin rol"), "")


class ValidacionIA(unittest.TestCase):
    def test_descarta_normas_y_materias_inventadas(self):
        r = ClasificacionIA(materias=["laboral", "inventada"],
                            normas_citadas=["Ley N° 18.883", "Ley N° 12.345"],
                            resumen="x", decision="no consta", calidad_texto="completo")
        limpio, descartes = validar(r, LABORAL_MUNICIPAL)
        self.assertEqual(limpio.materias, ["laboral"])
        self.assertEqual(limpio.normas_citadas, ["Ley N° 18.883"])
        self.assertEqual(len(descartes), 2)

    def test_llamada_con_cliente_simulado(self):
        class Resp:
            stop_reason = "end_turn"
            parsed_output = ClasificacionIA(materias=["municipal"], normas_citadas=["Ley 18.695"],
                                            resumen="r", decision="acoge", calidad_texto="completo")

        class Mensajes:
            def parse(self, **kw):
                self.kw = kw
                return Resp()

        class Cliente:
            messages = Mensajes()

        c = Cliente()
        r, desc = clasificar_con_claude(LABORAL_MUNICIPAL, cliente=c)
        self.assertEqual(r.materias, ["municipal"])
        self.assertEqual(desc, [])
        self.assertEqual(c.messages.kw["model"], "claude-opus-5-5")

    def test_rechaza_documento_demasiado_largo(self):
        with self.assertRaises(ValueError):
            clasificar_con_claude("x" * 400_001, cliente=object())


class BaseDatos(unittest.TestCase):
    def setUp(self):
        self.con = db.conectar(":memory:")

    def doc(self, **kw):
        base = dict(fuente="cs", tipo="sentencia", identificador="99.999-2099", fecha="2099-01-15",
                    titulo="Prueba", texto=LABORAL_MUNICIPAL, materias=["laboral", "municipal"])
        base.update(kw)
        return Documento(**base)

    def test_guardar_y_buscar(self):
        self.assertEqual(db.guardar(self.con, self.doc()), "nuevo")
        self.assertEqual(db.guardar(self.con, self.doc(materias=[])), "sin_cambios")
        r = db.buscar(self.con, texto="subordinacion")  # sin tilde también encuentra
        self.assertEqual(len(r), 1)
        self.assertNotIn("texto", r[0])
        self.assertEqual(len(db.buscar(self.con, materias=["municipal"])), 1)
        self.assertEqual(len(db.buscar(self.con, materias=["tributario"])), 0)
        self.assertEqual(len(db.buscar(self.con, fuentes=["sii"])), 0)

    def test_consulta_con_caracteres_especiales(self):
        db.guardar(self.con, self.doc())
        db.buscar(self.con, texto='"honorarios AND (')  # no debe lanzar error de sintaxis FTS

    def test_texto_nuevo_invalida_verificacion(self):
        d = self.doc()
        db.guardar(self.con, d)
        db.marcar_verificacion(self.con, d.clave, "verificado_fuente_oficial")
        db.guardar(self.con, self.doc(texto=LABORAL_MUNICIPAL + " Texto modificado."))
        self.assertEqual(db.obtener(self.con, d.clave)["verificacion"], "sin_verificar")

    def test_fuente_invalida(self):
        with self.assertRaises(ValueError):
            Documento(fuente="xx", tipo="sentencia", identificador="1")


class Suscripciones(unittest.TestCase):
    def setUp(self):
        self.con = db.conectar(":memory:")
        db.guardar(self.con, Documento(fuente="cgr", tipo="dictamen", identificador="E000000-2099",
                                       texto=LABORAL_MUNICIPAL, materias=["municipal"],
                                       resumen="resumen IA"))

    def test_plan_gratis_recorta_y_retrasa(self):
        clave = sus.crear_usuario(self.con, "a@ejemplo.cl")
        u = sus.usuario_por_clave(self.con, clave)
        self.assertEqual(u["plan"], "gratis")
        corte = sus.corte_ingreso("gratis")
        self.assertEqual(db.buscar(self.con, ingresado_hasta=corte), [])  # recién ingresado: oculto
        d = sus.recortar(db.obtener(self.con, "cgr:dictamen:E000000-2099"), "gratis")
        self.assertNotIn("texto", d)
        self.assertEqual(d["resumen"], "")

    def test_plan_vencido_vuelve_a_gratis(self):
        sus.crear_usuario(self.con, "b@ejemplo.cl")
        sus.activar_plan(self.con, "b@ejemplo.cl", "profesional", "2099-12-31")
        clave = self.con.execute("SELECT api_key FROM usuarios").fetchone()[0]
        self.assertEqual(sus.usuario_por_clave(self.con, clave, hoy=date(2099, 6, 1))["plan"], "profesional")
        self.assertEqual(sus.usuario_por_clave(self.con, clave, hoy=date(2100, 1, 1))["plan"], "gratis")

    def test_limite_diario(self):
        clave = sus.crear_usuario(self.con, "c@ejemplo.cl")
        u = sus.usuario_por_clave(self.con, clave)
        for _ in range(sus.PLANES["gratis"]["consultas_dia"]):
            sus.registrar_consulta(self.con, u)
        with self.assertRaises(sus.LimiteExcedido):
            sus.registrar_consulta(self.con, u)

    def test_alertas_y_boletin(self):
        clave = sus.crear_usuario(self.con, "d@ejemplo.cl", "profesional")
        u = sus.usuario_por_clave(self.con, clave)
        sus.crear_alerta(self.con, u, "Municipal", fuentes=["cgr"], materias=["municipal"])
        self.con.execute("UPDATE alertas SET ultimo_envio = '2000-01-01T00:00:00+00:00'")
        entrega = sus.boletin(self.con, u)
        self.assertEqual(len(entrega[0]["documentos"]), 1)
        texto = sus.boletin_texto(entrega)
        self.assertIn("[sin verificar]", texto)
        self.assertIn("generado por IA", texto)
        self.assertEqual(sus.boletin(self.con, u)[0]["documentos"], [])  # ya enviado

    def test_plan_gratis_sin_alertas(self):
        u = sus.usuario_por_clave(self.con, sus.crear_usuario(self.con, "e@ejemplo.cl"))
        with self.assertRaises(sus.LimiteExcedido):
            sus.crear_alerta(self.con, u, "x")


class Recoleccion(unittest.TestCase):
    INDICE = """<html><body><table>
      <tr><td><a href="circu1.pdf">Circular N° 1 de prueba</a></td></tr>
      <tr><td><a href="/normativa/circulares/2099/circu2.htm">Circular N° 2 de prueba</a></td></tr>
      <tr><td><a href="/otra/cosa.htm">No es circular</a></td></tr>
    </table></body></html>"""

    def config(self, verificado=True):
        return ConfigFuente(clave="sii", nombre="SII prueba", tipo="circular", estrategia="indice_enlaces",
                            verificado=verificado, url_indice="https://ejemplo.invalid/circulares/{anio}/ind.htm",
                            patron_enlace=r"/circulares/\d{4}/(?P<id>circu\d+)\.(?:pdf|htm)")

    def descargar(self, url):
        self.pedidas.append(url)
        if url.endswith("ind.htm"):
            return Respuesta(url, "text/html; charset=utf-8", self.INDICE.encode())
        return Respuesta(url, "text/html", f"<p>{TRIBUTARIO}</p>".encode())

    def setUp(self):
        self.pedidas = []

    def test_recolecta_solo_enlaces_que_calzan(self):
        r = Recolector(self.config(), descargar=self.descargar, permitido=lambda u: True, dormir=lambda s: None)
        docs = list(r.recolectar([2099]))
        self.assertEqual([d.identificador for d in docs], ["circu1", "circu2"])
        self.assertIn("crédito fiscal", docs[0].texto)

    def test_configuracion_no_verificada_exige_forzar(self):
        r = Recolector(self.config(False), descargar=self.descargar, permitido=lambda u: True)
        with self.assertRaises(PermissionError):
            list(r.recolectar([2099]))

    def test_respeta_robots(self):
        r = Recolector(self.config(), descargar=self.descargar, permitido=lambda u: False, dormir=lambda s: None)
        self.assertEqual(list(r.recolectar([2099])), [])
        self.assertEqual(self.pedidas, [])

    def test_omite_existentes(self):
        r = Recolector(self.config(), descargar=self.descargar, permitido=lambda u: True, dormir=lambda s: None)
        docs = list(r.recolectar([2099], omitir=lambda i: i == "circu1"))
        self.assertEqual([d.identificador for d in docs], ["circu2"])

    def test_fuente_manual(self):
        c = ConfigFuente(clave="cs", nombre="CS", tipo="sentencia", estrategia="manual")
        with self.assertRaises(NotImplementedError):
            list(Recolector(c).recolectar([2099]))

    def test_html(self):
        self.assertEqual(html_a_texto("<p>Hola</p><script>x()</script><p>mundo</p>"), "Hola\n\nmundo")
        enl = extraer_enlaces('<a href="b.pdf">B</a>', "https://x.invalid/a/")
        self.assertEqual(enl, [("https://x.invalid/a/b.pdf", "B")])


class Importacion(unittest.TestCase):
    def test_manifiesto_y_carpeta(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "s1.txt").write_text(LABORAL_MUNICIPAL, encoding="utf-8")
            (t / "m.csv").write_text("archivo,fuente,tipo,identificador,fecha,url,titulo\n"
                                     "s1.txt,cs,sentencia,,2099-01-15,,Prueba\n", encoding="utf-8")
            docs = list(desde_manifiesto(t, t / "m.csv"))
            self.assertEqual(docs[0].identificador, "99.999-2099")  # tomado del texto
            docs = list(desde_carpeta(t, "cs", "sentencia"))
            self.assertEqual(len(docs), 1)  # el CSV no se importa como documento
            with self.assertRaises(ValueError):
                list(desde_carpeta(t, "cs", "circular"))

    def test_fecha_invalida(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "s1.txt").write_text("x", encoding="utf-8")
            (t / "m.csv").write_text("archivo,fuente,tipo,identificador,fecha,url,titulo\n"
                                     "s1.txt,cgr,dictamen,1,15/01/2099,,\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                list(desde_manifiesto(t, t / "m.csv"))


class Servidor(unittest.TestCase):
    def test_api(self):
        from http.server import ThreadingHTTPServer
        from jurisbot.servidor import crear_manejador
        with tempfile.TemporaryDirectory() as t:
            ruta = str(Path(t) / "p.db")
            con = db.conectar(ruta)
            db.guardar(con, Documento(fuente="cs", tipo="sentencia", identificador="99.999-2099",
                                      texto=LABORAL_MUNICIPAL, materias=["laboral"]))
            clave = sus.crear_usuario(con, "f@ejemplo.cl", "profesional")
            gratis = sus.crear_usuario(con, "g@ejemplo.cl")
            con.close()
            srv = ThreadingHTTPServer(("127.0.0.1", 0), crear_manejador(ruta))
            hilo = threading.Thread(target=srv.serve_forever, daemon=True)
            hilo.start()
            base = f"http://127.0.0.1:{srv.server_address[1]}"

            def get(ruta, k=None):
                req = urllib.request.Request(base + ruta, headers={"X-API-Key": k} if k else {})
                try:
                    with urllib.request.urlopen(req) as r:
                        return r.status, json.loads(r.read())
                except urllib.error.HTTPError as e:
                    return e.code, json.loads(e.read())
            try:
                self.assertEqual(get("/api/buscar?q=honorarios")[0], 401)
                s, r = get("/api/buscar?q=honorarios&materia=laboral", clave)
                self.assertEqual((s, len(r["resultados"])), (200, 1))
                s, r = get("/api/buscar?q=honorarios", gratis)
                self.assertEqual((s, r["resultados"]), (200, []))  # retraso del plan gratis
                self.assertEqual(get("/api/catalogo")[0], 200)
            finally:
                srv.shutdown()
                srv.server_close()


if __name__ == "__main__":
    unittest.main()
