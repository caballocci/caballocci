# AGENTS.md

Instrucciones para agentes de código, asistentes y automatizaciones que trabajen en este repositorio. Para contribuir como persona, empieza por [CONTRIBUTING.md](CONTRIBUTING.md).

## Principios

- Documentación, notas de release y texto visible para el usuario van en **español**, con el tono claro y concreto del README. Los identificadores de código (`stackPosts`, `ApplyFieldsDialog`) y los subjects de commits van en **inglés**.
- No prometer funcionalidad que no esté en los commits de la versión: comprobar siempre con `git log vPREV..HEAD`.
- No publicar rutas locales absolutas, credenciales, tokens ni URLs de intranet en changelogs, notas, documentación ni respuestas.
- Preferir cambios pequeños y verificables. No reescribir archivos completos sin necesidad; no borrar trabajo ajeno.
- Si una acción dispara una publicación (push de un tag `v*`), dejarlo explícito antes de ejecutarla.

## Mapa rápido

| Zona | Qué contiene |
| --- | --- |
| `electron/` | Proceso principal, persistencia SQLite (sql.js), controladores IPC y migraciones en `electron/database/migrations.ts`. |
| `src/app/` | Aplicación React y store de Zustand (`src/app/store.ts`). |
| `src/features/` | Planner, editor, mapa conceptual, ideas y ajustes. |
| `src/components/` | Layout y diálogos compartidos, incluido `UpdateDialog.tsx` y `ReleaseNotesMarkdown.tsx`. |
| `src/shared/` | Utilidades puras: notas de release, recordatorio, marcas de post, portapapeles, tipos. |
| `test/` | Pruebas `.mts` ejecutadas por el test runner de Node. |
| `companion-apps/mobile-sync/` | App Android (Capacitor). Tiene su propio `package.json`/lock y comparte versión con el escritorio. |
| `.github/workflows/release-windows.yml` | Pipeline de release: APK firmado, instalador y GitHub Release. |
| `scripts/verify-release.mjs` | Validación de etiqueta, versión y artefactos. |
| `docs/` | Especificaciones de producto y procesos. |

## Convenciones

- **Commits:** Conventional Commits en inglés, sujeto en imperativo y minúsculas: `feat(planner): ...`, `fix(updater): ...`, `docs: ...`, `chore: ...`. Los merges de release usan `merge: release vX.Y.Z`.
- **Pruebas:** el script `test` descubre automáticamente `test/**/*.test.mts`. Los helpers compartidos van en `test/helpers/` y no se ejecutan como pruebas.
- **Migraciones:** se añaden al final del array en `electron/database/migrations.ts` con versión creciente. No editar migraciones ya publicadas. El backup previo se crea en `electron/database.ts` (`runMigrations`).
- **IPC:** los canales nuevos necesitan validación en `electron/ipc-validation.ts`; el renderer corre con sandbox y `contextIsolation`. No exponer APIs de Node.
- **Markdown:** las notas se renderizan con `react-markdown` + `remark-gfm` y HTML crudo deshabilitado. No introducir HTML en notas ni en la UI de actualizaciones.
- **Dependencias:** cambiar `package.json` con npm y dejar que actualice el lock; no editar manualmente las dependencias del lock.
- **Consola de Windows:** usar `npm.cmd`. En PowerShell 5.1 no existe `&&`: encadenar con `;` y comprobar `$LASTEXITCODE`. Para redirección UTF-8 de `npx`, usar `cmd.exe /c "… > archivo"`.

## Versiones y releases

- La versión vive en cuatro sitios: `package.json`, `package-lock.json`, `companion-apps/mobile-sync/package.json` y su lock. Siempre se actualizan juntos.
- `release/` está ignorada por git: los instaladores y el archivo de notas de trabajo no se commitean.
- El workflow crea el release con notas autogeneradas; el cuerpo debe sustituirse manualmente siguiendo [RELEASE-NOTES.md](docs/RELEASE-NOTES.md).
- Proceso completo, comandos y verificación final: [Proceso de release](docs/RELEASING.md).

## Antes de dar por terminado un cambio

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Si el cambio prepara una release, añadir `node scripts/verify-release.mjs vX.Y.Z` y `npm.cmd audit` (ver [SECURITY.md](SECURITY.md)).

## No hacer

- No inventar rutas, features ni commit IDs; verificarlos con git.
- No dejar el body del release vacío ni con el título duplicado.
- No incluir imágenes externas ni enlaces `javascript:` en notas.
- No ejecutar `npm audit fix --force` sin revisar los cambios mayores.
- No pushear tags ni publicar releases sin confirmación explícita.
