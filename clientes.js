let clientesQRLoading = false;
const textoQRCliente = clienteId => 'PDLC-CLIENTE:' + clienteId;
function asegurarLibreriaQRClientes(callback) {
  if (window.QRCode) {
    callback(true);
    return;
  }
  if (clientesQRLoading) {
    const espera = setInterval(() => {
      if (window.QRCode) {
        clearInterval(espera);
        callback(true);
      }
    }, 150);
    setTimeout(() => {
      clearInterval(espera);
      if (!window.QRCode) callback(false);
    }, 8000);
    return;
  }
  clientesQRLoading = true;
  const previo = document.getElementById('clientes-qrcode-lib');
  if (previo) {
    previo.addEventListener('load', () => callback(!!window.QRCode), { once: true });
    previo.addEventListener('error', () => callback(false), { once: true });
    return;
  }
  const script = document.createElement('script');
  script.id = 'clientes-qrcode-lib';
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  script.onload = () => {
    clientesQRLoading = false;
    callback(!!window.QRCode);
  };
  script.onerror = () => {
    clientesQRLoading = false;
    callback(false);
  };
  document.body.appendChild(script);
}
function generarImagenQRCliente(texto, tamanio, callback) {
  asegurarLibreriaQRClientes(lista => {
    if (!lista) {
      callback(null);
      return;
    }
    const contenedor = document.createElement('div');
    contenedor.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(contenedor);
    try {
      new window.QRCode(contenedor, {
        text: texto,
        width: tamanio,
        height: tamanio,
        correctLevel: window.QRCode.CorrectLevel.M
      });
      setTimeout(() => {
        const canvas = contenedor.querySelector('canvas');
        const imagen = contenedor.querySelector('img');
        const url = canvas ? canvas.toDataURL('image/png') : imagen ? imagen.src : null;
        document.body.removeChild(contenedor);
        callback(url);
      }, 150);
    } catch (e) {
      document.body.removeChild(contenedor);
      callback(null);
    }
  });
}
const cacheMiniaturasQRClientes = new Map();
function MiniaturaQRCliente({
  cliente,
  onClick
}) {
  const [url, setUrl] = useState(() => cacheMiniaturasQRClientes.get(cliente.id) || null);
  useEffect(() => {
    const guardada = cacheMiniaturasQRClientes.get(cliente.id);
    if (guardada) {
      setUrl(guardada);
      return undefined;
    }
    let vigente = true;
    generarImagenQRCliente(textoQRCliente(cliente.id), 56, resultado => {
      if (!vigente || !resultado) return;
      cacheMiniaturasQRClientes.set(cliente.id, resultado);
      setUrl(resultado);
    });
    return () => {
      vigente = false;
    };
  }, [cliente.id]);
  return React.createElement("button", {
    type: "button",
    onMouseDown: e => e.stopPropagation(),
    onTouchStart: e => e.stopPropagation(),
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    title: 'Ver QR de ' + cliente.nombre,
    'aria-label': 'Ver QR de ' + cliente.nombre,
    style: {
      width: 62,
      minWidth: 62,
      height: 62,
      padding: 3,
      background: '#fff',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }
  }, url ? React.createElement("img", {
    src: url,
    alt: 'QR de ' + cliente.nombre,
    style: {
      width: 54,
      height: 54,
      objectFit: 'contain',
      display: 'block'
    }
  }) : React.createElement("span", {
    style: {
      fontSize: 20,
      color: 'var(--ink-faint)',
      lineHeight: 1
    }
  }, '▦'));
}
function Clientes({
  clientes,
  notas,
  creditos,
  currentUser
}) {
  const puedeEditar = currentUser?.role === 'admin' || permisoEdita(currentUser).clientes;
  const [filtro, setFiltro] = useState('activos');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [histId, setHistId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const [qrFor, setQrFor] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [detallesFor, setDetallesFor] = useState(null);
  const cmap = creditos.reduce((m, c) => {
    if (c.saldo > 0) m[c.clienteId] = (m[c.clienteId] || 0) + c.saldo;
    return m;
  }, {});
  const list = clientes.filter(c => filtro === 'activos' ? c.activo : filtro === 'inactivos' ? !c.activo : !!cmap[c.id]).filter(c => c.nombre.toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    if (!form.nombre) return;
    const item = {
      nombre: form.nombre,
      telefono: form.telefono || '',
      domicilio: form.domicilio || '',
      activo: form.activo !== undefined ? form.activo : true,
      ubicacion: form.ubicacion || null
    };
    if (form.id) await db.collection('clientes').doc(form.id).update(item);else await db.collection('clientes').add({
      ...item,
      fechaAlta: new Date().toISOString()
    });
    setForm(null);
  };
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
  const onCardTap = id => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (expandedId === id) setExpandedId(null);
  };
  const verQR = c => {
    setQrFor(c);
    setQrUrl(null);
    setExpandedId(null);
    generarImagenQRCliente(textoQRCliente(c.id), 220, url => setQrUrl(url));
  };
  const descargarQR = () => {
    if (!qrFor || !qrUrl) return;
    const enlace = document.createElement('a');
    enlace.href = qrUrl;
    enlace.download = 'qr-cliente-' + (qrFor.nombre || qrFor.id).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') + '.png';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  };
  const copiarQR = async () => {
    if (!qrFor) return;
    const texto = textoQRCliente(qrFor.id);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(texto);else {
        const input = document.createElement('textarea');
        input.value = texto;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      alert('Código QR copiado.');
    } catch (e) {
      alert('No se pudo copiar el código.');
    }
  };
  const [capturando, setCapturando] = useState(false);
  const capturarUbicacion = () => {
    if (!navigator.geolocation) {
      alert('Este dispositivo no soporta ubicación.');
      return;
    }
    setCapturando(true);
    navigator.geolocation.getCurrentPosition(p => {
      setForm(f => ({
        ...f,
        ubicacion: {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          fecha: new Date().toISOString()
        }
      }));
      setCapturando(false);
    }, () => {
      alert('No se pudo obtener la ubicación. Revisa los permisos del navegador.');
      setCapturando(false);
    }, {
      enableHighAccuracy: true,
      timeout: 8000
    });
  };
  return React.createElement("div", {
    style: {
      padding: '16px 12px'
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800
    }
  }, "👥 Clientes"), puedeEditar && React.createElement(BFill, {
    onClick: () => setForm({
      nombre: '',
      telefono: '',
      domicilio: ''
    })
  }, "+ Nuevo")), React.createElement(Inp, {
    placeholder: "🔍 Buscar…",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      marginBottom: 10
    }
  }), React.createElement(Row, {
    style: {
      gap: 6,
      marginBottom: 12
    }
  }, [['activos', 'Activos'], ['credito', 'Crédito'], ['inactivos', 'Inactivos']].map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => setFiltro(v),
    style: {
      flex: 1,
      padding: '7px 2px',
      borderRadius: 8,
      border: 'none',
      background: filtro === v ? 'var(--accent)' : 'var(--surface-2)',
      color: filtro === v ? 'var(--ink)' : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 10
    }
  }, "Toca la miniatura QR para abrirla. Mantén presionado un cliente para editar, ver su historial o más detalles."), list.map(c => {
    const expanded = expandedId === c.id;
    return React.createElement(Card, {
      key: c.id,
      style: {
        opacity: c.activo ? 1 : 0.65,
        padding: 0,
        overflow: 'hidden'
      }
    }, React.createElement("div", {
      onMouseDown: () => startPress(c.id),
      onMouseUp: cancelPress,
      onMouseLeave: cancelPress,
      onTouchStart: () => startPress(c.id),
      onTouchEnd: cancelPress,
      onTouchMove: cancelPress,
      onClick: () => onCardTap(c.id),
      style: {
        padding: '12px 14px',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent'
      }
    }, React.createElement(Row, {
      style: {
        alignItems: 'flex-start',
        gap: 10
      }
    }, React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, React.createElement(Row, {
      style: {
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 4
      }
    }, React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 14
      }
    }, c.nombre), !c.activo && React.createElement(Tag, {
      color: "var(--ink-soft)"
    }, "Inactivo"), cmap[c.id] && React.createElement(Tag, {
      color: "var(--warn-text)"
    }, "💳 ", fmt(cmap[c.id])), c.ubicacion ? React.createElement(Tag, {
      color: "var(--ok-text)"
    }, "📍 Domicilio existente") : React.createElement(Tag, {
      color: "var(--ink-faint)"
    }, "📍 Domicilio no capturado")), React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-soft)',
        marginTop: 3
      }
    }, "📱 ", c.telefono || '—'), React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-soft)',
        marginTop: 2,
        lineHeight: 1.3
      }
    }, "📍 ", c.domicilio || '—')), React.createElement(MiniaturaQRCliente, {
      cliente: c,
      onClick: () => verQR(c)
    }))), React.createElement("div", {
      style: {
        maxHeight: expanded ? 190 : 0,
        overflow: 'hidden',
        transition: 'max-height .2s ease'
      }
    }, React.createElement("div", {
      style: {
        padding: '0 14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }
    }, React.createElement(Row, {
      style: {
        gap: 6
      }
    }, puedeEditar && React.createElement(BOut, {
      onClick: () => {
        setForm({
          ...c
        });
        setExpandedId(null);
      },
      style: {
        flex: 1
      }
    }, "✏️ Editar"), puedeEditar && React.createElement(BOut, {
      onClick: () => {
        db.collection('clientes').doc(c.id).update({
          activo: !c.activo
        });
        setExpandedId(null);
      },
      color: c.activo ? 'var(--danger-text)' : 'var(--ok-text)',
      style: {
        flex: 1
      }
    }, c.activo ? '🚫 Desactivar' : '✅ Activar')), React.createElement(Row, {
      style: {
        gap: 6
      }
    }, React.createElement(BOut, {
      onClick: () => {
        setHistId(histId === c.id ? null : c.id);
        setExpandedId(null);
      },
      style: {
        flex: 1
      }
    }, "📋 Historial"), React.createElement(BOut, {
      onClick: () => verQR(c),
      style: {
        flex: 1
      }
    }, "🔳 Ver QR"), React.createElement(BOut, {
      onClick: () => {
        setDetallesFor(c);
        setExpandedId(null);
      },
      style: {
        flex: 1
      }
    }, "ℹ️ Detalles")))), histId === c.id && React.createElement("div", {
      style: {
        padding: '0 14px 14px'
      }
    }, React.createElement("div", {
      style: {
        borderTop: '1px solid var(--line)',
        paddingTop: 8
      }
    }, React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--ink-faint)',
        fontWeight: 700,
        marginBottom: 6
      }
    }, "HISTORIAL DE PEDIDOS"), notas.filter(n => n.clienteId === c.id).length === 0 ? React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-faint)'
      }
    }, "Sin pedidos aún") : notas.filter(n => n.clienteId === c.id).map(n => React.createElement(Row, {
      key: n.id,
      style: {
        justifyContent: 'space-between',
        fontSize: 12,
        paddingBottom: 5,
        borderBottom: '1px solid var(--line)',
        marginBottom: 4,
        flexWrap: 'wrap',
        gap: 4
      }
    }, React.createElement("span", {
      style: {
        color: 'var(--ink-faint)'
      }
    }, fDate(n.fecha)), React.createElement("span", {
      style: {
        flex: 1,
        paddingLeft: 4
      }
    }, n.items.length, " prod."), React.createElement("span", {
      style: {
        color: 'var(--accent-text)',
        fontWeight: 700
      }
    }, fmt(n.total)), React.createElement(Tag, {
      color: n.formaPago === 'credito' ? 'var(--warn-text)' : 'var(--ok-text)'
    }, n.formaPago))))));
  }), form && React.createElement(Modal, {
    title: form.id ? 'Editar Cliente' : 'Nuevo Cliente',
    onClose: () => setForm(null)
  }, React.createElement(Lbl, null, "Nombre"), React.createElement(Inp, {
    value: form.nombre,
    onChange: e => setForm(f => ({
      ...f,
      nombre: e.target.value
    })),
    style: {
      marginBottom: 10
    }
  }), React.createElement(Lbl, null, "Teléfono"), React.createElement(Inp, {
    type: "tel",
    value: form.telefono,
    onChange: e => setForm(f => ({
      ...f,
      telefono: e.target.value
    })),
    style: {
      marginBottom: 10
    }
  }), React.createElement(Lbl, null, "Domicilio"), React.createElement(Inp, {
    value: form.domicilio,
    onChange: e => setForm(f => ({
      ...f,
      domicilio: e.target.value
    })),
    style: {
      marginBottom: 16
    }
  }), React.createElement(Lbl, null, "Ubicación exacta del domicilio"), React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, form.ubicacion ? React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      background: 'var(--ok-bg)',
      borderRadius: 8,
      padding: '8px 10px'
    }
  }, React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ok-text)'
    }
  }, "✅ Ubicación guardada (", form.ubicacion.lat.toFixed(5), ", ", form.ubicacion.lng.toFixed(5), ")"), React.createElement("button", {
    onClick: () => setForm(f => ({
      ...f,
      ubicacion: null
    })),
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--danger-text)',
      cursor: 'pointer',
      fontSize: 11
    }
  }, "Quitar")) : React.createElement(BOut, {
    onClick: capturarUbicacion,
    style: {
      width: '100%'
    },
    disabled: capturando
  }, capturando ? 'Obteniendo ubicación…' : '📍 Usar mi ubicación actual'), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginTop: 6,
      lineHeight: 1.4
    }
  }, "Ideal: captúrala parado en el domicilio del cliente. Se usa para validar, sin bloquear, que las ventas por ruta se hicieron cerca de aquí.")), React.createElement(BFill, {
    onClick: save,
    style: {
      width: '100%'
    }
  }, "💾 Guardar")), qrFor && React.createElement(Modal, {
    title: '🔳 QR de ' + qrFor.nombre,
    onClose: () => {
      setQrFor(null);
      setQrUrl(null);
    }
  }, React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, qrUrl ? React.createElement("img", {
    src: qrUrl,
    alt: "QR",
    style: {
      width: 200,
      height: 200,
      background: '#fff',
      borderRadius: 8,
      padding: 8
    }
  }) : React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-faint)',
      padding: '40px 0'
    }
  }, "Generando…"), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginTop: 12
    }
  }, "Este es el código que identifica a ", qrFor.nombre, " al escanear en una venta desde transferencia."), React.createElement(Row, { style: { gap: 8, marginTop: 14, justifyContent: 'center' } }, React.createElement(BOut, { onClick: copiarQR, style: { flex: 1 }, disabled: !qrUrl }, '📋 Copiar código'), React.createElement(BFill, { onClick: descargarQR, style: { flex: 1 }, disabled: !qrUrl }, '⬇️ Descargar QR')))), detallesFor && React.createElement(Modal, {
    title: 'ℹ️ Detalles de ' + detallesFor.nombre,
    onClose: () => setDetallesFor(null)
  }, React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, React.createElement("div", null, React.createElement(Lbl, null, "Cliente agregado"), React.createElement("div", {
    style: {
      fontSize: 13
    }
  }, detallesFor.fechaAlta ? fDate(detallesFor.fechaAlta) : 'No disponible (cliente de antes de este registro)')), React.createElement("div", null, React.createElement(Lbl, null, "Domicilio"), React.createElement("div", {
    style: {
      fontSize: 13,
      color: detallesFor.ubicacion ? 'var(--ink-soft)' : 'var(--ink-faint)'
    }
  }, detallesFor.ubicacion ? 'Domicilio existente' : 'Domicilio no capturado')), React.createElement("div", null, React.createElement(Lbl, null, "Teléfono"), React.createElement("div", {
    style: {
      fontSize: 13
    }
  }, detallesFor.telefono || '—')), React.createElement("div", null, React.createElement(Lbl, null, "Dirección registrada"), React.createElement("div", {
    style: {
      fontSize: 13
    }
  }, detallesFor.domicilio || '—')))));
}