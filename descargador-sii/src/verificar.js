// Comprobador de requisitos. Ejecuta:  npm run verificar
//
// Revisa que este computador tenga todo lo necesario para usar el descargador:
//  - Node.js 18 o superior
//  - El módulo Playwright instalado
//  - Algún navegador disponible (Chromium de Playwright, Chrome o Edge)

import process from "node:process";

async function main() {
  console.log("Comprobando requisitos del Descargador SII…\n");
  let ok = true;

  // 1) Node.js
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 18) {
    console.log(`✓ Node.js ${process.version}`);
  } else {
    console.log(`✗ Node.js ${process.version} — se requiere la versión 18 o superior (https://nodejs.org)`);
    ok = false;
  }

  // 2) Playwright instalado
  let playwright = null;
  try {
    playwright = await import("playwright");
    console.log("✓ Playwright instalado");
  } catch {
    console.log("✗ Playwright no instalado — ejecuta:  npm install");
    ok = false;
  }

  // 3) Navegador disponible
  if (playwright) {
    const { chromium } = playwright;
    const intentos = [
      ["Chromium (Playwright)", {}],
      ["Google Chrome", { channel: "chrome" }],
      ["Microsoft Edge", { channel: "msedge" }],
    ];
    let encontrado = null;
    for (const [nombre, extra] of intentos) {
      try {
        const navegador = await chromium.launch({ headless: true, ...extra });
        await navegador.close();
        encontrado = nombre;
        break;
      } catch {
        /* probar el siguiente */
      }
    }
    if (encontrado) {
      console.log(`✓ Navegador disponible: ${encontrado}`);
    } else {
      console.log(
        "✗ Ningún navegador disponible — instala Google Chrome (https://google.com/chrome)\n" +
          "   o ejecuta una vez:  npx playwright install chromium"
      );
      ok = false;
    }
  }

  console.log("");
  console.log(ok ? "RESULTADO: ✓ Todo listo para usar." : "RESULTADO: ✗ Faltan requisitos (revisa los ✗ de arriba).");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("Error al comprobar:", e.message);
  process.exit(1);
});
