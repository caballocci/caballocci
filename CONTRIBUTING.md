# Contribuir

Gracias por mejorar caballocci. Este documento explica cómo preparar un cambio para que pueda revisarse y publicarse sin fricción. Para instrucciones dirigidas a agentes automáticos, ver [AGENTS.md](AGENTS.md).

## Requisitos

- **Node.js 22** y npm (es la versión que usa CI; las pruebas usan `--experimental-strip-types`).
- **Windows** si vas a generar el instalador NSIS (`npm.cmd run dist:win`).
- Para la app Android complementaria: **Java 21** y Android SDK. Las claves de firma (`ANDROID_KEYSTORE_*`) solo existen en GitHub Actions; no las pongas en el repo ni en tu máquina como archivo versionado.

## Puesta en marcha

```powershell
git clone https://github.com/gattocci/caballocci.git
cd caballocci
npm.cmd ci
npm.cmd run dev
```

En desarrollo, **Acerca de / Actualizaciones** indica que el updater no está disponible: `electron-updater` solo se activa en la app empaquetada.

## Flujo de trabajo

1. Trabaja desde una rama con un cambio enfocado; no mezclar features independientes en la misma rama.
2. Escribe commits con [Conventional Commits](https://www.conventionalcommits.org/) en inglés, sujeto en imperativo y minúsculas:

   ```text
   feat(planner): add date marks to board cards
   fix(updater): keep dialog focus on the primary action
   docs: describe the release checklist
   chore: v0.5.1
   ```

3. Si el cambio afecta al usuario, incluye en la descripción del PR qué puede hacer ahora y cómo comprobarlo. Si añade una migración, indícalo explícitamente.
4. No abrir PRs con artefactos de `release/`: la carpeta está ignorada y los instaladores se publican solo desde GitHub Releases.

## Dónde va cada cambio

| Cambio | Archivos habituales |
| --- | --- |
| Interfaz del planner | `src/features/planner/`, `src/shared/` para lógica pura |
| Editor y portapapeles | `src/features/editor/`, `src/shared/clipboard-payload.ts` |
| Mapa conceptual | `src/features/concept-map/`, `electron/database/concept-links-repository.ts` |
| Base de datos | `electron/database.ts`, `electron/database/migrations.ts`, repositorios |
| Comunicación renderer ↔ main | `electron/preload.ts`, `electron/*-ipc-handlers.ts`, `electron/ipc-validation.ts`, `src/shared/types.ts` |
| Actualizaciones y notas | `src/components/UpdateDialog.tsx`, `src/shared/release-notes.ts`, `docs/RELEASE-NOTES.md` |
| App Android | `companion-apps/mobile-sync/`, `docs/MOBILE-SYNC.md` |
| Automatización de publicación | `.github/workflows/`, `scripts/verify-release.mjs`, `docs/RELEASING.md` |

## Pruebas

Añade pruebas para la lógica nueva. Los archivos viven en `test/` y usan el test runner de Node con extensión `.mts`.

**La lista de pruebas es explícita**: al crear un archivo nuevo, añádelo al script `test` en `package.json`; si no, CI no lo ejecutará.

Antes de abrir el PR:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Los tres comandos deben terminar con código 0.

## Migraciones de base de datos

- Añadir la migración al final del array en `electron/database/migrations.ts` con un número de versión nuevo.
- No modificar migraciones ya publicadas: los usuarios pueden tener una base de datos en ese estado.
- `electron/database.ts` crea un backup automático antes de ejecutarlas; no hay que hacerlo a mano.
- Documentar el efecto en la nota de release, con una sección propia si aplica.

## Documentación y changelog

- La documentación se escribe en español y se actualiza cuando cambia el comportamiento descrito.
- `CHANGELOG.md` se regenera con `auto-changelog` **en el momento del release**, no a mano en cada PR. El procedimiento está en [Proceso de release](docs/RELEASING.md).
- Las notas de la release se escriben según [RELEASE-NOTES.md](docs/RELEASE-NOTES.md). No incluir rutas locales absolutas, datos personales ni enlaces que no sean `https`.

## Seguridad

No publiques detalles explícitamente explotables en un issue. Sigue el procedimiento privado de [SECURITY.md](SECURITY.md). Antes de cada release se revisan las dependencias con `npm.cmd audit`; no ejecutar `npm audit fix --force` sin revisar los cambios mayores.

## Checklist del PR

- [ ] Commits con mensajes convencionales y en inglés.
- [ ] Pruebas nuevas registradas en `package.json` y `npm.cmd test` en verde.
- [ ] `npm.cmd run typecheck` y `npm.cmd run build` en verde.
- [ ] Documentación actualizada si el comportamiento cambió.
- [ ] Sin secretos, rutas locales absolutas ni artefactos de `release/` en el diff.
- [ ] Migraciones (si las hay) añadidas al final y explicadas en la descripción.
