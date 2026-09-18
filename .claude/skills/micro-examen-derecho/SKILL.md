---
name: micro-examen-derecho
description: >
  Micro examen diario de derecho chileno de 3 a 5 minutos: 4 a 8 preguntas de respuesta
  corta sobre normativa, jurisprudencia y dictámenes que el usuario YA verificó, con
  corrección inmediata, fuente al lado y repetición espaciada para no perder vigencia.
  Disparar con: 'micro examen', 'micro examen de derecho', 'examen relámpago', 'tómame
  examen', 'pregúntame', 'ponme a prueba', 'quiz jurídico', 'repaso rápido', 'repaso de
  5 minutos', 'examen del día', 'hazme preguntas de laboral/municipal/tributario',
  'mantenerme vigente', 'no quiero oxidarme', 'practica de citas', 'examen de mis
  errores'. También al pedir agregar algo al banco de preguntas ('agrega esto al micro
  examen', 'guarda esta pregunta') o al pedir el estado del repaso ('cómo voy en el
  repaso', 'qué tengo que repasar hoy'). NO usar para planes de estudio completos
  (sistema-estudio-efectivo), memorizar un alegato concreto (memorizar-alegatos),
  preparar una audiencia (preparar-audiencia-juicio) ni auditar las citas de un escrito
  (verificador-citas-juridicas). Regla dura: solo se pregunta lo verificado; nada de
  artículos, roles, plazos ni dictámenes de memoria.
---

# Micro Examen de Derecho — 5 minutos al día

## 1. Qué es

Un examen corto, diario, de recuperación activa: 4 a 8 preguntas de respuesta breve,
corregidas al instante contra la fuente. Tres mensajes en total y se acabó.

Lo que **no** es: clase, resumen, plan de estudio, ni conversación sobre la materia. Si
el usuario quiere profundizar, eso es otra sesión y otro skill.

Por qué así: recuperar desde la memoria retiene más que releer; el intervalo creciente
entre repasos fija lo aprendido; y mezclar materias distintas en una misma tanda obliga
a discriminar, que es lo que falla en audiencia. El costo tiene que ser bajo para que se
haga todos los días: si la sesión pasa de cinco minutos, el skill está mal ejecutado.

## 2. Regla de oro

**Solo se pregunta lo que está en el banco con fuente verificada.** El motor
(`scripts/micro_examen.py`) rechaza lo que no cumpla, y lo rechazado no se pregunta jamás.

Prohibido, sin excepción:

- Generar una pregunta de memoria sobre un artículo, plazo, rol, dictamen o requisito.
  Si no hay ítem verificado, hay menos preguntas ese día. Nunca se rellena.
- Inventar un rol, número de dictamen o artículo para usarlo como distractor. En los
  ítems de tipo `discriminacion` y `deteccion`, el distractor se construye **alterando un
  elemento del propio ítem verificado** (un plazo, un requisito, el órgano competente), y
  la corrección dice cuál era el dato correcto y por qué el alterado no lo es.
- Afirmar la respuesta correcta sin la fuente al lado. La corrección siempre cita.
- Dar por buena la vigencia de una norma reformada. Si al corregir aparece duda de
  vigencia, el ítem **se anula**: no puntúa, se marca para reverificar y se dice en una línea.

## 3. Formato: tres mensajes

| # | Quién | Contenido |
|---|-------|-----------|
| 1 | Claude | Las N preguntas numeradas, juntas, sin preámbulo ni contexto |
| 2 | Usuario | Todas las respuestas en un solo mensaje, en taquigrafía |
| 3 | Claude | Corrección de una o dos líneas por ítem + cierre de una línea |

Nada de pregunta-respuesta-pregunta: el ping-pong multiplica la latencia y mata la
adherencia. Solo si el usuario pide **"uno a uno"** se hace ítem por ítem.

El usuario puede marcar cada respuesta con `!` (estoy seguro) o `?` (dudo). Es opcional
y vale la pena: equivocarse con `!` es el error caro, el que se lleva a un escrito sin
revisar, y el motor lo marca como riesgo.

### Modos

| Modo | Invocación | Qué hace |
|---|---|---|
| Estándar | "micro examen" | 6 ítems: repaso vencido + 1 nuevo + 1 de mantenimiento |
| Relámpago | "examen relámpago", "tengo 2 minutos" | 4 ítems, solo lo vencido y lo que peor anda |
| Por materia | "micro examen de laboral" | `--materia laboral` (municipal, tributario, procesal…) |
| Errores | "examen de mis errores" | Solo caja baja, último fallo o marcados como riesgo |
| Nuevos | "solo preguntas nuevas" | Ítems que nunca se han preguntado |
| Uno a uno | "uno a uno" | Mismo contenido, ítem por ítem (más lento, más exigente) |

## 4. Flujo

**Paso 1 — Seleccionar.** No elegir a mano: lo hace el motor.

```bash
python3 scripts/micro_examen.py seleccionar --modo estandar --n 6
python3 scripts/micro_examen.py seleccionar --modo relampago
python3 scripts/micro_examen.py seleccionar --materia laboral
```

Devuelve JSON con los ítems del día, su caja, su estado (nuevo / vencido / mantenimiento)
y la lista `por_reverificar` (fuentes con más de 12 meses sin confirmar, que quedan fuera).

**Paso 2 — Preguntar.** Si `seleccionar` devuelve **cero ítems**, no se improvisan preguntas:
el banco está vacío o todo quedó para reverificar. Se hace la primera corrida (§6) o se
reverifica; nunca se rellena con preguntas de memoria.

Numeradas, en un mensaje. Mostrar solo `pregunta` y, entre
corchetes, la materia. **Nunca** mostrar `elementos`, `fuente`, `url` ni el JSON antes de
que el usuario responda. Si hay ítems `por_reverificar`, mencionarlo en una línea al final,
no antes.

**Paso 3 — Corregir.** Contra los `elementos` del ítem, no contra la prosa:

| Resultado | Criterio |
|---|---|
| `bien` | Están todos los elementos esenciales, aunque estén dichos en dos palabras |
| `parcial` | Falta un elemento, o hay imprecisión que en un escrito habría que corregir |
| `mal` | Falta lo esencial, la cita es errónea, o la respuesta va por otro lado |

Reglas de corrección:
- Máximo dos líneas por ítem: qué faltó + la fuente exacta. Sin desarrollo, sin "excelente".
- En los ítems de tipo `cita`, aproximarse no basta: el artículo y el cuerpo legal, o el
  rol y el tribunal, se dan por buenos solo si están completos.
- El error con `!` se señala como tal en una línea: "esto lo diste por seguro".
- No corregir de memoria: la respuesta correcta es la del ítem, con su fuente. Si el
  usuario discute el ítem y tiene un punto, no se improvisa la respuesta: el ítem se manda
  a reverificar y se anula esa pregunta.

**Paso 4 — Registrar.** Siempre, en la misma corrida:

```bash
python3 scripts/micro_examen.py registrar lab-003=mal:alta muni-011=bien proc-002=parcial
```

Cajas 1→5 con intervalos 1, 3, 7, 21 y 60 días. `bien` sube de caja; `parcial` repite
antes; `mal` vuelve a caja 1 para mañana.

**Paso 5 — Cerrar.** Una línea: aciertos, qué quedó en riesgo y cuándo vuelve. Nada más.
Sin resumen de la materia, sin plan de estudio, sin ofrecer "profundizar".

## 5. Tipos de ítem

| Tipo | Qué entrena | Forma de la pregunta |
|---|---|---|
| `recuerdo` | Requisitos, plazos, elementos | "Enumera los requisitos de…" |
| `aplicacion` | Transferencia al caso | Micro caso de dos líneas: "¿qué acción y en qué plazo?" |
| `discriminacion` | Distinguir figuras que se confunden | "De estas dos situaciones, ¿cuál es X y cuál Y?" |
| `cita` | Precisión de la cita (riesgo profesional) | "¿Qué norma o fallo sustenta esto?" |
| `deteccion` | Detectar el error ajeno | Afirmación con un elemento alterado: "¿qué está mal aquí?" |

Mezclar tipos en la misma tanda. Una tanda de puro `recuerdo` es la menos útil.

## 6. Primera corrida: construir el banco

El banco nace **vacío**, a propósito: ningún ítem entra sin fuente confirmada. La primera
corrida toma 10 a 15 minutos y produce 20 a 30 ítems. Después crece solo, 2 o 3 por día,
desde el trabajo real.

De dónde salen los ítems, en este orden de preferencia:

1. **Lo que el usuario acaba de trabajar**: la contestación que redactó, el informe DAJ,
   la causa que revisó en la OJV, el dictamen que citó. La fuente ya está a la vista.
2. **El briefing diario** (`briefing-juridico-diario`): cada fallo o dictamen nuevo que
   valga la pena es un ítem con su rol o número y su enlace.
3. **La norma abierta en la sesión** (LeyChile/BCN): se transcribe el artículo y se
   construye la pregunta desde el texto, no desde el recuerdo.
4. **Los errores que detecte `verificador-citas-juridicas`**: cada cita que salió mal en un
   escrito es un ítem de tipo `cita`. Es el material más valioso del banco.

Formato del ítem y reglas de alta: `references/banco.md`.

```bash
python3 scripts/micro_examen.py agregar --archivo nuevos.jsonl --dry-run   # revisar
python3 scripts/micro_examen.py agregar --archivo nuevos.jsonl
```

Lo que no pasa validación (sin fuente, sin enlace o documento, con marcador `[VERIFICAR]`,
con fecha futura) va a `pendientes.jsonl` y **no se pregunta**. Ese archivo es la lista de
lo que hay que verificar, no un banco de reserva.

## 7. Mantenerse vigente

Estar vigente no es recordar lo que se estudió: es que lo que se recuerda siga siendo
verdad. El skill lo fuerza por tres vías:

- **Caducidad de la fuente.** Todo ítem lleva `verificado_el`. Pasados 12 meses sale del
  examen y aparece en `por_reverificar` hasta que se confirme en fuente oficial. Reverificar
  uno o dos por semana mantiene el banco sano.
- **Reformas.** Cuando el briefing o una búsqueda muestren que se modificó una norma del
  banco, los ítems afectados se reescriben o se reverifican **antes** de volver a preguntarse.
  Una reforma detectada y no propagada al banco es una respuesta equivocada esperando salir.
- **Entrada desde el trabajo real.** Lo que entra al banco es lo que el usuario efectivamente
  usa: causas activas, materias de la DAJ, tributario de la cartera. El repaso sigue a la
  práctica, no a un temario.

```bash
python3 scripts/micro_examen.py estado
python3 scripts/micro_examen.py estado --materia municipal
```

Reporta banco por materia, distribución de cajas, qué toca hoy, racha de días, aciertos de
los últimos 30 días, errores con alta confianza y la lista de reverificación.

## 8. Rutina diaria (opcional)

Si el usuario la pide, crear una Routine que abra la sesión a la hora que él diga con el
prompt "micro examen del día". El examen requiere que él responda: la Routine sirve para que
la pregunta lo esté esperando, no para correr sola.

## 9. Antipatrones

| No hacer | Por qué |
|---|---|
| Preguntar de memoria porque el banco quedó corto | Es exactamente lo que el protocolo de veracidad prohíbe |
| Explicar la materia al corregir | Convierte 5 minutos en 25 y el examen deja de hacerse |
| Felicitar, motivar o cerrar con consejos | Ruido; el dato es el puntaje y la fuente |
| Preguntar antes de ejecutar `seleccionar` | La selección es del motor, no del criterio del momento |
| Omitir `registrar` | Sin registro no hay repetición espaciada: el skill se vuelve un quiz al azar |
| Mostrar `elementos` o `fuente` junto a la pregunta | Elimina la recuperación activa, que es todo el mecanismo |
| Dejar pasar un ítem dudoso "por esta vez" | Un ítem falso repetido cinco veces se fija como verdadero |

## 10. Archivos

| Ruta | Rol |
|---|---|
| `scripts/micro_examen.py` | Motor: selección, registro, alta de ítems y estado |
| `references/banco.md` | Formato del ítem, reglas de alta y de verificación |
| `references/correccion.md` | Rúbrica, cajas, calibración y métricas |
| `assets/nuevos.ejemplo.jsonl` | Plantilla para dar de alta ítems |
| `~/.micro-examen/banco.jsonl` | Ítems verificados (los únicos que se preguntan) |
| `~/.micro-examen/pendientes.jsonl` | Ítems sin fuente confirmada: nunca se preguntan |
| `~/.micro-examen/progreso.csv` | Caja, próximo repaso y marcas de riesgo |
| `~/.micro-examen/historial.csv` | Una línea por respuesta, para métricas |

Los datos viven fuera de la skill para que sobrevivan a sus actualizaciones. En Windows la
carpeta es `%USERPROFILE%\.micro-examen\`; se puede mover con la variable `MICRO_EXAMEN_DIR`.

Para usar la skill desde cualquier carpeta, copiarla a `~/.claude/skills/` (Windows:
`%USERPROFILE%\.claude\skills\`).
