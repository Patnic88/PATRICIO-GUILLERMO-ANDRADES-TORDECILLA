# CLAUDE.md — Contexto del repositorio

Guía para retomar el trabajo rápido en futuras sesiones. Repositorio de Patricio
Andrades. Contiene **dos proyectos independientes**.

## 1) `descargador-sii/` — Descargador automático del SII ⭐ (foco actual)

Automatiza la descarga del **Registro de Compras y Ventas (RCV)** en CSV (compras
y ventas del **mes anterior**) desde el portal del **SII (Chile)**, para todos los
RUT de `ruts.txt`. Pensado para funcionar **en cualquier computador**.

### Stack y decisiones de diseño
- **Node.js (ESM) + Playwright.** Sin frameworks.
- **Login con sesión persistente** en `.perfil-navegador/` (perfil de Chromium en
  disco) → el usuario inicia sesión **una sola vez** por equipo. Login manual
  asistido por defecto (sirve para Clave Única / 2FA); opcional automático con
  RUT+Clave si se ponen credenciales en `config.json`.
- **Navegador con respaldo automático** (`navegador: "auto"`): intenta el Chromium
  de Playwright; si no está, usa **Google Chrome** o **Microsoft Edge** del sistema.
  También se puede forzar por `navegador` o por ruta exacta (`rutaNavegador` /
  env `SII_RUTA_NAVEGADOR`). Esto evita depender de descargar Chromium.
- **Portabilidad "sin instalar nada"**: GitHub Actions arma un paquete por SO que
  **incluye el binario de Node** + `node_modules`, y usa Edge/Chrome del sistema.
  El usuario descomprime y hace doble clic. Los lanzadores prefieren `runtime/node`
  si existe y omiten `npm install` cuando ya viene `node_modules`.
- **Resiliencia**: `postinstall` nunca aborta `npm install` (si no baja Chromium,
  se usa el navegador del sistema). Si los selectores del RCV cambiaron, hay un
  **modo asistido** que captura descargas hechas a mano (no falla en seco).

### Archivos clave
| Archivo | Rol |
|---|---|
| `src/index.js` | Orquestador: lee config, recorre RUT, resumen + log. Sale 0 si descargó, 2 si no. |
| `src/config.js` | Carga `config.json` y `ruts.txt`; calcula el periodo; normaliza RUT. |
| `src/sii.js` | Automatización del portal. **Selectores y URLs centralizados en el objeto `SITIO`** (top del archivo) para calibrar fácil. `abrirNavegador`, `asegurarLogin`, `procesarRut`, `descargarDetalle` (interna). |
| `src/verificar.js` | `npm run verificar`: diagnostica Node, deps y navegador. |
| `scripts/postinstall.js` | Baja Chromium sin abortar; respeta `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`. |
| `Descargar-SII.bat` / `.command` / `descargar-sii.sh` | Lanzadores de doble clic (Win/Mac/Linux). |
| `config.example.json` | Plantilla; copiar a `config.json` (ignorado por git, puede tener credenciales). |
| `ruts.txt` | Lista de RUT (uno por línea, `# ` = comentario, `RUT, Nombre`). |
| `.github/workflows/build-portable.yml` | (en la raíz) Arma + prueba el paquete por SO; publica Release con tag `v*`. |

### Configuración (`config.json`)
`periodo` (`"mes-anterior"` | `"mes-actual"` | `"AAAA-MM"`), `carpetaDescargas`,
`descargarCompras`, `descargarVentas`, `descargarPDFs` (experimental, hoy `false`),
`navegador`, `rutaNavegador`, `headless`, `timeoutMs`, `credenciales.{rut,clave}`.

Salida: `descargas/<RUT>/<AAAA-MM>/RCV_Compras|Ventas_AAAA-MM_*.csv` + `descarga_AAAA-MM.log`.

### Estado verificado
- ✅ Lógica de periodo y normalización de RUT (probada).
- ✅ Sintaxis de todos los módulos.
- ✅ **Prueba E2E real**: `procesarRut` contra una página RCV simulada con un
  navegador real descarga y guarda los CSV de compras y ventas correctamente.
  (Test ad hoc en scratchpad; no quedó en el repo. Para repetir: levantar una
  página con pestañas `COMPRA`/`VENTA`, año/mes y botón `Descargar`→`CSV`, fijar
  `SITIO.rcvUrl` a esa página y llamar `procesarRut` con `rutaNavegador`.)
- ✅ `npm install` resiliente sin descargar Chromium.
- ⚠️ **NO probado contra el SII real** (requiere sesión y datos tributarios
  privados). Si algún botón no calza, ajustar `SITIO` en `src/sii.js`; el modo
  asistido cubre mientras tanto.

### Pendientes / TODO
1. **Generar los `.zip` descargables** (lo hace el dueño del repo, una vez):
   - Habilitar **GitHub Actions** (Settings → Actions → General → *Allow all*).
     **Actions está DESHABILITADO** en el repo (0 workflows registrados).
   - Crear y subir un tag: `git tag -a v1.0.0 -m "..." && git push origin v1.0.0`
     (o ejecutar el workflow manual desde la pestaña Actions).
   - Limitación conocida del entorno Claude Code web: **no puede habilitar Actions
     ni pushear tags** (push de tag da `403`; dispatch da `403`).
2. (Opcional) Descarga de **PDF individuales** de cada factura — hoy `descargarPDFs`
   es experimental/placeholder en el flujo; falta implementar la iteración por
   documento. Es lo siguiente más pedido.
3. (Opcional) Afinar selectores `SITIO` contra el SII real cuando se tenga sesión.

## 2) Raíz del repo — Lista de Tareas conectada a Gmail

App web sin servidor (`index.html`, `app.js`, `styles.css`, `tasks.seed.js`,
`gmail-sync.gs`, `config.js`). Tareas extraídas de correos de Gmail; sincronización
opcional vía Google Apps Script. Ver `README.md` de la raíz. **No** relacionada con
el descargador SII (proyecto preexistente).

## Convenciones de trabajo
- **Rama de desarrollo:** `claude/automated-invoice-downloads-75sqg9`. PR abierto: **#9** (borrador).
- Idioma de código, comentarios, docs y commits: **español**.
- `git push -u origin <rama>` con reintentos ante fallos de red.
- Tras push, mantener el PR #9 actualizado.
