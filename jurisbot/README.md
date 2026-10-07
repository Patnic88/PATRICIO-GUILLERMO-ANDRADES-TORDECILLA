# ⚖️ JurisBot

Recolecta, clasifica y permite buscar:

| Fuente | Documentos | Cómo entra hoy |
|---|---|---|
| Corte Suprema (`cs`) | sentencias | importación manual |
| Contraloría (`cgr`) | dictámenes | importación manual |
| SII (`sii`) | circulares, oficios, resoluciones | recolector automático **sin verificar** |
| Dirección del Trabajo (`dt`) | dictámenes, ordinarios, circulares | importación manual |
| Tribunal Constitucional (`tc`) | sentencias | importación manual |

Además lleva la parte comercial: planes de suscripción, claves API, límites de
uso, alertas por materia y boletín para enviar por correo.

> **Estado de las fuentes.** Este código se escribió en un entorno sin acceso a
> los sitios oficiales (la red bloqueaba pjud.cl, contraloria.cl, sii.cl,
> dt.gob.cl, tribunalconstitucional.cl y bcn.cl). Por eso ningún conector está
> verificado: `jurisbot/fuentes/fuentes.json` trae la URL candidata del SII
> escrita de memoria y las demás fuentes en modo `manual`. El recolector se
> niega a correr una fuente sin verificar salvo con `--forzar`.

## Instalación

Requiere Python 3.10 o superior. El núcleo no usa paquetes externos.

```bash
cd jurisbot
pip install -r requirements.txt   # pypdf (leer PDF) y pydantic (clasificación con IA); anthropic solo si usa Claude
python -m unittest discover -s tests -v
```

## Uso

```bash
# Ver fuentes y su estado
python -m jurisbot fuentes

# Importar documentos descargados del sitio oficial (PDF, HTML o TXT)
python -m jurisbot importar descargas/ --manifiesto descargas/manifiesto.csv
python -m jurisbot importar sentencias/ --fuente cs --tipo sentencia

# Recolectar automáticamente (solo fuentes con estrategia indice_enlaces)
python -m jurisbot recolectar sii --anio 2026 --contacto su-correo@dominio.cl

# Clasificar y resumir con IA (opcional; por defecto un modelo local gratuito, ver abajo)
python -m jurisbot clasificar-ia --limite 20

# Buscar
python -m jurisbot buscar "honorarios confianza legítima" --materia empleo_publico --fuente cgr

# Marcar un documento como cotejado con la fuente oficial
python -m jurisbot verificar "cs:sentencia:12.345-2025"

# Suscriptores
python -m jurisbot usuario crear cliente@dominio.cl --plan gratis
python -m jurisbot usuario activar cliente@dominio.cl --plan profesional --hasta 2026-11-30
python -m jurisbot alerta <clave_api> "Municipal CGR" --fuente cgr --materia municipal
python -m jurisbot boletin <clave_api> --prueba
python -m jurisbot boletin <clave_api> --enviar      # por correo SMTP, ver abajo

# Interfaz web y API en http://127.0.0.1:8000
python -m jurisbot servir
```

El manifiesto CSV tiene estas columnas (`identificador` y `fecha` pueden quedar
vacíos; para sentencias el rol se toma del texto):

```csv
archivo,fuente,tipo,identificador,fecha,url,titulo
cs_12345_2025.pdf,cs,sentencia,12.345-2025,2025-08-14,https://...,Unificación de jurisprudencia honorarios
```

## Cómo clasifica

1. **Reglas** (siempre, gratis): `jurisbot/clasificar.py` contiene la taxonomía
   (laboral, municipal, empleo público, contratación pública, tributario,
   constitucional, seguridad social, responsabilidad del Estado, probidad y
   transparencia, urbanismo y ambiente, penal, familia y consumidor). Una materia
   se asigna cuando aparecen al menos *N* términos distintos. Las normas citadas
   se extraen literalmente del texto (leyes, D.L., D.F.L., artículos de códigos
   y de la Constitución).
2. **IA** (opcional): `clasificar-ia` envía el texto a un modelo de lenguaje
   (local o en la nube, ver la sección siguiente), que devuelve materias,
   normas, resumen y decisión. Las materias fuera de la taxonomía y
   las normas que no aparecen en el texto se **descartan**. El resumen queda
   rotulado como generado por IA y el documento sigue "sin verificar".

## Servicios externos: opciones gratuitas

El bot funciona completo **sin ninguna clave**: importación, clasificación por
reglas, búsqueda, suscriptores, alertas y la interfaz web no llaman a servicios
externos. Solo dos funciones opcionales usan servicios de terceros, y ambas
aceptan opciones gratuitas.

### Clasificación con IA (`clasificar-ia`)

| `JURISBOT_IA` | Costo | Clave | Privacidad del texto |
|---|---|---|---|
| `ollama` (por defecto) | gratis | no | no sale de su computador |
| `compatible_openai` | depende del plan del servicio; varios tienen nivel gratuito | sí | se envía al servicio |
| `anthropic` | pago por uso | sí (`ANTHROPIC_API_KEY`) | se envía a Anthropic |

**Ollama (gratis, local).** Instale Ollama desde su sitio oficial, descargue un
modelo y ejecute:

```bash
ollama pull <modelo>                  # elija un modelo que maneje bien el español
export JURISBOT_IA_MODELO=<modelo>
python -m jurisbot clasificar-ia --limite 5
```

Necesita un computador con memoria suficiente para el modelo elegido.
[VERIFICAR] en la documentación de Ollama los requisitos del modelo y que su
versión acepte salida estructurada (`format` con esquema JSON). Los modelos
pequeños clasifican peor que los grandes: revise una muestra a mano antes de
confiar en ellos.

**Servicio en la nube compatible con OpenAI (plan gratuito).** Sirve cualquier
servicio que ofrezca el formato `/v1/chat/completions`:

```bash
export JURISBOT_IA=compatible_openai
export JURISBOT_IA_URL=<url base, terminada en /v1>
export JURISBOT_IA_MODELO=<modelo>
export JURISBOT_IA_CLAVE=<su clave>
```

[VERIFICAR] antes de usar uno: límites del plan gratuito, y sobre todo si sus
condiciones permiten **usar los textos enviados para entrenar modelos**. Las
sentencias contienen datos personales; con un plan gratuito de ese tipo,
prefiera Ollama.

Con cualquier proveedor se aplican las mismas salvaguardas: las materias fuera
de la taxonomía y las normas que no aparecen en el texto se descartan, y un
documento más largo que `JURISBOT_IA_MAX_CARACTERES` (100.000 por defecto) se
rechaza en vez de recortarse.

### Envío de boletines (`boletin --enviar`)

Por SMTP, con cualquier cuenta de correo que lo permita (por ejemplo, una cuenta
gratuita de Gmail con contraseña de aplicación [VERIFICAR límites diarios de envío]):

```bash
export JURISBOT_SMTP_HOST=smtp.gmail.com
export JURISBOT_SMTP_PUERTO=587
export JURISBOT_SMTP_USUARIO=su-cuenta@gmail.com
export JURISBOT_SMTP_CLAVE=<contraseña de aplicación>
```

Las alertas se marcan como enviadas solo después de un envío exitoso.

Las variables también se pueden definir en la configuración del entorno donde
corra el bot. Nunca las escriba dentro del código ni las suba al repositorio.

## API

Todas las rutas `/api/*`, salvo `/api/catalogo`, exigen el encabezado `X-API-Key`.

| Ruta | Descripción |
|---|---|
| `GET /api/catalogo` | fuentes, materias y planes |
| `GET /api/yo` | plan y límites del usuario |
| `GET /api/buscar?q=&fuente=&materia=&desde=&hasta=&limite=` | búsqueda |
| `GET /api/documento?clave=` | documento completo (según plan) |
| `GET /api/estadisticas` | conteos por fuente, materia y verificación |

## Habilitar un recolector automático

1. Abra el sitio oficial y ubique la página que lista los documentos.
2. Copie su URL en `url_indice` (use `{anio}` si cambia por año).
3. Escriba en `patron_enlace` una expresión regular que calce con la URL de
   cada documento y capture el número en el grupo `(?P<id>...)`.
4. Pruebe con `recolectar <fuente> --forzar --limite 3` y revise el resultado.
5. Si es correcto, cambie `"verificado": true`.

Para fuentes con buscadores dinámicos (PJUD, CGR) hace falta un conector a medida
después de revisar las solicitudes que hace el navegador y las condiciones de uso
del sitio. Ver `docs/PLAN_NEGOCIO.md`.

## Archivos

| Archivo | Rol |
|---|---|
| `jurisbot/modelo.py` | estructura `Documento`, fuentes y tipos |
| `jurisbot/db.py` | SQLite + búsqueda de texto completo (FTS5) |
| `jurisbot/clasificar.py` | taxonomía, clasificador por reglas, extracción de normas y roles |
| `jurisbot/clasificar_ia.py` | esquema, instrucciones y validación anti-invención; conexión con Claude |
| `jurisbot/proveedores_ia.py` | proveedores intercambiables: Ollama (local), compatible con OpenAI, Anthropic |
| `jurisbot/correo.py` | envío de boletines por SMTP |
| `jurisbot/fuentes/` | recolector genérico y `fuentes.json` |
| `jurisbot/importar.py` | importación de PDF/HTML/TXT |
| `jurisbot/suscripciones.py` | planes, usuarios, límites, alertas y boletín |
| `jurisbot/servidor.py` + `web/index.html` | API e interfaz de búsqueda |
| `docs/PLAN_NEGOCIO.md` | modelo de suscripción, costos, riesgos y hoja de ruta |
