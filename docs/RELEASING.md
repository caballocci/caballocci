# Proceso de release

Checklist operativo para publicar una versión de caballocci. El escritorio y la app Android complementaria **comparten el mismo número de versión**, así que siempre se bumpean juntos.

Para el formato del cuerpo del release, ver [Formato de las notas de versión](RELEASE-NOTES.md). Este documento cubre cómo llegar hasta el release publicado.

## Antes de empezar

- [ ] `git status --short` vacío: todos los cambios funcionales ya están commiteados en la rama de trabajo.
- [ ] `git fetch origin` y `main` apunta al mismo commit que `origin/main`.
- [ ] Identificar el tag anterior (`vPREV`) y el nuevo (`vNEW`, SemVer `X.Y.Z`).
- [ ] Revisar `git log vPREV..HEAD` para saber qué se publica y no prometer nada que no esté en los commits.
- [ ] No hace falta `gh` en local: el workflow de GitHub Actions usa `gh` dentro del runner.

## 1. Bumpear la versión a X.Y.Z

Cuatro archivos, sin excepciones:

| Archivo | Claves a cambiar |
| --- | --- |
| `package.json` | `"version": "X.Y.Z"` |
| `package-lock.json` | `"version"` de la raíz y `packages[""].version` |
| `companion-apps/mobile-sync/package.json` | `"version": "X.Y.Z"` |
| `companion-apps/mobile-sync/package-lock.json` | `"version"` de la raíz y `packages[""].version` |

`minimumSupportedVersion` de la app Android (`0.1.0`) **no se toca** salvo que haya un cambio real de compatibilidad.

La `versionCode` de Android se deriva sola en `android/app/build.gradle`:

```text
1000000 + major * 10000 + minor * 100 + patch
```

Por ejemplo, `0.5.1` → `1000501`.

## 2. Regenerar el CHANGELOG con auto-changelog

Se usa `auto-changelog` v2 vía `npx` (no está en `devDependencies`). Genera el changelog completo, pero **solo se inserta la sección nueva**: regenerar todo el archivo reordena y engorda las secciones históricas.

Desde la raíz del repo, en PowerShell:

```powershell
cmd.exe /c "npx.cmd --yes auto-changelog --stdout --template keepachangelog --commit-limit false --sort-commits date-desc --latest-version X.Y.Z > %TEMP%\changelog.md"
```

- `--latest-version X.Y.Z` es necesario: sin él, esta versión de `auto-changelog` no crea la sección aunque `package.json` ya esté bumpeado.
- `--commit-limit false` incluye **todos** los commits; con el valor por defecto solo salen 3.
- `--sort-commits date-desc` conserva el orden cronológico inverso que ya usa el archivo.
- Redirigir con `cmd.exe /c` y `>` (no con el `>` de PowerShell 5.1) para evitar UTF-16/texto dañado con acentos.

Copiar el bloque `## [vX.Y.Z](...compare/vPREV...vX.Y.Z)` completo (hasta el siguiente `## `) y pegarlo justo encima de la sección `vPREV` en `CHANGELOG.md`. Añadir ` - AAAA-MM-DD` al final del encabezado: `auto-changelog` no conoce la fecha hasta que existe el tag.

## 3. Escribir las notas del release

Crear `release/caballocci-vX.Y.Z-release-notes.md`. La carpeta `release/` está ignorada por git: es un archivo de trabajo local, no se commitea.

- Seguir [RELEASE-NOTES.md](RELEASE-NOTES.md) al pie de la letra: resumen en el primer párrafo, secciones `##`, sin H1, sin encabezado genérico inicial, sin HTML, sin imágenes y **sin rutas locales absolutas**.
- Si cambió `electron/database/migrations.ts`, dedicar una sección a la migración y verificar en `electron/database.ts` que se aplica con backup previo. No suponer el comportamiento.
- Si se publica APK, indicar la versión de la app Android y la `versionCode` calculada arriba.
- Cerrar con el enlace de compare `vPREV...vX.Y.Z`.

## 4. Validar antes de commitear

Todos deben terminar con código 0:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
node scripts/verify-release.mjs vX.Y.Z
npm.cmd audit --omit=dev
npm.cmd audit
```

`verify-release.mjs` comprueba que la etiqueta coincide con `package.json`. Los `audit` siguen la política de [SECURITY.md](../SECURITY.md): revisar los hallazgos y no aplicar `npm audit fix --force` sin revisar los cambios mayores.

## 5. Commit, merge, tag y push

En la rama de trabajo:

```powershell
git add CHANGELOG.md package.json package-lock.json companion-apps/mobile-sync/package.json companion-apps/mobile-sync/package-lock.json
git commit -m "chore: vX.Y.Z"
git checkout main
git merge --no-ff <rama-de-trabajo> -m "merge: release vX.Y.Z"
git tag -a vX.Y.Z -m "caballocci vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

El push del tag `v*` dispara el workflow `Release Windows`: compila el APK firmado, el instalador NSIS x64, verifica artefactos y crea el GitHub Release.

## 6. Sustituir el cuerpo del release

El workflow crea el release con `--generate-notes`. **Esas notas no son válidas**: hay que reemplazarlas.

Cuando el workflow termine:

1. Abrir `https://github.com/gattocci/caballocci/releases/tag/vX.Y.Z`.
2. Edit → borrar el cuerpo autogenerado → pegar el contenido de `release/caballocci-vX.Y.Z-release-notes.md` → Update release.
3. Releer el body: debe quedar no vacío y empezar por el párrafo de resumen.

Alternativa con API, si se decide automatizar:

```http
PATCH /repos/gattocci/caballocci/releases/:id
{"body": "..."}
```

Verificar siempre leyendo el cuerpo de vuelta. No guardar tokens en el repo ni imprimirlos en logs.

## 7. Verificación final

- [ ] El release `vX.Y.Z` existe y tiene los 5 assets: `caballocci-Setup-X.Y.Z-x64.exe`, `.blockmap`, `latest.yml`, `caballocci-android.apk` y `caballocci-android.json`.
- [ ] `latest.yml` contiene `version: X.Y.Z`.
- [ ] El `body` cumple las reglas 2–5 de [RELEASE-NOTES.md](RELEASE-NOTES.md) (sin título repetido, sin «Novedades», resumen primero, secciones `##`).
- [ ] `caballocci-android.json` y `companion-apps/mobile-sync/package.json` coinciden en `version` y `minimumSupportedVersion`.
- [ ] No se publicó ninguna ruta local absoluta, credencial ni URL de intranet.

## Problemas habituales

| Síntoma | Causa / solución |
| --- | --- |
| El changelog solo muestra 3 commits por release | Falta `--commit-limit false`. |
| Acentos mal codificados en el changelog generado | PowerShell 5.1 redirigió a UTF-16; usar `cmd.exe /c "... > archivo"`. |
| `verify-release.mjs` falla | El tag no coincide con `package.json`, o faltan artefactos si se usa `--artifacts`. |
| El release aparece con notas automáticas | Es normal: el workflow siempre usa `--generate-notes`; sustituir el body según el paso 6. |
| El modal de actualizaciones no muestra «novedades» | El body quedó vacío o solo con título/encabezado genérico; ver [RELEASE-NOTES.md](RELEASE-NOTES.md). |
