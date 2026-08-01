# Frittz — Productos de la Costa

Panel de administración y reparto para Productos de la Costa: productos, clientes,
pedidos, créditos, rutas de reparto y gerencia. PWA de solo-cliente (sin backend
propio) sobre **React + Firebase Firestore**, sin paso de build — Babel se
transpila en el navegador (`type="text/babel"`).

## Arquitectura

- **Sin bundler.** Cada `.js` es un `<script type="text/babel">` cargado en
  orden desde `index.html`. React/ReactDOM/Firebase vienen de CDN.
- **Firebase compat SDK** (`firebase-app-compat`, `firebase-firestore-compat`,
  `firebase-auth-compat`) — ver `firebase-init.js`.
- **PWA offline-first**: `sw.js` precachea el shell (todos los `.js`,
  `index.html`, fuentes) para que la app cargue sin conexión; los datos siguen
  viniendo de Firestore (que ya maneja su propia caché/offline local).
- **`rutas-repartidores.js`** es un panel independiente que se monta en su
  propio nodo del DOM (no vive dentro del árbol de `<App/>` de `app.js`) —
  cubre ruteo, checklist de entrega, GPS, QR, conteo de inventario,
  devoluciones y reportes/backup de admin.

### Estructura de archivos

| Archivo | Contenido |
|---|---|
| `firebase-init.js` | Config e inicialización de Firebase |
| `app-core.js` | Átomos de UI compartidos (botones, inputs, `Toggle`, etc.) y el modelo de permisos (`permisoTabs`, `permisoEdita`) |
| `auth.js` | Login, PIN local, alta del primer usuario como admin |
| `app.js` | Shell principal: navegación por pestañas, `<App/>` |
| `dashboard.js` | Pantalla de inicio |
| `productos.js`, `clientes.js`, `pedidos.js`, `creditos.js`, `ruta.js` | Pantallas de cada pestaña |
| `gerencia.js` | Reportes financieros |
| `rutas-repartidores.js` | Panel de reparto avanzado (rutas, GPS, QR, inventario, devoluciones) |
| `config.js` | Configuración: perfil, contraseña, PIN, usuarios, **permisos** |
| `permisos.js` | Pantalla de gestión de permisos (admin) |
| `firestore.rules` | Reglas de seguridad de Firestore |
| `manifest.json`, `sw.js` | PWA (instalable, offline) |

## Roles y permisos

Tres roles: `admin`, `usuario` (staff de oficina), `repartidor`.

Desde **Configuración → 🔐 Permisos** (solo admin) se puede conceder o
retirar, por persona:

- **Lectura de pantallas** (pestañas visibles: Productos, Pedido, Clientes,
  Créditos, Ruta, Gerencia).
- **Edición de formularios** (alta/edición de productos y clientes, registrar
  abonos a créditos).

Los valores por defecto están en `TABS_DEFAULT_ROL` / `EDITA_DEFAULT_ROL`
(`app-core.js`); el admin los sobreescribe por usuario, y eso se guarda en
`usuarios/{uid}.permisos`. **Estos mismos permisos están reflejados en
`firestore.rules`** (función `permisoEdicion()`) — no son solo un filtro de
interfaz, Firestore los hace cumplir del lado del servidor.

## Firestore

Colecciones: `productos`, `clientes`, `notas` (pedidos), `creditos`, `rutas`,
`rutas_meta`, `devoluciones`, `inventario_historial`, `gastos`, `usuarios`,
`_meta`. Todo lo que no está explícitamente listado en `firestore.rules` se
deniega por defecto.

Para desplegar cambios en las reglas:

```bash
firebase deploy --only firestore:rules
```

o pegando el contenido de `firestore.rules` en **Firebase Console → Firestore
Database → Reglas**. Antes de publicar, pruébalas en la pestaña
**Playground** de la consola.

### Pendiente de seguridad (ver comentarios `TODO` en `firestore.rules`)

- `rutas` / `rutas_meta`: cualquier persona autenticada puede editar la ruta
  de cualquier repartidor, no solo la propia — falta que `ruta.js` guarde
  `repartidorId` al crear la ruta para poder exigir ownership en las reglas.
- **Firebase App Check** no está activado todavía. Es lo más importante que
  falta antes de publicar en producción: evita que alguien use la
  configuración pública de Firebase (`firebase-init.js`) fuera de la app real
  para automatizar lecturas/escrituras.

## Desarrollo local

No hay build. Sirve la carpeta con cualquier servidor estático, por ejemplo:

```bash
npx serve .
# o
firebase serve --only hosting
```

Firestore requiere HTTPS o `localhost` para Firebase Auth — ambos funcionan
para desarrollo.

---

## Empaquetado como app instalable (Android / TWA)

Una **TWA (Trusted Web Activity)** envuelve esta PWA en un `.apk`/`.aab`
instalable desde Play Store, usando Chrome como motor — no es un WebView
aparte, así que el rendimiento y las cookies/Firestore-cache son los mismos
que en el navegador.

### Requisitos antes de empaquetar

1. **La PWA debe estar servida en HTTPS**, en el dominio final (no
   `localhost`). Bubblewrap/PWABuilder leen `manifest.json` desde esa URL.
2. **`manifest.json` completo** (ya actualizado en este entregable): `id`,
   `name`, `start_url`, `scope`, `display: standalone`, `theme_color`,
   `background_color`, e íconos `192`, `512` y `512 maskable`.
3. **Los archivos de íconos deben existir de verdad** en `./icons/` en el
   servidor — este repo referencia `icon-192.png`, `icon-512.png` y
   `icon-512-maskable.png`, pero no los incluye. Bubblewrap falla si no los
   encuentra en la URL real.
4. **Service worker activo** (`sw.js`) — ya lo tienes.
5. Corre una auditoría **Lighthouse → PWA** en Chrome DevTools sobre el sitio
   ya desplegado; debe pasar el check de "installable".

### Paso a paso con Bubblewrap (recomendado)

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest="https://tu-dominio.com/manifest.json"
```

Esto te va a preguntar (o puedes editar después en `twa-manifest.json`):

- **Application ID** (paquete Android): usa dominio invertido, ej.
  `mx.productosdelacosta.frittz`.
- **App name / launcher name**.
- Genera un **keystore** (`android.keystore`) — **guárdalo y respáldalo**;
  si lo pierdes no puedes volver a firmar actualizaciones de la misma app.

Luego:

```bash
bubblewrap build
```

Produce `app-release-signed.apk` (para probar en un dispositivo) y el `.aab`
para subir a Play Store.

### Digital Asset Links (obligatorio para que no aparezca la barra de URL)

Sin esto, Android no confía en que tú controlas el dominio y muestra la app
dentro de una barra de navegador normal (deja de sentirse como app nativa).

1. Bubblewrap genera un `assetlinks.json` con el `sha256_cert_fingerprint` de
   tu keystore.
2. Súbelo, tal cual, a:
   `https://tu-dominio.com/.well-known/assetlinks.json`
3. Verifica que sea accesible públicamente (sin login) y con `Content-Type:
   application/json`.
4. Instala el `.apk` en un dispositivo Android real y confirma que abre **sin**
   barra de URL — eso confirma que el asset link quedó bien.

### Alternativa sin instalar nada: PWABuilder

[pwabuilder.com](https://www.pwabuilder.com) hace lo mismo desde el navegador:
metes la URL de tu PWA ya desplegada, te genera el paquete Android (con
Bubblewrap por debajo) y el `assetlinks.json` listo para subir. Útil si no
quieres instalar el CLI o para una primera prueba rápida.

### Publicar en Play Store

1. Cuenta de **Google Play Console** (pago único de registro).
2. Sube el `.aab` generado.
3. Llena la ficha de **Data safety**: esta app recolecta ubicación (GPS de
   reparto), datos de clientes y de negocio en Firestore — necesitas una
   **política de privacidad** publicada en una URL y enlazada ahí.
4. Cada actualización: sube nueva versión, incrementa `versionCode` en
   `twa-manifest.json`, y firma con el **mismo keystore**.

---

## App Check

`firebase-init.js` ya trae el código para activar **Firebase App Check** con
**reCAPTCHA v3**. Falta un solo paso manual para que quede funcionando:

1. **Firebase Console → App Check → Apps** → registra esta app web → elige
   proveedor **reCAPTCHA v3** → copia la *site key* pública que te da.
2. Pégala en `firebase-init.js`, en la constante `APP_CHECK_SITE_KEY`
   (reemplaza el placeholder `'PEGA_AQUI_TU_SITE_KEY_DE_RECAPTCHA_V3'`).
3. En local (`localhost`), App Check usa automáticamente un *token de
   depuración* — la consola del navegador te va a mostrar uno la primera vez
   que abras la app; pégalo en **App Check → tu app → Manage debug tokens**
   para poder seguir trabajando en desarrollo sin que se bloqueen las
   peticiones.
4. Deja correr la app así unos días. En **App Check → métricas** vas a ver
   qué porcentaje de las peticiones a Firestore llegan "verificadas". Con la
   site key puesta pero **sin** activar el candado de "Enforce", App Check
   solo mide — no bloquea nada, así que es seguro dejarlo así mientras
   confirmas que no rompe a nadie (por ejemplo, algún navegador raro sin
   soporte para reCAPTCHA v3).
5. Cuando el porcentaje verificado se vea sano, activa **Enforce** para
   **Cloud Firestore** en **App Check → APIs**. A partir de ahí, cualquier
   petición sin un token válido de App Check se rechaza — aunque tenga la
   API key correcta.

⚠️ Importante para cuando empaquetes como TWA: reCAPTCHA v3 sigue
funcionando porque una TWA sigue siendo Chrome real cargando tu sitio, no un
WebView aparte — no hace falta un proveedor distinto para Android.

## Roadmap / pendientes

- [x] Activar Firebase App Check *(código listo — falta pegar la site key de
      reCAPTCHA v3 y, más adelante, activar "Enforce" — ver sección arriba)*.
- [x] Separar "Ruta" (cargar camión, `ruta.js`) de "Rutas repartidores"
      (`rutas-repartidores.js`): la primera es exclusiva de admin; la segunda
      la ve el repartidor asignado (solo sus rutas) o admin (todas, para
      reasignar si el repartidor no se presenta a trabajar). Ownership real
      por `repartidorId` ya reflejado en `firestore.rules`.
- [x] **Bug corregido**: `rutas-repartidores.js` ya guarda `usuarioUid` en sus
      escrituras a `inventario_historial` (conteo de inventario y reingreso
      por devolución). La regla de esa colección también se relajó de
      "isStaff()" a "cualquier autenticado dueño del registro", porque ahora
      un repartidor también puede generar estos registros.
      ⚠️ Nota: esas dos acciones también actualizan `productos.stock` en el
      mismo batch, y esa escritura sí sigue exigiendo el permiso "Editar
      productos" (`permisoEdicion('productos')`). Por default un repartidor
      NO lo tiene — si vas a dejar que un repartidor haga conteos o
      devoluciones con reingreso, actívale ese permiso específico desde
      Configuración → Permisos, o esas acciones le van a fallar.
- [ ] Subir los archivos reales de `./icons/` al hosting.
- [ ] Redactar y publicar política de privacidad (requisito de Play Store por
      el uso de GPS).
- [ ] Generar y respaldar el keystore de firma antes del primer build de TWA.
