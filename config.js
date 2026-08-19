function Configuracion({
  currentUser,
  onBack,
  onLogout,
  abrirUsuarios,
  onAbrirUsuariosConsumido,
  abrirPrivacidad,
  onAbrirPrivacidadConsumido
}) {
  const [sub, setSub] = useState('perfil');
  const [users, setUsersList] = useState([]);
  const [form, setForm] = useState(null);
  const [pw, setPw] = useState({
    old: '',
    new_: '',
    conf: ''
  });
  const [pinStep, setPinStep] = useState('idle');
  const [pinTmp, setPinTmp] = useState('');
  const [pinDigits, setPinDigits] = useState('');
  const hasPin = !!localStorage.getItem(pinKey(currentUser.uid));
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
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
  const onUserTap = id => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (expandedId === id) setExpandedId(null);
  };
  const isAdmin = currentUser.role === 'admin';
  const roleColor = r => r === 'admin' ? 'var(--admin)' : r === 'repartidor' ? 'var(--warn-text)' : 'var(--info-text)';
  const flash = (m, isErr = false) => {
    isErr ? setErr(m) : setMsg(m);
    setTimeout(() => {
      setErr('');
      setMsg('');
    }, 4000);
  };
  useEffect(() => {
    if (abrirUsuarios && isAdmin) {
      setSub('usuarios');
      setForm({
        nombre: '',
        email: '',
        password: '',
        role: 'usuario'
      });
      onAbrirUsuariosConsumido && onAbrirUsuariosConsumido();
    }
  }, [abrirUsuarios]);
  useEffect(() => {
    if (!abrirPrivacidad) return;
    setSub('privacidad');
    onAbrirPrivacidadConsumido && onAbrirPrivacidadConsumido();
  }, [abrirPrivacidad]);
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = db.collection('usuarios').onSnapshot(snap => {
      setUsersList(snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
    });
    return unsub;
  }, [isAdmin]);
  const changePw = async () => {
    if (pw.new_.length < 6) {
      flash('Mínimo 6 caracteres', true);
      return;
    }
    if (pw.new_ !== pw.conf) {
      flash('Las contraseñas no coinciden', true);
      return;
    }
    try {
      const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw.old);
      await auth.currentUser.reauthenticateWithCredential(cred);
      await auth.currentUser.updatePassword(pw.new_);
      setPw({
        old: '',
        new_: '',
        conf: ''
      });
      flash('✅ Contraseña actualizada');
    } catch (e) {
      flash('Contraseña actual incorrecta', true);
    }
  };
  const saveUser = async () => {
    if (!form.nombre || !form.email || !form.id && !form.password) {
      flash('Completa todos los campos', true);
      return;
    }
    try {
      if (form.id) {
        await db.collection('usuarios').doc(form.id).update({
          nombre: form.nombre,
          role: form.role
        });
        flash('✅ Usuario actualizado');
      } else {
        if (form.password.length < 6) {
          flash('La contraseña debe tener mínimo 6 caracteres', true);
          return;
        }
        const secondary = firebase.apps.find(a => a.name === 'Secondary') || firebase.initializeApp(firebaseConfig, 'Secondary');
        const secAuth = secondary.auth();
        const cred = await secAuth.createUserWithEmailAndPassword(form.email.trim(), form.password);
        await db.collection('usuarios').doc(cred.user.uid).set({
          nombre: form.nombre,
          email: form.email.trim(),
          role: form.role
        });
        await secAuth.signOut();
        flash('✅ Usuario creado');
      }
      setForm(null);
    } catch (e) {
      flash('Error: ' + e.message, true);
    }
  };
  const delUser = async u => {
    if (u.id === currentUser.uid) {
      flash('No puedes eliminarte', true);
      return;
    }
    await db.collection('usuarios').doc(u.id).delete();
    flash('Perfil eliminado. Borra también la cuenta en Firebase Console → Authentication.');
  };
  const startPin = () => {
    setPinStep('new1');
    setPinDigits('');
    setPinTmp('');
  };
  const onPinComplete = async val => {
    if (pinStep === 'new1') {
      setPinTmp(val);
      setPinDigits('');
      setPinStep('new2');
    } else {
      if (val !== pinTmp) {
        flash('Los PIN no coinciden', true);
        setPinStep('idle');
        setPinDigits('');
        return;
      }
      await savePin(currentUser.uid, val);
      flash('✅ PIN configurado');
      setPinStep('idle');
      setPinDigits('');
    }
  };
  const removePin = () => {
    clearPin(currentUser.uid);
    flash('PIN eliminado de este dispositivo');
  };
  return React.createElement("div", {
    style: {
      padding: '16px 12px'
    }
  }, React.createElement(Row, {
    style: {
      marginBottom: 16
    }
  }, React.createElement("button", {
    onClick: onBack,
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--ink-soft)',
      cursor: 'pointer',
      fontSize: 22,
      padding: '0 4px 0 0',
      lineHeight: 1
    }
  }, "←"), React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800
    }
  }, "⚙️ Configuración")), msg && React.createElement("div", {
    style: {
      background: 'var(--ok-bg)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      color: 'var(--ok-text)',
      marginBottom: 12
    }
  }, msg), err && React.createElement("div", {
    style: {
      background: 'var(--danger-bg)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      color: 'var(--danger-text)',
      marginBottom: 12
    }
  }, err), React.createElement(Row, {
    style: {
      gap: 6,
      marginBottom: 16,
      flexWrap: 'wrap'
    }
  }, [['perfil', '👤 Perfil'], ...(permisoAcciones(currentUser).password ? [['password', '🔑 Contraseña']] : []), ['pin', '🔒 PIN'], ['privacidad', '🛡️ Privacidad'], ...(isAdmin ? [['usuarios', '👥 Usuarios'], ['permisos', '🔐 Permisos']] : [])].map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => {
      setSub(v);
      setErr('');
      setMsg('');
    },
    style: {
      flex: '1 1 72px',
      padding: '8px 2px',
      borderRadius: 8,
      border: 'none',
      background: sub === v ? 'var(--accent)' : 'var(--surface-2)',
      color: sub === v ? 'var(--ink)' : 'var(--ink-soft)',
      fontSize: 10,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), sub === 'perfil' && React.createElement(React.Fragment, null, React.createElement(Card, null, React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '12px 0 16px'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 52,
      marginBottom: 8
    }
  }, "👤"), React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 700
    }
  }, currentUser.nombre), React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-soft)',
      marginTop: 2
    }
  }, "✉️ ", currentUser.email), React.createElement(Tag, {
    color: roleColor(currentUser.role),
    style: {
      marginTop: 8,
      display: 'inline-block'
    }
  }, currentUser.role))), React.createElement(BOut, {
    onClick: onLogout,
    color: "var(--danger-text)",
    style: {
      width: '100%',
      marginTop: 8
    }
  }, "🚪 Cerrar sesión")), sub === 'password' && React.createElement(Card, null, React.createElement(Lbl, null, "Contraseña actual"), React.createElement(PwInp, {
    value: pw.old,
    onChange: e => setPw(f => ({
      ...f,
      old: e.target.value
    }))
  }), React.createElement(Lbl, null, "Nueva contraseña"), React.createElement(PwInp, {
    value: pw.new_,
    onChange: e => setPw(f => ({
      ...f,
      new_: e.target.value
    }))
  }), React.createElement(Lbl, null, "Confirmar"), React.createElement(PwInp, {
    value: pw.conf,
    onChange: e => setPw(f => ({
      ...f,
      conf: e.target.value
    }))
  }), React.createElement(BFill, {
    onClick: changePw,
    style: {
      width: '100%',
      marginTop: 6
    }
  }, "🔑 Actualizar contraseña")), sub === 'pin' && React.createElement(Card, null, React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-soft)',
      marginBottom: 16,
      lineHeight: 1.4
    }
  }, "El PIN es un candado local de este dispositivo: agiliza volver a entrar sin escribir tu contraseña cada vez. No la reemplaza ni se guarda en Firebase."), pinStep === 'idle' ? React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 12
    }
  }, hasPin ? '🔒 PIN activado en este dispositivo' : 'Sin PIN configurado en este dispositivo'), React.createElement(BFill, {
    onClick: startPin,
    style: {
      width: '100%'
    }
  }, hasPin ? 'Cambiar PIN' : 'Configurar PIN'), hasPin && React.createElement(BOut, {
    onClick: removePin,
    color: "var(--danger-text)",
    style: {
      width: '100%',
      marginTop: 8
    }
  }, "Quitar PIN")) : React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 16,
      fontFamily: 'var(--font-mono)',
      textTransform: 'uppercase',
      letterSpacing: '.06em'
    }
  }, pinStep === 'new1' ? 'Elige un PIN de 4 dígitos' : 'Confírmalo'), React.createElement(PinPad, {
    len: 4,
    value: pinDigits,
    onChange: setPinDigits,
    onComplete: onPinComplete
  }), React.createElement("button", {
    onClick: () => {
      setPinStep('idle');
      setPinDigits('');
    },
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--ink-soft)',
      fontSize: 12,
      cursor: 'pointer',
      marginTop: 18
    }
  }, "Cancelar"))), sub === 'privacidad' && React.createElement(Card, null, React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      marginBottom: 6
    }
  }, "🛡️ Privacidad y uso seguro"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)',
      lineHeight: 1.45,
      marginBottom: 14
    }
  }, "Consulta los documentos de uso abierto. Se abren en otra pestaña para conservar tu sesión y el trabajo que llevas en Frittz."), React.createElement("a", {
    href: 'privacidad.html',
    target: '_blank',
    rel: 'noopener noreferrer',
    style: {
      display: 'block',
      padding: '11px 12px',
      marginBottom: 8,
      border: '1px solid var(--line)',
      borderRadius: 8,
      color: 'var(--ink)',
      background: 'var(--surface-2)',
      textDecoration: 'none',
      fontSize: 13,
      fontWeight: 700
    }
  }, "📄 Abrir aviso de privacidad"), React.createElement("a", {
    href: 'confidencialidad-movil.html',
    target: '_blank',
    rel: 'noopener noreferrer',
    style: {
      display: 'block',
      padding: '11px 12px',
      border: '1px solid var(--line)',
      borderRadius: 8,
      color: 'var(--ink)',
      background: 'var(--surface-2)',
      textDecoration: 'none',
      fontSize: 13,
      fontWeight: 700
    }
  }, "📱 Abrir uso confidencial del equipo móvil")), sub === 'usuarios' && isAdmin && React.createElement(React.Fragment, null, React.createElement(Row, {
    style: {
      justifyContent: 'flex-end',
      marginBottom: 10
    }
  }, React.createElement(BFill, {
    onClick: () => setForm({
      nombre: '',
      email: '',
      password: '',
      role: 'usuario'
    })
  }, "+ Nuevo usuario")), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 10
    }
  }, "Mantén presionado un usuario para editarlo o eliminarlo."), users.map(u => {
    const expanded = expandedId === u.id;
    return React.createElement(Card, {
      key: u.id,
      style: {
        padding: 0,
        overflow: 'hidden'
      }
    }, React.createElement("div", {
      onMouseDown: () => startPress(u.id),
      onMouseUp: cancelPress,
      onMouseLeave: cancelPress,
      onTouchStart: () => startPress(u.id),
      onTouchEnd: cancelPress,
      onTouchMove: cancelPress,
      onClick: () => onUserTap(u.id),
      style: {
        padding: '12px 14px',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent'
      }
    }, React.createElement(Row, {
      style: {
        justifyContent: 'space-between'
      }
    }, React.createElement("div", null, React.createElement(Row, {
      style: {
        gap: 6,
        flexWrap: 'wrap'
      }
    }, React.createElement("span", {
      style: {
        fontWeight: 700,
        fontSize: 14
      }
    }, u.nombre), React.createElement(Tag, {
      color: roleColor(u.role)
    }, u.role), u.id === currentUser.uid && React.createElement(Tag, {
      color: "var(--ok-text)"
    }, "Tú")), React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-soft)',
        marginTop: 2
      }
    }, "✉️ ", u.email)))), React.createElement("div", {
      style: {
        maxHeight: expanded ? 80 : 0,
        overflow: 'hidden',
        transition: 'max-height .2s ease'
      }
    }, React.createElement(Row, {
      style: {
        gap: 8,
        padding: '0 14px 12px'
      }
    }, React.createElement(BOut, {
      onClick: () => {
        setForm({
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          role: u.role
        });
        setExpandedId(null);
      },
      style: {
        flex: 1
      }
    }, "✏️ Editar"), u.id !== currentUser.uid && React.createElement(BOut, {
      onClick: () => {
        if (window.confirm(`¿Eliminar el perfil de "${u.nombre}"? Esta acción no se puede deshacer.`)) {
          delUser(u);
        }
        setExpandedId(null);
      },
      color: "var(--danger-text)",
      style: {
        flex: 1
      }
    }, "🗑 Eliminar"))));
  })), sub === 'permisos' && isAdmin && React.createElement(Permisos, {
    currentUser: currentUser
  }), form && React.createElement(Modal, {
    title: form.id ? 'Editar Usuario' : 'Nuevo Usuario',
    onClose: () => {
      setForm(null);
      setErr('');
    }
  }, React.createElement(Lbl, null, "Nombre completo"), React.createElement(Inp, {
    value: form.nombre,
    onChange: e => setForm(f => ({
      ...f,
      nombre: e.target.value
    })),
    style: {
      marginBottom: 10
    }
  }), React.createElement(Lbl, null, "Correo electrónico"), React.createElement(Inp, {
    type: "email",
    value: form.email,
    disabled: !!form.id,
    onChange: e => setForm(f => ({
      ...f,
      email: e.target.value
    })),
    placeholder: "correo@ejemplo.com",
    style: {
      marginBottom: 10,
      opacity: form.id ? 0.6 : 1
    }
  }), !form.id && React.createElement(React.Fragment, null, React.createElement(Lbl, null, "Contraseña"), React.createElement(PwInp, {
    value: form.password,
    onChange: e => setForm(f => ({
      ...f,
      password: e.target.value
    }))
  })), React.createElement(Lbl, null, "Rol"), React.createElement("select", {
    value: form.role,
    onChange: e => setForm(f => ({
      ...f,
      role: e.target.value
    })),
    style: {
      background: 'var(--surface-2)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: '8px 10px',
      color: 'var(--ink)',
      fontSize: 13,
      width: '100%',
      marginBottom: 16
    }
  }, React.createElement("option", {
    value: "usuario"
  }, "usuario"), React.createElement("option", {
    value: "repartidor"
  }, "repartidor"), React.createElement("option", {
    value: "admin"
  }, "admin")), form.id && React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 12
    }
  }, "El correo y la contraseña solo los puede cambiar el propio usuario desde su pestaña de Contraseña."), React.createElement(BFill, {
    onClick: saveUser,
    style: {
      width: '100%'
    }
  }, "💾 Guardar")));
}
