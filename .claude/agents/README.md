# Subagentes de contabilidad (Chile) sobre Google Drive

Equipo de subagentes especializados para llevar la contabilidad de una
cartera de clientes chilenos, trabajando sobre la documentación almacenada
en Google Drive.

## Los agentes

| Agente | Se encarga de |
|---|---|
| `jefe-estudio-contable` | Orquestador. Recibe el encargo, inventaría lo que hay en Drive, reparte el trabajo y consolida el resultado |
| `contador-tributario-chile` | IVA, F29, PPM, retenciones, crédito fiscal, DTE y trámites del SII |
| `archivista-contable-drive` | Estructura de carpetas, nomenclatura, clasificación, duplicados y faltantes en Drive |
| `conciliador-rcv-f29` | Cruce RCV ↔ F29 ↔ contabilidad ↔ banco, y explicación de cada diferencia |
| `remuneraciones-chile` | Liquidaciones, gratificación, Previred, finiquitos, costo empresa |
| `cierre-renta-chile` | RLI, capital propio, F22, declaraciones juradas, cierre anual |
| `calendario-tributario-chile` | Vencimientos, atrasos y tablero de cumplimiento de la cartera |

## Cómo se usan

No hay que invocarlos por nombre: se activan solos según lo que pidas.
Basta escribir el encargo en lenguaje natural.

```
"cuánto paga de IVA el cliente X este mes"      → contador-tributario-chile
"ordena la carpeta de Drive de X"               → archivista-contable-drive
"cuadra el RCV con el F29 del año"              → conciliador-rcv-f29
"qué vence esta semana"                         → calendario-tributario-chile
"hazte cargo del cierre de julio de X"          → jefe-estudio-contable
```

También puedes pedirlo explícito: *"usa el conciliador-rcv-f29 para revisar
el segundo semestre"*.

## Requisitos

1. **Conector de Google Drive habilitado.** Los agentes usan las
   herramientas `mcp__Google_Drive__*` para buscar, leer y crear archivos.
   Sin el conector, funcionan igual pero solo con archivos locales.
2. **Estructura de carpetas por cliente** en Drive (la crea
   `archivista-contable-drive` la primera vez):

   ```
   Clientes/<RAZON-SOCIAL> — <RUT>/
     00_Antecedentes/  01_Tributario/  02_Remuneraciones/
     03_Bancos/  04_Informes/  05_Correspondencia/
   ```

3. **Nomenclatura uniforme:**
   `<RUT>_<AAAA-MM>_<tipo>.<ext>` — por ejemplo
   `76123456-7_2026-07_rcv-ventas.csv`.

## Principios comunes

Los siete agentes comparten tres reglas que no se negocian:

- **Cero invención.** Ningún monto, tasa, plazo ni código de formulario se
  entrega de memoria. Sale de un documento leído o de una fuente oficial
  consultada en el momento. Lo que falta se marca `[FALTA: ...]` y lo que
  no está confirmado, `[VERIFICAR]`.
- **Los indicadores se consultan.** UF, UTM, IMM, topes imponibles, tasas de
  retención de honorarios, tramos de impuesto y plazos cambian. Se buscan
  para el período de trabajo, no se recuerdan.
- **Drive no se destruye.** Ningún agente borra ni sobrescribe archivos.
  Copia, crea versiones nuevas con fecha y avisa. La eliminación la decide
  una persona.

Además, ninguno presenta declaraciones ni opera el portal del SII con
credenciales del cliente: preparan, calculan y dejan todo listo para que el
responsable revise y presente.

## Relación con los skills instalados

Los agentes invocan los skills existentes en vez de duplicar su lógica:
`contador-experto-chile` (trámites SII), `descargar-sii-rcv` (descarga del
RCV y los DTE), `informes-financieros-sii` (dashboard e informe),
`informe-cliente` (orquestación por cliente), y `xlsx` / `docx` / `pdf` para
los entregables.
