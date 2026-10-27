// Plantillas HTML del panel. Todo valor dinámico pasa por h() (escape).

import { h } from "../http-util.js";

export function layout({ titulo, cuerpo, sesion, cfg, alertasAbiertas = 0, aviso = null }) {
  const nav = sesion
    ? `<nav>
        <a href="/panel">Resumen</a>
        <a href="/panel/alertas">Alertas${alertasAbiertas ? ` <span class="contador">${alertasAbiertas}</span>` : ""}</a>
        <a href="/panel/conversaciones">Conversaciones</a>
        <a href="/panel/solicitudes">Solicitudes</a>
        <a href="/panel/clientes">Clientes</a>
        <a href="/panel/citas">Citas</a>
        <a href="/panel/pagos">Pagos</a>
        <a href="/panel/conocimiento">Conocimiento</a>
        <a href="/panel/simulador">Simulador</a>
        <a href="/panel/auditoria">Registro</a>
        <form method="post" action="/panel/salir" class="en-linea">${csrf(sesion)}<button class="enlace">Salir</button></form>
      </nav>`
    : "";
  const modo = cfg.modo === "prueba"
    ? `<div class="banda prueba">MODO PRUEBA: las respuestas no se envían a clientes reales (solo a NUMEROS_PRUEBA, si están configurados). IA: ${h(cfg.ia.proveedor)}.</div>`
    : `<div class="banda produccion">PRODUCCIÓN: el agente responde a clientes reales. IA: ${h(cfg.ia.proveedor)} (${h(cfg.ia.modelo)}).</div>`;
  return `<!doctype html>
<html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(titulo)} · A & A</title><link rel="stylesheet" href="/panel/estaticos/panel.css">
${sesion ? `<meta name="csrf" content="${h(sesion.csrf)}">` : ""}</head>
<body>${modo}<header><strong>A &amp; A jurídico y contable</strong> · Panel del agente de WhatsApp</header>${nav}
<main>${aviso ? `<p class="aviso">${h(aviso)}</p>` : ""}<h1>${h(titulo)}</h1>${cuerpo}</main></body></html>`;
}

export const csrf = (sesion) => `<input type="hidden" name="_csrf" value="${h(sesion.csrf)}">`;

export function tabla(columnas, filas, vacio = "Sin registros.") {
  if (!filas.length) return `<p class="vacio">${h(vacio)}</p>`;
  return `<div class="tabla"><table><thead><tr>${columnas.map((c) => `<th>${h(c)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export const etiqueta = (texto, clase = "") => `<span class="etiqueta ${h(clase)}">${h(texto)}</span>`;
export const fecha = (iso) => (iso ? h(new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })) : "—");

export function seleccion(nombre, opciones, actual) {
  return `<select name="${h(nombre)}">${opciones.map((o) => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${h(v)}"${String(v) === String(actual ?? "") ? " selected" : ""}>${h(t)}</option>`;
  }).join("")}</select>`;
}

export function formulario(accion, sesion, contenido, boton = "Guardar", clase = "") {
  return `<form method="post" action="${h(accion)}" class="${h(clase)}">${csrf(sesion)}${contenido}<button>${h(boton)}</button></form>`;
}

export function login(error) {
  return `<form method="post" action="/panel/login" class="tarjeta login">
    ${error ? `<p class="error">${h(error)}</p>` : ""}
    <label>Usuario <input name="usuario" autocomplete="username" required></label>
    <label>Clave <input name="clave" type="password" autocomplete="current-password" required></label>
    <button>Ingresar</button></form>`;
}
