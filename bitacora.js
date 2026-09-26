'use strict';
const BITACORA_TIPO_INFO = {
  crear: { label: 'Alta', color: 'var(--ok-text)' },
  editar: { label: 'Edición', color: 'var(--info-text)' },
  eliminar: { label: 'Baja', color: 'var(--danger-text)' },
  activar: { label: 'Activación', color: 'var(--ok-text)' },
  desactivar: { label: 'Desactivación', color: 'var(--warn-text)' },
  permiso: { label: 'Permiso', color: 'var(--admin)' },
  venta: { label: 'Venta', color: 'var(--accent-text)' },
  abono: { label: 'Abono', color: 'var(--ok-text)' },
  asignar: { label: 'Asignación', color: 'var(--info-text)' },
  reporte: { label: 'Reporte', color: 'var(--ink-faint)' }
};
const BITACORA_ENTIDAD_LABEL = {
  producto: '📦 Producto', cliente: '👤 Cliente', usuario: '🔑 Usuario', credito: '💳 Crédito',
  abono_credito: '💳 Abono', nota: '🧾 Venta', pedido: '📋 Pedido', reporte: '📈 Reporte'
};
function Bitacora({ currentUser }) {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroEntidad, setFiltroEntidad] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [expandido, setExpandido] = useState(null);
  useEffect(() => {
    if (currentUser?.role !== 'admin') return undefined;
    const unsub = db.collection('bitacora').orderBy('fecha', 'desc').limit(400).onSnapshot(snap => {
      setRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCargando(false);
    }, e => {
      setError(e.message);
      setCargando(false);
    });
    return unsub;
  }, [currentUser?.role]);
  if (currentUser?.role !== 'admin') {
    return React.createElement(Card, null, "Esta sección es solo para administradores.");
  }
  const tipos = ['todos', ...Object.keys(BITACORA_TIPO_INFO)];
  const entidades = ['todas', ...Object.keys(BITACORA_ENTIDAD_LABEL)];
  const filtrados = registros.filter(r => {
    if (filtroTipo !== 'todos' && r.tipo !== filtroTipo) return false;
    if (filtroEntidad !== 'todas' && r.entidad !== filtroEntidad) return false;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      const campo = (r.descripcion || '') + ' ' + (r.entidadNombre || '') + ' ' + (r.usuarioNombre || '');
      if (!campo.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const fDT = iso => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return iso;
    }
  };
  return React.createElement("div", {
    style: { padding: '16px 12px' }
  }, React.createElement("div", {
    style: { fontSize: 20, fontWeight: 800, marginBottom: 4 }
  }, "🗂️ Bitácora"), React.createElement("div", {
    style: { fontSize: 12, color: 'var(--ink-faint)', marginBottom: 14, lineHeight: 1.4 }
  }, "Cada alta, edición, baja, venta, crédito, permiso y descarga de reporte queda aquí — visible solo para administradores."), error && React.createElement(Card, {
    style: { borderColor: 'var(--danger-text)' }
  }, "❌ ", error), React.createElement(Card, null, React.createElement(Inp, {
    placeholder: "🔍 Buscar por nombre, descripción o usuario…",
    value: busqueda,
    onChange: e => setBusqueda(e.target.value),
    style: { marginBottom: 10 }
  }), React.createElement("div", {
    style: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 6 }
  }, tipos.map(t => React.createElement("button", {
    key: t,
    onClick: () => setFiltroTipo(t),
    style: {
      flexShrink: 0,
      background: filtroTipo === t ? 'var(--accent)' : 'var(--surface-2)',
      color: filtroTipo === t ? 'var(--accent-ink)' : 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 20,
      padding: '5px 11px',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, t === 'todos' ? 'Todos' : BITACORA_TIPO_INFO[t].label))), React.createElement("div", {
    style: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }
  }, entidades.map(en => React.createElement("button", {
    key: en,
    onClick: () => setFiltroEntidad(en),
    style: {
      flexShrink: 0,
      background: filtroEntidad === en ? 'var(--rail)' : 'var(--surface-2)',
      color: filtroEntidad === en ? 'var(--rail-ink)' : 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 20,
      padding: '5px 11px',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, en === 'todas' ? 'Todas' : BITACORA_ENTIDAD_LABEL[en])))), cargando && React.createElement(Card, null, "Cargando…"), !cargando && filtrados.length === 0 && React.createElement(Card, null, "No hay movimientos con estos filtros."), filtrados.map(r => {
    const info = BITACORA_TIPO_INFO[r.tipo] || { label: r.tipo || '—', color: 'var(--ink-faint)' };
    const abierto = expandido === r.id;
    return React.createElement(Card, {
      key: r.id,
      style: { cursor: 'pointer' }
    }, React.createElement("div", {
      onClick: () => setExpandido(abierto ? null : r.id)
    }, React.createElement(Row, {
      style: { justifyContent: 'space-between', marginBottom: 6 }
    }, React.createElement(Tag, { color: info.color }, info.label), React.createElement("span", {
      style: { fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }
    }, fDT(r.fecha))), React.createElement("div", {
      style: { fontSize: 13, fontWeight: 600, marginBottom: 4 }
    }, BITACORA_ENTIDAD_LABEL[r.entidad] || r.entidad || '', r.entidadNombre ? ' — ' + r.entidadNombre : ''), React.createElement("div", {
      style: { fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.4 }
    }, r.descripcion), React.createElement("div", {
      style: { fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }
    }, "👤 ", r.usuarioNombre || r.usuarioEmail || 'Desconocido')), abierto && (r.antes || r.despues) && React.createElement("div", {
      style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', gap: 10, flexWrap: 'wrap' }
    }, r.antes && React.createElement("div", {
      style: { flex: '1 1 140px' }
    }, React.createElement("div", { style: { fontSize: 10, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 4 } }, "ANTES"), React.createElement("pre", {
      style: { fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2)', padding: 8, borderRadius: 4, margin: 0, fontFamily: 'var(--font-mono)' }
    }, JSON.stringify(r.antes, null, 1))), r.despues && React.createElement("div", {
      style: { flex: '1 1 140px' }
    }, React.createElement("div", { style: { fontSize: 10, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 4 } }, "DESPUÉS"), React.createElement("pre", {
      style: { fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2)', padding: 8, borderRadius: 4, margin: 0, fontFamily: 'var(--font-mono)' }
    }, JSON.stringify(r.despues, null, 1)))));
  }));
}
