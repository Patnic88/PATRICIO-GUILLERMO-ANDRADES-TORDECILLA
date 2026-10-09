// Prueba REAL de las funciones con IA contra la API de Claude (gasta créditos).
//
// Uso:
//   AMENAZAS_CLAUDE_API_KEY=sk-ant-... node tests/prueba-real-ia.js [opciones]
//
// Opciones:
//   --modelo claude-haiku-5-5   modelo a probar (por defecto Haiku 5.5, el más barato)
//   --tope 0.25                 gasto máximo en US$ para esta corrida
//   --verificar-todo            verifica la fuente de todos los eventos del catálogo
//   --salida archivo.json       guarda el detalle de los resultados
//
// La clave se lee de la variable de entorno; nunca se escribe en archivos.
// Las verificaciones con IA son una ayuda: un evento solo se marca como
// verificado cuando una persona revisa la fuente.

const fs = require("fs");
require("../vendor/anthropic-sdk-0.127.0.js");
const IA = require("../ia.js");
const catalogo = require("../datos/aluviones.js");

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : porDefecto;
};
const modelo = opcion("modelo", "claude-haiku-5-5");
const verificarTodo = args.includes("--verificar-todo");
const tope = Number(opcion("tope", verificarTodo ? "1" : "0.25"));
const salida = opcion("salida", null);

const clave = process.env.AMENAZAS_CLAUDE_API_KEY;
if (!clave) {
  console.error("Falta la variable de entorno AMENAZAS_CLAUDE_API_KEY con tu clave de la API de Claude.");
  process.exit(2);
}
if (!IA.MODELOS.some((m) => m.id === modelo)) {
  console.error(`Modelo no reconocido: ${modelo}. Opciones: ${IA.MODELOS.map((m) => m.id).join(", ")}`);
  process.exit(2);
}

let registro = null;
const cuenta = {
  puedeGastar: () => !IA.estadoPresupuesto(registro, tope).bloqueado,
  gastar: (c) => { registro = IA.sumarGasto(registro, c); },
};
const usd = (x) => `US$ ${x.toFixed(4)}`;
const cliente = IA.crearCliente(clave);
const informe = { modelo, fecha: new Date().toISOString(), pruebas: [] };

async function paso(nombre, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    informe.pruebas.push({ nombre, ok: true, segundos: (Date.now() - t0) / 1000, ...r });
    console.log(`✅ ${nombre} (${((Date.now() - t0) / 1000).toFixed(1)} s, ${usd(r.costo || 0)})`);
    return r;
  } catch (e) {
    const mensaje = IA.mensajeError(e);
    informe.pruebas.push({ nombre, ok: false, error: mensaje });
    console.log(`❌ ${nombre}: ${mensaje}`);
    return null;
  }
}

(async () => {
  console.log(`Modelo: ${modelo} · tope de gasto: ${usd(tope)}\n`);

  // 1. Explicación del índice con datos de prueba.
  const exp = await paso("Explicar el índice (datos de prueba)", () =>
    IA.redactarInforme(cliente, {
      modelo,
      datos: {
        nota: "Datos de prueba de la app, no una evaluación real.",
        punto: { lat: -33.48, lon: -70.5 }, modo: "pronóstico de los próximos 3 días",
        indice: 46, nivel: "Alto", detonante_meteorologico: 52, susceptibilidad_del_terreno: 41, zona: "Zona Central",
        factores: [
          { nombre: "Lluvia intensa", estado: "parcial", puntaje: 55, detalle: "Máximo en 24 h: 33 mm. Referencia Zona Central: 60 mm/24 h o 10 mm/h." },
          { nombre: "Isoterma 0 °C alta durante la lluvia", estado: "si", puntaje: 80, detalle: "Isoterma ~3.200 m; 80 % del desnivel recibe lluvia." },
          { nombre: "Incendio reciente a menos de 5 km", estado: "sinDatos", puntaje: null, detalle: "No evaluado." },
        ],
      },
    }, cuenta)
  );
  if (exp) console.log(`   ${exp.texto.replace(/\n+/g, " ").slice(0, 300)}…\n`);

  // 2. Extracción desde un texto ficticio (nombres inventados a propósito).
  const textoPrueba =
    "Texto de prueba ficticio para validar la extracción. El martes 4 de marzo de 2025 un aluvión bajó por la quebrada " +
    "El Ejemplo y cubrió de barro el sector alto de Villa Prueba, comuna de Ficticia, región de Coquimbo. " +
    "La municipalidad informó que no hubo personas fallecidas.";
  const ext = await paso("Extraer de un texto (ficticio)", () => IA.extraerAluviones(cliente, { modelo, texto: textoPrueba }, cuenta));
  if (ext) {
    for (const e of ext.eventos) {
      console.log(`   → ${e.fecha} · ${e.localidad} · fallecidos ${e.fallecidos} · cita literal: ${e.citaOk ? "sí" : "NO"}`);
      if (e.alertas.length) console.log(`     alertas: ${e.alertas.join(" | ")}`);
    }
    const e = ext.eventos[0] || {};
    const esperado = e.fecha === "2025-03-04" && /villa prueba/i.test(e.localidad || "") && e.fallecidos === 0 && e.citaOk;
    console.log(`   Resultado esperado (2025-03-04, Villa Prueba, 0 fallecidos, cita literal): ${esperado ? "✅ coincide" : "⚠️ revisar"}\n`);
  }

  // 3. Verificación de fuentes del catálogo (lectura web desde los servidores de Anthropic).
  const eventos = catalogo.filter((a) => /^https?:\/\//.test(a.fuente_url || ""));
  const aVerificar = verificarTodo ? eventos : eventos.filter((a) => a.id === "quebrada-macul-1993");
  for (const ev of aVerificar) {
    if (!cuenta.puedeGastar()) {
      console.log(`⛔ Tope de ${usd(tope)} alcanzado; quedan eventos sin verificar.`);
      break;
    }
    const r = await paso(`Verificar ${ev.id}`, () => IA.verificarFuente(cliente, { modelo, evento: ev }, cuenta));
    if (r && r.resultado) {
      const v = r.resultado;
      console.log(`   leída: ${v.pagina_leida ? "sí" : "no"} · fecha: ${v.confirma_fecha} (${v.fecha_en_fuente ?? "—"}) · lugar: ${v.confirma_lugar} (${v.lugar_en_fuente ?? "—"})`);
      if (v.cita_textual) console.log(`   cita: «${v.cita_textual.slice(0, 200)}»`);
    } else if (r) {
      console.log(`   sin veredicto: ${(r.texto || "").slice(0, 200)}`);
    }
    if (r && r.errores && r.errores.length) console.log(`   errores de lectura: ${r.errores.join(", ")}`);
  }

  const total = registro ? registro.gastado : 0;
  informe.gastoTotal = total;
  console.log(`\nGasto total estimado: ${usd(total)} en ${registro ? registro.llamadas : 0} llamada(s).`);
  if (salida) {
    fs.writeFileSync(salida, JSON.stringify(informe, null, 2));
    console.log(`Detalle guardado en ${salida}`);
  }
  process.exit(informe.pruebas.every((p) => p.ok) ? 0 : 1);
})();
