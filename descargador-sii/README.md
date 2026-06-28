# 🧾 Descargador automático del SII

Descarga sola el **Registro de Compras y Ventas (RCV)** en CSV — compras y ventas
del **mes anterior** — desde el portal del **SII (Chile)**, para todos los RUT que
pongas en `ruts.txt`. Funciona en **Windows, macOS y Linux** y guarda todo
ordenado por RUT y periodo.

> Está pensado para correr en **cualquier computador** y guarda tu sesión del SII
> localmente, así que inicias sesión **una sola vez**.

Hay dos formas de usarlo. Elige una:

| | **Opción A — Sin instalar nada** ⭐ | **Opción B — Con Node.js** |
|---|---|---|
| Para quién | Cualquier persona, cualquier PC | Si ya programas o quieres editar el código |
| Requisitos | Ninguno | Instalar Node.js una vez |
| Cómo | Descomprimir y doble clic | `npm install` + doble clic |

---

## 1A. Opción A — Sin instalar nada (recomendada) ⭐

El paquete portátil **trae el propio Node.js adentro** y usa el navegador
**Microsoft Edge o Google Chrome** que ya viene en el computador. No instalas nada.

1. Descarga el paquete de tu sistema:
   - **GitHub → pestaña _Actions_ → "Construir versión portátil"** → última ejecución →
     descarga el artefacto `DescargarSII-Windows` / `-macOS` / `-Linux`.
   - O, si hay una _Release_ publicada, descárgalo desde **_Releases_**.
2. **Descomprime** el `.zip`.
3. Edita `ruts.txt` con tus RUT.
4. Doble clic en el lanzador:
   - **Windows:** `Descargar-SII.bat`
   - **macOS:** `Descargar-SII.command` *(la 1ª vez: clic derecho → Abrir)*
   - **Linux:** `descargar-sii.sh`

> El paquete se genera solo en **GitHub Actions** sobre Windows, macOS y Linux
> reales (ver `.github/workflows/build-portable.yml`), y se prueba antes de
> publicarse.

### Cómo generar los paquetes descargables (una vez, lo hace el dueño del repo)

Los `.zip` listos para descargar se producen en GitHub. Para crearlos:

1. **Habilita GitHub Actions** (sólo la primera vez):
   GitHub → repo → **Settings → Actions → General** → marca
   *"Allow all actions and reusable workflows"* → **Save**.

2. **Genera la versión** de una de estas dos formas:

   - **Con un tag** (publica una *Release* descargable):
     ```bash
     git pull
     git tag -a v1.0.0 -m "Descargador SII v1.0.0 — versión portátil"
     git push origin v1.0.0
     ```
   - **O manualmente desde la web:** pestaña **Actions → "Construir versión
     portátil" → Run workflow**.

3. **Descarga el paquete** de tu sistema:
   - Si usaste un tag → pestaña **Releases**.
   - Si lo corriste manual → pestaña **Actions** → última ejecución → sección
     *Artifacts* → `DescargarSII-Windows` / `-macOS` / `-Linux`.

> Cada vez que quieras una versión nueva, sube otro tag (`v1.0.1`, `v1.1.0`, …)
> o vuelve a ejecutar el workflow.

---

## 1B. Opción B — Con Node.js instalado

1. Instala **Node.js LTS** desde <https://nodejs.org> (versión 18 o superior).
2. Descarga/clona esta carpeta `descargador-sii`.

La primera vez que ejecutes el lanzador, se instalan solas las dependencias.

> **Navegador:** intenta usar su propio Chromium (se descarga solo la primera
> vez). Si no se puede descargar — sin internet, proxy, etc. — **usa
> automáticamente Google Chrome o Microsoft Edge** instalado.

Para confirmar que un computador está listo, ejecuta:

```bash
npm run verificar
```

Te dirá si tienes Node, las dependencias y un navegador disponible.

---

## 2. Configuración (5 minutos)

1. **Lista de RUT** — edita `ruts.txt` y pon un RUT por línea:

   ```
   76123456-7, Mi Empresa SpA
   77987654-3, Otra Empresa Ltda
   ```

2. **Opciones** *(opcional)* — copia `config.example.json` a `config.json` y
   ajusta lo que quieras (periodo, carpeta de descargas, etc.). Si no creas
   `config.json`, se usan los valores por defecto (mes anterior, compras y ventas).

   > `config.json` **no se sube al repositorio** (está en `.gitignore`) porque
   > puede contener credenciales.

---

## 3. Uso — doble clic

| Sistema | Archivo a ejecutar |
|---|---|
| **Windows** | doble clic en **`Descargar-SII.bat`** |
| **macOS** | doble clic en **`Descargar-SII.command`** *(la 1ª vez: clic derecho → Abrir)* |
| **Linux** | `./descargar-sii.sh` en la terminal |

O desde la terminal, en cualquier sistema:

```bash
npm install      # sólo la primera vez
npm start
```

### Qué pasa al ejecutar

1. Se abre el navegador en el Registro de Compras y Ventas del SII.
2. **La primera vez**, inicias sesión a mano (RUT + Clave Tributaria o **Clave Única**,
   incluido el código 2FA si corresponde). El robot espera hasta que entres.
3. Tu sesión queda guardada en `.perfil-navegador/`, así que las próximas veces
   entra solo (hasta que la sesión del SII caduque).
4. Para cada RUT descarga el **detalle de compras y ventas** del periodo y lo
   guarda en:

   ```
   descargas/<RUT>/<AAAA-MM>/RCV_Compras_AAAA-MM_....csv
   descargas/<RUT>/<AAAA-MM>/RCV_Ventas_AAAA-MM_....csv
   ```

5. Al final muestra un **resumen** y escribe un `descarga_AAAA-MM.log`.

---

## 4. Opciones de `config.json`

| Opción | Por defecto | Qué hace |
|---|---|---|
| `periodo` | `"mes-anterior"` | `"mes-anterior"`, `"mes-actual"` o fijo `"AAAA-MM"` (ej. `"2026-05"`). |
| `carpetaDescargas` | `"descargas"` | Dónde guardar los archivos. |
| `descargarCompras` | `true` | Bajar el detalle de compras. |
| `descargarVentas` | `true` | Bajar el detalle de ventas. |
| `descargarPDFs` | `false` | (Experimental) intentar bajar PDFs de cada documento. |
| `navegador` | `"auto"` | `"auto"` (Chromium → Chrome → Edge), o forzar `"chromium"` / `"chrome"` / `"msedge"`. |
| `headless` | `false` | `false` muestra el navegador (necesario para login). `true` lo oculta. |
| `timeoutMs` | `60000` | Espera máxima por paso (ms). |
| `credenciales.rut` / `.clave` | vacío | Si los completas, intenta login automático con Clave Tributaria. |

> **Recomendación de seguridad:** deja las credenciales vacías y usa el **login
> manual asistido**. Es más seguro (no guardas la clave en un archivo) y funciona
> con Clave Única y 2FA. La sesión persistente hace que igual sólo entres una vez.

---

## 5. Modo asistido (red de seguridad)

El portal del SII cambia su diseño cada cierto tiempo. Si algún botón de descarga
automática no calza con la versión actual del sitio, el robot **no falla**: deja
la ventana abierta en el RCV y **captura cualquier descarga que hagas a mano**
durante ~90 segundos, guardándola en la carpeta correcta. Así nunca te quedas sin
los archivos.

---

## 6. Programarlo (opcional)

Para que corra solo cada mes:

- **Windows:** Programador de tareas → acción "Iniciar programa" → `Descargar-SII.bat`.
  Requiere que la sesión del SII siga vigente o `headless: false` para login.
- **macOS/Linux:** `cron`, por ejemplo el día 5 de cada mes a las 9:00:
  ```
  0 9 5 * * /ruta/a/descargador-sii/descargar-sii.sh >> /ruta/a/cron.log 2>&1
  ```

---

## 7. Llevarlo a otro computador

El proyecto es **portátil**: puedes copiarlo a un pendrive, a Google Drive o
clonarlo desde GitHub en cualquier equipo.

**Pasos en el computador nuevo:**

1. Instala **Node.js LTS** (<https://nodejs.org>) — único requisito del sistema.
2. Copia la carpeta `descargador-sii` (o clónala desde GitHub).
3. Ejecuta el lanzador de tu sistema (`Descargar-SII.bat` / `.command` / `.sh`).
   La primera vez instala dependencias solo.

**Consejos de portabilidad:**

- **No copies** las carpetas `node_modules/`, `.perfil-navegador/` ni `descargas/`
  entre computadores: son pesadas y específicas de cada equipo. Se regeneran solas.
  (Ya están excluidas en `.gitignore`.)
- Cada computador inicia sesión en el SII **una vez** (su sesión queda en su
  propia carpeta `.perfil-navegador/`).
- Si un equipo **no tiene internet** para descargar Chromium pero sí tiene
  **Google Chrome o Edge**, igual funciona (los detecta automáticamente).
- ¿Dudas si un equipo está listo? Corre `npm run verificar`.

## 8. Estructura del proyecto

```
descargador-sii/
├── Descargar-SII.bat       # Lanzador Windows (doble clic)
├── Descargar-SII.command   # Lanzador macOS (doble clic)
├── descargar-sii.sh        # Lanzador Linux
├── ruts.txt                # Lista de RUT a procesar
├── config.example.json     # Plantilla de configuración
├── package.json
├── scripts/
│   └── postinstall.js      # Descarga Chromium sin abortar si falla (usa Chrome/Edge)
└── src/
    ├── index.js            # Orquestador: lee config, recorre RUT, resume
    ├── config.js           # Carga config.json, ruts.txt, calcula el periodo
    ├── verificar.js        # Comprueba requisitos (npm run verificar)
    └── sii.js              # Automatización del portal (login + descargas)
```

---

## 9. Notas y límites

- **No se pudo probar contra el sitio real del SII** desde el entorno donde se
  generó este código (requiere tu sesión y datos tributarios privados). Los
  selectores del RCV están agrupados en `src/sii.js` (objeto `SITIO`) para
  ajustarlos fácil en un solo lugar si el SII cambió algún botón. El **modo
  asistido** (sección 5) garantiza que puedas descargar igual mientras se
  calibran.
- Este proyecto **no guarda ni envía** tus credenciales a ningún servidor: todo
  ocurre en tu computador. La sesión vive en `.perfil-navegador/` (ignorado por git).
- Pensado para uso legítimo de tu propia información tributaria o de empresas que
  representas en el SII.
