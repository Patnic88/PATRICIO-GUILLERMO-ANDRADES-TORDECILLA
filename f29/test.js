/**
 * Pruebas del motor F29. Ejecutar con:  node f29/test.js
 */
"use strict";

const assert = require("assert");
const F29 = require("./f29-engine.js");

let pruebas = 0;
function prueba(nombre, fn) {
  pruebas++;
  try {
    fn();
    console.log("  ✓ " + nombre);
  } catch (e) {
    console.error("  ✗ " + nombre);
    console.error(e);
    process.exitCode = 1;
  }
}

console.log("Motor F29 — pruebas\n");

// ------------------------------------------------------------------ RUT ----
prueba("valida RUT correcto (77.123.456-9)", () => {
  assert.strictEqual(F29.validarRut("77.123.456-9"), true);
});
prueba("valida RUT con dígito K (96.874.030-K)", () => {
  assert.strictEqual(F29.validarRut("96.874.030-K"), true);
  assert.strictEqual(F29.validarRut("96874030k"), true);
});
prueba("rechaza RUT con dígito verificador malo", () => {
  assert.strictEqual(F29.validarRut("77.123.456-0"), false);
  assert.strictEqual(F29.validarRut("no-es-rut"), false);
});
prueba("formatea RUT con puntos y guión", () => {
  assert.strictEqual(F29.formatearRut("771234569"), "77.123.456-9");
});

// --------------------------------------------------------------- montos ----
prueba("parsea montos en formato chileno", () => {
  assert.strictEqual(F29.parsearMonto("1.234.567"), 1234567);
  assert.strictEqual(F29.parsearMonto("$ 1.234.567"), 1234567);
  assert.strictEqual(F29.parsearMonto("1234567"), 1234567);
  assert.strictEqual(F29.parsearMonto("1.234,56"), 1234.56);
  assert.strictEqual(F29.parsearMonto("0,25"), 0.25);
  assert.strictEqual(F29.parsearMonto(""), 0);
  assert.ok(isNaN(F29.parsearMonto("abc")));
});

// ------------------------------------------------------------- retención ----
prueba("tasa de retención de honorarios por año", () => {
  assert.strictEqual(F29.tasaRetencionHonorarios(2025), 0.145);
  assert.strictEqual(F29.tasaRetencionHonorarios(2026), 0.1525);
  assert.strictEqual(F29.tasaRetencionHonorarios(2028), 0.17);
  assert.strictEqual(F29.tasaRetencionHonorarios(2030), 0.17);
});

// ---------------------------------------------------------------- cálculo ----
prueba("F29 típico: IVA a pagar + PPM + retenciones", () => {
  const r = F29.calcularF29({
    rut: "77.123.456-9",
    razon_social: "Comercial Ejemplo SpA",
    periodo: "2026-06",
    ventas_netas_afectas: "12.500.000",
    num_facturas_venta: "18",
    ventas_boletas_brutas: "3.570.000",
    num_boletas: "240",
    compras_netas: "6.800.000",
    num_facturas_compra: "35",
    remanente_anterior: "0",
    tasa_ppm: "0,25",
    honorarios_brutos: "1.200.000",
    impuesto_unico: "185.000",
  });
  assert.strictEqual(r.ok, true, r.errores.join("; "));
  assert.strictEqual(r.codigos["502"], 2375000);        // 12.500.000 × 19%
  assert.strictEqual(r.codigos["111"], 570000);         // 3.570.000 − 3.570.000/1,19
  assert.strictEqual(r.codigos["538"], 2945000);        // total débitos
  assert.strictEqual(r.codigos["520"], 1292000);        // 6.800.000 × 19%
  assert.strictEqual(r.codigos["537"], 1292000);        // total créditos
  assert.strictEqual(r.codigos["089"], 1653000);        // IVA determinado
  assert.strictEqual(r.codigos["077"], 0);
  assert.strictEqual(r.codigos["563"], 12500000 + 3000000); // base PPM (netos)
  assert.strictEqual(r.codigos["062"], Math.round(15500000 * 0.0025)); // 38.750
  assert.strictEqual(r.codigos["151"], Math.round(1200000 * 0.1525));  // 183.000 (2026)
  assert.strictEqual(r.codigos["048"], 185000);
  assert.strictEqual(
    r.codigos["091"],
    1653000 + 38750 + 183000 + 185000
  );
});

prueba("crédito mayor que débito genera remanente (cód 77) y no IVA", () => {
  const r = F29.calcularF29({
    rut: "77.123.456-9",
    razon_social: "Inversiones Sur Ltda",
    periodo: "2026-05",
    ventas_netas_afectas: "1.000.000",
    compras_netas: "5.000.000",
    tasa_ppm: "0,125",
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.codigos["538"], 190000);
  assert.strictEqual(r.codigos["537"], 950000);
  assert.strictEqual(r.codigos["089"], 0);
  assert.strictEqual(r.codigos["077"], 760000);
  assert.ok(r.advertencias.some((a) => a.includes("remanente")));
});

prueba("remanente anterior se suma a los créditos (cód 504)", () => {
  const r = F29.calcularF29({
    rut: "77.123.456-9",
    razon_social: "X",
    periodo: "2026-06",
    ventas_netas_afectas: "1.000.000",
    remanente_anterior: "100.000",
  });
  assert.strictEqual(r.codigos["504"], 100000);
  assert.strictEqual(r.codigos["537"], 100000);
  assert.strictEqual(r.codigos["089"], 90000);
});

prueba("iva_compras explícito manda sobre el 19% calculado", () => {
  const r = F29.calcularF29({
    rut: "77.123.456-9",
    razon_social: "X",
    periodo: "2026-06",
    compras_netas: "1.000.000",
    iva_compras: "150.000", // menor al 19% (p. ej. crédito proporcional)
  });
  assert.strictEqual(r.codigos["520"], 150000);
  assert.ok(r.advertencias.some((a) => a.includes("difiere")));
});

prueba("declaración sin movimiento queda marcada", () => {
  const r = F29.calcularF29({
    rut: "77.123.456-9",
    razon_social: "Sociedad Pasiva SpA",
    periodo: "2026-06",
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sinMovimiento, true);
  assert.strictEqual(r.codigos["091"], 0);
});

prueba("RUT inválido y período malo producen errores", () => {
  const r = F29.calcularF29({
    rut: "11.111.111-9",
    razon_social: "X",
    periodo: "junio",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errores.length, 2);
});

prueba("montos negativos o ilegibles producen error", () => {
  const r = F29.calcularF29({
    rut: "77.123.456-9",
    razon_social: "X",
    periodo: "2026-06",
    ventas_netas_afectas: "-5000",
    compras_netas: "abc",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errores.length, 2);
});

// -------------------------------------------------------------------- CSV ----
prueba("parsea CSV con punto y coma (plantilla)", () => {
  const { entradas, errores } = F29.parsearCsv(F29.plantillaCsv());
  assert.strictEqual(errores.length, 0);
  assert.strictEqual(entradas.length, 1);
  assert.strictEqual(entradas[0].rut, "77.123.456-9");
  assert.strictEqual(entradas[0].periodo, "2026-06");
});

prueba("parsea CSV con comas y comillas", () => {
  const csv =
    'rut,razon_social,periodo,ventas_netas_afectas\n' +
    '77.123.456-0,"Pérez, Soto y Cía",2026-06,"1000000"\n';
  const { entradas } = F29.parsearCsv(csv);
  assert.strictEqual(entradas.length, 1);
  assert.strictEqual(entradas[0].razon_social, "Pérez, Soto y Cía");
});

prueba("CSV sin columnas obligatorias reporta error claro", () => {
  const { entradas, errores } = F29.parsearCsv("a;b;c\n1;2;3\n");
  assert.strictEqual(entradas.length, 0);
  assert.strictEqual(errores.length, 1);
});

prueba("encabezados con mayúsculas y tildes se normalizan", () => {
  const csv = "RUT;Razón Social;Período;Ventas Netas Afectas\n77.123.456-0;X;2026-06;1000\n";
  const { entradas } = F29.parsearCsv(csv);
  assert.strictEqual(entradas[0].rut, "77.123.456-0");
  assert.strictEqual(entradas[0].razon_social, "X");
  assert.strictEqual(entradas[0].ventas_netas_afectas, "1000");
});

prueba("CSV de resultados incluye todos los códigos y estado", () => {
  const r = F29.calcularF29({
    rut: "77.123.456-9",
    razon_social: "X",
    periodo: "2026-06",
    ventas_netas_afectas: "1.000.000",
  });
  const csv = F29.generarCsvResultados([r]);
  const lineas = csv.trim().split("\n");
  assert.strictEqual(lineas.length, 2);
  assert.ok(lineas[0].includes("cod_538"));
  assert.ok(lineas[0].includes("cod_091"));
  assert.ok(lineas[1].includes("190000"));
  assert.ok(lineas[1].includes(";ok;"));
});

prueba("texto de códigos para digitar incluye total y vencimientos", () => {
  const r = F29.calcularF29({
    rut: "77.123.456-9",
    razon_social: "X",
    periodo: "2026-12",
    ventas_netas_afectas: "1.000.000",
  });
  const texto = F29.textoCodigos(r);
  assert.ok(texto.includes("cód 091"));
  assert.ok(texto.includes("enero 2027")); // vencimiento cruza de año
});

console.log("\n" + pruebas + " pruebas ejecutadas.");
if (process.exitCode) {
  console.error("HAY PRUEBAS FALLIDAS");
} else {
  console.log("Todas las pruebas pasaron ✔");
}
