# Documentación — Productos de la Costa

Esta carpeta es solo lectura: instrucciones y enlaces para que tú (o quien
despliegue el proyecto) lo haga por su cuenta. Yo no ejecuté, desplegué ni
configuré nada de Firebase — eso requiere acceso a tu cuenta de Google/Firebase
Console, que yo no tengo.

## 1. Qué cambió en la estructura de archivos

Antes, la configuración de Firebase vivía mezclada dentro de `index.html`.
Ahora:

```
index.html          → la app (React vía Babel en el navegador)
firebase-init.js    → SOLO la config de Firebase + inicialización de Auth/Firestore
sw.js               → service worker (caché offline de la PWA)
manifest.json       → metadatos de instalación (íconos, colores, nombre)
rutas-repartidores.js → módulo de rutas/repartidores (sin cambios)
```

`index.html` carga `firebase-init.js` con un `<script src="./firebase-init.js">`
normal (no es un módulo, es un script clásico) **antes** del bloque
`<script type="text/babel">` que tiene el resto de la app. Por eso `auth` y
`db` (definidos en `firebase-init.js`) quedan disponibles como si fueran
variables globales para todo el resto del código — los `<script>` clásicos en
una misma página comparten ese scope de nivel superior.

**Si en algún momento cambias de proyecto de Firebase** (por ejemplo, para el
cliente final, o para separar "desarrollo" de "producción"), el único archivo
que necesitas tocar es `firebase-init.js` → el objeto `firebaseConfig` al
principio. Lo sacas de Firebase Console → ⚙️ Configuración del proyecto →
tus apps → SDK setup and configuration.

No extraje las llamadas a Firestore (`db.collection(...)`) de cada pantalla
(Productos, Clientes, etc.) a un archivo de "funciones" separado — son 34
llamadas repartidas dentro de cada componente, y no hay una capa de acceso a
datos centralizada que extraer. Si más adelante quieres esa capa (un solo
archivo tipo `db.js` con funciones como `guardarProducto()`,
`crearNota()`, etc.), es una refactorización más grande que puedo hacer, pero
es un paso aparte — dímelo cuando quieras encararlo.

## 2. El PIN de acceso rápido — qué es y qué NO es

Lo que agregué en el login (Configuración → 🔒 PIN) es un **candado local del
dispositivo**, no un método de autenticación de Firebase:

- Firebase ya mantiene la sesión iniciada entre visitas (persistencia local
  del SDK). Antes, cualquiera que abriera la app en ese teléfono/tablet
  entraba directo, sin pedir nada de nuevo.
- El PIN se guarda **solo en ese dispositivo** (`localStorage`), como un hash
  SHA-256 con sal — nunca en texto plano, nunca en Firebase.
- Al abrir la app con una sesión ya iniciada, si ese dispositivo tiene un PIN
  configurado, primero pide el PIN antes de mostrar cualquier dato. Si el PIN
  falla o lo olvidas, hay un botón "Usar contraseña en su lugar" que cierra la
  sesión y regresa al login normal de correo/contraseña.
- Es opcional: cada usuario lo activa o no desde Configuración → PIN.

No agregué "patrón" (dibujo tipo Android) — mencionaste ambas opciones pero el
PIN numérico fue lo que describiste con más detalle. Si también quieres el
patrón como alternativa, es una pantalla adicional relativamente sencilla de
agregar (mismo mecanismo de candado local, solo cambia la UI de entrada).

## 3. Documentación oficial de Firebase (para que tú la sigas)

- Resumen de Firestore: https://firebase.google.com/docs/firestore
- Reglas de seguridad — conceptos básicos: https://firebase.google.com/docs/rules/basics
- Reglas de seguridad + Authentication: https://firebase.google.com/docs/rules/rules-and-auth
- Condiciones de reglas de Firestore: https://firebase.google.com/docs/firestore/security/rules-conditions
- Firebase Authentication: https://firebase.google.com/docs/auth
- Firebase Hosting (para publicar `index.html` con HTTPS, dominio propio, etc.): https://firebase.google.com/docs/hosting
- Configuración del SDK web: https://firebase.google.com/docs/web/setup

El archivo `firestore.rules` que ya te entregué (de la sesión anterior) es el
que subes en Firebase Console → Firestore Database → Reglas — cópialo y pega,
no hace falta la CLI de Firebase para eso.

## 4. Camino a Play Store (si al cliente le gusta y quieren una app "de verdad")

Buena noticia: como ya es una PWA instalable (manifest + service worker +
íconos), **no hace falta reescribirla como app nativa**. El camino estándar de
Google es empaquetarla como **Trusted Web Activity (TWA)**:

1. La app tiene que estar publicada en un dominio con **HTTPS** (Firebase
   Hosting te lo da gratis y es lo más simple dado que ya usas Firebase).
2. Verificar que el Lighthouse score de PWA sea aceptable (manifest, service
   worker, offline, íconos 192/512 — la mayoría ya lo tienes).
3. Usar **PWABuilder** (https://www.pwabuilder.com) — metes la URL de tu PWA
   ya publicada, y te genera el paquete Android (usa la herramienta
   **Bubblewrap** de Google por debajo). No necesitas escribir Kotlin/Java.
4. Configurar **Digital Asset Links** (un archivo `assetlinks.json` en tu
   dominio) para que Android confirme que la app y el sitio son del mismo
   dueño — PWABuilder te guía en este paso.
5. Subir el `.aab` generado a Google Play Console (cuenta de desarrollador,
   pago único de $25 USD).

Para iOS: Apple **no acepta PWAs empaquetadas** en el App Store (las rechaza
como "sitio web repaquetado"). Si más adelante el cliente quiere estar en
ambas tiendas, ahí sí se necesitaría una app nativa o un wrapper tipo
Capacitor/Cordova — pero eso es una decisión para cuando llegue ese punto, no
algo que haga falta resolver ahora.

## 5. Qué NO hice (a propósito, para no gastar de más)

- No creé cuenta ni proyecto nuevo de Firebase, no toqué Firebase Console.
- No ejecuté ni desplegué nada (`firebase deploy`, Hosting, etc.).
- No armé el paquete Android/TWA — eso se hace en pwabuilder.com con la URL
  ya publicada, cuando decidas dar ese paso.
