# Agentes contra las ofertas de trabajo falsas

Tres piezas que nacieron de un anuncio de TikTok que usa el nombre de Mercado
Libre para ofrecer "trabajo desde casa" con "ingreso diario de
$60.000–80.000". El anuncio reúne las señales típicas de una estafa de tareas.

| Carpeta | Qué es | Para quién |
|---|---|---|
| [`detector-ofertas/`](detector-ofertas/README.md) | Agente que analiza avisos de trabajo (texto o captura) y entrega un semáforo de riesgo con evidencia | Personas que buscan empleo; OMIL, bolsas de trabajo y municipios que quieran ofrecerlo |
| [`asistente-ventas/`](asistente-ventas/README.md) | Agente que redacta respuestas a preguntas de compradores para vendedores reales, con aprobación del vendedor | Pymes que venden en Mercado Libre Chile |
| [`carrusel-ofertas-falsas/`](carrusel-ofertas-falsas/README.md) | Carrusel de 10 slides para @choapajusta | Difusión y captación de clientes |

## Ideas para venderlos (opinión, no validado con clientes)

- **Detector.** Como servicio con clave por cliente (`CLAVES_CLIENTES`) y
  registro de uso por análisis, para cobrar por consulta o con un plan
  mensual. El modo básico (solo reglas, sin servidor) sirve como versión
  gratuita y como muestra.
- **Asistente para vendedores.** Una instalación por cliente con cobro
  mensual. Antes de cobrar, revisa los términos para desarrolladores de
  Mercado Libre (ver "Pendiente de verificación" en su README).
- **Carrusel.** Lleva tráfico al detector y a la consulta legal.

## Requisitos comunes

- Node 20 o superior, y una clave de la API de Claude (`ANTHROPIC_API_KEY`).
- Los dos agentes usan `claude-opus-5-5` con esfuerzo `medium`. Se pueden
  cambiar con `MODELO_CLAUDE` y `ESFUERZO_CLAUDE`.
- `npm test` en cada carpeta corre las pruebas sin llamar a las APIs reales.
