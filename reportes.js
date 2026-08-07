/* ── Reportes: respaldo completo, verificación de ubicación de ventas,
 * reporte de ventas y exportaciones (clientes+QR, ventas semana, sueldo) ──
 * Extraído de rutas-repartidores.js (antes era su sub-pestaña "Respaldo").
 * No depende de rutas ni de GPS en vivo — es puro reporting de admin.
 * Reutiliza helpers genéricos ya globales por rutas-repartidores.js:
 * fDateTime, fmtx, inputStyle, lblStyle, csvEscape/toCSV/downloadCSV,
 * qrTextForCliente/renderQRDataURL — ese archivo debe cargar antes que
 * este en index.html (ya es así).
 */
function Reportes({ productos, clientes, currentUser }) {
  const [msg, setMsg] = useState('');
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const [subTab, setSubTab] = useState('respaldo');

  // Exclusivo de este panel: quién puede reasignar/ver vendedores (nómina) y
  // el meta de respaldos. Es un duplicado *intencional* y liviano del mismo
  // listener que ya usa rutas-repartidores.js para su recordatorio de
  // respaldo — ambos son de un solo documento/colección chica y admin-only.
  const [usuarios, setUsuarios] = useState([]);
  const [backupMeta, setBackupMeta] = useState(null);
  useEffect(() => {
    const unsubU = db.collection('usuarios').onSnapshot(snap => setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    const unsubB = db.collection('_meta').doc('backups').onSnapshot(snap => setBackupMeta(snap.exists ? snap.data() : null), () => {});
    return () => { unsubU(); unsubB(); };
  }, []);

  const [backupGenerating, setBackupGenerating] = useState(false);
  const diasDesdeUltimoRespaldo = backupMeta && backupMeta.ultimoRespaldo
    ? Math.floor((Date.now() - new Date(backupMeta.ultimoRespaldo).getTime()) / 86400000)
    : null;
  const generarRespaldo = async () => {
    setBackupGenerating(true);
    try {
      const colecciones = ['productos', 'clientes', 'notas', 'creditos', 'rutas', 'rutas_meta', 'devoluciones', 'inventario_historial', 'usuarios'];
      const data = { generado: new Date().toISOString(), generadoPor: currentUser.nombre || currentUser.email };
      for (const col of colecciones) {
        const snap = await db.collection(col).get();
        data[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'respaldo_productos_de_la_costa_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      await db.collection('_meta').doc('backups').set({ ultimoRespaldo: new Date().toISOString(), por: currentUser.nombre || currentUser.email }, { merge: true });
      flash('✅ Respaldo descargado');
    } catch (e) { flash('❌ ' + e.message); }
    setBackupGenerating(false);
  };

  // ---- Verificación de ubicación del día ----
  const [ubicFecha, setUbicFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [ubicNotas, setUbicNotas] = useState(null);
  const [ubicLoading, setUbicLoading] = useState(false);
  const cargarUbicacionDia = async () => {
    setUbicLoading(true);
    try {
      const desde = new Date(ubicFecha + 'T00:00:00').toISOString();
      const hasta = new Date(ubicFecha + 'T23:59:59').toISOString();
      const snap = await db.collection('notas').where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
      // Solo interesan las notas que pasaron por una validación de ubicación
      // (ventas por ruta) — las del mostrador/oficina no traen este campo.
      const notas = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.ubicacionVenta);
      notas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      setUbicNotas(notas);
    } catch (e) { flash('❌ ' + e.message); }
    setUbicLoading(false);
  };

  // ---- Reporte de ventas ----
  const [reporteRango, setReporteRango] = useState('semana');
  const [reporteDesde, setReporteDesde] = useState('');
  const [reporteHasta, setReporteHasta] = useState('');
  const [reporteData, setReporteData] = useState(null);
  const [reporteGenerating, setReporteGenerating] = useState(false);
  const [reporteEmail, setReporteEmail] = useState('');
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
      const snap = await db.collection('notas').where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
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
  const [clientesQrGenerating, setClientesQrGenerating] = useState(false);
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
          const w = window.open('', '_blank');
          if (!w) { flash('⚠️ Habilita las ventanas emergentes para imprimir.'); setClientesQrGenerating(false); return; }
          const html = '<!doctype html><html><head><meta charset="utf-8"><title>QR clientes</title><style>' +
            'body{font-family:system-ui,sans-serif;margin:0;padding:16px}' +
            '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}' +
            '.card{border:1px solid #ccc;border-radius:8px;padding:10px;text-align:center;page-break-inside:avoid}' +
            '.card img{width:100%;max-width:150px}' +
            '.card div{font-size:12px;margin-top:6px;word-break:break-word}' +
            '@media print{body{padding:0}}</style></head><body>' +
            '<div class="grid">' + activos.map(c => `<div class="card"><img src="${results[c.id]}"/><div>${c.nombre}</div></div>`).join('') + '</div>' +
            '<script>window.onload=()=>window.print()</script></body></html>';
          w.document.write(html);
          w.document.close();
          setClientesQrGenerating(false);
        }
      });
    });
  };

  // ---- Exportar ventas de los últimos 7 días ----
  const [ventasSemanaGenerating, setVentasSemanaGenerating] = useState(false);
  const exportarVentasSemanaCSV = async () => {
    setVentasSemanaGenerating(true);
    try {
      const hoy = new Date();
      const desde = new Date(hoy); desde.setDate(hoy.getDate() - 7);
      const snap = await db.collection('notas').where('fecha', '>=', desde.toISOString()).where('fecha', '<=', hoy.toISOString()).get();
      const notas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      const rows = [['Fecha', 'Cliente', 'Vendedor', 'Productos', 'Total', 'Forma de pago']];
      notas.forEach(n => rows.push([fDateTime(n.fecha), n.clienteNombre, n.capturadoPorNombre || '', (n.items || []).map(it => it.nombre + ' x' + it.cant).join(' | '), (n.total || 0).toFixed(2), n.formaPago]));
      downloadCSV('ventas_semana_' + Date.now() + '.csv', rows);
      flash('✅ Ventas de la semana exportadas — ' + notas.length);
    } catch (e) { flash('❌ ' + e.message); }
    setVentasSemanaGenerating(false);
  };

  // ---- Formato de ventas del vendedor (para cálculo de sueldo) ----
  const [nominaVendedorId, setNominaVendedorId] = useState('');
  const [nominaRango, setNominaRango] = useState('semana');
  const [nominaDesde, setNominaDesde] = useState('');
  const [nominaHasta, setNominaHasta] = useState('');
  const [nominaData, setNominaData] = useState(null);
  const [nominaGenerating, setNominaGenerating] = useState(false);
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
      const snap = await db.collection('notas').where('capturadoPorUid', '==', nominaVendedorId).where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
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

  return (
    <div style={{ padding: '16px 12px' }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>📈 Reportes</div>
      {msg && <div style={{ background: 'var(--ok-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--ok-text)', marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['respaldo', '💾 Respaldo'], ['ubicacion', '📍 Ubicación'], ['reporte', '📈 Reporte de ventas'], ['exportar', '📤 Exportar']].map(([v, l]) => (
          <button key={v} onClick={() => setSubTab(v)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', background: subTab === v ? 'var(--accent)' : 'var(--surface)', color: subTab === v ? 'var(--surface-2)' : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {subTab === 'respaldo' && (
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

      {subTab === 'ubicacion' && (() => {
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

      {subTab === 'reporte' && (
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

      {subTab === 'exportar' && (
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
    </div>
  );
}
