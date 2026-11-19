<div align="center">

<img src="build/icon.png" alt="caballocci" width="112" height="112" />

# caballocci

**Planificador de contenido offline-first para Instagram, Facebook y X.**<br>
Escritorio para Windows, con app complementaria para Android y sincronización por carpeta.

[![Release](https://img.shields.io/github/v/release/gattocci/caballocci?label=release&logo=github)](https://github.com/gattocci/caballocci/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/gattocci/caballocci/total?label=descargas&logo=github)](https://github.com/gattocci/caballocci/releases)
[![Workflow](https://github.com/gattocci/caballocci/actions/workflows/release-windows.yml/badge.svg)](https://github.com/gattocci/caballocci/actions/workflows/release-windows.yml)
[![Platform](https://img.shields.io/badge/plataforma-Windows%20x64-181510?logo=windows)](https://github.com/gattocci/caballocci/releases/latest)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)](https://www.electronjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[Descargar para Windows](#descargar) · [Funciones](#funciones) · [Desarrollo](#desarrollo) · [Documentación](#documentación)

</div>

---

## Índice

- [Descargar](#descargar)
- [¿Qué es caballocci?](#qué-es-caballocci)
- [Funciones](#funciones)
- [Cómo funciona el flujo con el celular](#cómo-funciona-el-flujo-con-el-celular)
- [Datos locales y privacidad](#datos-locales-y-privacidad)
- [Arquitectura](#arquitectura)
- [Desarrollo](#desarrollo)
- [Documentación](#documentación)
- [Seguridad](#seguridad)
- [Changelog](#changelog)

## Descargar

La instalación recomendada para usuarios es el instalador NSIS de la release más reciente:

**[Descargar caballocci para Windows](https://github.com/gattocci/caballocci/releases/latest)**

En la sección **Assets**, descarga **`caballocci-Setup-<version>-x64.exe`**.

> [!NOTE]
> Mientras el proyecto no disponga de certificado de firma de código, Windows puede mostrar una advertencia de SmartScreen. Verifica que el instalador provenga de [github.com/gattocci/caballocci](https://github.com/gattocci/caballocci) antes de ejecutarlo. Consulta la [política de seguridad](SECURITY.md) para más detalles.

Las actualizaciones posteriores se ofrecen dentro de **Acerca de / Actualizaciones**. Tanto la descarga como la instalación requieren confirmación explícita del usuario; antes de actualizar se crea un backup automático.

## ¿Qué es caballocci?

caballocci es una aplicación de escritorio **offline-first** para planificar y organizar contenido de redes sociales. No requiere cuenta, no depende de servicios en la nube y no publica automáticamente: la publicación es **manual y deliberada**, desde el celular o desde la red social de tu elección.

Está pensada para creadores y equipos pequeños que quieren:

- Un calendario editorial visual (timeline, calendario y Kanban) para diversos destinos (Instagram, Facebook, X, entre otras plataformas).
- Toda su biblioteca de medios y sus borradores en una base de datos local, bajo su control.
- IA local (sin enviar datos a terceros) para explorar y agrupar ideas.
- Un puente simple hacia el celular para publicar a mano con el material y el orden de carrusel correctos.

## Funciones

### Planificación
- **Timeline horizontal**, **calendario** y **tablero Kanban** sobre las mismas publicaciones.
- **Espacios** para organizar, filtrar y renombrar proyectos.
- **Grupos de trabajo** anidados y pilas de publicaciones para colecciones complejas.
- **Mapa conceptual persistente** para relacionar ideas, publicaciones y recursos generales.

### Editor y medios
- Editor con **vista previa** por red y **publicación manual**.
- **Biblioteca multimedia local** en modo copia o referencia.
- **Exportación de medios por publicación** al celular, respetando el orden del carrusel.
- **Fuentes externas**: importación de registros desde APIs REST/JSON, deduplicación por hash y exportación CSV configurable.

### Ideas e IA local
- Banco de ideas con **embeddings semánticos locales** (`multilingual-e5-small` vía `@huggingface/transformers`).
- **Clustering de ideas** y análisis de familias de patrones, todo en el dispositivo.

### Datos e infraestructura
- Base de datos **SQLite local** (sql.js) con **migraciones numeradas y transaccionales**.
- **Backups fechados** antes de migraciones y de instalaciones de actualización.
- **Actualizaciones desde GitHub Releases**, siempre confirmadas por el usuario.
- **Sin cuentas, sin nube, sin telemetría de contenido.**

## Cómo funciona el flujo con el celular

caballocci no publica por ti: exporta álbumes listos para usar desde el teléfono.

1. **Exportar en caballocci** — desde el editor (publicación abierta), desde el tablero (selección múltiple) o desde **Acerca de / Actualizaciones → Exportar todas las publicaciones**. Los álbumes quedan en `pc-outbox/publications/` y se registran en `pc-outbox/catalog.json`.
2. **Recibir y marcar en Android** — la app complementaria ([`companion-apps/mobile-sync`](companion-apps/mobile-sync)) muestra los destinos pendientes y permite marcarlos como usados.
3. **Importar en caballocci** — las confirmaciones en `android-inbox/<dispositivo>/` se importan y aparecen como `used` en el catálogo.

La transferencia usa una **carpeta compartida de Syncthing** en modo *Enviar y recibir* en ambos dispositivos. Incluye `caption.txt`, `manifest.json` y los medios en el orden visual del carrusel.

> [!IMPORTANT]
> No sincronices la base SQLite activa. El flujo de confirmación indica que una persona marcó el destino como usado; **no verifica** que la red social haya publicado el contenido.

Consulta [Sincronización móvil](docs/MOBILE-SYNC.md) para pasos y formatos detallados.

## Datos locales y privacidad

Los datos viven en el directorio `userData` de Electron, **fuera de la instalación**: reinstalar, actualizar o desinstalar la aplicación **no elimina** la base de datos, la biblioteca multimedia ni los backups.

| Dato | Ruta (Windows) |
| --- | --- |
| Base de datos | `%APPDATA%\caballocci\caballocci.sqlite` |
| Biblioteca copiada | `%APPDATA%\caballocci\Media` |
| Backups | `%APPDATA%\caballocci\Backups` |

En Windows, `userData` suele estar bajo `%APPDATA%\caballocci`; la ruta efectiva se muestra en **Acerca de / Actualizaciones**. La migración desde `content-planner.sqlite` (versiones anteriores) copia la base antigua sin eliminar el original.

## Arquitectura

Aplicación de escritorio con proceso principal Electron y renderer React, empaquetada con electron-builder (NSIS).

```text
electron/            Proceso principal: ventana, IPC, SQLite, updater, exportación
  database/          sql.js, migraciones, repositorios y persistencia atómica
  integrations/      Importación/exportación de fuentes externas
src/
  app/               Aplicación y estado global (Zustand)
  components/        Shell y componentes compartidos
  features/          timeline · calendario · Kanban · editor · biblioteca · ideas · mapa conceptual
  shared/            Contratos y tipos compartidos
companion-apps/
  mobile-sync/       App Android (Capacitor) que consume el catálogo exportado
```

Decisiones de diseño relevantes:

- **`contextIsolation` activado** y `nodeIntegration` deshabilitado; API mínima vía `preload.ts`.
- **Persistencia atómica**: escritura temporal + renombrado; backups fechados antes de migraciones y updates.
- **Validación de IPC** en el proceso principal (`electron/ipc-validation.ts`).

## Desarrollo

**Requisitos:** Windows, Git y Node.js 22 o posterior.

```powershell
git clone https://github.com/gattocci/caballocci.git
cd caballocci
npm.cmd ci
npm.cmd run dev
```

En desarrollo, **Acerca de / Actualizaciones** informa que el updater no está disponible (`electron-updater` solo se activa en aplicaciones empaquetadas).

Para validar y generar el instalador local:

```powershell
npm.cmd run typecheck   # verificación de tipos
npm.cmd test            # pruebas
npm.cmd run build       # build de producción
npm.cmd run dist:win    # instalador NSIS x64 en release/
```

`release/` está excluida de Git: los ejecutables se distribuyen mediante **GitHub Releases**, no dentro del historial del código fuente.

## Documentación

- [Sincronización móvil y formatos de intercambio](docs/MOBILE-SYNC.md)
- [Formato de las notas de versión](docs/RELEASE-NOTES.md)
- [Colecciones anidadas](docs/nested-collections.md)
- [Pilas de publicaciones](docs/post-stacks.md)
- [Política y modelo de seguridad](SECURITY.md)
- [Historial de cambios](CHANGELOG.md)

## Seguridad

Consulta [SECURITY.md](SECURITY.md) para la política de seguridad y el modelo de amenazas. Si encuentras una vulnerabilidad, sigue el procedimiento descrito allí en lugar de abrir un issue público.

## Changelog

Los cambios notables se documentan en [CHANGELOG.md](CHANGELOG.md) y en las [GitHub Releases](https://github.com/gattocci/caballocci/releases).

---

<div align="center">

**caballocci** © 2026 NU WAVE · Hecho para planificar sin depender de la nube.

</div>
