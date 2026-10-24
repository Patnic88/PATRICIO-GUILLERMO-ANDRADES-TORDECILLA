// Validación mínima de JSON Schema para las entradas de herramientas. Las
// entradas vienen del modelo y se tratan como datos no confiables.

export function validar(esquema, valor, ruta = "entrada") {
  const errores = [];
  const t = esquema.type;
  if (t === "object") {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return [`${ruta}: debe ser un objeto`];
    for (const req of esquema.required || []) if (valor[req] === undefined || valor[req] === null || valor[req] === "") errores.push(`${ruta}.${req}: es obligatorio`);
    for (const [k, v] of Object.entries(valor)) {
      const sub = esquema.properties?.[k];
      if (!sub) { if (esquema.additionalProperties === false) errores.push(`${ruta}.${k}: campo no permitido`); continue; }
      if (v === null || v === undefined) continue;
      errores.push(...validar(sub, v, `${ruta}.${k}`));
    }
  } else if (t === "string") {
    if (typeof valor !== "string") return [`${ruta}: debe ser texto`];
    if (esquema.maxLength && valor.length > esquema.maxLength) errores.push(`${ruta}: supera ${esquema.maxLength} caracteres`);
    if (esquema.enum && !esquema.enum.includes(valor)) errores.push(`${ruta}: valor no permitido (${esquema.enum.join(", ")})`);
  } else if (t === "integer") {
    if (!Number.isInteger(valor)) return [`${ruta}: debe ser un entero`];
  } else if (t === "boolean") {
    if (typeof valor !== "boolean") return [`${ruta}: debe ser verdadero o falso`];
  } else if (t === "array") {
    if (!Array.isArray(valor)) return [`${ruta}: debe ser una lista`];
    if (esquema.maxItems && valor.length > esquema.maxItems) errores.push(`${ruta}: máximo ${esquema.maxItems} elementos`);
    valor.forEach((v, i) => errores.push(...validar(esquema.items, v, `${ruta}[${i}]`)));
  }
  return errores;
}
