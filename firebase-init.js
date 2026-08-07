const firebaseConfig = {
  apiKey: "AIzaSyDjWoF96LAykPqYlhvxGU57WXAdumEKhak",
  authDomain: "app-fritts-pdlc.firebaseapp.com",
  databaseURL: "https://app-fritts-pdlc-default-rtdb.firebaseio.com",
  projectId: "app-fritts-pdlc",
  storageBucket: "app-fritts-pdlc.firebasestorage.app",
  messagingSenderId: "275135058300",
  appId: "1:275135058300:web:dfaf877ce2f802c5b254f9"
};

// Validación de carga de SDK Compat
if (typeof firebase === 'undefined') {
  document.getElementById('root').innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:28px;text-align:center;color:#1B1D19;font-family:system-ui,sans-serif"><div style="font-size:40px;margin-bottom:12px">⚠️</div><div style="font-weight:700;font-size:16px;margin-bottom:8px">No se pudo cargar Firebase</div><div style="font-size:13px;color:#585D53;max-width:300px">Revisa tu conexión a internet o intenta abrir esta página en Chrome/Safari en vez de un visor interno. Si el problema sigue, puede que tu red esté bloqueando cdn.jsdelivr.net.</div></div>';
  throw new Error('Firebase SDK no cargó');
}

// Inicialización uniforme usando la sintaxis Compat
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ── App Check ──
const APP_CHECK_SITE_KEY = '6Led-nktAAAAAEQK6YGI3wzaSI0pEOmCw1iDGG45';

// Habilitar Debug Token ÚNICAMENTE en entorno local
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

if (APP_CHECK_SITE_KEY.startsWith('PEGA_AQUI')) {
  console.warn('⚠️ App Check no está activado todavía: falta pegar la site key de reCAPTCHA v3.');
} else {
  // Inicialización de App Check
  const appCheck = firebase.appCheck();
  appCheck.activate(
    new firebase.appCheck.ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    /* isTokenAutoRefreshEnabled */ true
  );
}

// ── Persistencia Offline ──
db.enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Persistencia offline: solo se puede activar en una pestaña a la vez.');
    } else if (err.code === 'unimplemented') {
      console.warn('Este navegador no soporta persistencia offline.');
    }
  });
