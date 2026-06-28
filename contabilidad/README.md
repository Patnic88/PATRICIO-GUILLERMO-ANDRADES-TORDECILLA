# 💰 Bot de Contabilidad — Patricio Andrades

App web de contabilidad personal/profesional, **sin servidor** y **sin instalar
nada**. Registra ingresos y gastos, calcula tu saldo, te muestra en qué se va el
dinero por categoría y exporta todo a CSV (Excel). Tus datos se guardan en tu
propio navegador.

## Cómo usarla

1. Abre `index.html` en tu navegador (doble clic, o arrástralo a una pestaña).
2. Pulsa **+ Nuevo movimiento** para registrar un ingreso o un gasto.
3. Filtra por **mes** o por **tipo** (ingresos / gastos).
4. Revisa el desglose de **gastos por categoría** y tu **saldo** en las tarjetas
   de arriba.
5. Pulsa **⬇ Exportar CSV** para descargar tus movimientos y abrirlos en Excel
   o Google Sheets.

Tu información se guarda automáticamente en el navegador (`localStorage`), así que
se conserva entre visitas. El botón **"Restaurar datos de ejemplo"** vuelve a
cargar los datos de demostración (reemplaza lo que tengas).

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos |
| `app.js` | Lógica: KPIs, filtros, alta/baja, categorías, CSV, persistencia |
| `data.seed.js` | Categorías y datos de ejemplo (editables) |

## Personalizar las categorías

Abre `data.seed.js` y edita `window.CATEGORIAS`. Hay dos listas, una para
ingresos y otra para gastos:

```js
window.CATEGORIAS = {
  ingreso: ["Sueldo", "Honorarios", "Ventas", "Reembolso", "Otros ingresos"],
  gasto:   ["Arriendo", "Servicios básicos", "Insumos", /* ... */]
};
```

Cada movimiento tiene esta forma:

```js
{
  id: "m-001",            // identificador único
  tipo: "gasto",          // "ingreso" | "gasto"
  descripcion: "...",     // qué fue el movimiento
  monto: 12000,           // valor en pesos (número entero, sin puntos ni símbolos)
  categoria: "Insumos",   // debe existir en CATEGORIAS
  fecha: "2026-06-10"     // formato AAAA-MM-DD
}
```

## Notas

- Los montos se muestran formateados en pesos chilenos (`$1.250.000`).
- El cálculo de **saldo** = ingresos − gastos del filtro activo.
- El CSV se exporta con codificación UTF-8 (con BOM) para que los acentos se
  vean bien en Excel.
- No se envía nada a internet: todo ocurre en tu navegador.
