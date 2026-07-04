# 🧾 Bot Formulario 29 — declaración masiva (SII Chile)

Herramienta web **sin servidor** para calcular en lote los borradores del
Formulario 29 (Declaración Mensual y Pago Simultáneo de Impuestos del SII):
IVA débito/crédito, PPM y retenciones, para muchas empresas y períodos a la
vez, a partir de una planilla CSV.

> ⚠️ **Genera borradores, no declara.** Los valores calculados deben
> revisarse y digitarse en [www.sii.cl](https://www.sii.cl) (o validarse
> contra la propuesta del SII). Ante cualquier diferencia, manda la
> normativa vigente y el criterio de tu contador.

## Cómo usarlo

1. Abre `f29/index.html` en el navegador (doble clic).
2. Descarga la **plantilla CSV** y complétala en Excel / Google Sheets:
   una fila por empresa y período. Guarda como CSV (separado por `;` o `,`).
3. Arrastra el archivo a la página (o pégalo como texto). El bot calcula
   todas las declaraciones de una vez.
4. Revisa la tabla: cada fila se expande con **todos los códigos del F29**,
   advertencias y errores detectados.
5. Exporta los resultados a CSV, copia los códigos de una declaración o
   imprime los borradores (uno por página) para respaldo.

También puedes probarlo al tiro con el botón **“Probar con datos de
ejemplo”** (mismos datos que `ejemplo.csv`).

## Columnas de la plantilla

| Columna | Qué es | Obligatoria |
|---|---|---|
| `rut` | RUT del contribuyente (se valida el dígito verificador) | ✅ |
| `razon_social` | Nombre o razón social | recomendada |
| `periodo` | Mes a declarar, formato `AAAA-MM` (ej: `2026-06`) | ✅ |
| `ventas_netas_afectas` | Ventas con factura, monto **neto** | — |
| `num_facturas_venta` | Cantidad de facturas emitidas (cód. 503) | — |
| `ventas_boletas_brutas` | Ventas con boleta, **IVA incluido** | — |
| `num_boletas` | Cantidad de boletas (cód. 110) | — |
| `ventas_exentas` | Ventas exentas o no gravadas (cód. 142) | — |
| `compras_netas` | Compras del giro con derecho a crédito, neto | — |
| `num_facturas_compra` | Cantidad de facturas recibidas (cód. 519) | — |
| `iva_compras` | Crédito IVA de compras; si se omite se calcula el 19% | — |
| `remanente_anterior` | Remanente de crédito fiscal del mes anterior, en pesos (cód. 504) | — |
| `tasa_ppm` | Tasa de PPM 1ª categoría, en % (ej: `0,25`) | — |
| `honorarios_brutos` | Boletas de honorarios de terceros, monto bruto (para cód. 151) | — |
| `impuesto_unico` | Impuesto único a los trabajadores retenido (cód. 048) | — |

Los montos aceptan formato chileno (`12.500.000`, `$ 1.234.567`) o números
planos. Las columnas no informadas se asumen `0`.

## Qué calcula (códigos del F29)

- **Débitos**: cód. 502/503 (facturas), 110/111 (boletas, se separa el IVA
  del monto bruto), 142 (exentas) y **538** (total débitos).
- **Créditos**: cód. 519/520 (facturas recibidas), 504 (remanente anterior)
  y **537** (total créditos).
- **IVA**: cód. **089** (IVA determinado) o **077** (remanente para el mes
  siguiente, con aviso para arrastrarlo al próximo F29).
- **PPM**: cód. 563 (base imponible = ingresos netos del mes), 115 (tasa) y
  **062** (PPM neto determinado).
- **Retenciones**: cód. **151** (retención de boletas de honorarios con la
  tasa del año del período — Ley 21.133: 2025 14,5%, 2026 15,25%, 2027 16%,
  2028+ 17%) y cód. 048 (impuesto único).
- **Totales**: cód. 595 (subtotal) y **091** (total a pagar dentro del plazo).

Además detecta: RUT con dígito verificador incorrecto, períodos mal
escritos, montos ilegibles o negativos, declaraciones **sin movimiento**,
IVA de compras inconsistente con el 19% y tasas de PPM sospechosas.

## Archivos

| Archivo | Rol |
|---|---|
| `index.html` | Página de la herramienta |
| `f29-app.js` | Interfaz: carga de CSV, tabla, exportación, impresión |
| `f29-engine.js` | Motor de cálculo puro (browser + Node.js) |
| `f29.css` | Estilos |
| `ejemplo.csv` | Planilla de ejemplo con 5 empresas |
| `test.js` | Pruebas del motor (`node f29/test.js`) |

## Pruebas

```bash
node f29/test.js
```

19 pruebas cubren validación de RUT, parseo de montos y CSV, casos con IVA a
pagar, remanente, sin movimiento y manejo de errores.
