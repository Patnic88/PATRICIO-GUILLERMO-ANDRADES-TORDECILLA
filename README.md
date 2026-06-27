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

## ⚖️ Agente: Estado Diario del Tribunal

Página complementaria (`estado-diario.html`) que muestra los **movimientos
diarios** del:

- **Juzgado de Letras y Garantía de Los Vilos**, y
- **Corte de Apelaciones de La Serena**

vinculados a **Patricio Andrades** y/o a la **I. Municipalidad de Los Vilos**.
Abre el enlace **⚖️ Estado Diario →** en el encabezado de la página de tareas.

### Cómo funciona el agente

`estado-diario.gs` es un **Google Apps Script** que corre dentro de tu propia
cuenta de Google. Cada vez que se ejecuta:

1. Busca en tu Gmail los correos del último día provenientes de remitentes
   `@pjud.cl` asociados a los tribunales objetivo
   (`notifica_jl_losvilos@pjud.cl`, `notifica_corte_laserena@pjud.cl`, etc.).
2. Filtra los que mencionan "Municipalidad de Los Vilos", "Patricio Andrades"
   u otras palabras clave equivalentes.
3. Extrae el **rol/RIT**, **carátula**, **tipo de resolución** y **fecha**, y
   los expone como JSON para que la página `estado-diario.html` los liste.

Mientras `window.COURT_SYNC_URL` (en `config.js`) esté vacío, la página
muestra datos de muestra (`estado-diario.seed.js`). Cuando lo completes con
la URL del Web App, los datos se vuelven reales y se actualizan cada vez que
abres la página o pulsas **⟳ Revisar correo**.

### Despliegue automatizado (recomendado)

Un solo comando para subir el script, desplegarlo como Web App, escribir la
URL en `config.js`, calentar el endpoint para que se autoinstale el trigger
diario, y commitear el cambio:

```bash
bash scripts/deploy-estado-diario.sh
```

Antes del primer `deploy`, dos pasos manuales (una sola vez en la vida):

1. **Activa la Apps Script API** en
   <https://script.google.com/home/usersettings> (interruptor *Apps Script
   API: ON*).
2. **Autoriza clasp** con tu cuenta de Google:
   ```bash
   npx -y @google/clasp@2.4.2 login
   ```
   Se abrirá el navegador para pedir permiso. Esta autorización es
   inevitable: nadie más que tú puede aceptar los scopes de Gmail.

A partir de ahí, cada vez que cambies `estado-diario.gs` basta con volver a
ejecutar `bash scripts/deploy-estado-diario.sh` y el script:

- empuja la versión nueva al proyecto Apps Script existente,
- crea un nuevo "deployment" como Web App,
- actualiza `config.js` con la URL nueva si cambió,
- y commitea + pushea ese cambio.

El trigger que corre `reviseEstadoDiario` cada día a las 08:00 se instala
solo en la primera invocación del Web App (ver `ensureDailyTrigger` en
`estado-diario.gs`).

### Configuración manual (alternativa)

Si prefieres no usar clasp:

1. Abre `estado-diario.gs` y sigue las instrucciones del encabezado: crea el
   proyecto en <https://script.google.com>, pega el script y publícalo como
   **Aplicación web** (ejecutar como TÚ, acceso para cualquiera).
2. Copia la URL que termina en `/exec`.
3. Pégala en `config.js`:
   ```js
   window.COURT_SYNC_URL = "https://script.google.com/macros/s/YYYY/exec";
   ```
4. Abre la página `estado-diario.html` una vez: la primera llamada al Web
   App instala automáticamente el trigger diario de las 08:00.

### Archivos

| Archivo | Rol |
|---|---|
| `estado-diario.html` | Página que lista los movimientos |
| `estado-diario.js` | Lógica de filtros y sincronización con el agente |
| `estado-diario.seed.js` | Datos de muestra (se reemplazan al activar el agente) |
| `estado-diario.gs` | Apps Script (el "agente" que lee Gmail) |
| `apps-script/appsscript.json` | Manifest del proyecto (scopes de Gmail, Web App, runtime V8) |
| `scripts/deploy-estado-diario.sh` | Despliegue automatizado con clasp |

### Estructura de cada entrada

```js
{
  id: "ed-<messageId>",
  rol: "C-114-2026",
  caratulado: "Núñez con I. Municipalidad de Los Vilos",
  tribunal: "Juzgado de Letras y Garantía de Los Vilos",
  tipoTribunal: "los-vilos" | "corte-la-serena",
  fecha: "2026-06-27",
  fechaIso: "2026-06-27T13:00:00.000Z",
  tipoResolucion: "Provee escrito",
  resumen: "...",
  remitente: "notifica_jl_losvilos@pjud.cl",
  threadId: "<gmail thread id>",
  revisada: false
}
```
