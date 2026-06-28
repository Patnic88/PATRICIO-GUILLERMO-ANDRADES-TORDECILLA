/**
 * Datos de ejemplo para el bot de contabilidad.
 * Cada movimiento tiene esta forma:
 *
 *   {
 *     id: "m-001",            // identificador único
 *     tipo: "gasto",          // "ingreso" | "gasto"
 *     descripcion: "...",     // qué fue el movimiento
 *     monto: 12000,           // valor en pesos (número entero, sin separadores)
 *     categoria: "Insumos",   // ver CATEGORIAS más abajo
 *     fecha: "2026-06-10"     // formato AAAA-MM-DD
 *   }
 *
 * Estos datos sólo se usan la primera vez (o al pulsar "Restaurar datos de
 * ejemplo"). Después tu información real se guarda en el navegador.
 */

window.CATEGORIAS = {
  ingreso: ["Sueldo", "Honorarios", "Ventas", "Reembolso", "Otros ingresos"],
  gasto: [
    "Arriendo",
    "Servicios básicos",
    "Insumos",
    "Transporte",
    "Alimentación",
    "Impuestos",
    "Salud",
    "Otros gastos"
  ]
};

window.MOVIMIENTOS_SEED = [
  { id: "m-001", tipo: "ingreso", descripcion: "Sueldo mensual",            monto: 1250000, categoria: "Sueldo",           fecha: "2026-06-05" },
  { id: "m-002", tipo: "gasto",   descripcion: "Arriendo oficina",          monto: 380000,  categoria: "Arriendo",         fecha: "2026-06-05" },
  { id: "m-003", tipo: "gasto",   descripcion: "Cuenta de luz",             monto: 42500,   categoria: "Servicios básicos", fecha: "2026-06-08" },
  { id: "m-004", tipo: "gasto",   descripcion: "Cuenta de agua",            monto: 18300,   categoria: "Servicios básicos", fecha: "2026-06-08" },
  { id: "m-005", tipo: "gasto",   descripcion: "Internet y telefonía",      monto: 29990,   categoria: "Servicios básicos", fecha: "2026-06-09" },
  { id: "m-006", tipo: "ingreso", descripcion: "Honorarios asesoría legal", monto: 450000,  categoria: "Honorarios",       fecha: "2026-06-12" },
  { id: "m-007", tipo: "gasto",   descripcion: "Resma de papel y tóner",    monto: 34900,   categoria: "Insumos",          fecha: "2026-06-12" },
  { id: "m-008", tipo: "gasto",   descripcion: "Bencina",                   monto: 40000,   categoria: "Transporte",       fecha: "2026-06-15" },
  { id: "m-009", tipo: "gasto",   descripcion: "Almuerzos del mes",         monto: 95000,   categoria: "Alimentación",     fecha: "2026-06-18" },
  { id: "m-010", tipo: "gasto",   descripcion: "Pago PPM / impuestos",      monto: 67000,   categoria: "Impuestos",        fecha: "2026-06-20" },
  { id: "m-011", tipo: "ingreso", descripcion: "Reembolso gastos viaje",    monto: 88000,   categoria: "Reembolso",        fecha: "2026-06-22" }
];
