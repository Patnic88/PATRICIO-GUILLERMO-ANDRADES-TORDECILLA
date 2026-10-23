// RUT chileno: normalización y dígito verificador (módulo 11).

export function normalizarRut(entrada) {
  const limpio = String(entrada || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return null;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d{1,9}$/.test(cuerpo)) return null;
  return `${Number(cuerpo)}-${dv}`;
}

export function dvRut(cuerpo) {
  let suma = 0, mul = 2;
  for (let i = String(cuerpo).length - 1; i >= 0; i--) {
    suma += Number(String(cuerpo)[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

export function rutValido(entrada) {
  const n = normalizarRut(entrada);
  if (!n) return false;
  const [cuerpo, dv] = n.split("-");
  return dvRut(cuerpo) === dv;
}
