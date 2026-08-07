function CrearNota({
  productos,
  clientes,
  currentUser,
  ventaRapida,
  onVentaRapidaConsumida
}) {
  const [cliOpen, setCliOpen] = useState(true);
  const [prodOpen, setProdOpen] = useState(false);
  const [cliMode, setCliMode] = useState('buscar');
  const [cliSearch, setCliSearch] = useState('');
  const [cliSel, setCliSel] = useState(null);
  const [nuevoC, setNuevoC] = useState({
    nombre: '',
    telefono: ''
  });
  const [cart, setCart] = useState([]);
  const [pago, setPago] = useState('efectivo');
  const [done, setDone] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (ventaRapida) {
      setCliMode('nuevo');
      setNuevoC({
        nombre: 'Venta mostrador',
        telefono: ''
      });
      setCliOpen(false);
      setProdOpen(true);
      onVentaRapidaConsumida && onVentaRapidaConsumida();
    }
  }, [ventaRapida]);
  const cliFilt = clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliSearch.toLowerCase()));
  const addCart = p => setCart(c => {
    const ex = c.find(x => x.id === p.id);
    return ex ? c.map(x => x.id === p.id ? {
      ...x,
      cant: (Number(x.cant) || 0) + 1
    } : x) : [...c, {
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      cant: 1
    }];
  });
  const updQty = (id, v) => {
    setCart(c => c.map(x => x.id === id ? {
      ...x,
      cant: v
    } : x));
  };
  const cartValido = cart.filter(x => Number(x.cant) > 0).map(x => ({
    ...x,
    cant: Number(x.cant)
  }));
  const total = cartValido.reduce((s, x) => s + x.precio * x.cant, 0);
  const cliente = cliMode === 'nuevo' ? nuevoC : cliSel;
  const canSave = cliente?.nombre && cartValido.length > 0;
  const makeWA = (cl, items, tot, fp) => {
    const lines = items.map(x => `• ${x.nombre} x${x.cant} = ${fmt(x.precio * x.cant)}`).join('\n');
    const text = `🧾 *PEDIDO*\n👤 ${cl.nombre}\n\n${lines}\n\n💰 *Total: ${fmt(tot)}*\nPago: ${fp}`;
    let telefono = (cl.telefono || '').replace(/\D/g, '');
    if (!telefono.startsWith('52') && telefono.length <= 10) telefono = '52' + telefono;
    return `https://wa.me/${telefono}?text=${encodeURIComponent(text)}`;
  };
  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const stockErrors = [];
      cartValido.forEach(item => {
        const producto = productos.find(p => p.id === item.id);
        if (!producto || producto.stock < item.cant) stockErrors.push(`${item.nombre} (disponible: ${producto?.stock || 0}, solicitado: ${item.cant})`);
      });
      if (stockErrors.length > 0) {
        alert('❌ Stock insuficiente:\n' + stockErrors.join('\n'));
        setSaving(false);
        return;
      }
      let cl = cliSel;
      if (cliMode === 'nuevo') {
        const ref = await db.collection('clientes').add({
          nombre: nuevoC.nombre,
          telefono: nuevoC.telefono || '',
          domicilio: '',
          activo: true
        });
        cl = {
          id: ref.id,
          nombre: nuevoC.nombre,
          telefono: nuevoC.telefono || ''
        };
      }
      const nota = {
        fecha: new Date().toISOString(),
        clienteId: cl.id,
        clienteNombre: cl.nombre,
        clienteTelefono: cl.telefono || '',
        items: cartValido.map(x => ({
          ...x
        })),
        total,
        formaPago: pago,
        capturadoPorUid: currentUser.uid,
        capturadoPorNombre: currentUser.nombre
      };
      const notaRef = await db.collection('notas').add(nota);
      if (pago === 'credito') await db.collection('creditos').add({
        notaId: notaRef.id,
        clienteId: cl.id,
        clienteNombre: cl.nombre,
        fecha: nota.fecha,
        total,
        saldo: total,
        abonos: []
      });
      const batch = db.batch();
      cartValido.forEach(item => {
        batch.update(db.collection('productos').doc(item.id), {
          stock: firebase.firestore.FieldValue.increment(-item.cant)
        });
      });
      await batch.commit();
      setDone({
        nota: {
          ...nota,
          id: notaRef.id
        },
        cl
      });
      setCart([]);
      setCliSel(null);
      setNuevoC({
        nombre: '',
        telefono: ''
      });
      setCliMode('buscar');
    } catch (e) {
      alert('Error al guardar el pedido: ' + e.message);
    }
    setSaving(false);
  };
  if (done) return React.createElement("div", {
    style: {
      padding: 24,
      textAlign: 'center'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 52,
      marginBottom: 8
    }
  }, "✅"), React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Pedido guardado"), React.createElement("div", {
    style: {
      color: 'var(--ink-soft)',
      marginBottom: 24
    }
  }, done.cl.nombre, " · ", fmt(done.nota.total)), done.cl.telefono && React.createElement(BFill, {
    onClick: () => window.open(makeWA(done.cl, done.nota.items, done.nota.total, done.nota.formaPago), '_blank'),
    bg: "#25d366",
    style: {
      width: '100%',
      marginBottom: 12,
      fontSize: 15
    }
  }, "📲 Enviar ticket por WhatsApp"), React.createElement(BOut, {
    onClick: () => setDone(null),
    color: "var(--accent-text)",
    style: {
      width: '100%'
    }
  }, "+ Nuevo pedido"));
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
  }, "🧾 Crear Pedido"), React.createElement(Card, null, React.createElement("button", {
    onClick: () => setCliOpen(o => !o),
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--ink)',
      width: '100%',
      textAlign: 'left',
      cursor: 'pointer',
      padding: 0
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "👤 Cliente ", cliMode === 'nuevo' && nuevoC.nombre || cliSel ? '✅' : ''), cliOpen ? React.createElement(CUp, null) : React.createElement(CDown, null)), !cliOpen && cliSel && React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--accent-text)',
      marginTop: 2
    }
  }, cliSel.nombre, " · ", cliSel.telefono), !cliOpen && cliMode === 'nuevo' && nuevoC.nombre && React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--accent-text)',
      marginTop: 2
    }
  }, nuevoC.nombre)), cliOpen && React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, React.createElement(Row, {
    style: {
      gap: 6,
      marginBottom: 10
    }
  }, [['buscar', 'Existente'], ['nuevo', 'Nuevo']].map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => setCliMode(v),
    style: {
      flex: 1,
      padding: '7px',
      borderRadius: 8,
      border: 'none',
      background: cliMode === v ? 'var(--accent)' : 'var(--surface-2)',
      color: cliMode === v ? 'var(--ink)' : 'var(--ink-soft)',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), cliMode === 'buscar' ? React.createElement(React.Fragment, null, React.createElement(Inp, {
    placeholder: "Buscar cliente…",
    value: cliSearch,
    onChange: e => setCliSearch(e.target.value),
    style: {
      marginBottom: 8
    }
  }), React.createElement("div", {
    style: {
      maxHeight: 170,
      overflowY: 'auto'
    }
  }, cliFilt.map(c => React.createElement("div", {
    key: c.id,
    onClick: () => {
      setCliSel(c);
      setCliOpen(false);
    },
    style: {
      padding: '9px 10px',
      borderRadius: 8,
      cursor: 'pointer',
      background: cliSel?.id === c.id ? 'var(--info-bg)' : 'transparent',
      marginBottom: 3
    }
  }, React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 13
    }
  }, c.nombre), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-soft)'
    }
  }, "📱 ", c.telefono))))) : React.createElement(React.Fragment, null, React.createElement(Inp, {
    placeholder: "Nombre *",
    value: nuevoC.nombre,
    onChange: e => setNuevoC(x => ({
      ...x,
      nombre: e.target.value
    })),
    style: {
      marginBottom: 8
    }
  }), React.createElement(Inp, {
    placeholder: "Teléfono",
    type: "tel",
    value: nuevoC.telefono,
    onChange: e => setNuevoC(x => ({
      ...x,
      telefono: e.target.value
    }))
  })))), React.createElement(Card, null, React.createElement("button", {
    onClick: () => setProdOpen(o => !o),
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--ink)',
      width: '100%',
      textAlign: 'left',
      cursor: 'pointer',
      padding: 0
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "📦 Productos ", cartValido.length ? `(${cartValido.reduce((s, x) => s + x.cant, 0)} artículos)` : ''), prodOpen ? React.createElement(CUp, null) : React.createElement(CDown, null))), prodOpen && React.createElement("div", {
    style: {
      marginTop: 12,
      maxHeight: 220,
      overflowY: 'auto'
    }
  }, productos.map(p => React.createElement(Row, {
    key: p.id,
    style: {
      justifyContent: 'space-between',
      padding: '9px 0',
      borderBottom: '1px solid var(--line)'
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, p.nombre), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--accent-text)'
    }
  }, fmt(p.precio), " / ", p.unidad)), React.createElement(BFill, {
    onClick: () => addCart(p),
    style: {
      padding: '5px 12px',
      fontSize: 12
    }
  }, "+ Agregar"))))), cart.length > 0 && React.createElement(Card, null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 10
    }
  }, "RESUMEN DEL PEDIDO"), cart.map(item => React.createElement(Row, {
    key: item.id,
    style: {
      justifyContent: 'space-between',
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, item.nombre), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)'
    }
  }, fmt(item.precio), " c/u")), React.createElement("input", {
    type: "number",
    min: "0",
    value: item.cant === '' || item.cant === undefined ? '' : item.cant,
    onChange: e => updQty(item.id, e.target.value),
    placeholder: "0",
    style: {
      width: 64,
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 14,
      background: 'var(--surface-2)',
      border: '1px solid var(--line-strong)',
      borderRadius: 6,
      color: 'var(--ink)',
      padding: '6px 2px',
      flexShrink: 0
    }
  }), React.createElement("div", {
    style: {
      minWidth: 62,
      textAlign: 'right',
      fontWeight: 700,
      color: 'var(--accent-text)',
      fontSize: 13
    }
  }, fmt(item.precio * (Number(item.cant) || 0))))), React.createElement("div", {
    style: {
      borderTop: '1px solid var(--line)',
      paddingTop: 10,
      marginTop: 4,
      marginBottom: 12
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 15
    }
  }, "Total"), React.createElement("span", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      color: 'var(--accent-text)'
    }
  }, fmt(total)))), React.createElement(Row, {
    style: {
      gap: 8,
      marginBottom: 12
    }
  }, [['efectivo', '💵 Efectivo', 'var(--ok-bg)', 'var(--ok-text)'], ['transferencia', '🏦 Transferencia', 'var(--info-bg)', 'var(--info-text)'], ['credito', '📋 Crédito', 'var(--warn-bg)', 'var(--warn-text)']].map(([v, l, bg, col]) => React.createElement("button", {
    key: v,
    onClick: () => setPago(v),
    style: {
      flex: 1,
      padding: '9px 2px',
      borderRadius: 8,
      border: 'none',
      background: pago === v ? bg : 'var(--surface-2)',
      color: pago === v ? col : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), React.createElement(Row, {
    style: {
      gap: 8
    }
  }, React.createElement(BFill, {
    onClick: guardar,
    bg: canSave && !saving ? 'var(--accent)' : 'var(--line-strong)',
    color: canSave && !saving ? 'var(--ink)' : 'var(--ink-faint)',
    style: {
      flex: 1
    },
    disabled: !canSave || saving
  }, saving ? 'Guardando…' : '💾 Guardar pedido'), cliente?.telefono && React.createElement(BFill, {
    onClick: () => window.open(makeWA(cliente, cart, total, pago), '_blank'),
    bg: "#25d366",
    style: {
      padding: '8px 16px',
      fontSize: 18
    }
  }, "📲"))));
}