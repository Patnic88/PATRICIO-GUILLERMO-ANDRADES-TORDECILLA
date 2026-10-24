// Utilidades criptográficas: hash de claves (scrypt), comparación en tiempo
// constante y generación de tokens aleatorios.

import { scryptSync, randomBytes, timingSafeEqual, createHash, createHmac, randomInt } from "node:crypto";

const N = 16384, R = 8, P = 1, LARGO = 32;

export function hashClave(clave) {
  const sal = randomBytes(16);
  const h = scryptSync(String(clave), sal, LARGO, { N, r: R, p: P });
  return `scrypt$${sal.toString("hex")}$${h.toString("hex")}`;
}

export function verificarClave(clave, almacenado) {
  if (!almacenado || !almacenado.startsWith("scrypt$")) return false;
  const [, salHex, hHex] = almacenado.split("$");
  const esperado = Buffer.from(hHex, "hex");
  const h = scryptSync(String(clave), Buffer.from(salHex, "hex"), esperado.length, { N, r: R, p: P });
  return timingSafeEqual(h, esperado);
}

export function igualesSeguro(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export const tokenAleatorio = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (datos) => createHash("sha256").update(datos).digest("hex");
export const hmacSha256 = (clave, datos) => createHmac("sha256", clave).update(datos).digest("hex");

// Código de verificación numérico para clientes (se muestra una sola vez en el panel).
export const generarPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
