function Creditos({
  creditos,
  currentUser
}) {
  const puedeEditar = currentUser?.role === 'admin' || permisoEdita(currentUser).creditos;
  const [abonoId, setAbonoId] = useState(null);
  const [monto, setMonto] = useState('');
  const [formaPagoAbono, setFormaPagoAbono] = useState('efectivo');
  const [savingAbono, setSavingAbono] = useState(false);
  const [expandedAbono, setExpandedAbono] = useState(null);
  const [editAbono, setEditAbono] = useState(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const pend = creditos.filter(c => c.saldo > 0);
  const totalPend = pend.reduce((s, c) => s + c.saldo, 0);
  const abonar = async c => {
    if (savingAbono) return;
    let m = parseFloat(monto);
    if (!m || m <= 0) return;
    m = Math.min(m, c.saldo);
    setSavingAbono(true);
    try {
      await db.collection('creditos').doc(c.id).update({
        saldo: firebase.firestore.FieldValue.increment(-m),
        abonos: firebase.firestore.FieldValue.arrayUnion({
          fecha: new Date().toISOString(),
          monto: m,
          formaPago: formaPagoAbono,
          capturadoPorUid: currentUser.uid,
          capturadoPorNombre: currentUser.nombre
        })
      });
      setMonto('');
      setFormaPagoAbono('efectivo');
      setAbonoId(null);
    } catch (e) {
      alert('Error al registrar abono: ' + e.message);
    }
    setSavingAbono(false);
  };
  const startPress = key => {
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      if (navigator.vibrate) navigator.vibrate(12);
      setExpandedAbono(eid => eid === key ? null : key);
    }, 500);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const onAbonoTap = key => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (expandedAbono === key) setExpandedAbono(null);
  };
  const eliminarAbono = async (c, i) => {
    const a = c.abonos[i];
    if (!window.confirm(`¿Eliminar el abono de ${fmt(a.monto)} del ${fDate(a.fecha)}? Esta acción no se puede deshacer.`)) return;
    const nuevosAbonos = c.abonos.filter((_, idx) => idx !== i);
    const nuevoSaldo = c.total - nuevosAbonos.reduce((s, x) => s + x.monto, 0);
    try {
      await db.collection('creditos').doc(c.id).update({
        abonos: nuevosAbonos,
        saldo: nuevoSaldo
      });
    } catch (e) {
      alert('Error al eliminar el abono: ' + e.message);
    }
    setExpandedAbono(null);
  };
  const guardarCorreccion = async (c, i) => {
    const nuevoMonto = parseFloat(editAbono.monto);
    if (!nuevoMonto || nuevoMonto <= 0) {
      alert('Monto inválido');
      return;
    }
    const nuevosAbonos = c.abonos.map((a, idx) => idx === i ? {
      ...a,
      monto: nuevoMonto
    } : a);
    const nuevoSaldo = c.total - nuevosAbonos.reduce((s, x) => s + x.monto, 0);
    if (nuevoSaldo < 0) {
      alert('Ese monto hace que se pase del total del crédito');
      return;
    }
    setCorrigiendo(true);
    try {
      await db.collection('creditos').doc(c.id).update({
        abonos: nuevosAbonos,
        saldo: nuevoSaldo
      });
      setEditAbono(null);
      setExpandedAbono(null);
    } catch (e) {
      alert('Error al corregir el abono: ' + e.message);
    }
    setCorrigiendo(false);
  };
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
  }, "💳 Créditos"), React.createElement(Card, {
    style: {
      borderLeft: '3px solid var(--warn-text)',
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)'
    }
  }, "Total pendiente"), React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 800,
      color: 'var(--warn-text)'
    }
  }, fmt(totalPend)), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)'
    }
  }, pend.length, " cuenta(s)")), pend.length === 0 && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: 'var(--ink-faint)',
      fontSize: 14,
      paddingTop: 20
    }
  }, "Sin créditos pendientes ✅"), pend.map(c => React.createElement(Card, {
    key: c.id
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      marginBottom: 8
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 14
    }
  }, c.clienteNombre), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)'
    }
  }, fDate(c.fecha))), React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: 'var(--warn-text)'
    }
  }, fmt(c.saldo)), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)'
    }
  }, "de ", fmt(c.total)))), React.createElement("div", {
    style: {
      background: 'var(--surface-2)',
      borderRadius: 10,
      height: 6,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      background: 'var(--ok)',
      borderRadius: 10,
      height: 6,
      width: `${Math.round((c.total - c.saldo) / c.total * 100)}%`
    }
  })), c.abonos.length > 0 && React.createElement("div", {
    style: {
      marginBottom: 10,
      paddingTop: 6,
      borderTop: '1px solid var(--line)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 4,
      fontWeight: 700
    }
  }, "ABONOS"), puedeEditar && React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--ink-faint)',
      marginBottom: 6
    }
  }, "Mantén presionado un abono para corregirlo o eliminarlo."), c.abonos.map((a, i) => {
    const key = c.id + '_' + i;
    const expanded = expandedAbono === key;
    const editing = editAbono && editAbono.creditoId === c.id && editAbono.index === i;
    return React.createElement("div", {
      key: i,
      style: {
        marginBottom: 3
      }
    }, React.createElement("div", {
      onMouseDown: () => puedeEditar && startPress(key),
      onMouseUp: cancelPress,
      onMouseLeave: cancelPress,
      onTouchStart: () => puedeEditar && startPress(key),
      onTouchEnd: cancelPress,
      onTouchMove: cancelPress,
      onClick: () => puedeEditar && onAbonoTap(key),
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
        padding: '2px 0',
        cursor: puedeEditar ? 'pointer' : 'default',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent'
      }
    }, React.createElement("span", {
      style: {
        color: 'var(--ink-soft)'
      }
    }, fDate(a.fecha)), React.createElement(Row, {
      style: {
        gap: 5
      }
    }, a.formaPago && React.createElement(Tag, {
      color: a.formaPago === 'transferencia' ? 'var(--info-text)' : 'var(--ok-text)',
      style: {
        fontSize: 9,
        padding: '1px 5px'
      }
    }, a.formaPago === 'transferencia' ? '🏦' : '💵'), React.createElement("span", {
      style: {
        color: 'var(--ok-text)',
        fontWeight: 700
      }
    }, "+", fmt(a.monto)))), puedeEditar && React.createElement("div", {
      style: {
        maxHeight: expanded ? editing ? 46 : 40 : 0,
        overflow: 'hidden',
        transition: 'max-height .2s ease'
      }
    }, editing ? React.createElement(Row, {
      style: {
        gap: 6,
        marginTop: 4,
        marginBottom: 4
      }
    }, React.createElement(Inp, {
      type: "number",
      value: editAbono.monto,
      onChange: e => setEditAbono(x => ({
        ...x,
        monto: e.target.value
      })),
      style: {
        flex: 1,
        marginBottom: 0
      }
    }), React.createElement(BFill, {
      onClick: () => guardarCorreccion(c, i),
      bg: "var(--ok)",
      color: "var(--ink)",
      style: {
        padding: '8px 14px',
        opacity: corrigiendo ? 0.6 : 1
      },
      disabled: corrigiendo
    }, corrigiendo ? '…' : '✓'), React.createElement("button", {
      onClick: () => setEditAbono(null),
      style: {
        background: 'none',
        border: 'none',
        color: 'var(--ink-soft)',
        cursor: 'pointer',
        display: 'flex'
      }
    }, React.createElement(XI, {
      size: 16
    }))) : React.createElement(Row, {
      style: {
        gap: 6,
        marginTop: 4,
        marginBottom: 4
      }
    }, React.createElement(BOut, {
      onClick: () => setEditAbono({
        creditoId: c.id,
        index: i,
        monto: String(a.monto)
      }),
      style: {
        flex: 1,
        padding: '5px 8px',
        fontSize: 11
      }
    }, "✏️ Corregir"), React.createElement(BOut, {
      onClick: () => eliminarAbono(c, i),
      color: "var(--danger-text)",
      style: {
        flex: 1,
        padding: '5px 8px',
        fontSize: 11
      }
    }, "🗑️ Eliminar"))));
  })), puedeEditar && (abonoId === c.id ? React.createElement("div", null, React.createElement(Row, {
    style: {
      gap: 6,
      marginBottom: 6
    }
  }, [['efectivo', '💵 Efectivo', 'var(--ok-bg)', 'var(--ok-text)'], ['transferencia', '🏦 Transferencia', 'var(--info-bg)', 'var(--info-text)']].map(([v, l, bg, col]) => React.createElement("button", {
    key: v,
    onClick: () => setFormaPagoAbono(v),
    style: {
      flex: 1,
      padding: '6px',
      borderRadius: 8,
      border: 'none',
      background: formaPagoAbono === v ? bg : 'var(--surface-2)',
      color: formaPagoAbono === v ? col : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), React.createElement(Row, {
    style: {
      gap: 8
    }
  }, React.createElement(Inp, {
    type: "number",
    placeholder: "Monto abono…",
    value: monto,
    onChange: e => setMonto(e.target.value),
    style: {
      flex: 1
    }
  }), React.createElement(BFill, {
    onClick: () => abonar(c),
    bg: "var(--ok)",
    color: "var(--ink)",
    style: {
      padding: '8px 14px',
      opacity: savingAbono ? 0.6 : 1
    },
    disabled: savingAbono
  }, savingAbono ? '…' : '✓'), React.createElement("button", {
    onClick: () => {
      setAbonoId(null);
      setMonto('');
      setFormaPagoAbono('efectivo');
    },
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--ink-soft)',
      cursor: 'pointer',
      display: 'flex'
    }
  }, React.createElement(XI, {
    size: 18
  })))) : React.createElement(BOut, {
    onClick: () => setAbonoId(c.id),
    color: "var(--ok-text)",
    style: {
      width: '100%'
    }
  }, "+ Registrar abono")))));
}