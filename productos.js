/* ── Historial de inventario ── */
function InventarioHistorial({onClose}){
  const [items,setItems]=useState(null);
  useEffect(()=>{
    const unsub=db.collection('inventario_historial').orderBy('fecha','desc').limit(200).onSnapshot(snap=>{
      setItems(snap.docs.map(d=>({id:d.id,...d.data()})));
    },()=>setItems([]));
    return unsub;
  },[]);
  return <Modal title="📋 Historial de inventario" onClose={onClose}>
    <div style={{fontSize:11,color:'var(--ink-faint)',marginBottom:10}}>Solo cambios manuales de stock (altas y ajustes). No incluye descuentos automáticos por venta.</div>
    {items===null&&<div style={{fontSize:13,color:'var(--ink-faint)',textAlign:'center',padding:'20px 0'}}>Cargando…</div>}
    {items&&items.length===0&&<div style={{fontSize:13,color:'var(--ink-faint)',textAlign:'center',padding:'20px 0'}}>Sin cambios registrados aún</div>}
    {items&&items.map(h=><div key={h.id} style={{paddingBottom:10,borderBottom:'1px solid var(--line-strong)',marginBottom:10}}>
      <Row style={{justifyContent:'space-between',marginBottom:3}}>
        <span style={{fontWeight:700,fontSize:13}}>{h.productoNombre}</span>
        <Tag color={h.diferencia>=0?'var(--ok-text)':'var(--danger-text)'}>{h.diferencia>=0?'+':''}{h.diferencia}</Tag>
      </Row>
      <div style={{fontSize:12,color:'var(--ink-soft)'}}>{h.stockAnterior} → {h.stockNuevo} unidades</div>
      <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:2}}>Motivo: {h.motivo||'Sin especificar'}</div>
      <Row style={{justifyContent:'space-between',marginTop:4}}>
        <span style={{fontSize:11,color:'var(--ink-faint)'}}>{h.usuarioNombre||h.usuarioEmail||'—'}</span>
        <span style={{fontSize:11,color:'var(--ink-faint)'}}>{fDate(h.fecha)}</span>
      </Row>
    </div>)}
  </Modal>;
}

/* ── Productos ── */
function Productos({productos,currentUser,abrirForm,onAbrirFormConsumido}){
  const isAdmin=currentUser?.role==='admin';
  const puedeEditar=isAdmin||permisoEdita(currentUser).productos;
  const [sel,setSel]=useState([]);
  const [selMode,setSelMode]=useState(false);
  const [expandedId,setExpandedId]=useState(null);
  const pressTimer=useRef(null);
  const longPressed=useRef(false);
  const [q,setQ]=useState('');
  const [form,setForm]=useState(null);
  const [scanOpen,setScanOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [histOpen,setHistOpen]=useState(false);
  useEffect(()=>{
    if(abrirForm){ setForm({nombre:'',precio:'',stock:'',unidad:'',codigoBarras:'',motivo:''}); onAbrirFormConsumido&&onAbrirFormConsumido(); }
  },[abrirForm]);
  const list=productos.filter(p=>p.nombre.toLowerCase().includes(q.toLowerCase()));
  const allSel=list.length>0&&sel.length===list.length;
  const togSel=id=>setSel(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const togAll=()=>setSel(allSel?[]:list.map(p=>p.id));
  const delSel=async()=>{
    await Promise.all(sel.map(id=>db.collection('productos').doc(id).delete()));
    setSel([]); setSelMode(false);
  };
  const entrarSeleccion=id=>{ setSelMode(true); setSel([id]); setExpandedId(null); };
  const salirSeleccion=()=>{ setSelMode(false); setSel([]); };
  const startPress=id=>{
    longPressed.current=false;
    clearTimeout(pressTimer.current);
    pressTimer.current=setTimeout(()=>{
      longPressed.current=true;
      if(navigator.vibrate) navigator.vibrate(12);
      setExpandedId(eid=>eid===id?null:id);
    },500);
  };
  const cancelPress=()=>clearTimeout(pressTimer.current);
  const onCardTap=id=>{
    if(longPressed.current){ longPressed.current=false; return; } // ya actuó el long-press, ignora el click fantasma que sigue
    if(selMode){ togSel(id); return; }
    if(expandedId===id) setExpandedId(null);
  };
  const logInventario=(productoId,productoNombre,stockAnterior,stockNuevo,motivo)=>{
    if(stockAnterior===stockNuevo) return Promise.resolve();
    return db.collection('inventario_historial').add({
      productoId,productoNombre,stockAnterior,stockNuevo,diferencia:stockNuevo-stockAnterior,
      motivo:motivo||'Sin especificar',
      usuarioUid:currentUser?.uid||'',
      usuarioNombre:currentUser?.nombre||'',usuarioEmail:currentUser?.email||'',
      fecha:new Date().toISOString()
    });
  };
  const save=async()=>{
    if(!form.nombre||form.precio===''||form.precio===undefined){ alert('Nombre y precio son obligatorios'); return; }
    setSaving(true);
    const nuevoStock=+form.stock||0;
    const item={nombre:form.nombre,precio:+form.precio,stock:nuevoStock,unidad:form.unidad,codigoBarras:form.codigoBarras||''};
    if(form.codigoBarras){
      const existente=productos.find(p=>p.codigoBarras===form.codigoBarras&&p.id!==form.id);
      if(existente){ alert(`❌ El código de barras "${form.codigoBarras}" ya está asignado a "${existente.nombre}"`); setSaving(false); return; }
    }
    try{
      if(form.id){
        const anterior=productos.find(p=>p.id===form.id);
        await db.collection('productos').doc(form.id).update(item);
        if(anterior) await logInventario(form.id,form.nombre,anterior.stock,nuevoStock,form.motivo);
      }else{
        const ref=await db.collection('productos').add(item);
        await logInventario(ref.id,form.nombre,0,nuevoStock,form.motivo||'Alta de producto');
      }
      setForm(null);
    }catch(e){ alert('Error al guardar: '+e.message); }
    setSaving(false);
  };
  return <div style={{padding:'16px 12px'}}>
    <Row style={{justifyContent:'space-between',marginBottom:12}}>
      <div style={{fontSize:20,fontWeight:800}}>📦 Productos</div>
      <Row style={{gap:6}}>
        {isAdmin&&<BOut onClick={()=>setHistOpen(true)}>📋 Historial</BOut>}
        {puedeEditar&&<BFill onClick={()=>setForm({nombre:'',precio:'',stock:'',unidad:'',codigoBarras:'',motivo:''})}>+ Nuevo</BFill>}
      </Row>
    </Row>
    <Inp placeholder="🔍 Buscar..." value={q} onChange={e=>setQ(e.target.value)} style={{marginBottom:10}}/>
    <div style={{fontSize:11,color:'var(--ink-faint)',marginBottom:10}}>Mantén presionado un producto para editar, eliminar o seleccionar.</div>
    {selMode&&<Row style={{marginBottom:10,background:'var(--danger-bg)',borderRadius:8,padding:'8px 12px'}}>
      <span style={{flex:1,fontSize:13,color:'var(--danger-text)'}}>{sel.length} seleccionado(s)</span>
      <BOut onClick={delSel} color="var(--danger-text)">🗑 Eliminar</BOut>
      <BOut onClick={salirSeleccion}>Cancelar</BOut>
    </Row>}
    {selMode&&<Row style={{paddingLeft:4,marginBottom:6}}>
      <button onClick={togAll} style={{background:'none',border:'none',color:allSel?'var(--accent-text)':'var(--ink-soft)',cursor:'pointer',padding:0,display:'flex'}}>
        {allSel?<ChkSq/>:<SqI/>}
      </button>
      <span style={{fontSize:11,color:'var(--ink-faint)'}}>Seleccionar todos</span>
    </Row>}
    {list.map(p=>{
      const expanded=expandedId===p.id;
      return <Card key={p.id} style={{padding:0,overflow:'hidden'}}>
        <div
          onMouseDown={()=>startPress(p.id)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
          onTouchStart={()=>startPress(p.id)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
          onClick={()=>onCardTap(p.id)}
          style={{display:'flex',alignItems:'flex-start',gap:10,padding:'12px 14px',cursor:'pointer',userSelect:'none',WebkitTapHighlightColor:'transparent',background:selMode&&sel.includes(p.id)?'var(--surface-2)':'none'}}
        >
          {selMode&&<span style={{color:sel.includes(p.id)?'var(--accent-text)':'var(--ink-faint)',marginTop:2,flexShrink:0,display:'flex'}}>{sel.includes(p.id)?<ChkSq/>:<SqI/>}</span>}
          <div style={{flex:1,minWidth:0}}>
            <Row style={{justifyContent:'space-between'}}>
              <span style={{fontWeight:700,fontSize:14}}>{p.nombre}</span>
              <span style={{fontWeight:800,color:'var(--accent-text)',fontSize:14}}>{fmt(p.precio)}</span>
            </Row>
            <Row style={{marginTop:4}}><Tag color={p.stock<10?'var(--danger-text)':'var(--ok-text)'}>{p.stock} {p.unidad}</Tag></Row>
            {p.codigoBarras&&<div style={{fontSize:10,color:'var(--ink-faint)',marginTop:3}}>🏷️ {p.codigoBarras}</div>}
          </div>
        </div>
        <div style={{maxHeight:expanded?120:0,overflow:'hidden',transition:'max-height .2s ease'}}>
          <Row style={{gap:8,padding:'0 14px 12px'}}>
            {puedeEditar&&<BOut onClick={()=>{setForm({...p,precio:String(p.precio),stock:String(p.stock),codigoBarras:p.codigoBarras||'',motivo:''});setExpandedId(null);}} style={{flex:1}}>✏️ Editar</BOut>}
            {isAdmin&&<BOut onClick={()=>entrarSeleccion(p.id)} style={{flex:1}}>☑️ Seleccionar</BOut>}
            {isAdmin&&<BOut onClick={()=>{ if(window.confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) db.collection('productos').doc(p.id).delete(); setExpandedId(null); }} color="var(--danger-text)" style={{flex:1}}>🗑️ Eliminar</BOut>}
          </Row>
        </div>
      </Card>;
    })}
    {form&&<Modal title={form.id?'Editar Producto':'Nuevo Producto'} onClose={()=>setForm(null)}>
      <Lbl>Nombre</Lbl>
      <Inp value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} style={{marginBottom:10}}/>
      <Row style={{gap:10,marginBottom:10}}>
        <div style={{flex:1}}><Lbl>Precio ($)</Lbl><Inp type="number" value={form.precio} onChange={e=>setForm(f=>({...f,precio:e.target.value}))}/></div>
        <div style={{flex:1}}><Lbl>Stock</Lbl><Inp type="number" value={form.stock} onChange={e=>setForm(f=>({...f,stock:e.target.value}))}/></div>
      </Row>
      <Lbl>Unidad</Lbl>
      <Inp value={form.unidad} onChange={e=>setForm(f=>({...f,unidad:e.target.value}))} placeholder="garrafón, bolsa…" style={{marginBottom:10}}/>
      <Lbl>Código de barras</Lbl>
      <Row style={{gap:8,marginBottom:10}}>
        <Inp value={form.codigoBarras||''} onChange={e=>setForm(f=>({...f,codigoBarras:e.target.value}))} placeholder="Escanea o escribe el código" style={{flex:1}}/>
        <BOut onClick={()=>setScanOpen(true)} style={{flexShrink:0,padding:'8px 12px'}}>📷</BOut>
      </Row>
      <Lbl>Motivo del cambio de inventario (opcional)</Lbl>
      <Inp value={form.motivo||''} onChange={e=>setForm(f=>({...f,motivo:e.target.value}))} placeholder="Ej. compra a proveedor, merma, conteo físico…" style={{marginBottom:6}}/>
      <div style={{fontSize:11,color:'var(--ink-faint)',marginBottom:16}}>Se registra en el historial de inventario si cambias la cantidad de stock.</div>
      <BFill onClick={save} style={{width:'100%'}} disabled={saving}>{saving?'Guardando…':'💾 Guardar'}</BFill>
    </Modal>}
    {scanOpen&&<BarcodeScanner onDetected={code=>{setForm(f=>({...f,codigoBarras:code}));setScanOpen(false);}} onClose={()=>setScanOpen(false)}/>}
    {histOpen&&<InventarioHistorial onClose={()=>setHistOpen(false)}/>}
  </div>;
}
