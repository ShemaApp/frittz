/* ── App Root ── */
function App(){
  const [tab,setTab]=useState('home');
  const [navOpen,setNavOpen]=useState(false);
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
  const [isOnline,setIsOnline]=useState(navigator.onLine);
  const [pendCounts,setPendCounts]=useState({productos:0,clientes:0,notas:0,creditos:0,rutas:0});
  const totalPendientes=Object.values(pendCounts).reduce((s,n)=>s+n,0);

  useEffect(()=>{
    const on=()=>setIsOnline(true), off=()=>setIsOnline(false);
    window.addEventListener('online',on);
    window.addEventListener('offline',off);
    return ()=>{ window.removeEventListener('online',on); window.removeEventListener('offline',off); };
  },[]);

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
    const pend=(col,snap)=>setPendCounts(p=>({...p,[col]:snap.docs.filter(d=>d.metadata.hasPendingWrites).length}));
    const unsubs=[
      db.collection('productos').onSnapshot({includeMetadataChanges:true},snap=>{
        setProductos(snap.docs.map(d=>({id:d.id,...d.data()})));
        pend('productos',snap);
      },errorHandler),
      db.collection('clientes').onSnapshot({includeMetadataChanges:true},snap=>{
        setClientes(snap.docs.map(d=>({id:d.id,...d.data()})));
        pend('clientes',snap);
      },errorHandler),
      db.collection('notas').orderBy('fecha','desc').limit(500).onSnapshot({includeMetadataChanges:true},snap=>{
        setNotas(snap.docs.map(d=>({id:d.id,...d.data()})));
        pend('notas',snap);
      },errorHandler),
      db.collection('creditos').onSnapshot({includeMetadataChanges:true},snap=>{
        setCreditos(snap.docs.map(d=>({id:d.id,...d.data()})));
        pend('creditos',snap);
      },errorHandler),
      db.collection('rutas').orderBy('fecha','desc').limit(100).onSnapshot({includeMetadataChanges:true},snap=>{
        setRutas(snap.docs.map(d=>({id:d.id,...d.data()})));
        pend('rutas',snap);
      },errorHandler),
    ];
    return ()=>unsubs.forEach(u=>u());
  },[currentUser]);

  const ALL_TABS=[['home','🏠','Inicio'],['productos','📦','Productos'],['nota','🧾','Pedido'],['clientes','👥','Clientes'],['creditos','💳','Créditos'],['ruta','🚚','Ruta'],['repartidores','🧭','Repartidores'],['inventario','📋','Inventario'],['reportes','📈','Reportes'],['gerencia','💰','Gerencia']];
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

  const mostrarBanner=!isOnline||totalPendientes>0;
  return <div style={{minHeight:'100vh',position:'relative',paddingTop:mostrarBanner?81:53,paddingBottom:24,background:'var(--bg)'}}>
    <div style={{position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:420,background:'var(--rail)',zIndex:100,height:50,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',boxSizing:'border-box'}}>
      <Row style={{gap:10}}>
        {tab!=='config'&&<button onClick={()=>setNavOpen(o=>!o)} style={{background:'none',border:'none',color:'var(--rail-ink-faint)',cursor:'pointer',padding:'5px 3px',display:'flex',alignItems:'center'}}>
          <Menu/>
        </button>}
        <div style={{fontSize:14,fontWeight:700,color:'var(--accent)',fontFamily:'var(--font-display)',textTransform:'uppercase',letterSpacing:'.02em'}}>🚚 Productos de la Costa</div>
      </Row>
      <Row style={{gap:6}}>
        <span style={{fontSize:12,color:'var(--rail-ink-faint)'}}>Hola, {currentUser.nombre.split(' ')[0]}</span>
        <button onClick={goConfig} style={{background:tab==='config'?'var(--rail-border)':'none',border:'none',color:tab==='config'?'var(--accent)':'var(--rail-ink-faint)',cursor:'pointer',borderRadius:3,padding:'5px 7px',display:'flex',alignItems:'center'}}>
          <Gear/>
        </button>
      </Row>
    </div>
    <div style={{position:'fixed',top:50,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:420,height:3,zIndex:100,background:'repeating-linear-gradient(-45deg,var(--accent),var(--accent) 10px,var(--rail) 10px,var(--rail) 20px)'}}/>
    {mostrarBanner&&<div style={{position:'fixed',top:53,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:420,zIndex:99,background:isOnline?'var(--warn-bg)':'var(--danger-bg)',color:isOnline?'var(--warn-text)':'var(--danger-text)',fontSize:12,fontWeight:600,textAlign:'center',padding:'6px 12px',boxSizing:'border-box'}}>
      {isOnline
        ? `⏳ Sincronizando ${totalPendientes} cambio${totalPendientes===1?'':'s'}…`
        : `📡 Sin conexión — puedes seguir trabajando, se sincroniza solo${totalPendientes>0?` (${totalPendientes} en cola)`:''}`}
    </div>}
    {firestoreError&&<div style={{margin:'0 12px 10px',background:'var(--danger-bg)',border:'1px solid var(--danger)55',borderRadius:4,padding:'8px 12px',fontSize:12,color:'var(--danger-text)'}}>{firestoreError}</div>}
    {tab==='home'&&<Dashboard {...ctx} currentUser={currentUser} onIrA={setTab} onVentaRapida={()=>{setVentaRapida(true);setTab('nota');}} onAgregarProducto={()=>{setAbrirFormProducto(true);setTab('productos');}} onAgregarUsuario={()=>{setAbrirUsuarios(true);goConfig();}}/>}
    {tab==='productos'&&<Productos {...ctx} currentUser={currentUser} abrirForm={abrirFormProducto} onAbrirFormConsumido={()=>setAbrirFormProducto(false)}/>}
    {tab==='nota'&&<CrearNota {...ctx} currentUser={currentUser} ventaRapida={ventaRapida} onVentaRapidaConsumida={()=>setVentaRapida(false)}/>}
    {tab==='clientes'&&<Clientes {...ctx} currentUser={currentUser}/>}
    {tab==='creditos'&&<Creditos {...ctx} currentUser={currentUser}/>}
    {tab==='ruta'&&<RutaReparto {...ctx} currentUser={currentUser}/>}
    {tab==='repartidores'&&<RepartidoresPanel {...ctx} currentUser={currentUser} onIrA={setTab}/>}
    {tab==='inventario'&&<Inventario {...ctx} currentUser={currentUser}/>}
    {tab==='reportes'&&<Reportes {...ctx} currentUser={currentUser}/>}
    {tab==='gerencia'&&<Gerencia notas={notas} currentUser={currentUser}/>}
    {tab==='config'&&<Configuracion currentUser={currentUser} onBack={()=>setTab(prevTab)} onLogout={logout} abrirUsuarios={abrirUsuarios} onAbrirUsuariosConsumido={()=>setAbrirUsuarios(false)}/>}
    {navOpen&&<div onClick={()=>setNavOpen(false)} style={{position:'fixed',inset:0,background:'#1B1D19aa',zIndex:190}}/>}
    <div style={{position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:420,height:'100vh',zIndex:200,pointerEvents:'none'}}>
      <nav style={{position:'absolute',top:0,left:0,bottom:0,width:230,background:'var(--rail)',borderRight:'1px solid var(--rail-border)',boxShadow:navOpen?'4px 0 18px #1B1D1955':'none',transform:navOpen?'translateX(0)':'translateX(-100%)',transition:'transform .22s ease',display:'flex',flexDirection:'column',paddingTop:60,paddingBottom:16,boxSizing:'border-box',pointerEvents:'auto',overflowY:'auto'}}>
        {TABS.map(([id,ico,lbl])=>(
          <button key={id} onClick={()=>{setTab(id);setNavOpen(false);}} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 18px',background:tab===id?'var(--rail-border)':'none',border:'none',borderLeft:tab===id?'3px solid var(--accent)':'3px solid transparent',color:tab===id?'var(--accent)':'var(--rail-ink-faint)',cursor:'pointer',textAlign:'left',fontSize:13,fontWeight:tab===id?700:400}}>
            <span style={{fontSize:19,lineHeight:1,width:22,textAlign:'center'}}>{ico}</span>{lbl}
          </button>
        ))}
      </nav>
    </div>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
