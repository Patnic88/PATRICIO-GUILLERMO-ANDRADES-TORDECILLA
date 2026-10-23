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

## 💬 Compartir tareas por WhatsApp

La app puede enviar tus tareas por WhatsApp **sin servidor**: arma el mensaje y
abre WhatsApp (móvil o WhatsApp Web) con el texto listo para enviar.

- **En cada tarea**: pulsa **💬 WhatsApp** para compartir esa tarea con su
  categoría, prioridad, fecha de vencimiento y el enlace al correo.
- **Todas las pendientes**: el botón **💬 Enviar pendientes** (arriba) manda la
  lista pendiente según el filtro activo, ordenada por prioridad.
- **Número por defecto** (opcional): pulsa **📱 Número de WhatsApp** en el pie
  para guardar un número y que los mensajes vayan directo a ese chat. Si lo
  dejas vacío, WhatsApp te deja elegir el contacto cada vez. También puedes
  fijarlo en `config.js`:
  ```js
  window.WHATSAPP_NUMERO = "56912345678"; // código de país + número, solo dígitos
  ```

No requiere la API de WhatsApp Business ni ninguna cuenta de pago: usa el enlace
oficial *click to chat* de WhatsApp.

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

### 📧 Resumen diario por correo

Cuando `reviseEstadoDiario` corre cada mañana, además de etiquetar los
hilos con `⚖️ Estado Diario`, **envía un resumen del día a
`pandrades23@gmail.com`** (configurable en `DIGEST_TO` dentro de
`estado-diario.gs`), con copia (CC) a
`andradestordecilla.abogado@gmail.com` (configurable en `DIGEST_CC`). El correo:

- viene desde tu propia cuenta de Google (Apps Script usa `GmailApp.sendEmail`),
- llega en formato HTML, agrupado por tribunal,
- muestra rol/RIT, carátula, tipo de resolución y un resumen,
- incluye un link directo al hilo original en Gmail,
- y se omite por completo si no hubo movimientos ese día (no genera ruido).

Para probar el envío sin esperar al trigger diario, abre el editor de
Apps Script y ejecuta la función **`sendDigestNow`** — manda el resumen
del día actual al instante.

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
| `tests/extract.test.mjs` | Tests unitarios del extractor del agente |
| `tests/e2e.test.mjs` | Tests E2E (Chromium + Playwright) |
| `tests/run.sh` | Runner único (unit + E2E) |

### Pruebas

```bash
bash tests/run.sh
```

Corre dos suites:

- **Unit** (`tests/extract.test.mjs`): sandboxea `estado-diario.gs` con mocks
  mínimos de Apps Script y prueba directamente las funciones puras
  (`extractRol`, `extractCaratulado`, `extractTipo`, `analyzeMessage`,
  `ensureDailyTrigger`). Cubre los formatos de rol/RIT/ingreso del PJUD y
  los falsos positivos (correos del Poder Judicial no vinculados a la
  Municipalidad o a Patricio Andrades).
- **E2E** (`tests/e2e.test.mjs`): Chromium contra un servidor local; valida
  la página de tareas con WhatsApp, la página del Estado Diario, los
  filtros, la persistencia en `localStorage` y el badge "Hoy" inyectando un
  movimiento con fecha del día.

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

---

## 📰 Agente: Diario Oficial

Revisa cada mañana la
[edición electrónica del Diario Oficial](https://www.diariooficial.interior.gob.cl/edicionelectronica/)
y envía un reporte a **`pandrades23@gmail.com`**, con copia a
`andradestordecilla.abogado@gmail.com`.

La lógica está en un solo archivo, `diario-oficial.gs`, y se puede usar de
dos formas:

- **Rutina diaria de Claude (forma principal, automática).** Claude la
  ejecuta todos los días con `agente-diario-oficial/reporte.mjs` y envía el
  correo con tu Gmail. No hay que instalar nada en Google.
- **Google Apps Script (alternativa).** Corre en tu propia cuenta de
  Google. Ver "Alternativa: Apps Script" más abajo.

### Rutina diaria de Claude

- **Nombre:** "Reporte Diario Oficial".
- **Horario:** todos los días a las **07:55**, hora de Chile.
- **Funcionamiento:** cada ejecución abre una sesión nueva de Claude, corre
  `node agente-diario-oficial/reporte.mjs`, que lee el sitio y deja el correo
  listo en `reporte.html` y `reporte.txt`, y envía ese contenido **sin
  modificarlo** con el conector de Gmail. Las instrucciones exactas que sigue
  Claude están en `agente-diario-oficial/SKILL.md`.
- **Si la edición de hoy aún no aparece:** el ejecutor reintenta dos veces,
  con 4 minutos entre intentos. Si sigue sin aparecer, o el sitio no
  responde, envía un **aviso** en vez del reporte.
- **Requisito, una sola vez:** permitir el sitio en la red del entorno de
  Claude. En el menú del entorno (barra de título de la sesión) → **Edit** →
  **Network access**, agrega `www.diariooficial.interior.gob.cl` y
  `diariooficial.interior.gob.cl` en **Allowed domains**.
  Instrucciones: <https://code.claude.com/docs/en/cloud-environments#network-access>.
  Mientras no lo hagas, cada mañana llegará el aviso "no se pudo leer el
  sitio", que indica el bloqueo de red.
- **Pausar o borrar:** desde la lista de Routines de Claude, o pidiéndoselo a
  Claude.
- **Costo:** cada ejecución consume uso de Claude.

### Agente descargable (skill de Claude)

```bash
bash scripts/empaquetar-agente-diario-oficial.sh
```

Genera `dist/agente-diario-oficial.zip`, con `SKILL.md`, `reporte.mjs` y
`diario-oficial.gs`. Para instalarlo: claude.ai → **Configuración →
Capacidades → Skills** → subir el `.zip`. Desde entonces puedes pedirle a
Claude "revisa el Diario Oficial" cuando quieras. Funciona donde Claude
tenga acceso de red al Diario Oficial y el conector de Gmail.

### Alternativa: Apps Script

`diario-oficial.gs` también funciona como **Google Apps Script** en tu
propia cuenta de Google, en un proyecto **distinto** al del Estado Diario,
sin servidores ni contraseñas.

### Qué trae el correo

1. **⭐ Destacadas por tema**: publicaciones de cualquier sección que
   mencionan tus temas, con la palabra que coincidió y el enlace al PDF (CVE):
   - Los Vilos / Choapa / Coquimbo
   - Municipal (incluye Ley 18.695)
   - Laboral / funcionarios (Código del Trabajo, Estatuto Administrativo,
     leyes 18.834 y 18.883, remuneraciones, Ley Karin 21.643)
   - Contraloría / probidad (Contraloría, transparencia, Ley 20.285,
     probidad, compras públicas)
   - Tributario (SII, tributario, impuestos, Tesorería General)
2. **Normas Generales** completas, agrupadas por ministerio y organismo.
3. **Avisos destacados** completos.
4. **Normas Particulares** y **Publicaciones Judiciales**: sólo las
   publicaciones que coinciden con tus temas (por ejemplo, "1 de 37").

Los títulos se copian **literalmente** desde el sitio: el agente no resume
ni interpreta. Si una sección no se pudo leer, el correo lo dice con el
motivo y un enlace para revisarla a mano. Nada se omite en silencio.

### Cuándo llega (Apps Script)

El activador corre **cada hora**. Desde las **08:00** (hora de Chile)
intenta leer la edición del día. Apenas la encuentra, envía el reporte **una
sola vez**. Si a las **14:00** no hay edición con fecha de hoy, o el sitio no
respondió, envía un **aviso breve** para revisar a mano. Puedes desactivar
ese aviso con `DO_AVISAR_SIN_EDICION = false`.

### Instalación del Apps Script (una sola vez, ~5 minutos)

1. Entra a <https://script.google.com> y crea un **Nuevo proyecto**.
2. Pega **todo** el contenido de `diario-oficial.gs`.
3. Elige la función **`diagnosticarDiarioOficial`**, pulsa **Ejecutar** y
   autoriza los permisos. Google los detecta solo y son tres: conectarse a
   un servicio externo, enviar correo como tú y gestionar activadores.
   En el **Registro de ejecución**, cada sección debería decir
   `estado: ok`.
4. Ejecuta **`instalarAgente`**. Esto deja programado el activador horario.
5. (Opcional) Ejecuta **`enviarReporteAhora`** para recibir el reporte de
   hoy al instante.

Si prefieres clasp (requiere los mismos dos pasos previos del Estado
Diario):

```bash
bash scripts/deploy-diario-oficial.sh
```

Sube el código a su propio proyecto Apps Script y te muestra el enlace al
editor. Ahí ejecutas `diagnosticarDiarioOficial` y `instalarAgente` una vez.

### Configuración

Todo está en las constantes al inicio de `diario-oficial.gs`:

| Constante | Para qué |
|---|---|
| `DO_TEMAS` | Temas y palabras clave. Un `*` final acepta cualquier terminación (`municipal*`). Los números de ley van sin puntos (`18695`). |
| `DO_SECCIONES` | Secciones revisadas y su modo: `completa` o `filtrada`. |
| `DIGEST_TO`, `DIGEST_CC` | Destinatario y copia. |
| `DO_HORA_INICIO`, `DO_HORA_LIMITE` | Ventana de envío (hora de Chile). |
| `DO_MAX_ITEMS_SECCION`, `DO_MAX_DESTACADAS_TEMA` | Topes para que Gmail no recorte el correo. |

Si `municipal*` trae demasiadas Normas Particulares de otras comunas,
cámbialo por términos más acotados, por ejemplo `"municipalidad de los vilos"`.

### Funciones del Apps Script

| Función | Qué hace |
|---|---|
| `revisarDiarioOficial` | La ejecuta el activador cada hora. |
| `instalarAgente` / `desinstalarAgente` | Crea o borra el activador. |
| `enviarReporteAhora` | Envía el reporte de inmediato. |
| `diagnosticarDiarioOficial` | Registra qué devuelve el sitio y qué entiende el parser. No envía correos. |

### Limitaciones (léelas antes de confiar en el reporte)

- **Estructura del sitio sin verificar en vivo.** El parser se escribió
  según la estructura que documenta el repositorio público
  [`stefanoseggio/diario-oficial-cl-monitor`](https://github.com/stefanoseggio/diario-oficial-cl-monitor),
  una fuente secundaria. Desde el entorno donde se programó no había acceso
  al Diario Oficial. Lo único verificado es el patrón de las rutas de los PDF
  (`/publicaciones/AAAA/MM/DD/EDICIÓN/…/CVE.pdf`). La primera ejecución con
  acceso al sitio (la rutina de Claude con el dominio permitido, o
  `diagnosticarDiarioOficial` en Apps Script) es la verificación real.
- **Posible bloqueo.** El sitio podría responder con una página de
  verificación anti-bots a servidores de Google o de Claude. En ese caso el
  agente avisa ("no se pudo leer el sitio"); no inventa contenido.
- **Copia del correo en la rutina.** Claude envía por Gmail el contenido de
  `reporte.html`; sus instrucciones exigen copiarlo sin cambios, pero no hay
  una verificación automática byte a byte.
- **Fuera de alcance**: ediciones extraordinarias y las secciones de marcas
  y patentes, empresas y cooperativas y BOM.
- **Destacar no es analizar.** La coincidencia es por palabra clave: el
  reporte sirve de radar. Antes de citar una norma, revisa el texto íntegro
  en el PDF (CVE).

### Pruebas

`tests/diario-oficial.test.mjs` corre dentro de `bash tests/run.sh`. Usa
HTML **sintético** (`tests/fixtures/diario-oficial/*.sintetico.html`, con
datos ficticios). Cubre:

- el parser: jerarquía, CVE, respaldos, página sin publicaciones y página
  desconocida;
- las coincidencias por tema;
- el armado del correo;
- el flujo horario: envía una vez, espera si la edición no es de hoy y avisa
  a las 14:00.

`tests/agente-diario-oficial.test.mjs` prueba el ejecutor de Claude. Corre
el CLI real contra un servidor local con los mismos fixtures y cubre:

- reporte;
- sección caída;
- sitio con 403;
- edición de otro día;
- reintento hasta que aparece la edición;
- el `.zip` descargable, descomprimido y ejecutado.

---

## 🎯 Radar Dropshipping

En la carpeta [`dropshipping/`](dropshipping/README.md) hay una app independiente
para analizar productos y anuncios que funcionan en redes sociales y adaptarlos
a una tienda Shopify. Ver su README.

---

## 🏢 Constitución de empresas en línea

En la carpeta [`constitucion-empresa/`](constitucion-empresa/README.md) hay un
sitio para ofrecer la constitución de SpA, E.I.R.L. y Ltda. vía Registro de
Empresas y Sociedades: formulario guiado para el cliente, plan de firma de
cada socio y envío de la solicitud por WhatsApp o correo. Ver su README
(incluye las fuentes legales y lo pendiente de verificar).

---

## 💬 Agente de WhatsApp — A & A jurídico y contable

Carpeta [`agente-whatsapp/`](agente-whatsapp/README.md). Asistente virtual de
atención por WhatsApp (API oficial de Meta) con IA configurable (Claude, de
Anthropic): conversa con clientes, recuerda antecedentes por cliente y asunto,
verifica identidad antes de hablar de expedientes o pagos, recibe documentos y
comprobantes, agenda citas sin duplicados y alerta a Patricio de audiencias,
notificaciones, vencimientos y remates. Incluye panel de administración,
simulador y 65 pruebas automáticas.

Arranca en **modo prueba**: nada se envía a clientes reales hasta activarlo.

```bash
cd agente-whatsapp && npm install && npm test && npm run demo
```

- Guía de configuración y puesta en marcha: [`agente-whatsapp/README.md`](agente-whatsapp/README.md)
- Instrucciones del agente: [`agente-whatsapp/instrucciones/agente.md`](agente-whatsapp/instrucciones/agente.md)
- Demostración revisable: [`agente-whatsapp/docs/demostracion.md`](agente-whatsapp/docs/demostracion.md)
- Costos y fuentes: [`agente-whatsapp/docs/costos.md`](agente-whatsapp/docs/costos.md)
