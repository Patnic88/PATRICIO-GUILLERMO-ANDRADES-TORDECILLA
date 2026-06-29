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
| `pdf-lector.html` | Lector de PDF en voz alta |
| `pdf-lector.css` | Estilos del lector de PDF |
| `pdf-lector.js` | Lógica del lector: extracción de texto y voz |

## 🔊 Lector de PDF en voz alta

Abre `pdf-lector.html` (o pulsa **🔊 Lector de PDF** en el encabezado de la
lista de tareas) para hacer que tu navegador lea documentos PDF en voz alta.

**Cómo usarlo:**

1. Arrastra un PDF a la zona de carga (o haz clic para elegirlo).
2. El texto se extrae en tu propio navegador con [`pdf.js`](https://mozilla.github.io/pdf.js/) — **el archivo no se sube a ningún servidor**.
3. Pulsa **▶︎ Reproducir**. La frase que se está leyendo se resalta en amarillo.
4. Puedes **pausar**, **reanudar** o **detener**, y hacer clic en cualquier frase para empezar a leer desde ahí.
5. En **⚙️ Ajustes de voz** eliges la voz (las de español aparecen primero), la velocidad y el tono.

> La lectura usa la API de voz del navegador (Web Speech). Funciona mejor en
> **Chrome, Edge y Safari**. Si un PDF está escaneado (solo imágenes, sin texto
> seleccionable), no habrá texto que leer.

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
