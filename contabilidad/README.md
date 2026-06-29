# 💰 Bot de Contabilidad — Patricio Andrades

App web de contabilidad personal/profesional, **sin servidor** y **sin instalar
nada**. Registra ingresos y gastos, calcula tu saldo, te muestra en qué se va el
dinero por categoría y exporta todo a CSV (Excel). Tus datos se guardan en tu
propio navegador.

### Funciones

- 💵 **Ingresos y gastos** con categorías personalizables.
- 📊 **Presupuesto mensual** de gastos con barra de progreso y **alertas**
  (aviso al llegar al 80% y al sobrepasar el 100% del tope).
- 🥧 **Gráfico de torta** de gastos por categoría, con leyenda y porcentajes.
- 📈 **Resumen mensual**: barras comparativas de ingresos vs gastos de los
  últimos meses.
- 🌎 **Multi-moneda** (CLP, USD, EUR): cada movimiento guarda su moneda y los
  totales se convierten a la moneda base (peso chileno).
- ✏️ **Editar movimientos**: botón ✎ en cada fila para corregir cualquier dato.
- 🗂️ **Subcategorías**: clasifica con más detalle (ej. dentro de "Servicios
  básicos": Luz, Agua, Internet). Son opcionales y editables.
- 🎯 **Meta de ahorro**: defines un objetivo y la app sigue tu progreso (medido
  con tu saldo total acumulado).
- 📉 **Evolución del saldo**: gráfico de línea con tu saldo acumulado mes a mes.
- ⬆ **Importar CSV del banco**: carga la cartola y los movimientos se agregan
  solos (montos negativos → gastos, positivos → ingresos).
- ⬇ **Exportar a CSV** (UTF-8, listo para Excel / Google Sheets).
- 💾 **Respaldo y restauración**: guarda todos tus datos en un archivo `.json`
  y vuelve a cargarlos cuando quieras (ideal para mover tus datos a otro PC o
  no depender solo del navegador).
- 💾 **Guardado automático** en el navegador (`localStorage`).

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

## Crear un acceso directo en el Escritorio

Para abrir la app con un ícono en tu escritorio (sin buscar la carpeta cada vez),
ejecuta **una sola vez** el script según tu sistema. Crea un acceso "Contabilidad"
en el escritorio que abre `index.html` en tu navegador:

| Sistema | Qué ejecutar |
|---|---|
| 🪟 **Windows** | Doble clic en `crear-acceso-directo-windows.bat` |
| 🍎 **macOS** | Doble clic en `crear-acceso-directo-mac.command` (si pide permisos: `chmod +x crear-acceso-directo-mac.command`) |
| 🐧 **Linux** | Ejecuta `./crear-acceso-directo-linux.sh` |

> Los scripts no instalan nada ni piden permisos de administrador: solo crean un
> enlace al archivo `index.html` que ya tienes.

## Importar la cartola del banco

1. Descarga el movimiento de tu cuenta en formato **CSV** desde el sitio del banco.
2. En la app, pulsa **⬆ Importar CSV** y elige el archivo.
3. La app detecta automáticamente las columnas de fecha, descripción y monto.
   Confirma y los movimientos se agregan (negativos como gasto, positivos como
   ingreso, categoría "Otros" que luego puedes editar con el botón ✎).

Incluye un archivo `ejemplo-banco.csv` para que pruebes cómo funciona.

## Respaldar y restaurar tus datos

Como los datos viven en tu navegador, conviene respaldarlos de vez en cuando:

- **💾 Respaldar datos** (pie de página): descarga un archivo
  `respaldo-contabilidad-AAAA-MM-DD.json` con todos tus movimientos, el
  presupuesto y la meta.
- **📂 Restaurar respaldo**: carga ese archivo en cualquier momento o en otro
  computador para recuperar exactamente tus datos.

## Subcategorías

Edita `window.SUBCATEGORIAS` en `data.seed.js` para definir, por cada categoría,
una lista de subcategorías opcionales:

```js
window.SUBCATEGORIAS = {
  "Servicios básicos": ["Luz", "Agua", "Gas", "Internet", "Teléfono"],
  "Transporte": ["Bencina", "Estacionamiento", "Peajes"]
};
```

Si una categoría no aparece en esa lista, el selector de subcategoría queda
deshabilitado (es totalmente opcional).

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos |
| `app.js` | Lógica: KPIs, presupuesto, meta, torta, resumen mensual, multi-moneda, edición, import/export CSV, persistencia |
| `data.seed.js` | Monedas, categorías, presupuesto y datos de ejemplo (editables) |
| `ejemplo-banco.csv` | Cartola de ejemplo para probar la importación |
| `crear-acceso-directo-*` | Scripts para crear el ícono en el escritorio (Windows/Mac/Linux) |

## Configurar monedas y tipo de cambio

Abre `data.seed.js` y edita `window.MONEDAS`. La moneda base es el peso chileno
(`CLP`); `tasaCLP` es cuántos pesos vale 1 unidad de esa moneda:

```js
window.MONEDAS = {
  CLP: { simbolo: "$",   nombre: "Peso chileno", tasaCLP: 1,    decimales: 0 },
  USD: { simbolo: "US$", nombre: "Dólar",        tasaCLP: 980,  decimales: 2 },
  EUR: { simbolo: "€",   nombre: "Euro",         tasaCLP: 1050, decimales: 2 }
};
```

Actualiza los valores de `tasaCLP` cuando cambie el tipo de cambio. El
presupuesto mensual por defecto se define en `window.PRESUPUESTO_DEFAULT`
(también editable desde la propia app, donde queda guardado).

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
  monto: 12000,           // valor en la moneda indicada (sin puntos ni símbolos)
  moneda: "CLP",          // "CLP" | "USD" | "EUR" (ver MONEDAS)
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
