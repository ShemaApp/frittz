/* ── Gestión de permisos ──
   Pantalla exclusiva de admin. Permite conceder o retirar, por persona,
   el acceso de lectura a cada pestaña y el permiso de edición en cada
   formulario. Los cambios se guardan en usuarios/{uid}.permisos y los
   consumen permisoTabs()/permisoEdita() (ver app-core.js) en app.js y en
   cada pantalla individual. */
function Permisos({currentUser}){
  const [users,setUsers]=useState(null);
  const [abierto,setAbierto]=useState(null);
  const [guardando,setGuardando]=useState('');
  const [err,setErr]=useState('');

  useEffect(()=>{
    const unsub=db.collection('usuarios').onSnapshot(
      snap=>setUsers(snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.id!==currentUser.uid)),
      ()=>setErr('No se pudo cargar la lista de usuarios.')
    );
    return unsub;
  },[]);

  const cambiar=async(u,grupo,clave,valor)=>{
    const key=u.id+grupo+clave;
    setGuardando(key); setErr('');
    const base=grupo==='tabs'?permisoTabs(u):grupo==='edita'?permisoEdita(u):permisoAcciones(u);
    const nuevo={...base,[clave]:valor};
    try{
      await db.collection('usuarios').doc(u.id).update({['permisos.'+grupo]:nuevo});
    }catch(e){ setErr('Error al guardar: '+e.message); }
    setGuardando('');
  };

  if(currentUser.role!=='admin'){
    return <div style={{padding:'30px 16px',textAlign:'center',color:'var(--ink-faint)',fontSize:13}}>Solo un administrador puede gestionar permisos.</div>;
  }

  return <div>
    <div style={{fontSize:11,color:'var(--ink-faint)',marginBottom:14,lineHeight:1.5}}>
      Concede o retira, por persona, el acceso de lectura a cada pantalla y el permiso para crear o editar en cada formulario. Los administradores siempre tienen acceso completo y no aparecen en esta lista.
    </div>
    {err&&<div style={{background:'var(--danger-bg)',borderRadius:4,padding:'8px 12px',fontSize:12,color:'var(--danger-text)',marginBottom:12}}>{err}</div>}
    {users===null&&<div style={{textAlign:'center',color:'var(--ink-faint)',fontSize:13,padding:'20px 0'}}>Cargando…</div>}
    {users&&users.length===0&&<div style={{textAlign:'center',color:'var(--ink-faint)',fontSize:13,padding:'20px 0'}}>No hay otros usuarios registrados</div>}
    {users&&users.map(u=>{
      const tabs=permisoTabs(u);
      const edita=permisoEdita(u);
      const acciones=permisoAcciones(u);
      const open=abierto===u.id;
      return <Card key={u.id} style={{padding:0,overflow:'hidden'}}>
        <button onClick={()=>setAbierto(open?null:u.id)} style={{width:'100%',background:'none',border:'none',cursor:'pointer',padding:'12px 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <Row style={{gap:10}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:'var(--surface-2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,flexShrink:0}}>{(u.nombre||'?')[0].toUpperCase()}</div>
            <div style={{textAlign:'left'}}>
              <div style={{fontSize:13,fontWeight:700}}>{u.nombre}</div>
              <Tag color={u.role==='repartidor'?'var(--warn-text)':'var(--info-text)'} style={{marginTop:2}}>{u.role}</Tag>
            </div>
          </Row>
          <span style={{color:'var(--ink-faint)',display:'flex'}}>{open?<CUp/>:<CDown/>}</span>
        </button>
        {open&&<div style={{padding:'0 14px 14px'}}>
          <div style={{fontSize:10,color:'var(--ink-faint)',textTransform:'uppercase',letterSpacing:'.06em',fontFamily:'var(--font-mono)',fontWeight:600,margin:'8px 0 6px'}}>Ver pantalla</div>
          {TABS_INFO.map(([id,ico,lbl])=>(
            <Row key={id} style={{justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--line)'}}>
              <Row style={{gap:8}}><span>{ico}</span><span style={{fontSize:13}}>{lbl}</span></Row>
              <Toggle checked={!!tabs[id]} disabled={guardando===u.id+'tabs'+id} onChange={v=>cambiar(u,'tabs',id,v)}/>
            </Row>
          ))}
          <div style={{fontSize:10,color:'var(--ink-faint)',textTransform:'uppercase',letterSpacing:'.06em',fontFamily:'var(--font-mono)',fontWeight:600,margin:'14px 0 6px'}}>Editar formulario</div>
          {EDICION_INFO.map(([id,ico,lbl])=>(
            <Row key={id} style={{justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--line)'}}>
              <Row style={{gap:8}}><span>{ico}</span><span style={{fontSize:13}}>{lbl}</span></Row>
              <Toggle checked={!!edita[id]} disabled={guardando===u.id+'edita'+id} onChange={v=>cambiar(u,'edita',id,v)}/>
            </Row>
          ))}
          <div style={{fontSize:10,color:'var(--ink-faint)',textTransform:'uppercase',letterSpacing:'.06em',fontFamily:'var(--font-mono)',fontWeight:600,margin:'14px 0 6px'}}>Otras acciones</div>
          {ACCIONES_INFO.map(([id,ico,lbl])=>(
            <Row key={id} style={{justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--line)'}}>
              <Row style={{gap:8}}><span>{ico}</span><span style={{fontSize:13}}>{lbl}</span></Row>
              <Toggle checked={!!acciones[id]} disabled={guardando===u.id+'acciones'+id} onChange={v=>cambiar(u,'acciones',id,v)}/>
            </Row>
          ))}
        </div>}
      </Card>;
    })}
    <div style={{fontSize:11,color:'var(--ink-faint)',marginTop:10,lineHeight:1.5}}>
      "Ver pantalla" y "Editar formulario" están reflejados también en <code>firestore.rules</code> — Firestore los hace cumplir aunque alguien intente saltarse la app. "Otras acciones" (cámara, CSV, contraseña) son permisos de la interfaz/del dispositivo, no de Firestore: no hay nada que una regla de base de datos pueda restringir ahí, así que dependen de que la app los respete.
    </div>
  </div>;
}
