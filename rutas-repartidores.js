/* rutas-repartidores.js — Productos de la Costa
 * Módulo independiente: asigna repartidor/vehículo/zona/fecha a una ruta,
 * maneja estados (pendiente → en_curso → completada/cancelada) y
 * geolocalización en vivo (inicio, fin, tracking mientras está en curso).
 *
 * No modifica index.html ni la colección `rutas` que ya usa la pantalla
 * "Ruta de reparto" (cargar camión / entregas). Guarda su propia
 * colección `rutas_meta` en Firestore, así que es 100% aditivo.
 *
 * Integración en index.html: agrega esta línea justo después del
 * <script type="text/babel"> principal (antes del script de registro
 * del Service Worker):
 *
 *   <script type="text/babel" src="./rutas-repartidores.js"></script>
 */
(function () {
  'use strict';

  // ---- Carga de Leaflet (mapa) bajo demanda, sin tocar el <head> original ----
  let leafletLoading = false;
  function ensureLeaflet(cb) {
    if (window.L) { cb(); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (leafletLoading) {
      const check = setInterval(() => { if (window.L) { clearInterval(check); cb(); } }, 200);
      return;
    }
    leafletLoading = true;
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { leafletLoading = false; cb(); };
    script.onerror = () => { leafletLoading = false; cb(); };
    document.body.appendChild(script);
  }

  // ---- Carga de QRCode.js (generación de QR) bajo demanda ----
  let qrLibLoading = false;
  function ensureQRCodeLib(cb) {
    if (window.QRCode) { cb(); return; }
    if (qrLibLoading) { const check = setInterval(() => { if (window.QRCode) { clearInterval(check); cb(); } }, 200); return; }
    qrLibLoading = true;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => { qrLibLoading = false; cb(); };
    script.onerror = () => { qrLibLoading = false; cb(); };
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
        new window.QRCode(holder, { text, width: size, height: size, correctLevel: window.QRCode.CorrectLevel.M });
        setTimeout(() => {
          const canvas = holder.querySelector('canvas');
          const img = holder.querySelector('img');
          const url = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
          document.body.removeChild(holder);
          cb(url);
        }, 150);
      } catch (e) { document.body.removeChild(holder); cb(null); }
    });
  }


  const fbApp = firebase.app();
  const dbx = fbApp.firestore();
  const authx = fbApp.auth();

  const { useState, useEffect, useRef } = React;

  const fDateTime = d => d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtx = n => '$' + Number(n || 0).toFixed(2);

  // ---- Comprobante / guía de ruta ----
  function itemsCargadosDe(r) {
    if (Array.isArray(r.items)) return r.items.map(it => ({ nombre: it.nombre, cant: it.cant }));
    return Object.values(r.items || {}).map(it => ({ nombre: it.nombre, cant: it.cantCargada }));
  }
  function resumenRuta(r) {
    const entregas = r.entregas || [];
    const totalVendido = entregas.reduce((s, e) => s + (e.total || 0), 0);
    return { entregas, totalVendido, cargados: itemsCargadosDe(r) };
  }
  function guiaHTML(r) {
    const { entregas, totalVendido, cargados } = resumenRuta(r);
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
      <div class="sub">${fDateTime(r.fecha)} · Estado: ${r.estado === 'activa' ? 'en curso' : (r.estado || 'cerrada')}</div>
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
    if (!w) { alert('Habilita las ventanas emergentes para imprimir la guía.'); return; }
    w.document.write(guiaHTML(r));
    w.document.close();
  }
  function waGuiaLink(r, telefono) {
    const { entregas, totalVendido, cargados } = resumenRuta(r);
    const lineasCarga = cargados.map(it => `• ${it.nombre} x${it.cant}`).join('\n');
    const lineasEnt = entregas.map(e => `• ${e.clienteNombre}: ${fmtx(e.total)} (${e.formaPago})`).join('\n');
    const texto = `🚚 *GUÍA DE RUTA*\n📅 ${fDateTime(r.fecha)}\n\n*Cargamento:*\n${lineasCarga || 'Sin productos'}\n\n*Entregas (${entregas.length}):*\n${lineasEnt || 'Sin entregas'}\n\n💰 *Total vendido: ${fmtx(totalVendido)}*`;
    let tel = (telefono || '').replace(/\D/g, '');
    if (tel && !tel.startsWith('52') && tel.length <= 10) tel = '52' + tel;
    return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
  }

  // ---- Exportar CSV ----
  // downloadCSV() vive fuera del componente (no tiene closure sobre
  // currentUser), así que el permiso se guarda en esta variable de módulo,
  // actualizada en cada render de RepartidoresPanel según permisoAcciones().
  let _permisoCSV = true;
  function csvEscape(v) {
    const s = String(v === undefined || v === null ? '' : v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    return rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
  }
  function downloadCSV(filename, rows) {
    if (!_permisoCSV) { alert('No tienes permiso para descargar reportes en CSV. Pídele a un administrador que te lo active en Configuración → Permisos.'); return; }
    const csv = '\uFEFF' + toCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
    pendiente: { label: 'Pendiente', color: '#8B8F84' }, // var(--ink-faint)
    en_curso: { label: 'En curso', color: '#3E7CA6' }, // var(--info)
    completada: { label: 'Completada', color: '#2E8B45' }, // var(--ok)
    cancelada: { label: 'Cancelada', color: '#C23B2E' }, // var(--danger)
  };

  function getLoc() {
    return new Promise(res => {
      if (!navigator.geolocation) { res(null); return; }
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude, fecha: new Date().toISOString() }),
        () => res(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  // ---- Mapa offline (una sola zona fija, descargada bajo demanda) ----
  // Matemática estándar de "slippy map tiles" (la misma que usan
  // OpenStreetMap/Leaflet) para convertir lat/lng a coordenadas de tile.
  function lonLatATile(lat, lng, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  }
  function tilesParaZona(bounds, zMin, zMax) {
    const tiles = [];
    for (let z = zMin; z <= zMax; z++) {
      const nw = lonLatATile(bounds.getNorth(), bounds.getWest(), z);
      const se = lonLatATile(bounds.getSouth(), bounds.getEast(), z);
      for (let x = nw.x; x <= se.x; x++) {
        for (let y = nw.y; y <= se.y; y++) tiles.push({ z, x, y });
      }
    }
    return tiles;
  }
  const MAPA_OFFLINE_KEY = 'pdlc_mapa_offline_v1';

  const inputStyle = { background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: '8px 10px', color: 'var(--ink)', fontSize: 13, width: '100%', boxSizing: 'border-box', marginBottom: 10 };
  const lblStyle = { fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.5px' };
  const uidx = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function totalesParadas(paradas) {
    const map = {};
    (paradas || []).forEach(p => (p.items || []).forEach(it => {
      map[it.id] = map[it.id] || { nombre: it.nombre, cant: 0 };
      map[it.id].cant += it.cant;
    }));
    return Object.values(map);
  }

  // ---- Armador de paradas: elige cliente + productos a llevar ----
  function ParadaBuilder({ clientes, productos, paradas, onChange }) {
    const [cliSearch, setCliSearch] = useState('');
    const [cliSel, setCliSel] = useState(null);
    const [prodSearch, setProdSearch] = useState('');
    const [draftItems, setDraftItems] = useState([]);
    const cliFilt = clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliSearch.toLowerCase()));
    const prodFilt = productos.filter(p => p.nombre.toLowerCase().includes(prodSearch.toLowerCase()));

    const addProd = p => setDraftItems(items => {
      const ex = items.find(x => x.id === p.id);
      return ex ? items.map(x => x.id === p.id ? { ...x, cant: x.cant + 1 } : x) : [...items, { id: p.id, nombre: p.nombre, cant: 1 }];
    });
    const updQty = (id, v) => { if (v < 1) { setDraftItems(items => items.filter(x => x.id !== id)); return; } setDraftItems(items => items.map(x => x.id === id ? { ...x, cant: v } : x)); };

    const agregarParada = () => {
      if (!cliSel || draftItems.length === 0) return;
      onChange([...(paradas || []), { id: uidx(), clienteId: cliSel.id, clienteNombre: cliSel.nombre, clienteTelefono: cliSel.telefono || '', items: draftItems, visitado: false }]);
      setCliSel(null); setCliSearch(''); setDraftItems([]); setProdSearch('');
    };
    const quitarParada = id => onChange((paradas || []).filter(p => p.id !== id));

    return (
      <div>
        {(paradas || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {paradas.map((p, i) => (
              <div key={p.id} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}. {p.clienteNombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{p.items.map(it => `${it.nombre} x${it.cant}`).join(', ')}</div>
                </div>
                <button onClick={() => quitarParada(p.id)} style={{ background: 'none', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={lblStyle}>Cliente a visitar</div>
        {cliSel ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{cliSel.nombre}</span>
            <button onClick={() => setCliSel(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <>
            <input value={cliSearch} onChange={e => setCliSearch(e.target.value)} placeholder="Buscar cliente…" style={inputStyle} />
            <div style={{ maxHeight: 130, overflowY: 'auto', marginBottom: 10 }}>
              {cliFilt.map(c => (
                <div key={c.id} onClick={() => setCliSel(c)} style={{ padding: '7px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>{c.nombre}</div>
              ))}
            </div>
          </>
        )}
        {cliSel && <>
          <div style={lblStyle}>Productos a llevar</div>
          <input value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="Buscar producto…" style={inputStyle} />
          <div style={{ maxHeight: 130, overflowY: 'auto', marginBottom: 10 }}>
            {prodFilt.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 12 }}>{p.nombre}</span>
                <button onClick={() => addProd(p)} style={{ background: 'var(--info-bg)', color: 'var(--info-text)', border: 'none', borderRadius: 6, padding: '3px 9px', fontSize: 11, cursor: 'pointer' }}>+ Agregar</button>
              </div>
            ))}
          </div>
          {draftItems.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {draftItems.map(it => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, flex: 1 }}>{it.nombre}</span>
                  <button onClick={() => updQty(it.id, it.cant - 1)} style={{ background: 'var(--line-strong)', border: 'none', color: 'var(--ink)', borderRadius: 6, width: 22, height: 22, cursor: 'pointer' }}>-</button>
                  <input type="number" min="1" value={it.cant} onChange={e => { const v = e.target.value; if (v === '') return; const n = parseInt(v); if (!isNaN(n) && n >= 1) updQty(it.id, n); }} onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) updQty(it.id, 1); }} style={{ width: 36, textAlign: 'center', fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 6, color: 'var(--ink)', padding: '3px 2px' }} />
                  <button onClick={() => updQty(it.id, it.cant + 1)} style={{ background: 'var(--line-strong)', border: 'none', color: 'var(--ink)', borderRadius: 6, width: 22, height: 22, cursor: 'pointer' }}>+</button>
                </div>
              ))}
              <button onClick={agregarParada} style={{ width: '100%', background: 'var(--ok-bg)', color: 'var(--ok-text)', border: 'none', borderRadius: 8, padding: 9, fontWeight: 700, cursor: 'pointer', fontSize: 12, marginTop: 4 }}>✓ Agregar parada</button>
            </div>
          )}
        </>}
      </div>
    );
  }

  function imprimirQRHTML(cliente, dataURL) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>QR — ${cliente.nombre}</title>
      <style>
        *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}
        body{padding:24px;color:#1B1D19;text-align:center}
        img{width:240px;height:240px;margin:12px auto}
        h1{font-size:18px;margin-bottom:2px}
        p{color:#585D53;font-size:13px}
        @media print{ button{display:none} }
      </style></head><body>
      <h1>${cliente.nombre}</h1>
      <p>${cliente.telefono || ''}${cliente.domicilio ? ' · ' + cliente.domicilio : ''}</p>
      ${dataURL ? `<img src="${dataURL}"/>` : '<p>No se pudo generar el QR</p>'}
      <p>Escanea este código al entregar para abrir la nota de este cliente.</p>
      <button onclick="window.print()" style="margin-top:14px;background:#E8A400;border:none;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer">🖨️ Imprimir</button>
      </body></html>`;
  }
  function imprimirQR(cliente, dataURL) {
    const w = window.open('', '_blank');
    if (!w) { alert('Habilita las ventanas emergentes para imprimir el QR.'); return; }
    w.document.write(imprimirQRHTML(cliente, dataURL));
    w.document.close();
  }

  // ---- Escáner de QR de cliente (usa Html5Qrcode, ya cargado por index.html) ----
  function ClienteScanner({ onDetected, onClose }) {
    const [elId] = useState(() => 'cli-scanner-' + uidx());
    const [err, setErr] = useState('');
    useEffect(() => {
      if (typeof window.Html5Qrcode === 'undefined') { setErr('No se pudo cargar la librería de escaneo.'); return; }
      let scanner = null, stopped = false, cancelled = false;
      (async () => {
        try {
          scanner = new window.Html5Qrcode(elId);
          await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } },
            decodedText => {
              if (stopped || cancelled) return;
              stopped = true;
              scanner.stop().then(() => scanner.clear()).catch(() => {});
              onDetected(decodedText);
            }, () => {});
        } catch (e) { if (!cancelled) setErr('No se pudo acceder a la cámara. Revisa los permisos del navegador.'); }
      })();
      return () => {
        cancelled = true;
        if (scanner && !stopped) { stopped = true; try { scanner.stop().then(() => scanner.clear()).catch(() => {}); } catch (e) {} }
      };
    }, []);
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#1B1D19cc', zIndex: 320, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 420, margin: '0 auto', borderRadius: '18px 18px 0 0', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>📷 Escanear QR de cliente</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 20, cursor: 'pointer' }}>✕</button>
          </div>
          {err ? <div style={{ fontSize: 13, color: 'var(--danger-text)', textAlign: 'center', padding: '24px 0' }}>{err}</div>
            : <div id={elId} style={{ width: '100%', borderRadius: 10, overflow: 'hidden', background: '#000' }} />}
        </div>
      </div>
    );
  }


  function RepartidoresPanel() {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState('activas');
    const [currentUser, setCurrentUser] = useState(null);
    const [usuarios, setUsuarios] = useState([]);
    const [rutas, setRutas] = useState([]);
    const [rutasReales, setRutasReales] = useState([]);
    const [productos, setProductos] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [planEditFor, setPlanEditFor] = useState(null);
    const [expandPlan, setExpandPlan] = useState(null);
    const [waFor, setWaFor] = useState(null);
    const [waPhone, setWaPhone] = useState('');
    const [expandComp, setExpandComp] = useState(null);
    const [form, setForm] = useState(null);
    const [msg, setMsg] = useState('');
    const [mapReady, setMapReady] = useState(false);
    const [mapaOffline, setMapaOffline] = useState(() => {
      try { return JSON.parse(localStorage.getItem(MAPA_OFFLINE_KEY) || 'null'); } catch (e) { return null; }
    });
    const [descargandoMapa, setDescargandoMapa] = useState(null); // {hecho, total} | null
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
    const [ventaRapida, setVentaRapida] = useState(null); // {cliente, items, pago, ubicacion, saving}
    const [ventaProdSearch, setVentaProdSearch] = useState('');
    const [invSubTab, setInvSubTab] = useState('conteo');
    const [conteoDraft, setConteoDraft] = useState({});
    const [conteoSearch, setConteoSearch] = useState('');
    const [conteoMotivo, setConteoMotivo] = useState('Conteo físico de bodega');
    const [conteoSaving, setConteoSaving] = useState(false);
    const [devoluciones, setDevoluciones] = useState([]);
    const [devProdSearch, setDevProdSearch] = useState('');
    const [devProdSel, setDevProdSel] = useState(null);
    const [devCliSearch, setDevCliSearch] = useState('');
    const [devCliSel, setDevCliSel] = useState(null);
    const [devCantidad, setDevCantidad] = useState(1);
    const [devMotivo, setDevMotivo] = useState('dañado');
    const [devAccion, setDevAccion] = useState('reingreso');
    const [devSaving, setDevSaving] = useState(false);
    const [respaldoSubTab, setRespaldoSubTab] = useState('respaldo');
    const [ubicFecha, setUbicFecha] = useState(() => new Date().toISOString().slice(0, 10));
    const [ubicNotas, setUbicNotas] = useState(null);
    const [ubicLoading, setUbicLoading] = useState(false);
    const [backupMeta, setBackupMeta] = useState(null);
    const [backupGenerating, setBackupGenerating] = useState(false);
    const [reporteRango, setReporteRango] = useState('semana');
    const [reporteDesde, setReporteDesde] = useState('');
    const [reporteHasta, setReporteHasta] = useState('');
    const [reporteData, setReporteData] = useState(null);
    const [reporteGenerating, setReporteGenerating] = useState(false);
    const [reporteEmail, setReporteEmail] = useState('');
    const [clientesQrGenerating, setClientesQrGenerating] = useState(false);
    const [ventasSemanaGenerating, setVentasSemanaGenerating] = useState(false);
    const [nominaVendedorId, setNominaVendedorId] = useState('');
    const [nominaRango, setNominaRango] = useState('semana');
    const [nominaDesde, setNominaDesde] = useState('');
    const [nominaHasta, setNominaHasta] = useState('');
    const [nominaData, setNominaData] = useState(null);
    const [nominaGenerating, setNominaGenerating] = useState(false);

    const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

    useEffect(() => {
      const unsub = authx.onAuthStateChanged(async u => {
        if (!u) { setCurrentUser(null); return; }
        try {
          const snap = await dbx.collection('usuarios').doc(u.uid).get();
          setCurrentUser({ uid: u.uid, ...(snap.exists ? snap.data() : { nombre: u.email, email: u.email, role: 'usuario' }) });
        } catch (e) {
          setCurrentUser({ uid: u.uid, nombre: u.email, email: u.email, role: 'usuario' });
        }
      });
      return unsub;
    }, []);

    useEffect(() => {
      if (!currentUser) return;
      const unsub = dbx.collection('rutas_meta').orderBy('fechaCreacion', 'desc').limit(200)
        .onSnapshot(snap => setRutas(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      let unsubU = () => {};
      if (currentUser.role === 'admin') {
        unsubU = dbx.collection('usuarios').onSnapshot(snap => setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      }
      const unsubR = dbx.collection('rutas').orderBy('fecha', 'desc').limit(100)
        .onSnapshot(snap => setRutasReales(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      const unsubP = dbx.collection('productos').onSnapshot(snap => setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      const unsubC = dbx.collection('clientes').onSnapshot(snap => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      const unsubD = dbx.collection('devoluciones').orderBy('fecha', 'desc').limit(100).onSnapshot(snap => setDevoluciones(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
      let unsubB = () => {};
      if (currentUser.role === 'admin') {
        unsubB = dbx.collection('_meta').doc('backups').onSnapshot(snap => setBackupMeta(snap.exists ? snap.data() : null), () => {});
      }
      return () => { unsub(); unsubU(); unsubR(); unsubP(); unsubC(); unsubD(); unsubB(); };
    }, [currentUser]);

    const actualizarParadas = async (rutaId, nuevasParadas) => {
      try { await dbx.collection('rutas_meta').doc(rutaId).update({ paradas: nuevasParadas }); }
      catch (e) { flash('❌ ' + e.message); }
    };

    const [confirmFor, setConfirmFor] = useState(null); // {rutaId, paradaId}
    const [confirmItems, setConfirmItems] = useState([]);
    const [confirmPago, setConfirmPago] = useState('contado');
    const [confirmSaving, setConfirmSaving] = useState(false);

    const abrirConfirmacion = (r, p) => {
      setConfirmFor({ rutaId: r.id, paradaId: p.id });
      setConfirmItems(p.items.map(it => ({ ...it })));
      setConfirmPago('contado');
    };
    const updConfirmQty = (id, v) => {
      if (v < 1) { setConfirmItems(items => items.filter(x => x.id !== id)); return; }
      setConfirmItems(items => items.map(x => x.id === id ? { ...x, cant: v } : x));
    };

    const confirmarEntrega = async (r, p) => {
      if (confirmItems.length === 0) { flash('⚠️ Agrega al menos un producto'); return; }
      setConfirmSaving(true);
      try {
        const faltantes = [];
        confirmItems.forEach(item => {
          const prod = productos.find(x => x.id === item.id);
          if (!prod || prod.stock < item.cant) faltantes.push(`${item.nombre} (disp: ${prod ? prod.stock : 0}, pedido: ${item.cant})`);
        });
        if (faltantes.length > 0) { flash('❌ Sin stock: ' + faltantes.join(', ')); setConfirmSaving(false); return; }

        const total = confirmItems.reduce((s, it) => {
          const prod = productos.find(x => x.id === it.id);
          return s + (prod ? prod.precio : 0) * it.cant;
        }, 0);
        const itemsConPrecio = confirmItems.map(it => {
          const prod = productos.find(x => x.id === it.id);
          return { id: it.id, nombre: it.nombre, cant: it.cant, precio: prod ? prod.precio : 0 };
        });
        const loc = await getLoc();
        const clienteReg = clientes.find(x => x.id === p.clienteId);
        const ubicacionVenta = (loc && clienteReg && clienteReg.ubicacion)
          ? { ok: distanciaMetros(loc.lat, loc.lng, clienteReg.ubicacion.lat, clienteReg.ubicacion.lng) <= RADIO_VISITA_METROS,
              distanciaM: Math.round(distanciaMetros(loc.lat, loc.lng, clienteReg.ubicacion.lat, clienteReg.ubicacion.lng)) }
          : { ok: null, distanciaM: null };

        const batch = dbx.batch();
        const notaRef = dbx.collection('notas').doc();
        batch.set(notaRef, {
          fecha: new Date().toISOString(), clienteId: p.clienteId, clienteNombre: p.clienteNombre,
          clienteTelefono: p.clienteTelefono || '', items: itemsConPrecio, total, formaPago: confirmPago,
          rutaMetaId: r.id, ubicacionVenta, capturadoPorUid: currentUser.uid, capturadoPorNombre: currentUser.nombre || '',
        });
        if (confirmPago === 'credito') {
          batch.set(dbx.collection('creditos').doc(), {
            notaId: notaRef.id, clienteId: p.clienteId, clienteNombre: p.clienteNombre,
            fecha: new Date().toISOString(), total, saldo: total, abonos: [],
          });
        }
        itemsConPrecio.forEach(it => {
          batch.update(dbx.collection('productos').doc(it.id), { stock: firebase.firestore.FieldValue.increment(-it.cant) });
        });
        await batch.commit();

        const nuevas = (r.paradas || []).map(x => x.id === p.id
          ? { ...x, visitado: true, notaId: notaRef.id, totalEntregado: total, formaPago: confirmPago, fechaEntrega: new Date().toISOString() }
          : x);
        await actualizarParadas(r.id, nuevas);
        setConfirmFor(null);
        flash('✅ Entrega registrada — ' + fmtx(total));
      } catch (e) { flash('❌ ' + e.message); }
      setConfirmSaving(false);
    };

    // ---- Mapa ----
    // Descarga los tiles de la zona que se ve ahora mismo en el mapa (la
    // "zona fija" del negocio: se navega una vez hasta ahí, se descarga, y
    // queda disponible sin conexión desde entonces en este dispositivo).
    const descargarZonaOffline = async () => {
      if (!mapInstance.current) return;
      const bounds = mapInstance.current.getBounds();
      const zActual = Math.round(mapInstance.current.getZoom());
      const zMin = Math.max(zActual, 12), zMax = Math.min(zActual + 3, 17);
      const tiles = tilesParaZona(bounds, zMin, zMax);
      if (tiles.length > 3500) { flash('⚠️ La zona visible es muy grande (' + tiles.length + ' tiles). Acércate más con el zoom antes de descargar.'); return; }
      if (!confirm('Se van a descargar ' + tiles.length + ' imágenes de mapa (~' + Math.max(1, Math.round(tiles.length * 15 / 1024)) + ' MB aprox., zoom ' + zMin + '–' + zMax + '). ¿Continuar?')) return;
      setDescargandoMapa({ hecho: 0, total: tiles.length });
      const cola = [...tiles];
      let hecho = 0;
      const trabajador = async () => {
        while (cola.length) {
          const t = cola.shift();
          try { await fetch(`https://a.tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`); } catch (e) { /* se reintenta la próxima vez que se pida ese tile */ }
          hecho++; setDescargandoMapa({ hecho, total: tiles.length });
        }
      };
      await Promise.all(Array.from({ length: 6 }, trabajador)); // 6 descargas en paralelo
      const meta = { fecha: new Date().toISOString(), tileCount: tiles.length, zMin, zMax,
        bounds: { n: bounds.getNorth(), s: bounds.getSouth(), e: bounds.getEast(), w: bounds.getWest() } };
      localStorage.setItem(MAPA_OFFLINE_KEY, JSON.stringify(meta));
      setMapaOffline(meta);
      setDescargandoMapa(null);
      flash('✅ Zona de mapa lista para uso sin conexión');
    };
    const borrarMapaOffline = async () => {
      if (!confirm('¿Borrar el mapa descargado de este dispositivo?')) return;
      try { if ('caches' in window) await caches.delete('distribupanel-tiles-v1'); } catch (e) { /* noop */ }
      localStorage.removeItem(MAPA_OFFLINE_KEY);
      setMapaOffline(null);
      flash('🗑️ Mapa offline borrado');
    };
    useEffect(() => {
      if (!open || tab !== 'mapa') return;
      ensureLeaflet(() => {
        if (!window.L || !mapRef.current) return;
        setTimeout(() => {
          if (!mapInstance.current && mapRef.current) {
            mapInstance.current = window.L.map(mapRef.current).setView([23.6, -102.5], 5);
            window.L.tileLayer('https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapInstance.current);
          }
          setMapReady(true);
          if (mapInstance.current) setTimeout(() => mapInstance.current.invalidateSize(), 100);
        }, 50);
      });
    }, [open, tab]);

    useEffect(() => {
      if (!mapReady || !mapInstance.current) return;
      const activas = rutas.filter(r => r.estado === 'en_curso' && r.ubicacionActual);
      Object.keys(markersRef.current).forEach(id => {
        if (!activas.find(r => r.id === id)) { mapInstance.current.removeLayer(markersRef.current[id]); delete markersRef.current[id]; }
      });
      const pts = [];
      activas.forEach(r => {
        const { lat, lng } = r.ubicacionActual;
        pts.push([lat, lng]);
        const popup = `<b>${r.repartidorNombre || '—'}</b><br/>${r.vehiculo || ''}<br/>${r.zona || ''}`;
        if (markersRef.current[r.id]) {
          markersRef.current[r.id].setLatLng([lat, lng]).setPopupContent(popup);
        } else {
          markersRef.current[r.id] = window.L.marker([lat, lng]).addTo(mapInstance.current).bindPopup(popup);
        }
      });
      if (pts.length) mapInstance.current.fitBounds(pts, { maxZoom: 14, padding: [30, 30] });
    }, [rutas, mapReady]);

    const crear = async () => {
      if (!form.repartidorNombre) { flash('⚠️ Falta el repartidor'); return; }
      try {
        await dbx.collection('rutas_meta').add({
          repartidorId: form.repartidorId || currentUser.uid,
          repartidorNombre: form.repartidorNombre,
          vehiculo: form.vehiculo || '',
          zona: form.zona || '',
          fechaProgramada: form.fechaProgramada ? new Date(form.fechaProgramada).toISOString() : '',
          fechaRegresoProgramada: form.fechaRegresoProgramada ? new Date(form.fechaRegresoProgramada).toISOString() : '',
          estado: 'pendiente',
          fechaCreacion: new Date().toISOString(),
          paradas: form.paradas || [],
        });
        setForm(null);
        flash('✅ Ruta programada');
      } catch (e) { flash('❌ ' + e.message); }
    };

    const iniciar = async r => {
      const loc = await getLoc();
      try {
        await dbx.collection('rutas_meta').doc(r.id).update({
          estado: 'en_curso',
          fechaSalidaReal: new Date().toISOString(),
          ...(loc ? { ubicacionInicio: loc, ubicacionActual: loc } : {}),
        });
        flash('🚀 Ruta iniciada');
      } catch (e) { flash('❌ ' + e.message); }
    };

    const completar = async r => {
      if (tracking === r.id) detenerSeguimiento();
      const loc = await getLoc();
      try {
        await dbx.collection('rutas_meta').doc(r.id).update({
          estado: 'completada',
          fechaRegresoReal: new Date().toISOString(),
          ...(loc ? { ubicacionFin: loc } : {}),
        });
        flash('🏁 Ruta completada');
      } catch (e) { flash('❌ ' + e.message); }
    };

    const cancelar = async r => {
      if (!confirm('¿Cancelar esta ruta programada?')) return;
      await dbx.collection('rutas_meta').doc(r.id).update({ estado: 'cancelada' });
      flash('Ruta cancelada');
    };

    // ---- QR de cliente ----
    const verQR = cliente => {
      setQrModalFor(cliente); setQrDataURL(null);
      renderQRDataURL(qrTextForCliente(cliente.id), 260, url => setQrDataURL(url));
    };
    const renderQRDataURLAsync = (text, size) => new Promise(res => renderQRDataURL(text, size, res));
    const togQrSel = id => setQrSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    // Genera todos los QR seleccionados y abre una sola hoja imprimible con
    // uno por tarjeta, en vez de una ventana por cliente.
    const imprimirQRsMasivo = async lista => {
      if (!lista.length || qrMasivoLoading) return;
      setQrMasivoLoading(true);
      try {
        const items = await Promise.all(lista.map(async c => ({ cliente: c, dataURL: await renderQRDataURLAsync(qrTextForCliente(c.id), 260) })));
        const w = window.open('', '_blank');
        if (!w) { alert('Habilita las ventanas emergentes para imprimir los QR.'); return; }
        const tarjetas = items.map(({ cliente, dataURL }) => `
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
      if (!nuevoCliForm.nombre) { flash('⚠️ Falta el nombre'); return; }
      try {
        // El repartidor está parado frente al cliente en este momento — se
        // captura su ubicación actual como domicilio de referencia, sin pedir
        // un paso extra. Si el GPS no está disponible, se guarda sin ella
        // (se puede agregar después desde Clientes en la app principal).
        const loc = await getLoc();
        const ref = await dbx.collection('clientes').add({
          nombre: nuevoCliForm.nombre, telefono: nuevoCliForm.telefono || '', domicilio: nuevoCliForm.domicilio || '', activo: true,
          ubicacion: loc || null,
        });
        setNuevoCliForm(null);
        flash(loc ? '✅ Cliente creado con ubicación' : '✅ Cliente creado (sin ubicación GPS)');
        verQR({ id: ref.id, nombre: nuevoCliForm.nombre, telefono: nuevoCliForm.telefono || '', domicilio: nuevoCliForm.domicilio || '' });
      } catch (e) { flash('❌ ' + e.message); }
    };

    // ---- Venta rápida (escaneo QR o búsqueda manual) ----
    const abrirVentaParaCliente = cliente => {
      setClienteScanOpen(false); setClienteBuscarOpen(false); setCliQSearch('');
      setVentaRapida({ cliente, items: [], pago: 'contado', saving: false });
    };
    const onScanCliente = text => {
      const id = parseClienteQR(text);
      const cli = clientes.find(c => c.id === id);
      if (!cli) { setClienteScanOpen(false); flash('⚠️ QR no reconocido como cliente'); return; }
      abrirVentaParaCliente(cli);
    };
    const addProdVenta = p => setVentaRapida(v => {
      const ex = v.items.find(x => x.id === p.id);
      const items = ex ? v.items.map(x => x.id === p.id ? { ...x, cant: x.cant + 1 } : x) : [...v.items, { id: p.id, nombre: p.nombre, cant: 1 }];
      return { ...v, items };
    });
    const updQtyVenta = (id, val) => setVentaRapida(v => ({ ...v, items: val < 1 ? v.items.filter(x => x.id !== id) : v.items.map(x => x.id === id ? { ...x, cant: val } : x) }));

    const guardarVentaRapida = async () => {
      if (!ventaRapida || ventaRapida.items.length === 0) { flash('⚠️ Agrega al menos un producto'); return; }
      setVentaRapida(v => ({ ...v, saving: true }));
      try {
        const faltantes = [];
        ventaRapida.items.forEach(item => {
          const prod = productos.find(x => x.id === item.id);
          if (!prod || prod.stock < item.cant) faltantes.push(`${item.nombre} (disp: ${prod ? prod.stock : 0})`);
        });
        if (faltantes.length > 0) { flash('❌ Sin stock: ' + faltantes.join(', ')); setVentaRapida(v => ({ ...v, saving: false })); return; }

        const itemsConPrecio = ventaRapida.items.map(it => {
          const prod = productos.find(x => x.id === it.id);
          return { id: it.id, nombre: it.nombre, cant: it.cant, precio: prod ? prod.precio : 0 };
        });
        const total = itemsConPrecio.reduce((s, it) => s + it.precio * it.cant, 0);
        const loc = await getLoc();
        // No se guarda la coordenada del repartidor en la nota — solo el
        // resultado de comparar contra la ubicación registrada del cliente
        // (ver distanciaMetros/RADIO_VISITA_METROS en app-core.js). Nunca
        // bloquea la venta, solo queda marcada para revisión del admin.
        const ubicacionVenta = (loc && ventaRapida.cliente.ubicacion)
          ? { ok: distanciaMetros(loc.lat, loc.lng, ventaRapida.cliente.ubicacion.lat, ventaRapida.cliente.ubicacion.lng) <= RADIO_VISITA_METROS,
              distanciaM: Math.round(distanciaMetros(loc.lat, loc.lng, ventaRapida.cliente.ubicacion.lat, ventaRapida.cliente.ubicacion.lng)) }
          : { ok: null, distanciaM: null };

        const batch = dbx.batch();
        const notaRef = dbx.collection('notas').doc();
        batch.set(notaRef, {
          fecha: new Date().toISOString(), clienteId: ventaRapida.cliente.id, clienteNombre: ventaRapida.cliente.nombre,
          clienteTelefono: ventaRapida.cliente.telefono || '', items: itemsConPrecio, total, formaPago: ventaRapida.pago,
          origen: 'qr_cliente', ubicacionVenta, capturadoPorUid: currentUser.uid, capturadoPorNombre: currentUser.nombre || '',
        });
        if (ventaRapida.pago === 'credito') {
          batch.set(dbx.collection('creditos').doc(), {
            notaId: notaRef.id, clienteId: ventaRapida.cliente.id, clienteNombre: ventaRapida.cliente.nombre,
            fecha: new Date().toISOString(), total, saldo: total, abonos: [],
          });
        }
        itemsConPrecio.forEach(it => {
          batch.update(dbx.collection('productos').doc(it.id), { stock: firebase.firestore.FieldValue.increment(-it.cant) });
        });
        await batch.commit();
        setVentaRapida(v => ({ ...v, saving: false, done: { total, notaId: notaRef.id, ubicacionVenta, items: itemsConPrecio, pago: v.pago } }));
        flash('✅ Venta guardada — ' + fmtx(total));
      } catch (e) { flash('❌ ' + e.message); setVentaRapida(v => ({ ...v, saving: false })); }
    };

    // ---- Conteo físico de inventario ----
    const setConteo = (id, val) => setConteoDraft(d => ({ ...d, [id]: val }));
    const cambiosConteo = productos.filter(p => conteoDraft[p.id] !== undefined && conteoDraft[p.id] !== '' && Number(conteoDraft[p.id]) !== p.stock);
    const guardarConteo = async () => {
      if (cambiosConteo.length === 0) { flash('⚠️ No hay cambios que guardar'); return; }
      setConteoSaving(true);
      try {
        const batch = dbx.batch();
        cambiosConteo.forEach(p => {
          const nuevo = Number(conteoDraft[p.id]);
          batch.update(dbx.collection('productos').doc(p.id), { stock: nuevo });
          batch.set(dbx.collection('inventario_historial').doc(), {
            productoId: p.id, productoNombre: p.nombre, stockAnterior: p.stock, stockNuevo: nuevo, diferencia: nuevo - p.stock,
            motivo: conteoMotivo || 'Conteo físico de bodega',
            usuarioUid: currentUser.uid, usuarioNombre: currentUser.nombre || '', usuarioEmail: currentUser.email || '', fecha: new Date().toISOString(),
          });
        });
        await batch.commit();
        flash('✅ Conteo guardado — ' + cambiosConteo.length + ' producto(s) ajustado(s)');
        setConteoDraft({});
      } catch (e) { flash('❌ ' + e.message); }
      setConteoSaving(false);
    };

    // ---- Devoluciones y cambios ----
    const registrarDevolucion = async () => {
      if (!devProdSel) { flash('⚠️ Selecciona un producto'); return; }
      const cant = Number(devCantidad);
      if (!cant || cant < 1) { flash('⚠️ Cantidad inválida'); return; }
      setDevSaving(true);
      try {
        const batch = dbx.batch();
        batch.set(dbx.collection('devoluciones').doc(), {
          fecha: new Date().toISOString(), productoId: devProdSel.id, productoNombre: devProdSel.nombre, cantidad: cant,
          clienteId: devCliSel ? devCliSel.id : null, clienteNombre: devCliSel ? devCliSel.nombre : '',
          motivo: devMotivo, accion: devAccion, usuarioNombre: currentUser.nombre || '', usuarioEmail: currentUser.email || '',
        });
        if (devAccion === 'reingreso') {
          const nuevo = devProdSel.stock + cant;
          batch.update(dbx.collection('productos').doc(devProdSel.id), { stock: nuevo });
          batch.set(dbx.collection('inventario_historial').doc(), {
            productoId: devProdSel.id, productoNombre: devProdSel.nombre, stockAnterior: devProdSel.stock, stockNuevo: nuevo, diferencia: cant,
            motivo: 'Devolución — ' + devMotivo, usuarioUid: currentUser.uid, usuarioNombre: currentUser.nombre || '', usuarioEmail: currentUser.email || '', fecha: new Date().toISOString(),
          });
        }
        await batch.commit();
        flash(devAccion === 'reingreso' ? '✅ Devolución registrada — regresó a inventario' : '✅ Baja registrada');
        setDevProdSel(null); setDevProdSearch(''); setDevCliSel(null); setDevCliSearch(''); setDevCantidad(1); setDevMotivo('dañado');
      } catch (e) { flash('❌ ' + e.message); }
      setDevSaving(false);
    };

    // ---- Exportar CSV ----
    const exportarHistorialCSV = () => {
      const rows = [['Fecha creación', 'Repartidor', 'Vehículo', 'Zona', 'Estado', 'Salida real', 'Regreso real', 'Duración (min)', 'Paradas', 'Entregadas', 'Total vendido']];
      hist.forEach(r => {
        const dur = (r.fechaSalidaReal && r.fechaRegresoReal) ? Math.round((new Date(r.fechaRegresoReal) - new Date(r.fechaSalidaReal)) / 60000) : '';
        const totalParadas = (r.paradas || []).reduce((s, p) => s + (p.totalEntregado || 0), 0);
        rows.push([fDateTime(r.fechaCreacion), r.repartidorNombre, r.vehiculo, r.zona, ESTADOS[r.estado].label, fDateTime(r.fechaSalidaReal), fDateTime(r.fechaRegresoReal), dur, (r.paradas || []).length, (r.paradas || []).filter(p => p.visitado).length, totalParadas.toFixed(2)]);
      });
      downloadCSV('historial_rutas_' + Date.now() + '.csv', rows);
    };
    const exportarComprobantesCSV = () => {
      const rows = [['Fecha', 'Estado', 'Entregas', 'Total vendido']];
      rutasReales.forEach(r => {
        const { entregas, totalVendido } = resumenRuta(r);
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

    // ---- Respaldo completo ----
    const diasDesdeUltimoRespaldo = backupMeta && backupMeta.ultimoRespaldo
      ? Math.floor((Date.now() - new Date(backupMeta.ultimoRespaldo).getTime()) / 86400000)
      : null;

    const generarRespaldo = async () => {
      setBackupGenerating(true);
      try {
        const colecciones = ['productos', 'clientes', 'notas', 'creditos', 'rutas', 'rutas_meta', 'devoluciones', 'inventario_historial', 'usuarios'];
        const data = { generado: new Date().toISOString(), generadoPor: currentUser.nombre || currentUser.email };
        for (const col of colecciones) {
          const snap = await dbx.collection(col).get();
          data[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'respaldo_productos_de_la_costa_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        await dbx.collection('_meta').doc('backups').set({ ultimoRespaldo: new Date().toISOString(), por: currentUser.nombre || currentUser.email }, { merge: true });
        flash('✅ Respaldo descargado');
      } catch (e) { flash('❌ ' + e.message); }
      setBackupGenerating(false);
    };

    // ---- Verificación de ubicación del día (solo admin) ----
    const cargarUbicacionDia = async () => {
      setUbicLoading(true);
      try {
        const desde = new Date(ubicFecha + 'T00:00:00').toISOString();
        const hasta = new Date(ubicFecha + 'T23:59:59').toISOString();
        const snap = await dbx.collection('notas').where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
        // Solo interesan las notas que pasaron por una validación de ubicación
        // (ventas por ruta) — las del mostrador/oficina no traen este campo.
        const notas = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.ubicacionVenta);
        notas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        setUbicNotas(notas);
      } catch (e) { flash('❌ ' + e.message); }
      setUbicLoading(false);
    };

    // ---- Reporte de ventas ----
    const rangoFechas = () => {
      const hoy = new Date();
      let desde, hasta;
      if (reporteRango === 'hoy') {
        desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
      } else if (reporteRango === 'semana') {
        desde = new Date(hoy); desde.setDate(hoy.getDate() - 7);
        hasta = hoy;
      } else if (reporteRango === 'mes') {
        desde = new Date(hoy); desde.setDate(hoy.getDate() - 30);
        hasta = hoy;
      } else {
        desde = reporteDesde ? new Date(reporteDesde) : new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        hasta = reporteHasta ? new Date(reporteHasta + 'T23:59:59') : hoy;
      }
      return { desde: desde.toISOString(), hasta: hasta.toISOString() };
    };

    const generarReporte = async () => {
      setReporteGenerating(true);
      try {
        const { desde, hasta } = rangoFechas();
        const snap = await dbx.collection('notas').where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
        const notas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const total = notas.reduce((s, n) => s + (n.total || 0), 0);
        const totalContado = notas.filter(n => n.formaPago === 'contado').reduce((s, n) => s + (n.total || 0), 0);
        const totalCredito = notas.filter(n => n.formaPago === 'credito').reduce((s, n) => s + (n.total || 0), 0);
        const porCliente = {};
        const porProducto = {};
        notas.forEach(n => {
          porCliente[n.clienteNombre] = (porCliente[n.clienteNombre] || 0) + (n.total || 0);
          (n.items || []).forEach(it => {
            porProducto[it.nombre] = porProducto[it.nombre] || { cant: 0, total: 0 };
            porProducto[it.nombre].cant += it.cant;
            porProducto[it.nombre].total += (it.precio || 0) * it.cant;
          });
        });
        const topClientes = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topProductos = Object.entries(porProducto).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
        setReporteData({ desde, hasta, notas, total, totalContado, totalCredito, count: notas.length, topClientes, topProductos });
        flash('✅ Reporte generado');
      } catch (e) { flash('❌ ' + e.message); }
      setReporteGenerating(false);
    };

    const exportarReporteCSV = () => {
      if (!reporteData) return;
      const rows = [['Fecha', 'Cliente', 'Productos', 'Total', 'Forma de pago']];
      reporteData.notas.forEach(n => {
        rows.push([fDateTime(n.fecha), n.clienteNombre, (n.items || []).map(it => it.nombre + ' x' + it.cant).join(' | '), (n.total || 0).toFixed(2), n.formaPago]);
      });
      downloadCSV('reporte_ventas_' + Date.now() + '.csv', rows);
    };

    const enviarReportePorCorreo = () => {
      if (!reporteData) return;
      const clientesTxt = reporteData.topClientes.map(([n, t]) => `• ${n}: ${fmtx(t)}`).join('\n') || 'Sin datos';
      const productosTxt = reporteData.topProductos.map(([n, d]) => `• ${n}: ${d.cant} unidades — ${fmtx(d.total)}`).join('\n') || 'Sin datos';
      const cuerpo = `REPORTE DE VENTAS\n${fDateTime(reporteData.desde)} — ${fDateTime(reporteData.hasta)}\n\nPedidos: ${reporteData.count}\nTotal vendido: ${fmtx(reporteData.total)}\nContado: ${fmtx(reporteData.totalContado)}\nCrédito: ${fmtx(reporteData.totalCredito)}\n\nTOP CLIENTES\n${clientesTxt}\n\nTOP PRODUCTOS\n${productosTxt}`;
      const link = `mailto:${encodeURIComponent(reporteEmail || '')}?subject=${encodeURIComponent('Reporte de ventas — Productos de la Costa')}&body=${encodeURIComponent(cuerpo)}`;
      window.location.href = link;
    };

    // ---- Exportar clientes con su QR ----
    const exportarClientesCSV = () => {
      const rows = [['Nombre', 'Teléfono', 'Domicilio', 'Activo', 'Código QR']];
      clientes.forEach(c => rows.push([c.nombre, c.telefono || '', c.domicilio || '', c.activo ? 'Sí' : 'No', qrTextForCliente(c.id)]));
      downloadCSV('clientes_qr_' + Date.now() + '.csv', rows);
    };
    const exportarClientesQRImprimible = () => {
      const activos = clientes.filter(c => c.activo);
      if (activos.length === 0) { flash('⚠️ No hay clientes activos'); return; }
      setClientesQrGenerating(true);
      const results = {};
      let pending = activos.length;
      activos.forEach(c => {
        renderQRDataURL(qrTextForCliente(c.id), 200, url => {
          results[c.id] = url;
          pending--;
          if (pending === 0) {
            const cards = activos.map(cl => `
              <div style="border:1px solid #ccc;border-radius:8px;padding:12px;display:inline-block;width:220px;margin:8px;text-align:center;page-break-inside:avoid;vertical-align:top">
                <div style="font-weight:700;font-size:13px;margin-bottom:2px">${cl.nombre}</div>
                <div style="font-size:11px;color:#666;margin-bottom:8px">${cl.telefono || ''}${cl.domicilio ? ' · ' + cl.domicilio : ''}</div>
                ${results[cl.id] ? `<img src="${results[cl.id]}" style="width:160px;height:160px"/>` : '<div>Sin QR</div>'}
              </div>`).join('');
            const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>QR de clientes</title>
              <style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}body{padding:16px;text-align:center}@media print{button{display:none}}</style>
              </head><body><h2>QR de clientes (${activos.length})</h2>${cards}
              <div><button onclick="window.print()" style="margin-top:20px;background:#E8A400;border:none;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer">🖨️ Imprimir / Guardar como PDF</button></div>
              </body></html>`;
            const w = window.open('', '_blank');
            if (!w) { flash('⚠️ Habilita las ventanas emergentes para imprimir.'); setClientesQrGenerating(false); return; }
            w.document.write(html);
            w.document.close();
            setClientesQrGenerating(false);
          }
        });
      });
    };

    // ---- Exportar ventas de los últimos 7 días ----
    const exportarVentasSemanaCSV = async () => {
      setVentasSemanaGenerating(true);
      try {
        const hoy = new Date();
        const desde = new Date(hoy); desde.setDate(hoy.getDate() - 7);
        const snap = await dbx.collection('notas').where('fecha', '>=', desde.toISOString()).where('fecha', '<=', hoy.toISOString()).get();
        const notas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        const rows = [['Fecha', 'Cliente', 'Vendedor', 'Productos', 'Total', 'Forma de pago']];
        notas.forEach(n => rows.push([fDateTime(n.fecha), n.clienteNombre, n.capturadoPorNombre || '', (n.items || []).map(it => it.nombre + ' x' + it.cant).join(' | '), (n.total || 0).toFixed(2), n.formaPago]));
        downloadCSV('ventas_semana_' + Date.now() + '.csv', rows);
        flash('✅ Ventas de la semana exportadas — ' + notas.length);
      } catch (e) { flash('❌ ' + e.message); }
      setVentasSemanaGenerating(false);
    };

    // ---- Formato de ventas del vendedor (para cálculo de sueldo) ----
    const rangoFechasNomina = () => {
      const hoy = new Date();
      let desde, hasta;
      if (nominaRango === 'semana') { desde = new Date(hoy); desde.setDate(hoy.getDate() - 7); hasta = hoy; }
      else if (nominaRango === 'mes') { desde = new Date(hoy); desde.setDate(hoy.getDate() - 30); hasta = hoy; }
      else { desde = nominaDesde ? new Date(nominaDesde) : new Date(hoy.getFullYear(), hoy.getMonth(), 1); hasta = nominaHasta ? new Date(nominaHasta + 'T23:59:59') : hoy; }
      return { desde: desde.toISOString(), hasta: hasta.toISOString() };
    };
    const generarNomina = async () => {
      if (!nominaVendedorId) { flash('⚠️ Selecciona un vendedor'); return; }
      setNominaGenerating(true);
      try {
        const { desde, hasta } = rangoFechasNomina();
        const snap = await dbx.collection('notas').where('capturadoPorUid', '==', nominaVendedorId).where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
        const notas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const porDia = {};
        notas.forEach(n => {
          const key = new Date(n.fecha).toDateString();
          porDia[key] = porDia[key] || { fecha: n.fecha, cant: 0, total: 0 };
          porDia[key].cant += 1;
          porDia[key].total += (n.total || 0);
        });
        const filas = Object.values(porDia).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        const vendedorNombre = (usuarios.find(u => u.id === nominaVendedorId) || {}).nombre || '';
        setNominaData({ desde, hasta, vendedorNombre, filas, totalVentas: notas.length, totalVendido: notas.reduce((s, n) => s + (n.total || 0), 0) });
        flash('✅ Formato generado — ' + filas.length + ' día(s) con ventas');
      } catch (e) { flash('❌ ' + e.message); }
      setNominaGenerating(false);
    };
    const exportarNominaCSV = () => {
      if (!nominaData) return;
      const rows = [['Vendedor', 'Fecha', 'Ventas realizadas', 'Total vendido', 'Horas trabajadas']];
      nominaData.filas.forEach(f => {
        const fechaCorta = new Date(f.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        rows.push([nominaData.vendedorNombre, fechaCorta, f.cant, f.total.toFixed(2), '']);
      });
      rows.push(['', 'TOTAL', nominaData.totalVentas, nominaData.totalVendido.toFixed(2), '']);
      downloadCSV('sueldo_' + nominaData.vendedorNombre.replace(/\s+/g, '_') + '_' + Date.now() + '.csv', rows);
    };

    const iniciarSeguimiento = r => {
      if (!navigator.geolocation) { flash('⚠️ Este dispositivo no soporta GPS'); return; }
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      let last = 0;
      watchIdRef.current = navigator.geolocation.watchPosition(p => {
        const now = Date.now();
        if (now - last < 20000) return; // throttle: máx. 1 escritura cada 20s
        last = now;
        dbx.collection('rutas_meta').doc(r.id).update({
          ubicacionActual: { lat: p.coords.latitude, lng: p.coords.longitude, fecha: new Date().toISOString() }
        }).catch(() => {});
      }, () => flash('⚠️ No se pudo obtener ubicación'), { enableHighAccuracy: true });
      setTracking(r.id);
      flash('📍 Compartiendo ubicación en vivo');
    };
    const detenerSeguimiento = () => {
      if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      setTracking(null);
    };
    useEffect(() => () => { if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

    if (!currentUser) return null;
    // Panel exclusivo de repartidor (sus propias rutas asignadas) y admin
    // (todas, para reasignar o cubrir si el repartidor asignado no se
    // presenta a trabajar). El personal de oficina ('usuario') no lo ve —
    // ellos usan 'ruta.js' para cargar camión, y ese ya es admin-only.
    if (currentUser.role !== 'admin' && currentUser.role !== 'repartidor') return null;
    const puedeCamara = permisoAcciones(currentUser).camara;
    _permisoCSV = currentUser.role === 'admin' || permisoAcciones(currentUser).csv;

    const activas = rutas.filter(r => r.estado === 'pendiente' || r.estado === 'en_curso');
    const hist = rutas.filter(r => r.estado === 'completada' || r.estado === 'cancelada');
    const misRutas = currentUser.role === 'admin' ? activas : activas.filter(r => r.repartidorId === currentUser.uid);

    return (
      <>
        {!open && (
          <button onClick={() => setOpen(true)} style={{ position: 'fixed', bottom: 84, right: 'max(14px, calc(50vw - 196px))', zIndex: 260, width: 52, height: 52, borderRadius: 26, background: 'var(--accent)', border: 'none', color: 'var(--accent-ink)', fontSize: 22, boxShadow: '0 4px 14px #1B1D1955', cursor: 'pointer' }}>🗺️</button>
        )}
        {open && (
          <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 280, overflowY: 'auto' }}>
            <div style={{ maxWidth: 420, margin: '0 auto', padding: '16px 12px 90px', color: 'var(--ink)', fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>🗺️ Repartidores y rutas</div>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 22, cursor: 'pointer' }}>✕</button>
              </div>
              {msg && <div style={{ background: 'var(--ok-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--ok-text)', marginBottom: 12 }}>{msg}</div>}
              {currentUser.role === 'admin' && diasDesdeUltimoRespaldo !== null && diasDesdeUltimoRespaldo >= 7 && (
                <button onClick={() => { setTab('respaldo'); setRespaldoSubTab('respaldo'); }} style={{ width: '100%', textAlign: 'left', background: diasDesdeUltimoRespaldo >= 30 ? 'var(--danger-bg)' : 'var(--warn-bg)', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: diasDesdeUltimoRespaldo >= 30 ? 'var(--danger-text)' : 'var(--warn-text)', marginBottom: 12, cursor: 'pointer' }}>
                  {diasDesdeUltimoRespaldo >= 30 ? '🔴' : '🟡'} Sin respaldo hace {diasDesdeUltimoRespaldo} días — toca uno
                </button>
              )}
              {currentUser.role === 'admin' && diasDesdeUltimoRespaldo === null && (
                <button onClick={() => { setTab('respaldo'); setRespaldoSubTab('respaldo'); }} style={{ width: '100%', textAlign: 'left', background: 'var(--warn-bg)', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--warn-text)', marginBottom: 12, cursor: 'pointer' }}>🟡 Nunca se ha generado un respaldo — toca uno</button>
              )}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[['activas', 'Activas'], ['mapa', 'Mapa'], ['clientesqr', 'Clientes'], ['inventario', 'Inv.'], ['comprobantes', 'Comprob.'], ['historial', 'Historial'], ['respaldo', 'Respaldo']].filter(([v]) => (v !== 'mapa' && v !== 'respaldo') || currentUser.role === 'admin').map(([v, l]) => (
                  <button key={v} onClick={() => setTab(v)} style={{ flex: 1, padding: '8px 1px', borderRadius: 8, border: 'none', background: tab === v ? 'var(--accent)' : 'var(--surface)', color: tab === v ? 'var(--surface-2)' : 'var(--ink-soft)', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                ))}
              </div>

              {tab === 'activas' && (
                <>
                  <button onClick={() => setForm({ repartidorId: currentUser.uid, repartidorNombre: currentUser.nombre, vehiculo: '', zona: '', fechaProgramada: '', fechaRegresoProgramada: '', paradas: [] })}
                    style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, marginBottom: 14, cursor: 'pointer' }}>+ Programar ruta</button>
                  {misRutas.length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '20px 0' }}>Sin rutas programadas</div>}
                  {misRutas.map(r => (
                    <div key={r.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{r.repartidorNombre}</span>
                        <span style={{ background: ESTADOS[r.estado].color + '22', color: ESTADOS[r.estado].color, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{ESTADOS[r.estado].label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>🚐 {r.vehiculo || '—'} · 📍 {r.zona || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 8 }}>{r.estado === 'pendiente' ? 'Programada: ' + fDateTime(r.fechaProgramada) : 'Salió: ' + fDateTime(r.fechaSalidaReal)}</div>
                      {(r.paradas || []).length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <button onClick={() => setExpandPlan(expandPlan === r.id ? null : r.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 6 }}>
                            📋 {r.paradas.filter(p => p.visitado).length}/{r.paradas.length} paradas {expandPlan === r.id ? '▲' : '▼'}
                          </button>
                          {expandPlan === r.id && (
                            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 10, marginBottom: 6 }}>
                              {r.paradas.map(p => (
                                <div key={p.id} style={{ marginBottom: 10 }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <button onClick={() => p.visitado ? null : (confirmFor && confirmFor.paradaId === p.id ? setConfirmFor(null) : abrirConfirmacion(r, p))} style={{ background: 'none', border: 'none', color: p.visitado ? 'var(--ok)' : 'var(--ink-faint)', cursor: p.visitado ? 'default' : 'pointer', fontSize: 16, flexShrink: 0, marginTop: 1 }}>{p.visitado ? '✅' : '⬜'}</button>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, textDecoration: p.visitado ? 'line-through' : 'none', color: p.visitado ? 'var(--ink-faint)' : 'var(--ink)' }}>{p.clienteNombre}</div>
                                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{p.items.map(it => `${it.nombre} x${it.cant}`).join(', ')}</div>
                                      {p.visitado && <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 2 }}>Entregado · {fmtx(p.totalEntregado)} · {p.formaPago}</div>}
                                    </div>
                                  </div>
                                  {confirmFor && confirmFor.paradaId === p.id && (
                                    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 10, marginTop: 6, marginLeft: 24 }}>
                                      <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 6 }}>CONFIRMAR ENTREGA</div>
                                      {confirmItems.map(it => (
                                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                          <span style={{ fontSize: 12, flex: 1 }}>{it.nombre}</span>
                                          <button onClick={() => updConfirmQty(it.id, it.cant - 1)} style={{ background: 'var(--line-strong)', border: 'none', color: 'var(--ink)', borderRadius: 6, width: 22, height: 22, cursor: 'pointer' }}>-</button>
                                          <input type="number" min="1" value={it.cant} onChange={e => { const v = e.target.value; if (v === '') return; const n = parseInt(v); if (!isNaN(n) && n >= 1) updConfirmQty(it.id, n); }} onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) updConfirmQty(it.id, 1); }} style={{ width: 36, textAlign: 'center', fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 6, color: 'var(--ink)', padding: '3px 2px' }} />
                                          <button onClick={() => updConfirmQty(it.id, it.cant + 1)} style={{ background: 'var(--line-strong)', border: 'none', color: 'var(--ink)', borderRadius: 6, width: 22, height: 22, cursor: 'pointer' }}>+</button>
                                        </div>
                                      ))}
                                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                        {[['contado', '💵 Contado', 'var(--ok-bg)', 'var(--ok-text)'], ['credito', '📋 Crédito', 'var(--warn-bg)', 'var(--warn-text)']].map(([v, l, bg, col]) => (
                                          <button key={v} onClick={() => setConfirmPago(v)} style={{ flex: 1, padding: 7, borderRadius: 8, border: 'none', background: confirmPago === v ? bg : 'var(--surface-2)', color: confirmPago === v ? col : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                                        ))}
                                      </div>
                                      <button onClick={() => confirmarEntrega(r, p)} disabled={confirmSaving} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12, opacity: confirmSaving ? 0.6 : 1 }}>{confirmSaving ? 'Guardando…' : '✓ Confirmar entrega'}</button>
                                    </div>
                                  )}
                                </div>
                              ))}
                              <div style={{ borderTop: '1px solid var(--line-strong)', paddingTop: 8, marginTop: 4 }}>
                                <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 3 }}>PARA CARGAR EN TOTAL</div>
                                {totalesParadas(r.paradas).map((it, i) => <div key={i} style={{ fontSize: 11, color: 'var(--ink-soft)' }}>• {it.nombre} x{it.cant}</div>)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {(r.estado === 'pendiente' || r.estado === 'en_curso') && (planEditFor === r.id ? (
                        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                          <ParadaBuilder clientes={clientes} productos={productos} paradas={r.paradas} onChange={ps => actualizarParadas(r.id, ps)} />
                          <button onClick={() => setPlanEditFor(null)} style={{ width: '100%', background: 'var(--surface)', color: 'var(--ink-soft)', border: 'none', borderRadius: 8, padding: 8, fontSize: 12, cursor: 'pointer', marginTop: 4 }}>Listo</button>
                        </div>
                      ) : (
                        <button onClick={() => setPlanEditFor(r.id)} style={{ background: 'transparent', color: 'var(--ink-soft)', border: '1px dashed var(--line-strong)', borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: 'pointer', marginBottom: 8, width: '100%' }}>+ Agregar cliente al plan</button>
                      ))}
                      <div style={{ display: 'flex', gap: 8 }}>
                        {r.estado === 'pendiente' && <button onClick={() => iniciar(r)} style={{ flex: 1, background: 'var(--ok-bg)', color: 'var(--ok-text)', border: 'none', borderRadius: 8, padding: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>🚀 Iniciar</button>}
                        {r.estado === 'pendiente' && <button onClick={() => cancelar(r)} style={{ background: 'transparent', color: 'var(--danger-text)', border: '1.5px solid var(--danger-text)', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>✕</button>}
                        {r.estado === 'en_curso' && <button onClick={() => tracking === r.id ? detenerSeguimiento() : iniciarSeguimiento(r)} style={{ flex: 1, background: tracking === r.id ? 'var(--warn-bg)' : 'var(--surface-2)', color: tracking === r.id ? 'var(--warn-text)' : 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>{tracking === r.id ? '📍 Compartiendo…' : '📍 Compartir ubicación'}</button>}
                        {r.estado === 'en_curso' && <button onClick={() => completar(r)} style={{ flex: 1, background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>🏁 Completar</button>}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {tab === 'mapa' && currentUser.role === 'admin' && (
                <div>
                  <div ref={mapRef} style={{ width: '100%', height: 380, borderRadius: 12, background: 'var(--surface)' }} />
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8, textAlign: 'center' }}>Muestra las rutas en curso que están compartiendo ubicación en vivo.</div>
                  <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 12, marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🗺️ Mapa sin conexión</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8, lineHeight: 1.4 }}>
                      Navega el mapa de arriba (pan/zoom) hasta cubrir tu zona de reparto y descárgala — queda guardada en <strong>este dispositivo</strong> para verse sin internet. Cada dispositivo (el tuyo, el de cada repartidor) necesita descargarla por separado, una vez, mientras tenga conexión.
                    </div>
                    {mapaOffline
                      ? <div style={{ fontSize: 11, color: 'var(--ok-text)', marginBottom: 8 }}>✅ Zona descargada el {fDateTime(mapaOffline.fecha)} · {mapaOffline.tileCount} imágenes · zoom {mapaOffline.zMin}–{mapaOffline.zMax}</div>
                      : <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8 }}>Sin zona descargada todavía en este dispositivo.</div>}
                    {descargandoMapa
                      ? <div style={{ fontSize: 12, fontWeight: 700 }}>Descargando… {descargandoMapa.hecho}/{descargandoMapa.total}</div>
                      : <Row style={{ gap: 8 }}>
                          <button onClick={descargarZonaOffline} style={{ flex: 1, background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>📥 Descargar esta zona</button>
                          {mapaOffline && <button onClick={borrarMapaOffline} style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: 'none', borderRadius: 8, padding: '0 14px', fontWeight: 700, cursor: 'pointer' }}>🗑️</button>}
                        </Row>}
                  </div>
                </div>
              )}

              {tab === 'clientesqr' && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {puedeCamara&&<button onClick={() => setClienteScanOpen(true)} style={{ flex: 1, background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>📷 Escanear para vender</button>}
                    <button onClick={() => setClienteBuscarOpen(o => !o)} style={{ flex: 1, background: 'var(--surface)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>🔍 Buscar manualmente</button>
                  </div>
                  {clienteBuscarOpen && (
                    <div style={{ marginBottom: 14 }}>
                      <input value={cliQSearch} onChange={e => setCliQSearch(e.target.value)} placeholder="Buscar cliente…" style={inputStyle} />
                      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                        {clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliQSearch.toLowerCase())).map(c => (
                          <div key={c.id} onClick={() => abrirVentaParaCliente(c)} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: 'var(--surface)', marginBottom: 4 }}>{c.nombre}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={() => setNuevoCliForm(f => f ? null : { nombre: '', telefono: '', domicilio: '' })} style={{ width: '100%', background: 'transparent', color: 'var(--accent)', border: '1px dashed var(--line-strong)', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 12, marginBottom: 14 }}>+ Nuevo cliente (genera QR)</button>
                  {nuevoCliForm && (
                    <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <div style={lblStyle}>Nombre</div>
                      <input value={nuevoCliForm.nombre} onChange={e => setNuevoCliForm(f => ({ ...f, nombre: e.target.value }))} style={inputStyle} />
                      <div style={lblStyle}>Teléfono</div>
                      <input value={nuevoCliForm.telefono} onChange={e => setNuevoCliForm(f => ({ ...f, telefono: e.target.value }))} style={inputStyle} />
                      <div style={lblStyle}>Domicilio</div>
                      <input value={nuevoCliForm.domicilio} onChange={e => setNuevoCliForm(f => ({ ...f, domicilio: e.target.value }))} style={{ ...inputStyle, marginBottom: 12 }} />
                      <button onClick={crearClienteRapido} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer' }}>💾 Guardar y generar QR</button>
                    </div>
                  )}
                  <input value={cliQSearch} onChange={e => setCliQSearch(e.target.value)} placeholder="🔍 Buscar en la lista…" style={inputStyle} />
                  {(() => { const lista = clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliQSearch.toLowerCase())); const todosSel = lista.length > 0 && lista.every(c => qrSel.includes(c.id));
                    return <Row style={{ justifyContent: 'space-between', margin: '10px 0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-soft)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={todosSel} onChange={() => setQrSel(todosSel ? [] : lista.map(c => c.id))} />
                        Seleccionar todos ({lista.length})
                      </label>
                      {qrSel.length > 0 && (
                        <button onClick={() => imprimirQRsMasivo(clientes.filter(c => qrSel.includes(c.id)))} disabled={qrMasivoLoading}
                          style={{ background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: qrMasivoLoading ? 0.6 : 1 }}>
                          {qrMasivoLoading ? 'Generando…' : `🖨️ Imprimir seleccionados (${qrSel.length})`}
                        </button>
                      )}
                    </Row>; })()}
                  {clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliQSearch.toLowerCase())).map(c => (
                    <div key={c.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, cursor: 'pointer' }}>
                        <input type="checkbox" checked={qrSel.includes(c.id)} onChange={() => togQrSel(c.id)} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{c.telefono || '—'}</div>
                        </div>
                      </label>
                      <button onClick={() => verQR(c)} style={{ background: 'var(--info-bg)', color: 'var(--info-text)', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>🔲 QR</button>
                    </div>
                  ))}
                </>
              )}

              {tab === 'inventario' && (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {[['conteo', '📋 Conteo físico'], ['devoluciones', '↩️ Devoluciones']].map(([v, l]) => (
                      <button key={v} onClick={() => setInvSubTab(v)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', background: invSubTab === v ? 'var(--accent)' : 'var(--surface)', color: invSubTab === v ? 'var(--surface-2)' : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                    ))}
                  </div>

                  {invSubTab === 'conteo' && (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 10 }}>Cuenta físicamente lo que hay en bodega y anota la cantidad real. Solo se guardan los productos donde el número cambió — queda registrado en el historial de inventario de Productos.</div>
                      <input value={conteoSearch} onChange={e => setConteoSearch(e.target.value)} placeholder="🔍 Buscar producto…" style={inputStyle} />
                      <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
                        {productos.filter(p => p.nombre.toLowerCase().includes(conteoSearch.toLowerCase())).map(p => {
                          const val = conteoDraft[p.id];
                          const diff = val !== undefined && val !== '' ? Number(val) - p.stock : 0;
                          return (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.nombre}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Sistema: {p.stock} {p.unidad}{diff !== 0 && <span style={{ color: diff > 0 ? 'var(--ok)' : 'var(--danger-text)', fontWeight: 700 }}> · {diff > 0 ? '+' : ''}{diff}</span>}</div>
                              </div>
                              <input type="number" min="0" value={val === undefined ? '' : val} onChange={e => setConteo(p.id, e.target.value)} placeholder={String(p.stock)} style={{ width: 64, textAlign: 'center', fontSize: 13, background: 'var(--surface-2)', border: '1px solid ' + (diff !== 0 ? 'var(--accent)' : 'var(--line-strong)'), borderRadius: 6, color: 'var(--ink)', padding: '6px 2px' }} />
                            </div>
                          );
                        })}
                      </div>
                      {cambiosConteo.length > 0 && (
                        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>{cambiosConteo.length} producto(s) con diferencia</div>
                          <div style={lblStyle}>Motivo (aplica a todos)</div>
                          <input value={conteoMotivo} onChange={e => setConteoMotivo(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
                          <button onClick={guardarConteo} disabled={conteoSaving} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', opacity: conteoSaving ? 0.6 : 1 }}>{conteoSaving ? 'Guardando…' : '💾 Guardar conteo (' + cambiosConteo.length + ')'}</button>
                        </div>
                      )}
                    </>
                  )}

                  {invSubTab === 'devoluciones' && (
                    <>
                      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                        <div style={lblStyle}>Producto</div>
                        {devProdSel ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                            <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{devProdSel.nombre}</span>
                            <button onClick={() => setDevProdSel(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer' }}>✕</button>
                          </div>
                        ) : (
                          <>
                            <input value={devProdSearch} onChange={e => setDevProdSearch(e.target.value)} placeholder="Buscar producto…" style={inputStyle} />
                            <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 10 }}>
                              {productos.filter(p => p.nombre.toLowerCase().includes(devProdSearch.toLowerCase())).map(p => (
                                <div key={p.id} onClick={() => setDevProdSel(p)} style={{ padding: '7px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>{p.nombre}</div>
                              ))}
                            </div>
                          </>
                        )}
                        <div style={lblStyle}>Cliente (opcional)</div>
                        {devCliSel ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                            <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{devCliSel.nombre}</span>
                            <button onClick={() => setDevCliSel(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer' }}>✕</button>
                          </div>
                        ) : (
                          <>
                            <input value={devCliSearch} onChange={e => setDevCliSearch(e.target.value)} placeholder="Buscar cliente…" style={inputStyle} />
                            {devCliSearch && (
                              <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 10 }}>
                                {clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(devCliSearch.toLowerCase())).map(c => (
                                  <div key={c.id} onClick={() => setDevCliSel(c)} style={{ padding: '7px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>{c.nombre}</div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        <div style={lblStyle}>Cantidad</div>
                        <input type="number" min="1" value={devCantidad} onChange={e => setDevCantidad(e.target.value)} style={inputStyle} />
                        <div style={lblStyle}>Motivo</div>
                        <select value={devMotivo} onChange={e => setDevMotivo(e.target.value)} style={inputStyle}>
                          <option value="dañado">Producto dañado</option>
                          <option value="incorrecto">Se entregó incorrecto</option>
                          <option value="rechazado">Rechazado por el cliente</option>
                          <option value="caducado">Caducado / vencido</option>
                          <option value="otro">Otro</option>
                        </select>
                        <div style={lblStyle}>Acción</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                          {[['reingreso', '↩️ Regresa a inventario', 'var(--ok-bg)', 'var(--ok-text)'], ['baja', '🗑️ Baja (no se vende)', 'var(--danger-bg)', 'var(--danger-text)']].map(([v, l, bg, col]) => (
                            <button key={v} onClick={() => setDevAccion(v)} style={{ flex: 1, padding: 9, borderRadius: 8, border: 'none', background: devAccion === v ? bg : 'var(--surface-2)', color: devAccion === v ? col : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                          ))}
                        </div>
                        <button onClick={registrarDevolucion} disabled={devSaving} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', opacity: devSaving ? 0.6 : 1 }}>{devSaving ? 'Guardando…' : '💾 Registrar'}</button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 8 }}>RECIENTES</div>
                      {devoluciones.length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '16px 0' }}>Sin devoluciones registradas</div>}
                      {devoluciones.map(d => (
                        <div key={d.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: 12, marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{d.productoNombre} x{d.cantidad}</span>
                            <span style={{ background: (d.accion === 'reingreso' ? '#2E8B45' : '#C23B2E') + '22', color: d.accion === 'reingreso' ? '#2E8B45' : '#C23B2E', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{d.accion === 'reingreso' ? 'reingresó' : 'baja'}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{d.motivo}{d.clienteNombre ? ' · ' + d.clienteNombre : ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>{fDateTime(d.fecha)}</div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {tab === 'comprobantes' && (
                <>
                  {rutasReales.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      <button onClick={exportarComprobantesCSV} style={{ flex: 1, background: 'var(--surface)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 9, fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>📤 CSV por ruta</button>
                      <button onClick={exportarVentasDetalladoCSV} style={{ flex: 1, background: 'var(--surface)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 9, fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>📤 CSV detallado</button>
                    </div>
                  )}
                  {rutasReales.length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '20px 0' }}>Sin rutas cargadas aún</div>}
                  {rutasReales.map(r => {
                    const { entregas, totalVendido } = resumenRuta(r);
                    return (
                      <div key={r.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                        <button onClick={() => setExpandComp(expandComp === r.id ? null : r.id)} style={{ background: 'none', border: 'none', color: 'var(--ink)', width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{fDateTime(r.fecha)}</span>
                            <span style={{ background: (r.estado === 'activa' ? '#3E7CA6' : '#8B8F84') + '22', color: r.estado === 'activa' ? '#3E7CA6' : '#8B8F84', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{r.estado === 'activa' ? 'en curso' : 'cerrada'}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{entregas.length} entrega(s) · <span style={{ color: 'var(--accent)' }}>{fmtx(totalVendido)}</span></div>
                        </button>
                        {expandComp === r.id && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-strong)' }}>
                            <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 4 }}>CARGADO</div>
                            {itemsCargadosDe(r).map((it, i) => <div key={i} style={{ fontSize: 12, color: 'var(--ink-soft)' }}>• {it.nombre} x{it.cant}</div>)}
                            {entregas.length > 0 && <>
                              <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginTop: 8, marginBottom: 4 }}>ENTREGAS</div>
                              {entregas.map((e, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span>{e.clienteNombre}</span><span style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmtx(e.total)}</span></div>)}
                            </>}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button onClick={() => imprimirGuia(r)} style={{ flex: 1, background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>🖨️ Imprimir</button>
                          <button onClick={() => { setWaFor(waFor === r.id ? null : r.id); setWaPhone(''); }} style={{ flex: 1, background: 'var(--ok-bg)', color: 'var(--ok-text)', border: 'none', borderRadius: 8, padding: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>📲 WhatsApp</button>
                        </div>
                        {waFor === r.id && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <input value={waPhone} onChange={e => setWaPhone(e.target.value)} placeholder="Teléfono (10 dígitos)" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                            <button onClick={() => { window.open(waGuiaLink(r, waPhone), '_blank'); setWaFor(null); }} style={{ background: '#25d366', color: 'var(--ink)', border: 'none', borderRadius: 8, padding: '0 14px', fontWeight: 700, cursor: 'pointer' }}>➤</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {tab === 'historial' && (
                <>
                  {hist.length > 0 && (
                    <button onClick={exportarHistorialCSV} style={{ width: '100%', background: 'var(--surface)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 12, marginBottom: 14 }}>📤 Exportar CSV</button>
                  )}
                  {hist.length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '20px 0' }}>Sin historial aún</div>}
                  {hist.map(r => {
                    const dur = (r.fechaSalidaReal && r.fechaRegresoReal) ? Math.round((new Date(r.fechaRegresoReal) - new Date(r.fechaSalidaReal)) / 60000) + ' min' : '—';
                    return (
                      <div key={r.id} style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{r.repartidorNombre}</span>
                          <span style={{ background: ESTADOS[r.estado].color + '22', color: ESTADOS[r.estado].color, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{ESTADOS[r.estado].label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>🚐 {r.vehiculo || '—'} · 📍 {r.zona || '—'} · ⏱ {dur}</div>
                      </div>
                    );
                  })}
                </>
              )}

              {tab === 'respaldo' && currentUser.role === 'admin' && (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                    {[['respaldo', '💾 Respaldo'], ['ubicacion', '📍 Ubicación'], ['reporte', '📈 Reporte de ventas'], ['exportar', '📤 Exportar']].map(([v, l]) => (
                      <button key={v} onClick={() => setRespaldoSubTab(v)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', background: respaldoSubTab === v ? 'var(--accent)' : 'var(--surface)', color: respaldoSubTab === v ? 'var(--surface-2)' : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                    ))}
                  </div>

                  {respaldoSubTab === 'respaldo' && (
                    <>
                      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Respaldo completo</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>Descarga un archivo con todos tus datos: productos, clientes, ventas, créditos, rutas, devoluciones e historial de inventario. Guárdalo en Drive, tu correo o donde prefieras.</div>
                        <div style={{ fontSize: 12, color: diasDesdeUltimoRespaldo === null ? 'var(--warn-text)' : diasDesdeUltimoRespaldo >= 30 ? 'var(--danger-text)' : diasDesdeUltimoRespaldo >= 7 ? 'var(--warn-text)' : 'var(--ok-text)', marginBottom: 12 }}>
                          {diasDesdeUltimoRespaldo === null ? '⚠️ Nunca se ha generado un respaldo' : `Último respaldo: hace ${diasDesdeUltimoRespaldo} día(s)${backupMeta.por ? ' · ' + backupMeta.por : ''}`}
                        </div>
                        <button onClick={generarRespaldo} disabled={backupGenerating} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', opacity: backupGenerating ? 0.6 : 1 }}>{backupGenerating ? 'Generando…' : '💾 Generar y descargar respaldo'}</button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Recomendado: hazlo cada semana, y guarda uno aparte cada fin de mes. Te avisamos aquí arriba cuando ya lleve más de 7 días.</div>
                    </>
                  )}

                  {respaldoSubTab === 'ubicacion' && (() => {
                    const ok = (ubicNotas || []).filter(n => n.ubicacionVenta.ok === true);
                    const mal = (ubicNotas || []).filter(n => n.ubicacionVenta.ok === false);
                    const sinDatos = (ubicNotas || []).filter(n => n.ubicacionVenta.ok === null);
                    return <>
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 12, lineHeight: 1.5 }}>
                        Compara dónde se hizo cada venta de ruta contra el domicilio registrado del cliente (radio de {RADIO_VISITA_METROS} m). Es solo informativo: nunca bloquea ni anula una venta.
                      </div>
                      <Row style={{ gap: 8, marginBottom: 12 }}>
                        <input type="date" value={ubicFecha} onChange={e => setUbicFecha(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                        <button onClick={cargarUbicacionDia} disabled={ubicLoading} style={{ background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 700, cursor: 'pointer', opacity: ubicLoading ? 0.6 : 1 }}>{ubicLoading ? '…' : 'Ver'}</button>
                      </Row>
                      {ubicNotas === null && <div style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', padding: '20px 0' }}>Elige una fecha y toca "Ver".</div>}
                      {ubicNotas !== null && ubicNotas.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', padding: '20px 0' }}>Sin ventas de ruta con ubicación ese día.</div>}
                      {ubicNotas !== null && ubicNotas.length > 0 && <>
                        <Row style={{ gap: 8, marginBottom: 14 }}>
                          <div style={{ flex: 1, background: 'var(--ok-bg)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ok-text)' }}>{ok.length}</div>
                            <div style={{ fontSize: 10, color: 'var(--ok-text)' }}>✅ Concuerdan</div>
                          </div>
                          <div style={{ flex: 1, background: 'var(--danger-bg)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger-text)' }}>{mal.length}</div>
                            <div style={{ fontSize: 10, color: 'var(--danger-text)' }}>⚠️ No concuerdan</div>
                          </div>
                          <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-faint)' }}>{sinDatos.length}</div>
                            <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>➖ Sin datos</div>
                          </div>
                        </Row>
                        {mal.length > 0 && <>
                          <div style={{ fontSize: 11, color: 'var(--danger-text)', fontWeight: 700, marginBottom: 8 }}>VENTAS FUERA DE RANGO</div>
                          {mal.map(n => (
                            <div key={n.id} style={{ background: 'var(--danger-bg)', borderRadius: 10, padding: '10px 12px', marginBottom: 6 }}>
                              <Row style={{ justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger-text)' }}>{n.clienteNombre}</span>
                                <span style={{ fontSize: 12, color: 'var(--danger-text)' }}>{fmtx(n.total)}</span>
                              </Row>
                              <div style={{ fontSize: 11, color: 'var(--danger-text)', marginTop: 2 }}>{fDateTime(n.fecha)} · a {n.ubicacionVenta.distanciaM} m del domicilio registrado{n.capturadoPorNombre ? ' · ' + n.capturadoPorNombre : ''}</div>
                            </div>
                          ))}
                        </>}
                        {sinDatos.length > 0 && <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: mal.length ? 14 : 0 }}>"Sin datos" significa que el cliente no tiene ubicación registrada, o no se pudo obtener el GPS del repartidor en ese momento — no es evidencia de nada, solo falta información para comparar.</div>}
                      </>}
                    </>;
                  })()}


                  {respaldoSubTab === 'reporte' && (
                    <>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        {[['hoy', 'Hoy'], ['semana', '7 días'], ['mes', '30 días'], ['custom', 'Rango']].map(([v, l]) => (
                          <button key={v} onClick={() => setReporteRango(v)} style={{ flex: 1, padding: '7px 2px', borderRadius: 8, border: 'none', background: reporteRango === v ? 'var(--accent)' : 'var(--surface-2)', color: reporteRango === v ? 'var(--surface-2)' : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                        ))}
                      </div>
                      {reporteRango === 'custom' && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <input type="date" value={reporteDesde} onChange={e => setReporteDesde(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                          <input type="date" value={reporteHasta} onChange={e => setReporteHasta(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                        </div>
                      )}
                      <button onClick={generarReporte} disabled={reporteGenerating} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', marginBottom: 14, opacity: reporteGenerating ? 0.6 : 1 }}>{reporteGenerating ? 'Generando…' : '📊 Generar reporte'}</button>

                      {reporteData && (
                        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 10 }}>{fDateTime(reporteData.desde)} — {fDateTime(reporteData.hasta)}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                            <div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Total vendido</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{fmtx(reporteData.total)}</div></div>
                            <div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Pedidos</div><div style={{ fontSize: 20, fontWeight: 800 }}>{reporteData.count}</div></div>
                            <div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Contado</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ok-text)' }}>{fmtx(reporteData.totalContado)}</div></div>
                            <div><div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Crédito</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--warn-text)' }}>{fmtx(reporteData.totalCredito)}</div></div>
                          </div>
                          {reporteData.topClientes.length > 0 && <>
                            <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 6 }}>TOP CLIENTES</div>
                            {reporteData.topClientes.map(([n, t], i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>{n}</span><span style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmtx(t)}</span></div>)}
                          </>}
                          {reporteData.topProductos.length > 0 && <>
                            <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, margin: '10px 0 6px' }}>TOP PRODUCTOS</div>
                            {reporteData.topProductos.map(([n, d], i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>{n} x{d.cant}</span><span style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmtx(d.total)}</span></div>)}
                          </>}
                        </div>
                      )}
                      {reporteData && (
                        <>
                          <button onClick={exportarReporteCSV} style={{ width: '100%', background: 'var(--surface)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 12, marginBottom: 10 }}>📤 Exportar CSV</button>
                          <div style={lblStyle}>Correo destino (opcional)</div>
                          <input value={reporteEmail} onChange={e => setReporteEmail(e.target.value)} placeholder="correo@ejemplo.com" style={inputStyle} />
                          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 10 }}>Abre tu app de correo con el resumen ya escrito — revisa y dale enviar. Si quieres adjuntar el CSV, descárgalo arriba y agrégalo ahí.</div>
                          <button onClick={enviarReportePorCorreo} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer' }}>📧 Preparar correo</button>
                        </>
                      )}
                    </>
                  )}

                  {respaldoSubTab === 'exportar' && (
                    <>
                      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>👥 Clientes con su código QR</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>Genera una hoja imprimible con el QR de cada cliente activo (para pegar en su tienda), o descarga los datos en CSV.</div>
                        <button onClick={exportarClientesQRImprimible} disabled={clientesQrGenerating} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', marginBottom: 8, opacity: clientesQrGenerating ? 0.6 : 1 }}>{clientesQrGenerating ? 'Generando…' : '🖨️ Generar hoja de QR imprimible'}</button>
                        <button onClick={exportarClientesCSV} style={{ width: '100%', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>📤 CSV con datos + código QR</button>
                      </div>

                      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📈 Ventas de la semana</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>Descarga todas las ventas de los últimos 7 días, una fila por pedido.</div>
                        <button onClick={exportarVentasSemanaCSV} disabled={ventasSemanaGenerating} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', opacity: ventasSemanaGenerating ? 0.6 : 1 }}>{ventasSemanaGenerating ? 'Generando…' : '📤 Exportar ventas de esta semana (CSV)'}</button>
                      </div>

                      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>💵 Formato de ventas para cálculo de sueldo</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>Ventas que hizo el vendedor por día. La columna "Horas trabajadas" queda en blanco para llenarla a mano.</div>
                        <div style={lblStyle}>Vendedor</div>
                        <select value={nominaVendedorId} onChange={e => { setNominaVendedorId(e.target.value); setNominaData(null); }} style={{ ...inputStyle }}>
                          <option value="">Selecciona…</option>
                          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                        </select>
                        <div style={lblStyle}>Periodo</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                          {[['semana', '7 días'], ['mes', '30 días'], ['custom', 'Rango']].map(([v, l]) => (
                            <button key={v} onClick={() => { setNominaRango(v); setNominaData(null); }} style={{ flex: 1, padding: '7px 2px', borderRadius: 8, border: 'none', background: nominaRango === v ? 'var(--accent)' : 'var(--surface-2)', color: nominaRango === v ? 'var(--surface-2)' : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                          ))}
                        </div>
                        {nominaRango === 'custom' && (
                          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <input type="date" value={nominaDesde} onChange={e => setNominaDesde(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                            <input type="date" value={nominaHasta} onChange={e => setNominaHasta(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                          </div>
                        )}
                        <button onClick={generarNomina} disabled={nominaGenerating} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', marginBottom: nominaData ? 12 : 0, opacity: nominaGenerating ? 0.6 : 1 }}>{nominaGenerating ? 'Generando…' : '📊 Generar formato'}</button>

                        {nominaData && (
                          <>
                            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{nominaData.vendedorNombre}</div>
                              {nominaData.filas.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Sin ventas en este periodo</div>}
                              {nominaData.filas.map((f, i) => (
                                <Row key={i} style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                                  <span>{new Date(f.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</span>
                                  <span style={{ color: 'var(--ink-soft)' }}>{f.cant} venta(s)</span>
                                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtx(f.total)}</span>
                                </Row>
                              ))}
                              <div style={{ borderTop: '1px solid var(--line-strong)', paddingTop: 6, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                                <span>Total ({nominaData.totalVentas} ventas)</span><span>{fmtx(nominaData.totalVendido)}</span>
                              </div>
                            </div>
                            <button onClick={exportarNominaCSV} style={{ width: '100%', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>📤 Exportar CSV (con columna de horas en blanco)</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {form && (
                <div style={{ position: 'fixed', inset: 0, background: '#1B1D19cc', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 420, margin: '0 auto', borderRadius: '18px 18px 0 0', padding: 20, maxHeight: '85vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>Programar ruta</span>
                      <button onClick={() => setForm(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 20, cursor: 'pointer' }}>✕</button>
                    </div>
                    {currentUser.role === 'admin' ? (
                      <>
                        <div style={lblStyle}>Repartidor</div>
                        <select value={form.repartidorId} onChange={e => { const u = usuarios.find(x => x.id === e.target.value); setForm(f => ({ ...f, repartidorId: e.target.value, repartidorNombre: u ? u.nombre : '' })); }} style={inputStyle}>
                          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                        </select>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--accent)' }}>👤 {currentUser.nombre}</div>
                    )}
                    <div style={lblStyle}>Vehículo</div>
                    <input value={form.vehiculo} onChange={e => setForm(f => ({ ...f, vehiculo: e.target.value }))} placeholder="Camioneta blanca, placas…" style={inputStyle} />
                    <div style={lblStyle}>Zona / colonia</div>
                    <input value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} placeholder="Centro, Col. Reforma…" style={inputStyle} />
                    <div style={lblStyle}>Salida programada</div>
                    <input type="datetime-local" value={form.fechaProgramada} onChange={e => setForm(f => ({ ...f, fechaProgramada: e.target.value }))} style={inputStyle} />
                    <div style={lblStyle}>Regreso estimado (opcional)</div>
                    <input type="datetime-local" value={form.fechaRegresoProgramada} onChange={e => setForm(f => ({ ...f, fechaRegresoProgramada: e.target.value }))} style={inputStyle} />
                    <div style={{ borderTop: '1px solid var(--line-strong)', margin: '14px 0' }} />
                    <div style={lblStyle}>Clientes y productos por visitar</div>
                    <ParadaBuilder clientes={clientes} productos={productos} paradas={form.paradas} onChange={ps => setForm(f => ({ ...f, paradas: ps }))} />
                    <button onClick={crear} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}>💾 Guardar</button>
                  </div>
                </div>
              )}

              {qrModalFor && (
                <div style={{ position: 'fixed', inset: 0, background: '#1B1D19cc', zIndex: 310, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, maxWidth: 320, width: '90%', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{qrModalFor.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 14 }}>{qrModalFor.telefono || ''}</div>
                    <div style={{ background: '#fff', borderRadius: 12, padding: 14, minHeight: 260, minWidth: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {qrDataURL ? <img src={qrDataURL} style={{ width: 232, height: 232 }} /> : <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Generando…</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      <button onClick={() => imprimirQR(qrModalFor, qrDataURL)} style={{ flex: 1, background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }} disabled={!qrDataURL}>🖨️ Imprimir</button>
                      <button onClick={() => setQrModalFor(null)} style={{ flex: 1, background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Cerrar</button>
                    </div>
                  </div>
                </div>
              )}

              {clienteScanOpen && <ClienteScanner onDetected={onScanCliente} onClose={() => setClienteScanOpen(false)} />}

              {ventaRapida && (
                <div style={{ position: 'fixed', inset: 0, background: '#1B1D19cc', zIndex: 310, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 420, margin: '0 auto', borderRadius: '18px 18px 0 0', padding: 20, maxHeight: '88vh', overflowY: 'auto' }}>
                    {!ventaRapida.done ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>🧾 Venta — {ventaRapida.cliente.nombre}</span>
                          <button onClick={() => setVentaRapida(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 20, cursor: 'pointer' }}>✕</button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 14 }}>📍 Se guarda con tu ubicación actual, para verificar la visita en campo.</div>
                        <div style={lblStyle}>Agregar productos</div>
                        <input value={ventaProdSearch} onChange={e => setVentaProdSearch(e.target.value)} placeholder="Buscar producto…" style={inputStyle} />
                        <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 12 }}>
                          {productos.filter(p => p.nombre.toLowerCase().includes(ventaProdSearch.toLowerCase())).map(p => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                              <div><div style={{ fontSize: 12 }}>{p.nombre}</div><div style={{ fontSize: 10, color: 'var(--accent)' }}>{fmtx(p.precio)}</div></div>
                              <button onClick={() => addProdVenta(p)} style={{ background: 'var(--info-bg)', color: 'var(--info-text)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>+ Agregar</button>
                            </div>
                          ))}
                        </div>
                        {ventaRapida.items.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 6 }}>CARRITO</div>
                            {ventaRapida.items.map(it => (
                              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <span style={{ fontSize: 12, flex: 1 }}>{it.nombre}</span>
                                <button onClick={() => updQtyVenta(it.id, it.cant - 1)} style={{ background: 'var(--line-strong)', border: 'none', color: 'var(--ink)', borderRadius: 6, width: 22, height: 22, cursor: 'pointer' }}>-</button>
                                <input type="number" min="1" value={it.cant} onChange={e => { const v = e.target.value; if (v === '') return; const n = parseInt(v); if (!isNaN(n) && n >= 1) updQtyVenta(it.id, n); }} onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) updQtyVenta(it.id, 1); }} style={{ width: 36, textAlign: 'center', fontSize: 12, background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 6, color: 'var(--ink)', padding: '3px 2px' }} />
                                <button onClick={() => updQtyVenta(it.id, it.cant + 1)} style={{ background: 'var(--line-strong)', border: 'none', color: 'var(--ink)', borderRadius: 6, width: 22, height: 22, cursor: 'pointer' }}>+</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                          {[['contado', '💵 Contado', 'var(--ok-bg)', 'var(--ok-text)'], ['credito', '📋 Crédito', 'var(--warn-bg)', 'var(--warn-text)']].map(([v, l, bg, col]) => (
                            <button key={v} onClick={() => setVentaRapida(vv => ({ ...vv, pago: v }))} style={{ flex: 1, padding: 9, borderRadius: 8, border: 'none', background: ventaRapida.pago === v ? bg : 'var(--surface-2)', color: ventaRapida.pago === v ? col : 'var(--ink-soft)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
                          ))}
                        </div>
                        <button onClick={guardarVentaRapida} disabled={ventaRapida.saving} style={{ width: '100%', background: 'var(--accent)', color: 'var(--surface-2)', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', opacity: ventaRapida.saving ? 0.6 : 1 }}>{ventaRapida.saving ? 'Guardando…' : '💾 Guardar venta'}</button>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '10px 0' }}>
                        <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Venta guardada</div>
                        <div style={{ color: 'var(--ink-soft)', marginBottom: 6 }}>{ventaRapida.cliente.nombre} · {fmtx(ventaRapida.done.total)}</div>
                        <div style={{ fontSize: 11, color: ventaRapida.done.ubicacionVenta.ok === false ? 'var(--danger-text)' : ventaRapida.done.ubicacionVenta.ok === true ? 'var(--ok)' : 'var(--warn-text)', marginBottom: 20 }}>
                          {ventaRapida.done.ubicacionVenta.ok === true ? '📍 Ubicación confirmada' : ventaRapida.done.ubicacionVenta.ok === false ? `⚠️ Ubicación fuera de rango (${ventaRapida.done.ubicacionVenta.distanciaM} m)` : '📍 No se pudo validar la ubicación'}
                        </div>
                        {ventaRapida.cliente.telefono && <button onClick={() => window.open(waVentaLink(ventaRapida.cliente, ventaRapida.done.items, ventaRapida.done.total, ventaRapida.done.pago), '_blank')} style={{ width: '100%', background: '#25d366', color: 'var(--ink)', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>📲 Enviar ticket por WhatsApp</button>}
                        <button onClick={() => setVentaRapida(null)} style={{ width: '100%', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Cerrar</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  function mount() {
    const div = document.createElement('div');
    div.id = 'rutas-repartidores-root';
    document.body.appendChild(div);
    ReactDOM.createRoot(div).render(<RepartidoresPanel />);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
