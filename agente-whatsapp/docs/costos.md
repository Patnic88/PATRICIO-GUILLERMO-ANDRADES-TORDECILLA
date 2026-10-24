# Dependencias externas y costos estimados

Fecha de la estimación: 22-10-2026. Montos en dólares estadounidenses (USD), sin impuestos.

**Advertencia de verificación.** Desde el entorno donde se programó este sistema no fue posible abrir los sitios de Meta, Hetzner ni otros proveedores (la red los bloquea). Las cifras de WhatsApp y de servidores provienen de resultados de búsqueda y, en su mayoría, de **fuentes secundarias**. Cada dato indica su origen. Antes de contratar, confirme los valores en las fuentes oficiales enlazadas.

## Dependencias externas

| Servicio | Para qué | ¿Obligatorio? | Costo |
|---|---|---|---|
| WhatsApp Business Platform (Cloud API, Meta) | Recibir y enviar mensajes | Sí | Por mensaje (ver abajo) |
| API de Claude (Anthropic) | Inteligencia del agente | Sí, para IA real | Por tokens (ver abajo) |
| Servidor (VPS) con Linux | Funcionamiento permanente | Sí | Mensual (ver abajo) |
| Dominio o subdominio con DNS | Dirección HTTPS para el webhook | Sí | Si ya tiene un dominio, un subdominio no tiene costo adicional. Si no: [VERIFICAR precio en NIC Chile] |
| Certificado HTTPS | Requisito del webhook | Sí | Caddy lo obtiene automáticamente (Let's Encrypt), sin costo |
| Número de teléfono para la cuenta de WhatsApp Business | Identidad del canal | Sí | [VERIFICAR] si requiere una línea nueva |
| Plantilla aprobada por Meta para avisos a Patricio | Alertas por WhatsApp | No (las alertas se ven en el panel) | Mensaje de utilidad (ver abajo) |
| Node.js, SQLite, SDK de Anthropic | Software | Sí | Sin costo (código abierto) |

## Supuestos de volumen

Estos supuestos son míos; **ajústelos a la realidad de la oficina** y recalcule con las fórmulas.

| Supuesto | Valor |
|---|---|
| Conversaciones atendidas por el agente al mes | 150 |
| Respuestas del agente por conversación | 8 → **1.200 respuestas/mes** |
| Llamadas al modelo por respuesta (por uso de herramientas) | 1,6 → 1.920 llamadas/mes |
| Tokens fijos por llamada (instrucciones + definición de herramientas: 14.279 caracteres medidos) | ≈ 4.000 (inferencia: 3,5–4 caracteres por token en español; **no medido** con el contador oficial) |
| Tokens variables de entrada por llamada (historial, contexto, resultados) | ≈ 2.000 (inferencia) |
| Tokens de salida por llamada, incluido el razonamiento con esfuerzo `medium` | ≈ 500 (inferencia; es la cifra más incierta) |

## 1. IA (Anthropic)

Precios por millón de tokens según la tabla de modelos de la documentación oficial de Anthropic incluida en la herramienta de desarrollo usada (actualizada al 06-10-2026). Verificar en <https://platform.claude.com/docs/en/about-claude/pricing>.

| Modelo | Entrada | Salida | Lectura de caché | Escritura de caché (5 min) |
|---|---:|---:|---:|---:|
| Claude Opus 5.5 (`claude-opus-5-5`, por defecto) | 4,00 | 20,00 | 0,20 | 5,00 (1,25 × entrada) |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | 2,00 | 10,00 | 0,20 | 2,50 (1,25 × entrada) |
| Claude Haiku 5.5 (`claude-haiku-5-5`) | 0,10 | 0,50 | — | — |

La parte fija (instrucciones y herramientas) se guarda en caché. Con poco tráfico la caché (5 minutos) suele vencer entre una conversación y otra, por eso se calculan dos escenarios: todas las llamadas leen la caché (mínimo) o la primera llamada de cada respuesta la vuelve a escribir (máximo).

Fórmula por llamada: `tokens_fijos × precio_caché + tokens_variables × precio_entrada + tokens_salida × precio_salida`.

| Modelo | Costo por llamada (caché leída / escrita) | Estimación mensual |
|---|---|---:|
| Claude Opus 5.5 | 0,019 / 0,038 | **36 – 59** |
| Claude Sonnet 5.5 | 0,010 / 0,019 | **19 – 30** |

Sensibilidad: si cada llamada produce 1.500 tokens de salida en lugar de 500, Opus 5.5 sube unos 38 al mes y Sonnet 5.5 unos 19. Haiku 5.5 sería mucho más barato, pero no lo evalué para esta tarea; si quiere considerarlo, pruébelo con `npm run demo` antes de decidir. No existe fallback del servidor para Haiku 5.5.

Para medir el consumo real, el registro de operaciones guarda el uso de tokens de cada turno (`accion = turno`, campo `uso`).

## 2. WhatsApp (Meta)

| Dato | Fuente | Tipo |
|---|---|---|
| Desde el 1-07-2025 el cobro es por mensaje, según categoría, país y tramo de volumen; existen tablas de tarifas en varias monedas, incluido el peso chileno | [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) (leído solo en el extracto del buscador) | Oficial, sin abrir |
| Desde el 1-10-2026 las respuestas libres dentro de la ventana de 24 horas (mensajes de servicio) se cobran por mensaje entregado, a la tarifa de utilidad del país del cliente, con 1.000 mensajes de servicio gratis al mes por número | [YCloud](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026), [Mitto](https://mitto.ch/whatsapp-business-pricing-is-changing-what-businesses-need-to-know-before-october-2026/), [EngageLab](https://www.engagelab.com/blog/whatsapp-pricing-2026-service-message-cost) | Secundaria. Una de ellas indicó que páginas de Meta aún describían esos mensajes como gratuitos |
| Chile: utilidad y autenticación USD 0,0200 por mensaje; marketing USD 0,0889 (tabla vigente desde el 1-07-2026) | [WhatSetter](https://www.whatsetter.com/tools/whatsapp-api-pricing-calculator), [FormBeep](https://formbeep.com/whatsapp-api-pricing/) | Secundaria |

| Escenario | Cálculo | USD/mes |
|---|---|---:|
| Mensajes de servicio cobrados, con 1.000 gratis | (1.200 − 1.000) × 0,02 | **4** |
| Mensajes de servicio cobrados, sin tramo gratis | 1.200 × 0,02 | **24** |
| Mensajes de servicio gratuitos (régimen anterior) | — | **0** |
| Avisos a Patricio con plantilla de utilidad (opcional, ~60/mes) | 60 × 0,02 | ~1 |

El agente envía **un solo mensaje por respuesta** (los mensajes seguidos del cliente se agrupan), lo que reduce este costo. No se envían campañas de marketing. [VERIFICAR la tarifa en pesos y la vigencia del cobro en la tabla oficial de Meta.]

## 3. Servidor

| Opción | Precio | Fuente | Tipo |
|---|---|---|---|
| DigitalOcean, Basic 1 GB / 2 GB de RAM | 6 / 12 USD al mes | [InfraTally](https://infratally.com/articles/digitalocean-droplet-pricing-guide-2026/), [WebsitePlanet](https://www.websiteplanet.com/blog/digitalocean-pricing-plans) (precios revisados en agosto de 2026) | Secundaria |
| Hetzner CX23 (2 vCPU, 4 GB) | ≈ 5,49–5,99 EUR al mes + 0,50 EUR por IPv4; un sitio informó en agosto de 2026 que el plan figuraba como "no disponible" | [FindStack](https://findstack.com/resources/hetzner-price-increase-2026), [Northflank](https://northflank.com/blog/hetzner-cloud-server-price-increases) | Secundaria |

El servicio necesita poco: 1 GB de RAM es suficiente para el volumen supuesto (inferencia: un proceso Node.js con SQLite). Considere además el costo del respaldo externo.

## Resumen mensual estimado

| Componente | Con Opus 5.5 | Con Sonnet 5.5 |
|---|---:|---:|
| IA | 36 – 59 | 19 – 30 |
| WhatsApp | 0 – 24 | 0 – 24 |
| Servidor | 6 – 12 | 6 – 12 |
| **Total** | **≈ 42 – 95** | **≈ 25 – 66** |

No hay costos de licencia del software. El modelo se cambia con `IA_MODELO`; la decisión entre calidad y costo le corresponde a usted, idealmente después de comparar ambas demostraciones.
