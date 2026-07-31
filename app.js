/* ── App Root ── */
function App(){
  const [tab,setTab]=useState('home');
  const [prevTab,setPrevTab]=useState('home');
  const [currentUser,setCurrentUser]=useState(null);
  const [productos,setProductos]=useState([]);
  const [clientes,setClientes]=useState([]);
  const [notas,setNotas]=useState([]);
  const [creditos,setCreditos]=useState([]);
  const [rutas,setRutas]=useState([]);
  const [authChecked,setAuthChecked]=useState(false);
  const [firestoreError,setFirestoreError]=useState(null);
  const [locked,setLocked]=useState(false);
  const [ventaRapida,setVentaRapida]=useState(false);
  const [abrirFormProducto,setAbrirFormProducto]=useState(false);
  const [abrirUsuarios,setAbrirUsuarios]=useState(false);

  useEffect(()=>{
    setLocked(currentUser?!!localStorage.getItem(pinKey(currentUser.uid)):false);
  },[currentUser?.uid]);

  // Autenticación: escucha sesión de Firebase y carga el perfil (usuarios/{uid})
  useEffect(()=>{
    const unsub=auth.onAuthStateChanged(async fbUser=>{
      if(fbUser){
        try{
          const ref=db.collection('usuarios').doc(fbUser.uid);
          const snap=await ref.get();
          let perfil;
          if(snap.exists){
            perfil=snap.data();
          }else{
            // Primer inicio de sesión sin perfil: se crea como admin (útil para la primera cuenta)
            perfil={nombre:fbUser.email.split('@')[0],email:fbUser.email,role:'admin'};
            await ref.set(perfil);
          }
          setCurrentUser({uid:fbUser.uid,...perfil});
        }catch(e){ setCurrentUser({uid:fbUser.uid,nombre:fbUser.email,email:fbUser.email,role:'usuario'}); }
      }else{
        setCurrentUser(null);
      }
      setAuthChecked(true);
    });
    return unsub;
  },[]);

  // Suscripciones en tiempo real a Firestore (solo cuando hay sesión iniciada)
  useEffect(()=>{
    if(!currentUser) return;
    (async()=>{
      try{
        const seedRef=db.collection('_meta').doc('seed');
        const seedSnap=await seedRef.get();
        const seeded=seedSnap.exists?seedSnap.data():{};
        if(!seeded.productos){
          const batch=db.batch();
          S_PROD.forEach(p=>{ const {id,...rest}=p; batch.set(db.collection('productos').doc(),rest); });
          batch.set(seedRef,{productos:true},{merge:true});
          await batch.commit();
        }
        if(!seeded.clientes){
          const batch=db.batch();
          S_CLI.forEach(c=>{ const {id,...rest}=c; batch.set(db.collection('clientes').doc(),rest); });
          batch.set(seedRef,{clientes:true},{merge:true});
          await batch.commit();
        }
      }catch(e){ console.error('Error al sembrar datos iniciales',e); }
    })();
    const errorHandler=(err)=>{ console.error('Firestore error:',err); setFirestoreError('⚠️ Error de conexión con la base de datos. Revisa tus permisos.'); };
    const unsubs=[
      db.collection('productos').onSnapshot(snap=>{
        setProductos(snap.docs.map(d=>({id:d.id,...d.data()})));
      },errorHandler),
      db.collection('clientes').onSnapshot(snap=>{
        setClientes(snap.docs.map(d=>({id:d.id,...d.data()})));
      },errorHandler),
      db.collection('notas').orderBy('fecha','desc').limit(500).onSnapshot(snap=>{
        setNotas(snap.docs.map(d=>({id:d.id,...d.data()})));
      },errorHandler),
      db.collection('creditos').onSnapshot(snap=>{
        setCreditos(snap.docs.map(d=>({id:d.id,...d.data()})));
      },errorHandler),
      db.collection('rutas').orderBy('fecha','desc').limit(100).onSnapshot(snap=>{
        setRutas(snap.docs.map(d=>({id:d.id,...d.data()})));
      },errorHandler),
    ];
    return ()=>unsubs.forEach(u=>u());
  },[currentUser]);

  const ALL_TABS=[['home','🏠','Inicio'],['productos','📦','Productos'],['nota','🧾','Pedido'],['clientes','👥','Clientes'],['creditos','💳','Créditos'],['ruta','🚚','Ruta'],['gerencia','💰','Gerencia']];
  // Pestañas visibles: por defecto según el rol, con overrides por persona que
  // el admin concede o retira desde Configuración → Permisos (permisos.js).
  // 'home' siempre está disponible; los demás pasan por permisoTabs().
  const permTabs=permisoTabs(currentUser);
  const tabsPermitidos=['home',...ALL_TABS.filter(([id])=>id!=='home'&&permTabs[id]).map(([id])=>id)];
  const TABS=ALL_TABS.filter(([id])=>tabsPermitidos.includes(id));

  // Si la pestaña actual no está permitida para el rol (p.ej. justo tras iniciar sesión), manda a la primera que sí vea.
  useEffect(()=>{
    if(!currentUser) return;
    if(tab!=='config'&&!tabsPermitidos.includes(tab)) setTab(tabsPermitidos[0]);
  },[currentUser]);

  const goConfig=()=>{ if(tab!=='config') setPrevTab(tab); setTab('config'); };
  const logout=()=>{ auth.signOut(); setTab('nota'); };
  const ctx={productos,clientes,notas,creditos,rutas};

  if(!authChecked) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',color:'var(--ink-faint)',fontSize:14,background:'var(--bg)'}}>Cargando…</div>;
  if(!currentUser) return <Login/>;
  if(locked) return <PinLock currentUser={currentUser} onUnlock={()=>setLocked(false)} onUsePassword={()=>auth.signOut()}/>;

  return <div style={{minHeight:'100vh',position:'relative',paddingTop:53,paddingBottom:tab==='config'?24:72,background:'var(--bg)'}}>
    <div style={{position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:420,background:'var(--rail)',zIndex:100,height:50,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',boxSizing:'border-box'}}>
      <div style={{fontSize:14,fontWeight:700,color:'var(--accent)',fontFamily:'var(--font-display)',textTransform:'uppercase',letterSpacing:'.02em'}}>🚚 Productos de la Costa</div>
      <Row style={{gap:6}}>
        <span style={{fontSize:12,color:'var(--rail-ink-faint)'}}>Hola, {currentUser.nombre.split(' ')[0]}</span>
        <button onClick={goConfig} style={{background:tab==='config'?'var(--rail-border)':'none',border:'none',color:tab==='config'?'var(--accent)':'var(--rail-ink-faint)',cursor:'pointer',borderRadius:3,padding:'5px 7px',display:'flex',alignItems:'center'}}>
          <Gear/>
        </button>
      </Row>
    </div>
    <div style={{position:'fixed',top:50,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:420,height:3,zIndex:100,background:'repeating-linear-gradient(-45deg,var(--accent),var(--accent) 10px,var(--rail) 10px,var(--rail) 20px)'}}/>
    {firestoreError&&<div style={{margin:'0 12px 10px',background:'var(--danger-bg)',border:'1px solid var(--danger)55',borderRadius:4,padding:'8px 12px',fontSize:12,color:'var(--danger-text)'}}>{firestoreError}</div>}
    {tab==='home'&&<Dashboard {...ctx} currentUser={currentUser} onIrA={setTab} onVentaRapida={()=>{setVentaRapida(true);setTab('nota');}} onAgregarProducto={()=>{setAbrirFormProducto(true);setTab('productos');}} onAgregarUsuario={()=>{setAbrirUsuarios(true);goConfig();}}/>}
    {tab==='productos'&&<Productos {...ctx} currentUser={currentUser} abrirForm={abrirFormProducto} onAbrirFormConsumido={()=>setAbrirFormProducto(false)}/>}
    {tab==='nota'&&<CrearNota {...ctx} currentUser={currentUser} ventaRapida={ventaRapida} onVentaRapidaConsumida={()=>setVentaRapida(false)}/>}
    {tab==='clientes'&&<Clientes {...ctx} currentUser={currentUser}/>}
    {tab==='creditos'&&<Creditos {...ctx} currentUser={currentUser}/>}
    {tab==='ruta'&&<RutaReparto {...ctx} currentUser={currentUser}/>}
    {tab==='gerencia'&&<Gerencia notas={notas} currentUser={currentUser}/>}
    {tab==='config'&&<Configuracion currentUser={currentUser} onBack={()=>setTab(prevTab)} onLogout={logout} abrirUsuarios={abrirUsuarios} onAbrirUsuariosConsumido={()=>setAbrirUsuarios(false)}/>}
    {tab!=='config'&&<nav style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:420,background:'var(--rail)',borderTop:'1px solid var(--rail-border)',display:'flex',zIndex:200}}>
      {TABS.map(([id,ico,lbl])=>(
        <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:'10px 2px 7px',background:'none',border:'none',borderTop:tab===id?'2px solid var(--accent)':'2px solid transparent',color:tab===id?'var(--accent)':'var(--rail-ink-faint)',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:1,fontSize:10,fontWeight:tab===id?700:400}}>
          <span style={{fontSize:22,lineHeight:1}}>{ico}</span>{lbl}
        </button>
      ))}
    </nav>}
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
