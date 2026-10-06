# 🧾 Facturador A&A — programa de facturación y cobranza

Programa **descargable y sin instalación** que automatiza la facturación de un estudio
o práctica contable chilena: clientes, cobros mensuales que se generan solos,
documentos numerados, control de pagos, recordatorios de cobro y exportación a Excel.

Funciona en **Windows, macOS y Linux**. No necesita internet ni servidor: los datos
quedan en tu computador, en un único archivo.

## Qué hace (y qué no)

**Hace:**

- Registro de clientes con validación del RUT (dígito verificador).
- Catálogo de servicios con precio.
- **Cobros automáticos**: defines qué se cobra a cada cliente y cada cuánto (mensual,
  bimestral, trimestral, semestral, anual, con mes de inicio y término). Con un clic el
  programa genera todos los documentos del mes, sin duplicar ninguno, y el Panel avisa
  cuando hay cobros por generar.
- Documentos: factura (afecta a IVA 19 %), factura exenta, boleta de honorarios (con
  retención) y nota de cobro. Folio interno correlativo por tipo, borrador → emitido →
  pagado, anulación con motivo.
- Pagos parciales y totales, saldo, documentos vencidos.
- Documento imprimible en el navegador (Ctrl+P → "Guardar como PDF").
- Recordatorio de cobro listo para pegar en correo o WhatsApp, con tus datos de
  transferencia.
- Exportación a CSV (se abre en Excel) de documentos y clientes; importación de
  clientes desde CSV; respaldo y restauración de la base de datos.

**No hace:** no emite el documento tributario electrónico (DTE) ante el SII. La factura
o boleta electrónica **oficial** se emite en sii.cl (Sistema de facturación gratuito o
software certificado). Este programa prepara, numera y controla la cobranza; luego
anotas el folio SII en cada documento para dejarlo vinculado.

## Descargar y ejecutar

### Opción A: ejecutable (sin instalar nada)

1. Entra a la pestaña **Actions** del repositorio en GitHub (o a **Releases** si hay una
   versión publicada) y descarga el `.zip` de tu sistema: `FacturadorAA-Windows`,
   `FacturadorAA-macOS` o `FacturadorAA-Linux`.
2. Descomprime y ejecuta `FacturadorAA` (en Windows, `FacturadorAA.exe`).
3. Se abre una ventana negra con la dirección `http://127.0.0.1:8765/` y, a continuación,
   tu navegador con el programa. **Deja la ventana negra abierta mientras lo uses**; para
   cerrar el programa, ciérrala o usa "Cerrar el programa" en Configuración.

Avisos habituales la primera vez:

- *Windows*: SmartScreen puede decir "Windows protegió su PC" porque el ejecutable no
  está firmado. Pulsa **Más información → Ejecutar de todas formas**.
- *macOS*: clic derecho sobre `FacturadorAA` → **Abrir** → **Abrir** (o en Ajustes →
  Privacidad y seguridad → "Abrir igualmente"). Si no tiene permiso de ejecución:
  `chmod +x FacturadorAA` en Terminal.
- *Linux*: `chmod +x FacturadorAA && ./FacturadorAA`.

### Opción B: desde el código fuente (requiere Python 3.9 o superior)

No usa ninguna biblioteca externa.

```bash
cd facturacion
python3 facturacion.py          # Windows: doble clic en iniciar.bat
```

Opciones: `--puerto 9000`, `--datos RUTA` (otra carpeta de datos), `--sin-navegador`,
`--restaurar respaldo.sql`, `--version`.

### Generar tú mismo los ejecutables

`empaquetado/construir.bat` (Windows) o `empaquetado/construir.sh` (macOS/Linux)
instalan PyInstaller y dejan el programa en `dist/`. Cada sistema genera su propio
ejecutable (el de Windows se construye en Windows, etc.). El workflow
`.github/workflows/facturador-ejecutables.yml` hace esto automáticamente en GitHub
para los tres sistemas; al crear una etiqueta `facturador-v1.0.0` los adjunta a un Release.

## Primeros pasos

1. **Configuración**: datos del emisor (razón social, RUT, giro, dirección), datos de
   transferencia para los documentos, plazo de pago, tasas y folios iniciales.
2. **Clientes**: crea los clientes o importa un CSV con columnas `RUT` y `Razón social`
   (opcionalmente Giro, Dirección, Comuna, Ciudad, Email, Teléfono, Contacto, Notas).
3. **Cobros automáticos**: por cada cliente con cobro recurrente, crea un plan (concepto,
   monto neto, tipo de documento, frecuencia, día de emisión, mes de inicio).
4. Cada mes: en **Panel** verás "N cobros por generar". Pulsa **Generar borradores**
   para revisarlos antes de emitir, o en **Cobros automáticos** usa **Generar y emitir**
   para dejarlos emitidos con folio de una vez.
5. **Documentos**: emite, imprime/guarda PDF, registra pagos, envía recordatorios de
   cobro, anota el folio SII y exporta a CSV para tu contabilidad.

## Dónde quedan los datos

En la carpeta `FacturadorAA` dentro de tu carpeta personal:

| Sistema | Ruta |
|---|---|
| Windows | `C:\Users\<tu usuario>\FacturadorAA\facturador.db` |
| macOS | `/Users/<tu usuario>/FacturadorAA/facturador.db` |
| Linux | `/home/<tu usuario>/FacturadorAA/facturador.db` |

**Respaldo**: copia ese archivo a un pendrive o a la nube (o usa "Descargar respaldo" en
Configuración, que genera un `.sql`). Para llevar los datos a otro computador, copia el
archivo `facturador.db` a la misma carpeta del otro equipo, o ejecuta:

```bash
FacturadorAA --restaurar respaldo-facturador-2026-10-06.sql
```

La base de datos anterior se conserva renombrada (`facturador.antes-FECHA.db`).

## Parámetros tributarios

- **IVA**: 19 % (DL 825, art. 14), editable en Configuración.
- **Retención de boletas de honorarios**: el valor por defecto es 15,25 %, que
  corresponde al calendario gradual de la Ley 21.133 para el año 2026. Es un dato que
  cambia cada año: **verifica la tasa vigente en sii.cl antes de emitir boletas** y
  ajústala en Configuración.
- Todos los montos se calculan en pesos enteros, con redondeo al peso.

## Seguridad y privacidad

El programa escucha solo en `127.0.0.1` (tu propio computador) y rechaza peticiones
con otro nombre de host. No envía datos a ningún servicio externo.

## Estructura del código

| Archivo | Rol |
|---|---|
| `facturacion.py` | Punto de entrada: arranca el servidor local y abre el navegador |
| `facturador/db.py` | Base de datos SQLite: esquema, clientes, servicios, planes, documentos, pagos |
| `facturador/calculos.py` | IVA, retención, totales, formato de pesos y fechas |
| `facturador/rut.py` | Validación y formato de RUT (módulo 11) |
| `facturador/automatizacion.py` | Generación de documentos por período y resumen del panel |
| `facturador/documentos.py` | Documento imprimible (HTML), CSV, recordatorios |
| `facturador/servidor.py` | Servidor HTTP local y API JSON |
| `facturador/static/` | Interfaz web (HTML, CSS, JavaScript sin dependencias) |
| `tests/` | Pruebas unitarias (`python3 -m unittest discover -s tests -t .`) |
| `empaquetado/` | Especificación de PyInstaller y scripts de construcción |
