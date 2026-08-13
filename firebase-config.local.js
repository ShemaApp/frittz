/*
 * Plantilla de configuración local para Firebase.
 *
 * 1. Copia este archivo como `firebase-config.local.js`.
 * 2. Sustituye todos los valores por los de tu nuevo proyecto Firebase.
 * 3. No publiques `firebase-config.local.js` en el repositorio.
 *
 * La configuración web de Firebase identifica la aplicación cliente; no debe
 * contener claves privadas, credenciales de cuentas de servicio ni tokens de
 * administración. Esos valores deben mantenerse fuera de este proyecto.
 */
window.FIREBASE_CONFIG = {
   apiKey: "AIzaSyDjWoF96LAykPqYlhvxGU57WXAdumEKhak",
    authDomain: "app-fritts-pdlc.firebaseapp.com",
    projectId: "app-fritts-pdlc",
    storageBucket: "app-fritts-pdlc.firebasestorage.app",
    messagingSenderId: "275135058300",
    appId: "1:275135058300:web:9209711a5584ed6eb254f9"
  };

/*
 * Clave pública de reCAPTCHA v3 asociada a Firebase App Check.
 * Déjala vacía únicamente durante una configuración local temporal. Antes de
 * producción, registra la aplicación en App Check y configúrala aquí.
 */
window.FIREBASE_APP_CHECK_SITE_KEY = '6Led-nktAAAAAEQK6YGl3wzaSI0pEOmCw1iDGG45';
