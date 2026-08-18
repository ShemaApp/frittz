let clientesQRLoading = false;
const textoQRCliente = clienteId => 'PDLC-CLIENTE:' + clienteId;
const LOCALIDADES_BASE_CABORCA = Object.freeze([
  'La Y Griega',
  'Ejido Pablo Bórquez',
  'Ejido La Alameda',
  'Ejido El Coyote',
  'Ejido El Bajío',
  'Ejido Rodolfo Campodónico',
  'Santa Eduwiges (Las Cachoras)',
  'Puerto Lobos',
  'Ejido Álvaro Obregón',
  'Ejido El Último Esfuerzo',
  'Ejido Ures',
  'Ejido La Primavera',
  'Ejido Josefa Ortiz de Domínguez',
  'Ejido 21 de Marzo',
  'Viñedo Viva (Campamento)',
  'Ejido Alfonso Garzón Santibáñez',
  'Ejido Adolfo Orive de Alba',
  'El Rocío',
  'San Isidro',
  'Ejido Zacatecas',
  'Ejido El Cajeme (Cajeme Dos)',
  'Ejido Yaqui Justiciero',
  'Ejido Jesús García',
  'Rancho San Francisquito',
  'Ejido Viñedo Viva',
  'Ejido La Almita',
  'Ejido Poblado San Francisco',
  'Campo San Carlos',
  'Campo Don Pedro',
  'Campo San Alberto',
  'Campo Santa Inés',
  'Campo El Álamo',
  'Campo La Esperanza',
  'Rancho El Sahuaro (Bajo)',
  'Rancho Las Bellotas',
  'Heroica Caborca',
  'Ejido 15 de Septiembre',
  'El Desemboque',
  'Poblado San Felipe',
  'Ejido México Sesenta y Ocho',
  'Ejido José María Morelos'
]);
const normalizarLocalidad = valor => String(valor || '').trim().replace(/\s+/g, ' ');
const claveLocalidad = valor => normalizarLocalidad(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const LOCALIDAD_NUEVA = '__nueva_localidad__';
const LOCALIDAD_SIN_CLASIFICAR = '__sin_localidad__';

function SelectorLocalidad({ value, localidades, nuevaValue, onSeleccionar, onCrear, onCambiar }) {
  const [texto, setTexto] = useState(value || '');
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (nuevaValue === undefined && claveLocalidad(value) === claveLocalidad(texto)) setTexto(value || '');
  }, [value, nuevaValue]);
  const termino = claveLocalidad(texto);
  const exacta = localidades.find(localidad => claveLocalidad(localidad) === termino);
  const sugerencias = localidades.filter(localidad => !termino || claveLocalidad(localidad).includes(termino)).slice(0, 12);
  if (nuevaValue !== undefined) return React.createElement('div', { style: { marginBottom: 6 } },
    React.createElement(Row, { style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
      React.createElement('span', { style: { fontSize: 12, fontWeight: 800, color: 'var(--accent-text)' } }, 'Nueva localidad'),
      React.createElement(BOut, { onClick: onCambiar, style: { padding: '5px 8px', fontSize: 11 } }, 'Elegir existente')),
    React.createElement(Inp, {
      value: nuevaValue,
      placeholder: 'Nombre de la nueva localidad',
      onChange: e => onCrear(normalizarLocalidad(e.target.value))
    }));
  return React.createElement('div', { style: { position: 'relative', marginBottom: 6 } },
    React.createElement(Inp, {
      value: texto,
      placeholder: 'Escribe para buscar localidad…',
      onFocus: () => setAbierto(true),
      onChange: e => {
        setTexto(e.target.value);
        setAbierto(true);
        if (exacta && claveLocalidad(e.target.value) !== claveLocalidad(exacta)) onCambiar();
      },
      onBlur: () => setTimeout(() => setAbierto(false), 150),
      'aria-label': 'Buscar localidad'
    }),
    abierto && React.createElement('div', {
      style: {
        position: 'absolute',
        zIndex: 20,
        left: 0,
        right: 0,
        top: 'calc(100% + 4px)',
        maxHeight: 220,
        overflowY: 'auto',
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        borderRadius: 8,
        boxShadow: '0 8px 20px rgba(0,0,0,.12)'
      }
    }, sugerencias.length ? sugerencias.map(localidad => React.createElement('button', {
      key: localidad,
      type: 'button',
      onMouseDown: e => e.preventDefault(),
      onClick: () => {
        setTexto(localidad);
        setAbierto(false);
        onSeleccionar(localidad);
      },
      style: {
        display: 'block',
        width: '100%',
        padding: '9px 10px',
        textAlign: 'left',
        border: 'none',
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface)',
        color: 'var(--ink)',
        cursor: 'pointer',
        fontSize: 12
      }
    }, localidad)) : React.createElement('div', { style: { padding: '10px', fontSize: 12, color: 'var(--ink-faint)' } }, 'No hay coincidencias.')), texto.trim() && !exacta && React.createElement('button', {
      type: 'button',
      onMouseDown: e => e.preventDefault(),
      onClick: () => {
        setAbierto(false);
        onCrear(normalizarLocalidad(texto));
      },
      style: {
        display: 'block',
        width: '100%',
        padding: '10px',
        textAlign: 'left',
        border: 'none',
        background: 'var(--surface-2)',
        color: 'var(--accent-text)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 800
      }
    }, '+ Crear "' + normalizarLocalidad(texto) + '"'));
}

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
function HojaCapturaGPSRapida({ cliente, estado, lectura, error, onConfirmar, onReintentar, onGuardar, onCerrar }) {
  if (!cliente) return null;
  const cerrable = estado !== 'buscando' && estado !== 'guardando';
  const asa = { width: 38, height: 4, borderRadius: 99, background: 'var(--line-strong)', margin: '0 auto 16px' };
  let contenido;
  if (estado === 'confirmar') contenido = React.createElement(React.Fragment, null,
    React.createElement('div', { style: asa }),
    React.createElement('div', { style: { fontSize: 18, fontWeight: 800, marginBottom: 6 } }, '📍 ¿Estás en este domicilio?'),
    React.createElement('div', { style: { fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.45, marginBottom: 14 } }, 'La referencia de visita se guardará para validar futuras entregas.'),
    React.createElement('div', { style: { background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 12px', marginBottom: 16 } },
      React.createElement('div', { style: { fontSize: 13, fontWeight: 800, marginBottom: 3 } }, cliente.nombre),
      React.createElement('div', { style: { fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.35 } }, '📍 ', cliente.localidad || cliente.domicilio || 'Localidad sin detalle')),
    React.createElement(BFill, { onClick: onConfirmar, style: { width: '100%' } }, 'SÍ, CAPTURAR REFERENCIA'),
    React.createElement('button', { type: 'button', onClick: onCerrar, style: { width: '100%', marginTop: 8, padding: 9, border: 'none', background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer', fontWeight: 700, fontSize: 12 } }, 'Cancelar')
  );else if (estado === 'buscando' || estado === 'guardando') contenido = React.createElement(React.Fragment, null,
    React.createElement('div', { style: asa }),
    React.createElement('div', { style: { fontSize: 18, fontWeight: 800, marginBottom: 7 } }, estado === 'guardando' ? 'Guardando referencia…' : 'Obteniendo señal de visita…'),
    React.createElement('div', { style: { fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.45 } }, estado === 'guardando' ? 'Actualizando la referencia de ' + cliente.nombre + '.' : 'Mantente parado en el domicilio. Puede tomar unos segundos.'),
    React.createElement('div', { style: { textAlign: 'center', padding: '25px 0 10px', fontSize: 28, color: 'var(--accent-text)' } }, '◌')
  );else if (estado === 'lectura') contenido = React.createElement(React.Fragment, null,
    React.createElement('div', { style: asa }),
    React.createElement('div', { style: { fontSize: 18, fontWeight: 800, marginBottom: 4 } }, 'Referencia de visita detectada'),
    React.createElement('div', { style: { fontSize: 12, color: 'var(--ink-faint)', marginBottom: 13 } }, cliente.nombre),
    React.createElement('div', { style: { background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 } }, 'Señal recibida. La referencia no se mostrará en pantalla; se usará únicamente para validar la visita.'),
    React.createElement(BFill, { onClick: onGuardar, style: { width: '100%' } }, 'GUARDAR Y CONTINUAR'),
    React.createElement(Row, { style: { gap: 8, marginTop: 8 } }, React.createElement(BOut, { onClick: onReintentar, style: { flex: 1 } }, 'Reintentar'), React.createElement(BOut, { onClick: onCerrar, style: { flex: 1 } }, 'Cancelar'))
  );else if (estado === 'guardado') contenido = React.createElement(React.Fragment, null,
    React.createElement('div', { style: asa }),
    React.createElement('div', { style: { textAlign: 'center', fontSize: 32, marginBottom: 5 } }, '✓'),
    React.createElement('div', { style: { textAlign: 'center', fontSize: 18, fontWeight: 800, marginBottom: 6, color: 'var(--ok-text)' } }, 'Referencia guardada'),
    React.createElement('div', { style: { textAlign: 'center', fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.45, marginBottom: 16 } }, 'La referencia de visita de ' + cliente.nombre + ' ya puede utilizarse para validar entregas.'),
    React.createElement(BFill, { onClick: onCerrar, style: { width: '100%' } }, 'CONTINUAR')
  );else contenido = React.createElement(React.Fragment, null,
    React.createElement('div', { style: asa }),
    React.createElement('div', { style: { fontSize: 18, fontWeight: 800, marginBottom: 7, color: 'var(--danger-text)' } }, 'No se pudo obtener la referencia de visita'),
    React.createElement('div', { style: { fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45, marginBottom: 16 } }, error || 'Revisa la señal y los permisos de ubicación del navegador.'),
    React.createElement(Row, { style: { gap: 8 } }, React.createElement(BOut, { onClick: onCerrar, style: { flex: 1 } }, 'Dejar pendiente'), React.createElement(BFill, { onClick: onReintentar, style: { flex: 1 } }, 'Reintentar'))
  );
  return React.createElement('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Captura rápida de ubicación', onClick: () => cerrable && onCerrar(), style: { position: 'fixed', inset: 0, zIndex: 2500, background: 'rgba(18,24,21,.46)', display: 'flex', alignItems: 'flex-end' } },
    React.createElement('div', { onClick: e => e.stopPropagation(), style: { width: '100%', maxWidth: 620, margin: '0 auto', background: 'var(--surface)', borderRadius: '18px 18px 0 0', padding: '14px 16px 20px', boxShadow: '0 -12px 30px rgba(0,0,0,.18)' } }, contenido));
}

function FichaRapidaCliente({
  cliente,
  saldo,
  historial,
  puedeEditar,
  onEditar,
  onAbrirQR,
  onHistorial
}) {
  const ubicacionValida = Number.isFinite(Number(cliente?.ubicacion?.lat)) && Number.isFinite(Number(cliente?.ubicacion?.lng));
  return React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, React.createElement(Row, {
    style: {
      gap: 6,
      flexWrap: 'wrap'
    }
  }, cliente.activo ? React.createElement(Tag, {
    color: 'var(--ok-text)'
  }, 'Activo') : React.createElement(Tag, {
    color: 'var(--ink-soft)'
  }, 'Inactivo'), saldo > 0 ? React.createElement(Tag, {
    color: 'var(--warn-text)'
  }, 'Con crédito') : React.createElement(Tag, {
    color: 'var(--ink-soft)'
  }, 'Sin crédito'), ubicacionValida ? React.createElement(Tag, {
    color: 'var(--ok-text)'
  }, '✓ Validación disponible') : React.createElement(Tag, {
    color: 'var(--warn-text)'
  }, '📍 Sin referencia')), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8
    }
  }, React.createElement("div", {
    style: {
      background: 'var(--surface-2)',
      borderRadius: 8,
      padding: '9px 10px'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 3
    }
  }, 'SALDO PENDIENTE'), React.createElement("div", {
    style: {
      fontSize: 15,
      color: saldo > 0 ? 'var(--warn-text)' : 'var(--ok-text)',
      fontWeight: 800
    }
  }, saldo > 0 ? fmt(saldo) : 'Sin saldo')), React.createElement("div", {
    style: {
      background: 'var(--surface-2)',
      borderRadius: 8,
      padding: '9px 10px'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 3
    }
  }, 'COMPRAS REGISTRADAS'), React.createElement("div", {
    style: {
      fontSize: 15,
      color: 'var(--ink)',
      fontWeight: 800
    }
  }, historial.length))), React.createElement("div", null, React.createElement(Lbl, null, 'Contacto'), React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.45
    }
  }, '📱 ', cliente.telefono || 'Sin teléfono registrado')), React.createElement("div", null, React.createElement(Lbl, null, 'Localidad'), React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.45,
      color: (cliente.localidad || cliente.domicilio) ? 'var(--ink)' : 'var(--ink-faint)'
    }
  }, '📍 ', cliente.localidad || cliente.domicilio || 'Localidad no registrada')), React.createElement("div", null, React.createElement(Lbl, null, 'Cliente agregado'), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)'
    }
  }, cliente.fechaAlta ? fDate(cliente.fechaAlta) : 'No disponible')), React.createElement(Row, {
    style: {
      gap: 6,
      flexWrap: 'wrap'
    }
  }, React.createElement(Tag, {
    color: ubicacionValida ? 'var(--ok-text)' : 'var(--warn-text)'
  }, ubicacionValida ? '📍 Validación disponible' : '📍 Sin referencia'), React.createElement(BOut, {
    onClick: onAbrirQR,
    style: {
      flex: 1
    }
  }, '🔳 QR'), puedeEditar && React.createElement(BFill, {
    onClick: onEditar,
    style: {
      flex: 1
    }
  }, '✏️ Editar')), React.createElement("div", {
    style: {
      borderTop: '1px solid var(--line)',
      paddingTop: 10
    }
  }, React.createElement(Row, {
    style: {
      justifyContent: 'space-between',
      marginBottom: 7
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 800
    }
  }, 'HISTORIAL RECIENTE'), historial.length > 3 && React.createElement("button", {
    type: 'button',
    onClick: onHistorial,
    style: {
      border: 'none',
      padding: 0,
      background: 'none',
      color: 'var(--accent-text)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, 'Ver todo')), historial.length === 0 ? React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-faint)'
    }
  }, 'Sin compras registradas todavía.') : historial.slice(0, 3).map(n => React.createElement(Row, {
    key: n.id,
    style: {
      justifyContent: 'space-between',
      gap: 6,
      padding: '7px 0',
      borderBottom: '1px solid var(--line)',
      fontSize: 12
    }
  }, React.createElement("span", {
    style: {
      color: 'var(--ink-soft)'
    }
  }, fDate(n.fecha)), React.createElement("span", {
    style: {
      flex: 1,
      textAlign: 'center',
      color: 'var(--ink-faint)'
    }
  }, (n.items || []).length, ' prod.'), React.createElement("span", {
    style: {
      color: 'var(--accent-text)',
      fontWeight: 800
    }
  }, fmt(n.total)))), historial.length > 0 && React.createElement(BOut, {
    onClick: onHistorial,
    style: {
      width: '100%',
      marginTop: 9
    }
  }, '📋 Ver historial completo')));
}

function Clientes({
  clientes,
  notas,
  creditos,
  currentUser
}) {
  const puedeEditar = currentUser?.role === 'admin' || permisoEdita(currentUser).clientes;
  const [filtroEstado, setFiltroEstado] = useState('activos');
  const [filtroCredito, setFiltroCredito] = useState('todos');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [histId, setHistId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [qrFor, setQrFor] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [detallesFor, setDetallesFor] = useState(null);
  const [filtroGPS, setFiltroGPS] = useState('todos');
  const [filtroLocalidad, setFiltroLocalidad] = useState('todos');
  const [capturaRapidaFor, setCapturaRapidaFor] = useState(null);
  const [estadoCapturaGPS, setEstadoCapturaGPS] = useState('confirmar');
  const [lecturaGPS, setLecturaGPS] = useState(null);
  const [errorCapturaGPS, setErrorCapturaGPS] = useState('');
  const cmap = creditos.reduce((m, c) => {
    const saldo = Number(c.saldo || 0);
    if (Number.isFinite(saldo) && saldo > 0) m[c.clienteId] = (m[c.clienteId] || 0) + saldo;
    return m;
  }, {});
  const clientesPorEstado = clientes.filter(c => filtroEstado === 'todos' ? true : filtroEstado === 'activos' ? c.activo : !c.activo);
  const localidades = (() => {
    const porClave = new Map();
    [...LOCALIDADES_BASE_CABORCA, ...clientes.map(cliente => cliente.localidad || cliente.domicilio || '')].forEach(valor => {
      const nombre = normalizarLocalidad(valor);
      const clave = claveLocalidad(nombre);
      if (nombre && !porClave.has(clave)) porClave.set(clave, nombre);
    });
    return Array.from(porClave.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  })();
  const localidadCanonica = valor => {
    const nombre = normalizarLocalidad(valor);
    if (!nombre) return '';
    const existente = localidades.find(localidad => claveLocalidad(localidad) === claveLocalidad(nombre));
    return existente || nombre;
  };
  const localidadDeCliente = cliente => localidadCanonica(cliente.localidad || cliente.domicilio || '');
  const tieneCredito = cliente => Number(cmap[cliente.id] || 0) > 0;
  const coincideBusqueda = cliente => {
    const termino = q.trim().toLowerCase();
    if (!termino) return true;
    return [cliente.nombre, cliente.telefono, localidadDeCliente(cliente)].some(valor => String(valor || '').toLowerCase().includes(termino));
  };
  const coincideLocalidad = cliente => filtroLocalidad === 'todos' ? true : filtroLocalidad === LOCALIDAD_SIN_CLASIFICAR ? !localidadDeCliente(cliente) : claveLocalidad(localidadDeCliente(cliente)) === claveLocalidad(filtroLocalidad);
  const contarClientes = condicion => clientesPorEstado.filter(condicion).length;
  const contarLocalidad = localidad => clientesPorEstado.filter(cliente => claveLocalidad(localidadDeCliente(cliente)) === claveLocalidad(localidad)).length;
  const sinLocalidad = clientesPorEstado.filter(cliente => !localidadDeCliente(cliente)).length;
  const list = clientesPorEstado.filter(c => filtroCredito === 'credito' ? tieneCredito(c) : filtroCredito === 'sin-credito' ? !tieneCredito(c) : true).filter(c => filtroGPS === 'sin-gps' ? !c.ubicacion : filtroGPS === 'con-gps' ? !!c.ubicacion : true).filter(coincideLocalidad).filter(coincideBusqueda).slice().sort((a, b) => {
    const localidadA = localidadDeCliente(a) || 'Sin clasificar';
    const localidadB = localidadDeCliente(b) || 'Sin clasificar';
    const porLocalidad = localidadA.localeCompare(localidadB, 'es', { sensitivity: 'base' });
    return porLocalidad || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
  });
  const historialCliente = clienteId => notas.filter(n => n.clienteId === clienteId).slice().sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
  const save = async () => {
    if (!form.nombre) return;
    const localidadEntrada = form.localidadNueva !== undefined ? form.localidadNueva : form.localidad || form.domicilio || '';
    const localidad = localidadCanonica(localidadEntrada);
    if (!localidad) {
      alert('Selecciona una localidad existente o escribe una nueva.');
      return;
    }
    const item = {
      nombre: form.nombre,
      telefono: form.telefono || '',
      localidad,
      // Conserva compatibilidad con pantallas históricas que todavía leen domicilio.
      domicilio: localidad,
      activo: form.activo !== undefined ? form.activo : true,
      ubicacion: form.ubicacion || null
    };
    if (form.id) await db.collection('clientes').doc(form.id).update(item);else await db.collection('clientes').add({
      ...item,
      creadoPorUid: currentUser.uid,
      fechaAlta: new Date().toISOString()
    });
    setForm(null);
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
  const mensajeErrorGPS = e => {
    if (e?.code === 1) return 'El permiso de ubicación está desactivado. Habilítalo para este sitio y vuelve a intentarlo.';
    if (e?.code === 2) return 'No se detectó una señal de ubicación utilizable. Muévete a una zona con mejor vista al cielo.';
    if (e?.code === 3) return 'La lectura tardó demasiado. Reintenta cuando la señal sea más estable.';
    return 'No se pudo obtener la ubicación. Revisa los permisos del navegador.';
  };
  const obtenerLecturaGPS = (onExito, onError) => {
    if (!navigator.geolocation) {
      onError({ mensaje: 'Este dispositivo no soporta ubicación.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(p => {
      onExito({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        precisionMetros: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
        fecha: new Date().toISOString()
      });
    }, e => onError({ mensaje: mensajeErrorGPS(e) }), {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    });
  };
  const capturarUbicacion = () => {
    setCapturando(true);
    obtenerLecturaGPS(ubicacion => {
      setForm(f => ({ ...f, ubicacion }));
      setCapturando(false);
    }, e => {
      alert(e.mensaje);
      setCapturando(false);
    });
  };
  const abrirCapturaRapida = cliente => {
    setCapturaRapidaFor(cliente);
    setEstadoCapturaGPS('confirmar');
    setLecturaGPS(null);
    setErrorCapturaGPS('');
    setExpandedId(null);
  };
  const iniciarCapturaRapida = () => {
    setEstadoCapturaGPS('buscando');
    setErrorCapturaGPS('');
    obtenerLecturaGPS(lectura => {
      setLecturaGPS(lectura);
      setEstadoCapturaGPS('lectura');
    }, e => {
      setErrorCapturaGPS(e.mensaje);
      setEstadoCapturaGPS('error');
    });
  };
  const guardarCapturaRapida = async () => {
    if (!capturaRapidaFor || !lecturaGPS || !puedeEditar) return;
    setEstadoCapturaGPS('guardando');
    try {
      await db.collection('clientes').doc(capturaRapidaFor.id).update({ ubicacion: lecturaGPS });
      setEstadoCapturaGPS('guardado');
    } catch (e) {
      setErrorCapturaGPS('No se pudo guardar la ubicación. Revisa tu conexión e inténtalo de nuevo.');
      setEstadoCapturaGPS('error');
    }
  };
  const detalleHistorial = detallesFor ? historialCliente(detallesFor.id) : [];
  const detalleSaldo = detallesFor ? Number(cmap[detallesFor.id] || 0) : 0;
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
      domicilio: '',
      localidad: ''
    })
  }, "+ Nuevo")), React.createElement(Inp, {
    placeholder: "🔍 Buscar por nombre, teléfono o localidad…",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      marginBottom: 12
    }
  }), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 800,
      marginBottom: 6,
      letterSpacing: '.02em'
    }
  }, "ESTADO"), React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 12
    }
  }, [['todos', 'Todos', contarClientes(() => true)], ['activos', 'Activos', contarClientes(c => c.activo)], ['inactivos', 'Inactivos', contarClientes(c => !c.activo)]].map(([v, l, total]) => React.createElement("button", {
    key: v,
    type: 'button',
    onClick: () => setFiltroEstado(v),
    'aria-pressed': filtroEstado === v,
    style: {
      padding: '7px 9px',
      borderRadius: 8,
      border: '1px solid ' + (filtroEstado === v ? 'var(--accent)' : 'var(--line)'),
      background: filtroEstado === v ? 'var(--accent)' : 'var(--surface)',
      color: filtroEstado === v ? 'var(--ink)' : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l + '  ' + total))), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 800,
      marginBottom: 6,
      letterSpacing: '.02em'
    }
  }, "CRÉDITO"), React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 12
    }
  }, [['todos', 'Todos', contarClientes(() => true)], ['credito', 'Con crédito', contarClientes(tieneCredito)], ['sin-credito', 'Sin crédito', contarClientes(c => !tieneCredito(c))]].map(([v, l, total]) => React.createElement("button", {
    key: v,
    type: 'button',
    onClick: () => setFiltroCredito(v),
    'aria-pressed': filtroCredito === v,
    style: {
      padding: '7px 9px',
      borderRadius: 8,
      border: '1px solid ' + (filtroCredito === v ? 'var(--accent)' : 'var(--line)'),
      background: filtroCredito === v ? 'var(--accent)' : 'var(--surface)',
      color: filtroCredito === v ? 'var(--ink)' : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l + '  ' + total))), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 800,
      marginBottom: 6,
      letterSpacing: '.02em'
    }
  }, "UBICACIÓN"), React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10
    }
  }, [['todos', 'Todos', contarClientes(() => true)], ['con-gps', '✓ Con referencia', contarClientes(c => !!c.ubicacion)], ['sin-gps', '📍 Sin referencia', contarClientes(c => !c.ubicacion)]].map(([v, l, total]) => React.createElement("button", {
    key: v,
    type: 'button',
    onClick: () => setFiltroGPS(v),
    'aria-pressed': filtroGPS === v,
    style: {
      padding: '7px 9px',
      borderRadius: 8,
      border: '1px solid ' + (filtroGPS === v ? 'var(--accent)' : 'var(--line)'),
      background: filtroGPS === v ? 'var(--accent)' : 'var(--surface)',
      color: filtroGPS === v ? 'var(--ink)' : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l + '  ' + total))), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 800,
      marginBottom: 6,
      letterSpacing: '.02em'
    }
  }, "LOCALIDAD"), React.createElement("select", {
    value: filtroLocalidad,
    onChange: e => setFiltroLocalidad(e.target.value),
    style: {
      width: '100%',
      padding: '9px 10px',
      border: '1px solid var(--line-strong)',
      borderRadius: 7,
      background: 'var(--surface-2)',
      color: 'var(--ink)',
      fontSize: 12,
      marginBottom: 10
    }
  }, React.createElement("option", { value: 'todos' }, 'Todas las localidades (' + contarClientes(() => true) + ')'), sinLocalidad > 0 && React.createElement("option", { value: LOCALIDAD_SIN_CLASIFICAR }, 'Sin clasificar (' + sinLocalidad + ')'), localidades.map(localidad => React.createElement("option", {
    key: localidad,
    value: localidad
  }, localidad + ' (' + contarLocalidad(localidad) + ')'))), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 12,
      lineHeight: 1.4
    }
  }, list.length + ' cliente' + (list.length === 1 ? '' : 's') + ' encontrado' + (list.length === 1 ? '' : 's') + '. ' + (filtroGPS === 'sin-gps' ? 'Captura la referencia estando en el domicilio; al guardarla desaparecerá de este filtro.' : 'La lista está agrupada por localidad. Toca el botón ⋮ para ver acciones, la miniatura QR para abrir el código o la tarjeta para abrir la ficha rápida.')), list.map((c, indice) => {
    const expanded = expandedId === c.id;
    const localidadActual = localidadDeCliente(c) || 'Sin clasificar';
    const localidadAnterior = indice > 0 ? localidadDeCliente(list[indice - 1]) || 'Sin clasificar' : null;
    const mostrarEncabezadoLocalidad = indice === 0 || claveLocalidad(localidadActual) !== claveLocalidad(localidadAnterior);
    return React.createElement(Card, {
      key: c.id,
      style: {
        opacity: c.activo ? 1 : 0.65,
        padding: 0,
        overflow: 'hidden'
      }
    }, mostrarEncabezadoLocalidad && React.createElement("div", {
      style: {
        padding: '8px 14px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface-2)',
        color: 'var(--ink-soft)',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '.02em'
      }
    }, 'LOCALIDAD · ' + localidadActual), React.createElement("div", {
      onClick: () => setDetallesFor(c),
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
    }, "Inactivo"), tieneCredito(c) ? React.createElement(Tag, {
      color: "var(--warn-text)"
    }, "Con crédito · ", fmt(cmap[c.id])) : React.createElement(Tag, {
      color: "var(--ink-soft)"
    }, "Sin crédito"), c.ubicacion ? React.createElement(Tag, {
      color: "var(--ok-text)"
    }, "✓ Validación disponible") : React.createElement(Tag, {
      color: "var(--warn-text)"
    }, "📍 Sin referencia")), React.createElement("div", {
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
    }, "📍 ", localidadDeCliente(c) || 'Sin clasificar')), React.createElement(MiniaturaQRCliente, {
      cliente: c,
      onClick: () => verQR(c)
    }), React.createElement("button", {
      type: 'button',
      onMouseDown: e => e.stopPropagation(),
      onTouchStart: e => e.stopPropagation(),
      onClick: e => {
        e.stopPropagation();
        setExpandedId(eid => eid === c.id ? null : c.id);
      },
      title: 'Acciones de ' + c.nombre,
      'aria-label': 'Acciones de ' + c.nombre,
      'aria-expanded': expanded,
      style: {
        width: 34,
        minWidth: 34,
        height: 62,
        border: '1px solid var(--line-strong)',
        borderRadius: 8,
        background: 'var(--surface)',
        color: 'var(--ink-soft)',
        fontSize: 20,
        lineHeight: 1,
        cursor: 'pointer'
      }
    }, '⋮'))), !c.ubicacion && puedeEditar && React.createElement("div", {
      style: { padding: '0 14px 12px' }
    }, React.createElement(BFill, {
      onMouseDown: e => e.stopPropagation(),
      onTouchStart: e => e.stopPropagation(),
      onClick: e => {
        e.stopPropagation();
        abrirCapturaRapida(c);
      },
      style: { width: '100%' }
    }, '📍 CAPTURAR AQUÍ')), React.createElement("div", {
      style: {
        maxHeight: expanded ? 250 : 0,
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
          ...c,
          localidad: localidadCanonica(c.localidad || c.domicilio || '')
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
  }), React.createElement(Lbl, null, "Localidad (ejido o rancho)"), React.createElement(SelectorLocalidad, {
    value: form.localidad || form.domicilio || '',
    localidades,
    nuevaValue: form.localidadNueva,
    onSeleccionar: valor => setForm(f => {
      const siguiente = { ...f, localidad: valor };
      delete siguiente.localidadNueva;
      return siguiente;
    }),
    onCrear: valor => setForm(f => ({ ...f, localidadNueva: valor })),
    onCambiar: () => setForm(f => {
      const siguiente = { ...f, localidad: '' };
      delete siguiente.localidadNueva;
      return siguiente;
    })
  }), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      lineHeight: 1.4,
      marginBottom: 16
    }
  }, 'Selecciona una localidad existente o crea una nueva. El nombre se reutilizará en futuros clientes.'), React.createElement(Lbl, null, "Referencia privada para validar visitas"), React.createElement("div", {
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
  }, '✅ Referencia guardada para validar visitas'), React.createElement("button", {
    onClick: () => {
      if (window.confirm('¿Deseas reemplazar o retirar la referencia actual? El cambio no se guardará hasta que confirmes esta ficha.')) setForm(f => ({
        ...f,
        ubicacion: null
      }));
    },
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
  }, capturando ? 'Capturando referencia…' : '📍 Capturar referencia de visita'), React.createElement("div", {
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
  }, "Este es el código que identifica a ", qrFor.nombre, " al escanear en una venta desde transferencia."), React.createElement(Row, {
    style: {
      gap: 8,
      marginTop: 14,
      justifyContent: 'center'
    }
  }, React.createElement(BOut, {
    onClick: copiarQR,
    style: {
      flex: 1
    },
    disabled: !qrUrl
  }, '📋 Copiar código'), React.createElement(BFill, {
    onClick: descargarQR,
    style: {
      flex: 1
    },
    disabled: !qrUrl
  }, '⬇️ Descargar QR')))), detallesFor && React.createElement(Modal, {
    title: 'Cliente · ' + detallesFor.nombre,
    onClose: () => setDetallesFor(null)
  }, React.createElement(FichaRapidaCliente, {
    cliente: detallesFor,
    saldo: detalleSaldo,
    historial: detalleHistorial,
    puedeEditar: puedeEditar,
    onEditar: () => {
      setForm({
        ...detallesFor,
        localidad: localidadCanonica(detallesFor.localidad || detallesFor.domicilio || '')
      });
      setDetallesFor(null);
    },
    onAbrirQR: () => {
      const cliente = detallesFor;
      setDetallesFor(null);
      verQR(cliente);
    },
    onHistorial: () => {
      const clienteId = detallesFor.id;
      setDetallesFor(null);
      setHistId(clienteId);
    },
  })), React.createElement(HojaCapturaGPSRapida, {
    cliente: capturaRapidaFor,
    estado: estadoCapturaGPS,
    lectura: lecturaGPS,
    error: errorCapturaGPS,
    onConfirmar: iniciarCapturaRapida,
    onReintentar: iniciarCapturaRapida,
    onGuardar: guardarCapturaRapida,
    onCerrar: () => {
      if (estadoCapturaGPS !== 'buscando' && estadoCapturaGPS !== 'guardando') setCapturaRapidaFor(null);
    }
  }));
}
