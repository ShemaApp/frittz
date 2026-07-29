// firebase-init.js
// Configuración e inicialización de Firebase (Auth + Firestore).
// Script clásico (no módulo, no JSX) — se carga ANTES del <script type="text/babel">
// de index.html, así que `auth` y `db` quedan disponibles ahí como si fueran
// globales (los <script> clásicos comparten el mismo scope de nivel superior).
//
// Si mueves este proyecto a un dominio/hosting distinto de Firebase, este es
// el ÚNICO archivo que necesitas tocar para apuntar a otro proyecto de Firebase.

const firebaseConfig = {
    apiKey: "AIzaSyDjWoF96LAykPqYlhvxGU57WXAdumEKhak",
    authDomain: "app-fritts-pdlc.firebaseapp.com",
    projectId: "app-fritts-pdlc",
    storageBucket: "app-fritts-pdlc.firebasestorage.app",
    messagingSenderId: "275135058300",
    appId: "1:275135058300:web:9209711a5584ed6eb254f9"
  };

if (typeof firebase === 'undefined') {
  document.getElementById('root').innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:28px;text-align:center;color:#1B1D19;font-family:system-ui,sans-serif"><div style="font-size:40px;margin-bottom:12px">⚠️</div><div style="font-weight:700;font-size:16px;margin-bottom:8px">No se pudo cargar Firebase</div><div style="font-size:13px;color:#585D53;max-width:300px">Revisa tu conexión a internet o intenta abrir esta página en Chrome/Safari en vez de un visor interno. Si el problema sigue, puede que tu red esté bloqueando cdn.jsdelivr.net.</div></div>';
  throw new Error('Firebase SDK no cargó');
}

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

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
