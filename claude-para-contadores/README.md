# ❦ Claude para Contadores 2.0

App práctica para flujos de trabajo financieros, con la estética de libro
contable clásico del aviso original. Funciona completa en el navegador, sin
servidor, sin dependencias y sin conexión a internet.

## Cómo usarla

1. Abre `index.html` en tu navegador (doble clic, o arrástralo a una pestaña).
2. Pulsa **QUIERO ACCESO** para entrar a la aplicación.
3. Todos los datos se guardan automáticamente en el navegador (`localStorage`).

## Módulos

| Módulo | Qué hace |
|---|---|
| 📈 **Flujo de Caja** | Registro de ingresos y egresos en CLP, resumen del mes, saldo acumulado, gráfico de los últimos 6 meses y exportación a CSV (compatible con Excel). Incluye botón de datos de ejemplo. |
| 🔎 **Investigación Fiscal** | Base de consulta de tributación chilena (IVA, F29, F22, regímenes del art. 14, retención de honorarios, plazos, prescripción, etc.) con buscador y filtros, más un cuaderno de apuntes propio con guardado automático. |
| 📊 **Proyecciones** | Proyección de ingresos, egresos y resultado acumulado a 3–24 meses, con supuestos de crecimiento. Puede tomar como base el promedio de los últimos 3 meses del Flujo de Caja. |
| 📄 **Documentos** | Generador de documentos para clientes: informe tributario mensual, propuesta de honorarios, recordatorio de vencimiento F29 y solicitud de antecedentes. Con vista previa, copia, impresión/PDF, descarga y historial. |
| 🖋️ **Auditoría** | Listas de control por período: cierre mensual de IVA, remuneraciones y previsión, honorarios (BHE) y Operación Renta, con barra de avance guardada mes a mes. |

Desde el **Escritorio** (Inicio) puedes además exportar e importar un respaldo
completo de tus datos en formato JSON.

## Advertencia sobre el contenido tributario

El módulo de Investigación Fiscal es material de referencia general. Las tasas
y plazos cambian: verifica siempre la información vigente en
[sii.cl](https://www.sii.cl) y [leychile.cl](https://www.bcn.cl/leychile) antes
de tomar decisiones.

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Portada (réplica del aviso) y estructura de los 5 módulos |
| `styles.css` | Estilos: papel de libro contable, marcos ornamentados, tipografía serif |
| `app.js` | Lógica completa: navegación, módulos, gráficos SVG y persistencia |
