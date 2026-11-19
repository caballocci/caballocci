# Seguridad

## Reporte responsable

No publiques detalles de una vulnerabilidad explotable en un issue. Usa un reporte privado desde **Security > Advisories > Report a vulnerability** en el repositorio de GitHub:

https://github.com/gattocci/caballocci/security/advisories/new

Incluye la versión afectada, pasos de reproducción, impacto y cualquier mitigación conocida. No incluyas bases SQLite, archivos multimedia ni otros datos personales en el reporte.

## Modelo de seguridad

- El renderer no tiene `nodeIntegration`, usa `contextIsolation` y ejecuta con sandbox.
- Preload expone una API cerrada; main valida la ventana, el frame, el origen y los argumentos de cada solicitud IPC.
- La navegación, las ventanas nuevas y los webviews se bloquean.
- La Content Security Policy limita scripts, contenido embebido y conexiones.
- Las rutas abiertas por el sistema provienen de directorios internos o de registros multimedia guardados en SQLite, no de rutas arbitrarias recibidas por IPC.
- SQLite se persiste fuera de la instalación y se respalda antes de migraciones e instalaciones de actualizaciones.
- GitHub Actions se fija por SHA y publica exclusivamente desde etiquetas `v*`.

## Límites conocidos

Los instaladores actuales no están firmados. Windows puede mostrar SmartScreen y `electron-updater` no puede validar un editor mediante certificado; la integridad de la descarga se apoya en HTTPS y el hash de `latest.yml`. Descarga únicamente desde `https://github.com/gattocci/caballocci/releases`.

Las dependencias deben revisarse antes de cada Release con:

```powershell
npm.cmd audit --omit=dev
npm.cmd audit
```

No ejecutes `npm audit fix --force` sin revisar los cambios mayores que propone.
