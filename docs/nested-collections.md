# Colecciones anidadas — decisiones y limitaciones conocidas

Estado: implementado en `feature/10Nov26` (migración `v33`). Resumen de la semántica y de lo que _a priori_ no es un problema, más las limitaciones aceptadas (revisables más adelante).

## Semántica actual (qué esperar)

- **Navegación por niveles (drill-down)**: el tablero muestra un nivel a la vez. Entrar en una colección muestra sus subcolecciones como chips, con breadcrumb `Colecciones › padre › hija` y botón de volver. El mapa conceptual funciona igual.
- **Publicaciones de la vista = unión del subárbol**: al entrar en una colección ves sus publicaciones y las de todas sus descendientes, sin duplicados. El carril "Sin colección" del kanban solo lista publicaciones sin ninguna membresía (ninguna colección de ningún nivel).
- **Conteos rollup**: el número junto a cada colección suma posts del propio nodo + descendientes (excluyendo archivados y posts archivados). En la sidebar y en los chips.
- **Archivar** una colección archiva **todo su subárbol**; restaurar revierte todo el subárbol. Eliminar una colección **mueve sus subcolecciones un nivel arriba** (posts se conservan; los posts pierden solo esa membresía).
- **Reglas de espacio**: anidar colecciones de espacios distintos está rechazado; una colección sin espacio hereda el espacio del padre. Filtro por espacio oculta los subárboles que no matchean (los raíz generales siguen visibles).
- **Undo/redo** funciona por colección: crear/editar/archivar/borrar y cambios de padre (anidar/sacar a raíz) son deshacibles; reorden manual entre hermanos depende del orden en `localStorage` (`caballocci.work-group-order`).
- **Crear subcolección no entra automáticamente** (antes sí, y la vista quedaba "atrapada" mostrando solo ← y +); el chip aparece en el nivel actual y permite crear hermanas consecutivas.

## Limitaciones conocidas (aceptadas, revisables)

1. **Undo de archivo de subárbol es uniforme**: restaurar desarchiva el subárbol completo, incluido un hijo que estaba archivado manualmente antes. No hay "unlevel archive" base.
2. **Undo de borrado no re-anida**: deshacer un borrado recrea la colección (con su membresía y si antes existía) pero los hijos quedan un nivel arriba, donde los movió el borrado. Si ocurre con frecuencia, registrar acciones de re-anidado en el undo es la mejora natural.
3. **Comprimir medios solo opera sobre la membresía directa** del grupo, no sobre el subárbol. Es la opción más conservadora; ampliar a subárbol requiere revisar también `work_groups.compressed_media_count` y los manifiestos.
4. **Sin FK ni constraint en SQLite**: la integridad de `parent_id` (aciclicidad) la impone la capa de aplicación (`resolveParentId`). Un backup restaurado a mano con ciclos no rompe la lectura (el árbol tolera ciclos) pero podría mostrar estados confusos; defensa única es la validación al escribir.
5. **Orden manual local**: el ranking de hermanos vive en `localStorage` (`caballocci.work-group-order`), no en la base. Perder ese dato (limpieza de storage) deja el orden por defecto (`created_at`), no la estructura.
6. **Filtro por espacio parcial**: una colección hija con espacio distinto al del padre visible solo aparece cuando su espacio está activo; los rollups se calculan solo sobre lo visible del espacio activo.
7. **Undo de operaciones de subárbol no agrupa**: "Archivar" es un leaf de undo, no un batch por grupo; caídas parciales a mitad del subárbol (fallo IPC a mitad de UPDATE) son teóricamente posibles — el backend hace transacción, pero el espejo del store es best-effort.
8. **Contador de hijos en confirmaciones** (`pendingGroupChildCount`) usa hijos directos del mismo espacio de la selección de datos; con filtros por espacio puede subcontar hijos de otros espacios (cosmético, solo texto de confirmación).
9. **Profundidad ilimitada en datos**: no hay tope de niveles (tampoco en el mapa). Si en algún momento hace falta un guard de negocio, un límite duro en `resolveParentId` es el punto de anclaje natural. En la práctica, 3–4 niveles es el rango razonable de organización; más profundo suele ser una etiqueta disfrazada.
10. **`workGroupDragType` compartido**: sidebar y kanban usan el mismo `application/x-caballocci-work-group-id`; arrastrar entre ambos contextos funciona, pero no hay drag multi-selección de colecciones ni drag de colecciones a "Sin colección"/raíz por teclado (solo botón "Soltar para mover al nivel superior" y la vía de menú "Sacar al nivel superior").

## Incidencias puntuales

- **Diálogo de crear/editar colección montado pero inerte** (observado una vez, sin repro): título y labels visibles, campos sin click ni teclado, sin overlay visible encima. No se encontró ningún overlay invisible determinista en el código; el patrón más probable es un _click-swallow_ transitorio de Chromium/Electron en Windows inmediatamente después de un drag nativo HTML5 (p. ej. anidar una colección arrastrándola). Se blindó el diálogo (portal a `document.body`, foco por ref en vez de `autoFocus`, Esc para cerrar) pero **no es una garantía** — si vuelve a ocurrir, anotá qué había en pantalla (¿panel rojo de errores arriba a la derecha? ¿algo flotando?) porque esa pista es la única que falta para pinpoint it.
