/* sesion.js — capa de servicios.
   Todo lo que antes vivía repartido entre app-core.js (modelo de permisos) y
   app.js (auth, perfil, sembrado inicial, suscripciones a Firestore) se
   concentra aquí. app.js queda como un shell de navegación: llama a
   useSesion() para saber quién es el usuario y qué datos hay, y solo se
   encarga de pintar pestañas.
   Carga DESPUÉS de app-core.js (usa uid(), useState/useEffect ya globales)
   y ANTES de app.js (que consume useSesion()) y de permisos.js (que
   consume TABS_INFO/EDICION_INFO/ACCIONES_INFO). */

/* ── Modelo de permisos: constantes de rol + helpers de acceso ──
   (movido de app-core.js, sin cambios de lógica) */
const TABS_INFO = [['productos', '📦', 'Productos'], ['nota', '🧾', 'Venta de almacén'], ['clientes', '👥', 'Clientes'], ['creditos', '💳', 'Créditos'], ['ruta', '📦', 'Transferencias'], ['repartidores', '🧭', 'Distribución'], ['inventario', '📋', 'Inventario'], ['reportes', '📈', 'Reportes'], ['gerencia', '💰', 'Gerencia']];
const EDICION_INFO = [['productos', '📦', 'Editar / dar de alta productos'], ['clientes', '👥', 'Editar / dar de alta clientes'], ['creditos', '💳', 'Registrar abonos a créditos']];
const ACCIONES_INFO = [['camara', '📷', 'Usar cámara (escanear QR de cliente)'], ['csv', '📄', 'Descargar reportes en CSV'], ['gps', '📍', 'Compartir ubicación en vivo (GPS)'], ['password', '🔑', 'Cambiar su propia contraseña']];
const ACCIONES_DEFAULT_ROL = {
  admin: {
    camara: true,
    csv: true,
    gps: true,
    password: true
  },
  usuario: {
    camara: false,
    csv: true,
    gps: false,
    password: true
  },
  repartidor: {
    camara: true,
    csv: false,
    gps: true,
    password: true
  }
};
const permisoAcciones = u => u?.role === 'admin' ? ACCIONES_DEFAULT_ROL.admin : {
  ...(ACCIONES_DEFAULT_ROL[u?.role] || ACCIONES_DEFAULT_ROL.usuario),
  ...(u?.permisos?.acciones || {})
};
const TABS_DEFAULT_ROL = {
  admin: {
    productos: true,
    nota: true,
    clientes: true,
    creditos: true,
    ruta: true,
    repartidores: true,
    inventario: true,
    reportes: true,
    gerencia: true
  },
  usuario: {
    productos: true,
    nota: true,
    clientes: true,
    creditos: true,
    ruta: false,
    repartidores: false,
    inventario: true,
    reportes: false,
    gerencia: true
  },
  repartidor: {
    productos: false,
    nota: false,
    clientes: false,
    creditos: false,
    ruta: true,
    repartidores: true,
    inventario: false,
    reportes: false,
    gerencia: true
  }
};
const EDITA_DEFAULT_ROL = {
  admin: {
    productos: true,
    clientes: true,
    creditos: true
  },
  usuario: {
    productos: true,
    clientes: true,
    creditos: true
  },
  repartidor: {
    productos: false,
    clientes: false,
    creditos: false
  }
};
const permisoTabs = u => ({
  ...(TABS_DEFAULT_ROL[u?.role] || TABS_DEFAULT_ROL.usuario),
  ...(u?.permisos?.tabs || {})
});
const permisoEdita = u => u?.role === 'admin' ? EDITA_DEFAULT_ROL.admin : {
  ...(EDITA_DEFAULT_ROL[u?.role] || EDITA_DEFAULT_ROL.usuario),
  ...(u?.permisos?.edita || {})
};

/* ── Utilidades de sesión local (candado por PIN) ──
   (movido de app-core.js, sin cambios de lógica) */
const pinKey = uid_ => 'pdc_pin_' + uid_;
const hashPin = async (pin, salt) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + ':' + salt));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};
const savePin = async (uid_, pin) => {
  const salt = uid() + uid();
  const hash = await hashPin(pin, salt);
  localStorage.setItem(pinKey(uid_), JSON.stringify({
    hash,
    salt,
    len: pin.length
  }));
};
const clearPin = uid_ => localStorage.removeItem(pinKey(uid_));

/* ── Datos semilla (solo la primera vez que Firestore está vacío) ──
   (movido de app-core.js, sin cambios de lógica) */
const S_PROD = [{
  identificación: 'p1',
  nombre: 'Paquete jumbo',
  precio: 250.00,
  existencias: 298,
  unidad: 'paquete',
  código: '750000000010'
}, {
  identificación: 'p2',
  nombre: 'Sueros',
  precio: 290.00,
  existencias: 300,
  unidad: 'paquete (12 pzas)',
  código: '750000000015'
}, {
  identificación: 'p3',
  nombre: 'Papa ondulada',
  precio: 13.00,
  existencias: 5050,
  unidad: 'pieza',
  código: '750000000003'
}, {
  identificación: 'p4',
  nombre: 'Paquete fiesta',
  precio: 85.00,
  existencias: 200,
  unidad: 'paquete',
  código: '01 526371137561 002'
}, {
  identificación: 'p5',
  nombre: 'Paquete Maruchan',
  precio: 185.00,
  existencias: 299,
  unidad: 'paquete (12 pzas)',
  código: '750000000012'
}, {
  identificación: 'p6',
  nombre: 'Amper Energy',
  precio: 210.00,
  existencias: 300,
  unidad: '12 pack',
  código: '750000000014'
}, {
  identificación: 'p7',
  nombre: 'Chicharrón de puerco',
  precio: 27.00,
  existencias: 500,
  unidad: 'pieza',
  código: '750000000004'
}, {
  identificación: 'p8',
  nombre: 'Paquete grande',
  precio: 30.00,
  existencias: 200,
  unidad: 'paquete',
  código: '750000000008'
}, {
  identificación: 'p9',
  nombre: 'Frituras',
  precio: 10.00,
  existencias: 10000,
  unidad: 'pieza',
  código: '750000000001'
}, {
  identificación: 'p10',
  nombre: 'Paquete mixto grande',
  precio: 35.00,
  existencias: 200,
  unidad: 'paquete',
  código: '750000000009'
}, {
  identificación: 'p11',
  nombre: 'Bolis pack',
  precio: 72.00,
  existencias: 299,
  unidad: 'Pqt',
  código: '750000000005'
}, {
  identificación: 'p12',
  nombre: 'Cacahuates',
  precio: 15.00,
  existencias: 4997,
  unidad: 'pieza',
  código: '750000000002'
}, {
  identificación: 'p13',
  nombre: 'Bolis pieza',
  precio: 6.00,
  existencias: 9999,
  unidad: 'pieza',
  código: '750000000006'
}];
const S_CLI = [{
  identificación: 'c1',
  nombre: 'Doña María los Sapos',
  dirección: 'Campo los Sapos'
}, {
  identificación: 'c2',
  nombre: 'Doña Luz',
  dirección: 'Santa Cecilia'
}, {
  identificación: 'c3',
  nombre: 'Doña Cecilia los Sapos',
  dirección: 'Los sapos'
}];

/* ── useSesion(): auth, perfil, sembrado inicial, suscripciones ──
   (movido de app.js, sin cambios de lógica — mismos efectos, mismo orden,
   mismas dependencias, solo ahora detrás de un hook en vez de inline en App) */
function useSesion() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [firestoreError, setFirestoreError] = useState(null);
  const [locked, setLocked] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [notas, setNotas] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [pendCounts, setPendCounts] = useState({
    productos: 0,
    clientes: 0,
    notas: 0,
    creditos: 0,
    rutas: 0
  });
  const totalPendientes = Object.values(pendCounts).reduce((s, n) => s + n, 0);

  useEffect(() => {
    const on = () => setIsOnline(true),
      off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    setLocked(currentUser ? !!localStorage.getItem(pinKey(currentUser.uid)) : false);
  }, [currentUser?.uid]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async fbUser => {
      if (!fbUser) {
        setCurrentUser(null);
        setAuthChecked(true);
        return;
      }

      const cacheKey = `perfil_sesion_v1_${fbUser.uid}`;
      let perfilCache = null;
      try {
        perfilCache = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      } catch (e) {
        localStorage.removeItem(cacheKey);
      }

      // La pantalla no queda detenida por la lectura remota cuando ya existe
      // una sesión conocida. Firestore sigue refrescando el perfil en segundo
      // plano y prevalece sobre la copia local en cuanto responde.
      if (perfilCache && perfilCache.email === fbUser.email && perfilCache.role) {
        setCurrentUser({ uid: fbUser.uid, ...perfilCache });
        setAuthChecked(true);
      }

      try {
        const ref = db.collection('usuarios').doc(fbUser.uid);
        const snap = await ref.get();
        let perfil;
        if (snap.exists) {
          perfil = snap.data();
        } else {
          // Primer inicio de sesión sin perfil: se crea como admin (útil
          // para la primera cuenta del sistema).
          perfil = {
            nombre: fbUser.email.split('@')[0],
            email: fbUser.email,
            role: 'admin'
          };
          await ref.set(perfil);
        }
        localStorage.setItem(cacheKey, JSON.stringify(perfil));
        setCurrentUser({ uid: fbUser.uid, ...perfil });
      } catch (e) {
        if (!perfilCache) {
          setCurrentUser({
            uid: fbUser.uid,
            nombre: fbUser.email,
            email: fbUser.email,
            role: 'usuario'
          });
        }
      } finally {
        setAuthChecked(true);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const seedRef = db.collection('_meta').doc('seed');
        const seedSnap = await seedRef.get();
        const seeded = seedSnap.exists ? seedSnap.data() : {};
        if (!seeded.productos) {
          const batch = db.batch();
          S_PROD.forEach(p => {
            const {
              id,
              ...rest
            } = p;
            batch.set(db.collection('productos').doc(), rest);
          });
          batch.set(seedRef, {
            productos: true
          }, {
            merge: true
          });
          await batch.commit();
        }
        if (!seeded.clientes) {
          const batch = db.batch();
          S_CLI.forEach(c => {
            const {
              id,
              ...rest
            } = c;
            batch.set(db.collection('clientes').doc(), rest);
          });
          batch.set(seedRef, {
            clientes: true
          }, {
            merge: true
          });
          await batch.commit();
        }
      } catch (e) {
        console.error('Error al sembrar datos iniciales', e);
      }
    })();
    const errorHandler = err => {
      console.error('Firestore error:', err);
      setFirestoreError('⚠️ Error de conexión con la base de datos. Revisa tus permisos.');
    };
    const pend = (col, snap) => setPendCounts(p => ({
      ...p,
      [col]: snap.docs.filter(d => d.metadata.hasPendingWrites).length
    }));
    const rutasQuery = currentUser.role === 'repartidor'
      ? db.collection('rutas').where('repartidorId', '==', currentUser.uid)
      : currentUser.role === 'admin'
        ? db.collection('rutas').orderBy('fecha', 'desc').limit(100)
        : null;
    const unsubs = [db.collection('productos').onSnapshot({
      includeMetadataChanges: true
    }, snap => {
      setProductos(snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      pend('productos', snap);
    }, errorHandler), db.collection('clientes').onSnapshot({
      includeMetadataChanges: true
    }, snap => {
      setClientes(snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      pend('clientes', snap);
    }, errorHandler), db.collection('notas').orderBy('fecha', 'desc').limit(500).onSnapshot({
      includeMetadataChanges: true
    }, snap => {
      setNotas(snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      pend('notas', snap);
    }, errorHandler), db.collection('creditos').onSnapshot({
      includeMetadataChanges: true
    }, snap => {
      setCreditos(snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      pend('creditos', snap);
    }, errorHandler), ...(rutasQuery ? [rutasQuery.onSnapshot({
      includeMetadataChanges: true
    }, snap => {
      const transferencias = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      transferencias.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
      setRutas(transferencias.slice(0, 100));
      pend('rutas', snap);
    }, errorHandler)] : [() => setRutas([])])];
    return () => unsubs.forEach(u => u());
  }, [currentUser]);

  return {
    currentUser, authChecked, firestoreError,
    locked, setLocked,
    isOnline,
    productos, clientes, notas, creditos, rutas,
    pendCounts, totalPendientes,
  };
}
