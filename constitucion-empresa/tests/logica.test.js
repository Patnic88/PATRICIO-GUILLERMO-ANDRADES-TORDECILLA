// Pruebas de la lógica del asistente. Ejecutar: node tests/logica.test.js
const assert = require("assert");
const L = require("../logica.js");

// --- RUT (datos de prueba ficticios) ---
assert.strictEqual(L.validarRut("11.111.111-1"), true);
assert.strictEqual(L.validarRut("12345678-5"), true);
assert.strictEqual(L.validarRut("12.345.678-K"), false);
assert.strictEqual(L.validarRut("12345678-4"), false);
assert.strictEqual(L.validarRut(""), false);
assert.strictEqual(L.validarRut("0-0"), false);
assert.strictEqual(L.dvRut("10000013"), "K");
assert.strictEqual(L.validarRut("10.000.013-k"), true); // k minúscula
assert.strictEqual(L.formatearRut("123456785"), "12.345.678-5");
assert.strictEqual(L.formatearRut(" 7.654.321-6 "), "7.654.321-6");

// --- Razón social con la terminación de cada tipo ---
assert.strictEqual(L.razonSocialCompleta("Comercial Norte", "SPA"), "Comercial Norte SpA");
assert.strictEqual(L.razonSocialCompleta("Comercial Norte spa", "SPA"), "Comercial Norte SpA");
assert.strictEqual(L.razonSocialCompleta("Comercial Norte Ltda.", "LTDA"), "Comercial Norte Limitada");
assert.strictEqual(L.razonSocialCompleta("Comercial Norte limitada", "LTDA"), "Comercial Norte Limitada");
assert.strictEqual(L.razonSocialCompleta("Asesorías Ana Pérez EIRL", "EIRL"), "Asesorías Ana Pérez E.I.R.L.");
assert.strictEqual(L.razonSocialCompleta("Asesorías Ana Pérez e.i.r.l.", "EIRL"), "Asesorías Ana Pérez E.I.R.L.");
assert.strictEqual(L.razonSocialCompleta("  ", "SPA"), "");
assert.strictEqual(L.razonSocialCompleta("SpA", "SPA"), "");

// --- Nombre de una EIRL debe incluir nombre y apellido del titular ---
const titular = { nombres: "Ana María", apellidoPaterno: "Pérez", apellidoMaterno: "Soto" };
assert.strictEqual(L.revisarNombreEirl("Asesorías Ana Pérez", titular).ok, true);
assert.strictEqual(L.revisarNombreEirl("Asesorias ANA PEREZ", titular).ok, true); // sin tildes ni mayúsculas
assert.strictEqual(L.revisarNombreEirl("Asesorías Pérez", titular).ok, false); // falta el nombre
assert.strictEqual(L.revisarNombreEirl("Asesorías Ana", titular).ok, false); // falta el apellido
const soloMaterno = L.revisarNombreEirl("Asesorías María Soto", titular);
assert.strictEqual(soloMaterno.ok, true);
assert.ok(soloMaterno.aviso); // avisa por el apellido paterno
assert.strictEqual(L.revisarNombreEirl("Asesorías Anaís Pérez", titular).ok, false); // palabra completa

// --- Capital y participaciones ---
const socios = [{ aporte: "1.000.000" }, { aporte: 500000 }, { aporte: "500000" }];
assert.strictEqual(L.capitalTotal(socios), 2000000);
assert.deepStrictEqual(L.participaciones(socios), [50, 25, 25]);
const tercios = L.participaciones([{ aporte: 1 }, { aporte: 1 }, { aporte: 1 }]);
assert.strictEqual(Math.round(tercios.reduce((a, b) => a + b, 0) * 10) / 10, 100);
assert.deepStrictEqual(L.participaciones([{ aporte: "" }]), [0]);

// --- Tipos posibles ---
assert.deepStrictEqual(L.tiposPosibles(1, false), ["SPA", "EIRL"]);
assert.deepStrictEqual(L.tiposPosibles(3, false), ["SPA", "LTDA"]);
assert.deepStrictEqual(L.tiposPosibles(1, true), ["SPA"]);
assert.deepStrictEqual(L.tiposPosibles(60, false), ["SPA"]);
assert.deepStrictEqual(L.tiposPosibles(0, false), []);

// --- Validación por paso ---
function socioOk(id, rut, aporte) {
  return Object.assign(L.socioVacio(id), {
    nombres: "Ana María", apellidoPaterno: "Pérez", apellidoMaterno: "Soto",
    rut, correo: id + "@ejemplo.cl", aporte, estadoCivil: "soltero",
    profesion: "Contadora", domicilio: "Calle 1, Los Vilos", tieneFEA: "si", tieneClaveUnica: "si",
  });
}

const e = L.estadoInicial();
assert.strictEqual(L.validarPaso(e, "tipo").errores.length, 1);
e.tipo = "EIRL";
assert.strictEqual(L.validarPaso(e, "tipo").errores.length, 0);

// EIRL con dos titulares -> error de cantidad
e.socios = [socioOk("s1", "11.111.111-1", 1000000), socioOk("s2", "12.345.678-5", 1000)];
assert.ok(L.validarPaso(e, "socios").errores.some((x) => x.campo === "socios"));
e.socios = [socioOk("s1", "11.111.111-1", 1000000)];
assert.strictEqual(L.validarPaso(e, "socios").errores.length, 0);

// EIRL con persona jurídica -> error
e.socios[0].tipoPersona = "juridica";
assert.ok(L.validarPaso(e, "socios").errores.some((x) => x.campo === "socio:s1:tipoPersona"));
e.socios[0].tipoPersona = "natural";

// RUT repetido en una SpA
e.tipo = "SPA";
e.socios = [socioOk("s1", "11.111.111-1", 1), socioOk("s2", "11111111-1", 1)];
assert.ok(L.validarPaso(e, "socios").errores.some((x) => x.campo === "socio:s2:rut"));

// Ltda. con un solo socio -> error
e.tipo = "LTDA";
e.socios = [socioOk("s1", "11.111.111-1", 1)];
assert.ok(L.validarPaso(e, "socios").errores.some((x) => x.campo === "socios"));

// Empresa: nombre de EIRL sin el titular -> error
e.tipo = "EIRL";
e.empresa = Object.assign(e.empresa, {
  razonSocial: "Servicios Contables", objeto: "Asesoría contable y tributaria", region: "Coquimbo", comuna: "Los Vilos",
});
assert.ok(L.validarPaso(e, "empresa").errores.some((x) => x.campo === "empresa.razonSocial"));
e.empresa.razonSocial = "Servicios Contables Ana Pérez";
assert.strictEqual(L.validarPaso(e, "empresa").errores.length, 0);
e.empresa.duracion = "plazo";
assert.ok(L.validarPaso(e, "empresa").errores.some((x) => x.campo === "empresa.anios"));
e.empresa.anios = "10";
assert.strictEqual(L.validarPaso(e, "empresa").errores.length, 0);

// Administración: nadie elegido -> error; socio elegido -> ok
assert.strictEqual(L.validarPaso(e, "admin").errores.length, 1);
e.admin.ids = ["s1"];
assert.strictEqual(L.validarPaso(e, "admin").errores.length, 0);
// Un administrador externo necesita RUT válido
e.admin.externoNombre = "Luis Rojas";
e.admin.externoRut = "123";
assert.ok(L.validarPaso(e, "admin").errores.some((x) => x.campo === "admin.externoRut"));
e.admin.externoRut = "12.345.678-5";
assert.strictEqual(L.validarPaso(e, "admin").errores.length, 0);

// Resumen: exige consentimiento
e.contacto = { nombre: "Ana", correo: "ana@ejemplo.cl", telefono: "", comentario: "", consentimiento: false };
assert.ok(L.validarPaso(e, "resumen").errores.some((x) => x.campo === "contacto.consentimiento"));
e.contacto.consentimiento = true;
assert.strictEqual(L.primerPasoInvalido(e), -1);

// --- Plan de firma ---
assert.strictEqual(L.planDeFirma({ tieneFEA: "si" }).via, "fea");
assert.strictEqual(L.planDeFirma({ tieneFEA: "no", tieneClaveUnica: "no" }).via, "notario");
assert.strictEqual(L.planDeFirma({ tieneFEA: "nose", tieneClaveUnica: "si" }).via, "elegir");

// --- Presupuesto: sin precios no inventa total ---
const cfgSin = { precios: { SPA: null, EIRL: null, LTDA: null }, extras: [{ id: "inicio", nombre: "Inicio", precio: null }] };
const p0 = L.presupuesto({ tipo: "EIRL", extras: ["inicio"] }, cfgSin);
assert.strictEqual(p0.total, null);
assert.strictEqual(p0.faltan.length, 2);
const cfgCon = { precios: { SPA: 50000, EIRL: 45000, LTDA: 60000 }, extras: [{ id: "inicio", nombre: "Inicio", precio: 20000 }] };
assert.strictEqual(L.presupuesto({ tipo: "EIRL", extras: ["inicio"] }, cfgCon).total, 65000);
assert.strictEqual(L.presupuesto({ tipo: "EIRL", extras: ["no-existe"] }, cfgCon).total, 45000);

// --- Texto de la solicitud ---
const txt = L.textoSolicitud(e, cfgCon);
assert.ok(txt.includes("Servicios Contables Ana Pérez E.I.R.L."));
assert.ok(txt.includes("RUT 11.111.111-1"));
assert.ok(txt.includes("10 años"));
assert.ok(txt.includes("Luis Rojas (RUT 12.345.678-5, no socio)"));
assert.strictEqual(L.formatearPesos(1234567), "$1.234.567");

console.log("OK: todas las pruebas de logica.js pasaron.");
