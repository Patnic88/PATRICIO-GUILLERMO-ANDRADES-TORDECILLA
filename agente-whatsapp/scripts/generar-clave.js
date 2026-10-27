// Genera el hash de la clave del panel para ADMIN_CLAVE_HASH.
// Uso: npm run clave   (pide la clave sin mostrarla)
import { createInterface } from "node:readline";
import { hashClave } from "../src/servicios/seguridad.js";

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => { if (s.includes("Clave")) process.stdout.write(s); };
rl.question("Clave para el panel (mínimo 12 caracteres): ", (clave) => {
  rl.close();
  process.stdout.write("\n");
  if (!clave || clave.length < 12) { console.error("La clave debe tener al menos 12 caracteres."); process.exit(1); }
  console.log(`\nAgregue esta línea a su archivo .env:\nADMIN_CLAVE_HASH=${hashClave(clave)}`);
});
