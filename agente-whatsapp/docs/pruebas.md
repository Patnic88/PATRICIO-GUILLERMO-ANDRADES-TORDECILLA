# Pruebas

```bash
npm test        # 80 pruebas automáticas, sin red ni claves (≈ 2 segundos)
npm run demo    # demostración revisable → docs/demostracion.md
```

Las pruebas usan una base de datos en memoria, un WhatsApp falso que registra los envíos y, según el caso, el proveedor simulado o un "modelo guionado" que responde exactamente lo que la prueba indica. El modelo guionado sirve para comprobar qué pasa cuando la IA se equivoca: por ejemplo, cuando afirma una cita que no existe o intenta leer un expediente sin verificación. Así se comprueba que **los controles están en el código** y no dependen de que el modelo obedezca.

## Cobertura por tema

### Consultas nuevas — `tests/consultas.test.js`
- Primer contacto: se presenta como asistente virtual, no como Patricio, y hace una sola pregunta.
- Recepción gradual: registra nombre, motivo, materia y comuna; clasifica la materia; no repite preguntas; todo queda con origen *declarado*.
- Causa judicial: registra tribunal y rol/RIT y pide resolución y fecha de notificación.
- Base de conocimiento: un dato pendiente no se informa; uno aprobado en el panel sí.

### Memoria — `tests/memoria.test.js`
- Lo registrado aparece en el contexto del mensaje siguiente.
- Dos números distintos nunca comparten antecedentes.
- Un número asociado a una ficha, sin verificación, no revela la ficha (ni el nombre).
- Sin verificación, la memoria se limita a la ventana de sesión.
- Con verificación, el contexto incluye los asuntos del cliente.

### Citas — `tests/citas.test.js`
- Sin agenda configurada no se ofrecen horas ni se confirma nada.
- Con agenda: ofrece bloques reales, reserva y confirma solo después de registrar.
- Un contacto con cita vigente no obtiene una segunda.
- Dos clientes no pueden tomar el mismo bloque (índice único en la base de datos).
- Un horario inventado por el modelo se rechaza.
- Si el modelo afirma una cita sin reserva, la respuesta se bloquea.

### Fallos — `tests/fallos.test.js`
- Falla de herramienta: el agente no afirma la gestión y se alerta.
- Falla del proveedor de IA: aviso honesto una sola vez y alerta.
- Rechazo del modelo (`refusal`): se trata como falla, sin texto parcial.
- Falla de envío por WhatsApp: mensaje `fallido`, alerta, sin reenvío duplicado.
- Reinicio durante un envío: el mensaje queda `incierto` y no se reenvía.
- Entrada inválida del modelo a una herramienta: se rechaza sin ejecutarla.
- Tope de respuestas por hora.
- Una respuesta que no llegó al cliente no se usa como historial.

### Confidencialidad — `tests/confidencialidad.test.js`
- Tener el número asociado no basta para conocer el asunto.
- `consultar_expediente` se niega sin verificación aunque el modelo lo pida.
- Verificación correcta: entrega el estado y el código se borra del historial.
- Tres intentos fallidos bloquean la verificación (incluso con el código correcto después) y alertan.
- Un cliente verificado no puede ver el asunto de otro.
- Instrucciones maliciosas no cambian las reglas.
- El texto del cliente no puede falsificar etiquetas del sistema.

### Pagos pendientes — `tests/pagos.test.js`
- Un comprobante queda *pendiente de verificación* y se informa así.
- El mismo comprobante no se registra dos veces.
- Si el modelo afirma que el pago está confirmado, la respuesta se bloquea.
- No se puede usar un documento de otra conversación como comprobante.
- Solo después de que la oficina lo verifica, el cliente lo ve como verificado.

### Asuntos urgentes — `tests/urgencias.test.js`
- Detección de señales, fechas literales y nivel de urgencia.
- Audiencia inminente: alerta alta automática, solicitud urgente, sin cálculo de plazos.
- La alerta se crea en código aunque el modelo no use herramientas.
- Si el modelo calcula un plazo, la respuesta se bloquea.
- La misma señal en el mismo día no duplica alertas.

### Derivación — `tests/derivacion.test.js`
- El cliente pide hablar con Patricio: derivación, pausa y alerta; al devolver la conversación, el agente responde de nuevo.
- Respuesta manual desde el panel: pausa al agente y respeta la ventana de 24 horas.
- Eco de la app WhatsApp Business (coexistencia): pausa al agente en ese chat.
- Pausa global.

### Webhook — `tests/webhook.test.js`
- Verificación de suscripción, firma válida/alterada/ausente/malformada, eventos de otro número.
- Reintentos de Meta: un solo mensaje y una sola respuesta.
- Mensajes seguidos: un turno y una respuesta.
- Estados de entrega y alerta por fallo de entrega.
- Adjuntos: descarga y nombre de archivo seguro.

### Panel — `tests/panel.test.js`
- Acceso con sesión, clave incorrecta, cabeceras de seguridad, cookie, CSRF, simulador, todas las páginas, código de verificación mostrado una sola vez, descarga de documentos protegida.

### Proveedor de IA — `tests/anthropic.test.js`
- Forma exacta de la solicitud enviada a la API de Anthropic (caché, contexto al final, esfuerzo, respaldo, historial solo agregado), contra un servidor local.
- Un error de la API no expone la clave.

### Regresiones de la revisión de seguridad — `tests/regresiones.test.js`
- Una URL malformada responde 400 y el servidor sigue funcionando.
- El simulador nunca envía por WhatsApp, aun en producción; un mensaje real convierte en real una conversación del simulador (y deja de poder borrarse desde el simulador).
- Al revocar o vencer la verificación, lo conversado con identidad verificada deja de mostrarse al agente.
- Controles de salida: diez afirmaciones falsas que antes pasaban ahora se bloquean; diez frases legítimas no se bloquean; las excepciones dependen del resultado concreto de la herramienta.
- `agendar_cita` solo acepta el valor exacto ofrecido; no se aceptan citas que se solapan.
- Intentos fallidos contra un mismo RUT desde varios números bloquean la ficha.
- El código intentado no queda en mensajes ni en alertas.
- El límite de ingreso al panel detrás de un proxy es por IP real (un tercero no puede bloquear a Patricio).
- Webhook sin `phone_number_id` se descarta; los estados de entrega no retroceden.
- Un nombre de archivo malicioso queda como dato escapado en el contexto.

### Unidades — `tests/unidades.test.js`
- RUT, controles de salida, configuración de producción, validación de entradas, y envío en modo prueba (respuestas automáticas solo a `NUMEROS_PRUEBA`; mensajes manuales de Patricio siempre), con la forma exacta de la solicitud a la Cloud API.

## Lo que estas pruebas no cubren

- **La calidad de las respuestas de la IA real.** Requiere `ANTHROPIC_API_KEY`: ejecute `IA_PROVEEDOR=anthropic npm run demo` y revise `docs/demostracion-anthropic.md`.
- **La conexión real con Meta.** Requiere credenciales y una URL pública con HTTPS. Pruébela en modo prueba con su número en `NUMEROS_PRUEBA`.
- **La imagen Docker.** No se construyó en el entorno de desarrollo.
