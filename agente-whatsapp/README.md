# Agente de WhatsApp · A & A jurídico y contable

Asistente virtual que atiende por WhatsApp a los clientes de la oficina de Patricio Guillermo Andrades Tordecilla: conversa, registra antecedentes con memoria por cliente y asunto, informa solo lo aprobado por la oficina, recibe documentos y comprobantes, agenda citas y avisa a Patricio de lo urgente. Las decisiones profesionales quedan siempre en manos de Patricio.

El servicio **arranca en modo prueba**: ningún mensaje llega a clientes reales hasta que usted lo active.

## Qué está implementado, qué está simulado y qué requiere conexión externa

| Componente | Estado |
|---|---|
| Recepción de mensajes de WhatsApp (webhook oficial de Meta), firma, deduplicación, cola persistente | Implementado y probado con mensajes simulados. **Requiere conectar** una cuenta de WhatsApp Business Platform. |
| Envío de respuestas por la API oficial (Cloud API) | Implementado. Probado contra un WhatsApp falso; **no se probó contra Meta** (sin credenciales ni acceso de red desde este entorno). |
| Agente con IA (Claude, de Anthropic) y sus 12 herramientas | Implementado. La forma de la solicitud se probó contra un servidor local. **Requiere** `ANTHROPIC_API_KEY` para funcionar con IA real. |
| Proveedor "simulado" | Reglas fijas que imitan al agente para revisar el sistema sin costo. **No es inteligencia artificial**; su redacción es básica. |
| Memoria por cliente y asunto, verificación de identidad, citas, comprobantes, alertas, derivación, controles de salida | Implementado y probado (80 pruebas automáticas). |
| Panel de administración (conversaciones, alertas, clientes, asuntos, citas, pagos, base de conocimiento, registro, simulador) | Implementado y revisado en navegador. |
| Avisos a Patricio por WhatsApp | Implementado. **Requiere** una plantilla aprobada por Meta. Mientras tanto, las alertas se ven en el panel. |
| Sincronización con Google Calendar | **No implementado.** La agenda es propia del sistema y se administra en el panel. |
| Lectura del contenido de documentos o audios por la IA | **No implementado** a propósito: los archivos se guardan y Patricio los revisa (evita que un documento manipule al agente). |
| Campañas o envíos masivos | **No existen** en el código. |
| Despliegue con Docker + HTTPS (Caddy) o systemd | Archivos incluidos. **No se construyó la imagen Docker** en este entorno (sin servicio Docker disponible). |

## 1. Probarlo ahora en su computador (sin claves, sin costo)

Requisitos: [Node.js](https://nodejs.org) 22.13 o superior.

```bash
cd agente-whatsapp
npm install
cp .env.example .env
npm run clave          # crea la clave del panel; pegue la línea que muestra en .env
npm start
```

Abra <http://127.0.0.1:3000/panel>, ingrese con el usuario `patricio` y su clave, y vaya a **Simulador**: escriba como si fuera un cliente. A la derecha verá qué herramientas usó el agente y qué alertas creó. Las conversaciones del simulador nunca se envían por WhatsApp, ni siquiera en producción.

Otras formas de revisar:

- `npm test` — ejecuta las 80 pruebas automáticas (ver [docs/pruebas.md](docs/pruebas.md)).
- `npm run demo` — regenera [docs/demostracion.md](docs/demostracion.md): diez conversaciones de ejemplo (consulta nueva, honorarios, citas, urgencias, confidencialidad, comprobantes, fallas y derivación).

## 2. Dejar lista la información de la oficina (panel)

Antes de atender clientes reales:

1. **Base de conocimiento** → complete las entradas marcadas *pendiente* (dirección, horario, honorarios, medios de pago, datos bancarios, condiciones de contratación, modalidades de cita, aviso de datos personales) y cámbielas a *aprobado*. Revise los *borradores* (documentos útiles por materia) y apruebe los que correspondan. **El agente solo informa lo aprobado**; lo demás lo deriva.
2. **Citas** → indique sus bloques de atención por día y habilite la agenda. Mientras no lo haga, el agente no ofrece horas y deja la solicitud para que usted la coordine.
3. **Clientes** → cree las fichas de los clientes actuales, sus asuntos y gestiones. Para cada cliente que deba consultar su asunto por WhatsApp, pulse **Generar código de verificación** y entrégueselo en persona o por llamada. Con su RUT y ese código el cliente verifica su identidad; el número de teléfono por sí solo no da acceso.

## 3. Conectar WhatsApp (Meta)

Se usa la **WhatsApp Business Platform (Cloud API)**, la integración oficial de Meta. Pasos generales (los nombres exactos de los menús pueden cambiar; **verifíquelos en la documentación de Meta**, que no pude abrir desde este entorno):

1. En [Meta for Developers](https://developers.facebook.com/) cree una app de tipo empresa asociada a su portafolio comercial y agregue el producto **WhatsApp**.
2. Registre el número que usará el agente. Si ese número hoy funciona en la app WhatsApp Business del teléfono, revise si en Chile está disponible la *coexistencia* (usar la app y la API a la vez) o si debe usar un número dedicado. [VERIFICAR disponibilidad con Meta]
3. Obtenga y copie en `.env`:
   - `WHATSAPP_PHONE_NUMBER_ID` (identificador del número),
   - `WHATSAPP_TOKEN` (token de acceso **permanente** de un usuario del sistema; no use el token temporal de prueba en producción),
   - `WHATSAPP_APP_SECRET` (clave secreta de la app; se usa para validar la firma de cada webhook).
4. Invente un texto largo y aleatorio para `WHATSAPP_VERIFY_TOKEN`.
5. Publique el servicio con HTTPS (sección 5) y configure en Meta el webhook:
   - URL: `https://SU-DOMINIO/webhook/whatsapp`
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`
   - Suscríbase al campo **messages** (y a **smb_message_echoes** si usa coexistencia, para que el agente se pause cuando usted responda desde el teléfono).
6. Mantenga `MODO=prueba` y ponga su propio número en `NUMEROS_PRUEBA`. Solo ese número recibirá respuestas automáticas reales. Si otras personas escriben a ese número, el agente prepara la respuesta y la deja **sin enviar** en el panel (sirve para revisar cómo respondería; cada mensaje igual consume IA si el proveedor es Anthropic). Lo que usted escriba a mano desde el panel sí se envía.

## 4. Activar la IA real

1. Cree una clave en la [consola de Anthropic](https://console.anthropic.com/) y póngala en `ANTHROPIC_API_KEY`.
2. Cambie `IA_PROVEEDOR=anthropic`. El modelo por defecto es `claude-opus-5-5` (`IA_MODELO`); puede cambiarlo (ver costos en [docs/costos.md](docs/costos.md)).
3. Ejecute `npm run demo` con esa configuración: genera `docs/demostracion-anthropic.md` con las mismas diez conversaciones respondidas por Claude. **Revíselas** antes de seguir.
4. Converse desde su número de prueba y desde el simulador. Revise el **Registro** y las **Alertas**.

## 5. Funcionamiento permanente

**Opción A — Docker (recomendada).** En un servidor con Docker y un dominio que apunte a él:

```bash
git clone <este repositorio> /opt/agente && cd /opt/agente/agente-whatsapp
cp .env.example .env    # complete los valores
DOMINIO=agente.sudominio.cl docker compose up -d --build
```

Caddy obtiene el certificado HTTPS y reenvía al agente. Los datos quedan en el volumen `datos`. Programe el respaldo diario con [despliegue/respaldo.cron](despliegue/respaldo.cron).

**Opción B — sin Docker.** Instale Node.js 22.13+, copie la carpeta en `/opt/agente-whatsapp`, cree el usuario `agente`, instale [despliegue/agente-whatsapp.service](despliegue/agente-whatsapp.service) en systemd y ponga Caddy o Nginx delante con HTTPS.

## 6. Pasar a producción

Cambie `MODO=produccion` solo cuando:

- [ ] La base de conocimiento tenga aprobados los datos que el agente debe informar.
- [ ] Haya revisado la demostración con la IA real y conversado desde su número de prueba.
- [ ] El webhook de Meta esté verificado y llegue a `https://SU-DOMINIO/webhook/whatsapp`.
- [ ] `COOKIE_SEGURA=true`, clave del panel robusta y respaldo diario programado.
- [ ] Haya revisado el aviso de tratamiento de datos personales (ver [docs/arquitectura.md](docs/arquitectura.md#datos-personales)).

El servicio se niega a arrancar en producción si faltan credenciales o si el proveedor es el simulado.

## 7. Uso diario

- **Alertas**: audiencias, notificaciones, posibles vencimientos, remates, derivaciones, comprobantes y fallas. Resuélvalas al atenderlas.
- **Tomar una conversación**: en la conversación, pulse *Tomar la conversación* o escriba su respuesta (el agente se pausa en ese chat). Para devolverla pulse *Devolver al agente*. El botón del resumen pausa al agente en **todas** las conversaciones.
- **Comprobantes**: en *Pagos*, márquelos como verificados o rechazados después de revisarlos en su cartola.
- **Solicitudes**: cuando acepte un encargo, use *Crear asunto*; la ficha del cliente se crea o se vincula.
- **Respaldo**: `npm run respaldo` (o el cron). Copie también la carpeta `documentos`.

WhatsApp solo permite responder libremente dentro de las 24 horas siguientes al último mensaje del cliente; fuera de ese plazo el panel no deja enviar (se necesitaría una plantilla aprobada).

## Variables de entorno

Todas están descritas en [.env.example](.env.example). Las más importantes:

| Variable | Para qué |
|---|---|
| `MODO` | `prueba` (por defecto) o `produccion`. |
| `ADMIN_CLAVE_HASH` | Clave del panel (generada con `npm run clave`). |
| `WHATSAPP_*` | Credenciales de la Cloud API de Meta. |
| `NUMEROS_PRUEBA` | En modo prueba, únicos números que reciben mensajes reales. |
| `IA_PROVEEDOR`, `ANTHROPIC_API_KEY`, `IA_MODELO`, `IA_ESFUERZO` | Proveedor y modelo de IA. |
| `IA_CONTEXTO_COMO_SISTEMA` | Envía el contexto interno como mensaje de sistema intermedio (por defecto). Póngalo en `false` si elige un modelo que no lo admite. |
| `MEMORIA_SESION_HORAS` | Cuánto recuerda el agente de un contacto **no verificado** (por defecto 72 h). |
| `VERIFICACION_HORAS`, `INTENTOS_VERIFICACION`, `INTENTOS_POR_CLIENTE`, `BLOQUEO_MINUTOS` | Duración de la verificación de identidad y bloqueos por intentos fallidos (por conversación y por ficha de cliente). |
| `CONFIAR_PROXY` | `true` cuando hay un proxy HTTPS delante (Docker ya lo activa); permite limitar los intentos de ingreso al panel por la IP real. |
| `MAX_TURNOS_HORA` | Tope de respuestas automáticas por conversación y hora. |
| `NUMERO_PATRICIO`, `PLANTILLA_ALERTA` | Aviso por WhatsApp de alertas de prioridad alta (opcional). |

## Documentación

- [docs/arquitectura.md](docs/arquitectura.md) — componentes, flujo, memoria, seguridad y decisiones de diseño.
- [instrucciones/agente.md](instrucciones/agente.md) — instrucciones definitivas que rigen al agente (se envían tal cual al modelo).
- [conocimiento/base-inicial.json](conocimiento/base-inicial.json) — base de conocimiento inicial con los campos pendientes.
- [docs/costos.md](docs/costos.md) — dependencias externas, costos estimados, supuestos y fuentes.
- [docs/pruebas.md](docs/pruebas.md) — qué cubre cada prueba.
- [docs/demostracion.md](docs/demostracion.md) — demostración revisable.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| Meta no verifica el webhook | `WHATSAPP_VERIFY_TOKEN` distinto al ingresado en Meta, o la URL no es HTTPS pública. |
| Llegan mensajes pero el registro muestra `webhook.firma rechazado` | `WHATSAPP_APP_SECRET` incorrecto. |
| El agente no responde a nadie | Modo prueba sin `NUMEROS_PRUEBA` (las respuestas quedan "simuladas" en el panel), agente en pausa, o la conversación está tomada por Patricio. |
| Alerta `fallo_ia` | Clave de Anthropic inválida, sin saldo o servicio no disponible. El cliente recibe un aviso honesto. |
| Alerta `envio_fallido` | Token de WhatsApp vencido o sin permisos, o el cliente escribió hace más de 24 horas. |
