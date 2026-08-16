function VentaAlmacen({
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
        nombre: 'Público general',
        telefono: ''
      });
      setCliOpen(false);
      setProdOpen(true);
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
    const text = `🧾 *VENTA DIRECTA DEL ADMINISTRADOR*\n👤 ${cl.nombre}\n\n${lines}\n\n💰 *Total: ${fmt(tot)}*\nPago: ${fp}`;
    let telefono = (cl.telefono || '').replace(/\D/g, '');
    if (!telefono.startsWith('52') && telefono.length <= 10) telefono = '52' + telefono;
    return `https://wa.me/${telefono}?text=${encodeURIComponent(text)}`;
  };
  const guardar = async () => {
    if (!canSave) return;
    if (currentUser.role !== 'admin') {
      alert('Solo administración puede registrar una venta directa desde almacén.');
      return;
    }
    setSaving(true);
    try {
      const fecha = new Date().toISOString();
      const esPublicoGeneral = cliMode === 'nuevo' && String(nuevoC.nombre || '').trim().toLowerCase() === 'público general';
      const clienteRef = cliMode === 'nuevo' ? (esPublicoGeneral ? db.collection('clientes').doc('publico_general') : db.collection('clientes').doc()) : db.collection('clientes').doc(cliSel.id);
      const cl = cliMode === 'nuevo' ? {
        id: clienteRef.id,
        nombre: nuevoC.nombre.trim(),
        telefono: nuevoC.telefono || ''
      } : cliSel;
      if (esPublicoGeneral && pago === 'credito') throw new Error('Público general solo puede registrarse con pago de contado o transferencia');
      const notaRef = db.collection('notas').doc();
      const creditoRef = pago === 'credito' ? db.collection('creditos').doc() : null;
      const nota = {
        fecha,
        clienteId: cl.id,
        clienteNombre: cl.nombre,
        clienteTelefono: cl.telefono || '',
        items: cartValido.map(x => ({ ...x })),
        total,
        formaPago: pago,
        origen: 'almacen',
        tipoVenta: 'directa_administrador',
        medioOperacion: 'vehiculo_administrador',
        responsableTipo: 'administrador',
        capturadoPorUid: currentUser.uid,
        capturadoPorNombre: currentUser.nombre || ''
      };
      await db.runTransaction(async tx => {
        const existencias = await Promise.all(cartValido.map(item => tx.get(db.collection('productos').doc(item.id))));
        existencias.forEach((snap, index) => {
          const item = cartValido[index];
          const disponible = snap.exists ? Number(snap.data().stock || 0) : 0;
          if (disponible < item.cant) {
            throw new Error('Stock insuficiente para ' + item.nombre + ' (disponible: ' + disponible + ', solicitado: ' + item.cant + ')');
          }
        });
        if (cliMode === 'nuevo') {
          const clienteExistente = await tx.get(clienteRef);
          if (!clienteExistente.exists) tx.set(clienteRef, {
            nombre: cl.nombre,
            telefono: cl.telefono,
            domicilio: '',
            activo: true,
            esPublicoGeneral,
            creadoPorUid: currentUser.uid
          });
        }
        tx.set(notaRef, nota);
        if (creditoRef) {
          tx.set(creditoRef, {
            notaId: notaRef.id,
            clienteId: cl.id,
            clienteNombre: cl.nombre,
            fecha,
            total,
            saldo: total,
            abonos: [],
            capturadoPorUid: currentUser.uid
          });
        }
        cartValido.forEach(item => {
          tx.update(db.collection('productos').doc(item.id), {
            stock: firebase.firestore.FieldValue.increment(-item.cant)
          });
        });
      });
      setDone({ nota: { ...nota, id: notaRef.id }, cl });
      setCart([]);
      setCliSel(null);
      setNuevoC({ nombre: '', telefono: '' });
      setCliMode('buscar');
    } catch (e) {
      alert('Error al guardar la venta rápida de almacén: ' + e.message);
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
  }, "Venta directa del administrador registrada"), React.createElement("div", {
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
  }, "+ Nueva venta directa desde vehículo"));
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
  }, "⚡ Venta directa del administrador"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)',
      lineHeight: 1.45,
      marginBottom: 12
    }
  }, "La mercancía se descuenta directamente del almacén. Si la llevas en tu vehículo, no se crea una transferencia ni se asigna a un repartidor."), React.createElement(Card, null, React.createElement("button", {
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
  }, "RESUMEN DE LA VENTA DIRECTA"), cart.map(item => React.createElement(Row, {
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


function Pedidos({ productos, clientes, pedidos, currentUser }) {
  const [cliMode, setCliMode] = useState('buscar');
  const [cliSearch, setCliSearch] = useState('');
  const [cliSel, setCliSel] = useState(null);
  const [nuevoC, setNuevoC] = useState({ nombre: '', telefono: '' });
  const [cart, setCart] = useState([]);
  const [pagoPrevisto, setPagoPrevisto] = useState('efectivo');
  const [repartidores, setRepartidores] = useState([]);
  const [repartidorId, setRepartidorId] = useState('');
  const [filtro, setFiltro] = useState('abiertos');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [asignando, setAsignando] = useState(null);
  const flash = texto => { setMsg(texto); setTimeout(() => setMsg(''), 3000); };
  const puedeAsignar = currentUser.role === 'admin';
  const puedeCrearTransferenciaPropia = currentUser.role === 'repartidor';
  useEffect(() => {
    if (!puedeAsignar) { setRepartidores([]); return; }
    const unsub = db.collection('usuarios').onSnapshot(snap => setRepartidores(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role === 'repartidor')), () => {});
    return unsub;
  }, [puedeAsignar]);
  const cliFilt = clientes.filter(c => c.activo && c.nombre.toLowerCase().includes(cliSearch.toLowerCase()) && !c.esPublicoGeneral);
  const addCart = p => setCart(actual => {
    const existe = actual.find(x => x.id === p.id);
    return existe ? actual.map(x => x.id === p.id ? { ...x, cant: Number(x.cant || 0) + 1 } : x) : [...actual, { id: p.id, nombre: p.nombre, precio: Number(p.precio || 0), unidad: p.unidad || '', cant: 1 }];
  });
  const updQty = (id, cant) => setCart(actual => Number(cant || 0) < 1 ? actual.filter(x => x.id !== id) : actual.map(x => x.id === id ? { ...x, cant: Number(cant) } : x));
  const items = cart.filter(x => Number(x.cant) > 0).map(x => ({ ...x, cant: Number(x.cant) }));
  const total = items.reduce((sum, x) => sum + Number(x.precio || 0) * x.cant, 0);
  const cliente = cliMode === 'nuevo' ? nuevoC : cliSel;
  const crearPedido = async estado => {
    if (!cliente?.nombre?.trim() || !items.length) { flash('⚠️ Selecciona un cliente y al menos un producto'); return; }
    if (estado === 'asignado_pendiente_transferencia' && !repartidorId && !puedeCrearTransferenciaPropia) { flash('⚠️ Elige al repartidor responsable antes de asignar'); return; }
    setSaving(true);
    try {
      const fecha = new Date().toISOString();
      const repartidor = puedeCrearTransferenciaPropia
        ? { id: currentUser.uid, nombre: currentUser.nombre || '' }
        : repartidores.find(r => r.id === repartidorId);
      const clienteRef = cliMode === 'nuevo' ? db.collection('clientes').doc() : db.collection('clientes').doc(cliSel.id);
      const pedidoRef = db.collection('pedidos').doc();
      const cl = cliMode === 'nuevo' ? { id: clienteRef.id, nombre: nuevoC.nombre.trim(), telefono: nuevoC.telefono || '' } : cliSel;
      await db.runTransaction(async tx => {
        if (cliMode === 'nuevo') tx.set(clienteRef, { nombre: cl.nombre, telefono: cl.telefono, domicilio: '', activo: true, creadoPorUid: currentUser.uid, creadoEn: fecha });
        tx.set(pedidoRef, {
          fechaCreacion: fecha,
          fechaActualizacion: fecha,
          clienteId: cl.id,
          clienteNombre: cl.nombre,
          clienteTelefono: cl.telefono || '',
          clienteLocalidad: cl.localidad || '',
          items,
          total,
          formaPagoPrevista: pagoPrevisto,
          estado,
          repartidorId: repartidor?.id || '',
          repartidorNombre: repartidor?.nombre || '',
          fechaAsignacion: repartidor ? fecha : '',
          creadoPorUid: currentUser.uid,
          creadoPorNombre: currentUser.nombre || ''
        });
      });
      flash(estado === 'borrador' ? '✅ Borrador guardado sin mover inventario' : '✅ Pedido asignado; queda pendiente de confirmar transferencia');
      setCart([]); setCliSel(null); setNuevoC({ nombre: '', telefono: '' }); setCliMode('buscar'); setRepartidorId('');
    } catch (e) { flash('❌ No se pudo guardar el pedido: ' + e.message); }
    setSaving(false);
  };
  const confirmarAsignacion = async () => {
    if (!asignando?.pedido || !asignando.repartidorId) return;
    const repartidor = repartidores.find(r => r.id === asignando.repartidorId);
    if (!repartidor) return;
    setSaving(true);
    try {
      await db.collection('pedidos').doc(asignando.pedido.id).update({
        estado: 'asignado_pendiente_transferencia', repartidorId: repartidor.id, repartidorNombre: repartidor.nombre || '',
        fechaAsignacion: new Date().toISOString(), fechaActualizacion: new Date().toISOString(), asignadoPorUid: currentUser.uid
      });
      setAsignando(null); flash('✅ Pedido asignado; no hay salida de producto hasta confirmar la transferencia');
    } catch (e) { flash('❌ No se pudo asignar el pedido: ' + e.message); }
    setSaving(false);
  };
  const etiquetaEstado = estado => ({ borrador: 'Borrador', asignado_pendiente_transferencia: 'Pendiente de transferencia', transferencia_confirmada: 'En transferencia', entregado: 'Entregado', cancelado: 'Cancelado' }[estado] || estado);
  const abiertos = pedidos.filter(p => filtro === 'todos' ? true : filtro === 'abiertos' ? !['entregado', 'cancelado'].includes(p.estado) : p.estado === filtro);
  const inputStyle = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 6, padding: '8px 10px', color: 'var(--ink)', fontSize: 13 };
  return React.createElement('div', { style: { padding: '16px 12px' } },
    React.createElement('div', { style: { fontSize: 20, fontWeight: 800, marginBottom: 4 } }, '📋 Pedidos'),
    React.createElement('div', { style: { fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12, lineHeight: 1.4 } }, 'Un pedido no descuenta inventario ni genera crédito. Se carga al repartidor únicamente al confirmar la transferencia.'),
    msg && React.createElement('div', { style: { background: 'var(--ok-bg)', color: 'var(--ok-text)', padding: '8px 10px', borderRadius: 6, fontSize: 12, marginBottom: 12 } }, msg),
    React.createElement(Card, null,
      React.createElement('div', { style: { fontWeight: 700, marginBottom: 10 } }, '➕ Nuevo pedido'),
      React.createElement(Lbl, null, 'Cliente'),
      React.createElement(Row, { style: { gap: 6, marginBottom: 8 } }, [['buscar', 'Existente'], ['nuevo', 'Nuevo']].map(([valor, etiqueta]) => React.createElement('button', { key: valor, onClick: () => setCliMode(valor), style: { flex: 1, padding: 7, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12, background: cliMode === valor ? 'var(--accent)' : 'var(--surface-2)', color: cliMode === valor ? 'var(--ink)' : 'var(--ink-soft)' } }, etiqueta))),
      cliMode === 'buscar' ? React.createElement(React.Fragment, null,
        React.createElement(Inp, { placeholder: 'Buscar cliente…', value: cliSearch, onChange: e => setCliSearch(e.target.value), style: { marginBottom: 6 } }),
        React.createElement('div', { style: { maxHeight: 130, overflowY: 'auto', marginBottom: 10 } }, cliFilt.map(c => React.createElement('div', { key: c.id, onClick: () => setCliSel(c), style: { padding: '8px 9px', cursor: 'pointer', borderRadius: 6, background: cliSel?.id === c.id ? 'var(--info-bg)' : 'transparent' } }, React.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, c.nombre), React.createElement('div', { style: { fontSize: 11, color: 'var(--ink-faint)' } }, (c.localidad ? c.localidad + ' · ' : '') + (c.telefono || 'Sin teléfono')))))
      ) : React.createElement(React.Fragment, null,
        React.createElement(Inp, { placeholder: 'Nombre *', value: nuevoC.nombre, onChange: e => setNuevoC(x => ({ ...x, nombre: e.target.value })), style: { marginBottom: 8 } }),
        React.createElement(Inp, { placeholder: 'Teléfono', type: 'tel', value: nuevoC.telefono, onChange: e => setNuevoC(x => ({ ...x, telefono: e.target.value })), style: { marginBottom: 10 } })
      ),
      cliente?.nombre && React.createElement('div', { style: { color: 'var(--accent-text)', fontSize: 12, fontWeight: 700, marginBottom: 10 } }, 'Cliente: ' + cliente.nombre),
      React.createElement(Lbl, null, 'Productos solicitados'),
      React.createElement('div', { style: { maxHeight: 180, overflowY: 'auto', marginBottom: 8 } }, productos.map(p => React.createElement(Row, { key: p.id, style: { justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' } }, React.createElement('div', null, React.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, p.nombre), React.createElement('div', { style: { fontSize: 11, color: 'var(--ink-faint)' } }, fmt(p.precio) + ' · Stock almacén: ' + Number(p.stock || 0))), React.createElement(BFill, { onClick: () => addCart(p), style: { padding: '5px 10px', fontSize: 11 } }, '+ Agregar')))),
      items.length > 0 && React.createElement('div', { style: { margin: '10px 0', borderTop: '1px solid var(--line)', paddingTop: 8 } }, items.map(item => React.createElement(Row, { key: item.id, style: { gap: 6, justifyContent: 'space-between', marginBottom: 7 } }, React.createElement('span', { style: { flex: 1, fontSize: 12, fontWeight: 600 } }, item.nombre), React.createElement('input', { type: 'number', min: 1, value: item.cant, onChange: e => updQty(item.id, e.target.value), style: { width: 48, textAlign: 'center', padding: 4, border: '1px solid var(--line-strong)', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--ink)' } }), React.createElement('span', { style: { minWidth: 60, textAlign: 'right', fontSize: 12 } }, fmt(item.precio * item.cant))), React.createElement(Row, { style: { justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 4 } }, React.createElement('strong', null, 'Total previsto'), React.createElement('strong', { style: { color: 'var(--accent-text)' } }, fmt(total)))),
      React.createElement(Lbl, null, 'Pago previsto'),
      React.createElement('select', { value: pagoPrevisto, onChange: e => setPagoPrevisto(e.target.value), style: Object.assign({}, inputStyle, { marginBottom: 10 }) }, React.createElement('option', { value: 'efectivo' }, 'Efectivo'), React.createElement('option', { value: 'transferencia' }, 'Transferencia'), React.createElement('option', { value: 'credito' }, 'Crédito')),
      puedeAsignar && React.createElement(React.Fragment, null, React.createElement(Lbl, null, 'Repartidor responsable'), React.createElement('select', { value: repartidorId, onChange: e => setRepartidorId(e.target.value), style: Object.assign({}, inputStyle, { marginBottom: 10 }) }, React.createElement('option', { value: '' }, 'Asignar después…'), repartidores.map(r => React.createElement('option', { key: r.id, value: r.id }, r.nombre)))),
      !puedeAsignar && !puedeCrearTransferenciaPropia && React.createElement('div', { style: { fontSize: 11, color: 'var(--ink-faint)', marginBottom: 10 } }, 'El pedido se guardará como borrador para que administración asigne al repartidor.'),
      puedeCrearTransferenciaPropia && React.createElement('div', { style: { fontSize: 11, color: 'var(--info-text)', marginBottom: 10 } }, 'El pedido quedará asignado a ti y podrás incluirlo en tu propia transferencia.'),
      React.createElement(Row, { style: { gap: 8 } }, React.createElement(BOut, { onClick: () => crearPedido(puedeCrearTransferenciaPropia ? 'asignado_pendiente_transferencia' : 'borrador'), disabled: saving, style: { flex: 1 } }, puedeCrearTransferenciaPropia ? 'Guardar para mi transferencia' : 'Guardar borrador'), puedeAsignar && React.createElement(BFill, { onClick: () => crearPedido('asignado_pendiente_transferencia'), disabled: saving, style: { flex: 1 } }, saving ? 'Guardando…' : 'Asignar pedido'))
    ),
    React.createElement(Card, null, React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 10 } }, React.createElement('div', { style: { fontWeight: 700 } }, 'Pedidos registrados'), React.createElement('select', { value: filtro, onChange: e => setFiltro(e.target.value), style: { fontSize: 11, padding: 5, background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line-strong)', borderRadius: 5 } }, React.createElement('option', { value: 'abiertos' }, 'Abiertos'), React.createElement('option', { value: 'asignado_pendiente_transferencia' }, 'Pend. transferencia'), React.createElement('option', { value: 'transferencia_confirmada' }, 'En transferencia'), React.createElement('option', { value: 'borrador' }, 'Borradores'), React.createElement('option', { value: 'todos' }, 'Todos'))), abiertos.length === 0 ? React.createElement('div', { style: { fontSize: 12, color: 'var(--ink-faint)' } }, 'No hay pedidos para este filtro.') : abiertos.map(p => React.createElement('div', { key: p.id, style: { padding: '10px 0', borderBottom: '1px solid var(--line)' } }, React.createElement(Row, { style: { justifyContent: 'space-between', gap: 8 } }, React.createElement('div', null, React.createElement('div', { style: { fontSize: 13, fontWeight: 700 } }, p.clienteNombre), React.createElement('div', { style: { fontSize: 11, color: 'var(--ink-faint)' } }, etiquetaEstado(p.estado) + (p.repartidorNombre ? ' · ' + p.repartidorNombre : ''))), React.createElement('strong', { style: { fontSize: 13, color: 'var(--accent-text)' } }, fmt(p.total || 0))), React.createElement('div', { style: { fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 } }, (p.items || []).map(x => x.nombre + ' ×' + x.cant).join(', ')), p.estado === 'borrador' && puedeAsignar && React.createElement(BFill, { onClick: () => setAsignando({ pedido: p, repartidorId: '' }), style: { marginTop: 8, padding: '6px 10px', fontSize: 11 } }, 'Asignar a repartidor')))),
    asignando && React.createElement(Modal, { title: 'Asignar pedido a repartidor', onClose: () => !saving && setAsignando(null) }, React.createElement('div', { style: { fontSize: 13, marginBottom: 10 } }, asignando.pedido.clienteNombre + ' · ' + fmt(asignando.pedido.total || 0)), React.createElement('select', { value: asignando.repartidorId, onChange: e => setAsignando(x => ({ ...x, repartidorId: e.target.value })), style: Object.assign({}, inputStyle, { marginBottom: 12 }) }, React.createElement('option', { value: '' }, 'Selecciona repartidor…'), repartidores.map(r => React.createElement('option', { key: r.id, value: r.id }, r.nombre))), React.createElement(BFill, { onClick: confirmarAsignacion, disabled: saving, style: { width: '100%' } }, saving ? 'Asignando…' : 'Confirmar asignación'))
  ));
}

function CrearNota({ productos, clientes, pedidos, currentUser, ventaRapida, onVentaRapidaConsumida }) {
  useEffect(() => { if (ventaRapida && onVentaRapidaConsumida) onVentaRapidaConsumida(); }, [ventaRapida]);
  return ventaRapida ? React.createElement(VentaAlmacen, { productos, clientes, currentUser, ventaRapida: true }) : React.createElement(Pedidos, { productos, clientes, pedidos, currentUser });
}
