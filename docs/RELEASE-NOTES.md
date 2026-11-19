# Formato de las notas de versión

Este documento define cómo deben escribirse las notas de versión (release notes) de caballocci para que funcionen correctamente en todos los lugares donde se leen. Síguelo siempre: generar unas notas compatibles por accidente no es una opción aceptable.

## Dónde se leen las notas

| Consumidor | Qué ve | Requisito |
| --- | --- | --- |
| Web de GitHub (página del release) | El `body` de la Release, renderizado como GitHub Flavored Markdown (GFM) | Markdown GFM válido, sin HTML crudo problemático |
| App de escritorio (modal «Actualización disponible») | `releaseNotes` = `body` del release, renderizado como markdown sin HTML crudo; la UI quita encabezados duplicados y usa el primer párrafo como resumen | Ver «Reglas de compatibilidad» |
| App de escritorio (Acerca de / Actualizaciones) | El mismo texto, en un bloque «Ver novedades» | Idem |
| App Android complementaria | No lee el cuerpo del release; solo consulta `GET /releases/latest` para el `version`, `minimumSupportedVersion`, el asset `caballocci-android.apk` y `releaseUrl` | Sin requisitos sobre el texto del cuerpo |
| `electron-updater` (feed de actualización) | Compara versiones vía `latest.yml`; el texto de las notas viaja en el `body` del release | El `body` puede ir vacío, pero entonces el modal oculta la sección de novedades: no es deseable |

El instalador y `latest.yml` llevan la versión en `version` y debe coincidir con la etiqueta (`scripts/verify-release.mjs` lo valida en CI: etiqueta `vX.Y.Z` === `package.json` version raíz; la versión móvil sale de `companion-apps/mobile-sync/package.json` y de ahí se deriva `versionCode`).

## Reglas de contenido

1. **Idioma y tono.** Español, mismo tono que el README: claro, concreto, sin marketing exagerado. Identificadores y términos de código en inglés tal como aparecen en el código (`stackPosts`, `ApplyFieldsDialog`); no se traducen.
2. **Sin H1.** El título de la Release ya muestra `caballocci X.Y.Z`; no repitas `# caballocci X.Y.Z` dentro del cuerpo. La app lo eliminaría igualmente.
3. **Sin encabezado genérico inicial.** No abras con `## Novedades` / `What's new` / `Changelog`: la app los elimina (son redundantes con el resto de la UI) y GitHub tampoco los necesita.
4. **Primer párrafo = resumen.** Abre con un párrafo único de 2–3 líneas que responda qué hay de nuevo. La app lo muestra como resumen antes de que el usuario expanda el changelog completo. No lo dupliques después.
5. **Estructura con `##` y `###`.** Secciones en español en infinitivo/sustantivo (`## Pilas de publicaciones en el tablero`, `## Correcciones`, `## Instalación y actualización`). Máximo tres niveles (`##` y `###`); evita `#` y `####`.
6. **Listas.** `-` para viñetas; frases cortas; una idea por viñeta. Las viñetas de «Lo que cambió» deben describir el resultado para el usuario, no solo el commit.
7. **Formato permitido:** encabezados `##`/`###`, párrafos, **negrita** / `código`, listas, enlaces `https://`, bloques de código con ``` , tablas GFM estrechas.
8. **Prohibido:**
   - HTML crudo (`<div>`, `<img>`, `<br>`, comentarios HTML). La app no renderiza HTML: lo escapa o lo elimina; GitHub lo muestra literal.
   - Enlaces `javascript:` o con protocolo no `https`.
   - Imágenes externas (las notas están pensadas para leerse offline en la app; las imágenes no cargarían y GitHub las expondría a terceros).
   - Spoilers, datos personales, rutas locales absolutas de tu máquina, credenciales, URLs de intranet.
   - Contenido de borrador o menciones a tareas internas sin contexto para el usuario.
   - Repetir la versión en el cuerpo más allá de la introducción.
9. **Longitud.** Objetivo: 40–80 líneas. El modal tiene área con scroll y letra ≥ 14 px, pero las notas se leen de un vistazo; lo esencial va en el primer párrafo y las primeras secciones.
10. **Migraciones.** Si la versión incluye una migración de base de datos, indícalo explícitamente en la introducción o en una sección propia (p. ej. «Migración v34»), con el comportamiento real (automática, con backup previo). No lo supongas: verifícalo en `electron/database/migrations.ts`.
11. **Honestidad.** No prometer funciones que no estén en los commits de la versión. Revisa `git log vPREV...vACTUAL` antes de escribir.

## Estructura recomendada (plantilla)

```markdown
<Un párrafo de 2–3 líneas: qué estrena esta versión y a quién le importa.>

## <Sección de funciones principales>
- <Qué puede hacer el usuario ahora>
- <Detalle y dónde encontrarlo>

## <Segunda sección de funciones, si aplica>
- ...

## Correcciones
- <Problema corregido, en lenguaje de usuario>

## App Android complementaria (vX.Y.Z)   <!-- solo si cambia la app o se publica APK -->
- <Qué cambia y qué asset la acompaña>

## Instalación y actualización
- Descarga `caballocci-Setup-X.Y.Z-x64.exe` desde Assets. Los instaladores no están firmados: Windows puede mostrar SmartScreen; verifica el origen.
- Desde la app: Acerca de / Actualizaciones. Se crea un backup automático antes de actualizar.

## Changelog completo
- [`CHANGELOG.md`](https://github.com/gattocci/caballocci/blob/main/CHANGELOG.md) · [compare vPREV...vX.Y.Z](https://github.com/gattocci/caballocci/compare/vPREV...vX.Y.Z)
```

## Proceso de publicación y dónde encajan las notas

1. Prepara la rama y sube la versión: bumpea `package.json` raíz y `companion-apps/mobile-sync/package.json` (y sus locks) a `X.Y.Z`; añade la sección a `CHANGELOG.md`; `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`.
2. Commit `chore: vX.Y.Z` en la rama de trabajo; merge a `main` con `--no-ff` (`merge: release vX.Y.Z`); tag anotado `vX.Y.Z` en `main`; push de `main` y del tag.
3. El workflow `Release Windows` (se dispara con el tag `v*`) compila el APK y el instalador, verifica los artefactos y **crea el GitHub Release con notas auto-generadas**. Esas notas NO son válidas para publicar: sustitúyelas.
4. Sustituye el cuerpo del release por las notas siguiendo este formato. Dos vías:
   - manual: GitHub → el release → Edit → pegar las notas → Update; o
   - con API: `PATCH /repos/gattocci/caballocci/releases/:id` con `{"body": "..."}` y verifica leyendo el cuerpo de vuelta (debe quedar no vacío y con el primer párrafo que escribiste).
5. Verifica después: los 5 assets (`caballocci-Setup-X.Y.Z-x64.exe`, `.blockmap`, `latest.yml`, `caballocci-android.apk`, `caballocci-android.json`), `latest.yml` con `version: X.Y.Z`, y que el `body` cumple las reglas 2–5 de este documento.

## Qué acepta la app (resumen ejecutable de las reglas)

Al procesar el `body`, el escritorio:

1. Normaliza saltos de línea y elimina BOM.
2. Elimina un encabezado ATX inicial cuyo texto coincida con la etiqueta/nombre del release (`# caballocci X.Y.Z`, `# vX.Y.Z`, ...).
3. Elimina un encabezado inicial genérico (`Novedades`, `What's new`, `Changelog`, `Release notes`, ...).
4. Toma el primer párrafo no vacío como resumen (o las primeras 3 viñetas si el cuerpo empieza por una lista).
5. Renderiza el resto como markdown GFM con HTML crudo deshabilitado. Si el cuerpo queda vacío tras la limpieza, la sección de novedades no se muestra.

Por tanto: si respetas la plantilla, las notas se ven bien en GitHub y en la app sin tocar código.

## Ejemplo

El release actual `v0.5.0` y el archivo de notas usado en su publicación son la referencia práctica de este formato (párrafo de resumen → secciones `##` → assets → enlace de compare). Para la siguiente versión, parte de ese archivo y actualiza: introducción, secciones, migraciones (si las hay), versión del APK y enlace de compare.
