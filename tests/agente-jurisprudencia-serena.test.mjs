// Tests del agente Jurisprudencia C.A. La Serena
// (agente-jurisprudencia-serena/).
//
// 1. Unitarios de jurisprudencia.mjs con páginas REALES de pjud.cl
//    (tests/fixtures/jurisprudencia-serena/*.real-2026-10-25.html, recortadas
//    al contenido de la noticia).
// 2. El CLI real (Chromium + Playwright) contra un servidor local que imita
//    las tres rutas que usa el agente: la página de noticias, el POST de
//    filtros y cada nota.
//
// Uso: node tests/agente-jurisprudencia-serena.test.mjs   (o desde tests/run.sh)

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { strict as assert } from "node:assert";
import * as J from "../agente-jurisprudencia-serena/jurisprudencia.mjs";

const run = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "agente-jurisprudencia-serena", "reporte.mjs");
const VALIDAR = join(ROOT, "agente-jurisprudencia-serena", "validar-carrusel.mjs");
const DIR = join(__dirname, "fixtures", "jurisprudencia-serena");
const fixture = (nombre) => readFileSync(join(DIR, nombre), "utf8");
const LISTA = fixture("lista-fallos.real-2026-10-25.html");
const RECHAZO = fixture("rechazada.real-2026-10-25.html");
const CAPTCHA = fixture("verificacion-humana.sintetico.html");
const noticiaHtml = (id) => fixture(`noticia-${id}.real-2026-10-25.html`);
const items = J.parsearLista(LISTA).items;
const ficha = (id) => J.extraerFicha(items.find((x) => x.id === id), J.parsearNoticia(noticiaHtml(id)));

let pass = 0, fail = 0;
async function test(nombre, fn) {
  try { await fn(); pass++; console.log("PASS:", nombre); }
  catch (e) { fail++; console.error("FAIL:", nombre, "\n  ", e.message); }
}

// ---------------------------------------------------------------------------
// Unitarios
// ---------------------------------------------------------------------------

await test("lista real: 69 notas de 2026 con id, título literal y fecha", () => {
  const l = J.parsearLista(LISTA);
  assert.equal(l.estado, "ok");
  assert.equal(l.items.length, 69);
  assert.deepEqual(l.items[0], {
    id: "149552",
    url: "https://www.pjud.cl/prensa-y-comunicaciones/noticias-del-poder-judicial/149552",
    titulo: "Corte de La Serena acoge recurso de protección de estudiante de medicina y ordena medidas para que retome su internado",
    fechaNota: "2026-10-22"
  });
  assert.equal(J.parsearLista(RECHAZO).estado, "rechazada");
  assert.equal(J.parsearLista("<html><body>otra cosa</body></html>").estado, "desconocida");
});

await test("criba por título: solo la Corte; juzgados, TOP y ministros quedan fuera con motivo", () => {
  const tipos = items.map((it) => J.clasificarTitulo(it.titulo).tipo);
  assert.equal(tipos.filter((t) => t === "corte").length, 21);
  assert.equal(tipos.filter((t) => t === "otro").length, 48);
  assert.equal(J.clasificarTitulo("Tren de Aragua: Corte de La Serena confirma condenas por secuestro en Pichidangui").tipo, "corte");
  assert.equal(J.clasificarTitulo("Corte la Serena rechaza recurso de protección y confirma expulsión de capitán de bomberos").tipo, "corte");
  assert.match(J.clasificarTitulo("Ministro Sergio Troncoso condena a carabineros (r) por secuestro calificado").motivo, /Ministro en visita/);
  assert.match(J.clasificarTitulo("TOP de La Serena condena a autores de homicidios en Coquimbo").motivo, /Juicio Oral/);
  assert.match(J.clasificarTitulo("3° Juzgado de Letras de La Serena condena a hospital por falta de servicio").motivo, /Juzgado/);
  assert.match(J.clasificarTitulo("Presidente de la Corte de Apelaciones de La Serena visita tribunales y cárcel de Illapel").motivo, /institucional/);
  assert.match(J.clasificarTitulo("Juzgado de Garantía de Ovalle acoge solicitud y eleva a la Corte de Apelaciones pedido de extradición").motivo, /Juzgado/);
  assert.match(J.clasificarTitulo("Corte Suprema confirma fallo de la Corte de La Serena").motivo, /Corte Suprema/);
  assert.equal(J.clasificarTitulo("Abogados destacan fallo de la Corte de La Serena").tipo, "revisar");
});

await test("ficha 143842: rol, sala, integración, acción y resultado copiados de la nota", () => {
  const f = ficha("143842");
  assert.equal(f.tribunal, "Corte de Apelaciones de La Serena");
  assert.equal(f.sala, "Segunda Sala");
  assert.equal(f.rol, "71-2025");
  assert.equal(f.rolTexto, "causa rol 71-2025");
  assert.equal(f.integracion, "los ministros Cristián Álvarez Mercado, la fiscala judicial Pilar Aravena Gómez y el abogado (i) Jorge Fonseca Dittus");
  assert.equal(f.accion, "recurso de reclamación");
  assert.equal(f.resultado, "rechazó");
  assert.equal(f.votacion, "fallo unánime");
  assert.equal(f.fechaNotaTexto, "07-04-2026");
  assert.equal(f.fechaNotaLiteral, "07-abril-2026");
  assert.equal(f.citas.length, 5);
  assert.ok(f.parrafos[0].startsWith("La Corte de Apelaciones de La Serena rechazó, con costas"));
  assert.ok(f.pendientes.some((p) => /Fecha de la sentencia: la nota no la informa/.test(p)));
  assert.ok(!f.pendientes.some((p) => /^Rol:/.test(p)));
});

await test("ficha 146121: distingue el rol de la Corte del rol del ministro de primera instancia", () => {
  const f = ficha("146121");
  assert.equal(f.rol, "1.069-2025");
  assert.ok(f.otrosRoles.some((r) => /9-2011/.test(r)));
  assert.equal(f.resultado, "elevó");
  assert.ok(f.delicado.includes("homicidio"));
  assert.ok(f.motivos.some((m) => m.puntos === -3));
});

await test("ficha 146289: sin rol en la nota → pendiente [VERIFICAR] y cuidado con el adolescente", () => {
  const f = ficha("146289");
  assert.equal(f.rol, null);
  assert.ok(f.pendientes[0].startsWith("Rol: la nota no lo informa"));
  assert.ok(f.cuidado.includes("adolescente"));
  assert.equal(f.accion, "acción constitucional");
  assert.ok(f.normas.includes("Constitución Política de la República"));
  assert.match(J.fuenteCita(f), /\[VERIFICAR: rol en la OJV\]/);
});

await test("citas con comillas anidadas se copian completas", () => {
  const f = ficha("149032");
  const c = f.citas.find((x) => x.texto.startsWith("la situación personal y médica"));
  assert.ok(c, "falta la cita");
  assert.ok(c.texto.endsWith("tiene una particular protección"), c.texto);
  assert.ok(c.texto.includes("“tercera de edad”"));
});

await test("confirmación con el texto: Corte Suprema, ministro en visita o sin decisión → descartada", () => {
  const base = { titulo: "x", fechaTexto: "", bajada: "" };
  assert.equal(J.confirmarCorte({ ...base, parrafos: ["La Corte Suprema confirmó el fallo de la Corte de Apelaciones de La Serena que acogió…"] }).ok, false);
  assert.equal(J.confirmarCorte({ ...base, parrafos: ["El ministro en visita de la Corte de La Serena condenó a…"] }).ok, false);
  assert.equal(J.confirmarCorte({ ...base, parrafos: ["La Corte de Apelaciones de La Serena realizó una jornada de capacitación."] }).ok, false);
  assert.deepEqual(J.confirmarCorte({ ...base, parrafos: ["La Corte de Apelaciones de La Serena acogió el recurso de protección."] }), { ok: true, verbo: "acogió" });
  assert.equal(J.parsearNoticia(RECHAZO).estado, "rechazada");
  assert.equal(J.parsearNoticia("<html><h1>otra</h1></html>").estado, "desconocida");
});

// Sentencia SINTÉTICA (rol y fecha ficticios) que reproduce las citas de la nota 149489.
function sentenciaSintetica(f, { rol = "Protección-2187-2026", sala = "Primera Sala", ciudad = "La Serena", corte = "Corte de Apelaciones de La Serena" } = {}) {
  return [`${ciudad}, dieciséis de octubre de dos mil veintiséis.`, "VISTOS:",
    "Comparece don (…), en favor de su hijo menor de edad, e interpone recurso de protección en contra de don (…).",
    ...f.citas.map((c, i) => `${i + 1}°) Que, ${c.texto}.`),
    "Y visto lo dispuesto en el artículo 20 de la Constitución Política de la República, SE ACOGE el recurso, sin costas.",
    `Regístrese y archívese. Rol N° ${rol}.`,
    `Pronunciada por la ${sala} de la ${corte}, integrada por los ministros Felipe Pulgar, Marcela Sandoval y Roxana Camus.`].join("\n");
}
const SENTENCIA_149489 = sentenciaSintetica(ficha("149489"));

await test("frases de búsqueda: hasta 3 por fallo, literales, de 6 a 10 palabras, sin muletillas en los bordes", () => {
  const vacias = new Set(["y", "e", "o", "de", "del", "la", "el", "los", "las", "que", "a", "al", "en", "con", "por", "para", "se", "su", "sus", "un", "una", "lo"]);
  for (const f of readdirSync(DIR).filter((n) => n.startsWith("noticia-"))) {
    const fi = ficha(f.match(/\d+/)[0]);
    assert.ok(fi.frasesBusqueda.length >= 1 && fi.frasesBusqueda.length <= 3, f);
    assert.equal(fi.fraseBusqueda, fi.frasesBusqueda[0]);
    for (const fr of fi.frasesBusqueda) {
      const w = fr.split(" ");
      assert.ok(w.length >= 6 && w.length <= 10, `${f}: «${fr}»`);
      assert.ok([fi.bajada, ...fi.parrafos].join(" ").includes(fr), `${f}: frase no literal «${fr}»`);
      assert.ok(!/[–—]/.test(fr), `${f}: incluye un inciso de la prensa`);
      assert.ok(!vacias.has(J.normalizar(w[0])) && !vacias.has(J.normalizar(w[w.length - 1])), `${f}: borde vacío «${fr}»`);
      assert.ok(!/^(que así las cosas|por estas consideraciones|se acoge|se rechaza)/i.test(fr), `${f}: fórmula «${fr}»`);
    }
  }
  const f = ficha("149489");
  assert.ok(f.frasesBusqueda.some((x) => /WhatsApp|chat grupal|reiterativ|delito grave/i.test(x)), JSON.stringify(f.frasesBusqueda));
});

await test("fecha de la sentencia: en letras (como la encabezan los fallos) y en números", () => {
  assert.equal(J.fechaDesdeLetras("La Serena, dieciséis de octubre de dos mil veintiséis."), "2026-10-16");
  assert.equal(J.fechaDesdeLetras("a veintiún días del mes de marzo del año dos mil veinticinco"), "2025-03-21");
  assert.equal(J.fechaDesdeLetras("treinta y uno de diciembre de dos mil veinticuatro"), "2024-12-31");
  assert.equal(J.fechaDesdeLetras("La Serena, primero de junio de dos mil veintiséis"), "2026-06-01");
  assert.equal(J.fechaDesdeLetras("Santiago, 7 de abril de 2026"), "2026-04-07");
  assert.equal(J.fechaDesdeLetras("dictada el 07/04/2026"), "2026-04-07");
  assert.equal(J.fechaDesdeLetras("sin fecha aquí"), null);
  // Con «cerca», prefiere la fecha del encabezado y no una citada en el cuerpo.
  assert.equal(J.fechaDesdeLetras("el 9 de septiembre de 2026 publicó el mensaje. La Serena, veinte de octubre de dos mil veintiséis.", "La Serena,"), "2026-10-20");
});

await test("sentencia: rol, fecha, tribunal y sala; verificación por citas; incorporación", () => {
  const f = ficha("149489");
  const p = J.parsearSentencia(SENTENCIA_149489);
  assert.equal(p.rol, "Protección-2187-2026");
  assert.equal(p.fecha, "2026-10-16");
  assert.equal(p.tribunalLaSerena, true);
  assert.equal(p.sala, "Primera Sala");
  assert.equal(p.esSuprema, false);
  const v = J.verificarSentencia(f, SENTENCIA_149489);
  assert.equal(v.coincide, true, JSON.stringify(v.motivos));
  assert.equal(v.citasCoincidentes, 6);
  assert.equal(v.frasesCoincidentes, 3);
  const g = J.incorporarSentencia(f, SENTENCIA_149489, { fuente: "https://juris.pjud.cl/ejemplo" });
  assert.equal(g.rol, "Protección-2187-2026");
  assert.equal(g.fechaSentencia, "2026-10-16");
  assert.equal(g.rolFuente, "https://juris.pjud.cl/ejemplo");
  assert.deepEqual([g.rolVerificacion.citasCoincidentes, g.rolVerificacion.totalCitas], [6, 6]);
  assert.ok(!g.pendientes.some((x) => /^Rol:|^Fecha de la sentencia/.test(x)));
  // Rechazos: otra ficha, Corte Suprema, otra sala, texto sin rol, rol distinto al de la nota.
  assert.throws(() => J.incorporarSentencia(ficha("149032"), SENTENCIA_149489, { fuente: "x" }), /Ninguna de las 11 citas/);
  const suprema = "Santiago, veinte de octubre de dos mil veintiséis. Corte Suprema. Rol N° 45.678-2026. VISTOS: Se trae a la vista el recurso de apelación contra la sentencia de la Corte de Apelaciones de La Serena. "
    + f.citas[0].texto + ". Se confirma la sentencia apelada.";
  assert.throws(() => J.incorporarSentencia(f, suprema, { fuente: "x" }), /encabezado es de la Corte Suprema/);
  assert.throws(() => J.incorporarSentencia(f, sentenciaSintetica(f, { sala: "Segunda Sala" }), { fuente: "x" }), /sala del texto \(Segunda Sala\) no coincide/);
  assert.throws(() => J.incorporarSentencia(f, SENTENCIA_149489.replace(/Rol N° [^.]+\./, ""), { fuente: "x" }), /No encontré un rol/);
  const conRol = ficha("143842");
  assert.throws(() => J.incorporarSentencia(conRol, sentenciaSintetica(conRol, { rol: "Protección-5555-2026", sala: "Segunda Sala" }), { fuente: "x" }), /no coincide con el que informa la nota \(71-2025\)/);
  // Mismo rol que la nota: se incorpora la fecha y la verificación.
  const ok = J.incorporarSentencia(conRol, sentenciaSintetica(conRol, { rol: "71-2025", sala: "Segunda Sala" }), { fuente: "x" });
  assert.equal(ok.rol, "71-2025");
  assert.equal(ok.fechaSentencia, "2026-10-16");
});

await test("rol: registro manual con fuente obligatoria", () => {
  for (const f of readdirSync(DIR).filter((n) => n.startsWith("noticia-"))) {
    const fi = ficha(f.match(/\d+/)[0]);
    assert.ok(fi.fraseBusqueda && fi.fraseBusqueda.split(" ").length >= 6, f);
    assert.ok([fi.bajada, ...fi.parrafos].join(" ").includes(fi.fraseBusqueda), `${f}: frase no literal «${fi.fraseBusqueda}»`);
    assert.ok(!/[–—]/.test(fi.fraseBusqueda), `${f}: incluye un inciso de la prensa`);
  }
  const f = ficha("149489");
  assert.match(f.pendientes[0], /obligatorio para publicar/);
  assert.throws(() => J.aplicarRol(f, { rol: "sin número", fuente: "OJV" }), /formato no reconocido/);
  assert.throws(() => J.aplicarRol(f, { rol: "Protección-9999-2026", fuente: "" }), /Falta la fuente/);
  const g = J.aplicarRol(f, { rol: "Rol N° Protección-9999-2026", fuente: "https://juris.pjud.cl/ejemplo", fechaSentencia: "2026-10-16" });
  assert.equal(g.rol, "Protección-9999-2026");
  assert.equal(g.rolFuente, "https://juris.pjud.cl/ejemplo");
  assert.equal(g.puntaje, f.puntaje + 1);
  assert.ok(!g.pendientes.some((p) => /^Rol:|^Fecha de la sentencia/.test(p)));
  assert.match(J.fuenteCita(g), /Rol Protección-9999-2026/);
  const conRol = J.extraerFicha(items.find((x) => x.id === "149489"), {
    ...J.parsearNoticia(noticiaHtml("149489")),
    parrafos: ["En fallo unánime (causa rol Protección-1234-2026), la Primera Sala del tribunal de alzada acogió el recurso."]
  });
  assert.equal(conRol.rol, "Protección-1234-2026", "rol de 4 dígitos sin punto");
  const doc = J.parsearNoticia(noticiaHtml("149489").replace("</body>",
    '<a href="/prensa-y-comunicaciones/docs/download/119467">Descargar sentencia</a></body>'));
  assert.equal(doc.documento, "https://www.pjud.cl/prensa-y-comunicaciones/docs/download/119467");
});

await test("verificación humana (CAPTCHA): se reconoce en la lista y en la nota", () => {
  assert.equal(J.esVerificacionHumana(CAPTCHA), true);
  assert.equal(J.parsearLista(CAPTCHA).estado, "verificacion");
  assert.equal(J.parsearNoticia(CAPTCHA).estado, "verificacion");
  assert.equal(J.esVerificacionHumana(noticiaHtml("149032")), false);
});

await test("páginas guardadas: fecha literal en español y número de la nota", () => {
  assert.equal(J.fechaDesdeLiteral("22-octubre-2026"), "2026-10-22");
  assert.equal(J.fechaDesdeLiteral("7 de abril de 2026"), "2026-04-07");
  assert.equal(J.fechaDesdeLiteral("sin fecha"), null);
  assert.equal(J.idDesdeHtml(noticiaHtml("146289")), "146289");
  assert.equal(J.idDesdeHtml('<a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fwww.pjud.cl%2Fprensa-y-comunicaciones%2Fnoticias-del-poder-judicial%2F149552">'), "149552");
  assert.equal(J.idDesdeHtml("<p>nada</p>", "nota-149489.html"), "149489");
});

await test("puntaje: Choapa y municipal suben; los motivos muestran las palabras tal como están en la nota", () => {
  const f = { titulo: "Corte de La Serena acoge recurso contra municipalidad", bajada: "", accion: "recurso de protección",
    resultado: "acogió", rol: "123-2026", citas: [], parrafos: ["La Corte de Apelaciones de La Serena acogió el recurso de protección de una feriante de Los Vilos contra la Municipalidad por el fármaco…"] };
  const p = J.puntuar(f);
  assert.ok(p.temas.some((t) => t.id === "territorio" && t.palabras.includes("Los Vilos")));
  assert.ok(p.temas.some((t) => t.id === "municipal"));
  assert.ok(p.temas.some((t) => t.id === "salud" && t.palabras.includes("fármaco")));
  assert.equal(p.puntaje, 5 + 4 + 3 + 2 + 1 + 1);
});

await test("recomendados: puntaje mínimo, máximo 3, el más alto primero", () => {
  const fichas = ["143842", "145899", "146121", "146289", "147076", "147635", "149032", "149489"].map(ficha);
  const r = J.elegirRecomendados(fichas);
  assert.equal(r.length, 3);
  assert.equal(r[0], "149032");
  assert.ok(!r.includes("146121") && !r.includes("147635"), "los delicados con poco puntaje no se recomiendan");
});

await test("período: los N días completos anteriores a hoy", () => {
  assert.deepEqual(J.periodoAnterior("2026-10-26", 7), { desde: "2026-10-19", hasta: "2026-10-25" });
  assert.deepEqual(J.periodoAnterior("2026-03-01", 1), { desde: "2026-02-28", hasta: "2026-02-28" });
});

// Carrusel válido para 149032: cifras, organismos y cita salen de la ficha.
function specValido() {
  const s = J.specBase(ficha("149032"));
  s.slides[0].titulo = "¿Te dejaron sin tratamiento por un error del sistema?";
  s.slides[0].gancho = "La Corte de La Serena dijo que la descoordinación no es excusa";
  s.slides[1].titulo = "Una paciente quedó en el limbo";
  s.slides[1].texto = "Una mujer de **66 años**, con fibromialgia, fue derivada a especialidad en el hospital. Después la devolvieron al CESFAM sin avisarle.";
  s.slides[2].titulo = "¿Puede un tribunal revisar un tratamiento?";
  s.slides[2].texto = "La Corte dijo que no define cuál es el mejor tratamiento. Lo que sí revisó fue si el sistema **coordinó** bien la atención.";
  s.slides[3].texto = "lo que sí cabe en el campo del derecho es definir si el sistema dio cumplimiento a sus deberes de coordinación (…) brindar la atención oportuna, completa e integral de la actora";
  s.slides[4].titulo = "La demora también cuenta";
  s.slides[4].texto = "La Corte consideró que la atención tardó **más de 5 meses** y que la paciente terminó peor que antes.";
  s.slides[5].titulo = "Tu salud no puede quedar en pausa";
  s.slides[5].texto = "Si la atención se interrumpe por descoordinación, el recurso de protección es una vía posible. Cada caso se evalúa.";
  return s;
}
const CAPTIONS = "Quedar sin tratamiento por un error de coordinación también vulnera derechos. ⚖️\n\nFuente: Corte de Apelaciones de La Serena, Primera Sala · nota del Poder Judicial del 05-10-2026 · rol [VERIFICAR: rol en la OJV]\n\n#choapajusta #recursodeproteccion #derechoalasalud #choapa";

await test("validador: la base sin redactar no pasa", () => {
  const r = J.validarCarrusel(J.specBase(ficha("149032")), ficha("149032"));
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => /\[REDACTAR\]/.test(e)));
});

await test("validador: carrusel apoyado solo en la ficha → ok, con aviso de BORRADOR por el rol", () => {
  const r = J.validarCarrusel(specValido(), ficha("149032"), CAPTIONS);
  assert.deepEqual(r.errores, []);
  assert.equal(r.ok, true);
  assert.ok(r.avisos.some((a) => /BORRADOR/.test(a)));
});

await test("validador: cifra inventada, organismo ajeno y cita no literal se rechazan", () => {
  const s = specValido();
  s.slides[1].texto = s.slides[1].texto.replace("66 años", "65 años");
  s.slides[4].texto += " La Corte Suprema lo confirmó.";
  s.slides[3].texto = "lo que sí cabe en el derecho es definir si el sistema cumplió sus deberes de coordinación con la paciente";
  const r = J.validarCarrusel(s, ficha("149032"), CAPTIONS);
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => /«65»/.test(e)), "cifra");
  assert.ok(r.errores.some((e) => /Corte Suprema/.test(e)), "organismo");
  assert.ok(r.errores.some((e) => /no es literal/.test(e)), "cita");
});

await test("validador: la fuente exige el rol si la nota lo trae, y captions con línea Fuente", () => {
  const f = ficha("143842");
  const s = J.specBase(f);
  s.slides.forEach((sl) => { for (const k of Object.keys(sl)) if (typeof sl[k] === "string" && sl[k].includes("[REDACTAR")) sl[k] = "Texto"; });
  s.slides[3].texto = "no existe vulneración del debido proceso, ni tampoco una inobservancia al principio de proporcionalidad";
  assert.equal(J.validarCarrusel(s, f).ok, true);
  s.slides[3].fuente = "C. A. de La Serena · Segunda Sala";
  const r = J.validarCarrusel(s, f, "Sin fuente #choapajusta");
  assert.ok(r.errores.some((e) => /rol 71-2025/.test(e)));
  assert.ok(r.errores.some((e) => /línea «Fuente/.test(e)));
});

await test("reporte: asunto, secciones y advertencias", () => {
  const fichas = ["149032", "149489"].map(ficha);
  const d = { accion: "reporte", hoy: "2026-10-22", periodo: { desde: "2026-10-02", hasta: "2026-10-21" },
    fuente: { estado: "ok", error: "", total: 69, enPeriodo: 3 }, fallos: fichas,
    recomendados: J.elegirRecomendados(fichas), noLeidas: [],
    descartadas: [{ item: items.find((x) => x.id === "149156"), motivo: "Ministro en visita o de fuero" }], carruseles: {} };
  const r = J.construirReporte(d);
  assert.equal(r.asunto, "⚖️ Fallos C.A. La Serena · 02-10-2026 al 21-10-2026 — 2 fallos · 2 para carrusel");
  assert.match(r.html, /Recomendados para carrusel/);
  assert.match(r.html, /Descartadas \(no son fallos de la Corte\)/);
  assert.match(r.html, /no leyó las sentencias íntegras/);
  assert.match(r.md, /## ⭐ Recomendados para carrusel/);
  assert.equal(J.construirReporte({ ...d, fallos: [], recomendados: [], descartadas: [] }).asunto,
    "⚖️ Fallos C.A. La Serena · 02-10-2026 al 21-10-2026 — sin fallos nuevos de la Corte");
  const av = J.construirReporte({ ...d, accion: "aviso", fuente: { estado: "error", error: "pjud.cl no respondió" } });
  assert.match(av.asunto, /no se pudo leer pjud\.cl/);
  assert.match(av.html, /pjud\.cl no respondió/);
});

// ---------------------------------------------------------------------------
// CLI contra un servidor local
// ---------------------------------------------------------------------------

let modo = {};
let pedidas = [];
const server = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => { cuerpo += c; });
  req.on("end", () => {
    pedidas.push({ metodo: req.method, url: req.url, cuerpo });
    const html = (code, h) => { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" }); res.end(h); };
    if (req.method === "GET" && req.url === "/prensa-y-comunicaciones/noticias-del-poder-judicial") {
      if (modo.portadaCaptcha) return html(200, CAPTCHA);
      return html(200, "<!doctype html><html><head><title>Noticias</title></head><body><h1>Noticias del Poder Judicial</h1></body></html>");
    }
    if (req.method === "POST" && req.url === "/ajax/news/getNewsForFilters") {
      if (!/name="id_jurisdiction"\r\n\r\n7\r\n/.test(cuerpo) || !/name="new_type_id"\r\n\r\n48\r\n/.test(cuerpo)) return html(400, "filtros incorrectos");
      return html(200, modo.listaRechazada ? RECHAZO : LISTA);
    }
    const m = req.url.match(/^\/prensa-y-comunicaciones\/noticias-del-poder-judicial\/(\d+)$/);
    if (req.method === "GET" && m) {
      if ((modo.rechazar || []).includes(m[1])) return html(200, RECHAZO);
      if ((modo.captcha || []).includes(m[1])) return html(200, CAPTCHA);
      if (existsSync(join(DIR, `noticia-${m[1]}.real-2026-10-25.html`))) return html(200, noticiaHtml(m[1]));
    }
    html(404, "no existe");
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const tmp = mkdtempSync(join(tmpdir(), "agente-jurisprudencia-test-"));
let n = 0;

async function cli(args, { conBase = true } = {}) {
  const salida = join(tmp, "salida-" + n++);
  const extra = conBase ? ["--salida", salida, "--base-url", BASE, "--pausa-seg", "0"] : [];
  try {
    const { stdout } = await run("node", [CLI, ...extra, ...args], { timeout: 180000 });
    return { code: 0, json: JSON.parse(stdout), salida };
  } catch (err) {
    return { code: err.code, json: JSON.parse(err.stdout || "{}"), salida };
  }
}
const notasPedidas = () => pedidas.filter((p) => /noticias-del-poder-judicial\/\d+$/.test(p.url)).map((p) => p.url.split("/").pop());

let salidaOk;
await test("CLI: período con 2 fallos de la Corte y 1 ministro en visita → reporte y carpetas de carrusel", async () => {
  modo = {}; pedidas = [];
  const { code, json, salida } = await cli(["--desde", "2026-10-02", "--hasta", "2026-10-21", "--hoy", "2026-10-22"]);
  salidaOk = salida;
  assert.equal(code, 0, JSON.stringify(json));
  assert.equal(json.accion, "reporte");
  assert.equal(json.asunto, "⚖️ Fallos C.A. La Serena · 02-10-2026 al 21-10-2026 — 2 fallos · 2 para carrusel");
  assert.deepEqual(json.para, ["pandrades23@gmail.com"]);
  assert.deepEqual(json.cc, ["andradestordecilla.abogado@gmail.com"]);
  assert.equal(json.fuente.enPeriodo, 3);
  assert.equal(json.descartadas, 1);
  assert.equal(json.noLeidas, 0);
  assert.deepEqual(json.recomendados.map((r) => r.id), ["149032", "149489"]);
  assert.deepEqual(notasPedidas(), ["149489", "149032"], "la nota del ministro no se lee");
  for (const r of json.recomendados) {
    for (const a of ["ficha.json", "brief.md", "spec.base.json"]) assert.ok(existsSync(join(r.carpeta, a)), a);
  }
  assert.equal(readdirSync(join(salida, "fichas")).length, 2);
  const html = readFileSync(json.archivos.html, "utf8");
  assert.match(html, /paciente con fibromialgia/);
  assert.match(html, /Ministro en visita/);
});

await test("CLI: si el sitio rechaza una nota, se detiene y la deja como no leída", async () => {
  modo = { rechazar: ["149489"] }; pedidas = [];
  const { code, json } = await cli(["--desde", "2026-10-02", "--hasta", "2026-10-21", "--hoy", "2026-10-22"]);
  assert.equal(code, 0);
  assert.equal(json.accion, "reporte");
  assert.equal(json.fallos.length, 0);
  assert.equal(json.noLeidas, 2);
  assert.deepEqual(notasPedidas(), ["149489"], "no insiste con la segunda nota");
  assert.match(readFileSync(json.archivos.html, "utf8"), /se detuvo para no insistir/);
});

await test("CLI: lista rechazada → aviso", async () => {
  modo = { listaRechazada: true }; pedidas = [];
  const { code, json } = await cli(["--dias-anteriores", "7", "--hoy", "2026-10-22"]);
  assert.equal(code, 0);
  assert.equal(json.accion, "aviso");
  assert.match(json.asunto, /no se pudo leer pjud\.cl/);
  assert.deepEqual(notasPedidas(), []);
});

await test("CLI: verificación humana en la portada → aviso que explica el modo carpeta, sin pedir la lista", async () => {
  modo = { portadaCaptcha: true }; pedidas = [];
  const { code, json, salida } = await cli(["--dias-anteriores", "7", "--hoy", "2026-10-22"]);
  assert.equal(code, 0);
  assert.equal(json.accion, "aviso");
  assert.equal(json.fuente.error, J.MENSAJE_VERIFICACION);
  assert.equal(pedidas.filter((p) => p.metodo === "POST").length, 0);
  assert.match(readFileSync(join(salida, "reporte.html"), "utf8"), /no la resuelve ni la evade/);
});

await test("CLI: verificación humana en una nota → se detiene ahí", async () => {
  modo = { captcha: ["149489"] }; pedidas = [];
  const { json } = await cli(["--desde", "2026-10-02", "--hasta", "2026-10-21", "--hoy", "2026-10-22"]);
  assert.equal(json.fallos.length, 0);
  assert.equal(json.noLeidas, 2);
  assert.deepEqual(notasPedidas(), ["149489"]);
});

await test("CLI --entrada: procesa notas guardadas a mano, sin red", async () => {
  const entrada = join(tmp, "guardadas");
  mkdirSync(entrada, { recursive: true });
  copyFileSync(join(DIR, "noticia-149032.real-2026-10-25.html"), join(entrada, "Poder Judicial - nota 1.html"));
  copyFileSync(join(DIR, "noticia-145899.real-2026-10-25.html"), join(entrada, "Poder Judicial - nota 2.html"));
  writeFileSync(join(entrada, "verificacion.html"), CAPTCHA);
  pedidas = [];
  const { code, json, salida } = await cli(["--entrada", entrada, "--hoy", "2026-10-25", "--salida", join(tmp, "salida-carpeta")], { conBase: false });
  assert.equal(code, 0, JSON.stringify(json));
  assert.equal(json.accion, "reporte");
  assert.deepEqual(json.periodo, { desde: "2026-06-11", hasta: "2026-10-05" });
  assert.deepEqual(json.fallos.map((f) => f.id).sort(), ["145899", "149032"]);
  assert.deepEqual(json.recomendados.map((r) => r.id), ["149032"]);
  assert.equal(json.noLeidas, 1, "la página de verificación se informa como no leída");
  assert.equal(pedidas.length, 0, "el modo carpeta no usa la red");
  assert.match(readFileSync(json.archivos.html, "utf8"), /modo carpeta/);
});

await test("CLI: tope de notas por ejecución", async () => {
  modo = {}; pedidas = [];
  const { json } = await cli(["--desde", "2026-10-02", "--hasta", "2026-10-21", "--hoy", "2026-10-22", "--max-notas", "1"]);
  assert.equal(json.fallos.length, 1);
  assert.equal(json.noLeidas, 1);
  assert.deepEqual(notasPedidas(), ["149489"]);
});

await test("CLI --componer: valida el carrusel escrito y lo incluye en el reporte", async () => {
  const carpeta = join(salidaOk, "carruseles", "2026-10-05_149032");
  writeFileSync(join(carpeta, "spec.json"), JSON.stringify(specValido(), null, 2));
  writeFileSync(join(carpeta, "captions.md"), CAPTIONS);
  const { code, json } = await cli(["--componer", salidaOk], { conBase: false });
  assert.equal(code, 0, JSON.stringify(json));
  const r = json.recomendados.find((x) => x.id === "149032");
  assert.deepEqual(r.carrusel, { ok: true, errores: [] });
  assert.equal(json.recomendados.find((x) => x.id === "149489").carrusel, null);
  const html = readFileSync(json.archivos.html, "utf8");
  assert.match(html, /validado contra la ficha/);
  assert.match(html, /Una paciente quedó en el limbo/);
});

await test("CLI --asignar-rol: el rol con su fuente reemplaza el [VERIFICAR] del carrusel y del reporte", async () => {
  const otra = join(tmp, "copia-asignar");
  await run("cp", ["-r", salidaOk, otra]);
  const carpeta = join(otra, "carruseles", "2026-10-05_149032");
  let r = await cli(["--asignar-rol", otra, "--nota", "149032", "--rol", "sin-rol"], { conBase: false });
  assert.notEqual(r.code, 0, "rol inválido");
  r = await cli(["--asignar-rol", otra, "--nota", "149032", "--rol", "Protección-9999-2026"], { conBase: false });
  assert.match(r.json.error, /Falta la fuente/);
  r = await cli(["--asignar-rol", otra, "--nota", "149032", "--rol", "Protección-9999-2026",
    "--fuente-rol", "https://juris.pjud.cl/ejemplo", "--fecha-sentencia", "2026-10-01"], { conBase: false });
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.deepEqual(r.json.recomendados.find((x) => x.id === "149032").carrusel, { ok: true, errores: [] });
  assert.ok(!r.json.sinRol.some((x) => x.id === "149032"));
  const spec = readFileSync(join(carpeta, "spec.json"), "utf8");
  assert.ok(!spec.includes("[VERIFICAR"), "sin banda BORRADOR");
  assert.match(spec, /Rol Protección-9999-2026/);
  assert.match(readFileSync(join(carpeta, "captions.md"), "utf8"), /rol Protección-9999-2026/);
  const html = readFileSync(r.json.archivos.html, "utf8");
  assert.match(html, /Protección-9999-2026 <span[^>]*>\(fuente: https:\/\/juris\.pjud\.cl\/ejemplo · sin verificación automática\)/);
  assert.match(html, /Fecha de la sentencia<\/td><td[^>]*>01-10-2026/);
  const v = await run("node", [VALIDAR, carpeta]);
  assert.ok(!JSON.parse(v.stdout).avisos.some((a) => /BORRADOR/.test(a)));
});

await test("CLI --incorporar-sentencia: toma rol y fecha del texto y quita el BORRADOR; rechaza la sentencia equivocada", async () => {
  const otra = join(tmp, "copia-incorporar");
  await run("cp", ["-r", salidaOk, otra]);
  const archivo = join(tmp, "sentencia-149489.txt");
  writeFileSync(archivo, "URL: https://juris.pjud.cl/sentencia/ejemplo\n" + SENTENCIA_149489);
  let r = await cli(["--incorporar-sentencia", otra, "--nota", "149032", "--sentencia", archivo], { conBase: false });
  assert.notEqual(r.code, 0);
  assert.match(r.json.error, /Ninguna de las 11 citas/);
  r = await cli(["--incorporar-sentencia", otra, "--nota", "149489", "--sentencia", archivo], { conBase: false });
  assert.equal(r.code, 0, JSON.stringify(r.json));
  const fallo = r.json.fallos.find((x) => x.id === "149489");
  assert.equal(fallo.rol, "Protección-2187-2026");
  assert.ok(!r.json.sinRol.some((x) => x.id === "149489"));
  assert.deepEqual(r.json.sentencias.map((x) => [x.archivo, x.estado, x.nota, x.rol, x.fecha]),
    [["sentencia-149489.txt", "incorporada", "149489", "Protección-2187-2026", "2026-10-16"]]);
  const carpeta = join(otra, "carruseles", "2026-10-20_149489");
  assert.ok(!readFileSync(join(carpeta, "spec.base.json"), "utf8").includes("[VERIFICAR"));
  const html = readFileSync(r.json.archivos.html, "utf8");
  assert.match(html, /Protección-2187-2026 <span[^>]*>\(fuente: https:\/\/juris\.pjud\.cl\/sentencia\/ejemplo · <span[^>]*>verificado<\/span>: 6 de 6 citas/);
  assert.match(html, /Fecha de la sentencia<\/td><td[^>]*>16-10-2026/);
  assert.match(html, /Sentencias en la carpeta/);
});

await test("CLI --entrada: incorpora sola las sentencias guardadas (.txt y .pdf) y explica las que no calzan", async () => {
  const entrada = join(tmp, "entrada-con-sentencias");
  mkdirSync(entrada, { recursive: true });
  copyFileSync(join(DIR, "noticia-149489.real-2026-10-25.html"), join(entrada, "nota-149489.html"));
  copyFileSync(join(DIR, "noticia-149032.real-2026-10-25.html"), join(entrada, "nota-149032.html"));
  copyFileSync(join(DIR, "noticia-143842.real-2026-10-25.html"), join(entrada, "nota-143842.html"));
  writeFileSync(join(entrada, "sentencia-149489.txt"), "URL: https://juris.pjud.cl/sentencia/ejemplo\n" + SENTENCIA_149489);
  copyFileSync(join(DIR, "sentencia-149032.sintetico.pdf"), join(entrada, "sentencia-149032.pdf"));
  writeFileSync(join(entrada, "otra-sentencia.txt"), sentenciaSintetica({ citas: [{ texto: "texto que no corresponde a ninguna de las notas guardadas en esta carpeta de prueba" }] }, { rol: "Civil-77-2026" }).repeat(6));
  const { code, json } = await cli(["--entrada", entrada, "--hoy", "2026-10-25", "--salida", join(tmp, "salida-con-sentencias")], { conBase: false });
  assert.equal(code, 0, JSON.stringify(json));
  const porId = Object.fromEntries(json.fallos.map((f) => [f.id, f.rol]));
  assert.equal(porId["149489"], "Protección-2187-2026");
  assert.equal(porId["149032"], "Protección-9032-2026", "rol leído del PDF con pdftotext");
  assert.equal(porId["143842"], "71-2025", "el rol de la nota se conserva");
  const estados = Object.fromEntries(json.sentencias.map((x) => [x.archivo, x.estado]));
  assert.deepEqual(estados, { "sentencia-149489.txt": "incorporada", "sentencia-149032.pdf": "incorporada", "otra-sentencia.txt": "sin coincidencia" });
  assert.equal(json.sentencias.find((x) => x.archivo === "sentencia-149032.pdf").fecha, "2026-10-01");
  assert.deepEqual(json.sinRol, []);
  const html = readFileSync(json.archivos.html, "utf8");
  assert.match(html, /sentencia-149032\.pdf<\/b> — <span[^>]*>incorporada<\/span> a la nota 149032: rol Protección-9032-2026, sentencia del 01-10-2026/);
  assert.match(html, /otra-sentencia\.txt<\/b> — <span[^>]*>sin coincidencia<\/span>/);
  // Volver a ejecutar sobre la misma salida propaga el rol a un carrusel ya escrito.
  const carpeta = join(tmp, "salida-con-sentencias", "carruseles", "2026-10-20_149489");
  writeFileSync(join(carpeta, "spec.json"), JSON.stringify({ slides: [{ tipo: "cita", texto: "x", fuente: "C. A. de La Serena · Rol [VERIFICAR: rol en la OJV]" }] }));
  await cli(["--entrada", entrada, "--hoy", "2026-10-25", "--salida", join(tmp, "salida-con-sentencias")], { conBase: false });
  assert.match(readFileSync(join(carpeta, "spec.json"), "utf8"), /Rol Protección-2187-2026/);
});

await test("validar-carrusel.mjs: código 0 si pasa, 2 si no", async () => {
  const carpeta = join(salidaOk, "carruseles", "2026-10-05_149032");
  const ok = await run("node", [VALIDAR, carpeta]);
  assert.equal(JSON.parse(ok.stdout).ok, true);
  const mala = join(salidaOk, "carruseles", "2026-10-20_149489");
  let code = 0;
  try { await run("node", [VALIDAR, join(mala, "spec.base.json"), join(mala, "ficha.json")]); } catch (e) { code = e.code; }
  assert.equal(code, 2);
});

await test("modo navegador: lista.js y nota.js en una pestaña → archivos que --entrada procesa", async () => {
  const { chromium } = (await import("node:module")).createRequire(import.meta.url)("playwright");
  const codigo = (n) => readFileSync(join(ROOT, "agente-jurisprudencia-serena", "navegador", n), "utf8");
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    modo = {}; pedidas = [];
    await pagina.goto(`${BASE}/prensa-y-comunicaciones/noticias-del-poder-judicial`);
    const lista = await pagina.evaluate(codigo("lista.js").replace(/\("\d{4}-\d{2}-\d{2}", "\d{4}-\d{2}-\d{2}"\)\s*$/, '("2026-10-02", "2026-10-21")'));
    assert.deepEqual(J.parsearLista(lista).items.map((x) => x.id), ["149489", "149156", "149032"]);
    const entrada = join(tmp, "desde-navegador");
    mkdirSync(entrada, { recursive: true });
    writeFileSync(join(entrada, "lista.html"), lista);
    for (const id of ["149489", "149032"]) {
      await pagina.goto(`${BASE}/prensa-y-comunicaciones/noticias-del-poder-judicial/${id}`);
      const html = await pagina.evaluate(codigo("nota.js"));
      assert.equal(J.idDesdeHtml(html), id);
      assert.deepEqual(J.parsearNoticia(html), J.parsearNoticia(noticiaHtml(id)));
      writeFileSync(join(entrada, `nota-${id}.html`), html);
    }
    modo = { captcha: ["149156"] };
    await pagina.goto(`${BASE}/prensa-y-comunicaciones/noticias-del-poder-judicial/149156`);
    assert.equal(await pagina.evaluate(codigo("nota.js")), "VERIFICACION");
    modo = { portadaCaptcha: true, listaRechazada: true };
    assert.equal(await pagina.evaluate(codigo("lista.js")), "VERIFICACION");
    const { json } = await cli(["--entrada", entrada, "--desde", "2026-10-02", "--hasta", "2026-10-21", "--hoy", "2026-10-25",
      "--salida", join(tmp, "salida-navegador")], { conBase: false });
    assert.deepEqual(json.fallos.map((f) => f.id).sort(), ["149032", "149489"]);
    assert.equal(json.descartadas, 1, "la nota del ministro en visita se descarta por el título");
    assert.equal(json.noLeidas, 0);
  } finally {
    await navegador.close();
  }
});

await test("modo navegador por texto: lista y notas leídas como texto → --por-leer y --entrada", async () => {
  const { chromium } = (await import("node:module")).createRequire(import.meta.url)("playwright");
  const navegador = await chromium.launch();
  const textoDe = async (url) => {
    const p = await navegador.newPage();
    await p.goto(url);
    const t = await p.evaluate(() => document.body.innerText);
    await p.close();
    return t;
  };
  try {
    // Las 8 notas reales: el texto visible da la misma ficha que el HTML.
    for (const f of readdirSync(DIR).filter((n) => n.startsWith("noticia-"))) {
      const texto = await textoDe("file://" + join(DIR, f));
      assert.deepEqual(J.parsearNoticiaTexto(texto), J.parsearNoticia(fixture(f)), f);
    }
    assert.equal(J.parsearNoticiaTexto("Compartir\nTítulo\n26-junio-2026\nVideo\nBajada.\nPárrafo uno.\nVolver").bajada, "Bajada.");
    assert.equal(J.parsearNoticiaTexto(CAPTCHA.replace(/<[^>]+>/g, "\n")).estado, "verificacion");

    const listaTexto = await textoDe("file://" + join(DIR, "lista-fallos.real-2026-10-25.html"));
    assert.deepEqual(J.parsearListaTexto(listaTexto).items.map((x) => [x.titulo, x.fechaNota]),
      items.map((x) => [x.titulo, x.fechaNota]));

    const entrada = join(tmp, "navegador-texto");
    mkdirSync(entrada, { recursive: true });
    writeFileSync(join(entrada, "lista.txt"), listaTexto);
    const base = ["--desde", "2026-10-02", "--hasta", "2026-10-21", "--hoy", "2026-10-25"];
    let r = await cli(["--por-leer", entrada, ...base], { conBase: false });
    assert.deepEqual(r.json.abrir.map((x) => x.fechaNota), ["2026-10-20", "2026-10-05"]);
    assert.equal(r.json.descartadas.length, 1);
    assert.match(r.json.descartadas[0].motivo, /Ministro en visita/);

    const url = "https://www.pjud.cl/prensa-y-comunicaciones/noticias-del-poder-judicial/149489";
    writeFileSync(join(entrada, "nota-149489.txt"), `URL: ${url}\n` + await textoDe("file://" + join(DIR, "noticia-149489.real-2026-10-25.html")));
    r = await cli(["--por-leer", entrada, ...base], { conBase: false });
    assert.deepEqual(r.json.guardadas.map((x) => x.url), [url]);
    assert.equal(r.json.abrir.length, 1);

    r = await cli(["--entrada", entrada, ...base, "--salida", join(tmp, "salida-texto")], { conBase: false });
    assert.deepEqual(r.json.fallos.map((f) => f.id), ["149489"]);
    assert.equal(r.json.noLeidas, 1, "la nota del 05-10 sigue sin guardar");
    assert.equal(r.json.descartadas, 1);
    const ficha = JSON.parse(readFileSync(join(tmp, "salida-texto", "fichas", "2026-10-20_149489.json"), "utf8"));
    assert.equal(ficha.url, url);
    assert.equal(ficha.sala, "Primera Sala");
    assert.equal(ficha.lectura, "texto");
    assert.ok(ficha.pendientes.some((x) => /copiado por Claude/.test(x)));
  } finally {
    await navegador.close();
  }
});

await test("paquete .zip: trae los archivos del agente y el CLI funciona descomprimido", async () => {
  const dist = join(tmp, "dist");
  await run("bash", [join(ROOT, "scripts", "empaquetar-agente-jurisprudencia-serena.sh"), dist]);
  const zip = join(dist, "agente-jurisprudencia-serena.zip");
  const { stdout } = await run("unzip", ["-Z1", zip]);
  assert.deepEqual(stdout.trim().split("\n").sort(), [
    "jurisprudencia-ca-la-serena/",
    "jurisprudencia-ca-la-serena/SKILL.md",
    "jurisprudencia-ca-la-serena/jurisprudencia.mjs",
    "jurisprudencia-ca-la-serena/navegador/",
    "jurisprudencia-ca-la-serena/navegador/lista.js",
    "jurisprudencia-ca-la-serena/navegador/nota.js",
    "jurisprudencia-ca-la-serena/navegador/sentencia.js",
    "jurisprudencia-ca-la-serena/reporte.mjs",
    "jurisprudencia-ca-la-serena/validar-carrusel.mjs"
  ]);
  const dir = join(tmp, "skill");
  await run("unzip", ["-q", zip, "-d", dir]);
  const ok = await run("node", [join(dir, "jurisprudencia-ca-la-serena", "validar-carrusel.mjs"), join(salidaOk, "carruseles", "2026-10-05_149032")]);
  assert.equal(JSON.parse(ok.stdout).ok, true);
  const skill = readFileSync(join(dir, "jurisprudencia-ca-la-serena", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: jurisprudencia-ca-la-serena\n/);
});

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
