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
| `contabilidad.py` | Programa de balances contables automáticos (ver más abajo) |

## 🧮 Balances contables automáticos (`contabilidad.py`)

Programa de línea de comandos, **en Python y sin dependencias externas**, que lleva
contabilidad por **partida doble** y genera los balances automáticamente. Los montos
se manejan con precisión decimal y los datos se guardan en un archivo `contabilidad.json`.

Genera de forma automática:

- **Libro Diario** — todos los asientos en orden.
- **Libro Mayor** — movimientos y saldo por cuenta.
- **Balance de Comprobación** (sumas y saldos) — verifica que debe = haber.
- **Balance General** (Estado de Situación) — verifica que Activo = Pasivo + Patrimonio.
- **Estado de Resultados** — utilidad o pérdida del ejercicio.
- **Ingresos vs. Gastos** (caja simple) — superávit/déficit y resumen por concepto.

### Cómo usarlo

```bash
# 1. Crear el plan de cuentas base (una sola vez)
python3 contabilidad.py init --empresa "Mi entidad" --moneda CLP

# 2. Registrar asientos (debe = haber; si no cuadra, el programa lo rechaza)
python3 contabilidad.py asiento --fecha 2026-06-01 \
    --glosa "Aporte de capital" \
    --linea 1.1.02:5000000:0 \
    --linea 3.1.01:0:5000000

# 3. Ver los balances
python3 contabilidad.py comprobacion   # balance de comprobación
python3 contabilidad.py balance        # balance general
python3 contabilidad.py resultados     # estado de resultados
python3 contabilidad.py caja           # ingresos vs. gastos
python3 contabilidad.py diario         # libro diario
python3 contabilidad.py mayor 1.1.02   # libro mayor de una cuenta

# Sin argumentos abre un menú interactivo en español:
python3 contabilidad.py
```

Cada línea de un asiento usa el formato `CUENTA:DEBE:HABER` (un monto en cero del lado
que no corresponde). El programa **no deja registrar un asiento que no cuadre**, así que
los balances siempre salen correctos.

### Exportar a Excel / Google Sheets (CSV)

Cualquier reporte (`diario`, `mayor`, `comprobacion`, `balance`, `resultados`, `caja`)
acepta la opción `--csv RUTA` para guardarlo como archivo CSV en vez de imprimirlo:

```bash
python3 contabilidad.py comprobacion --csv comprobacion.csv
python3 contabilidad.py balance --csv balance.csv
python3 contabilidad.py mayor 1.1.02 --csv mayor-banco.csv
```

Los archivos se generan en UTF-8 con BOM (se abren con las tildes correctas en Excel)
y los montos usan punto decimal para que se puedan reimportar sin problemas.

Otros comandos útiles: `cuentas` (ver el plan), `cuenta-add CODIGO "Nombre" TIPO`
(agregar una cuenta), `eliminar N` (borrar un asiento). Los tipos válidos son
`ACTIVO`, `PASIVO`, `PATRIMONIO`, `INGRESO` y `GASTO`. Para usar otro archivo de datos:
`python3 contabilidad.py --data otra.json ...` (o la variable de entorno `CONTAB_DATA`).

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
