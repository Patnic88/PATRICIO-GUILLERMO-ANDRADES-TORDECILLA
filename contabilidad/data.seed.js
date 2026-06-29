/**
 * Datos de ejemplo y configuración del bot de contabilidad.
 *
 * Cada movimiento tiene esta forma:
 *
 *   {
 *     id: "m-001",            // identificador único
 *     tipo: "gasto",          // "ingreso" | "gasto"
 *     descripcion: "...",     // qué fue el movimiento
 *     monto: 12000,           // valor en la moneda indicada (número, sin separadores)
 *     moneda: "CLP",          // "CLP" | "USD" | "EUR" (ver MONEDAS)
 *     categoria: "Insumos",   // ver CATEGORIAS
 *     fecha: "2026-06-10"     // formato AAAA-MM-DD
 *   }
 *
 * Estos datos sólo se usan la primera vez (o al pulsar "Restaurar datos de
 * ejemplo"). Después tu información real se guarda en el navegador.
 */

/* ---------- Monedas y tasas de cambio ----------
   La moneda base es el peso chileno (CLP). "tasaCLP" es cuántos pesos vale
   1 unidad de esa moneda. Edita estos valores para actualizar el tipo de
   cambio cuando quieras. */
window.MONEDA_BASE = "CLP";
window.MONEDAS = {
  CLP: { simbolo: "$",   nombre: "Peso chileno", tasaCLP: 1,    decimales: 0 },
  USD: { simbolo: "US$", nombre: "Dólar",        tasaCLP: 980,  decimales: 2 },
  EUR: { simbolo: "€",   nombre: "Euro",         tasaCLP: 1050, decimales: 2 }
};

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

/* Subcategorías (opcionales) por cada categoría. Si una categoría no aparece
   aquí, simplemente no ofrece subcategorías. Edítalas a tu gusto. */
window.SUBCATEGORIAS = {
  "Servicios básicos": ["Luz", "Agua", "Gas", "Internet", "Teléfono"],
  "Transporte": ["Bencina", "Estacionamiento", "Peajes", "Transporte público", "Mantención"],
  "Alimentación": ["Supermercado", "Restaurante", "Café", "Delivery"],
  "Salud": ["Farmacia", "Consulta médica", "Exámenes", "Dental"],
  "Insumos": ["Oficina", "Tecnología", "Aseo"],
  "Sueldo": ["Base", "Horas extra", "Aguinaldo"],
  "Honorarios": ["Asesoría", "Proyecto", "Capacitación"]
};

/* Presupuesto mensual de gastos por defecto (en moneda base, CLP).
   El usuario puede cambiarlo en la app; queda guardado en el navegador. */
window.PRESUPUESTO_DEFAULT = 800000;

window.MOVIMIENTOS_SEED = [
  { id: "m-001", tipo: "ingreso", descripcion: "Sueldo mensual",            monto: 1250000, moneda: "CLP", categoria: "Sueldo",            fecha: "2026-06-05" },
  { id: "m-002", tipo: "gasto",   descripcion: "Arriendo oficina",          monto: 380000,  moneda: "CLP", categoria: "Arriendo",          fecha: "2026-06-05" },
  { id: "m-003", tipo: "gasto",   descripcion: "Cuenta de luz",             monto: 42500,   moneda: "CLP", categoria: "Servicios básicos", fecha: "2026-06-08" },
  { id: "m-004", tipo: "gasto",   descripcion: "Cuenta de agua",            monto: 18300,   moneda: "CLP", categoria: "Servicios básicos", fecha: "2026-06-08" },
  { id: "m-005", tipo: "gasto",   descripcion: "Internet y telefonía",      monto: 29990,   moneda: "CLP", categoria: "Servicios básicos", fecha: "2026-06-09" },
  { id: "m-006", tipo: "ingreso", descripcion: "Honorarios asesoría legal", monto: 450000,  moneda: "CLP", categoria: "Honorarios",        fecha: "2026-06-12" },
  { id: "m-007", tipo: "gasto",   descripcion: "Resma de papel y tóner",    monto: 34900,   moneda: "CLP", categoria: "Insumos",           fecha: "2026-06-12" },
  { id: "m-008", tipo: "gasto",   descripcion: "Bencina",                   monto: 40000,   moneda: "CLP", categoria: "Transporte",        fecha: "2026-06-15" },
  { id: "m-009", tipo: "gasto",   descripcion: "Almuerzos del mes",         monto: 95000,   moneda: "CLP", categoria: "Alimentación",      fecha: "2026-06-18" },
  { id: "m-010", tipo: "gasto",   descripcion: "Pago PPM / impuestos",      monto: 67000,   moneda: "CLP", categoria: "Impuestos",         fecha: "2026-06-20" },
  { id: "m-011", tipo: "ingreso", descripcion: "Reembolso gastos viaje",    monto: 88000,   moneda: "CLP", categoria: "Reembolso",         fecha: "2026-06-22" },
  { id: "m-012", tipo: "gasto",   descripcion: "Suscripción software (USD)", monto: 29,     moneda: "USD", categoria: "Insumos",           fecha: "2026-05-28" },
  { id: "m-013", tipo: "ingreso", descripcion: "Pago cliente extranjero",   monto: 500,     moneda: "EUR", categoria: "Honorarios",        fecha: "2026-05-15" },
  { id: "m-014", tipo: "gasto",   descripcion: "Arriendo oficina",          monto: 380000,  moneda: "CLP", categoria: "Arriendo",          fecha: "2026-05-05" },
  { id: "m-015", tipo: "gasto",   descripcion: "Supermercado",              monto: 120000,  moneda: "CLP", categoria: "Alimentación",      fecha: "2026-05-10" }
];
