# 🏢 Constitución de empresas en línea

Sitio web sin servidor para ofrecer a clientes la **constitución de una SpA,
E.I.R.L. o Sociedad de Responsabilidad Limitada** a través del Registro de
Empresas y Sociedades ("Tu Empresa en un Día"). El cliente llena un
formulario guiado y envía la solicitud por WhatsApp o correo; el estudio
revisa, redacta el estatuto, ingresa el formulario y coordina las firmas.

> Replica el **funcionamiento** del servicio "Tu empresa en un día" que ofrecen
> sitios como divir.cl (formulario → revisión → firma → RUT), con **diseño y
> textos propios**. No se copió marca, texto ni imágenes de terceros. divir.cl
> no fue accesible desde el entorno de trabajo; su estructura se conoció por
> el índice del buscador.

## Cómo usarla

Abre `index.html` en el navegador. No necesita instalación ni servidor.

**Portada**: proceso en 5 pasos, tipos de empresa con su regla de nombre, un
orientador ("¿cuántas personas?, ¿alguna es empresa?") que muestra los tipos
posibles, requisitos, precios, preguntas frecuentes y fuentes oficiales.

**Asistente** (6 pasos, con barra de avance):

1. **Tipo de empresa**: SpA, E.I.R.L. o Ltda.
2. **Socios**: datos de cada socio, accionista o titular. Valida el RUT
   (módulo 11), RUT repetidos, correo y aporte. Calcula en vivo el capital y
   el porcentaje de cada uno. Permite personas jurídicas (con representante)
   en SpA y Ltda.; en E.I.R.L., solo persona natural. Controla el número de
   socios: E.I.R.L. = 1, Ltda. = 2 a 50, SpA = 1 o más.
3. **Empresa**: nombre (agrega «SpA», «E.I.R.L.» o «Limitada» y muestra cómo
   quedará; en E.I.R.L. exige el nombre y apellido del titular), objeto,
   región, comuna, dirección opcional y duración.
4. **Administración**: socios que administran y, opcionalmente, una persona
   externa; si son varios, si actúan por separado o juntos.
5. **Servicios adicionales**: inicio de actividades, facturación electrónica,
   apoyo con la Firma Electrónica Avanzada (editables en `config.js`).
6. **Revisar y enviar**: resumen, **plan de firma de cada socio** (con FEA, o
   compra de FEA en línea con ClaveÚnica, o notaría), presupuesto, datos de
   contacto y autorización de uso de datos. Envío por WhatsApp o correo, más
   descarga en `.txt` e impresión/PDF del resumen.

El avance se guarda solo en ese navegador (`localStorage`); los datos salen
únicamente cuando el cliente pulsa *Enviar*. Hay un botón para borrarlos.

## Configurar antes de publicar (`config.js`)

| Campo | Qué poner |
|---|---|
| `marca`, `prestador` | Nombre comercial y razón social/RUT de quien presta el servicio |
| `whatsapp` | Número internacional, solo dígitos (`569XXXXXXXX`). Activa el botón de WhatsApp |
| `correo` | Correo que recibe las solicitudes. Activa el botón de correo |
| `horario` | Horario de atención |
| `precios` | Precio por tipo (`SPA`, `EIRL`, `LTDA`), en pesos sin puntos |
| `incluye`, `extras` | Qué incluye el servicio y servicios adicionales con su precio |
| `plazoFirma` | Plazo de firma, una vez verificado (ver abajo) |

Mientras falte un dato, el sitio lo muestra como marcador visible
(`[FALTA: …]`) y una franja superior lista lo pendiente. Si falta un precio,
el presupuesto no muestra total.

## Fuentes y verificación

Los sitios oficiales (bcn.cl, registrodeempresasysociedades.cl,
chileatiende.gob.cl) **no fueron accesibles directamente** desde el entorno de
trabajo. Lo siguiente se verificó en el índice del buscador sobre páginas de
esos dominios oficiales; la vigencia no se confirmó abriendo LeyChile.
**Requiere verificación documental antes de publicar.**

| Afirmación usada en el sitio | Fuente |
|---|---|
| Al Registro se ingresa solo con ClaveÚnica | [RES – Preguntas frecuentes](https://www.registrodeempresasysociedades.cl/FAQ.aspx?seccion=9) |
| Constituir en el Registro no tiene costo; los socios sin FEA pagan su firma | [ChileAtiende – Tu Empresa en un Día](https://www.chileatiende.gob.cl/fichas/21409-tu-empresa-en-un-dia) |
| Firma con FEA (token o en línea, comprada en la plataforma con ClaveÚnica) o ante notario con el número de atención; el notario firma electrónicamente | ChileAtiende (ficha 21409) y RES – Preguntas frecuentes |
| Firmado por todos, el SII asigna el RUT; el inicio de actividades es un trámite aparte | ChileAtiende (ficha 21409); [BCN Ley Fácil](https://www.bcn.cl/portal/leyfacil/recurso/procedimiento-simple-para-crear-empresas) |
| SpA: el nombre termina en «SpA» | Código de Comercio, art. 425 N° 1 ([BCN](https://www.bcn.cl/leychile/navegar?idNorma=1974)) |
| E.I.R.L.: una persona natural; el nombre contiene al menos nombre y apellido del titular y termina en «E.I.R.L.» | Ley N° 19.857, art. 4 letra b ([BCN](https://www.bcn.cl/leychile/Navegar/imprimir?idNorma=207588)); [SII – pregunta frecuente](https://www.sii.cl/preguntas_frecuentes/rut_inicio_actividades/001_105_2348.htm). Las [preguntas frecuentes del RES](https://www.registrodeempresasysociedades.cl/AyudaEirl.aspx) piden el apellido **paterno**: el sitio lo avisa sin bloquear |
| Ltda.: máximo 50 socios; termina con la palabra «limitada» | Ley N° 3.918, arts. 2 y 4 ([BCN](https://www.bcn.cl/leychile/navegar?idNorma=24349)) |
| Ltda.: mínimo 2 socios | [RES – Preguntas frecuentes Ltda.](https://www.registrodeempresasysociedades.cl/AyudaLtda.aspx) |

**Pendiente de verificar**

- `[VERIFICAR]` Plazo para que todos los socios firmen desde la primera firma
  (una fuente secundaria indica 60 días; no se confirmó en fuente oficial).
- `[VERIFICAR]` Si el estudio puede crear el borrador en el Registro con su
  propia ClaveÚnica o debe hacerlo un constituyente. El sitio dice
  «llenamos el formulario», sin precisar con qué cuenta.
- `[VERIFICAR]` Texto de autorización de uso de datos personales: revisarlo
  conforme a la normativa de protección de datos vigente.
- No se incluyeron reglas sobre sociedad conyugal o menores de edad, porque
  no se encontró fuente oficial. El formulario solo pide el estado civil.

## Archivos

| Archivo | Rol |
|---|---|
| `index.html` | Portada y estructura del asistente |
| `styles.css` | Estilos (modo claro/oscuro, celular primero, impresión del resumen) |
| `config.js` | Datos del prestador, precios y servicios adicionales |
| `logica.js` | Reglas por tipo, RUT, razón social, validación, plan de firma, presupuesto y texto de la solicitud |
| `app.js` | Interfaz, navegación, guardado en el navegador y envío |
| `tests/logica.test.js` | Pruebas de `logica.js` |

## Pruebas

```
node tests/logica.test.js
```
