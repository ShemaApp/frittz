# 📘 Glosario — Productos de la Costa (Panel de Administración)

---

## 1. Arquitectura y Estructura General

| Término | Definición |
|---------|------------|
| **PWA (Progressive Web App)** | Aplicación web que funciona como app nativa: se instala en el dispositivo, funciona offline y tiene acceso a notificaciones push. En este proyecto, se empaqueta como TWA para la Play Store. |
| **App Shell** | Conjunto mínimo de archivos (HTML, CSS, JS) que conforman la interfaz base de la app. El Service Worker los cachea para carga instantánea sin internet. |
| **Scope global de nivel superior** | Patrón de desarrollo donde todos los archivos `.js` comparten el mismo espacio de nombres global. No hay `import`/`export`; el orden de carga de los `<script>` en `index.html` define qué puede usar qué. |
| **Sin build step** | La app no requiere un proceso de compilación (como Webpack o Vite). Se ejecuta directamente en el navegador usando Babel standalone para transpilar JSX en tiempo real. |
| **Babel standalone** | Versión de Babel que corre en el navegador, permitiendo usar JSX y ES6+ sin configurar un bundler. Se carga vía CDN. |
| **Script clásico** | Archivo JavaScript cargado con `<script type="text/babel" src="...">`. A diferencia de los módulos ES (`type="module"`), todo lo declarado en la raíz queda disponible globalmente. |
| **Orden de carga fijo** | Secuencia obligatoria en que deben cargarse los archivos JS en `index.html`. Si un archivo usa una variable definida en otro, debe cargarse después. |

---

## 2. Archivos del Proyecto

| Archivo | Rol | Descripción |
|---------|-----|-------------|
| **`index.html`** | Esqueleto | Punto de entrada. Contiene el HTML base, los estilos CSS y la lista ordenada de `<script>` que carga toda la aplicación. |
| **`firebase-init.js`** | Inicialización | Configura y arranca Firebase (Auth + Firestore). Define las variables globales `auth` y `db`. Activa la persistencia offline. |
| **`app-core.js`** | Capa global / Librería interna | Define hooks (`useState`, `useEffect`), utilidades (`fmt`, `fDate`, `uid`), átomos de UI (`Card`, `BFill`, `Inp`, `Tag`), y componentes reutilizables (`Modal`, `PwInp`, `BarcodeScanner`). Es la "librería estándar" del proyecto. |
| **`auth.js`** | Módulo de autenticación | Componentes `Login`, `PinPad` y `PinLock`. Maneja el inicio de sesión con Firebase Auth y el candado local por PIN. |
| **`dashboard.js`** | Pantalla de inicio | Componentes `StatTile` y `Dashboard`. Muestra estadísticas y resumen general del negocio. |
| **`productos.js`** | Inventario | Componentes `InventarioHistorial` y `Productos`. Gestión del catálogo de productos y su historial de movimientos. |
| **`clientes.js`** | Clientes | Componente `Clientes`. Administración de la base de datos de clientes. |
| **`pedidos.js`** | Pedidos | Componente `CrearNota`. Creación y gestión de pedidos/notas de venta. |
| **`creditos.js`** | Créditos | Componente `Creditos`. Control de ventas a crédito y cobranza. |
| **`ruta.js`** | Rutas de reparto | Componente `RutaReparto`. Carga del camión y registro de entregas en ruta. |
| **`config.js`** | Configuración | Componente `Configuracion`. Perfil de usuario, cambio de contraseña, PIN de acceso rápido y administración de usuarios. |
| **`app.js`** | Layout raíz | Componente `App`. Define el layout principal (tabs, enrutamiento interno) y monta todos los componentes de pantalla. Debe cargarse al final porque depende de todo lo anterior. |
| **`rutas-repartidores.js`** | Módulo avanzado de reparto | Rutas programadas, mapa en vivo, escaneo de QR de cliente, inventario en ruta, devoluciones, respaldo y reportes. Se monta de forma independiente. |
| **`gerencia.js`** | Módulo de gerencia | Gastos generales y conciliación de caja. Control financiero del negocio. |
| **`sw.js`** | Service Worker | Script que intercepta las peticiones de red y sirve el App Shell desde caché cuando no hay internet. |
| **`manifest.json`** | Manifiesto PWA | Archivo JSON con metadatos de la app (nombre, íconos, color, modo de pantalla) necesarios para la instalación como PWA. |
| **`firestore.rules`** | Reglas de seguridad | Define quién puede leer/escribir qué datos en Firestore. Se sube manualmente desde Firebase Console. |

---

## 3. Firebase y Backend

| Término | Definición |
|---------|------------|
| **Firebase** | Plataforma de Google que proporciona backend como servicio. En este proyecto se usan Authentication (Auth) y Firestore (base de datos NoSQL). |
| **Firebase Auth** | Servicio de autenticación de Firebase. Maneja el registro e inicio de sesión de usuarios con correo y contraseña. |
| **Firestore** | Base de datos NoSQL documental de Firebase. Almacena productos, clientes, pedidos, créditos, usuarios, etc. en colecciones de documentos. |
| **`enablePersistence()`** | Función de Firestore que activa el almacenamiento local en el navegador. Permite que la app funcione offline: lee/escribe datos locales y sincroniza cuando recupera conexión. |
| **`firebaseConfig`** | Objeto JavaScript con las credenciales del proyecto de Firebase (API key, project ID, etc.). Se obtiene de Firebase Console y se pega en `firebase-init.js`. |
| **`auth` (global)** | Instancia inicializada de Firebase Authentication. Disponible globalmente tras cargar `firebase-init.js`. |
| **`db` (global)** | Instancia inicializada de Firestore. Disponible globalmente tras cargar `firebase-init.js`. |
| **Reglas de seguridad (`firestore.rules`)** | Archivo que define políticas de acceso a Firestore. Por ejemplo: solo usuarios autenticados pueden leer/escribir, o solo admins pueden modificar ciertos documentos. |
| **Firebase Hosting** | Servicio de hosting estático de Firebase. Se menciona como opción gratuita para publicar la PWA con HTTPS, requisito para TWA. |

---

## 4. Componentes y Átomos de UI

| Término | Definición |
|---------|------------|
| **Átomo de UI** | Componente React pequeño y reutilizable definido en `app-core.js`. Actúa como bloque de construcción para pantallas más complejas. |
| **`Card`** | Átomo de UI. Contenedor visual con estilo de tarjeta (bordes redondeados, sombra, padding). |
| **`BFill`** | Átomo de UI. Botón de acción principal ("fill" = relleno). |
| **`Inp`** | Átomo de UI. Campo de entrada de texto/input estilizado. |
| **`Tag`** | Átomo de UI. Etiqueta visual tipo "chip" o "badge" para mostrar estados o categorías. |
| **`Modal`** | Componente reutilizable de `app-core.js`. Ventana emergente (diálogo) que se superpone al contenido principal. |
| **`PwInp`** | Componente de `app-core.js`. Campo de entrada para contraseñas con funcionalidad de mostrar/ocultar texto. |
| **`BarcodeScanner`** | Componente de `app-core.js`. Integración con la cámara del dispositivo para escanear códigos de barras de productos. |
| **`StatTile`** | Componente de `dashboard.js`. Mosaico visual que muestra una estadística numérica (ej. ventas del día, productos en stock). |
| **`PinPad`** | Componente de `auth.js`. Teclado numérico virtual para ingresar el PIN de acceso rápido. |
| **`PinLock`** | Componente de `auth.js`. Pantalla de bloqueo que aparece cuando la sesión se inactiva y requiere el PIN para desbloquear. |

---

## 5. Funcionalidades del Negocio

| Término | Definición |
|---------|------------|
| **Gestión de productos** | CRUD (Crear, Leer, Actualizar, Eliminar) del catálogo de productos. Incluye historial de movimientos de inventario (`InventarioHistorial`). |
| **Gestión de clientes** | Administración de la base de datos de clientes del negocio. |
| **Pedidos / Notas** | Creación de órdenes de venta. El componente se llama `CrearNota`, sugiriendo que genera notas de remisión o tickets de venta. |
| **Créditos** | Sistema de ventas a crédito: registra deudas de clientes, montos pendientes y pagos parciales o totales. |
| **Rutas de reparto** | Planificación y ejecución de entregas. Incluye: carga del camión, registro de entregas realizadas, rutas programadas, mapa en vivo y QR de cliente. |
| **Mapa en vivo** | Funcionalidad dentro de `rutas-repartidores.js` que muestra la ubicación geográfica en tiempo real durante el reparto. |
| **QR de cliente** | Código QR asociado a cada cliente, escaneable por el repartidor para confirmar identidad y registrar la entrega. |
| **Inventario en ruta / Devoluciones** | Control de productos que salen con el repartidor y los que regresan (no entregados o devueltos). |
| **Gastos generales** | Registro de egresos del negocio (combustible, mantenimiento, suministros, etc.) dentro del módulo `gerencia.js`. |
| **Conciliación de caja** | Proceso de cuadrar los ingresos y egresos registrados contra el efectivo real en caja. Parte del módulo de gerencia. |
| **Respaldo y reportes** | Generación de copias de seguridad de datos y reportes operativos, disponible en el módulo de repartidores. |

---

## 6. Seguridad y Autenticación

| Término | Definición |
|---------|------------|
| **PIN de acceso rápido** | Mecanismo de bloqueo local del dispositivo. No es autenticación de Firebase; es un candado adicional para proteger la app en el teléfono/tablet del usuario. |
| **Hash SHA-256 con sal** | Método criptográfico para almacenar el PIN de forma segura. El PIN real nunca se guarda; solo se guarda su hash. La "sal" es un valor aleatorio que evita ataques de diccionario. Se almacena en `localStorage`. |
| **`localStorage`** | Almacenamiento persistente del navegador. Aquí se guarda el hash del PIN (solo en ese dispositivo). |
| **Rol `admin`** | Rol de usuario con permisos completos: ve todas las secciones, administra usuarios y configura el sistema. |
| **Rol `usuario`** | Rol de usuario con permisos limitados. No puede dar de alta nuevos usuarios ni acceder a configuraciones avanzadas. |
| **`usuarios/{uid}.role`** | Campo en Firestore que define el rol de un usuario. `uid` es el identificador único asignado por Firebase Auth. |
| **Separación de roles finos** | Mejora pendiente: actualmente solo hay `admin` y `usuario`, pero se planea crear roles más específicos (vendedor, cocinero, repartidor, etc.). |

---

## 7. Técnico / Desarrollo Web

| Término | Definición |
|---------|------------|
| **Service Worker (`sw.js`)** | Script que corre en segundo plano, independiente de la página web. Intercepta peticiones de red, cachea recursos y permite funcionalidad offline. |
| **`SHELL_URLS`** | Array dentro de `sw.js` que lista todos los archivos que conforman el App Shell. El Service Worker los descarga y guarda en caché durante la instalación. |
| **`CACHE_NAME`** | Nombre identificador de la caché del Service Worker. **Debe incrementarse** (ej. `v10` → `v11`) cada vez que se actualiza un archivo en `SHELL_URLS`, para forzar la descarga de la nueva versión en los dispositivos. |
| **Persistencia offline** | Capacidad de la app de seguir funcionando sin conexión a internet. Se logra en dos niveles: Service Worker (cachea la app) y Firestore (cachea los datos). |
| **React vía Babel standalone** | Forma de usar React sin configurar un entorno de desarrollo local. Babel transpila JSX a JavaScript estándar directamente en el navegador del usuario. |
| **Hooks de React** | Funciones de React definidas manualmente en `app-core.js` (`useState`, `useEffect`) para manejar estado y efectos secundarios en componentes funcionales. |
| **`fmt`** | Utilidad global de formato. Probablemente formatea números, moneda o fechas para mostrar en la UI. |
| **`fDate`** | Utilidad global para formatear fechas. Convierte timestamps de Firestore a cadenas legibles. |
| **`uid`** | Utilidad global para generar identificadores únicos, probablemente usando `crypto.randomUUID()` o similar. |
| **CDN (Content Delivery Network)** | Red de servidores que distribuye librerías (React, Babel, Firebase SDK) desde ubicaciones cercanas al usuario. En este proyecto, se cargan React y Babel desde CDN. |

---

## 8. Despliegue y Distribución

| Término | Definición |
|---------|------------|
| **Trusted Web Activity (TWA)** | Tecnología de Google que empaqueta una PWA como una app nativa de Android. La app se descarga de Play Store pero en realidad es el navegador Chrome corriendo la web en pantalla completa. |
| **PWABuilder** | Herramienta web de Microsoft que genera automáticamente el paquete Android (`.aab`) a partir de una PWA. Usa Bubblewrap (de Google) internamente. |
| **Bubblewrap** | Herramienta de línea de comandos de Google para crear paquetes TWA. PWABuilder la usa por debajo sin que el desarrollador necesite ejecutarla manualmente. |
| **`.aab` (Android App Bundle)** | Formato de publicación de apps en Google Play. Es más eficiente que `.apk` porque Google genera versiones optimizadas para cada dispositivo. |
| **`assetlinks.json`** | Archivo JSON que se coloca en el dominio web para verificar la propiedad del sitio. Google Play lo usa para confirmar que la app TWA pertenece al dominio indicado. |
| **Google Play Console** | Plataforma para publicar apps en Google Play Store. Requiere una cuenta de desarrollador (pago único de $25 USD). |
| **Capacitor / Cordova** | Frameworks para convertir apps web en apps nativas multiplataforma. Se mencionan como alternativa si se requiere publicar en la App Store de Apple, ya que Apple no acepta TWAs. |
| **HTTPS** | Protocolo de comunicación segura. Es obligatorio para PWAs, Service Workers y TWAs. Firebase Hosting lo proporciona automáticamente. |

---

## 9. Utilidades y Datos

| Término | Definición |
|---------|------------|
| **Datos semilla** | Conjunto de datos de ejemplo o iniciales definidos en `app-core.js` para poblar la base de datos o facilitar pruebas durante el desarrollo. |
| **Íconos** | Conjunto de iconos definidos en `app-core.js` (probablemente como componentes SVG o referencias a una librería de iconos) para uso consistente en toda la app. |
| **CRUD** | Acrónimo de *Create, Read, Update, Delete* (Crear, Leer, Actualizar, Eliminar). Operaciones básicas de gestión de datos aplicables a productos, clientes, usuarios, etc. |
| **IIFE (Immediately Invoked Function Expression)** | Patrón de JavaScript `(function(){...})()` que crea un scope privado. El README menciona que los componentes NO deben envolverse en IIFE si `app.js` necesita usarlos, porque rompería la visibilidad global. |

---