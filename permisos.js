function Permisos({
  currentUser
}) {
  const [users, setUsers] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [guardando, setGuardando] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    const unsub = db.collection('usuarios').onSnapshot(snap => setUsers(snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    })).filter(u => u.id !== currentUser.uid)), () => setErr('No se pudo cargar la lista de usuarios.'));
    return unsub;
  }, []);
  const cambiar = async (u, grupo, clave, valor) => {
    const permisoFijoRepartidor = u.role === 'repartidor'
      && (grupo === 'tabs' || grupo === 'edita' || (grupo === 'acciones' && clave === 'csv'));
    if (permisoFijoRepartidor) return;
    const key = u.id + grupo + clave;
    setGuardando(key);
    setErr('');
    const base = grupo === 'tabs' ? permisoTabs(u) : grupo === 'edita' ? permisoEdita(u) : permisoAcciones(u);
    const nuevo = {
      ...base,
      [clave]: valor
    };
    try {
      await db.collection('usuarios').doc(u.id).update({
        ['permisos.' + grupo]: nuevo
      });
    } catch (e) {
      setErr('Error al guardar: ' + e.message);
    }
    setGuardando('');
  };
  if (currentUser.role !== 'admin') {
    return React.createElement("div", {
      style: {
        padding: '30px 16px',
        textAlign: 'center',
        color: 'var(--ink-faint)',
        fontSize: 13
      }
    }, "Solo un administrador puede gestionar permisos.");
  }
  return React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 14,
      lineHeight: 1.5
    }
  }, "Concede o retira, por persona, el acceso de lectura a cada pantalla y el permiso para crear o editar en cada formulario. En el repartidor, las capacidades operativas permanecen habilitadas; Productos, Inventario, Reportes y la exportación CSV están bloqueados. Los administradores siempre tienen acceso completo y no aparecen en esta lista."), err && React.createElement("div", {
    style: {
      background: 'var(--danger-bg)',
      borderRadius: 4,
      padding: '8px 12px',
      fontSize: 12,
      color: 'var(--danger-text)',
      marginBottom: 12
    }
  }, err), users === null && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: 'var(--ink-faint)',
      fontSize: 13,
      padding: '20px 0'
    }
  }, "Cargando…"), users && users.length === 0 && React.createElement("div", {
    style: {
      textAlign: 'center',
      color: 'var(--ink-faint)',
      fontSize: 13,
      padding: '20px 0'
    }
  }, "No hay otros usuarios registrados"), users && users.map(u => {
    const tabs = permisoTabs(u);
    const edita = permisoEdita(u);
    const acciones = permisoAcciones(u);
    const open = abierto === u.id;
    return React.createElement(Card, {
      key: u.id,
      style: {
        padding: 0,
        overflow: 'hidden'
      }
    }, React.createElement("button", {
      onClick: () => setAbierto(open ? null : u.id),
      style: {
        width: '100%',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }
    }, React.createElement(Row, {
      style: {
        gap: 10
      }
    }, React.createElement("div", {
      style: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--surface-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 700,
        flexShrink: 0
      }
    }, (u.nombre || '?')[0].toUpperCase()), React.createElement("div", {
      style: {
        textAlign: 'left'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700
      }
    }, u.nombre), React.createElement(Tag, {
      color: u.role === 'repartidor' ? 'var(--warn-text)' : 'var(--info-text)',
      style: {
        marginTop: 2
      }
    }, u.role))), React.createElement("span", {
      style: {
        color: 'var(--ink-faint)',
        display: 'flex'
      }
    }, open ? React.createElement(CUp, null) : React.createElement(CDown, null))), open && React.createElement("div", {
      style: {
        padding: '0 14px 14px'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--ink-faint)',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        margin: '8px 0 6px'
      }
    }, "Ver pantalla"), TABS_INFO.map(([id, ico, lbl]) => React.createElement(Row, {
      key: id,
      style: {
        justifyContent: 'space-between',
        padding: '7px 0',
        borderBottom: '1px solid var(--line)'
      }
    }, React.createElement(Row, {
      style: {
        gap: 8
      }
    }, React.createElement("span", null, ico), React.createElement("span", {
      style: {
        fontSize: 13
      }
    }, lbl)), React.createElement(Toggle, {
      checked: !!tabs[id],
      disabled: guardando === u.id + 'tabs' + id || u.role === 'repartidor',
      onChange: v => cambiar(u, 'tabs', id, v)
    }))), React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--ink-faint)',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        margin: '14px 0 6px'
      }
    }, "Editar formulario"), EDICION_INFO.map(([id, ico, lbl]) => React.createElement(Row, {
      key: id,
      style: {
        justifyContent: 'space-between',
        padding: '7px 0',
        borderBottom: '1px solid var(--line)'
      }
    }, React.createElement(Row, {
      style: {
        gap: 8
      }
    }, React.createElement("span", null, ico), React.createElement("span", {
      style: {
        fontSize: 13
      }
    }, lbl)), React.createElement(Toggle, {
      checked: !!edita[id],
      disabled: guardando === u.id + 'edita' + id || u.role === 'repartidor',
      onChange: v => cambiar(u, 'edita', id, v)
    }))), React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--ink-faint)',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        margin: '14px 0 6px'
      }
    }, "Otras acciones"), ACCIONES_INFO.map(([id, ico, lbl]) => React.createElement(Row, {
      key: id,
      style: {
        justifyContent: 'space-between',
        padding: '7px 0',
        borderBottom: '1px solid var(--line)'
      }
    }, React.createElement(Row, {
      style: {
        gap: 8
      }
    }, React.createElement("span", null, ico), React.createElement("span", {
      style: {
        fontSize: 13
      }
    }, lbl)), React.createElement(Toggle, {
      checked: !!acciones[id],
      disabled: guardando === u.id + 'acciones' + id || (u.role === 'repartidor' && id === 'csv'),
      onChange: v => cambiar(u, 'acciones', id, v)
    })))));
  }), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginTop: 10,
      lineHeight: 1.5
    }
  }, "\"Ver pantalla\" y \"Editar formulario\" están reflejados también en ", React.createElement("code", null, "firestore.rules"), " — Firestore los hace cumplir aunque alguien intente saltarse la app. \"Otras acciones\" (cámara, CSV, contraseña) son permisos de la interfaz/del dispositivo, no de Firestore: no hay nada que una regla de base de datos pueda restringir ahí, así que dependen de que la app los respete."));
}