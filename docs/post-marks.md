# Marcas personales — ejes definidos

Las marcas son anotaciones privadas sobre una publicación. No cambian su etapa, su programación ni su prioridad, y no se publican: viven en el equipo donde se pusieron. Se gestionan desde el menú contextual del tablero y se muestran como chips en la tarjeta.

## Ejes definidos

Hay **dos ejes independientes**. Cada publicación admite como máximo un valor por eje: las marcas no se acumulan dentro de un eje, pero los dos ejes se pueden combinar libremente.

| Eje | Valores | Chip en la tarjeta | Acciones del menú |
| --- | --- | --- | --- |
| Fecha | Una fecha y hora por publicación | Tiempo transcurrido desde la marca | **Registrar fecha** / **Quitar fecha registrada** |
| Interés | `>` Interés · `>>` Mucho interés · `>>>` Interés especial | Las flechas del nivel elegido | **Destacar…** / **Sin destacar** |

- **Fecha** responde a «¿cuándo puse esta marca?». Registrarla de nuevo reemplaza la fecha anterior: solo se conserva la más reciente. El chip muestra el tiempo transcurrido y se actualiza solo.
- **Interés** responde a «cuánto me interesa esta publicación». Es una escala ordinal de tres niveles: `>` es interés normal, `>>` mucho interés y `>>>` interés especial. El nivel más alto se reserva para contenido que merece atención destacada y **no** implica publicarlo ni subir su prioridad automáticamente. Las tres flechas son tres niveles de un mismo eje, no tres marcas distintas.

Los colores, las etapas, las programaciones y las confirmaciones del móvil son atributos distintos y no forman parte de este sistema. Al borrar una publicación, sus marcas se descartan con ella.

## Antes de añadir otra marca

Todavía **no hay un tercer eje definido**. Para incorporar una marca nueva hay que describirla primero en este documento y en `src/shared/post-marks.ts`:

1. Qué pregunta responde y en qué se diferencia de fecha e interés.
2. Qué valores admite y si son excluyentes o acumulables.
3. Cómo se ve en la tarjeta y cómo se quita desde el menú.
4. Dónde se guarda y qué pasa al eliminar la publicación.

Definidos esos cuatro puntos, se puede valorar el tercer eje sin confundirlo con un nivel nuevo de interés.
