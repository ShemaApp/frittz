// firebase-init.js
// Configuración e inicialización de Firebase (Auth + Firestore).
// Script clásico (no módulo, no JSX) — se carga ANTES del <script type="text/babel">
// de index.html, así que `auth` y `db` quedan disponibles ahí como si fueran
// globales (los <script> clásicos comparten el mismo scope de nivel superior).
//
// Si mueves este proyecto a un dominio/hosting distinto de Firebase, este es
// el ÚNICO archivo que necesitas tocar para apuntar a otro proyecto de Firebase.
import { initializeApp } from "firebase/app";

const firebaseConfig = {
    apiKey: "AIzaSyDjWoF96LAykPqYlhvxGU57WXAdumEKhak",
    authDomain: "app-fritts-pdlc.firebaseapp.com",
    projectId: "app-fritts-pdlc",
    storageBucket: "app-fritts-pdlc.firebasestorage.app",
    messagingSenderId: "275135058300",
    appId: "1:275135058300:web:9209711a5584ed6eb254f9"
  };
const app = initializeApp(firebaseConfig);
if (typeof firebase === 'undefined') {
  document.getElementById('root').innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:28px;text-align:center;color:#1B1D19;font-family:system-ui,sans-serif"><div style="font-size:40px;margin-bottom:12px">⚠️</div><div style="font-weight:700;font-size:16px;margin-bottom:8px">No se pudo cargar Firebase</div><div style="font-size:13px;color:#585D53;max-width:300px">Revisa tu conexión a internet o intenta abrir esta página en Chrome/Safari en vez de un visor interno. Si el problema sigue, puede que tu red esté bloqueando cdn.jsdelivr.net.</div></div>';
  throw new Error('Firebase SDK no cargó');
}

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ── App Check ──
// Verifica que las lecturas/escrituras a Firestore vengan de esta app real
// (servida desde tu dominio), no de un script que copió firebaseConfig
// (que es pública por diseño — ver conversación anterior). Sigue
// funcionando dentro de una TWA porque la TWA sigue siendo Chrome real, no
// un WebView aparte.
//
// Pasos para activarlo de verdad:
//   1. Firebase Console → App Check → "Registrar" esta app web → elegir
//      proveedor "reCAPTCHA v3" → copiar la site key pública que te da y
//      pegarla abajo en APP_CHECK_SITE_KEY.
//   2. En producción (tu dominio real) empieza a funcionar solo, no hay que
//      tocar nada más.
//   3. En desarrollo local (localhost / IP local) reCAPTCHA v3 no valida
//      esos orígenes: App Check usa entonces un "token de depuración". La
//      primera vez que abras la app en local vas a ver en la consola del
//      navegador un mensaje con ese token — pégalo en Firebase Console →
//      App Check → esta app → "Manage debug tokens" y podrás seguir
//      trabajando en local sin que se bloqueen las peticiones.
//   4. Una vez que confirmes (en Firebase Console → App Check → métricas)
//      que las peticiones "verificadas" suben con normalidad, activa el
//      candado "Enforce" para Cloud Firestore en App Check → APIs. Antes de
//      eso App Check solo está *midiendo*, no bloqueando nada — es seguro
//      dejarlo así unos días para confirmar que no rompe a nadie.
const APP_CHECK_SITE_KEY = '6Led-nktAAAAAEQK6YGI3wzaSI0pEOmCw1iDGG45';

if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

if (APP_CHECK_SITE_KEY.startsWith('PEGA_AQUI')) {
  console.warn('⚠️ App Check no está activado todavía: falta pegar la site key de reCAPTCHA v3 en firebase-init.js (ver comentario arriba).');
} else {
  firebase.appCheck().activate(
    new firebase.appCheck.ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    /* isTokenAutoRefreshEnabled */ true
  );
}

// Persistencia offline: cachea los datos de Firestore en IndexedDB para que
// la app siga funcionando (leer productos, clientes, etc.) sin conexión.
db.enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Persistencia offline: solo se puede activar en una pestaña a la vez.');
    } else if (err.code === 'unimplemented') {
      console.warn('Este navegador no soporta persistencia offline.');
    }
  });
