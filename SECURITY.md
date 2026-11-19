# Política de seguridad

En caballocci tomamos en serio la seguridad de tus datos. Este documento describe qué versiones reciben soporte, cómo reportar un problema de forma privada y cuáles son las garantías y los límites técnicos de la aplicación.

## Versiones compatibles

Solo la última versión publicada recibe correcciones de seguridad.

| Versión | Estado |
| --- | --- |
| `0.5.x` (actual) | Compatible |
| `< 0.5` | Sin soporte |

Si usas una versión anterior, actualiza desde **Acerca de / Actualizaciones → Buscar actualización** antes de reportar un problema.

## Reportar una vulnerabilidad

**No abras un issue público** si el detalle permite explotar el problema. Usa el canal privado de GitHub: [Report a vulnerability](https://github.com/gattocci/caballocci/security/advisories/new).

Incluye, si puedes:

- Versión afectada y sistema operativo.
- Pasos de reproducción o prueba de concepto mínima.
- Impacto esperado (qué dato o proceso se ve afectado).
- Mitigación conocida, si existe.

**No adjuntes** bases SQLite, archivos multimedia ni otros datos personales: sustitúyelos por datos sintéticos.

El objetivo es acusar recibo lo antes posible y acordar un plazo de divulgación responsable antes de hacer público cualquier detalle.

## Alcance

**Dentro del alcance**

- Proceso principal de Electron y capa IPC: validación de remitente, origen y argumentos.
- Persistencia local (SQLite), migraciones y backups.
- Renderer y su Content Security Policy.
- Manejo de credenciales de fuentes y del flujo de actualizaciones.
- Flujo de publicación (GitHub Actions) y artefactos del release.

**Fuera del alcance**

- Vulnerabilidades en dependencias de terceros sin un vector de explotación demostrado en esta app (repórtalas upstream; aquí se registran como hallazgo de dependencias).
- Ataques que requieran acceso físico a un equipo desbloqueado o a la cuenta de Windows del usuario.
- La seguridad de los servidores externos que configures en *Fuentes*: la app actúa como cliente.
- Reportes puramente teóricos sin escenario de explotación.

## Modelo de seguridad

- **Renderer aislado:** `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true` y `allowRunningInsecureContent: false`. No se habilitan webviews.
- **API cerrada:** el preload expone solo lo necesario mediante `contextBridge`. Cada llamada IPC valida ventana, frame principal, origen y argumentos (`electron/ipc-validation.ts`).
- **Navegación restringida:** se bloquean las ventanas nuevas (`setWindowOpenHandler → deny`) y la navegación a URLs no confiables (`will-navigate`).
- **CSP estricta:** `default-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` y `frame-src 'none'`; multimedia solo desde orígenes propios, `blob:` y el esquema `caballocci-media:`.
- **Archivos del sistema:** las aperturas apuntan a directorios internos, registros multimedia guardados en SQLite o, en la función opcional de integraciones, a un ejecutable elegido por el usuario y validado por extensión (`.exe`, `.bat`, `.cmd`; solo Windows).
- **Persistencia:** la base de datos vive en el directorio `userData` del usuario (fuera de la carpeta de instalación) y se respalda automáticamente antes de las migraciones y de instalar actualizaciones.

## Datos y red

caballocci funciona sin conexión: el contenido, las notas y el multimedia se guardan localmente en SQLite. La actividad de red se limita a:

- **Actualizaciones:** consulta a la API de GitHub Releases y descarga del instalador. La descarga del APK se restringe a `https:` y al host `github.com`.
- **Fuentes de datos:** el usuario configura la URL y se admiten `http:` y `https:`. Las credenciales se cifran en reposo con `safeStorage` de Electron, se redactan en los mensajes de error y las respuestas tienen límite de tamaño (25 MB) y de tiempo de espera (30 s).
- **Sincronización móvil opcional:** la URL de la interfaz de Syncthing debe usar HTTP o HTTPS, tener host y no incluir credenciales.

No hay un servicio de telemetría propio ni envío automático del contenido local: toda comunicación deriva de una acción del usuario o de una fuente configurada por él.

## Firmado y verificación de actualizaciones

- El flujo de GitHub Actions compila y publica los artefactos exclusivamente desde etiquetas `v*`, con acciones fijadas por SHA.
- El instalador de Windows se configura para firmarse con el certificado de CI (`WINDOWS_CERTIFICATE_BASE64` y `WINDOWS_CERTIFICATE_PASSWORD`, inyectados como `CSC_LINK` y `CSC_KEY_PASSWORD`).
- El updater declara `verifyUpdateCodeSignature: false`: no exige la firma del publicador al aplicar una actualización. La integridad de la descarga se apoya en HTTPS, el hash SHA-512 publicado en `latest.yml` y el hecho de que los assets solo se publican desde este repositorio.
- Descarga siempre desde [GitHub Releases](https://github.com/gattocci/caballocci/releases). Si Windows muestra SmartScreen, verifica el origen antes de continuar.

## Dependencias

Antes de cada release se revisan las dependencias con:

```powershell
npm.cmd audit --omit=dev
npm.cmd audit
```

No ejecutes `npm audit fix --force` sin revisar los cambios mayores que propone.

## Recursos relacionados

- [Proceso de release](docs/RELEASING.md)
- [Guía de contribución](CONTRIBUTING.md)
- [Guía para agentes](AGENTS.md)
