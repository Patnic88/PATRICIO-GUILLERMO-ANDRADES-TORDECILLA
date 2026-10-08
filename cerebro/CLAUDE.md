# Reglas del cerebro (para Claude)

Esta carpeta `cerebro/` es la bóveda de Obsidian de Patricio Andrades, abogado
de la Dirección Jurídica de la Municipalidad de Los Vilos (Chile) y con
clientes particulares. Cualquier sesión de Claude sobre este repo debe
**consultarla antes de responder preguntas de contexto** y mantenerla así:

## Estructura y responsabilidades

- `00 Bandeja de entrada/`: notas sin clasificar. Patricio (o Claude) deja aquí
  material nuevo. Al pedir «ordena la bandeja», Claude mueve cada nota a la
  carpeta correcta, la enlaza y la deja con título claro.
- `01 Proyectos/`: una nota por trabajo con objetivo y fin previsible. Cada una
  lleva frontmatter `estado` (activo / en espera / terminado) y `plazo` si lo
  hay. Al terminar, se mueve a `04 Archivo/`.
- `02 Áreas/`: responsabilidades permanentes. No se archivan.
- `03 Recursos/`: material de referencia estable.
- `Personas/`: una nota por persona, con cargo, correo y de qué temas es
  contacto. Enlazar siempre a las personas desde proyectos y áreas.
- `Diario/`: notas diarias `AAAA-MM-DD.md`. No reorganizarlas.
- `Plantillas/`: usadas por el plugin Templates de Obsidian. Mantener la
  sintaxis `{{date}}` / `{{title}}` intacta.

## Convenciones

- Todo en **español**. Fechas en formato `AAAA-MM-DD`.
- Enlaces internos con `[[dobles corchetes]]`; el nombre del archivo es el
  título de la nota.
- Datos que provienen de correos u otras fuentes: indicar la fuente y la fecha
  del dato («según correo del 2026-05-29») para no presentar información
  desactualizada como vigente.
- Nunca borrar contenido escrito por Patricio; si algo queda obsoleto, moverlo
  a `04 Archivo/` o marcarlo como tal.
- No editar `.obsidian/` salvo petición expresa.

## Ciclos periódicos (cuando Patricio los pida)

- **Ordenar**: vaciar `00 Bandeja de entrada/` clasificando y enlazando.
- **Actualizar**: revisar Gmail/tareas y refrescar estados y plazos de
  `01 Proyectos/`.
- **Health check**: detectar contradicciones, notas huérfanas (sin enlaces) y
  plazos vencidos; dejar el informe como nota en la bandeja de entrada.
