/* ── Ruta de reparto ── */
function RutaReparto({productos,clientes,rutas,currentUser,verificarSincronizado,totalPendientes,isOnline,sincronizando}){
  const [scanOpen,setScanOpen]=useState(false);
  const [cart,setCart]=useState([]);
  const [msg,setMsg]=useState('');
  const [manualOpen,setManualOpen]=useState(false);
  const [manualSearch,setManualSearch]=useState('');
  const [entOpen,setEntOpen]=useState(false);
  const [cliMode,setCliMode]=useState('buscar');
  const [cliSearch,setCliSearch]=useState('');
  const [cliSel,setCliSel]=useState(null);
  const [nuevoC,setNuevoC]=useState({nombre:'',telefono:''});
  const [entCart,setEntCart]=useState([]);
  const [pago,setPago]=useState('efectivo');
  const [saving,setSaving]=useState(false);
  const [expandId,setExpandId]=useState(null);
  const flash=m=>{ setMsg(m); setTimeout(()=>setMsg(''),2500); };
  const rutaActiva=rutas.find(r=>r.estado==='activa');
  const historial=rutas.filter(r=>r.id!==rutaActiva?.id);

  /* ── Asignar ruta a un repartidor (rutas_meta) — solo admin ── */
  const [usuarios,setUsuarios]=useState([]);
  useEffect(()=>{
    if(currentUser.role!=='admin') return;
    const unsub=db.collection('usuarios').onSnapshot(snap=>setUsuarios(snap.docs.map(d=>({id:d.id,...d.data()}))),()=>{});
    return unsub;
  },[currentUser.role]);
  const [progForm,setProgForm]=useState(null);
  const [progSaving,setProgSaving]=useState(false);
  const crearRutaAsignada=async()=>{
    if(!progForm.repartidorId){ flash('⚠️ Elige a qué repartidor se la asignas'); return; }
    setProgSaving(true);
    try{
      await db.collection('rutas_meta').add({
        repartidorId:progForm.repartidorId,
        repartidorNombre:progForm.repartidorNombre,
        vehiculo:progForm.vehiculo||'',
        zona:progForm.zona||'',
        fechaProgramada:progForm.fechaProgramada?new Date(progForm.fechaProgramada).toISOString():'',
        fechaRegresoProgramada:progForm.fechaRegresoProgramada?new Date(progForm.fechaRegresoProgramada).toISOString():'',
        estado:'pendiente',
        fechaCreacion:new Date().toISOString(),
        paradas:progForm.paradas||[],
        asignadaPorUid:currentUser.uid,asignadaPorNombre:currentUser.nombre,
      });
      setProgForm(null);
      flash('✅ Ruta asignada a '+progForm.repartidorNombre);
    }catch(e){ flash('❌ '+e.message); }
    setProgSaving(false);
  };

  /* ── Cargar camión (escaneo o manual) ── */
  const addToCart=p=>{
    setCart(c=>{
      const ex=c.find(x=>x.id===p.id);
      return ex?c.map(x=>x.id===p.id?{...x,cant:x.cant+1}:x):[...c,{id:p.id,nombre:p.nombre,unidad:p.unidad,cant:1}];
    });
    flash('✅ '+p.nombre+' agregado');
  };
  const handleScan=code=>{
    setScanOpen(false);
    const p=productos.find(x=>x.codigoBarras&&x.codigoBarras===code);
    if(!p){ flash('⚠️ Código no encontrado: '+code); return; }
    addToCart(p);
  };
  const updQty=(id,v)=>{ if(v<1){setCart(c=>c.filter(x=>x.id!==id));return;} setCart(c=>c.map(x=>x.id===id?{...x,cant:v}:x)); };
  const guardarRuta=async()=>{
    if(cart.length===0) return;
    setSaving(true);
    try{
      const batch=db.batch();
      const itemsMap={};
      cart.forEach(item=>{
        batch.update(db.collection('productos').doc(item.id),{stock:firebase.firestore.FieldValue.increment(-item.cant)});
        itemsMap[item.id]={nombre:item.nombre,unidad:item.unidad,cantCargada:item.cant,cantRestante:item.cant};
      });
      const rutaRef=db.collection('rutas').doc();
      batch.set(rutaRef,{fecha:new Date().toISOString(),estado:'activa',items:itemsMap,entregas:[]});
      await batch.commit();
      setCart([]); flash('✅ Camión cargado — ruta iniciada');
    }catch(e){ flash('❌ Error al guardar la ruta: '+e.message); }
    setSaving(false);
  };

  /* ── Registrar entrega dentro de la ruta activa ── */
  const cliFilt=clientes.filter(c=>c.activo&&c.nombre.toLowerCase().includes(cliSearch.toLowerCase()));
  const disponibles=rutaActiva?Object.entries(rutaActiva.items).filter(([id,it])=>it.cantRestante>0):[];
  const addEnt=(id,it)=>{
    const prod=productos.find(p=>p.id===id);
    setEntCart(c=>{
      const ex=c.find(x=>x.id===id);
      if(ex) return ex.cant<it.cantRestante?c.map(x=>x.id===id?{...x,cant:x.cant+1}:x):c;
      return [...c,{id,nombre:it.nombre,unidad:it.unidad,precio:prod?prod.precio:0,cant:1,max:it.cantRestante}];
    });
  };
  const updEntQty=(id,v)=>{
    if(!v||v<1){ setEntCart(c=>c.filter(x=>x.id!==id)); return; }
    setEntCart(c=>c.map(x=>x.id===id?{...x,cant:Math.min(v,x.max)}:x));
  };
  const clienteEnt=cliMode==='nuevo'?nuevoC:cliSel;
  const canSaveEnt=clienteEnt?.nombre&&entCart.length>0;
  const guardarEntrega=async()=>{
    if(!canSaveEnt||!rutaActiva) return;
    setSaving(true);
    try{
      let cl=cliSel;
      if(cliMode==='nuevo'){
        const ref=await db.collection('clientes').add({nombre:nuevoC.nombre,telefono:nuevoC.telefono||'',domicilio:'',activo:true});
        cl={id:ref.id,nombre:nuevoC.nombre,telefono:nuevoC.telefono||''};
      }
      const total=entCart.reduce((s,x)=>s+x.precio*x.cant,0);
      const items=entCart.map(x=>({id:x.id,nombre:x.nombre,precio:x.precio,cant:x.cant}));
      const batch=db.batch();
      const notaRef=db.collection('notas').doc();
      batch.set(notaRef,{fecha:new Date().toISOString(),clienteId:cl.id,clienteNombre:cl.nombre,clienteTelefono:cl.telefono||'',items,total,formaPago:pago,rutaId:rutaActiva.id,capturadoPorUid:currentUser.uid,capturadoPorNombre:currentUser.nombre});
      if(pago==='credito'){
        batch.set(db.collection('creditos').doc(),{notaId:notaRef.id,clienteId:cl.id,clienteNombre:cl.nombre,fecha:new Date().toISOString(),total,saldo:total,abonos:[]});
      }
      const rutaUpdate={ entregas: firebase.firestore.FieldValue.arrayUnion({id:notaRef.id,fecha:new Date().toISOString(),clienteNombre:cl.nombre,total,formaPago:pago,items,capturadoPorNombre:currentUser.nombre}) };
      entCart.forEach(x=>{ rutaUpdate[`items.${x.id}.cantRestante`]=firebase.firestore.FieldValue.increment(-x.cant); });
      batch.update(db.collection('rutas').doc(rutaActiva.id),rutaUpdate);
      await batch.commit();
      setEntCart([]); setCliSel(null); setNuevoC({nombre:'',telefono:''}); setCliMode('buscar'); setEntOpen(false);
      flash('✅ Entrega registrada a '+cl.nombre);
    }catch(e){ flash('❌ Error al guardar la entrega: '+e.message); }
    setSaving(false);
  };
  const cerrarRuta=async()=>{
    if(!rutaActiva) return;
    if(totalPendientes>0){
      if(isOnline){
        const ok=await verificarSincronizado();
        if(!ok) return; // no se pudo confirmar todavía — mejor esperar antes de cerrar
      }else if(!confirm('📡 Sigues sin conexión y hay cambios de hoy sin subir todavía. ¿Cerrar la ruta de todas formas? Se sincronizará solo en cuanto vuelva la señal.')){
        return;
      }
    }
    if(!confirm('¿Cerrar esta ruta? Ya no podrás registrar más entregas en ella.')) return;
    await db.collection('rutas').doc(rutaActiva.id).update({estado:'cerrada'});
    flash('🏁 Ruta cerrada');
  };

  return <div style={{padding:'16px 12px'}}>
    <div style={{fontSize:20,fontWeight:800,marginBottom:12}}>🚚 Ruta de reparto</div>
    {msg&&<div style={{background:'var(--ok-bg)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'var(--ok-text)',marginBottom:12}}>{msg}</div>}

    {currentUser.role==='admin'&&<Card>
      <button onClick={()=>setProgForm(f=>f?null:{repartidorId:'',repartidorNombre:'',vehiculo:'',zona:'',fechaProgramada:'',fechaRegresoProgramada:'',paradas:[]})} style={{background:'none',border:'none',color:'var(--ink)',width:'100%',textAlign:'left',cursor:'pointer',padding:0}}>
        <Row style={{justifyContent:'space-between'}}>
          <span style={{fontWeight:700}}>📋 Asignar ruta a un repartidor</span>
          {progForm?<CUp/>:<CDown/>}
        </Row>
      </button>
      {progForm&&<div style={{marginTop:12}}>
        <Lbl>Repartidor</Lbl>
        <select value={progForm.repartidorId} onChange={e=>{ const u=usuarios.find(x=>x.id===e.target.value); setProgForm(f=>({...f,repartidorId:e.target.value,repartidorNombre:u?u.nombre:''})); }} style={{background:'var(--surface-2)',border:'1px solid var(--line-strong)',borderRadius:3,padding:'8px 10px',color:'var(--ink)',fontSize:13,width:'100%',boxSizing:'border-box',marginBottom:10}}>
          <option value="">Selecciona…</option>
          {usuarios.filter(u=>u.role==='repartidor').map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        {usuarios.filter(u=>u.role==='repartidor').length===0&&<div style={{fontSize:11,color:'var(--warn-text)',marginBottom:10}}>No hay usuarios con rol "repartidor" todavía — créalos en Configuración → Usuarios.</div>}
        <Lbl>Vehículo</Lbl>
        <Inp value={progForm.vehiculo} onChange={e=>setProgForm(f=>({...f,vehiculo:e.target.value}))} placeholder="Camioneta blanca, placas…" style={{marginBottom:10}}/>
        <Lbl>Zona / colonia</Lbl>
        <Inp value={progForm.zona} onChange={e=>setProgForm(f=>({...f,zona:e.target.value}))} placeholder="Centro, Col. Reforma…" style={{marginBottom:10}}/>
        <Lbl>Salida programada</Lbl>
        <Inp type="datetime-local" value={progForm.fechaProgramada} onChange={e=>setProgForm(f=>({...f,fechaProgramada:e.target.value}))} style={{marginBottom:10}}/>
        <Lbl>Regreso estimado (opcional)</Lbl>
        <Inp type="datetime-local" value={progForm.fechaRegresoProgramada} onChange={e=>setProgForm(f=>({...f,fechaRegresoProgramada:e.target.value}))} style={{marginBottom:10}}/>
        <div style={{borderTop:'1px solid var(--line-strong)',margin:'4px 0 14px'}}/>
        <Lbl>Clientes y productos por visitar (opcional)</Lbl>
        <ParadaBuilder clientes={clientes} productos={productos} paradas={progForm.paradas} onChange={ps=>setProgForm(f=>({...f,paradas:ps}))}/>
        <BFill onClick={crearRutaAsignada} style={{width:'100%',marginTop:10}} disabled={progSaving}>{progSaving?'Guardando…':'✅ Asignar ruta'}</BFill>
      </div>}
    </Card>}

    {!rutaActiva&&<>
      <Card>
        <BFill onClick={()=>setScanOpen(true)} style={{width:'100%',fontSize:14,padding:12}}>📷 Escanear producto</BFill>
        <div style={{fontSize:11,color:'var(--ink-faint)',marginTop:8,textAlign:'center'}}>Escanea cada producto que subas al camión; se descuenta del inventario del almacén.</div>
      </Card>
      <Card>
        <button onClick={()=>setManualOpen(o=>!o)} style={{background:'none',border:'none',color:'var(--ink)',width:'100%',textAlign:'left',cursor:'pointer',padding:0}}>
          <Row style={{justifyContent:'space-between'}}>
            <span style={{fontWeight:700}}>➕ Agregar manualmente</span>
            {manualOpen?<CUp/>:<CDown/>}
          </Row>
        </button>
        {manualOpen&&<div style={{marginTop:12}}>
          <Inp placeholder="🔍 Buscar producto…" value={manualSearch} onChange={e=>setManualSearch(e.target.value)} style={{marginBottom:8}}/>
          <div style={{maxHeight:220,overflowY:'auto'}}>
            {productos.filter(p=>p.nombre.toLowerCase().includes(manualSearch.toLowerCase())).map(p=><Row key={p.id} style={{justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--line)'}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{p.nombre}</div>
                <div style={{fontSize:11,color:'var(--ink-faint)'}}>Stock almacén: {p.stock} {p.unidad}</div>
              </div>
              <BFill onClick={()=>addToCart(p)} style={{padding:'5px 12px',fontSize:12}}>+ Agregar</BFill>
            </Row>)}
          </div>
        </div>}
      </Card>
      {cart.length>0&&<Card>
        <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginBottom:10}}>PRODUCTOS ESCANEADOS ({cart.reduce((s,x)=>s+x.cant,0)})</div>
        {cart.map(item=><Row key={item.id} style={{justifyContent:'space-between',marginBottom:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600}}>{item.nombre}</div>
            <div style={{fontSize:11,color:'var(--ink-faint)'}}>{item.unidad}</div>
          </div>
          <Row style={{gap:5}}>
            <button onClick={()=>updQty(item.id,item.cant-1)} style={{background:'var(--surface-2)',border:'none',color:'var(--ink)',borderRadius:6,width:26,height:26,cursor:'pointer',fontSize:15}}>-</button>
            <input type="number" min="1" value={item.cant} onChange={e=>{ const v=e.target.value; if(v===''){return;} const n=parseInt(v); if(!isNaN(n)&&n>=1) updQty(item.id,n); }} onBlur={e=>{ if(!e.target.value||parseInt(e.target.value)<1) updQty(item.id,1); }} style={{width:44,textAlign:'center',fontWeight:700,fontSize:14,background:'var(--surface-2)',border:'1px solid var(--line-strong)',borderRadius:6,color:'var(--ink)',padding:'4px 2px'}}/>
            <button onClick={()=>updQty(item.id,item.cant+1)} style={{background:'var(--surface-2)',border:'none',color:'var(--ink)',borderRadius:6,width:26,height:26,cursor:'pointer',fontSize:15}}>+</button>
          </Row>
        </Row>)}
        <BFill onClick={guardarRuta} style={{width:'100%',marginTop:6}} disabled={saving}>{saving?'Guardando…':'🚚 Iniciar ruta con este cargamento'}</BFill>
      </Card>}
    </>}

    {rutaActiva&&<>
      <Card style={{borderLeft:'3px solid var(--accent-text)'}}>
        <Row style={{justifyContent:'space-between',marginBottom:8}}>
          <span style={{fontWeight:700,fontSize:14}}>📦 Camión cargado</span>
          <Row style={{gap:6}}>{rutaActiva._pendiente&&<PendienteTag/>}<Tag color="var(--accent-text)">Ruta activa</Tag></Row>
        </Row>
        {Object.entries(rutaActiva.items).map(([id,it])=><Row key={id} style={{justifyContent:'space-between',marginBottom:4}}>
          <span style={{fontSize:13}}>{it.nombre}</span>
          <span style={{fontSize:12,color:it.cantRestante===0?'var(--ink-faint)':'var(--ink-soft)'}}>{it.cantRestante} / {it.cantCargada} {it.unidad}</span>
        </Row>)}
        <BOut onClick={cerrarRuta} color="var(--danger-text)" style={{width:'100%',marginTop:10}} disabled={sincronizando}>{sincronizando?'Verificando sincronización…':'🏁 Cerrar ruta'}</BOut>
      </Card>

      <Card>
        <button onClick={()=>setEntOpen(o=>!o)} style={{background:'none',border:'none',color:'var(--ink)',width:'100%',textAlign:'left',cursor:'pointer',padding:0}}>
          <Row style={{justifyContent:'space-between'}}>
            <span style={{fontWeight:700}}>➕ Registrar entrega</span>
            {entOpen?<CUp/>:<CDown/>}
          </Row>
        </button>
        {entOpen&&<div style={{marginTop:12}}>
          <Lbl>Cliente</Lbl>
          <Row style={{gap:6,marginBottom:10}}>
            {[['buscar','Existente'],['nuevo','Nuevo']].map(([v,l])=>(
              <button key={v} onClick={()=>setCliMode(v)} style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:cliMode===v?'var(--accent)':'var(--surface-2)',color:cliMode===v?'var(--ink)':'var(--ink-soft)',fontSize:12,fontWeight:700,cursor:'pointer'}}>{l}</button>
            ))}
          </Row>
          {cliMode==='buscar'?<>
            <Inp placeholder="Buscar cliente…" value={cliSearch} onChange={e=>setCliSearch(e.target.value)} style={{marginBottom:8}}/>
            <div style={{maxHeight:140,overflowY:'auto',marginBottom:10}}>
              {cliFilt.map(c=><div key={c.id} onClick={()=>setCliSel(c)} style={{padding:'9px 10px',borderRadius:8,cursor:'pointer',background:cliSel?.id===c.id?'var(--info-bg)':'transparent',marginBottom:3}}>
                <div style={{fontWeight:600,fontSize:13}}>{c.nombre}</div>
                <div style={{fontSize:11,color:'var(--ink-soft)'}}>📱 {c.telefono}</div>
              </div>)}
            </div>
          </>:<>
            <Inp placeholder="Nombre *" value={nuevoC.nombre} onChange={e=>setNuevoC(x=>({...x,nombre:e.target.value}))} style={{marginBottom:8}}/>
            <Inp placeholder="Teléfono" type="tel" value={nuevoC.telefono} onChange={e=>setNuevoC(x=>({...x,telefono:e.target.value}))} style={{marginBottom:10}}/>
          </>}

          <Lbl>Productos disponibles en el camión</Lbl>
          <div style={{maxHeight:180,overflowY:'auto',marginBottom:10}}>
            {disponibles.length===0&&<div style={{fontSize:12,color:'var(--ink-faint)'}}>Sin inventario disponible en el camión.</div>}
            {disponibles.map(([id,it])=><Row key={id} style={{justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--line)'}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{it.nombre}</div>
                <div style={{fontSize:11,color:'var(--ink-faint)'}}>Disponibles: {it.cantRestante} {it.unidad}</div>
              </div>
              <BFill onClick={()=>addEnt(id,it)} style={{padding:'5px 12px',fontSize:12}}>+ Agregar</BFill>
            </Row>)}
          </div>

          {entCart.length>0&&<div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginBottom:8}}>PRODUCTOS DE ESTA ENTREGA</div>
            {entCart.map(item=><Row key={item.id} style={{justifyContent:'space-between',marginBottom:8}}>
              <div style={{flex:1,minWidth:0,fontSize:13}}>{item.nombre}</div>
              <Row style={{gap:5}}>
                <button onClick={()=>updEntQty(item.id,item.cant-1)} style={{background:'var(--surface-2)',border:'none',color:'var(--ink)',borderRadius:6,width:24,height:24,cursor:'pointer',fontSize:14}}>-</button>
                <input type="number" min="1" max={item.max} value={item.cant} onChange={e=>{ const v=e.target.value; if(v===''){return;} const n=parseInt(v); if(!isNaN(n)&&n>=1) updEntQty(item.id,n); }} onBlur={e=>{ if(!e.target.value||parseInt(e.target.value)<1) updEntQty(item.id,1); }} style={{width:40,textAlign:'center',fontWeight:700,fontSize:13,background:'var(--surface-2)',border:'1px solid var(--line-strong)',borderRadius:6,color:'var(--ink)',padding:'3px 2px'}}/>
                <button onClick={()=>updEntQty(item.id,item.cant+1)} style={{background:'var(--surface-2)',border:'none',color:'var(--ink)',borderRadius:6,width:24,height:24,cursor:'pointer',fontSize:14}}>+</button>
              </Row>
            </Row>)}
          </div>}

          <Row style={{gap:8,marginBottom:12}}>
            {[['efectivo','💵 Efectivo','var(--ok-bg)','var(--ok-text)'],['transferencia','🏦 Transferencia','var(--info-bg)','var(--info-text)'],['credito','📋 Crédito','var(--warn-bg)','var(--warn-text)']].map(([v,l,bg,col])=>(
              <button key={v} onClick={()=>setPago(v)} style={{flex:1,padding:'9px 2px',borderRadius:8,border:'none',background:pago===v?bg:'var(--surface-2)',color:pago===v?col:'var(--ink-soft)',fontSize:11,fontWeight:700,cursor:'pointer'}}>{l}</button>
            ))}
          </Row>
          <BFill onClick={guardarEntrega} bg={canSaveEnt?'var(--accent)':'var(--line-strong)'} color={canSaveEnt?'var(--ink)':'var(--ink-faint)'} style={{width:'100%'}} disabled={!canSaveEnt||saving}>{saving?'Guardando…':'💾 Guardar entrega'}</BFill>
        </div>}
      </Card>

      {rutaActiva.entregas?.length>0&&<Card>
        <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginBottom:10}}>ENTREGAS DE ESTA RUTA ({rutaActiva.entregas.length})</div>
        {rutaActiva.entregas.map((e,i)=><Row key={i} style={{justifyContent:'space-between',paddingBottom:8,borderBottom:'1px solid var(--line)',marginBottom:6}}>
          <div><div style={{fontSize:13,fontWeight:600}}>{e.clienteNombre}</div><div style={{fontSize:11,color:'var(--ink-faint)'}}>{e.items.length} prod. · {e.formaPago}</div></div>
          <span style={{fontWeight:700,color:'var(--accent-text)'}}>{fmt(e.total)}</span>
        </Row>)}
      </Card>}
    </>}

    {scanOpen&&<BarcodeScanner onDetected={handleScan} onClose={()=>setScanOpen(false)}/>}

    {historial.length>0&&<Card>
      <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginBottom:10}}>HISTORIAL DE RUTAS</div>
      {historial.map(r=><div key={r.id} style={{paddingBottom:8,borderBottom:'1px solid var(--line)',marginBottom:8}}>
        <button onClick={()=>setExpandId(expandId===r.id?null:r.id)} style={{background:'none',border:'none',color:'var(--ink)',width:'100%',textAlign:'left',cursor:'pointer',padding:0}}>
          <Row style={{justifyContent:'space-between',marginBottom:4}}>
            <span style={{fontSize:12,color:'var(--ink-soft)'}}>{fDate(r.fecha)}</span>
            <Row style={{gap:6}}>
              {r._pendiente&&<PendienteTag/>}
              <Tag color={r.estado==='activa'?'var(--accent-text)':'var(--ink-faint)'}>{r.estado||'cerrada'}</Tag>
              <Tag color="var(--ok-text)">{(r.entregas||[]).length} entregas</Tag>
            </Row>
          </Row>
        </button>
        {expandId===r.id&&<div style={{marginTop:6}}>
          <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginBottom:4}}>CARGADO</div>
          {Array.isArray(r.items)
            ?r.items.map(it=><div key={it.id} style={{fontSize:12,color:'var(--ink-soft)'}}>• {it.nombre} x{it.cant}</div>)
            :Object.entries(r.items||{}).map(([id,it])=><div key={id} style={{fontSize:12,color:'var(--ink-soft)'}}>• {it.nombre} x{it.cantCargada} (quedan {it.cantRestante})</div>)
          }
          {(r.entregas||[]).length>0&&<>
            <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginTop:8,marginBottom:4}}>ENTREGAS</div>
            {r.entregas.map((e,i)=><Row key={i} style={{justifyContent:'space-between',fontSize:12,marginBottom:3}}>
              <span>{e.clienteNombre}</span><span style={{color:'var(--accent-text)',fontWeight:700}}>{fmt(e.total)}</span>
            </Row>)}
          </>}
        </div>}
      </div>)}
    </Card>}
  </div>;
}
