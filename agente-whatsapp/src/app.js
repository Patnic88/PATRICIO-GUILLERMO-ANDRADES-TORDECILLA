// Ensambla los componentes del servicio. Las pruebas usan esta misma función
// con una base de datos en memoria, un cliente de WhatsApp falso y el
// proveedor de IA simulado.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ, leerConfig } from "./config.js";
import { abrirDb } from "./db.js";
import { cargarSemilla } from "./servicios/conocimiento.js";
import { fijarNotificador } from "./servicios/alertas.js";
import { crearProveedorAnthropic } from "./ia/anthropic.js";
import { crearProveedorSimulado } from "./ia/simulado.js";
import { crearClienteWhatsApp } from "./whatsapp/cliente.js";
import { crearProcesador } from "./procesador.js";

export function crearApp({ cfg = leerConfig(), db = null, ia = null, whatsapp = null, herramientas = null } = {}) {
  db ??= abrirDb(join(cfg.dirDatos, "agente.db"));
  cargarSemilla(db, join(RAIZ, "conocimiento", "base-inicial.json"));
  const instrucciones = readFileSync(join(RAIZ, "instrucciones", "agente.md"), "utf8");
  ia ??= cfg.ia.proveedor === "anthropic" ? crearProveedorAnthropic(cfg.ia) : crearProveedorSimulado();
  whatsapp ??= crearClienteWhatsApp(cfg);
  const app = { cfg, db, ia, whatsapp, instrucciones, herramientas };
  app.procesador = crearProcesador(app);

  // Aviso a Patricio por WhatsApp para alertas de prioridad alta. Requiere
  // NUMERO_PATRICIO y una plantilla aprobada (PLANTILLA_ALERTA); el texto no
  // incluye datos del cliente, solo el tipo y el número de alerta.
  const n = cfg.notificaciones;
  fijarNotificador(async ({ id, tipo }) => {
    if (!n.numeroPatricio || !n.plantillaAlerta) return false;
    const r = await whatsapp.enviarPlantilla(n.numeroPatricio, n.plantillaAlerta, n.idiomaPlantilla, [tipo, `#${id}`]);
    return !r.simulado;
  });
  return app;
}
