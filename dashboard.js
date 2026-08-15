function StatTile({
  value,
  label,
  bg,
  color,
  onClick
}) {
  return React.createElement("div", {
    onClick: onClick,
    style: {
      background: bg,
      color,
      borderRadius: 6,
      padding: '16px 14px',
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 118,
      justifyContent: 'space-between'
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 800,
      fontFamily: 'var(--font-display)',
      lineHeight: 1
    }
  }, value), React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      marginTop: 6
    }
  }, label)), onClick && React.createElement(Row, {
    style: {
      gap: 4,
      fontSize: 11,
      fontWeight: 700,
      opacity: .85,
      marginTop: 8
    }
  }, React.createElement("span", null, "Ver más"), React.createElement("span", null, "→")));
}
function Dashboard({
  notas,
  productos,
  creditos,
  clientes,
  rutas,
  currentUser,
  notificacionesTransferencias = [],
  onIrA,
  onVentaRapida
}) {
  const isAdmin = currentUser.role === 'admin';
  const isRepartidor = currentUser.role === 'repartidor';
  const tabsPermitidos = permisoTabs(currentUser);
  const esEfectivo = fp => fp === 'efectivo' || fp === 'contado';
  const hoy = new Date().toDateString();
  const vhoy = notas.filter(n => new Date(n.fecha).toDateString() === hoy);
  const thoy = vhoy.reduce((s, n) => s + n.total, 0);
  const pend = creditos.filter(c => c.saldo > 0);
  const tcred = pend.reduce((s, c) => s + c.saldo, 0);
  const bajo = productos.filter(p => p.stock < 10);
  const avisosTransferencia = notificacionesTransferencias.slice(0, 4);
  const bmap = notas.reduce((m, n) => {
    m[n.clienteId] = m[n.clienteId] || {
      nombre: n.clienteNombre,
      total: 0,
      count: 0
    };
    m[n.clienteId].total += n.total;
    m[n.clienteId].count += 1;
    return m;
  }, {});
  const top = Object.values(bmap).sort((a, b) => b.total - a.total).slice(0, 5);
  const maxT = top[0]?.total || 1;
  const misNotasHoy = vhoy.filter(n => n.capturadoPorUid === currentUser.uid);
  const miVentaEfectivoHoy = misNotasHoy.filter(n => esEfectivo(n.formaPago)).reduce((s, n) => s + n.total, 0);
  const misClientesHoy = new Set(misNotasHoy.map(n => n.clienteId)).size;
  const rutaActiva = (rutas || []).find(r => r.estado === 'activa' && (!isRepartidor || r.repartidorId === currentUser.uid));
  const irA = id => () => {
    if (tabsPermitidos[id]) onIrA(id);
  };
  const acciones = (isRepartidor ? [{
    icon: '🧾',
    label: 'Venta rápida',
    detalle: rutaActiva ? 'Vender desde mi transferencia' : 'Revisar transferencia',
    onClick: irA('ruta')
  }, {
    icon: '🧭',
    label: 'Mi distribución',
    detalle: 'Revisar transferencias y clientes QR',
    onClick: irA('repartidores')
  }, {
    icon: '💰',
    label: 'Corte del día',
    detalle: 'Consultar ventas y efectivo',
    onClick: irA('gerencia')
  }] : [{
    icon: '🧾',
    label: 'Nuevo pedido',
    detalle: 'Solicitud sin descontar inventario',
    onClick: irA('nota'),
    tab: 'nota'
  }, {
    icon: '⚡',
    label: 'Venta rápida',
    detalle: 'Venta directa desde almacén, sin transferencia',
    onClick: onVentaRapida,
    tab: 'nota',
    soloAdmin: true
  }, {
    icon: '👥',
    label: 'Clientes y QR',
    detalle: 'Buscar, crear o mostrar QR',
    onClick: irA('clientes'),
    tab: 'clientes'
  }, {
    icon: '💳',
    label: 'Cobrar crédito',
    detalle: 'Consultar saldo y registrar abono',
    onClick: irA('creditos'),
    tab: 'creditos'
  }, {
    icon: '📦',
    label: 'Transferencias',
    detalle: 'Cargar, conciliar o recibir',
    onClick: irA('ruta'),
    tab: 'ruta',
    soloAdmin: true
  }, {
    icon: '📋',
    label: 'Revisar inventario',
    detalle: 'Consultar existencias y alertas',
    onClick: irA('inventario'),
    tab: 'inventario'
  }]).filter(a => (a.soloAdmin ? isAdmin : true) && (!a.tab || tabsPermitidos[a.tab]));
  const tituloAcciones = isRepartidor ? 'Herramientas de campo' : 'Acciones rápidas';
  const ayudaAcciones = isRepartidor ? 'Accesos para vender desde tu transferencia, identificar clientes y consultar tu corte.' : 'Accesos directos para las tareas operativas más frecuentes.';
  return React.createElement("div", {
    style: {
      padding: '16px 12px'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      marginBottom: 14
    }
  }, "📊 Inicio"), avisosTransferencia.length > 0 && React.createElement(Card, {
    style: {
      marginBottom: 14,
      border: '1px solid var(--warn)66'
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: 'var(--warn-text)'
    }
  }, '🔔 Transferencias pendientes'), React.createElement("button", {
    onClick: () => onIrA('ruta'),
    style: {
      border: 'none',
      background: 'none',
      color: 'var(--accent)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, 'Ver módulo →')), avisosTransferencia.map(aviso => React.createElement("button", {
    key: aviso.id,
    onClick: () => onIrA('ruta'),
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      borderTop: '1px solid var(--line)',
      background: 'transparent',
      padding: '8px 0 0',
      marginTop: 8,
      cursor: 'pointer'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, aviso.titulo), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginTop: 2
    }
  }, aviso.detalle)))), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      marginBottom: 14
    }
  }, isRepartidor ? React.createElement(React.Fragment, null, React.createElement(StatTile, {
    value: misNotasHoy.length,
    label: "Ventas de transferencia hoy",
    bg: "var(--rail)",
    color: "var(--rail-ink)",
    onClick: irA('ruta')
  }), React.createElement(StatTile, {
    value: fmt(miVentaEfectivoHoy),
    label: "Venta efectivo hoy",
    bg: "var(--accent)",
    color: "var(--accent-ink)",
    onClick: irA('gerencia')
  }), React.createElement(StatTile, {
    value: misClientesHoy,
    label: "Clientes atendidos hoy",
    bg: "var(--info)",
    color: "#fff",
    onClick: irA('ruta')
  }), React.createElement(StatTile, {
    value: rutaActiva ? 'Activa' : 'Sin transferencia',
    label: "Estado de tu transferencia",
    bg: rutaActiva ? 'var(--ok)' : 'var(--warn)',
    color: "#fff",
    onClick: irA('ruta')
  })) : React.createElement(React.Fragment, null, React.createElement(StatTile, {
    value: vhoy.length,
    label: "Ventas de hoy",
    bg: "var(--rail)",
    color: "var(--rail-ink)",
    onClick: irA('nota')
  }), React.createElement(StatTile, {
    value: fmt(thoy),
    label: "Ingresos de hoy",
    bg: "var(--accent)",
    color: "var(--accent-ink)",
    onClick: irA('gerencia')
  }), React.createElement(StatTile, {
    value: clientes.filter(c => c.activo).length,
    label: "Clientes registrados",
    bg: "var(--info)",
    color: "#fff",
    onClick: irA('clientes')
  }), React.createElement(StatTile, {
    value: fmt(tcred),
    label: "Créditos pendientes",
    bg: "var(--warn)",
    color: "#fff",
    onClick: irA('creditos')
  }))), acciones.length > 0 && React.createElement(Card, null, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 4,
      fontFamily: 'var(--font-display)',
      textTransform: 'uppercase',
      letterSpacing: '.02em'
    }
  }, tituloAcciones), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 12,
      lineHeight: 1.35
    }
  }, ayudaAcciones), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10
    }
  }, acciones.map(a => React.createElement("button", {
    key: a.label,
    onClick: a.onClick,
    style: {
      background: 'var(--surface-2)',
      border: '1px solid var(--line)',
      borderRadius: 6,
      padding: '12px 9px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      cursor: 'pointer',
      minHeight: 104
    }
  }, React.createElement("span", {
    style: {
      fontSize: 22
    }
  }, a.icon), React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      textAlign: 'center',
      color: 'var(--ink)'
    }
  }, a.label), React.createElement("span", {
    style: {
      fontSize: 10,
      lineHeight: 1.25,
      textAlign: 'center',
      color: 'var(--ink-faint)'
    }
  }, a.detalle))))), !isRepartidor && React.createElement(React.Fragment, null, top.length > 0 && React.createElement(Card, null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 10
    }
  }, "🏆 CLIENTES QUE MÁS COMPRAN"), top.map((b, i) => React.createElement("div", {
    key: i,
    style: {
      marginBottom: 10
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      marginBottom: 3
    }
  }, React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, b.nombre), React.createElement(Row, {
    style: {
      gap: 6
    }
  }, React.createElement(Tag, {
    color: "var(--ink-faint)"
  }, b.count, " ped."), React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--accent-text)'
    }
  }, fmt(b.total)))), React.createElement("div", {
    style: {
      background: 'var(--surface-2)',
      borderRadius: 10,
      height: 5
    }
  }, React.createElement("div", {
    style: {
      background: 'linear-gradient(90deg,var(--accent),var(--warn))',
      borderRadius: 10,
      height: 5,
      width: `${(b.total / maxT * 100).toFixed(0)}%`
    }
  }))))), bajo.length > 0 && React.createElement(Card, {
    style: {
      borderLeft: '3px solid var(--danger-text)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--danger-text)',
      fontWeight: 700,
      marginBottom: 6
    }
  }, "⚠️ Stock bajo"), bajo.map(p => React.createElement(Row, {
    key: p.id,
    style: {
      justifyContent: 'space-between',
      marginBottom: 4
    }
  }, React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, p.nombre), React.createElement(Tag, {
    color: "var(--danger-text)"
  }, p.stock, " ", p.unidad)))), vhoy.length > 0 && React.createElement(Card, null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 8
    }
  }, "VENTAS DE HOY"), vhoy.map(n => React.createElement(Row, {
    key: n.id,
    style: {
      justifyContent: 'space-between',
      paddingBottom: 8,
      borderBottom: '1px solid var(--line)',
      marginBottom: 4
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, n.clienteNombre), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)'
    }
  }, n.items.length, " prod. · ", n.formaPago)), React.createElement("span", {
    style: {
      fontWeight: 700,
      color: 'var(--accent-text)'
    }
  }, fmt(n.total)))))));
}
