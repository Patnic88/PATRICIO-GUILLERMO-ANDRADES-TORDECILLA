#!/usr/bin/env node
// Revisa que un carrusel se apoye solo en la ficha del fallo: citas
// literales, cifras y organismos que aparezcan en la nota, rol en la fuente
// y ningún [REDACTAR] pendiente.
//
// Uso:
//   node validar-carrusel.mjs <carpeta>          (spec.json, ficha.json y captions.md de esa carpeta)
//   node validar-carrusel.mjs <spec.json> <ficha.json> [captions.md]
//
// Imprime { ok, errores, avisos }. Código de salida 0 = ok, 2 = hay errores.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { validarCarrusel } from "./jurisprudencia.mjs";

const leer = (ruta) => readFileSync(ruta, "utf8");

try {
  const args = process.argv.slice(2);
  let spec, ficha, captions;
  if (args.length === 1 && statSync(args[0]).isDirectory()) {
    [spec, ficha, captions] = ["spec.json", "ficha.json", "captions.md"].map((n) => join(args[0], n));
    if (!existsSync(captions)) captions = null;
  } else if (args.length === 2 || args.length === 3) {
    [spec, ficha, captions = null] = args;
  } else {
    throw new Error("Uso: node validar-carrusel.mjs <carpeta> | <spec.json> <ficha.json> [captions.md]");
  }
  const r = validarCarrusel(JSON.parse(leer(spec)), JSON.parse(leer(ficha)), captions ? leer(captions) : null);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 2);
} catch (err) {
  console.log(JSON.stringify({ ok: false, errores: [String((err && err.message) || err)], avisos: [] }, null, 2));
  process.exit(2);
}
