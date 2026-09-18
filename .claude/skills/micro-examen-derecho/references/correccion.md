# Corrección, cajas y métricas

## 1. Rúbrica

Se corrige contra los `elementos` del ítem, no contra la redacción. Una respuesta en tres
palabras que contiene los elementos vale `bien`; un párrafo elegante sin ellos vale `mal`.

| Resultado | Criterio | Efecto |
|---|---|---|
| `bien` | Están todos los elementos esenciales | Sube una caja |
| `parcial` | Falta un elemento, o hay imprecisión que en un escrito habría que corregir | Se queda en la caja, vuelve a la mitad del intervalo |
| `mal` | Falta lo esencial, la cita es errónea, o la respuesta va por otro lado | Vuelve a caja 1, se pregunta mañana |

En los ítems de tipo `cita` no hay `parcial` por aproximación: o está el artículo y el
cuerpo legal (o el rol y el tribunal), o es `mal`. Es el error que se traslada a los escritos.

## 2. Forma del feedback

Dos líneas por ítem como máximo:

```
3. parcial — faltó <elemento>. Fuente: <cita completa>.
```

Sin explicación de la materia, sin felicitaciones, sin sugerencias de lectura. Si el usuario
quiere desarrollo, lo pide y eso ya es otra sesión.

## 3. Calibración (`!` y `?`)

| Marca | Significado | Uso en la corrección |
|---|---|---|
| `!` | Responde seguro | Si falla, se registra `:alta` y queda marcado como riesgo |
| `?` | Responde dudando | Si acierta, se dice: sabe más de lo que cree; no se marca riesgo |
| sin marca | Neutro | Registro normal |

El error con alta confianza es el único que se comenta con una línea propia. Es el que
termina en un escrito sin verificar. Sale de riesgo cuando se responde `bien`.

## 4. Repetición espaciada

| Caja | Próximo repaso |
|---|---|
| 1 | 1 día |
| 2 | 3 días |
| 3 | 7 días |
| 4 | 21 días |
| 5 | 60 días |

`bien` sube una caja (máximo 5); `parcial` repite a la mitad del intervalo; `mal` vuelve a
caja 1. Los ítems marcados como riesgo tienen prioridad en la selección aunque su caja sea alta.

La selección estándar combina: lo vencido primero (caja más baja y mayor atraso), un ítem
nuevo y uno de mantenimiento, intercalando materias distintas para forzar la discriminación.

## 5. Ítems en disputa

Si el usuario sostiene que la respuesta del ítem está equivocada:

1. No se improvisa la respuesta correcta ni se le da la razón por cortesía.
2. La pregunta **se anula**: no puntúa y no se registra.
3. El ítem se saca del examen hasta reverificarlo en fuente oficial (`references/banco.md` §5).
4. Se sigue con el resto de la tanda. La discusión de fondo, si la hay, es otra sesión.

Un ítem equivocado repetido cinco veces se fija como verdadero: por eso la anulación es
inmediata y no queda a criterio.

## 6. Métricas

`python3 scripts/micro_examen.py estado` reporta:

| Dato | Para qué sirve |
|---|---|
| Banco por materia | Detectar áreas sin cobertura: lo que no está en el banco no se repasa |
| Distribución de cajas | Muchos ítems en cajas 1 y 2 = el banco creció más rápido de lo que se consolida |
| Para hoy | Cuántos ítems toca repasar |
| Racha de días | Adherencia. Es la métrica que más predice el resultado |
| Aciertos últimos 30 días | Entre 70% y 85% es la zona útil; sobre 90% el banco quedó fácil, bajo 60% creció demasiado rápido |
| Errores con alta confianza | La lista corta que conviene revisar antes de un escrito o una audiencia |
| Por reverificar | Deuda de vigencia del banco |

Si los aciertos superan el 90% sostenidamente, agregar ítems de `aplicacion` y
`discriminacion` de las mismas materias: lo que ya no cuesta, ya no enseña.
