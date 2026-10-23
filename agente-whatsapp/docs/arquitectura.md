# Arquitectura

## Visión general

```
 Cliente (WhatsApp)
        │
        ▼
 Meta · WhatsApp Cloud API ──webhook HTTPS (firmado)──►  /webhook/whatsapp
                                                          │ valida firma HMAC-SHA256
                                                          │ deduplica por id de mensaje
                                                          ▼
                                                    SQLite (cola persistente)
                                                          │ espera DEBOUNCE_MS y agrupa
                                                          ▼
                                         ┌──── Turno del agente ────┐
                                         │ 1. Detección de urgencias │──► alertas
                                         │ 2. Contexto + historial   │
                                         │ 3. Modelo de IA ⇄ herram. │──► solicitudes, antecedentes,
                                         │ 4. Controles de salida    │    documentos, citas, pagos
                                         └───────────┬──────────────┘
                                                     ▼
                                      Envío (una respuesta por grupo de mensajes)
                                                     │
 Patricio ◄── Panel /panel (sesión + CSRF) ──────────┘  alertas, toma de control, verificación
```

Un solo proceso Node.js (22.13+) sin framework web. La única dependencia externa de código es el SDK oficial de Anthropic (`@anthropic-ai/sdk`, versión fijada). La base de datos es SQLite mediante el módulo `node:sqlite` incluido en Node.

## Estructura del código

| Ruta | Contenido |
|---|---|
| `src/servidor.js` | HTTP: webhook, panel, `/salud`. Arranque y apagado ordenado. |
| `src/app.js` | Ensambla base de datos, proveedor de IA, cliente de WhatsApp y cola. |
| `src/config.js` | Variables de entorno y validación (producción exige credenciales). |
| `src/db.js` | Esquema SQLite y transacciones. |
| `src/procesador.js` | Cola persistente, descarga de adjuntos, envío, deduplicación, recuperación tras reinicio, simulador. |
| `src/whatsapp/` | Webhook (verificación y firma) y cliente de la Cloud API. |
| `src/agente/turno.js` | Un turno: urgencias → contexto → modelo y herramientas → controles. |
| `src/agente/herramientas.js` | Las 12 herramientas, con validación y reglas de acceso en código. |
| `src/agente/contexto.js` | Historial y bloque de contexto interno (política de memoria). |
| `src/agente/urgencias.js` | Detección determinista de audiencias, notificaciones, plazos, remates, etc. |
| `src/agente/guardas.js` | Controles de salida (citas, pagos, plazos, promesas, montos, suplantación). |
| `src/ia/anthropic.js` | Proveedor real (Claude). |
| `src/ia/simulado.js` | Proveedor de reglas fijas para demostración y pruebas. |
| `src/servicios/` | Conversaciones e identidad, agenda, base de conocimiento, alertas, auditoría, RUT, fechas, criptografía. |
| `src/panel/` | Panel de administración (HTML generado en el servidor, sin JavaScript salvo el simulador). |
| `instrucciones/agente.md` | Instrucciones del agente. |
| `conocimiento/base-inicial.json` | Semilla de la base de conocimiento. |

## Modelo de datos

- **contactos**: un número de WhatsApp. Puede asociarse a una ficha de cliente (solo desde el panel).
- **conversaciones**: una por contacto; guarda el modo (`auto` o `humano`), la verificación de identidad vigente y los bloqueos.
- **mensajes**: entrantes y salientes con su estado (`pendiente → procesando → procesado`; `enviando → enviado/entregado/leído`, o `fallido`/`incierto`). El id de WhatsApp es único (deduplicación) y cada grupo de mensajes admite una sola respuesta (`en_respuesta_a` único).
- **clientes**, **asuntos**, **gestiones**: fichas que administra Patricio. El agente no crea asuntos: aceptar un encargo es decisión profesional.
- **solicitudes**: lo que el agente recoge (tipo de cliente, materia, motivo, comuna, urgencia, siguiente acción, datos judiciales y fechas literales).
- **antecedentes**: cada dato con su **origen**: `declarado` (dicho por el cliente), `documental` (consta en un documento recibido) o `verificado` (confirmado por la oficina en el panel). El agente no puede crear antecedentes verificados.
- **documentos**, **citas**, **pagos**, **alertas**, **conocimiento**, **ajustes**, **auditoria**, **sesiones_admin**.

## Memoria y confidencialidad

- Todo lo que el agente ve se consulta por el id de **la conversación actual**; no existe consulta que cruce conversaciones o clientes.
- **Sin identidad verificada**, el agente solo recuerda lo que ese número dijo en las últimas `MEMORIA_SESION_HORAS` (72 h por defecto) y nunca recibe datos de la ficha del cliente, ni siquiera el nombre. Así, si un número cambia de dueño, el nuevo titular no accede a lo anterior.
- **Con identidad verificada** (RUT + código personal, o verificación manual de Patricio), el agente ve los asuntos del cliente y puede usar `consultar_expediente`. La verificación dura `VERIFICACION_HORAS` (12 h).
- El código se compara con un hash scrypt; tras tres intentos fallidos la verificación se bloquea 30 minutos y se alerta a Patricio. Al verificarse, el código se borra del historial guardado.
- Estas reglas están en el código de las herramientas: aunque el modelo intente consultar un expediente sin verificación, la herramienta lo rechaza.

## Defensa contra instrucciones maliciosas

- Los mensajes del cliente se envuelven en `<mensaje_cliente>` con los caracteres `<` y `>` escapados: un cliente no puede imitar etiquetas del sistema.
- El contexto interno se entrega como mensaje de sistema intermedio (canal del operador), separado del texto del cliente.
- El contenido de documentos y audios **no** se entrega al modelo.
- Las acciones sensibles se validan en código (identidad, propiedad de documentos y asuntos, bloques de agenda reales, estados de pago).
- Los controles de salida bloquean respuestas que afirmen citas o pagos no respaldados, calculen plazos, prometan resultados, informen montos no aprobados o suplanten a Patricio.

## Garantías de funcionamiento

| Riesgo | Control |
|---|---|
| Meta reintenta el webhook | Id de mensaje único; un mismo mensaje se registra una vez. |
| Cliente envía varios mensajes seguidos | Espera `DEBOUNCE_MS` y responde una vez al grupo. |
| Reinicio a mitad de proceso | Los mensajes `procesando` vuelven a la cola; un envío interrumpido queda `incierto` y **no se reenvía** (alerta para revisar). |
| Falla de una herramienta | Resultado de error explícito al modelo, alerta y prohibición de afirmar la gestión. |
| Falla del proveedor de IA | Aviso honesto al cliente (una vez cada 30 min) y alerta. Los reintentos de red los hace el SDK (2). |
| Falla de envío por WhatsApp | Mensaje `fallido`, alerta, sin reenvío automático. |
| Abuso o costos descontrolados | Tope de `MAX_TURNOS_HORA` respuestas por conversación y hora. |
| Patricio toma la conversación | Modo `humano`: el agente no responde en ese chat hasta que se devuelva. Pausa global disponible. |

## Integración con Claude

- Bucle de herramientas propio (sin componentes beta del SDK), con máximo `IA_MAX_ITERACIONES` llamadas por turno.
- `thinking: adaptive` y `output_config.effort` configurable (`medium` por defecto).
- Instrucciones en `system` con caché de prompt; el contexto variable va al final para no invalidarla.
- El historial entre turnos se reconstruye como texto, sin reenviar bloques de razonamiento; dentro de un turno, los mensajes solo se agregan al final.
- `fallbacks: "default"` (encabezado `server-side-fallback-2026-07-01`): si los clasificadores de seguridad rechazan una solicitud, la API reintenta con el modelo de respaldo que Anthropic define. Se desactiva con `IA_FALLBACKS=false`.
- Un rechazo final (`stop_reason: refusal`) se trata como falla: no se envía texto parcial.

Para usar otro proveedor de IA basta con un módulo que implemente `generar({ system, mensajes, herramientas })` y devuelva el mismo formato (bloques `text` y `tool_use`). Solo están implementados Anthropic y el simulado.

## Panel de administración

- Usuario único (Patricio), clave con hash scrypt en `ADMIN_CLAVE_HASH`, cookie `HttpOnly`, `SameSite=Strict` y `Secure` en producción, sesiones de `SESION_HORAS`.
- Token CSRF en toda acción; límite de 5 intentos de ingreso cada 15 minutos por IP.
- Cabeceras: `Content-Security-Policy` sin scripts en línea, `X-Frame-Options: DENY`, `nosniff`, `no-store`.
- Los documentos solo se descargan con sesión y se guardan con nombres generados (nunca con el nombre enviado por el cliente) y permisos `600`.

## Datos personales

El sistema guarda datos personales y, potencialmente, datos sensibles de clientes (situación judicial, migratoria, laboral). Antes de producción conviene definir con criterio profesional el aviso de tratamiento de datos, el plazo de conservación y el procedimiento de eliminación. La Ley 21.719, que modifica la regulación de protección de datos personales, tendría entrada en vigencia el 1 de diciembre de 2026 según fuentes secundarias consultadas; existe un proyecto de ley que la posterga. **No pude verificarlo en BCN desde este entorno: requiere verificación documental antes de usarlo.**

Los mensajes y el contexto se envían a los proveedores (Meta y Anthropic) para prestar el servicio. Revise sus condiciones de tratamiento y retención de datos antes de activar el servicio.

## Limitaciones conocidas

- No transcribe audios ni lee documentos: pide al cliente que escriba y deja los archivos para Patricio.
- Las fechas se registran literalmente ("mañana", "15 de noviembre"); no se convierten ni se calculan plazos.
- Agenda propia del sistema; no sincroniza con Google Calendar.
- Un solo proceso: no está pensado para varios servidores en paralelo (no lo necesita para el volumen de una oficina).
- El proveedor simulado sirve para revisar el sistema, no la calidad conversacional.
