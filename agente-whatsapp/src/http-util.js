// Utilidades HTTP mínimas (sin framework).

export class ErrorHttp extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

export function leerCuerpo(req, limite = 1_000_000) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > limite) { reject(new ErrorHttp(413, "cuerpo_demasiado_grande")); req.destroy(); return; }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });
}

export function cabecerasSeguridad(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  res.setHeader("Cache-Control", "no-store");
}

export function enviar(res, estado, cuerpo, tipo = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(estado, { "Content-Type": tipo, ...extra });
  res.end(cuerpo);
}

export const html = (res, cuerpo, estado = 200, extra = {}) => enviar(res, estado, cuerpo, "text/html; charset=utf-8", extra);
export const json = (res, datos, estado = 200) => enviar(res, estado, JSON.stringify(datos), "application/json; charset=utf-8");
export const redirigir = (res, destino, extra = {}) => { res.writeHead(303, { Location: destino, ...extra }); res.end(); };

export function leerCookies(req) {
  const salida = {};
  for (const par of (req.headers.cookie || "").split(";")) {
    const i = par.indexOf("=");
    if (i <= 0) continue;
    try { salida[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim()); } catch { /* cookie malformada: se ignora */ }
  }
  return salida;
}

export const h = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
