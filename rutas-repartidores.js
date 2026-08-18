'use strict';
let leafletLoading = false;
function ensureLeaflet(cb) {
  if (window.L) {
    cb();
    return;
  }
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  if (leafletLoading) {
    const check = setInterval(() => {
      if (window.L) {
        clearInterval(check);
        cb();
      }
    }, 200);
    return;
  }
  leafletLoading = true;
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload = () => {
    leafletLoading = false;
    cb();
  };
  script.onerror = () => {
    leafletLoading = false;
    cb();
  };
  document.body.appendChild(script);
}
let qrLibLoading = false;
function ensureQRCodeLib(cb) {
  if (window.QRCode) {
    cb();
    return;
  }
  if (qrLibLoading) {
    const check = setInterval(() => {
      if (window.QRCode) {
        clearInterval(check);
        cb();
      }
    }, 200);
    return;
  }
  qrLibLoading = true;
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  script.onload = () => {
    qrLibLoading = false;
    cb();
  };
  script.onerror = () => {
    qrLibLoading = false;
    cb();
  };
  document.body.appendChild(script);
}
const QR_PREFIX = 'PDLC-CLIENTE:';
const qrTextForCliente = id => QR_PREFIX + id;
function parseClienteQR(text) {
  if (!text) return null;
  return text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : text;
}
function renderQRDataURL(text, size, cb) {
  ensureQRCodeLib(() => {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(holder);
    try {
      new window.QRCode(holder, {
        text,
        width: size,
        height: size,
        correctLevel: window.QRCode.CorrectLevel.M
      });
      setTimeout(() => {
        const canvas = holder.querySelector('canvas');
        const img = holder.querySelector('img');
        const url = canvas ? canvas.toDataURL('image/png') : img ? img.src : null;
        document.body.removeChild(holder);
        cb(url);
      }, 150);
    } catch (e) {
      document.body.removeChild(holder);
      cb(null);
    }
  });
}
const fbApp = firebase.app();
const dbx = fbApp.firestore();
const fDateTime = d => d ? new Date(d).toLocaleString('es-MX', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
}) : '—';
const fmtx = n => '$' + Number(n || 0).toFixed(2);
function itemsCargadosDe(r) {
  if (Array.isArray(r.items)) return r.items.map(it => ({
    nombre: it.nombre,
    cant: it.cant
  }));
  return Object.values(r.items || {}).map(it => ({
    nombre: it.nombre,
    cant: it.cantCargada
  }));
}
function resumenRuta(r) {
  const entregas = r.entregas || [];
  const totalVendido = entregas.reduce((s, e) => s + (e.total || 0), 0);
  return {
    entregas,
    totalVendido,
    cargados: itemsCargadosDe(r)
  };
}
function guiaHTML(r) {
  const {
    entregas,
    totalVendido,
    cargados
  } = resumenRuta(r);
  const filasCargados = cargados.map(it => `<tr><td>${it.nombre}</td><td style="text-align:right">${it.cant}</td></tr>`).join('');
  const filasEntregas = entregas.map(e => `<tr><td>${e.clienteNombre}</td><td>${(e.items || []).length} prod.</td><td>${e.formaPago}</td><td style="text-align:right">${fmtx(e.total)}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Guía de ruta — ${fDateTime(r.fecha)}</title>
      <style>
        *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}
        body{padding:24px;color:#1B1D19;max-width:640px;margin:0 auto}
        h1{font-size:20px;margin-bottom:2px}
        h2{font-size:13px;color:#585D53;font-weight:600;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px}
        .sub{color:#8B8F84;font-size:13px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        td,th{padding:6px 4px;border-bottom:1px solid #DEE0D5;text-align:left}
        .total{font-size:18px;font-weight:800;text-align:right;margin-top:10px}
        @media print{ button{display:none} }
      </style></head><body>
      <h1>🚚 Guía de ruta</h1>
      <div class="sub">${fDateTime(r.fecha)} · Estado: ${r.estado === 'activa' ? 'en curso' : r.estado || 'cerrada'}</div>
      <h2>Productos cargados</h2>
      <table>${filasCargados || '<tr><td>Sin productos</td></tr>'}</table>
      <h2>Entregas (${entregas.length})</h2>
      <table>${filasEntregas || '<tr><td>Sin entregas registradas</td></tr>'}</table>
      <div class="total">Total vendido: ${fmtx(totalVendido)}</div>
      <button onclick="window.print()" style="margin-top:20px;background:#E8A400;border:none;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer">🖨️ Imprimir</button>
      </body></html>`;
}
function imprimirGuia(r) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Habilita las ventanas emergentes para imprimir la guía.');
    return;
  }
  w.document.write(guiaHTML(r));
  w.document.close();
}
function waGuiaLink(r, telefono) {
  const {
    entregas,
    totalVendido,
    cargados
  } = resumenRuta(r);
  const lineasCarga = cargados.map(it => `• ${it.nombre} x${it.cant}`).join('\n');
  const lineasEnt = entregas.map(e => `• ${e.clienteNombre}: ${fmtx(e.total)} (${e.formaPago})`).join('\n');
  const texto = `🚚 *GUÍA DE RUTA*\n📅 ${fDateTime(r.fecha)}\n\n*Cargamento:*\n${lineasCarga || 'Sin productos'}\n\n*Entregas (${entregas.length}):*\n${lineasEnt || 'Sin entregas'}\n\n💰 *Total vendido: ${fmtx(totalVendido)}*`;
  let tel = (telefono || '').replace(/\D/g, '');
  if (tel && !tel.startsWith('52') && tel.length <= 10) tel = '52' + tel;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}
let _permisoCSV = true;
function csvEscape(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows) {
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
}
function downloadCSV(filename, rows) {
  if (!_permisoCSV) {
    alert('No tienes permiso para descargar reportes en CSV. Pídele a un administrador que te lo active en Configuración → Permisos.');
    return;
  }
  const csv = '\uFEFF' + toCSV(rows);
  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function waVentaLink(cliente, items, total, pago) {
  const lineas = items.map(it => `• ${it.nombre} x${it.cant} = ${fmtx((it.precio || 0) * it.cant)}`).join('\n');
  const texto = `🧾 *PEDIDO*\n👤 ${cliente.nombre}\n\n${lineas}\n\n💰 *Total: ${fmtx(total)}*\nPago: ${pago}`;
  let tel = (cliente.telefono || '').replace(/\D/g, '');
  if (tel && !tel.startsWith('52') && tel.length <= 10) tel = '52' + tel;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}
const ESTADOS = {
  activa: {
    label: 'En curso',
    color: '#3E7CA6'
  },
  cerrada: {
    label: 'Cerrada',
    color: '#2E8B45'
  }
};
function getLoc() {
  return new Promise(res => {
    if (!navigator.geolocation) {
      res(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(p => res({
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      fecha: new Date().toISOString()
    }), () => res(null), {
      enableHighAccuracy: true,
      timeout: 8000
    });
  });
}
function lonLatATile(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return {
    x,
    y
  };
}
function tilesParaZona(bounds, zMin, zMax) {
  const tiles = [];
  for (let z = zMin; z <= zMax; z++) {
    const nw = lonLatATile(bounds.getNorth(), bounds.getWest(), z);
    const se = lonLatATile(bounds.getSouth(), bounds.getEast(), z);
    for (let x = nw.x; x <= se.x; x++) {
      for (let y = nw.y; y <= se.y; y++) tiles.push({
        z,
        x,
        y
      });
    }
  }
  return tiles;
}
const MAPA_OFFLINE_KEY = 'pdlc_mapa_offline_v1';
const inputStyle = {
  background: 'var(--surface-2)',
  border: '1px solid var(--line-strong)',
  borderRadius: 8,
  padding: '8px 10px',
  color: 'var(--ink)',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
  marginBottom: 10
};
const lblStyle = {
  fontSize: 11,
  color: 'var(--ink-soft)',
  marginBottom: 3,
  textTransform: 'uppercase',
  letterSpacing: '.5px'
};
const uidx = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function ClienteScanner({
  onDetected,
  onClose
}) {
  const [elId] = useState(() => 'cli-scanner-' + uidx());
  const [err, setErr] = useState('');
  useEffect(() => {
    if (typeof window.Html5Qrcode === 'undefined') {
      setErr('No se pudo cargar la librería de escaneo.');
      return;
    }
    let scanner = null,
      stopped = false,
      cancelled = false;
    (async () => {
      try {
        scanner = new window.Html5Qrcode(elId);
        await scanner.start({
          facingMode: 'environment'
        }, {
          fps: 10,
          qrbox: {
            width: 240,
            height: 240
          }
        }, decodedText => {
          if (stopped || cancelled) return;
          stopped = true;
          scanner.stop().then(() => scanner.clear()).catch(() => {});
          onDetected(decodedText);
        }, () => {});
      } catch (e) {
        if (!cancelled) setErr('No se pudo acceder a la cámara. Revisa los permisos del navegador.');
      }
    })();
    return () => {
      cancelled = true;
      if (scanner && !stopped) {
        stopped = true;
        try {
          scanner.stop().then(() => scanner.clear()).catch(() => {});
        } catch (e) {}
      }
    };
  }, []);
  return React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: '#1B1D19cc',
      zIndex: 320,
      display: 'flex',
      alignItems: 'flex-end'
    }
  }, React.createElement("div", {
    style: {
      background: 'var(--surface)',
      width: '100%',
      maxWidth: 420,
      margin: '0 auto',
      borderRadius: '18px 18px 0 0',
      padding: 20
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 16
    }
  }, React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 700
    }
  }, "📷 Escanear QR de cliente"), React.createElement("button", {
    onClick: onClose,
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--ink-soft)',
      fontSize: 20,
      cursor: 'pointer'
    }
  }, "✕")), err ? React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--danger-text)',
      textAlign: 'center',
      padding: '24px 0'
    }
  }, err) : React.createElement("div", {
    id: elId,
    style: {
      width: '100%',
      borderRadius: 10,
      overflow: 'hidden',
      background: '#000'
    }
  })));
}
function RutaActivaCard({ ruta, currentUser, puedeGps, tracking, onTracking, onCerrar }) {
  const puedeOperar = currentUser.role === 'admin' || ruta.repartidorId === currentUser.uid;
  const resumen = resumenRuta(ruta);
  const inventario = Object.entries(ruta.items || {}).map(([id, item]) => React.createElement("div", {
    key: id,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 3
    }
  }, React.createElement("span", null, item.nombre), React.createElement("strong", null, item.cantRestante, " / ", item.cantCargada, " ", item.unidad)));
  const acciones = puedeOperar ? React.createElement("div", {
    key: 'acciones',
    style: { display: 'flex', gap: 8, marginTop: 9 }
  }, [puedeGps && React.createElement("button", {
    key: 'gps',
    onClick: onTracking,
    style: {
      flex: 1,
      background: tracking ? 'var(--warn-bg)' : 'var(--surface-2)',
      color: tracking ? 'var(--warn-text)' : 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 8,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 11
    }
  }, tracking ? '📍 GPS activo' : '📍 Compartir GPS'), React.createElement("button", {
    key: 'cerrar',
    onClick: onCerrar,
    style: {
      flex: 1,
      background: 'var(--ok-bg)',
      color: 'var(--ok-text)',
      border: '1px solid var(--ok)',
      borderRadius: 8,
      padding: 8,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 11
    }
  }, '🏁 Cerrar ruta')]) : null;
  return React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 14,
      marginBottom: 10
    }
  }, [React.createElement("div", {
    key: 'titulo',
    style: { display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 7 }
  }, React.createElement("div", null, React.createElement("strong", null, ruta.repartidorNombre || 'Sin repartidor'), React.createElement("div", {
    style: { fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }
  }, "🚐 ", ruta.vehiculo || 'Sin vehículo', " · 📍 ", ruta.zona || 'Sin zona')), React.createElement("span", {
    style: {
      background: ESTADOS.activa.color + '22',
      color: ESTADOS.activa.color,
      borderRadius: 20,
      padding: '3px 9px',
      fontSize: 11,
      fontWeight: 700,
      height: 'fit-content'
    }
  }, ESTADOS.activa.label)), React.createElement("div", {
    key: 'resumen',
    style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-soft)', marginBottom: 9 }
  }, React.createElement("span", null, "Salida: ", fDateTime(ruta.fechaSalidaReal || ruta.fecha)), React.createElement("span", null, resumen.entregas.length, " venta(s) · ", fmtx(resumen.totalVendido))), React.createElement("div", {
    key: 'inventario',
    style: { background: 'var(--surface-2)', borderRadius: 8, padding: 10 }
  }, inventario.length ? inventario : React.createElement("div", {
    style: { fontSize: 12, color: 'var(--ink-faint)' }
  }, "Sin productos cargados")), acciones]);
}
function RepartidoresPanel({
  productos,
  clientes,
  rutas: rutasReales,
  currentUser,
  onIrA
}) {
  const [tab, setTab] = useState('activas');
  const rutas = rutasReales || [];
  const [waFor, setWaFor] = useState(null);
  const [waPhone, setWaPhone] = useState('');
  const [expandComp, setExpandComp] = useState(null);
  const [msg, setMsg] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapaOffline, setMapaOffline] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(MAPA_OFFLINE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  });
  const [descargandoMapa, setDescargandoMapa] = useState(null);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const watchIdRef = useRef(null);
  const [tracking, setTracking] = useState(null);
  const [qrModalFor, setQrModalFor] = useState(null);
  const [qrDataURL, setQrDataURL] = useState(null);
  const [qrSel, setQrSel] = useState([]);
  const [qrMasivoLoading, setQrMasivoLoading] = useState(false);
  const [clienteScanOpen, setClienteScanOpen] = useState(false);
  const [clienteBuscarOpen, setClienteBuscarOpen] = useState(false);
  const [cliQSearch, setCliQSearch] = useState('');
  const [nuevoCliForm, setNuevoCliForm] = useState(null);
  const [ventaRapida, setVentaRapida] = useState(null);
  const [ventaProdSearch, setVentaProdSearch] = useState('');
  const [offlineVentaResumen, setOfflineVentaResumen] = useState({ total: 0, pendientes: 0, incidencias: 0, registros: [] });
  const [backupMeta, setBackupMeta] = useState(null);
  const flash = m => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };
  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    return dbx.collection('_meta').doc('backups').onSnapshot(snap => setBackupMeta(snap.exists ? snap.data() : null), () => {});
  }, [currentUser?.role]);
  useEffect(() => {
    if (typeof frittzSuscribirVentasOffline !== 'function') return undefined;
    return frittzSuscribirVentasOffline(setOfflineVentaResumen);
  }, []);
  const descargarZonaOffline = async () => {
    if (!mapInstance.current) return;
    const bounds = mapInstance.current.getBounds();
    const zActual = Math.round(mapInstance.current.getZoom());
    const zMin = Math.max(zActual, 12),
      zMax = Math.min(zActual + 3, 17);
    const tiles = tilesParaZona(bounds, zMin, zMax);
    if (tiles.length > 3500) {
      flash('⚠️ La zona visible es muy grande (' + tiles.length + ' tiles). Acércate más con el zoom antes de descargar.');
      return;
    }
    if (!confirm('Se van a descargar ' + tiles.length + ' imágenes de mapa (~' + Math.max(1, Math.round(tiles.length * 15 / 1024)) + ' MB aprox., zoom ' + zMin + '–' + zMax + '). ¿Continuar?')) return;
    setDescargandoMapa({
      hecho: 0,
      total: tiles.length
    });
    const cola = [...tiles];
    let hecho = 0;
    const trabajador = async () => {
      while (cola.length) {
        const t = cola.shift();
        try {
          await fetch(`https://a.tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`);
        } catch (e) {}
        hecho++;
        setDescargandoMapa({
          hecho,
          total: tiles.length
        });
      }
    };
    await Promise.all(Array.from({
      length: 6
    }, trabajador));
    const meta = {
      fecha: new Date().toISOString(),
      tileCount: tiles.length,
      zMin,
      zMax,
      bounds: {
        n: bounds.getNorth(),
        s: bounds.getSouth(),
        e: bounds.getEast(),
        w: bounds.getWest()
      }
    };
    localStorage.setItem(MAPA_OFFLINE_KEY, JSON.stringify(meta));
    setMapaOffline(meta);
    setDescargandoMapa(null);
    flash('✅ Zona de mapa lista para uso sin conexión');
  };
  const borrarMapaOffline = async () => {
    if (!confirm('¿Borrar el mapa descargado de este dispositivo?')) return;
    try {
      if ('caches' in window) await caches.delete('distribupanel-tiles-v1');
    } catch (e) {}
    localStorage.removeItem(MAPA_OFFLINE_KEY);
    setMapaOffline(null);
    flash('🗑️ Mapa offline borrado');
  };
  useEffect(() => {
    if (tab !== 'mapa') return;
    ensureLeaflet(() => {
      if (!window.L || !mapRef.current) return;
      setTimeout(() => {
        if (!mapInstance.current && mapRef.current) {
          mapInstance.current = window.L.map(mapRef.current).setView([23.6, -102.5], 5);
          window.L.tileLayer('https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
          }).addTo(mapInstance.current);
        }
        setMapReady(true);
        if (mapInstance.current) setTimeout(() => mapInstance.current.invalidateSize(), 100);
      }, 50);
    });
  }, [tab]);
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const activas = rutas.filter(r => r.estado === 'activa' && r.ubicacionActual);
    Object.keys(markersRef.current).forEach(id => {
      if (!activas.find(r => r.id === id)) {
        mapInstance.current.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });
    const pts = [];
    activas.forEach(r => {
      const {
        lat,
        lng
      } = r.ubicacionActual;
      pts.push([lat, lng]);
      const popup = `<b>${r.repartidorNombre || '—'}</b><br/>${r.vehiculo || ''}<br/>${r.zona || ''}`;
      if (markersRef.current[r.id]) {
        markersRef.current[r.id].setLatLng([lat, lng]).setPopupContent(popup);
      } else {
        markersRef.current[r.id] = window.L.marker([lat, lng]).addTo(mapInstance.current).bindPopup(popup);
      }
    });
    if (pts.length) mapInstance.current.fitBounds(pts, {
      maxZoom: 14,
      padding: [30, 30]
    });
  }, [rutas, mapReady]);
  const cerrarRuta = async r => {
    const pendientesOffline = typeof frittzVentasPendientesRuta === 'function' ? await frittzVentasPendientesRuta(r.id) : { total: 0 };
    if (pendientesOffline.total > 0) {
      flash('⚠️ Hay ' + pendientesOffline.total + ' venta(s) offline pendiente(s) de sincronizar; conecta el dispositivo antes de cerrar');
      return;
    }
    try {
      await dbx.collection('rutas').doc(r.id).update({
        estado: 'pendiente_recepcion',
        estadoTransferencia: 'pendiente_recepcion',
        fechaSolicitudCierre: new Date().toISOString(),
        solicitadoPorUid: currentUser.uid,
        solicitadoPorNombre: currentUser.nombre || ''
      });
      if (tracking === r.id) detenerSeguimiento();
      flash('📦 Transferencia enviada a recepción de almacén para su conciliación');
    } catch (e) {
      flash('❌ No se pudo solicitar la recepción de la transferencia: ' + e.message);
    }
  };
  const verQR = cliente => {
    setQrModalFor(cliente);
    setQrDataURL(null);
    renderQRDataURL(qrTextForCliente(cliente.id), 260, url => setQrDataURL(url));
  };
  const renderQRDataURLAsync = (text, size) => new Promise(res => renderQRDataURL(text, size, res));
  const togQrSel = id => setQrSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const imprimirQRsMasivo = async lista => {
    if (!lista.length || qrMasivoLoading) return;
    setQrMasivoLoading(true);
    try {
      const items = await Promise.all(lista.map(async c => ({
        cliente: c,
        dataURL: await renderQRDataURLAsync(qrTextForCliente(c.id), 260)
      })));
      const w = window.open('', '_blank');
      if (!w) {
        alert('Habilita las ventanas emergentes para imprimir los QR.');
        return;
      }
      const tarjetas = items.map(({
        cliente,
        dataURL
      }) => `
          <div class="tarjeta">
            <h2>${cliente.nombre}</h2>
            <p>${cliente.telefono || ''}${cliente.domicilio ? ' · ' + cliente.domicilio : ''}</p>
            ${dataURL ? `<img src="${dataURL}"/>` : '<p>No se pudo generar el QR</p>'}
          </div>`).join('');
      w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>QR de clientes</title>
          <style>
            *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}
            body{padding:16px;color:#1B1D19}
            .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
            .tarjeta{border:1px solid #ddd;border-radius:10px;padding:12px;text-align:center;break-inside:avoid;page-break-inside:avoid}
            .tarjeta img{width:150px;height:150px;margin:6px auto;display:block}
            .tarjeta h2{font-size:13px;margin:0}
            .tarjeta p{color:#585D53;font-size:10px;margin:2px 0 0}
            .no-print{margin-bottom:14px;background:#E8A400;border:none;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer}
            @media print{ .no-print{display:none} }
          </style></head><body>
          <button class="no-print" onclick="window.print()">🖨️ Imprimir (${items.length})</button>
          <div class="grid">${tarjetas}</div>
          </body></html>`);
      w.document.close();
    } finally {
      setQrMasivoLoading(false);
    }
  };
  const crearClienteRapido = async () => {
    if (!nuevoCliForm.nombre) {
      flash('⚠️ Falta el nombre');
      return;
    }
    try {
      const loc = await getLoc();
      const ref = await dbx.collection('clientes').add({
        nombre: nuevoCliForm.nombre,
        telefono: nuevoCliForm.telefono || '',
        domicilio: nuevoCliForm.domicilio || '',
        activo: true,
        creadoPorUid: currentUser.uid,
        ubicacion: loc || null
      });
      setNuevoCliForm(null);
      flash(loc ? '✅ Cliente creado con ubicación' : '✅ Cliente creado (sin ubicación GPS)');
      verQR({
        id: ref.id,
        nombre: nuevoCliForm.nombre,
        telefono: nuevoCliForm.telefono || '',
        domicilio: nuevoCliForm.domicilio || ''
      });
    } catch (e) {
      flash('❌ ' + e.message);
    }
  };
  const rutasActivasVenta = rutas.filter(r => r.estado === 'activa' && currentUser.role === 'repartidor' && r.repartidorId === currentUser.uid);
  const abrirVentaParaCliente = cliente => {
    if (currentUser.role !== 'repartidor') {
      flash('⚠️ Las ventas desde transferencia solo las registra el repartidor asignado.');
      return;
    }
    if (rutasActivasVenta.length === 0) {
      flash('⚠️ No hay una transferencia activa asignada para registrar esta venta');
      return;
    }
    setClienteScanOpen(false);
    setClienteBuscarOpen(false);
    setCliQSearch('');
    setVentaRapida({
      cliente,
      rutaId: rutasActivasVenta.length === 1 ? rutasActivasVenta[0].id : '',
      items: [],
      pago: 'contado',
      saving: false
    });
  };
  const onScanCliente = text => {
    const id = parseClienteQR(text);
    const cli = clientes.find(c => c.id === id);
    if (!cli) {
      setClienteScanOpen(false);
      flash('⚠️ QR no reconocido como cliente');
      return;
    }
    abrirVentaParaCliente(cli);
  };
  const saldoDisponibleTransferencia = (rutaId, productoId) => {
    const item = rutasActivasVenta.find(r => r.id === rutaId)?.items?.[productoId];
    const pendientes = (offlineVentaResumen.registros || [])
      .filter(venta => venta.transferenciaId === rutaId && ['pendiente', 'reintentando'].includes(venta.estado))
      .reduce((sum, venta) => sum + (venta.items || []).filter(x => x.id === productoId).reduce((s, x) => s + Number(x.cant || 0), 0), 0);
    return Math.max(0, Number(item?.cantRestante || 0) - Number(item?.cantReservadaPedidos || 0) - pendientes);
  };
  const addProdVenta = p => {
    if (!ventaRapida?.rutaId) {
      flash('⚠️ Selecciona una transferencia activa');
      return;
    }
    const disponible = saldoDisponibleTransferencia(ventaRapida.rutaId, p.id);
    const existente = ventaRapida.items.find(x => x.id === p.id);
    if (!disponible || (existente && existente.cant >= disponible)) {
      flash('⚠️ No hay más saldo disponible en la transferencia para ' + p.nombre);
      return;
    }
    setVentaRapida(v => ({
      ...v,
      items: existente ? v.items.map(x => x.id === p.id ? { ...x, cant: (Number(x.cant) || 0) + 1 } : x) : [...v.items, {
        id: p.id,
        nombre: p.nombre,
        cant: 1
      }]
    }));
  };
  const updQtyVenta = (id, val) => {
    const raw = String(val ?? '');
    if (!/^\d*$/.test(raw)) return;
    if (raw === '') {
      setVentaRapida(v => ({
        ...v,
        items: v.items.map(x => x.id === id ? { ...x, cant: '' } : x)
      }));
      return;
    }
    const disponible = saldoDisponibleTransferencia(ventaRapida?.rutaId, id);
    const cantidadSolicitada = Number(raw);
    const cantidad = Math.min(cantidadSolicitada, disponible);
    if (cantidadSolicitada > disponible) flash('⚠️ La cantidad se ajustó al saldo disponible en la transferencia');
    setVentaRapida(v => ({
      ...v,
      items: cantidad < 1 ? v.items.filter(x => x.id !== id) : v.items.map(x => x.id === id ? { ...x, cant: cantidad } : x)
    }));
  };
  const guardarVentaRapida = async () => {
    if (!ventaRapida?.rutaId) {
      flash('⚠️ Selecciona la transferencia activa que realizará la venta');
      return;
    }
    if (ventaRapida.items.length === 0) {
      flash('⚠️ Agrega al menos un producto');
      return;
    }
    if (ventaRapida.items.some(item => !Number.isInteger(Number(item.cant)) || Number(item.cant) < 1)) {
      flash('⚠️ Cada producto debe tener una cantidad entera mayor que cero');
      return;
    }
    setVentaRapida(v => ({ ...v, saving: true }));
    try {
      const loc = await getLoc();
      const cliente = ventaRapida.cliente;
      const validacionVisita = loc && cliente.ubicacion ? {
        ok: distanciaMetros(loc.lat, loc.lng, cliente.ubicacion.lat, cliente.ubicacion.lng) <= RADIO_VISITA_METROS,
        distanciaM: Math.round(distanciaMetros(loc.lat, loc.lng, cliente.ubicacion.lat, cliente.ubicacion.lng))
      } : { ok: null, distanciaM: null };
      const itemsConPrecio = ventaRapida.items.map(it => {
        const producto = productos.find(p => p.id === it.id);
        return {
          id: it.id,
          nombre: it.nombre,
          unidad: producto?.unidad || '',
          cant: Number(it.cant || 0),
          precio: Number(producto?.precio || it.precio || 0)
        };
      });
      const total = itemsConPrecio.reduce((s, it) => s + it.precio * it.cant, 0);
      const resultado = await frittzGuardarVentaTransferencia({
        transferenciaId: ventaRapida.rutaId,
        rutaId: ventaRapida.rutaId,
        repartidorUid: currentUser.uid,
        repartidorNombre: currentUser.nombre || '',
        cliente,
        items: itemsConPrecio,
        total,
        formaPago: ventaRapida.pago,
        tipoVenta: 'rapida_repartidor',
        validacionVisita
      });
      setVentaRapida(v => ({ ...v, saving: false, done: resultado }));
      if (resultado.estado === 'pendiente_local') {
        flash('📴 Venta guardada en pendientes; se sincronizará al volver la conexión');
      } else if (resultado.estado === 'incidencia_inventario') {
        flash('⚠️ Venta guardada con incidencia; revisa el cierre de caja');
      } else {
        flash('✅ Venta guardada — ' + fmtx(resultado.total));
      }
    } catch (e) {
      flash('❌ ' + e.message);
      setVentaRapida(v => ({ ...v, saving: false }));
    }
  };
  const exportarHistorialCSV = () => {
    const rows = [['Fecha', 'Repartidor', 'Vehículo', 'Zona', 'Estado', 'Salida real', 'Regreso real', 'Duración (min)', 'Entregas', 'Total vendido']];
    hist.forEach(r => {
      const dur = r.fechaSalidaReal && r.fechaRegresoReal ? Math.round((new Date(r.fechaRegresoReal) - new Date(r.fechaSalidaReal)) / 60000) : '';
      const resumen = resumenRuta(r);
      rows.push([fDateTime(r.fecha), r.repartidorNombre || '', r.vehiculo || '', r.zona || '', ESTADOS[r.estado]?.label || r.estado, fDateTime(r.fechaSalidaReal), fDateTime(r.fechaRegresoReal), dur, resumen.entregas.length, resumen.totalVendido.toFixed(2)]);
    });
    downloadCSV('historial_rutas_' + Date.now() + '.csv', rows);
  };
  const exportarComprobantesCSV = () => {
    const rows = [['Fecha', 'Estado', 'Entregas', 'Total vendido']];
    rutasReales.forEach(r => {
      const {
        entregas,
        totalVendido
      } = resumenRuta(r);
      rows.push([fDateTime(r.fecha), r.estado === 'activa' ? 'en curso' : 'cerrada', entregas.length, totalVendido.toFixed(2)]);
    });
    downloadCSV('comprobantes_rutas_' + Date.now() + '.csv', rows);
  };
  const exportarVentasDetalladoCSV = () => {
    const rows = [['Fecha ruta', 'Cliente', 'Productos', 'Total', 'Forma de pago']];
    rutasReales.forEach(r => {
      (r.entregas || []).forEach(e => {
        rows.push([fDateTime(r.fecha), e.clienteNombre, (e.items || []).map(it => it.nombre + ' x' + it.cant).join(' | '), e.total.toFixed(2), e.formaPago]);
      });
    });
    downloadCSV('ventas_detalladas_' + Date.now() + '.csv', rows);
  };
  const diasDesdeUltimoRespaldo = backupMeta && backupMeta.ultimoRespaldo ? Math.floor((Date.now() - new Date(backupMeta.ultimoRespaldo).getTime()) / 86400000) : null;
  const iniciarSeguimiento = r => {
    if (!navigator.geolocation) {
      flash('⚠️ Este dispositivo no soporta GPS');
      return;
    }
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    let last = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(p => {
      const now = Date.now();
      if (now - last < 20000) return;
      last = now;
      dbx.collection('rutas').doc(r.id).update({
        ubicacionActual: {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          fecha: new Date().toISOString()
        }
      }).catch(() => {});
    }, () => flash('⚠️ No se pudo obtener ubicación'), {
      enableHighAccuracy: true
    });
    setTracking(r.id);
    flash('📍 Compartiendo ubicación en vivo');
  };
  const detenerSeguimiento = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(null);
  };
  useEffect(() => () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);
  if (!currentUser) return null;
  if (currentUser.role !== 'admin' && currentUser.role !== 'repartidor') return null;
  const puedeCamara = permisoAcciones(currentUser).camara;
  const puedeGps = currentUser.role === 'admin' || permisoAcciones(currentUser).gps;
  _permisoCSV = currentUser.role === 'admin' || permisoAcciones(currentUser).csv;
  const activas = rutas.filter(r => r.estado === 'activa');
  const hist = rutas.filter(r => r.estado === 'cerrada');
  const misRutas = currentUser.role === 'admin' ? activas : activas.filter(r => r.repartidorId === currentUser.uid);
  return React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      padding: '16px 12px',
      color: 'var(--ink)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      marginBottom: 14
    }
  }, "🗺️ Repartidores y rutas"), msg && React.createElement("div", {
    style: {
      background: 'var(--ok-bg)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      color: 'var(--ok-text)',
      marginBottom: 12
    }
  }, msg), currentUser.role === 'admin' && diasDesdeUltimoRespaldo !== null && diasDesdeUltimoRespaldo >= 7 && React.createElement("button", {
    onClick: () => onIrA && onIrA('reportes'),
    style: {
      width: '100%',
      textAlign: 'left',
      background: diasDesdeUltimoRespaldo >= 30 ? 'var(--danger-bg)' : 'var(--warn-bg)',
      border: 'none',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      color: diasDesdeUltimoRespaldo >= 30 ? 'var(--danger-text)' : 'var(--warn-text)',
      marginBottom: 12,
      cursor: 'pointer'
    }
  }, diasDesdeUltimoRespaldo >= 30 ? '🔴' : '🟡', " Sin respaldo hace ", diasDesdeUltimoRespaldo, " días — toca uno"), currentUser.role === 'admin' && diasDesdeUltimoRespaldo === null && React.createElement("button", {
    onClick: () => onIrA && onIrA('reportes'),
    style: {
      width: '100%',
      textAlign: 'left',
      background: 'var(--warn-bg)',
      border: 'none',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      color: 'var(--warn-text)',
      marginBottom: 12,
      cursor: 'pointer'
    }
  }, "🟡 Nunca se ha generado un respaldo — toca uno"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 14
    }
  }, [['activas', 'Activas'], ['mapa', 'Mapa'], ['clientesqr', 'Clientes'], ['comprobantes', 'Comprob.'], ['historial', 'Historial']].filter(([v]) => v !== 'mapa' || currentUser.role === 'admin').map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => setTab(v),
    style: {
      flex: 1,
      padding: '8px 1px',
      borderRadius: 8,
      border: 'none',
      background: tab === v ? 'var(--accent)' : 'var(--surface)',
      color: tab === v ? 'var(--surface-2)' : 'var(--ink-soft)',
      fontSize: 9,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), tab === 'activas' && React.createElement("div", null, currentUser.role !== 'admin' && React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 14,
      textAlign: 'center'
    }
  }, "Las ventas por QR descuentan exclusivamente del saldo de tu transferencia activa."), misRutas.length === 0 && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: 'var(--ink-faint)',
      padding: '20px 0'
    }
  }, "Sin transferencias activas"), misRutas.map(r => React.createElement(RutaActivaCard, {
    key: r.id,
    ruta: r,
    currentUser,
    puedeGps,
    tracking: tracking === r.id,
    onTracking: () => tracking === r.id ? detenerSeguimiento() : iniciarSeguimiento(r),
    onCerrar: () => cerrarRuta(r)
  }))), tab === 'mapa' && currentUser.role === 'admin' && React.createElement("div", null, React.createElement("div", {
    ref: mapRef,
    style: {
      width: '100%',
      height: 380,
      borderRadius: 12,
      background: 'var(--surface)'
    }
  }), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginTop: 8,
      textAlign: 'center'
    }
  }, "Muestra las rutas en curso que están compartiendo ubicación en vivo."), React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 10,
      padding: 12,
      marginTop: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "🗺️ Mapa sin conexión"), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 8,
      lineHeight: 1.4
    }
  }, "Navega el mapa de arriba (pan/zoom) hasta cubrir tu zona de reparto y descárgala — queda guardada en ", React.createElement("strong", null, "este dispositivo"), " para verse sin internet. Cada dispositivo (el tuyo, el de cada repartidor) necesita descargarla por separado, una vez, mientras tenga conexión."), mapaOffline ? React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ok-text)',
      marginBottom: 8
    }
  }, "✅ Zona descargada el ", fDateTime(mapaOffline.fecha), " · ", mapaOffline.tileCount, " imágenes · zoom ", mapaOffline.zMin, "–", mapaOffline.zMax) : React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 8
    }
  }, "Sin zona descargada todavía en este dispositivo."), descargandoMapa ? React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700
    }
  }, "Descargando… ", descargandoMapa.hecho, "/", descargandoMapa.total) : React.createElement(Row, {
    style: {
      gap: 8
    }
  }, React.createElement("button", {
    onClick: descargarZonaOffline,
    style: {
      flex: 1,
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 12
    }
  }, "📥 Descargar esta zona"), mapaOffline && React.createElement("button", {
    onClick: borrarMapaOffline,
    style: {
      background: 'var(--danger-bg)',
      color: 'var(--danger-text)',
      border: 'none',
      borderRadius: 8,
      padding: '0 14px',
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, "🗑️")))), tab === 'clientesqr' && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 14
    }
  }, puedeCamara && currentUser.role === 'repartidor' && React.createElement("button", {
    onClick: () => setClienteScanOpen(true),
    style: {
      flex: 1,
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 12
    }
  }, "📷 Escanear para vender"), currentUser.role === 'repartidor' && React.createElement("button", {
    onClick: () => setClienteBuscarOpen(o => !o),
    style: {
      flex: 1,
      background: 'var(--surface)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 12
    }
  }, "🔍 Buscar manualmente")), clienteBuscarOpen && currentUser.role === 'repartidor' && React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, React.createElement("input", {
    value: cliQSearch,
    onChange: e => setCliQSearch(e.target.value),
    placeholder: "Buscar cliente…",
    style: inputStyle
  }), React.createElement("div", {
    style: {
      maxHeight: 160,
      overflowY: 'auto'
    }
  }, clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliQSearch.toLowerCase())).map(c => React.createElement("div", {
    key: c.id,
    onClick: () => abrirVentaParaCliente(c),
    style: {
      padding: '8px 10px',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 13,
      background: 'var(--surface)',
      marginBottom: 4
    }
  }, c.nombre)))), React.createElement("button", {
    onClick: () => setNuevoCliForm(f => f ? null : {
      nombre: '',
      telefono: '',
      domicilio: ''
    }),
    style: {
      width: '100%',
      background: 'transparent',
      color: 'var(--accent)',
      border: '1px dashed var(--line-strong)',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 12,
      marginBottom: 14
    }
  }, "+ Nuevo cliente (genera QR)"), nuevoCliForm && React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 14,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: lblStyle
  }, "Nombre"), React.createElement("input", {
    value: nuevoCliForm.nombre,
    onChange: e => setNuevoCliForm(f => ({
      ...f,
      nombre: e.target.value
    })),
    style: inputStyle
  }), React.createElement("div", {
    style: lblStyle
  }, "Teléfono"), React.createElement("input", {
    value: nuevoCliForm.telefono,
    onChange: e => setNuevoCliForm(f => ({
      ...f,
      telefono: e.target.value
    })),
    style: inputStyle
  }), React.createElement("div", {
    style: lblStyle
  }, "Domicilio"), React.createElement("input", {
    value: nuevoCliForm.domicilio,
    onChange: e => setNuevoCliForm(f => ({
      ...f,
      domicilio: e.target.value
    })),
    style: {
      ...inputStyle,
      marginBottom: 12
    }
  }), React.createElement("button", {
    onClick: crearClienteRapido,
    style: {
      width: '100%',
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, "💾 Guardar y generar QR")), React.createElement("input", {
    value: cliQSearch,
    onChange: e => setCliQSearch(e.target.value),
    placeholder: "🔍 Buscar en la lista…",
    style: inputStyle
  }), (() => {
    const lista = clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliQSearch.toLowerCase()));
    const todosSel = lista.length > 0 && lista.every(c => qrSel.includes(c.id));
    return React.createElement(Row, {
      style: {
        justifyContent: 'space-between',
        margin: '10px 0'
      }
    }, React.createElement("label", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--ink-soft)',
        cursor: 'pointer'
      }
    }, React.createElement("input", {
      type: "checkbox",
      checked: todosSel,
      onChange: () => setQrSel(todosSel ? [] : lista.map(c => c.id))
    }), "Seleccionar todos (", lista.length, ")"), qrSel.length > 0 && React.createElement("button", {
      onClick: () => imprimirQRsMasivo(clientes.filter(c => qrSel.includes(c.id))),
      disabled: qrMasivoLoading,
      style: {
        background: 'var(--accent)',
        color: 'var(--surface-2)',
        border: 'none',
        borderRadius: 8,
        padding: '7px 12px',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        opacity: qrMasivoLoading ? 0.6 : 1
      }
    }, qrMasivoLoading ? 'Generando…' : `🖨️ Imprimir seleccionados (${qrSel.length})`));
  })(), clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliQSearch.toLowerCase())).map(c => React.createElement("div", {
    key: c.id,
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8
    }
  }, React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
      cursor: 'pointer'
    }
  }, React.createElement("input", {
    type: "checkbox",
    checked: qrSel.includes(c.id),
    onChange: () => togQrSel(c.id)
  }), React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13
    }
  }, c.nombre), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)'
    }
  }, c.telefono || '—'))), React.createElement("button", {
    onClick: () => verQR(c),
    style: {
      background: 'var(--info-bg)',
      color: 'var(--info-text)',
      border: 'none',
      borderRadius: 8,
      padding: '7px 12px',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
      flexShrink: 0
    }
  }, "🔲 QR")))), tab === 'comprobantes' && React.createElement(React.Fragment, null, _permisoCSV && rutasReales.length > 0 && React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 14
    }
  }, React.createElement("button", {
    onClick: exportarComprobantesCSV,
    style: {
      flex: 1,
      background: 'var(--surface)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 9,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 11
    }
  }, "📤 CSV por ruta"), React.createElement("button", {
    onClick: exportarVentasDetalladoCSV,
    style: {
      flex: 1,
      background: 'var(--surface)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 9,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 11
    }
  }, "📤 CSV detallado")), rutasReales.length === 0 && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: 'var(--ink-faint)',
      padding: '20px 0'
    }
  }, "Sin rutas cargadas aún"), rutasReales.map(r => {
    const {
      entregas,
      totalVendido
    } = resumenRuta(r);
    return React.createElement("div", {
      key: r.id,
      style: {
        background: 'var(--surface)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10
      }
    }, React.createElement("button", {
      onClick: () => setExpandComp(expandComp === r.id ? null : r.id),
      style: {
        background: 'none',
        border: 'none',
        color: 'var(--ink)',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        padding: 0
      }
    }, React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 4
      }
    }, React.createElement("span", {
      style: {
        fontSize: 12,
        color: 'var(--ink-soft)'
      }
    }, fDateTime(r.fecha)), React.createElement("span", {
      style: {
        background: (r.estado === 'activa' ? '#3E7CA6' : '#8B8F84') + '22',
        color: r.estado === 'activa' ? '#3E7CA6' : '#8B8F84',
        borderRadius: 20,
        padding: '2px 9px',
        fontSize: 11,
        fontWeight: 700
      }
    }, r.estado === 'activa' ? 'en curso' : 'cerrada')), React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700
      }
    }, entregas.length, " entrega(s) · ", React.createElement("span", {
      style: {
        color: 'var(--accent)'
      }
    }, fmtx(totalVendido)))), expandComp === r.id && React.createElement("div", {
      style: {
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px solid var(--line-strong)'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--ink-faint)',
        fontWeight: 700,
        marginBottom: 4
      }
    }, "CARGADO"), itemsCargadosDe(r).map((it, i) => React.createElement("div", {
      key: i,
      style: {
        fontSize: 12,
        color: 'var(--ink-soft)'
      }
    }, "• ", it.nombre, " x", it.cant)), entregas.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--ink-faint)',
        fontWeight: 700,
        marginTop: 8,
        marginBottom: 4
      }
    }, "ENTREGAS"), entregas.map((e, i) => React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
        marginBottom: 3
      }
    }, React.createElement("span", null, e.clienteNombre), React.createElement("span", {
      style: {
        color: 'var(--accent)',
        fontWeight: 700
      }
    }, fmtx(e.total)))))), React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 10
      }
    }, React.createElement("button", {
      onClick: () => imprimirGuia(r),
      style: {
        flex: 1,
        background: 'var(--surface-2)',
        color: 'var(--ink-soft)',
        border: '1px solid var(--line-strong)',
        borderRadius: 8,
        padding: 8,
        fontWeight: 700,
        cursor: 'pointer',
        fontSize: 12
      }
    }, "🖨️ Imprimir"), React.createElement("button", {
      onClick: () => {
        setWaFor(waFor === r.id ? null : r.id);
        setWaPhone('');
      },
      style: {
        flex: 1,
        background: 'var(--ok-bg)',
        color: 'var(--ok-text)',
        border: 'none',
        borderRadius: 8,
        padding: 8,
        fontWeight: 700,
        cursor: 'pointer',
        fontSize: 12
      }
    }, "📲 WhatsApp")), waFor === r.id && React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 8
      }
    }, React.createElement("input", {
      value: waPhone,
      onChange: e => setWaPhone(e.target.value),
      placeholder: "Teléfono (10 dígitos)",
      style: {
        ...inputStyle,
        marginBottom: 0,
        flex: 1
      }
    }), React.createElement("button", {
      onClick: () => {
        window.open(waGuiaLink(r, waPhone), '_blank');
        setWaFor(null);
      },
      style: {
        background: '#25d366',
        color: 'var(--ink)',
        border: 'none',
        borderRadius: 8,
        padding: '0 14px',
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "➤")));
  })), tab === 'historial' && React.createElement(React.Fragment, null, hist.length > 0 && React.createElement("button", {
    onClick: exportarHistorialCSV,
    style: {
      width: '100%',
      background: 'var(--surface)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 12,
      marginBottom: 14
    }
  }, "📤 Exportar CSV"), hist.length === 0 && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: 'var(--ink-faint)',
      padding: '20px 0'
    }
  }, "Sin historial aún"), hist.map(r => {
    const dur = r.fechaSalidaReal && r.fechaRegresoReal ? Math.round((new Date(r.fechaRegresoReal) - new Date(r.fechaSalidaReal)) / 60000) + ' min' : '—';
    return React.createElement("div", {
      key: r.id,
      style: {
        background: 'var(--surface)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10
      }
    }, React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 4
      }
    }, React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 14
      }
    }, r.repartidorNombre), React.createElement("span", {
      style: {
        background: ESTADOS[r.estado].color + '22',
        color: ESTADOS[r.estado].color,
        borderRadius: 20,
        padding: '2px 9px',
        fontSize: 11,
        fontWeight: 700
      }
    }, ESTADOS[r.estado].label)), React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-soft)'
      }
    }, "🚐 ", r.vehiculo || '—', " · 📍 ", r.zona || '—', " · ⏱ ", dur));
  })), qrModalFor && React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: '#1B1D19cc',
      zIndex: 310,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 16,
      padding: 24,
      maxWidth: 320,
      width: '90%',
      textAlign: 'center'
    }
  }, React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 2
    }
  }, qrModalFor.nombre), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-faint)',
      marginBottom: 14
    }
  }, qrModalFor.telefono || ''), React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 12,
      padding: 14,
      minHeight: 260,
      minWidth: 260,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, qrDataURL ? React.createElement("img", {
    src: qrDataURL,
    style: {
      width: 232,
      height: 232
    }
  }) : React.createElement("span", {
    style: {
      color: 'var(--ink-soft)',
      fontSize: 12
    }
  }, "Generando…")), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 16
    }
  }, React.createElement("button", {
    onClick: () => imprimirQR(qrModalFor, qrDataURL),
    style: {
      flex: 1,
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 13
    },
    disabled: !qrDataURL
  }, "🖨️ Imprimir"), React.createElement("button", {
    onClick: () => setQrModalFor(null),
    style: {
      flex: 1,
      background: 'var(--surface-2)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 13
    }
  }, "Cerrar")))), clienteScanOpen && React.createElement(ClienteScanner, {
    onDetected: onScanCliente,
    onClose: () => setClienteScanOpen(false)
  }), ventaRapida && React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      background: '#1B1D19cc',
      zIndex: 310,
      display: 'flex',
      alignItems: 'flex-end'
    }
  }, React.createElement("div", {
    style: {
      background: 'var(--surface)',
      width: '100%',
      maxWidth: 420,
      margin: '0 auto',
      borderRadius: '18px 18px 0 0',
      padding: 20,
      maxHeight: '88vh',
      overflowY: 'auto'
    }
  }, !ventaRapida.done ? React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 4
    }
  }, React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 700
    }
  }, "🧾 Venta — ", ventaRapida.cliente.nombre), React.createElement("button", {
    onClick: () => setVentaRapida(null),
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--ink-soft)',
      fontSize: 20,
      cursor: 'pointer'
    }
  }, "✕")), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 14
    }
  }, "📍 Se guarda con tu ubicación actual, para verificar la visita en campo."), rutasActivasVenta.length > 1 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: lblStyle
  }, "Transferencia activa"), React.createElement("select", {
    value: ventaRapida.rutaId,
    onChange: e => {
      setVentaRapida(v => ({ ...v, rutaId: e.target.value, items: [] }));
      setVentaProdSearch('');
    },
    style: Object.assign({}, inputStyle, { marginBottom: 12 })
  }, React.createElement("option", { value: "" }, "Selecciona la transferencia…"), rutasActivasVenta.map(r => React.createElement("option", { key: r.id, value: r.id }, (r.repartidorNombre || 'Sin repartidor') + (r.vehiculo ? ' · ' + r.vehiculo : ''))))), React.createElement("div", {
    style: lblStyle
  }, "Agregar productos de la transferencia"), React.createElement("input", {
    value: ventaProdSearch,
    onChange: e => setVentaProdSearch(e.target.value),
    placeholder: "Buscar producto…",
    style: inputStyle
  }), React.createElement("div", {
    style: {
      maxHeight: 150,
      overflowY: 'auto',
      marginBottom: 12
    }
  }, productos.filter(p => {
    return saldoDisponibleTransferencia(ventaRapida.rutaId, p.id) > 0 && p.nombre.toLowerCase().includes(ventaProdSearch.toLowerCase());
  }).map(p => React.createElement("div", {
    key: p.id,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '7px 0',
      borderBottom: '1px solid var(--line)'
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 12
    }
  }, p.nombre), React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--accent)'
    }
  }, fmtx(p.precio), " · Saldo libre: ", saldoDisponibleTransferencia(ventaRapida.rutaId, p.id))), React.createElement("button", {
    onClick: () => addProdVenta(p),
    style: {
      background: 'var(--info-bg)',
      color: 'var(--info-text)',
      border: 'none',
      borderRadius: 6,
      padding: '4px 10px',
      fontSize: 11,
      cursor: 'pointer'
    }
  }, "+ Agregar")))), ventaRapida.items.length > 0 && React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 6
    }
  }, "CARRITO"), ventaRapida.items.map(it => React.createElement("div", {
    key: it.id,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6
    }
  }, React.createElement("span", {
    style: {
      fontSize: 12,
      flex: 1
    }
  }, it.nombre), React.createElement("input", {
    type: "text",
    inputMode: "numeric",
    value: it.cant === undefined ? '' : it.cant,
    onChange: e => updQtyVenta(it.id, e.target.value),
    style: {
      width: 36,
      textAlign: 'center',
      fontSize: 12,
      background: 'var(--surface-2)',
      border: '1px solid var(--line-strong)',
      borderRadius: 6,
      color: 'var(--ink)',
      padding: '3px 2px'
    }
  })))), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 14
    }
  }, [['contado', '💵 Contado', 'var(--ok-bg)', 'var(--ok-text)'], ['credito', '📋 Crédito', 'var(--warn-bg)', 'var(--warn-text)']].map(([v, l, bg, col]) => React.createElement("button", {
    key: v,
    onClick: () => setVentaRapida(vv => ({
      ...vv,
      pago: v
    })),
    style: {
      flex: 1,
      padding: 9,
      borderRadius: 8,
      border: 'none',
      background: ventaRapida.pago === v ? bg : 'var(--surface-2)',
      color: ventaRapida.pago === v ? col : 'var(--ink-soft)',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), React.createElement("button", {
    onClick: guardarVentaRapida,
    disabled: ventaRapida.saving,
    style: {
      width: '100%',
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 12,
      fontWeight: 700,
      cursor: 'pointer',
      opacity: ventaRapida.saving ? 0.6 : 1
    }
  }, ventaRapida.saving ? 'Guardando…' : '💾 Guardar venta')) : React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '10px 0'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 44,
      marginBottom: 8
    }
  }, "✅"), React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Venta guardada"), React.createElement("div", {
    style: {
      color: 'var(--ink-soft)',
      marginBottom: 6
    }
  }, ventaRapida.cliente.nombre, " · ", fmtx(ventaRapida.done.total)), React.createElement("div", {
    style: {
      fontSize: 11,
      color: ventaRapida.done.validacionVisita?.ok === false ? 'var(--danger-text)' : ventaRapida.done.validacionVisita?.ok === true ? 'var(--ok)' : 'var(--warn-text)',
      marginBottom: 20
    }
  }, ventaRapida.done.validacionVisita?.ok === true ? '✓ Visita validada' : ventaRapida.done.validacionVisita?.ok === false ? '⚠️ Visita fuera del rango permitido' : '— Validación no disponible'), ventaRapida.cliente.telefono && React.createElement("button", {
    onClick: () => window.open(waVentaLink(ventaRapida.cliente, ventaRapida.done.items, ventaRapida.done.total, ventaRapida.done.pago), '_blank'),
    style: {
      width: '100%',
      background: '#25d366',
      color: 'var(--ink)',
      border: 'none',
      borderRadius: 8,
      padding: 12,
      fontWeight: 700,
      cursor: 'pointer',
      marginBottom: 10
    }
  }, "📲 Enviar ticket por WhatsApp"), React.createElement("button", {
    onClick: () => setVentaRapida(null),
    style: {
      width: '100%',
      background: 'var(--surface-2)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 12,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, "Cerrar"))))));
}