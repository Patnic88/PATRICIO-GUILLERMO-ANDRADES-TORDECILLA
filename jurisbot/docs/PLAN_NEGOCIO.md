# JurisBot: plan de negocio por suscripción

Convención de este documento (según el protocolo de veracidad):
**[HECHO]** con fuente · **[INFERENCIA]** razonable, no verificada ·
**[OPINIÓN]** propuesta de diseño o comercial · **[VERIFICAR: …]** dato pendiente
que hay que confirmar antes de usarlo. Nada de este documento se comprobó en los
sitios oficiales, porque el entorno de trabajo no tenía acceso a ellos.

---

## 1. Qué se vende

Las instituciones (PJUD, CGR, SII, DT, TC) publican sus documentos en sus propios
sitios, cada uno con su buscador [INFERENCIA: es la situación conocida; confirmar
que el acceso sigue siendo libre y gratuito en cada caso]. Por eso el texto en bruto
no es el producto. Lo que se cobra es:

1. **Un solo buscador** para las cinco fuentes, con los mismos filtros.
2. **Clasificación por materia** con una taxonomía práctica (municipal, empleo
   público, laboral, tributario, etc.) y las normas citadas en cada documento.
3. **Alertas**: "avísame cada dictamen nuevo de la CGR sobre honorarios
   municipales" o "cada circular del SII sobre IVA".
4. **Resúmenes** de 3 a 5 líneas, rotulados como generados por IA, con enlace al
   documento oficial.
5. **API** para estudios jurídicos, contables y municipios que quieran integrarlo.

[OPINIÓN] El diferenciador más defendible es el cruce entre fuentes por materia,
por ejemplo un criterio de la CGR con el de la Corte Suprema y el del TC sobre lo
mismo. Ese cruce vale más que la cantidad de documentos.

## 2. A quién

[INFERENCIA] Segmentos con necesidad recurrente:

| Segmento | Dolor | Fuentes clave |
|---|---|---|
| Asesorías jurídicas y unidades de control municipales | criterio CGR y CS actualizado | CGR, CS, TC |
| Abogados laboralistas | dictámenes DT + unificación de jurisprudencia CS | DT, CS |
| Contadores y tributaristas | circulares y oficios SII | SII |
| Estudios pequeños | no pagan bases comerciales caras | todas |
| Encargados de RR.HH. | cambios de criterio DT | DT |

**Validación antes de invertir más** [OPINIÓN]: entrevistar a 15 o 20 personas de
estos segmentos y preguntar qué usan hoy, cuánto pagan y qué alerta pagarían.

## 3. Competencia

- Las bases oficiales gratuitas de cada institución [INFERENCIA].
- Proveedores comerciales de bases jurídicas que operan en Chile, como vLex,
  Microjuris y Thomson Reuters [VERIFICAR: cobertura actual de CGR/DT/SII/TC,
  precios y si ya ofrecen alertas o resúmenes con IA].

[OPINIÓN] No conviene competir en volumen histórico. Conviene competir en precio,
foco municipal y laboral, y alertas útiles.

## 4. Planes

Implementados en `jurisbot/suscripciones.py` (los límites se ajustan ahí):

| | Gratis | Profesional | Institucional |
|---|---|---|---|
| Documentos visibles | con 30 días de retraso | al día | al día |
| Consultas por día | 20 | 500 | 5.000 |
| Texto completo | no (ficha + enlace oficial) | sí | sí |
| Resumen IA | no | sí | sí |
| Alertas | 0 | 10 | 100 |
| API | no | no | sí |

**Precios** [OPINIÓN, hipótesis sin estudio de mercado]: Profesional entre
$15.000 y $30.000 mensuales por usuario; Institucional desde $150.000 mensuales
por organización, con descuento anual. Hay que validarlos en las entrevistas y
compararlos con lo que cobra la competencia [VERIFICAR].

## 5. Costos variables

**Clasificación con IA.** Puede costar cero: con `JURISBOT_IA=ollama` el modelo
corre en el propio servidor o computador y no se paga por documento. El costo
pasa a ser el equipo: se necesita memoria suficiente para el modelo y la
calidad suele ser menor que la de un modelo grande en la nube [INFERENCIA:
medir con una muestra revisada a mano]. Si se usa la API de Anthropic, aplican
estas tarifas [HECHO: tarifas de la API de Anthropic para el modelo
`claude-opus-5-5`, USD 4 por millón de tokens de entrada y USD 20 por millón de
salida, según la tabla de la documentación oficial consultada el 2026-10-06;
confirme en la página de precios antes de presupuestar]:

- [INFERENCIA, estimación] Un documento de unos 10.000 tokens con unos 600
  tokens de respuesta cuesta cerca de USD 0,05. Con la API de lotes (Batches), que
  cuesta la mitad, baja a unos USD 0,025. El razonamiento interno del modelo
  también se cobra como salida, así que conviene medir el costo real con una
  muestra de 50 documentos.
- [VERIFICAR] Volumen anual de documentos por fuente (sentencias de la CS,
  dictámenes CGR, etc.) para proyectar el costo total.

**Infraestructura** [INFERENCIA]: un servidor virtual pequeño basta para el piloto
(SQLite soporta bien decenas de miles de documentos con pocos usuarios). Para
cientos de usuarios simultáneos, conviene migrar a PostgreSQL.

**Correo**: `python -m jurisbot boletin --enviar` usa SMTP, que funciona con una
cuenta de correo gratuita para el piloto [VERIFICAR límites de envío diarios de
la cuenta elegida]. Con muchos suscriptores conviene un servicio transaccional
(por ejemplo Resend) por entregabilidad.

## 6. Cobro

El código deja un único punto de integración: `suscripciones.activar_plan(email,
plan, vigente_hasta)`, que se llama cuando el proveedor de pagos confirma el cobro.

Proveedores con operación en Chile que vale la pena comparar: Flow, Khipu,
Mercado Pago y Transbank (Webpay) [VERIFICAR: cuáles ofrecen cobro recurrente o
suscripciones, comisiones vigentes y requisitos de afiliación].

## 7. Riesgos legales y cómo mitigarlos

> Requiere verificación documental antes de lanzar. Ninguno de estos puntos se
> confirmó en LeyChile ni en las condiciones de uso de los sitios.

1. **Condiciones de uso y carga de los sitios oficiales.** Hay que revisar las
   condiciones de uso de cada portal antes de automatizar [VERIFICAR]. El
   recolector respeta robots.txt, espera 3 segundos entre solicitudes y se
   identifica con un correo de contacto. [OPINIÓN] Para PJUD y CGR conviene
   preguntar formalmente si existe acceso por convenio o datos abiertos.
2. **Datos personales.** Las sentencias contienen nombres y datos de las partes.
   - Hoy rige la Ley N° 19.628 [VERIFICAR: en LeyChile, qué permite su régimen
     de fuentes accesibles al público para reutilizar estos datos con fines
     comerciales].
   - Ley N° 21.719, publicada el 13 de diciembre de 2024. Según fuentes
     secundarias (Academia Judicial y Diario Constitucional), su vigencia estaba
     fijada para el 1 de diciembre de 2026 y hay en el Senado un proyecto del
     Ejecutivo para postergarla al 1 de diciembre de 2027 [VERIFICAR: texto
     vigente en LeyChile y estado de tramitación del proyecto].
   - [OPINIÓN] Mitigación: no indexar nombres de personas naturales en el
     buscador; mostrar el texto tal como lo publica la fuente oficial y enlazar a
     ella; excluir materias sensibles (familia, menores, salud); tener una
     política de privacidad y un canal de eliminación. La anonimización automática
     **no está implementada**: es la siguiente funcionalidad crítica.
3. **Propiedad intelectual de los textos oficiales** [VERIFICAR: Ley N° 17.336
   sobre el régimen de sentencias, dictámenes y actos administrativos]. Los
   resúmenes y la clasificación son obra propia.
4. **Envío de textos a servicios de IA en la nube.** Algunos planes gratuitos
   de proveedores de IA pueden usar lo que se les envía para mejorar sus
   modelos [VERIFICAR en las condiciones del servicio elegido]. Con sentencias
   que contienen datos personales, el modelo local (Ollama) evita ese riesgo.
5. **Responsabilidad por resúmenes con IA.** Cada resumen se rotula como
   generado por IA y "sin verificar", y se enlaza al texto oficial. Los términos
   del servicio deben decir que no constituye asesoría jurídica.
6. **Tributario del propio negocio.** IVA y documento tributario aplicables a la
   venta de suscripciones digitales [VERIFICAR con su contador y con la normativa
   del SII vigente].
7. **Su situación como funcionario municipal.** Si usted sigue en la DAJ de la
   Municipalidad de Los Vilos, revise las incompatibilidades y prohibiciones
   del régimen de probidad antes de vender a municipios, en especial a la propia
   municipalidad [VERIFICAR: Ley N° 18.575, título de probidad, y Ley N° 18.883].
   [OPINIÓN] Conviene constituir una sociedad y documentar que el desarrollo se
   hace fuera de la jornada y sin recursos municipales.

## 8. Hoja de ruta

| Fase | Contenido | Criterio de salida |
|---|---|---|
| 0. Validación (2–4 semanas) | entrevistas; revisar condiciones de uso; verificar puntos legales | 5 personas dispuestas a pagar |
| 1. Piloto | importar 500–1.000 documentos de CGR y CS sobre materia municipal y laboral; afinar la taxonomía; clasificación IA; 10 usuarios gratis | precisión de clasificación revisada a mano ≥ 90 % en una muestra |
| 2. Automatización | conectores verificados por fuente; cron diario; boletín por correo; anonimización | 30 días sin intervención manual |
| 3. Cobro | integración de pagos, términos y política de privacidad | primeros clientes pagados |
| 4. Crecimiento | cruce entre fuentes, API, planes institucionales | — |

## 9. Lo que el código ya hace y lo que falta

Hecho: modelo de datos, SQLite con búsqueda de texto completo sin tildes,
importación de PDF/HTML/TXT, recolector genérico con robots.txt y pausas,
clasificador por reglas, extracción de normas, clasificación con IA
intercambiable (Ollama local gratuito, servicios compatibles con OpenAI o
Claude) que descarta lo que no está en el texto, planes, límites, alertas,
boletín con envío por SMTP, API e interfaz web. 36 pruebas automáticas.

Falta: conectores verificados para CS, CGR, DT y TC; anonimización; integración de pagos; registro de usuarios desde la web; HTTPS y
despliegue; cron.
