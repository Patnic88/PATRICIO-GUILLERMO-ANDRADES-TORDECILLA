# 📋 Lista de Tareas — Patricio Andrades

Lista de tareas web, sin servidor, **conectada a tu correo de Gmail**. Las tareas
iniciales se extrajeron de tus correos recientes de la Dirección Jurídica de la
Municipalidad de Los Vilos, y cada una enlaza directamente al hilo original en Gmail.

## Cómo usarla

1. Abre `index.html` en tu navegador (doble clic, o arrástralo a una pestaña).
2. Marca tareas como completadas, agrégalas, elimínalas o fíltralas por prioridad.
3. Pulsa **🔗 Ver correo** en cualquier tarea para abrir el correo original en Gmail.

Tu progreso se guarda automáticamente en el navegador (`localStorage`), así que
se conserva entre visitas. El botón **"Restaurar tareas de mis correos"** vuelve a
cargar la lista original.

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos |
| `app.js` | Lógica: filtros, alta/baja, persistencia |
| `tasks.seed.js` | Tareas extraídas de tus correos (datos editables) |

## Actualizar las tareas desde el correo

Las tareas en `tasks.seed.js` son una "fotografía" de tus correos al **1 de junio de
2026**. Para regenerarlas o ampliarlas, pídele a Claude que vuelva a revisar tus
correos destacados/etiquetados en Gmail y actualice ese archivo.

Cada tarea tiene esta forma:

```js
{
  id: "g-<threadId>",       // identificador único
  titulo: "...",            // qué hay que hacer
  detalle: "...",           // contexto del correo
  categoria: "Judicial",    // Judicial | Convenios | Transparencia | Concejo | Administrativo | Otro
  prioridad: "alta",        // alta | media | baja
  vence: "2026-05-29",      // fecha (opcional, formato AAAA-MM-DD)
  de: "remitente@...",      // remitente del correo
  threadId: "19e7...",      // hilo de Gmail para el enlace
  hecha: false
}
```

## 🔄 Sincronización automática con Gmail (opcional)

Puedes hacer que la lista se llene **sola** con los correos que etiquetes con
`📋 Tarea` en Gmail, sin tener que pedirlo. Funciona con un Google Apps Script
que corre dentro de tu propia cuenta de Google (sin servidores ni contraseñas).

**Configuración (una sola vez, ~5 minutos):**

1. Abre `gmail-sync.gs` y sigue las instrucciones del encabezado: crea el
   proyecto en <https://script.google.com>, pega el script y publícalo como
   **Aplicación web**.
2. Copia la URL que termina en `/exec`.
3. Pégala en `config.js`:
   ```js
   window.SYNC_URL = "https://script.google.com/macros/s/XXXX/exec";
   ```
4. Abre `index.html`. La lista se actualizará automáticamente desde tus correos
   etiquetados cada vez que la abras.

Mientras `SYNC_URL` esté vacío, la app usa las tareas locales de `tasks.seed.js`.
Al sincronizar, se conserva el estado de las tareas que ya marcaste como
completadas y las que agregaste a mano.

| Archivo | Rol en la sincronización |
|---|---|
| `gmail-sync.gs` | Apps Script que lee la etiqueta `📋 Tarea` y entrega JSON |
| `config.js` | Donde pegas la URL del Apps Script |

## Integraciones ya configuradas

- ✅ Etiqueta **`📋 Tarea`** creada en Gmail y aplicada a los correos pendientes.
- ✅ Recordatorios en **Google Calendar** para las tareas de alta prioridad.
- ✅ Borradores de respuesta guardados en Gmail para los correos que requieren
  contestación.

---

# ⚖️ Consultor Laboral y Tributario · Chile

Proyecto especial de apoyo para **consultas laborales y tributarias de Chile**.
Es una herramienta web autocontenida (sin servidor, igual que la lista de
tareas) pensada para resolver consultas frecuentes y hacer estimaciones rápidas
en la Dirección Jurídica.

**Ábrelo desde `consultas.html`** (o con el botón *"⚖️ Consultor laboral y
tributario"* en la lista de tareas).

## Qué incluye

| Pestaña | Para qué sirve |
|---|---|
| 📚 **Consultas** | Banco de preguntas frecuentes (laborales, previsionales y tributarias) con respuesta y **fundamento legal** (artículos del Código del Trabajo y normas tributarias). Buscable, filtrable por área y ampliable. |
| 🧮 **Finiquito** | Calcula indemnización por años de servicio (tope 11 años / 90 UF), sustitutiva del aviso previo y feriado proporcional, según la causal de término. |
| 💼 **Liquidación** | Estima descuentos previsionales (AFP, salud, cesantía) e impuesto único sobre el sueldo bruto, y el líquido aproximado. |
| 📊 **Impuesto único** | Aplica la tabla del Impuesto Único de 2ª Categoría (SII) y muestra el tramo aplicable. |
| 📌 **Valores** | Indicadores y topes vigentes (UF, UTM, ingreso mínimo, topes imponibles, etc.). |

El banco de consultas se guarda en el navegador (`localStorage`): puedes agregar
consultas propias y restaurar el banco original cuando quieras.

## Archivos del módulo

| Archivo | Descripción |
|---|---|
| `consultas.html` | Página del consultor (pestañas y formularios) |
| `consultas.css` | Estilos propios (reutiliza `styles.css`) |
| `consultas.js` | Lógica: calculadoras, banco de consultas, persistencia |
| `referencias.js` | **Valores vigentes, tabla de impuesto y banco de consultas** (datos editables) |

## ⚠️ Cómo mantenerlo al día

Los montos de `referencias.js` (UF, UTM, ingreso mínimo, topes, tabla de
impuesto) son **referenciales** y cambian con el tiempo. Antes de usar un
cálculo en un caso real, **verifica el valor vigente** en la fuente oficial y
edita `referencias.js`:

- UF / UTM / tabla de impuesto → <https://www.sii.cl>
- Ingreso mínimo y normas laborales → <https://www.dt.gob.cl>
- Topes imponibles → <https://www.spensiones.cl>

Todos los cálculos se recalculan solos al editar esos valores. Esta herramienta
es de **apoyo**: no reemplaza el análisis jurídico del caso ni la normativa
vigente.
