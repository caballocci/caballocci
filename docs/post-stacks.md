# Pilas de publicaciones en el tablero — plan de diseño

Estado: **aprobado por el usuario** (18nov26), incluyendo las respuestas a las preguntas abiertas (§10) y los puntos a resolver (§9). Alcance inicial: MVP persistente dentro de una columna + «Apilar selección» en el menú de selección múltiple.

## 1. Semántica

- Una **pila** agrupa publicaciones hermanas dentro de **una sola columna** (mismo `status`). Sirve para piezas hermanas de una misma idea o campaña (carruseles, variantes), sin imponer nada.
- **Orden manual**: la tarjeta de arriba (menor `stack_position`) representa la pila; las demás siguen el orden que el usuario defina arrastrándolas en la vista expandida. No hay «portada» especial.
- La pila **no tiene nombre propio**: se identifica por la tarjeta que está arriba.
- Colecciones (`work_groups`) **y pilas** son independientes: cada publicación conserva sus membresías; una pila no es una colección ni subcolección.
- El calendario muestra cada publicación por separado (sin indicador de pila en esta fase).
- El contador de la columna cuenta publicaciones (5 son 5), nunca pilas.
- **Apilar entre columnas distintas no está permitido**; las pilas viven en una columna.
- **Ubicación**: la pila ocupa el lugar de su tarjeta superior (la ordenación de la columna usa la posición de la primera apilada; las ocultas no influyen). Editar un miembro no reordena la pila ni cambia de columna la pila a menos que la primera cambie de posición.

## 2. Definiciones cerradas

1. La pila vive en una sola columna. Si una apilada cambia de estado, **sale de la pila automáticamente**.
2. Mover la pila a otra columna mueve todas las tarjetas juntas (se conservan apiladas en la columna destino).
3. Sin nombre propio; se identifica por la tarjeta superior.
4. Contador de columna = publicaciones, no pilas.

### Generalización (punto 2 del usuario)

**Toda salida de la columna o del espacio desapila.** Esto incluye:

- cambios de `status` (drag entre columnas, cambios de estado desde el editor, acciones masivas);
- `movePostsToSpace` (mover a otro espacio);
- archivar (es cambio de columna);
- cambios automáticos de estado del programador (p. ej. Programado → Publicado) si los hubiera.

Mecanismo: un único funnel en el store (`save`) que detecta `status`/`project` antes→después. Si todos los miembros de la pila cambian juntos en la misma acción (p. ej. arrastrar la pila entera a otra columna), la pila se conserva — véase §6 «keepStack».

## 3. Persistencia (migración `v34`)

```sql
ALTER TABLE posts ADD COLUMN stack_id TEXT NULL;
ALTER TABLE posts ADD COLUMN stack_position INTEGER NULL;
CREATE INDEX IF NOT EXISTS posts_stack_idx ON posts(stack_id);
```

- `stack_id` NULL ⇒ publicación suelta. Si no es NULL, la publicación pertenece a la pila.
- `stack_position` 0 = arriba; se renumera 0..n-1 dentro de cada pila en cada operación (apilar/desapilar/reordenar/mover).
- `stack_id` es un UUID propio, **no** referencia ningún post.
- Sin FK (estilo del proyecto; integridad en la capa de aplicación).
- Una pila con menos de 2 miembros se deshace sola (el restante suelto).
- Backfill: ninguno.
- `Post.stackId`, `Post.stackPosition`; `PostInput` opcionales; `posts.list` (SELECT \*) y `mapPost` propagan; `validatePostInput` acepta `stackId` (string ≤64 | null) y `stackPosition` (entero 0..9999 | null) en su whitelist para que el round-trip posts→editor→save no pierda los campos.

## 4. Interacción

### Crear/expandir/colapsar

- **Apilar**: arrastrando una o varias publicaciones sobre una tarjeta **de la misma columna** (zona centro de la tarjeta), o con el botón **«Apilar selección»** del menú «Más acciones» de la barra de selección múltiple (MVP: mismo camino, `stackPosts(targetId, ids)`, undoable `batch` «Apilar publicaciones»; el arrastre es un atajo del mismo camino).
- **Vista cerrada**: la tarjeta superior normal de la publicación, más:
  - 2–3 capas desfasadas detrás (bordes asomando, offset ~4px por capa);
  - **un solo chip con `Layers` + contador** junto al ícono de formato (p. ej. «▦ 5» junto a «Reel»);
  - nada de color de borde: la selección ya usa amarillo+check; la pila se distingue solo por forma, capas, chip e ícono.
- **Hover**: las capas traseras «abanican» levemente (rotación ±2°, offset lateral).
- **Clic en la pila cerrada**: expande **en flujo** dentro de la celda (la lista sustituye a la tarjeta única; la columna crece en alto — costo aceptado):
  - Cada tarjeta muestra «1/5», «2/5»…
  - **Reordenar arrastrando** dentro de la lista, con indicador de inserción. La primera al cerrar es la superior.
  - **Arrastrar una tarjeta fuera de la lista** la desapila (misma columna) — o, si cae en otra columna, cambia de estado y la regla general la desapila.
  - Clic en una tarjeta expandida abre el editor como una publicación suelta.
  - **Colapso solo por control explícito** (ícono de pila/cerrar en la cabecera de la lista): predecible, sin cierres implícitos por clic-fuera ni selección.
- **Selección en la pila cerrada**: borde amarillo y check en la tarjeta superior, como cualquier publicación; las capas traseras no cambian de color. El checkbox selecciona **todos** los miembros (las operaciones masivas aplican a la pila entera).
- **Selección dentro de la lista expandida**: check por tarjeta, igual que publicaciones sueltas.

### Drop sobre tarjetas vs. sobre columna (punto 1 del usuario)

- El tablero hoy solo admite drop sobre la columna (resalte amarillo discontinuo + hueco de inserción). Con las tarjetas como zonas de drop:
  - **Arrastrar sobre el centro de una tarjeta** de la misma columna → se **apaga el resalte de columna** y se resalta **solo esa tarjeta** con capas fantasma detrás (indicador de apilado). El resalte y el hueco de inserción **nunca conviven** sobre la misma zona.
  - **Sobre espacio libre, bordes de la tarjeta u otras zonas** → comportamiento actual (hueco de inserción de la columna).
  - **Tarjeta de otra columna: nunca apila** — siempre mueve (a la columna, con el comportamiento actual).
  - El fantasma de arrastre muestra el conteo cuando hay varias seleccionadas (ya existe el patrón `data-count` en `.board-drag-ghost`).
  - **Sin parpadeo** entre «hueco de inserción» y «resalte de apilado» al mover el cursor entre tarjetas: regiones de decisión mutuamente excluyentes (centro = apilar; resto = columna), con histéresis implícita del umbral de zona (se evalúa `onPointerMove`/`onDragOver` una vez por frame, no por píxel).

### Combinar pilas (punto 4 del usuario)

Al soltar:

- una **pila suelta sobre una pila existente** → se fusionan; las tarjetas de la pila arrastrada se **añaden al final** de la destino, conservando su orden relativo;
- una **pila sobre una publicación suelta** → la suelta queda arriba y las de la pila arrastrada debajo en su orden (la suelta se convierte en la nueva raíz de una pila formada por ambas);
- publicaciones sueltas sobre una pila → se añaden al final de la pila;
- cualquier fusión que deje una pila de un único miembro lo desapila (invariante §3).

### Mover la pila (punto 2 del usuario)

- Arrastrar **la pila cerrada** (o su checkbox con todos los miembros seleccionados) a otra columna mueve **todas las tarjetas juntas** — siguen apiladas en la columna destino. Mover a otro espacio las desapila a **todas** (salen del espacio).
- Desde la vista expandida, arrastrar un miembro concreto **desapila solo a ese miembro** (a la columna actual, a otra columna o a otro espacio).
- Mecánica: el inicio del arrastre expande `dragIds` a todos los miembros cuando se arrastra desde una pila; el drop handler trata el conjunto como unidad.

## 5. Undo

Sin tipos de undo nuevos: `Post` lleva `stackId`/`stackPosition` y `save` registra cada cambio por-post; las operaciones multi-post se agrupan como `batch` (patrón de `movePostsToSpace` + `groupRecentUndoActions`):

- Apilar (crear o añadir) → `batch` «Apilar publicaciones».
- Desapilar → `batch` «Desapilar publicación».
- Reordenar → `batch` «Reordenar pila».
- Mover pila de columna → `batch` «Mover pila a otra columna».
- **Auto-disolución en el mismo `batch` que la causa** (punto 6 del usuario): si borrar/cambiar estado/mover a otro espacio renumera o disuelve una pila, el borrado y la renumeración/disolución van en el **mismo `batch`** — deshacer restaura tanto los miembros como sus posiciones.

## 6. Implementación técnica

### A — Datos

Migración v34; tipos `Post.stackId/stackPosition`; `PostsRepository` escribe y lee `stack_id/stack_position` (save reescribe la fila completa → ambos van siempre en la columna list); `mapPost` propaga (`stackId: row.stack_id || null`, `stackPosition` con Number); `postStatuses`/`postStatuses` intactos; `validatePostInput` acepta los dos campos.

### B — Store (`src/app/store.ts`)

- `stackPosts(targetId, ids)` — apila/añade; renumera; `batch` «Apilar publicaciones».
- `unstackPost(id)` — desapila uno y renumera; disolución; `batch` «Desapilar publicación».
- `reorderStack(stackId, orderedIds)` — posiciones 0..n-1; `batch` «Reordenar pila».
- En `save`: detección de cambio `status`/`project` (generalizando regla 1). Si cambia y la publicación tenía pila → sale de la pila y renumera la pila restante (en el mismo `batch` que el cambio).
- `moveWithStacks(ids, status)` (nuevo) o equivalente: cuando **todos** los miembros de una pila están en el conjunto arrastrado, la pila se mueve entera con `keepStack: true` (sus miembros cambian de `status` pero NO desapilan). Fuera de ese caso se desapilan individualmente.
- Disolución automática <2 miembros tras cualquier renumeración.

### C — Tablero (`BoardLanes.tsx` + CSS)

- **Agrupación en render**: dentro de cada columna, los posts con el mismo `stack_id` se agrupan; la pila ocupa la posición de su miembro superior; los demás no se pintan (salvo en expandida).
- `StackCard` (cerrada): capas fantasma detrás (pseudo-elementos CSS), chip «Layers + n» junto a formato; hover con fan; checkbox amarillo+check «selecciona la pila entera»; clic abre expandida.
- `StackCard` (expandida, en flujo): cabecera con título «Pila · N» + control de colapso explícito; tarjetas numeradas «i/N»; DnD propio de inserción (indicador); cada tarjeta es zona de drop para apilar sobre ella; drag-out desapila; clic abre editor.
- **Drop zones mutuamente exclusivas** (§4): sobre tarjetas (centro) → apilar, apaga la columna; sobre libre → pila de inserción actual; sin parpadeo.
- Contador de columna sin cambios.

### D — (dentro del MVP, elevado de fase C)

«Apilar selección» en «Más acciones» de la barra de selección (usa `stackPosts(targetId, ids)`; `targetId` = primera tarjeta del conjunto en el orden visual). Deshacible.

## 7. Riesgos y notas

- **DnD anidado** (reordenar en expandida vs. apilar sobre tarjeta vs. insertar en columna): mismas `dataTransfer.types` — el indicador de inserción debe ser exclusivo por zona y mutuamente excluyente (§4). Punto más delicado junto a las tarjetas-como-zona-de-drop.
- **Sin FK**: pilas de 1 miembro o `stack_position` arbitrario no rompen la lectura; se normaliza en lectura (si hay huecos/duplicados, se renumera al primer acceso escritural).
- **Compresión de medios**: no toca pilas.
- **Sincronización móvil**: el móvil nunca reescribe posts (verificado 18nov26: `mobile-sync-repository` solo registra en sus propias tablas; el único escritor de filas es `posts.save`, que escribirá los campos nuevos). El móvil recibe los campos extra en `mapPost` e ignora lo desconocido; sin cambios de protocolo. Si en el futuro el móvil reescribe posts completos, debe conservar `stack_id`/`stack_position`.
- **Undo masivo**: un batch con N saves; pilas pequeñas en la práctica.
- **Scroll**: la pila expandida desplaza alto de celda; el `AreaSelectionSurface` coexiste porque las tarjetas expandidas usan su propio DnD (`onDragStart` detienen propagación hacia la selección).
- **Colapso**: solo control explícito (cabecera). Nada de cierre implícito.
- **Selección visual**: pila cerrada seleccionada = borde amarillo + check en la superior; capas traseras inalterables (nunca cambian de color por selección).
- **Rendimiento**: el agrupado se hace en render; O(n) extra por columna — sin coste perceptible.

## 8. Fuera de alcance

- Indicador «pertenece a una pila» en calendario/línea de tiempo.
- Pilas entre columnas.
- Nombres de pila.
- Archivos sincronizados al móvil con semántica de pila (siguen siendo posts independientes).
- Multi-selección dentro de la pila expandida (MVP: una a la vez).

## 9. Puntos resueltos (añadidos por el usuario)

1. **Drop sobre tarjetas vs. columna**: tarjeta como zona de drop en su centro (misma columna), apaga el resalte de columna, resalta esa tarjeta con capas fantasma; fuera del centro, comportamiento actual; otra columna nunca apila; fantasma muestra N si varias seleccionadas. Exclusión mutua para no parpadear.
2. **Toda salida de columna/espacio desapila**: status, espacio (`movePostsToSpace`), archivar, y cambios automáticos del programador. Un único funnel en `save`.
3. **Ubicación**: la pila ocupa el lugar de su tarjeta superior; editar un miembro no la hace saltar de posición.
4. **Fusionar pilas / pila sobre suelta**: se fusionan; las arrastradas se añaden al final conservando orden relativo (§4).
5. **Colapso solo con control explícito** (sin clic-fuera).
6. **Auto-disolución dentro del mismo batch** que la causa (§5).
7. **Sync móvil**: el móvil no reescribe posts; el único escritor es `posts.save`, que escribirá los campos nuevos (verificado).
8. **Selección visual**: pila seleccionada = borde amarillo + check en la superior; capas traseras sin cambios.
9. **Parpadeo selección vs. apilado**: zonas de drop mutuamente excluyentes (§4).

## 10. Resoluciones (preguntas del plan original)

1. Drag de pila cerrada entre columnas → **mueve la pila entera** (confirmado).
2. Expansión **en flujo** (confirmado).
3. **Auto-disolución <2 miembros + renumeración** (de acuerdo).
4. **Reordenar arrastrando con indicador de inserción**; sin botones ↑↓.
5. **Clic abre editor** en tarjeta expandida.
6. **«Apilar selección» en el MVP** en «Más acciones» (vía `stackPosts`; arrastre es atajo).
7. **Chip único `Layers` + contador** junto a «Reel» (no separado).
8. **Contador de columna cuenta publicaciones**.
