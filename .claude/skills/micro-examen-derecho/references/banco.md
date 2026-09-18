# Banco de ítems: formato, alta y verificación

## 1. Estructura del ítem

Una línea JSON por ítem en `banco.jsonl`. Los ejemplos van con marcadores `<…>`: el
contenido se completa **desde la fuente a la vista**, nunca de memoria.

```json
{"id":"lab-014","materia":"laboral","tipo":"cita","pregunta":"<pregunta breve>","elementos":["<elemento 1>","<elemento 2>"],"fuente":"<artículo + inciso + cuerpo legal | rol + tribunal + fecha | N° dictamen + año>","url":"<enlace oficial>","verificado_el":"2026-09-18","origen":"<causa, informe o lectura donde salió>"}
```

| Campo | Obligatorio | Contenido |
|---|---|---|
| `id` | sí | `materia-NNN`, único. No se reutiliza un id dado de baja |
| `materia` | sí | `laboral`, `municipal`, `administrativo`, `tributario`, `procesal`, `constitucional`, `contable`… |
| `tipo` | no (`recuerdo`) | `recuerdo`, `aplicacion`, `discriminacion`, `cita`, `deteccion` |
| `pregunta` | sí | Respondible en menos de 40 segundos y menos de 30 palabras |
| `elementos` | sí | Lista de 1 a 4 unidades de puntaje, en palabras clave, no en frases |
| `fuente` | sí | Cita completa según el tipo (§3) |
| `url` | sí, salvo `documento` | Enlace a la fuente oficial |
| `documento` | alternativa a `url` | Ruta o expediente donde consta (fallo descargado, dictamen en carpeta) |
| `verificado_el` | sí | `AAAA-MM-DD` de la última confirmación en fuente oficial |
| `origen` | no | De dónde salió: causa, informe, briefing. Ayuda a decidir qué reverificar |
| `deriva_de` | no | Id del ítem verificado del que sale un `discriminacion` o `deteccion` |
| `notas` | no | Advertencia de vigencia, criterio reconsiderado, voto de minoría |

## 2. Reglas de redacción

- **Un ítem, un hecho.** Si la respuesta correcta necesita más de cuatro elementos, son
  varios ítems. Los ítems largos se fallan por cansancio, no por ignorancia.
- **Los `elementos` son el puntaje.** Se redactan como palabras clave ("caducidad 60 días
  hábiles", "notificación al empleador") para poder corregir respuestas en taquigrafía.
- **Nada de preguntas cuya respuesta sea "depende"** sin que el criterio de distinción esté
  en los elementos. Ese criterio es justamente lo que hay que saber.
- **Ámbito temporal explícito** cuando la norma tenga vigencia acotada o régimen transitorio:
  va en `notas` y se menciona al corregir.
- **`discriminacion` y `deteccion` se derivan**, no se inventan: se toma un ítem verificado,
  se altera uno de sus propios elementos y se apunta `deriva_de`. Jamás se fabrica un rol,
  un número de dictamen o un artículo para hacer de distractor.

## 3. Cita mínima según el tipo de fuente

| Fuente | Datos mínimos en `fuente` |
|---|---|
| Norma legal | Artículo + inciso + cuerpo legal (+ vigencia si está reformada) |
| Sentencia CS / CA | Rol + año + tribunal/sala + fecha (+ considerando si se cita) |
| Sentencia base | RIT/RUC + tribunal + fecha |
| Dictamen CGR | N° o E-N° + año + fecha + materia |
| Tribunal Constitucional | Rol + año + fecha |
| Doctrina | Autor + obra + edición + año + página |

Fuentes oficiales, en este orden: BCN/LeyChile, CGR (Base de Dictámenes), PJUD (OJV y
buscador CS/CA), Diario Oficial, Tribunal Constitucional. Una fuente secundaria se
identifica como tal y no basta para dar un ítem por verificado.

## 4. Alta de ítems

```bash
python3 scripts/micro_examen.py agregar --archivo nuevos.jsonl --dry-run
python3 scripts/micro_examen.py agregar --archivo nuevos.jsonl
```

El motor rechaza y manda a `pendientes.jsonl`:

- falta `fuente`, `elementos`, `verificado_el` o identificación (`url` / `documento`);
- cualquier marcador `[VERIFICAR]`, `[PENDIENTE]`, `[CONFIRMAR]` en cualquier campo;
- `verificado_el` con formato inválido o fecha futura;
- `id` duplicado;
- `tipo` fuera de la lista.

`pendientes.jsonl` es la cola de verificación: nada de ahí se pregunta. Se vacía
verificando en fuente oficial y dando de alta de nuevo, o descartando el ítem.

## 5. Reverificación

Un ítem con más de 12 meses desde `verificado_el` sale del examen automáticamente y aparece
en `por_reverificar`. Para reponerlo:

1. Abrir la fuente oficial y confirmar que el texto, el criterio o el fallo siguen vigentes.
2. Si cambió: reescribir `pregunta`, `elementos` y `fuente` con el texto nuevo.
3. Si fue derogado, reconsiderado o dejado sin efecto: dar de baja el ítem, o convertirlo en
   uno de `discriminacion` entre el criterio antiguo y el vigente, con las dos fuentes.
4. Actualizar `verificado_el` a la fecha de la confirmación. Nunca actualizar esa fecha sin
   haber vuelto a mirar la fuente: es la única garantía de vigencia del banco.
