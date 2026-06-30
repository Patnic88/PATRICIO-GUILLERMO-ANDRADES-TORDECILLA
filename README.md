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

## ⚖️ Módulo: Predicción de Juicios (Corte Suprema)

Abre `prediccion.html` (o pulsa **⚖️ Predicción de Juicios** desde la lista de tareas).
Estima la probabilidad de que la Corte Suprema **acoja** un recurso, comparando tu
caso con tu propia base de jurisprudencia.

**Cómo funciona (transparente y auditable):**

1. **Describes tu caso**: tipo de recurso, sala, tema y los hechos/argumentos.
2. El módulo compara tu caso con cada fallo de tu base por: coincidencia de
   recurso, de sala, de tema y solape de palabras clave del texto.
3. Pondera cada fallo por su **similitud** y por su **antigüedad** (los fallos
   recientes pesan más).
4. Entrega una **probabilidad estimada**, un **nivel de confianza** y los
   **fallos más influyentes** con su criterio, para que los revises. Cada fallo
   muestra **en qué términos coincide** con tu caso (motor TF‑IDF), para que la
   estimación sea auditable.

También puedes **comparar dos enfoques** del mismo litigio (botón **⚖️ Comparar
dos enfoques (A/B)**): describes dos hipótesis y la herramienta indica cuál
tiene mayor respaldo en tu jurisprudencia.

> ⚠️ **Es una herramienta de apoyo, no un oráculo.** La estimación vale lo que
> vale la base de fallos que cargues, y la decisión judicial depende de factores
> que ningún modelo captura. Nunca reemplaza tu criterio jurídico.

**Tu base de jurisprudencia:**

- Los fallos se guardan en el navegador (`localStorage`). La semilla inicial
  (`jurisprudencia.seed.js`) trae **fallos reales** de la Corte Suprema
  (confianza legítima en contratas y falta de servicio municipal), cada uno con
  el **enlace a la fuente**. ⚠️ El **número de Rol y la fecha están marcados
  como "(ver fuente)"**: ábrelos y confírmalos en el fallo oficial
  (<https://juris.pjud.cl>) antes de citarlos. Agrega los tuyos con **+ Agregar
  fallo**.
- **Respaldo y edición en bloque:** con **⬇️ Exportar base** descargas todos
  tus fallos como un archivo `JSON` (respaldo, o para editar los Rol en bloque
  en cualquier editor). Con **⬆️ Importar base** los vuelves a cargar; te
  pregunta si **reemplazar** o **agregar** a la base actual. Útil porque el
  `localStorage` vive solo en ese navegador.
- Mientras más fallos reales cargues del mismo recurso/tema, más fiable es la
  estimación.

**Análisis ampliado con IA (opcional):**

Si pegas una URL en `window.IA_URL` (en `config.js`) apuntando a un proxy que
reenvíe al modelo (la API de Claude), aparece un botón **🤖 Análisis ampliado
con IA** que genera un análisis razonado en lenguaje natural a partir de los
fallos citados. Usar un proxy evita exponer tu clave de API en el navegador.

El proxy ya está listo en `ia-proxy.gs` (Google Apps Script). Configuración
(una sola vez, ~5 minutos):

1. Consigue una clave de API de Anthropic en <https://console.anthropic.com>.
2. Abre `ia-proxy.gs` y sigue las instrucciones del encabezado: crea el
   proyecto en <https://script.google.com>, pega el script, guarda tu clave en
   la propiedad de script `ANTHROPIC_API_KEY` y publícalo como **Aplicación
   web**.
3. Copia la URL que termina en `/exec` y pégala en `config.js`:
   ```js
   window.IA_URL = "https://script.google.com/macros/s/XXXX/exec";
   ```

Mientras `IA_URL` esté vacío, la predicción funciona igual, solo sin el
análisis en lenguaje natural.

| Archivo | Rol en la predicción |
|---|---|
| `prediccion.html` | Página del módulo |
| `prediccion.js` | Lógica: similitud, ponderación, estimación |
| `jurisprudencia.seed.js` | Base inicial de fallos (ejemplos a reemplazar) |
| `ia-proxy.gs` | Proxy de Apps Script hacia la API de Claude (opcional) |

## Integraciones ya configuradas

- ✅ Etiqueta **`📋 Tarea`** creada en Gmail y aplicada a los correos pendientes.
- ✅ Recordatorios en **Google Calendar** para las tareas de alta prioridad.
- ✅ Borradores de respuesta guardados en Gmail para los correos que requieren
  contestación.
