function App() {
  const {
    currentUser, authChecked, firestoreError,
    locked, setLocked,
    isOnline,
    productos, clientes, notas, creditos, rutas, pedidos,
    pendCounts, totalPendientes, notificacionesTransferencias,
  } = useSesion();
  const [tab, setTab] = useState('home');
  const [navOpen, setNavOpen] = useState(false);
  const historialTabs = useRef([]);
  const [modoNota, setModoNota] = useState('pedidos');
  const [abrirFormProducto, setAbrirFormProducto] = useState(false);
  const [abrirUsuarios, setAbrirUsuarios] = useState(false);
  const [offlineVentaResumen, setOfflineVentaResumen] = useState({ total: 0, pendientes: 0, incidencias: 0, registros: [] });
  useEffect(() => {
    if (typeof frittzSuscribirVentasOffline !== 'function') return undefined;
    return frittzSuscribirVentasOffline(setOfflineVentaResumen);
  }, []);
  const ALL_TABS = [['home', '🏠', 'Inicio'], ['productos', '📦', 'Productos'], ['nota', '📋', 'Pedidos'], ['clientes', '👥', 'Clientes'], ['creditos', '💳', 'Créditos'], ['ruta', '📦', 'Transferencias'], ['repartidores', '🧭', 'Distribución'], ['inventario', '📋', 'Inventario'], ['reportes', '📈', 'Reportes'], ['gerencia', '💰', 'Gerencia']];
  const permTabs = permisoTabs(currentUser);
  const tabsPermitidos = ['home', ...ALL_TABS.filter(([id]) => id !== 'home' && permTabs[id]).map(([id]) => id)];
  const TABS = ALL_TABS.filter(([id]) => tabsPermitidos.includes(id));
  useEffect(() => {
    if (!currentUser) return;
    if (tab !== 'config' && !tabsPermitidos.includes(tab)) {
      historialTabs.current = [];
      setTab(tabsPermitidos[0]);
    }
  }, [currentUser]);
  const navegarA = (destino, opciones = {}) => {
    setNavOpen(false);
    if (!destino) return;
    if (destino !== 'home' && destino !== 'config' && !tabsPermitidos.includes(destino)) return;
    if (destino === 'nota' && !opciones.conservarModoNota) setModoNota('pedidos');
    if (destino === tab) return;
    historialTabs.current.push(tab);
    setTab(destino);
  };
  const volverAtras = () => {
    setNavOpen(false);
    setTab(historialTabs.current.pop() || 'home');
  };
  const goConfig = () => navegarA('config');
  const logout = () => {
    auth.signOut();
    setTab('nota');
  };
  const ctx = {
    productos,
    clientes,
    notas,
    creditos,
    rutas,
    pedidos,
    notificacionesTransferencias
  };
  if (!authChecked) return React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      color: 'var(--ink-faint)',
      fontSize: 14,
      background: 'var(--bg)'
    }
  }, "Cargando…");
  if (!currentUser) return React.createElement(Login, null);
  if (locked) return React.createElement(PinLock, {
    currentUser: currentUser,
    onUnlock: () => setLocked(false),
    onUsePassword: () => auth.signOut()
  });
  const pendientesTotales = totalPendientes + Number(offlineVentaResumen.pendientes || 0);
  const mostrarBanner = !isOnline || pendientesTotales > 0;
  return React.createElement("div", {
    style: {
      minHeight: '100vh',
      position: 'relative',
      paddingTop: mostrarBanner ? 81 : 53,
      paddingBottom: 24,
      background: 'var(--bg)'
    }
  }, React.createElement("div", {
    style: {
      position: 'fixed',
      top: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 420,
      background: 'var(--rail)',
      zIndex: 100,
      height: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      boxSizing: 'border-box'
    }
  }, React.createElement(Row, {
    style: {
      gap: 10
    }
  }, tab !== 'home' && tab !== 'config' && React.createElement("button", {
    onClick: volverAtras,
    title: 'Volver a la pantalla anterior',
    'aria-label': 'Volver a la pantalla anterior',
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--rail-ink-faint)',
      cursor: 'pointer',
      padding: '4px 3px',
      display: 'flex',
      alignItems: 'center',
      fontSize: 24,
      lineHeight: 1
    }
  }, '←'), tab !== 'config' && React.createElement("button", {
    onClick: () => setNavOpen(o => !o),
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--rail-ink-faint)',
      cursor: 'pointer',
      padding: '5px 3px',
      display: 'flex',
      alignItems: 'center'
    }
  }, React.createElement(Menu, null)), React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--accent)',
      fontFamily: 'var(--font-display)',
      textTransform: 'uppercase',
      letterSpacing: '.02em'
    }
  }, "🚚 Productos de la Costa")), React.createElement(Row, {
    style: {
      gap: 6
    }
  }, notificacionesTransferencias.length > 0 && React.createElement("button", {
    onClick: () => navegarA('ruta'),
    title: 'Ver transferencias pendientes',
    'aria-label': 'Ver transferencias pendientes',
    style: {
      position: 'relative',
      background: 'none',
      border: 'none',
      color: 'var(--warn)',
      cursor: 'pointer',
      padding: '4px 6px',
      fontSize: 17
    }
  }, '🔔', React.createElement("span", {
    style: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 15,
      height: 15,
      borderRadius: 10,
      background: 'var(--danger)',
      color: '#fff',
      fontSize: 9,
      lineHeight: '15px',
      fontWeight: 800,
      textAlign: 'center'
    }
  }, notificacionesTransferencias.length)), React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--rail-ink-faint)'
    }
  }, "Hola, ", currentUser.nombre.split(' ')[0]), React.createElement("button", {
    onClick: goConfig,
    style: {
      background: tab === 'config' ? 'var(--rail-border)' : 'none',
      border: 'none',
      color: tab === 'config' ? 'var(--accent)' : 'var(--rail-ink-faint)',
      cursor: 'pointer',
      borderRadius: 3,
      padding: '5px 7px',
      display: 'flex',
      alignItems: 'center'
    }
  }, React.createElement(Gear, null)))), React.createElement("div", {
    style: {
      position: 'fixed',
      top: 50,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 420,
      height: 3,
      zIndex: 100,
      background: 'repeating-linear-gradient(-45deg,var(--accent),var(--accent) 10px,var(--rail) 10px,var(--rail) 20px)'
    }
  }), mostrarBanner && React.createElement("div", {
    style: {
      position: 'fixed',
      top: 53,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 420,
      zIndex: 99,
      background: isOnline ? 'var(--warn-bg)' : 'var(--danger-bg)',
      color: isOnline ? 'var(--warn-text)' : 'var(--danger-text)',
      fontSize: 12,
      fontWeight: 600,
      textAlign: 'center',
      padding: '6px 12px',
      boxSizing: 'border-box'
    }
  }, isOnline ? `⏳ Sincronizando ${pendientesTotales} cambio${pendientesTotales === 1 ? '' : 's'}…` : `📡 Sin conexión — puedes seguir trabajando, se sincroniza solo${pendientesTotales > 0 ? ` (${pendientesTotales} en cola)` : ''}`), firestoreError && React.createElement("div", {
    style: {
      margin: '0 12px 10px',
      background: 'var(--danger-bg)',
      border: '1px solid var(--danger)55',
      borderRadius: 4,
      padding: '8px 12px',
      fontSize: 12,
      color: 'var(--danger-text)'
    }
  }, firestoreError), tab === 'home' && React.createElement(Dashboard, {
    ...ctx,
    currentUser: currentUser,
    notificacionesTransferencias: notificacionesTransferencias,
    onIrA: navegarA,
    onVentaRapida: () => {
      setModoNota('almacen');
      navegarA('nota', { conservarModoNota: true });
    },
    onAgregarProducto: () => {
      setAbrirFormProducto(true);
      navegarA('productos');
    },
    onAgregarUsuario: () => {
      setAbrirUsuarios(true);
      goConfig();
    }
  }), tab === 'productos' && React.createElement(Productos, {
    ...ctx,
    currentUser: currentUser,
    abrirForm: abrirFormProducto,
    onAbrirFormConsumido: () => setAbrirFormProducto(false)
  }), tab === 'nota' && React.createElement(CrearNota, {
    ...ctx,
    currentUser: currentUser,
    ventaRapida: modoNota === 'almacen'
  }), tab === 'clientes' && React.createElement(Clientes, {
    ...ctx,
    currentUser: currentUser
  }), tab === 'creditos' && React.createElement(Creditos, {
    ...ctx,
    currentUser: currentUser
  }), tab === 'ruta' && React.createElement(RutaReparto, {
    ...ctx,
    currentUser: currentUser
  }), tab === 'repartidores' && React.createElement(RepartidoresPanel, {
    ...ctx,
    currentUser: currentUser,
    onIrA: navegarA
  }), tab === 'inventario' && React.createElement(Inventario, {
    ...ctx,
    currentUser: currentUser
  }), tab === 'reportes' && React.createElement(Reportes, {
    ...ctx,
    currentUser: currentUser
  }), tab === 'gerencia' && React.createElement(Gerencia, {
    ...ctx,
    currentUser: currentUser
  }), tab === 'config' && React.createElement(Configuracion, {
    currentUser: currentUser,
    onBack: volverAtras,
    onLogout: logout,
    abrirUsuarios: abrirUsuarios,
    onAbrirUsuariosConsumido: () => setAbrirUsuarios(false)
  }), navOpen && React.createElement("div", {
    onClick: () => setNavOpen(false),
    style: {
      position: 'fixed',
      inset: 0,
      background: '#1B1D19aa',
      zIndex: 190
    }
  }), React.createElement("div", {
    style: {
      position: 'fixed',
      top: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: 420,
      height: '100vh',
      zIndex: 200,
      pointerEvents: 'none'
    }
  }, React.createElement("nav", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      width: 230,
      background: 'var(--rail)',
      borderRight: '1px solid var(--rail-border)',
      boxShadow: navOpen ? '4px 0 18px #1B1D1955' : 'none',
      transform: navOpen ? 'translateX(0)' : 'translateX(-100%)',
      transition: 'transform .22s ease',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 60,
      paddingBottom: 16,
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      overflowY: 'auto'
    }
  }, TABS.map(([id, ico, lbl]) => React.createElement("button", {
    key: id,
    onClick: () => navegarA(id),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 18px',
      background: tab === id ? 'var(--rail-border)' : 'none',
      border: 'none',
      borderLeft: tab === id ? '3px solid var(--accent)' : '3px solid transparent',
      color: tab === id ? 'var(--accent)' : 'var(--rail-ink-faint)',
      cursor: 'pointer',
      textAlign: 'left',
      fontSize: 13,
      fontWeight: tab === id ? 700 : 400
    }
  }, React.createElement("span", {
    style: {
      fontSize: 19,
      lineHeight: 1,
      width: 22,
      textAlign: 'center'
    }
  }, ico), lbl)))));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null));