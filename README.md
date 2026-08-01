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
- **`rutas-repartidores.js`** es una pestaña más dentro de `<App/>` (igual
  que `productos.js`, `ruta.js`, etc.) — recibe `productos`, `clientes` y
  `rutas` como props ya suscritos por `app.js`, sin listeners propios
  duplicados. Cubre ruteo, checklist de entrega, GPS, QR, conteo de
  inventario, devoluciones y reportes/backup de admin. Solo la ven `admin`
  y `repartidor` (control por permiso de pestaña + chequeo de rol interno).

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
- **Otras acciones**: usar la cámara (escanear QR de cliente en
  `rutas-repartidores.js`), descargar reportes en CSV, y cambiar su propia
  contraseña.

Los valores por defecto están en `TABS_DEFAULT_ROL` / `EDITA_DEFAULT_ROL` /
`ACCIONES_DEFAULT_ROL` (`app-core.js`); el admin los sobreescribe por
usuario, y eso se guarda en `usuarios/{uid}.permisos`.

Los dos primeros grupos ("tabs" y "edita") **están reflejados en
`firestore.rules`** (función `permisoEdicion()`) — no son solo un filtro de
interfaz, Firestore los hace cumplir del lado del servidor. El tercer grupo
("acciones": cámara, CSV, contraseña) es puramente de interfaz/dispositivo —
no hay una escritura de Firestore equivalente que una regla pueda proteger,
así que dependen de que el propio código de la app los respete.

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

## Nota: cómo funcionan los QR de clientes

- El QR de un cliente codifica siempre `PDLC-CLIENTE:` + el **ID del
  documento** de ese cliente en Firestore. Ese ID se asigna una sola vez al
  crear el cliente y no cambia — así que el QR tampoco cambia mientras no
  borres y vuelvas a crear al cliente.
- La generación es determinística (misma librería, mismo texto de entrada,
  mismo tamaño): da igual en qué dispositivo lo generes o imprimas, siempre
  sale el mismo patrón.
- **No hay ninguna imagen de QR guardada en Firestore ni en ningún otro
  lado.** Cada vez que se abre el modal de un cliente o se usa "Imprimir
  seleccionados", el QR se dibuja al vuelo en un `<canvas>` temporal a partir
  del ID — es cálculo local, no lectura ni escritura de datos. Imprimir 1 vez
  o 500 veces da el mismo resultado y no modifica nada.

## Observaciones sobre `rutas-repartidores.js`

Notas técnicas que salieron de revisar el archivo a fondo, útiles para quien
lo mantenga después:

- **Dos colecciones relacionadas, no una.** Este archivo trabaja con
  `rutas` (creada por `ruta.js` al "cargar camión": productos cargados +
  entregas — lo que usan `guiaHTML`/`imprimirGuia`/`waGuiaLink` para el
  comprobante) y con `rutas_meta`, su propia colección, para la asignación de
  repartidor, GPS y checklist de paradas. Son complementarias: una ruta real
  de trabajo normalmente tiene un documento en cada colección.
- **Los enlaces de WhatsApp asumen número mexicano.** `waGuiaLink` y
  `waVentaLink` anteponen `52` cuando el teléfono tiene 10 dígitos y no trae
  ya un código de país. Si Productos de la Costa reparte fuera de México (o
  algún cliente tiene número de otro país), esos enlaces van a salir mal.
- **El seguimiento GPS en vivo (`iniciarSeguimiento`) no es "siempre
  activo".** Usa `navigator.geolocation.watchPosition`, limitado a máximo 1
  escritura cada 20 segundos. Esto solo funciona mientras el navegador
  mantiene la pestaña/app activa — la mayoría de navegadores móviles (Chrome
  incluido, así que también dentro de una TWA) suspenden estos watchers
  cuando se apaga la pantalla o la app pasa a segundo plano. Para rastreo
  verdaderamente continuo con la pantalla apagada haría falta un servicio en
  segundo plano nativo, que una TWA por sí sola no da.
- **Falta un permiso de "Compartir ubicación" en Permisos.** Se agregó el
  toggle de Cámara, pero no uno específico para el GPS en vivo — hoy
  cualquier repartidor con acceso al panel puede iniciar seguimiento. Si
  quieres controlarlo por persona, es la misma mecánica que ya existe para
  cámara/CSV/contraseña (`ACCIONES_INFO` en `app-core.js`).
- **El respaldo (`generarRespaldo`) es manual y local, no automático.**
  Descarga un `.json` con 9 colecciones completas al dispositivo de quien lo
  genera, y guarda la fecha en `_meta/backups` (por eso el aviso "sin
  respaldo hace N días" en la pantalla de inicio del panel). Si ese
  dispositivo se pierde antes de respaldar el archivo en otro lado, no hay
  copia. Para redundancia real conviene además programar las [exportaciones
  automáticas de Firestore a Cloud
  Storage](https://firebase.google.com/docs/firestore/manage-data/export-import)
  desde Firebase Console — eso corre solo, sin depender de que alguien toque
  un botón.
- **Los QR ya funcionan offline.** Tanto la librería de escaneo
  (`html5-qrcode`) como la de generación (`qrcode.min.js`, que se carga bajo
  demanda) están en la lista de precache de `sw.js`, así que ver/imprimir/
  escanear QR sigue funcionando sin conexión una vez que el service worker
  las cacheó la primera vez.

## Validación de ubicación en ventas de ruta

Compara, sin bloquear nunca la venta, si una entrega se hizo cerca del
domicilio registrado del cliente:

1. **El cliente tiene una ubicación registrada** (`clientes/{id}.ubicacion`,
   `{lat, lng, fecha}`): se captura al darlo de alta en el campo
   (`rutas-repartidores.js`, automático al crear) o manualmente desde
   Clientes en la app principal (`clientes.js`, botón "📍 Usar mi ubicación
   actual").
2. **Al completar una venta de ruta** — ya sea por escaneo de QR
   (`guardarVentaRapida`) o al confirmar una entrega de una parada planeada
   (`confirmarEntrega`) — se captura el GPS del repartidor en ese instante y
   se compara contra la ubicación del cliente con la fórmula de Haversine
   (`distanciaMetros` en `app-core.js`). Radio: `RADIO_VISITA_METROS = 150`
   (el mismo que usa el proyecto Sello, por consistencia).
3. **En la nota nunca se guarda la coordenada cruda del repartidor** — solo
   el resultado: `ubicacionVenta: { ok: true|false|null, distanciaM }`.
   `null` significa "no se pudo comparar" (cliente sin ubicación registrada,
   o GPS no disponible en ese momento) — no es una alerta, es falta de datos.
   Esto es intencional: no hay backend propio en esta app (ver la
   conversación sobre API keys), así que un "cifrado" real no existe aquí —
   simplemente no se guarda el dato sensible en primer lugar, que logra el
   mismo objetivo de forma más simple y honesta.
4. **Resumen para el admin**: dentro del panel de rutas → pestaña
   "Respaldo" → sub-pestaña **📍 Ubicación**. Elige una fecha, ve cuántas
   ventas concuerdan / no concuerdan / no tienen datos suficientes, y el
   detalle de cada venta fuera de rango. Puramente informativo — la venta ya
   se guardó, esto no la revierte ni la bloquea.

### Dos bugs más que aparecieron al construir esto (ya corregidos)

`guardarVentaRapida` y `confirmarEntrega` creaban la nota **sin el campo
`capturadoPorUid`**, que la regla de `notas` exige para poder crear
(`request.resource.data.capturadoPorUid == request.auth.uid`). Es decir:
**la venta por escaneo de QR y la confirmación de entregas de ruta llevaban
tiempo fallando al guardar**, con o sin este cambio de ubicación de por
medio. Ya corregido — ambas funciones ahora sí incluyen ese campo.

### Algo a tener en cuenta al probar (no es un bug, es el sistema de permisos funcionando)

Si un repartidor completa una venta **a crédito** desde el escaneo de QR o al
confirmar una entrega, esa acción también escribe en la colección
`creditos` — y esa escritura exige el permiso "Editar créditos"
(`permisoEdicion('creditos')` en `firestore.rules`), que **por default es
`false` para repartidor**. Como ambas escrituras van en el mismo `batch`,
si falta ese permiso **toda la venta falla, no solo el crédito** — el
repartidor va a ver un error al intentar guardar. Si tus repartidores venden
a crédito en la calle, actívales "Editar créditos" desde Configuración →
Permisos; si las ventas a crédito solo deben pasar por oficina, déjalo así a
propósito.

## Mapa offline (zona fija, descargada una vez)

Pestaña "🗺️ Mapa" del panel de rutas (admin) → sección **Mapa sin conexión**:

1. Navega el mapa en vivo (pan/zoom) hasta cubrir la zona/ciudad de reparto.
2. "📥 Descargar esta zona" — calcula todos los tiles (imágenes de mapa) de
   esa zona en un rango de zoom (nivel actual hasta +3, entre 12 y 17), y los
   descarga con 6 peticiones en paralelo. Antes de empezar te dice cuántos
   tiles son y el peso aproximado.
3. Los tiles se guardan en un cache del service worker aparte del cache del
   "shell" de la app (`distribupanel-tiles-v1`), justo para que **no se
   borren cada vez que actualizas la app** — el cache del shell sí se
   reemplaza en cada versión nueva, este no.
4. Una vez descargada, el mapa se ve sin internet dentro de esa zona — no
   hace falta ningún cambio en cómo Leaflet pide los tiles: el service
   worker los intercepta y responde desde el cache automáticamente.

### Limitaciones a tener claras

- **Es por dispositivo, no por cuenta.** El cache del service worker vive en
  el navegador de cada aparato. Si quieres que el teléfono de un repartidor
  tenga el mapa offline, ese teléfono necesita abrir esta pantalla y
  descargar la zona — no se sincroniza solo porque tú la descargaste en la
  oficina.
- **Hoy la pestaña "Mapa" (y por lo tanto la descarga) es solo para
  admin.** Si quieres que los repartidores puedan descargar el mapa desde
  sus propios teléfonos (probablemente lo más útil, ya que son quienes
  pierden señal en la calle), hay que abrirles acceso a esta pestaña —
  ahora mismo no lo tienen. Es un cambio chico, pendiente de que lo pidas.
- Se fijó el tile layer de Leaflet a un solo subdominio
  (`a.tile.openstreetmap.org`, antes rotaba entre `{s}`) — necesario para
  que las peticiones en vivo siempre coincidan con lo que se descargó
  offline. Si el mapa se ve raro/lento estando en línea, no es un bug: es
  este cambio a propósito.
- La descarga usa el servidor gratuito de OpenStreetMap. Por su política de
  uso, no conviene abusar de descargas masivas — por eso el límite de
  ~3,500 tiles por descarga (te lo avisa si te pasas: acércate más con el
  zoom). Si más adelante necesitas zonas grandes o muchos repartidores
  descargando seguido, vale la pena migrar a un proveedor con soporte
  offline dedicado (Mapbox/MapTiler, de pago).

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
