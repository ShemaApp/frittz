/* ── Gerencia: gastos generales + conciliación de caja ──
   Se conecta a index.html como una pestaña más (mismo patrón que
   rutas-repartidores.js). Usa los componentes globales ya definidos ahí
   (Card, BFill, BOut, Inp, Lbl, Row, Tag, fmt, fDate, uid, db).
   No toca inventario/stock para nada — es solo dinero que entra y sale. */

/* useState y useEffect ya están disponibles globalmente desde index.html
   (se declaran una sola vez ahí) — no se repiten aquí para evitar el error
   "Identifier 'useState' has already been declared" que rompía el render. */

// Trata 'contado' (formaPago histórico) como efectivo para no perder ventas viejas
const esVentaEfectivo = fp => fp === 'efectivo' || fp === 'contado';
const mismoDia = (isoA, isoB) => new Date(isoA).toDateString() === new Date(isoB).toDateString();

function Gerencia({ currentUser, notas }) {
  const isAdmin = currentUser.role === 'admin';
  const [gastos, setGastos] = useState(null);
  const [form, setForm] = useState({ pagadoA: '', monto: '', motivo: '', formaPago: 'efectivo' });
  const [saving, setSaving] = useState(false);
  const [rango, setRango] = useState('semana'); // solo aplica a la vista de admin
  const [expandedId, setExpandedId] = useState(null);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const startPress = id => {
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      if (navigator.vibrate) navigator.vibrate(12);
      setExpandedId(eid => eid === id ? null : id);
    }, 500);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const onGastoTap = id => {
    if (longPressed.current) { longPressed.current = false; return; } // ignora el click fantasma que sigue al long-press
    if (expandedId === id) setExpandedId(null);
  };
  const [msg, setMsg] = useState('');
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  // Consulta distinta según rol: admin ve todo; el resto solo lo que él mismo capturó
  // (así coincide exactamente con lo que permiten las reglas de Firestore).
  useEffect(() => {
    const query = isAdmin
      ? db.collection('gastos').orderBy('fecha', 'desc').limit(500)
      : db.collection('gastos').where('capturadoPorUid', '==', currentUser.uid).orderBy('fecha', 'desc').limit(300);
    const unsub = query.onSnapshot(
      snap => setGastos(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setGastos([])
    );
    return unsub;
  }, [isAdmin, currentUser.uid]);

  const guardar = async () => {
    if (!form.pagadoA || !form.monto || +form.monto <= 0) { alert('Completa "Pagado a" y un monto válido'); return; }
    setSaving(true);
    try {
      await db.collection('gastos').add({
        fecha: new Date().toISOString(),
        pagadoA: form.pagadoA,
        monto: +form.monto,
        motivo: form.motivo || '',
        formaPago: form.formaPago,
        capturadoPorUid: currentUser.uid,
        capturadoPorNombre: currentUser.nombre
      });
      setForm({ pagadoA: '', monto: '', motivo: '', formaPago: 'efectivo' });
      flash('✅ Gasto registrado');
    } catch (e) { alert('Error al guardar el gasto: ' + e.message); }
    setSaving(false);
  };

  const eliminar = async g => {
    if (!confirm(`¿Eliminar el gasto de ${fmt(g.monto)} a "${g.pagadoA}"?`)) return;
    await db.collection('gastos').doc(g.id).delete();
  };

  // ── Resumen de caja de HOY para el usuario actual (visible para todos) ──
  const hoyISO = new Date().toISOString();
  const misGastos = gastos ? gastos.filter(g => g.capturadoPorUid === currentUser.uid) : [];
  const misNotasHoy = (notas || []).filter(n => n.capturadoPorUid === currentUser.uid && mismoDia(n.fecha, hoyISO));
  const ventaEfectivoHoy = misNotasHoy.filter(n => esVentaEfectivo(n.formaPago)).reduce((s, n) => s + n.total, 0);
  const misGastosHoy = misGastos.filter(g => mismoDia(g.fecha, hoyISO));
  const gastoEfectivoHoy = misGastosHoy.filter(g => g.formaPago === 'efectivo').reduce((s, g) => s + g.monto, 0);
  const gastosTarjetaHoy = misGastosHoy.filter(g => g.formaPago === 'tarjeta');
  const efectivoEsperadoHoy = ventaEfectivoHoy - gastoEfectivoHoy;

  // ── Reporte completo para admin, agrupado por persona + día, según rango ──
  const now = new Date();
  const rangeStart = rango === 'semana' ? new Date(now - 7 * 86400000)
    : rango === 'mes' ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(0);
  const filas = {};
  if (isAdmin) {
    (notas || []).filter(n => esVentaEfectivo(n.formaPago) && new Date(n.fecha) >= rangeStart).forEach(n => {
      const key = (n.capturadoPorUid || 'sin_id') + '_' + new Date(n.fecha).toDateString();
      filas[key] = filas[key] || { nombre: n.capturadoPorNombre || 'Sin identificar', fecha: n.fecha, venta: 0, gasto: 0, tarjeta: [] };
      filas[key].venta += n.total;
    });
    (gastos || []).filter(g => new Date(g.fecha) >= rangeStart).forEach(g => {
      const key = g.capturadoPorUid + '_' + new Date(g.fecha).toDateString();
      filas[key] = filas[key] || { nombre: g.capturadoPorNombre, fecha: g.fecha, venta: 0, gasto: 0, tarjeta: [] };
      if (g.formaPago === 'efectivo') filas[key].gasto += g.monto;
      else filas[key].tarjeta.push(g);
    });
  }
  const filasList = Object.values(filas).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  return <div style={{ padding: '16px 12px' }}>
    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>💰 Gerencia</div>
    {msg && <div style={{ background: 'var(--ok-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--ok-text)', marginBottom: 12 }}>{msg}</div>}

    {/* ── Resumen de caja de hoy (todos los roles) ── */}
    <Card style={{ borderLeft: '3px solid var(--accent-text)' }}>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 8 }}>TU CAJA DE HOY</div>
      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 13 }}>Venta en efectivo</span><span style={{ fontWeight: 700, color: 'var(--ok-text)' }}>{fmt(ventaEfectivoHoy)}</span></Row>
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 13 }}>Gasto en efectivo</span><span style={{ fontWeight: 700, color: 'var(--danger-text)' }}>-{fmt(gastoEfectivoHoy)}</span></Row>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700 }}>Efectivo esperado</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-text)' }}>{fmt(efectivoEsperadoHoy)}</span>
        </Row>
      </div>
      {gastosTarjetaHoy.length > 0 && <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 4 }}>PAGADO CON TARJETA HOY (pendiente que te reembolsen)</div>
        {gastosTarjetaHoy.map(g => <Row key={g.id} style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span>{g.pagadoA}</span><span style={{ fontWeight: 700 }}>{fmt(g.monto)}</span>
        </Row>)}
      </div>}
    </Card>

    {/* ── Formulario para registrar un gasto ── */}
    <Card>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10 }}>REGISTRAR GASTO</div>
      <Lbl>Pagado a</Lbl>
      <Inp value={form.pagadoA} onChange={e => setForm(f => ({ ...f, pagadoA: e.target.value }))} placeholder="Ej. Pemex, Materia prima…" style={{ marginBottom: 10 }} />
      <Lbl>Monto</Lbl>
      <Inp type="number" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" style={{ marginBottom: 10 }} />
      <Lbl>Motivo (nota)</Lbl>
      <Inp value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej. gasolina para la ruta de hoy…" style={{ marginBottom: 10 }} />
      <Lbl>¿Cómo se pagó?</Lbl>
      <Row style={{ gap: 8, marginBottom: 14 }}>
        {[['efectivo', '💵 Efectivo', 'var(--ok-bg)', 'var(--ok-text)'], ['tarjeta', '💳 Tarjeta', 'var(--info-bg)', 'var(--info-text)']].map(([v, l, bg, col]) => (
          <button key={v} onClick={() => setForm(f => ({ ...f, formaPago: v }))} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: form.formaPago === v ? bg : 'var(--surface-2)', color: form.formaPago === v ? col : 'var(--ink-soft)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
        ))}
      </Row>
      <BFill onClick={guardar} style={{ width: '100%' }} disabled={saving}>{saving ? 'Guardando…' : '💾 Guardar gasto'}</BFill>
    </Card>

    {/* ── Reporte completo (solo admin) ── */}
    {isAdmin && <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700 }}>REPORTE DE CAJA POR PERSONA</span>
      </Row>
      <Row style={{ gap: 6, marginBottom: 12 }}>
        {[['semana', 'Semana'], ['mes', 'Mes'], ['todo', 'Todo']].map(([v, l]) => (
          <button key={v} onClick={() => setRango(v)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: rango === v ? 'var(--accent)' : 'var(--surface-2)', color: rango === v ? 'var(--ink)' : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
        ))}
      </Row>
      {filasList.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '16px 0' }}>Sin movimientos en este rango</div>}
      {filasList.map((f, i) => <div key={i} style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)', marginBottom: 10 }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{f.nombre}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{fDate(f.fecha)}</span>
        </Row>
        <Row style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span style={{ color: 'var(--ink-soft)' }}>Venta efectivo</span><span style={{ color: 'var(--ok-text)' }}>{fmt(f.venta)}</span></Row>
        <Row style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span style={{ color: 'var(--ink-soft)' }}>Gasto efectivo</span><span style={{ color: 'var(--danger-text)' }}>-{fmt(f.gasto)}</span></Row>
        <Row style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 700, fontSize: 13 }}>Esperado</span><span style={{ fontWeight: 800, color: 'var(--accent-text)' }}>{fmt(f.venta - f.gasto)}</span></Row>
        {f.tarjeta.length > 0 && <div style={{ marginTop: 6 }}>
          {f.tarjeta.map(g => <Row key={g.id} style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--info-text)' }}><span>💳 {g.pagadoA} (pendiente reembolso)</span><span>{fmt(g.monto)}</span></Row>)}
        </div>}
      </div>)}
    </Card>}

    {/* ── Lista de gastos (propios para todos; admin ve todos con quién los capturó) ── */}
    <Card>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10 }}>{isAdmin ? 'TODOS LOS GASTOS' : 'TUS GASTOS REGISTRADOS'}</div>
      {gastos === null && <div style={{ fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '16px 0' }}>Cargando…</div>}
      {gastos && (isAdmin ? gastos : misGastos).length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '16px 0' }}>Sin gastos registrados aún</div>}
      {isAdmin&&gastos&&(isAdmin?gastos:misGastos).length>0&&<div style={{fontSize:11,color:'var(--ink-faint)',marginBottom:10}}>Mantén presionado un gasto para eliminarlo.</div>}
      {gastos && (isAdmin ? gastos : misGastos).map(g => {
        const expanded=expandedId===g.id;
        const fila=<>
          <Row style={{ justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{g.pagadoA}</span>
            <Row style={{ gap: 6 }}>
              <Tag color={g.formaPago === 'tarjeta' ? 'var(--info-text)' : 'var(--ok-text)'}>{g.formaPago === 'tarjeta' ? '💳 Tarjeta' : '💵 Efectivo'}</Tag>
              <span style={{ fontWeight: 700, color: 'var(--danger-text)' }}>{fmt(g.monto)}</span>
            </Row>
          </Row>
          {g.motivo && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{g.motivo}</div>}
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>{g.capturadoPorNombre} · {fDate(g.fecha)}</div>
        </>;
        if(!isAdmin){
          // Sin acción destructiva que ocultar para este rol — fila simple, sin long-press.
          return <div key={g.id} style={{ paddingBottom: 8, borderBottom: '1px solid var(--line)', marginBottom: 8 }}>{fila}</div>;
        }
        return <div key={g.id} style={{borderBottom:'1px solid var(--line)',marginBottom:8}}>
          <div
            onMouseDown={()=>startPress(g.id)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
            onTouchStart={()=>startPress(g.id)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
            onClick={()=>onGastoTap(g.id)}
            style={{paddingBottom:8,cursor:'pointer',userSelect:'none',WebkitTapHighlightColor:'transparent'}}
          >{fila}</div>
          <div style={{maxHeight:expanded?50:0,overflow:'hidden',transition:'max-height .2s ease'}}>
            <Row style={{paddingBottom:8}}>
              <BOut onClick={()=>{eliminar(g);setExpandedId(null);}} color="var(--danger-text)" style={{flex:1}}>🗑 Eliminar</BOut>
            </Row>
          </div>
        </div>;
      })}
    </Card>
  </div>;
}
