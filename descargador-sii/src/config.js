// Carga y validación de la configuración del descargador.
// - config.json (si existe) sobre-escribe los valores por defecto.
// - ruts.txt entrega la lista de RUT a procesar.

import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(__dirname, "..");

const POR_DEFECTO = {
  periodo: "mes-anterior",
  carpetaDescargas: "descargas",
  descargarCompras: true,
  descargarVentas: true,
  descargarPDFs: false,
  navegador: "auto",
  headless: false,
  timeoutMs: 60000,
  credenciales: { rut: "", clave: "" },
};

// Quita las claves "comentario" (las que empiezan con //) de un objeto JSON.
function sinComentarios(obj) {
  if (Array.isArray(obj)) return obj.map(sinComentarios);
  if (obj && typeof obj === "object") {
    const limpio = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("//")) continue;
      limpio[k] = sinComentarios(v);
    }
    return limpio;
  }
  return obj;
}

export function cargarConfig() {
  const ruta = join(RAIZ, "config.json");
  let usuario = {};
  if (existsSync(ruta)) {
    try {
      usuario = sinComentarios(JSON.parse(readFileSync(ruta, "utf8")));
    } catch (e) {
      throw new Error(`No se pudo leer config.json: ${e.message}`);
    }
  }
  const cfg = {
    ...POR_DEFECTO,
    ...usuario,
    credenciales: { ...POR_DEFECTO.credenciales, ...(usuario.credenciales || {}) },
  };

  // Normaliza la carpeta de descargas a ruta absoluta.
  cfg.carpetaDescargasAbs = isAbsolute(cfg.carpetaDescargas)
    ? cfg.carpetaDescargas
    : join(RAIZ, cfg.carpetaDescargas);

  return cfg;
}

// Devuelve { anio, mes } (mes 1-12) según la configuración de periodo.
export function resolverPeriodo(periodo, hoy = new Date()) {
  if (typeof periodo === "string" && /^\d{4}-\d{2}$/.test(periodo)) {
    const [anio, mes] = periodo.split("-").map(Number);
    return { anio, mes };
  }
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  if (periodo === "mes-anterior") d.setMonth(d.getMonth() - 1);
  // "mes-actual" => sin cambios
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}

export function etiquetaPeriodo({ anio, mes }) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

// Lee ruts.txt -> [{ rut, nombre }]
export function cargarRuts() {
  const ruta = join(RAIZ, "ruts.txt");
  if (!existsSync(ruta)) {
    throw new Error("Falta el archivo ruts.txt. Crea uno con un RUT por línea.");
  }
  const lineas = readFileSync(ruta, "utf8").split(/\r?\n/);
  const ruts = [];
  for (const linea of lineas) {
    const t = linea.trim();
    if (!t || t.startsWith("#")) continue;
    const [rutBruto, ...resto] = t.split(",");
    const rut = normalizarRut(rutBruto);
    if (!rut) continue;
    ruts.push({ rut, nombre: resto.join(",").trim() || "" });
  }
  if (ruts.length === 0) {
    throw new Error("ruts.txt no tiene ningún RUT válido. Agrega al menos uno (ej: 76123456-7).");
  }
  return ruts;
}

// Limpia y valida un RUT. Devuelve "NNNNNNNN-D" o null si es inválido.
export function normalizarRut(valor) {
  if (!valor) return null;
  const limpio = valor.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
  const m = limpio.match(/^(\d{1,8})-?([0-9K])$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}
