function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    const emailTrim = email.trim(),
      pwTrim = pw.trim();
    if (!emailTrim || !pwTrim) {
      setErr('Ingresa tu correo y contraseña');
      return;
    }
    setErr('');
    setLoading(true);
    try {
      await auth.signInWithEmailAndPassword(emailTrim, pwTrim);
    } catch (e) {
      const map = {
        'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).',
        'auth/operation-not-allowed': 'El método de correo/contraseña no está activado en Firebase (Authentication → Sign-in method).',
        'auth/user-not-found': 'No existe ningún usuario con ese correo en Firebase Authentication.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/invalid-email': 'El formato del correo no es válido.',
        'auth/invalid-credential': 'Correo o contraseña incorrectos, o el usuario no existe.',
        'auth/too-many-requests': 'Demasiados intentos fallidos. Espera un momento e inténtalo de nuevo.',
        'auth/network-request-failed': 'Sin conexión con Firebase. Revisa tu internet.',
        'auth/api-key-not-valid': 'La API key de Firebase no es válida.'
      };
      setErr((map[e.code] || e.message || 'Error desconocido') + ' [' + (e.code || 'sin código') + ']');
    }
    setLoading(false);
  };
  return React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      background: 'var(--bg)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 44,
      marginBottom: 6
    }
  }, "🚚"), React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      marginBottom: 2,
      fontFamily: 'var(--font-display)',
      textTransform: 'uppercase',
      letterSpacing: '.02em'
    }
  }, "Productos de la Costa"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-faint)',
      marginBottom: 36,
      fontFamily: 'var(--font-mono)',
      textTransform: 'uppercase',
      letterSpacing: '.08em'
    }
  }, "Panel de administración"), React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 340,
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderTop: '4px solid var(--accent)',
      borderRadius: 4,
      padding: 24
    }
  }, React.createElement(Lbl, null, "Correo electrónico"), React.createElement(Inp, {
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value),
    placeholder: "correo@ejemplo.com",
    style: {
      marginBottom: 12
    },
    autoComplete: "username"
  }), React.createElement(Lbl, null, "Contraseña"), React.createElement(PwInp, {
    value: pw,
    onChange: e => setPw(e.target.value)
  }), err && React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--danger-text)',
      marginBottom: 10,
      textAlign: 'center'
    }
  }, err), React.createElement(BFill, {
    onClick: handle,
    disabled: loading,
    style: {
      width: '100%',
      fontSize: 14,
      padding: 12,
      marginTop: 4,
      opacity: loading ? 0.6 : 1
    }
  }, loading ? 'Ingresando…' : 'Iniciar sesión →')));
}
function PinPad({
  len = 4,
  onComplete,
  value,
  onChange
}) {
  const press = d => {
    if (value.length < len) onChange(value + d);
  };
  const del = () => onChange(value.slice(0, -1));
  useEffect(() => {
    if (value.length === len) onComplete(value);
  }, [value]);
  return React.createElement(React.Fragment, null, React.createElement(Row, {
    style: {
      gap: 10,
      marginBottom: 22,
      justifyContent: 'center'
    }
  }, Array.from({
    length: len
  }).map((_, i) => React.createElement("div", {
    key: i,
    style: {
      width: 14,
      height: 14,
      borderRadius: '50%',
      border: '1.5px solid var(--line-strong)',
      background: i < value.length ? 'var(--accent)' : 'transparent'
    }
  }))), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,64px)',
      gap: 12,
      justifyContent: 'center'
    }
  }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => k === '' ? React.createElement("div", {
    key: i
  }) : React.createElement("button", {
    key: i,
    onClick: () => k === '⌫' ? del() : press(k),
    style: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      border: '1px solid var(--line)',
      background: 'var(--surface)',
      fontSize: 20,
      fontFamily: 'var(--font-mono)',
      fontWeight: 600,
      color: 'var(--ink)',
      cursor: 'pointer'
    }
  }, k))));
}
function PinLock({
  currentUser,
  onUnlock,
  onUsePassword
}) {
  const [digits, setDigits] = useState('');
  const [err, setErr] = useState('');
  const stored = JSON.parse(localStorage.getItem(pinKey(currentUser.uid)) || 'null');
  useEffect(() => {
    if (!stored) onUnlock();
  }, []);
  if (!stored) return null;
  const check = async pin => {
    const h = await hashPin(pin, stored.salt);
    if (h === stored.hash) onUnlock();else {
      setErr('PIN incorrecto');
      setDigits('');
    }
  };
  return React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      background: 'var(--bg)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 36,
      marginBottom: 6
    }
  }, "🔒"), React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      marginBottom: 2
    }
  }, "Hola, ", currentUser.nombre.split(' ')[0]), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 22,
      fontFamily: 'var(--font-mono)',
      textTransform: 'uppercase',
      letterSpacing: '.08em'
    }
  }, "Ingresa tu PIN"), React.createElement(PinPad, {
    len: stored.len,
    value: digits,
    onChange: setDigits,
    onComplete: check
  }), err && React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--danger-text)',
      marginTop: 14
    }
  }, err), React.createElement("button", {
    onClick: onUsePassword,
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--info-text)',
      fontSize: 12,
      cursor: 'pointer',
      textDecoration: 'underline',
      marginTop: 22
    }
  }, "Usar contraseña en su lugar"));
}