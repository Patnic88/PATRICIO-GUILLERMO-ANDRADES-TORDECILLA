// Automatización del portal del SII (Chile) con Playwright.
//
// Diseño:
//  - Usamos un "contexto persistente" (perfil de navegador en disco) para que la
//    sesión del SII quede guardada entre corridas: inicias sesión una vez y las
//    siguientes veces ya entra solo (mientras la cookie siga vigente).
//  - El login puede ser MANUAL (recomendado, sirve para Clave Única / 2FA) o
//    AUTOMÁTICO con RUT + Clave Tributaria si pusiste credenciales en config.json.
//  - Para el RCV intentamos manejar la interfaz automáticamente; si el sitio
//    cambió y algún botón no se encuentra, caemos a un modo asistido en el que
//    capturamos igual cualquier descarga que hagas a mano.
//
// NOTA: el portal del SII cambia su HTML cada cierto tiempo. Todos los selectores
// y URLs están agrupados en SITIO para poder ajustarlos en un solo lugar.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const SITIO = {
  // Página del Registro de Compras y Ventas (SPA de Angular).
  rcvUrl: "https://www4.sii.cl/consdcvinternetui/#/index",
  // Página de autenticación clásica (RUT + Clave Tributaria).
  loginUrl: "https://zeusr.sii.cl/cgi_AUT2000/CAutInicio.cgi?https://misiir.sii.cl/cgi_misii/siihome.cgi",
  // Selectores del formulario de login (con alternativas por si cambian los id).
  login: {
    rut: ["#rutcntr", "input[name='rutcntr']", "#rut", "input[name='rut']"],
    clave: ["#clave", "input[name='clave']", "input[type='password']"],
    submit: ["#bt_ingresar", "button[type='submit']", "input[type='submit']"],
  },
  // Señales de que ya estamos dentro del RCV (no en la pantalla de login).
  marcadoresRcv: [
    "text=Registro de Compras y Ventas",
    "text=COMPRA",
    "text=VENTA",
  ],
};

// Espera y hace click sobre el primer selector de la lista que exista.
async function clickPrimero(page, selectores, { timeout = 4000 } = {}) {
  for (const sel of selectores) {
    const loc = page.locator(sel).first();
    try {
      await loc.waitFor({ state: "visible", timeout });
      await loc.click();
      return sel;
    } catch {
      /* probar el siguiente */
    }
  }
  return null;
}

async function rellenarPrimero(page, selectores, valor, { timeout = 4000 } = {}) {
  for (const sel of selectores) {
    const loc = page.locator(sel).first();
    try {
      await loc.waitFor({ state: "visible", timeout });
      await loc.fill(valor);
      return sel;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

export async function abrirNavegador(cfg, perfilDir, log = () => {}) {
  mkdirSync(perfilDir, { recursive: true });
  const opcionesBase = {
    headless: cfg.headless,
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
    locale: "es-CL",
    args: ["--start-maximized"],
  };

  // Para funcionar "en cualquier computadora" probamos varios navegadores en
  // orden: el Chromium que trae Playwright y, si no está, Google Chrome o
  // Microsoft Edge ya instalados en el equipo. Así no es obligatorio descargar
  // Chromium (que pesa y requiere internet la primera vez).
  const todos = [
    { nombre: "Chromium (Playwright)", id: "chromium", extra: {} },
    { nombre: "Google Chrome del sistema", id: "chrome", extra: { channel: "chrome" } },
    { nombre: "Microsoft Edge del sistema", id: "msedge", extra: { channel: "msedge" } },
  ];
  // Si el usuario forzó un navegador en config.json (navegador: "chrome"|"msedge"|"chromium"),
  // lo ponemos primero.
  const preferido = (cfg.navegador || "auto").toLowerCase();
  const intentos =
    preferido === "auto"
      ? todos
      : [...todos.filter((t) => t.id === preferido), ...todos.filter((t) => t.id !== preferido)];

  let ultimoError;
  for (const intento of intentos) {
    try {
      const contexto = await chromium.launchPersistentContext(perfilDir, {
        ...opcionesBase,
        ...intento.extra,
      });
      contexto.setDefaultTimeout(cfg.timeoutMs);
      log(`✓ Navegador: ${intento.nombre}`);
      return contexto;
    } catch (e) {
      ultimoError = e;
    }
  }
  throw new Error(
    "No se pudo abrir ningún navegador. Instala Google Chrome (https://google.com/chrome) " +
      "o ejecuta una vez: npx playwright install chromium\nDetalle: " +
      (ultimoError?.message?.split("\n")[0] || "desconocido")
  );
}

// Devuelve true si la página actual ya está dentro del RCV (sesión activa).
async function estaLogueado(page) {
  for (const marcador of SITIO.marcadoresRcv) {
    if (await page.locator(marcador).first().isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

export async function asegurarLogin(page, cfg, log) {
  log("Abriendo el Registro de Compras y Ventas del SII…");
  await page.goto(SITIO.rcvUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);

  if (await estaLogueado(page)) {
    log("✓ Ya hay una sesión activa del SII (no hace falta volver a entrar).");
    return;
  }

  const tieneCredenciales = cfg.credenciales?.rut && cfg.credenciales?.clave;

  if (tieneCredenciales) {
    log("Intentando login automático con RUT + Clave Tributaria…");
    await page.goto(SITIO.loginUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await rellenarPrimero(page, SITIO.login.rut, cfg.credenciales.rut);
    await rellenarPrimero(page, SITIO.login.clave, cfg.credenciales.clave);
    await clickPrimero(page, SITIO.login.submit);
    await page.waitForTimeout(4000);
  }

  if (await estaLogueado(page)) {
    log("✓ Sesión iniciada correctamente.");
    return;
  }

  // Login manual asistido.
  log("");
  log("┌──────────────────────────────────────────────────────────────┐");
  log("│  INICIA SESIÓN EN EL SII EN LA VENTANA DEL NAVEGADOR.         │");
  log("│  Usa tu RUT + Clave Tributaria o Clave Única (incluido 2FA).  │");
  log("│  Cuando veas el Registro de Compras y Ventas, sigo solo.     │");
  log("└──────────────────────────────────────────────────────────────┘");
  log("");
  if (cfg.headless) {
    throw new Error(
      "No hay sesión y headless=true. Pon \"headless\": false en config.json para iniciar sesión la primera vez."
    );
  }
  await page.goto(SITIO.rcvUrl, { waitUntil: "domcontentloaded" }).catch(() => {});

  // Esperamos hasta ~5 minutos a que el usuario complete el login.
  const limite = Date.now() + 5 * 60 * 1000;
  while (Date.now() < limite) {
    if (await estaLogueado(page)) {
      log("✓ Sesión iniciada. Continúo con las descargas.");
      return;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error("No se detectó la sesión del SII a tiempo. Vuelve a ejecutar e inicia sesión.");
}

// Intenta seleccionar el periodo (año/mes) y descargar el detalle CSV de un tipo
// de operación (COMPRA o VENTA). Devuelve la ruta del archivo guardado o null.
async function descargarDetalle(page, cfg, { tipo, anio, mes, destinoDir, log }) {
  const etiqueta = tipo === "COMPRA" ? "Compras" : "Ventas";
  log(`  • ${etiqueta}: preparando descarga…`);

  // 1) Asegurar que estamos en el RCV.
  await page.goto(SITIO.rcvUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2000);

  // 2) Seleccionar el tipo de operación (pestaña COMPRA / VENTA).
  await clickPrimero(page, [
    `role=tab[name=/${tipo}/i]`,
    `text=/^\\s*${tipo}\\s*$/i`,
    `button:has-text("${tipo}")`,
  ]).catch(() => {});
  await page.waitForTimeout(800);

  // 3) Seleccionar año y mes si hay selectores visibles. El SII suele usar un
  //    <select> de año y botones de mes; probamos varias formas con tolerancia.
  await intentarSeleccionarPeriodo(page, anio, mes, log);

  // 4) Disparar la descarga del detalle (CSV) capturando el evento de descarga.
  try {
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: cfg.timeoutMs }),
      (async () => {
        // Abrir menú/botón de descarga y elegir CSV.
        await clickPrimero(page, [
          'button:has-text("Descargar")',
          'a:has-text("Descargar")',
          'text=/Descargar.*detalle/i',
        ]);
        await page.waitForTimeout(600);
        await clickPrimero(page, [
          'text=/CSV/i',
          'a:has-text("CSV")',
          'li:has-text("CSV")',
        ]).catch(() => {});
      })(),
    ]);
    const nombre = `RCV_${etiqueta}_${anio}-${String(mes).padStart(2, "0")}_${(await sugerirNombre(descarga))}`;
    const ruta = join(destinoDir, nombre);
    await descarga.saveAs(ruta);
    log(`    ✓ Guardado: ${nombre}`);
    return ruta;
  } catch (e) {
    log(`    ⚠ No se pudo descargar ${etiqueta} automáticamente (${e.message.split("\n")[0]}).`);
    return null;
  }
}

async function sugerirNombre(descarga) {
  const sugerido = descarga.suggestedFilename();
  return sugerido && sugerido.includes(".") ? sugerido : "detalle.csv";
}

async function intentarSeleccionarPeriodo(page, anio, mes, log) {
  // Año: probar un <select> que contenga el año.
  const selectAnio = page.locator("select").filter({ hasText: String(anio) }).first();
  if (await selectAnio.count().catch(() => 0)) {
    await selectAnio.selectOption({ label: String(anio) }).catch(() => {});
  }
  // Mes: el SII muestra los meses por nombre. Hacemos click en el nombre del mes.
  const nombresMes = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const nombreMes = nombresMes[mes - 1];
  await clickPrimero(page, [
    `button:has-text("${nombreMes}")`,
    `a:has-text("${nombreMes}")`,
    `td:has-text("${nombreMes}")`,
    `text=/^\\s*${nombreMes}\\s*$/i`,
  ]).catch(() => {});
  await page.waitForTimeout(1200);
}

// Modo asistido: deja la ventana abierta en el RCV un rato y guarda CUALQUIER
// descarga que el usuario dispare a mano. Red de seguridad si los botones
// automáticos no calzan con la versión actual del sitio.
async function capturaAsistida(page, cfg, { destinoDir, segundos = 90, log }) {
  log(`  • Modo asistido: descarga a mano lo que necesites (${segundos}s). Guardo todo automáticamente.`);
  const fin = Date.now() + segundos * 1000;
  let n = 0;
  while (Date.now() < fin) {
    try {
      const descarga = await page.waitForEvent("download", { timeout: 5000 });
      n++;
      const ruta = join(destinoDir, descarga.suggestedFilename() || `descarga-${n}`);
      await descarga.saveAs(ruta);
      log(`    ✓ Capturado: ${descarga.suggestedFilename()}`);
    } catch {
      /* sin descargas en este intervalo */
    }
  }
  return n;
}

// Procesa un RUT completo para el periodo dado.
export async function procesarRut(page, cfg, { rut, nombre, anio, mes, baseDir, log }) {
  const destinoDir = join(baseDir);
  mkdirSync(destinoDir, { recursive: true });

  let descargados = 0;
  if (cfg.descargarCompras) {
    if (await descargarDetalle(page, cfg, { tipo: "COMPRA", anio, mes, destinoDir, log })) descargados++;
  }
  if (cfg.descargarVentas) {
    if (await descargarDetalle(page, cfg, { tipo: "VENTA", anio, mes, destinoDir, log })) descargados++;
  }

  // Si no se logró ninguna descarga automática y el navegador es visible,
  // ofrecemos la captura asistida como red de seguridad.
  if (descargados === 0 && !cfg.headless) {
    await capturaAsistida(page, cfg, { destinoDir, log });
  }

  return descargados;
}
