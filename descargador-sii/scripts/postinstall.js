// Postinstall a prueba de fallos.
//
// Intenta descargar el navegador Chromium de Playwright, pero NUNCA hace fallar
// la instalación: si no hay internet o el proxy lo bloquea, el programa igual
// puede usar Google Chrome o Microsoft Edge que ya estén instalados en el equipo.

import { execSync } from "node:child_process";

try {
  console.log("Descargando el navegador Chromium (sólo la primera vez)…");
  execSync("npx playwright install chromium", { stdio: "inherit" });
  console.log("✓ Chromium listo.");
} catch {
  console.warn(
    "\n[aviso] No se pudo descargar Chromium ahora.\n" +
      "        No es un problema: si tienes Google Chrome o Microsoft Edge\n" +
      "        instalado, el programa los usará automáticamente.\n" +
      "        Si no, conéctate a internet y ejecuta una vez:\n" +
      "            npx playwright install chromium\n"
  );
}

// Salir siempre con éxito para no abortar `npm install`.
process.exit(0);
