// Fechas en la zona horaria de la oficina sin dependencias externas.

function partes(fecha, tz) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short"
  });
  const o = {};
  for (const p of f.formatToParts(fecha)) o[p.type] = p.value;
  return o;
}

// Fecha/hora local ("2026-11-03", "09:30") en la zona tz → Date (instante UTC).
export function localAUtc(fechaIso, hora, tz) {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  let t = Date.UTC(a, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const p = partes(new Date(t), tz);
    const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    const deseado = Date.UTC(a, m - 1, d, hh, mm);
    if (visto === deseado) break;
    t += deseado - visto;
  }
  return new Date(t);
}

// Fecha local "AAAA-MM-DD" de un instante.
export function fechaLocal(fecha, tz) {
  const p = partes(fecha, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function horaLocal(fecha, tz) {
  const p = partes(fecha, tz);
  return `${p.hour}:${p.minute}`;
}

// Día de la semana local: 1 = lunes … 7 = domingo.
export function diaSemanaLocal(fecha, tz) {
  const dias = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return dias[partes(fecha, tz).weekday];
}

export function sumarDias(fechaIso, n) {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// Texto legible en español de Chile, por ejemplo "martes 3 de noviembre, 09:30".
export function describir(fecha, tz, { anio = false } = {}) {
  const txt = new Intl.DateTimeFormat("es-CL", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long", ...(anio ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(fecha);
  return txt.replace(/\s+/g, " ");
}
