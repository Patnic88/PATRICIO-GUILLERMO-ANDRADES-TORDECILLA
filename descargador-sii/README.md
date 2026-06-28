# 🧾 Descargador automático del SII

Descarga sola el **Registro de Compras y Ventas (RCV)** en CSV — compras y ventas
del **mes anterior** — desde el portal del **SII (Chile)**, para todos los RUT que
pongas en `ruts.txt`. Funciona en **Windows, macOS y Linux** y guarda todo
ordenado por RUT y periodo.

> Está pensado para correr en **cualquier computador**: trae su propio navegador
> (Chromium, vía Playwright) y guarda tu sesión del SII localmente, así que
> inicias sesión **una sola vez**.

---

## 1. Requisitos (una vez por computador)

1. Instala **Node.js LTS** desde <https://nodejs.org> (cualquier versión 18 o superior).
2. Descarga/clona esta carpeta `descargador-sii` en el computador.

La primera vez que ejecutes el lanzador, se instalan solas las dependencias y el
navegador Chromium. No necesitas instalar nada más a mano.

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

## 7. Estructura del proyecto

```
descargador-sii/
├── Descargar-SII.bat       # Lanzador Windows (doble clic)
├── Descargar-SII.command   # Lanzador macOS (doble clic)
├── descargar-sii.sh        # Lanzador Linux
├── ruts.txt                # Lista de RUT a procesar
├── config.example.json     # Plantilla de configuración
├── package.json
└── src/
    ├── index.js            # Orquestador: lee config, recorre RUT, resume
    ├── config.js           # Carga config.json, ruts.txt, calcula el periodo
    └── sii.js              # Automatización del portal (login + descargas)
```

---

## 8. Notas y límites

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
