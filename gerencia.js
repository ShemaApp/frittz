const esVentaEfectivo = fp => fp === 'efectivo' || fp === 'contado';
const mismoDia = (isoA, isoB) => new Date(isoA).toDateString() === new Date(isoB).toDateString();
function Gerencia({
  currentUser,
  notas
}) {
  const isAdmin = currentUser.role === 'admin';
  const [gastos, setGastos] = useState(null);
  const [form, setForm] = useState({
    pagadoA: '',
    monto: '',
    motivo: '',
    formaPago: 'efectivo'
  });
  const [saving, setSaving] = useState(false);
  const [rango, setRango] = useState('semana');
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
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (expandedId === id) setExpandedId(null);
  };
  const [msg, setMsg] = useState('');
  const flash = m => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };
  useEffect(() => {
    const query = isAdmin ? db.collection('gastos').orderBy('fecha', 'desc').limit(500) : db.collection('gastos').where('capturadoPorUid', '==', currentUser.uid).orderBy('fecha', 'desc').limit(300);
    const unsub = query.onSnapshot(snap => setGastos(snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }))), () => setGastos([]));
    return unsub;
  }, [isAdmin, currentUser.uid]);
  const guardar = async () => {
    if (!form.pagadoA || !form.monto || +form.monto <= 0) {
      alert('Completa "Pagado a" y un monto válido');
      return;
    }
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
      setForm({
        pagadoA: '',
        monto: '',
        motivo: '',
        formaPago: 'efectivo'
      });
      flash('✅ Gasto registrado');
    } catch (e) {
      alert('Error al guardar el gasto: ' + e.message);
    }
    setSaving(false);
  };
  const eliminar = async g => {
    if (!confirm(`¿Eliminar el gasto de ${fmt(g.monto)} a "${g.pagadoA}"?`)) return;
    await db.collection('gastos').doc(g.id).delete();
  };
  const hoyISO = new Date().toISOString();
  const misGastos = gastos ? gastos.filter(g => g.capturadoPorUid === currentUser.uid) : [];
  const misNotasHoy = (notas || []).filter(n => n.capturadoPorUid === currentUser.uid && mismoDia(n.fecha, hoyISO));
  const ventaEfectivoHoy = misNotasHoy.filter(n => esVentaEfectivo(n.formaPago)).reduce((s, n) => s + n.total, 0);
  const misGastosHoy = misGastos.filter(g => mismoDia(g.fecha, hoyISO));
  const gastoEfectivoHoy = misGastosHoy.filter(g => g.formaPago === 'efectivo').reduce((s, g) => s + g.monto, 0);
  const gastosTarjetaHoy = misGastosHoy.filter(g => g.formaPago === 'tarjeta');
  const efectivoEsperadoHoy = ventaEfectivoHoy - gastoEfectivoHoy;
  const now = new Date();
  const rangeStart = rango === 'semana' ? new Date(now - 7 * 86400000) : rango === 'mes' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(0);
  const filas = {};
  if (isAdmin) {
    (notas || []).filter(n => esVentaEfectivo(n.formaPago) && new Date(n.fecha) >= rangeStart).forEach(n => {
      const key = (n.capturadoPorUid || 'sin_id') + '_' + new Date(n.fecha).toDateString();
      filas[key] = filas[key] || {
        nombre: n.capturadoPorNombre || 'Sin identificar',
        fecha: n.fecha,
        venta: 0,
        gasto: 0,
        tarjeta: []
      };
      filas[key].venta += n.total;
    });
    (gastos || []).filter(g => new Date(g.fecha) >= rangeStart).forEach(g => {
      const key = g.capturadoPorUid + '_' + new Date(g.fecha).toDateString();
      filas[key] = filas[key] || {
        nombre: g.capturadoPorNombre,
        fecha: g.fecha,
        venta: 0,
        gasto: 0,
        tarjeta: []
      };
      if (g.formaPago === 'efectivo') filas[key].gasto += g.monto;else filas[key].tarjeta.push(g);
    });
  }
  const filasList = Object.values(filas).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return React.createElement("div", {
    style: {
      padding: '16px 12px'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      marginBottom: 12
    }
  }, "💰 Gerencia"), msg && React.createElement("div", {
    style: {
      background: 'var(--ok-bg)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      color: 'var(--ok-text)',
      marginBottom: 12
    }
  }, msg), React.createElement(Card, {
    style: {
      borderLeft: '3px solid var(--accent-text)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 8
    }
  }, "TU CAJA DE HOY"), React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      marginBottom: 4
    }
  }, React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Venta en efectivo"), React.createElement("span", {
    style: {
      fontWeight: 700,
      color: 'var(--ok-text)'
    }
  }, fmt(ventaEfectivoHoy))), React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, "Gasto en efectivo"), React.createElement("span", {
    style: {
      fontWeight: 700,
      color: 'var(--danger-text)'
    }
  }, "-", fmt(gastoEfectivoHoy))), React.createElement("div", {
    style: {
      borderTop: '1px solid var(--line)',
      paddingTop: 8
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "Efectivo esperado"), React.createElement("span", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: 'var(--accent-text)'
    }
  }, fmt(efectivoEsperadoHoy)))), gastosTarjetaHoy.length > 0 && React.createElement("div", {
    style: {
      marginTop: 10,
      paddingTop: 8,
      borderTop: '1px solid var(--line)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 4
    }
  }, "PAGADO CON TARJETA HOY (pendiente que te reembolsen)"), gastosTarjetaHoy.map(g => React.createElement(Row, {
    key: g.id,
    style: {
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 3
    }
  }, React.createElement("span", null, g.pagadoA), React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, fmt(g.monto)))))), React.createElement(Card, null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 10
    }
  }, "REGISTRAR GASTO"), React.createElement(Lbl, null, "Pagado a"), React.createElement(Inp, {
    value: form.pagadoA,
    onChange: e => setForm(f => ({
      ...f,
      pagadoA: e.target.value
    })),
    placeholder: "Ej. Pemex, Materia prima…",
    style: {
      marginBottom: 10
    }
  }), React.createElement(Lbl, null, "Monto"), React.createElement(Inp, {
    type: "number",
    value: form.monto,
    onChange: e => setForm(f => ({
      ...f,
      monto: e.target.value
    })),
    placeholder: "0.00",
    style: {
      marginBottom: 10
    }
  }), React.createElement(Lbl, null, "Motivo (nota)"), React.createElement(Inp, {
    value: form.motivo,
    onChange: e => setForm(f => ({
      ...f,
      motivo: e.target.value
    })),
    placeholder: "Ej. gasolina para la ruta de hoy…",
    style: {
      marginBottom: 10
    }
  }), React.createElement(Lbl, null, "¿Cómo se pagó?"), React.createElement(Row, {
    style: {
      gap: 8,
      marginBottom: 14
    }
  }, [['efectivo', '💵 Efectivo', 'var(--ok-bg)', 'var(--ok-text)'], ['tarjeta', '💳 Tarjeta', 'var(--info-bg)', 'var(--info-text)']].map(([v, l, bg, col]) => React.createElement("button", {
    key: v,
    onClick: () => setForm(f => ({
      ...f,
      formaPago: v
    })),
    style: {
      flex: 1,
      padding: '9px',
      borderRadius: 8,
      border: 'none',
      background: form.formaPago === v ? bg : 'var(--surface-2)',
      color: form.formaPago === v ? col : 'var(--ink-soft)',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), React.createElement(BFill, {
    onClick: guardar,
    style: {
      width: '100%'
    },
    disabled: saving
  }, saving ? 'Guardando…' : '💾 Guardar gasto')), isAdmin && React.createElement(Card, null, React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      marginBottom: 10
    }
  }, React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700
    }
  }, "REPORTE DE CAJA POR PERSONA")), React.createElement(Row, {
    style: {
      gap: 6,
      marginBottom: 12
    }
  }, [['semana', 'Semana'], ['mes', 'Mes'], ['todo', 'Todo']].map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => setRango(v),
    style: {
      flex: 1,
      padding: '7px',
      borderRadius: 8,
      border: 'none',
      background: rango === v ? 'var(--accent)' : 'var(--surface-2)',
      color: rango === v ? 'var(--ink)' : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), filasList.length === 0 && React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-faint)',
      textAlign: 'center',
      padding: '16px 0'
    }
  }, "Sin movimientos en este rango"), filasList.map((f, i) => React.createElement("div", {
    key: i,
    style: {
      paddingBottom: 10,
      borderBottom: '1px solid var(--line)',
      marginBottom: 10
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      marginBottom: 4
    }
  }, React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 13
    }
  }, f.nombre), React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)'
    }
  }, fDate(f.fecha))), React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 2
    }
  }, React.createElement("span", {
    style: {
      color: 'var(--ink-soft)'
    }
  }, "Venta efectivo"), React.createElement("span", {
    style: {
      color: 'var(--ok-text)'
    }
  }, fmt(f.venta))), React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 4
    }
  }, React.createElement("span", {
    style: {
      color: 'var(--ink-soft)'
    }
  }, "Gasto efectivo"), React.createElement("span", {
    style: {
      color: 'var(--danger-text)'
    }
  }, "-", fmt(f.gasto))), React.createElement(Row, {
    style: {
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 13
    }
  }, "Esperado"), React.createElement("span", {
    style: {
      fontWeight: 800,
      color: 'var(--accent-text)'
    }
  }, fmt(f.venta - f.gasto))), f.tarjeta.length > 0 && React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, f.tarjeta.map(g => React.createElement(Row, {
    key: g.id,
    style: {
      justifyContent: 'space-between',
      fontSize: 11,
      color: 'var(--info-text)'
    }
  }, React.createElement("span", null, "💳 ", g.pagadoA, " (pendiente reembolso)"), React.createElement("span", null, fmt(g.monto)))))))), React.createElement(Card, null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 10
    }
  }, isAdmin ? 'TODOS LOS GASTOS' : 'TUS GASTOS REGISTRADOS'), gastos === null && React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-faint)',
      textAlign: 'center',
      padding: '16px 0'
    }
  }, "Cargando…"), gastos && (isAdmin ? gastos : misGastos).length === 0 && React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-faint)',
      textAlign: 'center',
      padding: '16px 0'
    }
  }, "Sin gastos registrados aún"), isAdmin && gastos && (isAdmin ? gastos : misGastos).length > 0 && React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 10
    }
  }, "Mantén presionado un gasto para eliminarlo."), gastos && (isAdmin ? gastos : misGastos).map(g => {
    const expanded = expandedId === g.id;
    const fila = React.createElement(React.Fragment, null, React.createElement(Row, {
      style: {
        justifyContent: 'space-between',
        marginBottom: 3
      }
    }, React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 13
      }
    }, g.pagadoA), React.createElement(Row, {
      style: {
        gap: 6
      }
    }, React.createElement(Tag, {
      color: g.formaPago === 'tarjeta' ? 'var(--info-text)' : 'var(--ok-text)'
    }, g.formaPago === 'tarjeta' ? '💳 Tarjeta' : '💵 Efectivo'), React.createElement("span", {
      style: {
        fontWeight: 700,
        color: 'var(--danger-text)'
      }
    }, fmt(g.monto)))), g.motivo && React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-soft)'
      }
    }, g.motivo), React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--ink-faint)',
        marginTop: 4
      }
    }, g.capturadoPorNombre, " · ", fDate(g.fecha)));
    if (!isAdmin) {
      return React.createElement("div", {
        key: g.id,
        style: {
          paddingBottom: 8,
          borderBottom: '1px solid var(--line)',
          marginBottom: 8
        }
      }, fila);
    }
    return React.createElement("div", {
      key: g.id,
      style: {
        borderBottom: '1px solid var(--line)',
        marginBottom: 8
      }
    }, React.createElement("div", {
      onMouseDown: () => startPress(g.id),
      onMouseUp: cancelPress,
      onMouseLeave: cancelPress,
      onTouchStart: () => startPress(g.id),
      onTouchEnd: cancelPress,
      onTouchMove: cancelPress,
      onClick: () => onGastoTap(g.id),
      style: {
        paddingBottom: 8,
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent'
      }
    }, fila), React.createElement("div", {
      style: {
        maxHeight: expanded ? 50 : 0,
        overflow: 'hidden',
        transition: 'max-height .2s ease'
      }
    }, React.createElement(Row, {
      style: {
        paddingBottom: 8
      }
    }, React.createElement(BOut, {
      onClick: () => {
        eliminar(g);
        setExpandedId(null);
      },
      color: "var(--danger-text)",
      style: {
        flex: 1
      }
    }, "🗑 Eliminar"))));
  })));
}