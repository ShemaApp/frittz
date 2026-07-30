/* ── Configuración ── */
function Configuracion({currentUser,onBack,onLogout,abrirUsuarios,onAbrirUsuariosConsumido}){
  const [sub,setSub]=useState('perfil');
  const [users,setUsersList]=useState([]);
  const [form,setForm]=useState(null);
  const [pw,setPw]=useState({old:'',new_:'',conf:''});
  const [pinStep,setPinStep]=useState('idle'); // idle | new1 | new2
  const [pinTmp,setPinTmp]=useState('');
  const [pinDigits,setPinDigits]=useState('');
  const hasPin=!!localStorage.getItem(pinKey(currentUser.uid));
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');
  const isAdmin=currentUser.role==='admin';
  const roleColor=r=>r==='admin'?'var(--admin)':r==='repartidor'?'var(--warn-text)':'var(--info-text)';
  const flash=(m,isErr=false)=>{ isErr?setErr(m):setMsg(m); setTimeout(()=>{setErr('');setMsg('');},4000); };

  useEffect(()=>{
    if(abrirUsuarios&&isAdmin){
      setSub('usuarios'); setForm({nombre:'',email:'',password:'',role:'usuario'});
      onAbrirUsuariosConsumido&&onAbrirUsuariosConsumido();
    }
  },[abrirUsuarios]);

  useEffect(()=>{
    if(!isAdmin) return;
    const unsub=db.collection('usuarios').onSnapshot(snap=>{
      setUsersList(snap.docs.map(d=>({id:d.id,...d.data()})));
    });
    return unsub;
  },[isAdmin]);

  const changePw=async()=>{
    if(pw.new_.length<6){flash('Mínimo 6 caracteres',true);return;}
    if(pw.new_!==pw.conf){flash('Las contraseñas no coinciden',true);return;}
    try{
      const cred=firebase.auth.EmailAuthProvider.credential(currentUser.email,pw.old);
      await auth.currentUser.reauthenticateWithCredential(cred);
      await auth.currentUser.updatePassword(pw.new_);
      setPw({old:'',new_:'',conf:''}); flash('✅ Contraseña actualizada');
    }catch(e){ flash('Contraseña actual incorrecta',true); }
  };

  const saveUser=async()=>{
    if(!form.nombre||!form.email||(!form.id&&!form.password)){flash('Completa todos los campos',true);return;}
    try{
      if(form.id){
        await db.collection('usuarios').doc(form.id).update({nombre:form.nombre,role:form.role});
        flash('✅ Usuario actualizado');
      }else{
        if(form.password.length<6){flash('La contraseña debe tener mínimo 6 caracteres',true);return;}
        const secondary=firebase.apps.find(a=>a.name==='Secondary')||firebase.initializeApp(firebaseConfig,'Secondary');
        const secAuth=secondary.auth();
        const cred=await secAuth.createUserWithEmailAndPassword(form.email.trim(),form.password);
        await db.collection('usuarios').doc(cred.user.uid).set({nombre:form.nombre,email:form.email.trim(),role:form.role});
        await secAuth.signOut();
        flash('✅ Usuario creado');
      }
      setForm(null);
    }catch(e){ flash('Error: '+e.message,true); }
  };

  const delUser=async(u)=>{
    if(u.id===currentUser.uid){flash('No puedes eliminarte',true);return;}
    await db.collection('usuarios').doc(u.id).delete();
    flash('Perfil eliminado. Borra también la cuenta en Firebase Console → Authentication.');
  };

  const startPin=()=>{ setPinStep('new1'); setPinDigits(''); setPinTmp(''); };
  const onPinComplete=async val=>{
    if(pinStep==='new1'){ setPinTmp(val); setPinDigits(''); setPinStep('new2'); }
    else{
      if(val!==pinTmp){ flash('Los PIN no coinciden',true); setPinStep('idle'); setPinDigits(''); return; }
      await savePin(currentUser.uid,val);
      flash('✅ PIN configurado'); setPinStep('idle'); setPinDigits('');
    }
  };
  const removePin=()=>{ clearPin(currentUser.uid); flash('PIN eliminado de este dispositivo'); };

  return <div style={{padding:'16px 12px'}}>
    <Row style={{marginBottom:16}}>
      <button onClick={onBack} style={{background:'none',border:'none',color:'var(--ink-soft)',cursor:'pointer',fontSize:22,padding:'0 4px 0 0',lineHeight:1}}>←</button>
      <div style={{fontSize:20,fontWeight:800}}>⚙️ Configuración</div>
    </Row>
    {msg&&<div style={{background:'var(--ok-bg)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--ok-text)',marginBottom:12}}>{msg}</div>}
    {err&&<div style={{background:'var(--danger-bg)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--danger-text)',marginBottom:12}}>{err}</div>}
    <Row style={{gap:6,marginBottom:16}}>
      {[['perfil','👤 Perfil'],['password','🔑 Contraseña'],['pin','🔒 PIN'],...(isAdmin?[['usuarios','👥 Usuarios']]:[])].map(([v,l])=>(
        <button key={v} onClick={()=>{setSub(v);setErr('');setMsg('');}} style={{flex:1,padding:'8px 2px',borderRadius:8,border:'none',background:sub===v?'var(--accent)':'var(--surface-2)',color:sub===v?'var(--ink)':'var(--ink-soft)',fontSize:11,fontWeight:700,cursor:'pointer'}}>{l}</button>
      ))}
    </Row>
    {sub==='perfil'&&<>
      <Card>
        <div style={{textAlign:'center',padding:'12px 0 16px'}}>
          <div style={{fontSize:52,marginBottom:8}}>👤</div>
          <div style={{fontSize:18,fontWeight:700}}>{currentUser.nombre}</div>
          <div style={{fontSize:13,color:'var(--ink-soft)',marginTop:2}}>✉️ {currentUser.email}</div>
          <Tag color={roleColor(currentUser.role)} style={{marginTop:8,display:'inline-block'}}>{currentUser.role}</Tag>
        </div>
      </Card>
      <BOut onClick={onLogout} color="var(--danger-text)" style={{width:'100%',marginTop:8}}>🚪 Cerrar sesión</BOut>
    </>}
    {sub==='password'&&<Card>
      <Lbl>Contraseña actual</Lbl><PwInp value={pw.old} onChange={e=>setPw(f=>({...f,old:e.target.value}))}/>
      <Lbl>Nueva contraseña</Lbl><PwInp value={pw.new_} onChange={e=>setPw(f=>({...f,new_:e.target.value}))}/>
      <Lbl>Confirmar</Lbl><PwInp value={pw.conf} onChange={e=>setPw(f=>({...f,conf:e.target.value}))}/>
      <BFill onClick={changePw} style={{width:'100%',marginTop:6}}>🔑 Actualizar contraseña</BFill>
    </Card>}
    {sub==='pin'&&<Card>
      <div style={{fontSize:13,color:'var(--ink-soft)',marginBottom:16,lineHeight:1.4}}>El PIN es un candado local de este dispositivo: agiliza volver a entrar sin escribir tu contraseña cada vez. No la reemplaza ni se guarda en Firebase.</div>
      {pinStep==='idle'?<>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{hasPin?'🔒 PIN activado en este dispositivo':'Sin PIN configurado en este dispositivo'}</div>
        <BFill onClick={startPin} style={{width:'100%'}}>{hasPin?'Cambiar PIN':'Configurar PIN'}</BFill>
        {hasPin&&<BOut onClick={removePin} color="var(--danger-text)" style={{width:'100%',marginTop:8}}>Quitar PIN</BOut>}
      </>:<div style={{textAlign:'center'}}>
        <div style={{fontSize:11,color:'var(--ink-faint)',marginBottom:16,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'.06em'}}>{pinStep==='new1'?'Elige un PIN de 4 dígitos':'Confírmalo'}</div>
        <PinPad len={4} value={pinDigits} onChange={setPinDigits} onComplete={onPinComplete}/>
        <button onClick={()=>{setPinStep('idle');setPinDigits('');}} style={{background:'none',border:'none',color:'var(--ink-soft)',fontSize:12,cursor:'pointer',marginTop:18}}>Cancelar</button>
      </div>}
    </Card>}
    {sub==='usuarios'&&isAdmin&&<>
      <Row style={{justifyContent:'flex-end',marginBottom:10}}>
        <BFill onClick={()=>setForm({nombre:'',email:'',password:'',role:'usuario'})}>+ Nuevo usuario</BFill>
      </Row>
      {users.map(u=><Card key={u.id}>
        <Row style={{justifyContent:'space-between'}}>
          <div>
            <Row style={{gap:6,flexWrap:'wrap'}}>
              <span style={{fontWeight:700,fontSize:14}}>{u.nombre}</span>
              <Tag color={roleColor(u.role)}>{u.role}</Tag>
              {u.id===currentUser.uid&&<Tag color="var(--ok-text)">Tú</Tag>}
            </Row>
            <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>✉️ {u.email}</div>
          </div>
          <Row style={{gap:4}}>
            <button onClick={()=>setForm({id:u.id,nombre:u.nombre,email:u.email,role:u.role})} style={{background:'var(--info-bg)',border:'none',color:'var(--info-text)',borderRadius:6,padding:'5px 9px',cursor:'pointer'}}>✏️</button>
            {u.id!==currentUser.uid&&<button onClick={()=>delUser(u)} style={{background:'var(--danger-bg)',border:'none',color:'var(--danger-text)',borderRadius:6,padding:'5px 9px',cursor:'pointer'}}>🗑</button>}
          </Row>
        </Row>
      </Card>)}
    </>}
    {form&&<Modal title={form.id?'Editar Usuario':'Nuevo Usuario'} onClose={()=>{setForm(null);setErr('');}}>
      <Lbl>Nombre completo</Lbl><Inp value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} style={{marginBottom:10}}/>
      <Lbl>Correo electrónico</Lbl><Inp type="email" value={form.email} disabled={!!form.id} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="correo@ejemplo.com" style={{marginBottom:10,opacity:form.id?0.6:1}}/>
      {!form.id&&<><Lbl>Contraseña</Lbl><PwInp value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/></>}
      <Lbl>Rol</Lbl>
      <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} style={{background:'var(--surface-2)',border:'1px solid var(--line-strong)',borderRadius:8,padding:'8px 10px',color:'var(--ink)',fontSize:13,width:'100%',marginBottom:16}}>
        <option value="usuario">usuario</option><option value="repartidor">repartidor</option><option value="admin">admin</option>
      </select>
      {form.id&&<div style={{fontSize:11,color:'var(--ink-faint)',marginBottom:12}}>El correo y la contraseña solo los puede cambiar el propio usuario desde su pestaña de Contraseña.</div>}
      <BFill onClick={saveUser} style={{width:'100%'}}>💾 Guardar</BFill>
    </Modal>}
  </div>;
}
