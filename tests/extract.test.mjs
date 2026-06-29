// Tests unitarios del cerebro del agente: las funciones de extracción y
// filtrado dentro de estado-diario.gs.
//
// El .gs corre en Apps Script (V8), que expone globales como GmailApp,
// Utilities, Session y ScriptApp. Aquí lo evaluamos en un sandbox de Node
// con mocks mínimos, y probamos las funciones puras directamente.
//
// Uso: NODE_PATH=/opt/node22/lib/node_modules node tests/extract.test.mjs
// (o desde tests/run.sh)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { strict as assert } from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsPath = join(__dirname, "..", "estado-diario.gs");
const gsCode = readFileSync(gsPath, "utf8");

// ---------------------------------------------------------------------------
// Mocks de las globales de Apps Script (lo mínimo que las funciones tocan)
// ---------------------------------------------------------------------------

const Utilities = {
  formatDate(date, _tz, fmt) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    if (fmt === "yyyy-MM-dd") return `${y}-${m}-${d}`;
    if (fmt === "yyyy/MM/dd") return `${y}/${m}/${d}`;
    return date.toISOString();
  }
};
const Session = { getScriptTimeZone: () => "America/Santiago" };
const GmailApp = {
  search: () => [],
  getUserLabelByName: () => null,
  createLabel: () => ({ getName: () => "" }),
  getThreadById: () => null,
  sendEmail: () => null
};
const ScriptApp = {
  getProjectTriggers: () => [],
  newTrigger: () => ({
    timeBased: () => ({
      atHour: () => ({ everyDays: () => ({ create: () => {} }) })
    })
  }),
  deleteTrigger: () => {}
};
const ContentService = {
  createTextOutput: () => ({ setMimeType: () => ({}) }),
  MimeType: { JSON: "json", JAVASCRIPT: "js" }
};

// Sandbox: ejecuta el .gs en su propio scope y devuelve las funciones puras.
const sandbox = new Function(
  "Utilities", "Session", "GmailApp", "ScriptApp", "ContentService",
  gsCode +
  "\nreturn { extractRol, extractCaratulado, extractTipo, analyzeMessage, buildEntries, ensureDailyTrigger, buildDigest, escapeHtml, digestMailOptions, DIGEST_TO, DIGEST_CC };"
);
const fns = sandbox(Utilities, Session, GmailApp, ScriptApp, ContentService);

// ---------------------------------------------------------------------------
// Helpers de prueba
// ---------------------------------------------------------------------------

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("PASS:", name); }
  catch (e) { fail++; console.error("FAIL:", name, "\n  ", e.message); }
}

const fakeThread = (id) => ({ getId: () => id });
const fakeMsg = (over) => ({
  getId: () => over.id || "msg-" + Math.floor(Math.random() * 1e9),
  getFrom: () => over.from || "notifica_jl_losvilos@pjud.cl",
  getSubject: () => over.subject || "",
  getPlainBody: () => over.body || "",
  getDate: () => over.date || new Date()
});

// ---------------------------------------------------------------------------
// extractRol — formatos típicos del Poder Judicial chileno
// ---------------------------------------------------------------------------

test("extractRol: 'Causa Rol C-114-2026'", () => {
  assert.equal(fns.extractRol("Causa Rol C-114-2026"), "C-114-2026");
});
test("extractRol: 'RIT O-3-2026'", () => {
  assert.equal(fns.extractRol("RIT O-3-2026"), "O-3-2026");
});
test("extractRol: 'RIT N° O-3-2026'", () => {
  assert.equal(fns.extractRol("RIT N° O-3-2026"), "O-3-2026");
});
test("extractRol: 'Rol N° 1185-2026' (sin letra)", () => {
  assert.equal(fns.extractRol("Recurso de Protección Rol N° 1185-2026"), "1185-2026");
});
test("extractRol: 'RIC P-45-2025'", () => {
  assert.equal(fns.extractRol("Notificación RIC P-45-2025"), "P-45-2025");
});
test("extractRol: 'Ingreso 12345-2026'", () => {
  assert.equal(fns.extractRol("Ingreso Corte 12345-2026"), "12345-2026");
});
test("extractRol: cuerpo del correo con rol embebido", () => {
  const body = "Estimados:\n  Se adjunta resolución de la causa\nRol: C-44-2025\nde fecha...";
  assert.equal(fns.extractRol(body), "C-44-2025");
});
test("extractRol: vacío cuando no hay rol", () => {
  assert.equal(fns.extractRol("Notificación general"), "");
});

// ---------------------------------------------------------------------------
// extractTipo — clasifica la resolución
// ---------------------------------------------------------------------------

test("extractTipo: sentencia", () => {
  assert.equal(fns.extractTipo("Se dicta sentencia definitiva"), "Sentencia");
});
test("extractTipo: provee escrito", () => {
  assert.equal(fns.extractTipo("Provee escrito de contestación"), "Provee escrito");
});
test("extractTipo: decreto", () => {
  assert.equal(fns.extractTipo("Decreto que tiene por interpuesto el recurso"), "Decreto");
});
test("extractTipo: audiencia", () => {
  assert.equal(fns.extractTipo("Cítese a las partes a audiencia preparatoria"), "Citación a audiencia");
});
test("extractTipo: notificación", () => {
  assert.equal(fns.extractTipo("Notifíquese por estado diario"), "Notificación");
});
test("extractTipo: recurso de protección", () => {
  assert.equal(fns.extractTipo("Se interpone Recurso de Protección"), "Recurso");
});
test("extractTipo: fallback 'Movimiento'", () => {
  assert.equal(fns.extractTipo("Un mensaje cualquiera sin palabras clave"), "Movimiento");
});

// ---------------------------------------------------------------------------
// extractCaratulado
// ---------------------------------------------------------------------------

test("extractCaratulado: campo explícito", () => {
  const r = fns.extractCaratulado("Asunto X", "Caratulado: Pérez con Municipalidad\nResto del cuerpo");
  assert.match(r, /Pérez con Municipalidad/);
});
test("extractCaratulado: 'X con Y'", () => {
  const r = fns.extractCaratulado("Demanda Núñez con I. Municipalidad de Los Vilos", "");
  assert.match(r, /Núñez con I\. Municipalidad de Los Vilos/);
});
test("extractCaratulado: 'X c/ Y'", () => {
  const r = fns.extractCaratulado("González c/ Municipalidad de Los Vilos", "");
  assert.match(r, /González c\/ Municipalidad de Los Vilos/);
});
test("extractCaratulado: fallback al asunto cuando no detecta patrón", () => {
  const r = fns.extractCaratulado("Notificación judicial", "");
  assert.equal(r, "Notificación judicial");
});

// ---------------------------------------------------------------------------
// analyzeMessage — el filtrado end-to-end del correo
// ---------------------------------------------------------------------------

test("analyzeMessage: Los Vilos + Municipalidad → entrada válida", () => {
  const msg = fakeMsg({
    from: "Poder Judicial <notifica_jl_losvilos@pjud.cl>",
    subject: "Causa Rol C-114-2026 - Notificación",
    body: "Caratulado: Pérez con I. Municipalidad de Los Vilos\nProvee escrito. Téngase por contestada la demanda."
  });
  const e = fns.analyzeMessage(fakeThread("th-1"), msg);
  assert.ok(e, "debe retornar entrada");
  assert.equal(e.tipoTribunal, "los-vilos");
  assert.equal(e.tribunal, "Juzgado de Letras y Garantía de Los Vilos");
  assert.equal(e.rol, "C-114-2026");
  assert.match(e.caratulado, /Pérez con/);
  assert.equal(e.tipoResolucion, "Provee escrito");
  assert.equal(typeof e.fechaIso, "string");
  assert.match(e.id, /^ed-/);
});

test("analyzeMessage: Corte La Serena + Patricio Andrades", () => {
  const msg = fakeMsg({
    from: "notifica_corte_laserena@pjud.cl",
    subject: "Recurso de Protección Rol 1185-2026",
    body: "Abogado patrocinante: Patricio Andrades. Se declara admisible el recurso."
  });
  const e = fns.analyzeMessage(fakeThread("th-2"), msg);
  assert.ok(e, "debe retornar entrada");
  assert.equal(e.tipoTribunal, "corte-la-serena");
  assert.equal(e.rol, "1185-2026");
  assert.equal(e.tipoResolucion, "Recurso");
});

test("analyzeMessage: pjud sin Municipalidad/Patricio → descarta", () => {
  const msg = fakeMsg({
    from: "notifica_jl_losvilos@pjud.cl",
    subject: "Rol C-999-2026",
    body: "González con Pérez. Provee escrito. (causa entre particulares, sin municipio)"
  });
  const e = fns.analyzeMessage(fakeThread("th-3"), msg);
  assert.equal(e, null, "debe descartar correos no vinculados");
});

test("analyzeMessage: remitente NO judicial → descarta", () => {
  const msg = fakeMsg({
    from: "noreply@otrodominio.cl",
    subject: "Algo sobre Municipalidad de Los Vilos",
    body: "Texto cualquiera"
  });
  const e = fns.analyzeMessage(fakeThread("th-4"), msg);
  assert.equal(e, null, "debe descartar correos no judiciales");
});

test("analyzeMessage: alias pjud con domainHint 'los vilos'", () => {
  // Remitente alternativo @pjud.cl que NO está en la lista de senders pero
  // menciona Los Vilos en el cuerpo: debe igual clasificarlo como Los Vilos.
  const msg = fakeMsg({
    from: "secretaria@pjud.cl",
    subject: "Notificación Los Vilos",
    body: "I. Municipalidad de Los Vilos. Notifíquese."
  });
  const e = fns.analyzeMessage(fakeThread("th-5"), msg);
  assert.ok(e, "debe detectar por domainHint");
  assert.equal(e.tipoTribunal, "los-vilos");
});

test("analyzeMessage: case-insensitive en palabras clave", () => {
  const msg = fakeMsg({
    from: "notifica_jl_losvilos@pjud.cl",
    subject: "Notificación",
    body: "MUNICIPALIDAD DE LOS VILOS - se provee escrito"
  });
  const e = fns.analyzeMessage(fakeThread("th-6"), msg);
  assert.ok(e, "debe ser case-insensitive");
});

// ---------------------------------------------------------------------------
// ensureDailyTrigger — verifica idempotencia con mocks
// ---------------------------------------------------------------------------

test("ensureDailyTrigger: crea uno la primera vez", () => {
  let creados = 0;
  const ScriptAppLocal = {
    getProjectTriggers: () => [],
    newTrigger: () => ({
      timeBased: () => ({
        atHour: () => ({
          everyDays: () => ({ create: () => { creados++; } })
        })
      })
    })
  };
  const fnsLocal = new Function(
    "Utilities", "Session", "GmailApp", "ScriptApp", "ContentService",
    gsCode + "\nreturn { ensureDailyTrigger };"
  )(Utilities, Session, GmailApp, ScriptAppLocal, ContentService);
  fnsLocal.ensureDailyTrigger();
  assert.equal(creados, 1, "debe crear exactamente un trigger");
});

test("ensureDailyTrigger: no duplica si ya existe", () => {
  let creados = 0;
  const ScriptAppLocal = {
    getProjectTriggers: () => [{ getHandlerFunction: () => "reviseEstadoDiario" }],
    newTrigger: () => ({ timeBased: () => ({ atHour: () => ({ everyDays: () => ({ create: () => { creados++; } }) }) }) })
  };
  const fnsLocal = new Function(
    "Utilities", "Session", "GmailApp", "ScriptApp", "ContentService",
    gsCode + "\nreturn { ensureDailyTrigger };"
  )(Utilities, Session, GmailApp, ScriptAppLocal, ContentService);
  fnsLocal.ensureDailyTrigger();
  assert.equal(creados, 0, "no debe crear trigger nuevo");
});

// ---------------------------------------------------------------------------
// DIGEST — el correo diario a pandrades23@gmail.com
// ---------------------------------------------------------------------------

test("DIGEST_TO apunta a pandrades23@gmail.com", () => {
  assert.equal(fns.DIGEST_TO, "pandrades23@gmail.com");
});

test("DIGEST_CC incluye andradestordecilla.abogado@gmail.com", () => {
  assert.ok(fns.DIGEST_CC.includes("andradestordecilla.abogado@gmail.com"));
});

test("digestMailOptions incluye htmlBody y cc", () => {
  const opts = fns.digestMailOptions({ html: "<p>x</p>" });
  assert.equal(opts.htmlBody, "<p>x</p>");
  assert.equal(opts.cc, "andradestordecilla.abogado@gmail.com");
});

test("escapeHtml escapa <, >, &, comillas", () => {
  assert.equal(fns.escapeHtml('<a href="x">Y & "Z"\'s</a>'),
    "&lt;a href=&quot;x&quot;&gt;Y &amp; &quot;Z&quot;&#39;s&lt;/a&gt;");
});

test("buildDigest: sin entradas → asunto 'sin movimientos'", () => {
  const d = fns.buildDigest([]);
  assert.match(d.subject, /sin movimientos/i);
  assert.match(d.plain, /Sin movimientos/);
  assert.ok(d.html.includes("<p>"));
});

test("buildDigest: una entrada → asunto '1 movimiento'", () => {
  const d = fns.buildDigest([{
    rol: "C-114-2026",
    caratulado: "Pérez con I. Municipalidad de Los Vilos",
    tribunal: "Juzgado de Letras y Garantía de Los Vilos",
    tipoTribunal: "los-vilos",
    tipoResolucion: "Provee escrito",
    resumen: "Téngase por contestada la demanda.",
    threadId: "abc123"
  }]);
  assert.match(d.subject, /1 movimiento\b/);
  assert.ok(d.html.includes("Juzgado de Letras y Garantía de Los Vilos"));
  assert.ok(d.html.includes("C-114-2026"));
  assert.ok(d.html.includes("Pérez con I. Municipalidad de Los Vilos"));
  assert.ok(d.html.includes("Provee escrito"));
  assert.ok(d.html.includes("https://mail.google.com/mail/u/0/#all/abc123"));
});

test("buildDigest: agrupa por tribunal", () => {
  const entries = [
    { rol: "A-1-2026", caratulado: "X con Muni", tribunal: "Juzgado de Letras y Garantía de Los Vilos", tipoTribunal: "los-vilos", tipoResolucion: "Provee escrito", resumen: "...", threadId: "t1" },
    { rol: "B-2-2026", caratulado: "Y con Muni", tribunal: "Corte de Apelaciones de La Serena", tipoTribunal: "corte-la-serena", tipoResolucion: "Recurso", resumen: "...", threadId: "t2" },
    { rol: "A-3-2026", caratulado: "Z con Muni", tribunal: "Juzgado de Letras y Garantía de Los Vilos", tipoTribunal: "los-vilos", tipoResolucion: "Sentencia", resumen: "...", threadId: "t3" }
  ];
  const d = fns.buildDigest(entries);
  assert.match(d.subject, /3 movimientos/);
  // El cabezal del Juzgado debería decir "(2)" y el de la Corte "(1)"
  assert.match(d.html, /Juzgado de Letras y Garantía de Los Vilos[\s\S]*\(2\)/);
  assert.match(d.html, /Corte de Apelaciones de La Serena[\s\S]*\(1\)/);
});

test("buildDigest: escapa HTML en la carátula (anti-XSS)", () => {
  const d = fns.buildDigest([{
    rol: "X-1-2026",
    caratulado: "<script>alert(1)</script>",
    tribunal: "Juzgado de Letras y Garantía de Los Vilos",
    tipoResolucion: "Notificación",
    resumen: "",
    threadId: ""
  }]);
  assert.ok(!d.html.includes("<script>alert"), "no debe inyectar script");
  assert.ok(d.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("reviseEstadoDiario: usa htmlBody al enviar el correo", () => {
  // Simulamos GmailApp.search devolviendo un mensaje real vinculado.
  const calls = [];
  const fakeMsg = {
    getId: () => "m-1",
    getFrom: () => "notifica_jl_losvilos@pjud.cl",
    getSubject: () => "Causa Rol C-44-2026",
    getPlainBody: () => "Caratulado: X con I. Municipalidad de Los Vilos. Provee escrito.",
    getDate: () => new Date()
  };
  const fakeThread = {
    getId: () => "t-1",
    getMessages: () => [fakeMsg],
    addLabel: () => {}
  };
  const GmailMock = {
    search: () => [fakeThread],
    getUserLabelByName: () => ({ getName: () => "x" }),
    createLabel: () => ({ getName: () => "x" }),
    getThreadById: () => fakeThread,
    sendEmail: (to, subject, plain, opts) => {
      calls.push({ to, subject, plain, opts });
    }
  };
  const fnsLocal = new Function(
    "Utilities", "Session", "GmailApp", "ScriptApp", "ContentService",
    gsCode + "\nreturn { reviseEstadoDiario };"
  )(Utilities, Session, GmailMock, ScriptApp, ContentService);

  const n = fnsLocal.reviseEstadoDiario();
  assert.equal(n, 1, "debe procesar 1 entrada");
  assert.equal(calls.length, 1, "debe enviar 1 correo");
  assert.equal(calls[0].to, "pandrades23@gmail.com");
  assert.match(calls[0].subject, /Estado Diario/);
  assert.ok(calls[0].opts && calls[0].opts.htmlBody, "debe incluir htmlBody");
  assert.equal(calls[0].opts.cc, "andradestordecilla.abogado@gmail.com",
    "debe incluir CC al correo del abogado");
  assert.ok(calls[0].opts.htmlBody.includes("C-44-2026"));
});

// ---------------------------------------------------------------------------
console.log(`\n=== UNIT: ${pass}/${pass + fail} OK, ${fail} fallos ===`);
process.exit(fail === 0 ? 0 : 1);
