/* ── Crear Nota ── */
function CrearNota({productos,clientes,currentUser,ventaRapida,onVentaRapidaConsumida}){
  const [cliOpen,setCliOpen]=useState(true);
  const [prodOpen,setProdOpen]=useState(false);
  const [cliMode,setCliMode]=useState('buscar');
  const [cliSearch,setCliSearch]=useState('');
  const [cliSel,setCliSel]=useState(null);
  const [nuevoC,setNuevoC]=useState({nombre:'',telefono:''});
  const [cart,setCart]=useState([]);
  const [pago,setPago]=useState('efectivo');
  const [done,setDone]=useState(null);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if(ventaRapida){
      setCliMode('nuevo'); setNuevoC({nombre:'Venta mostrador',telefono:''}); setCliOpen(false); setProdOpen(true);
      onVentaRapidaConsumida&&onVentaRapidaConsumida();
    }
  },[ventaRapida]);
  const cliFilt=clientes.filter(c=>c.activo&&c.nombre.toLowerCase().includes(cliSearch.toLowerCase()));
  const addCart=p=>setCart(c=>{ const ex=c.find(x=>x.id===p.id); return ex?c.map(x=>x.id===p.id?{...x,cant:x.cant+1}:x):[...c,{id:p.id,nombre:p.nombre,precio:p.precio,cant:1}]; });
  const updQty=(id,v)=>{ if(v<1){setCart(c=>c.filter(x=>x.id!==id));return;} setCart(c=>c.map(x=>x.id===id?{...x,cant:v}:x)); };
  const total=cart.reduce((s,x)=>s+x.precio*x.cant,0);
  const cliente=cliMode==='nuevo'?nuevoC:cliSel;
  const canSave=cliente?.nombre&&cart.length>0;
  const makeWA=(cl,items,tot,fp)=>{
    const lines=items.map(x=>`• ${x.nombre} x${x.cant} = ${fmt(x.precio*x.cant)}`).join('\n');
    const text=`🧾 *PEDIDO*\n👤 ${cl.nombre}\n\n${lines}\n\n💰 *Total: ${fmt(tot)}*\nPago: ${fp}`;
    let telefono=(cl.telefono||'').replace(/\D/g,'');
    if(!telefono.startsWith('52')&&telefono.length<=10) telefono='52'+telefono;
    return `https://wa.me/${telefono}?text=${encodeURIComponent(text)}`;
  };
  const guardar=async()=>{
    if(!canSave) return;
    setSaving(true);
    try{
      const stockErrors=[];
      cart.forEach(item=>{
        const producto=productos.find(p=>p.id===item.id);
        if(!producto||producto.stock<item.cant) stockErrors.push(`${item.nombre} (disponible: ${producto?.stock||0}, solicitado: ${item.cant})`);
      });
      if(stockErrors.length>0){ alert('❌ Stock insuficiente:\n'+stockErrors.join('\n')); setSaving(false); return; }
      let cl=cliSel;
      if(cliMode==='nuevo'){
        const ref=await db.collection('clientes').add({nombre:nuevoC.nombre,telefono:nuevoC.telefono||'',domicilio:'',activo:true});
        cl={id:ref.id,nombre:nuevoC.nombre,telefono:nuevoC.telefono||''};
      }
      const nota={fecha:new Date().toISOString(),clienteId:cl.id,clienteNombre:cl.nombre,clienteTelefono:cl.telefono||'',items:cart.map(x=>({...x})),total,formaPago:pago,capturadoPorUid:currentUser.uid,capturadoPorNombre:currentUser.nombre};
      const notaRef=await db.collection('notas').add(nota);
      if(pago==='credito') await db.collection('creditos').add({notaId:notaRef.id,clienteId:cl.id,clienteNombre:cl.nombre,fecha:nota.fecha,total,saldo:total,abonos:[]});
      const batch=db.batch();
      cart.forEach(item=>{
        batch.update(db.collection('productos').doc(item.id),{stock:firebase.firestore.FieldValue.increment(-item.cant)});
      });
      await batch.commit();
      setDone({nota:{...nota,id:notaRef.id},cl});
      setCart([]); setCliSel(null); setNuevoC({nombre:'',telefono:''}); setCliMode('buscar');
    }catch(e){ alert('Error al guardar el pedido: '+e.message); }
    setSaving(false);
  };
  if(done) return <div style={{padding:24,textAlign:'center'}}>
    <div style={{fontSize:52,marginBottom:8}}>✅</div>
    <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Pedido guardado</div>
    <div style={{color:'var(--ink-soft)',marginBottom:24}}>{done.cl.nombre} · {fmt(done.nota.total)}</div>
    {done.cl.telefono&&<BFill onClick={()=>window.open(makeWA(done.cl,done.nota.items,done.nota.total,done.nota.formaPago),'_blank')} bg="#25d366" style={{width:'100%',marginBottom:12,fontSize:15}}>📲 Enviar ticket por WhatsApp</BFill>}
    <BOut onClick={()=>setDone(null)} color="var(--accent-text)" style={{width:'100%'}}>+ Nuevo pedido</BOut>
  </div>;
  return <div style={{padding:'16px 12px'}}>
    <div style={{fontSize:20,fontWeight:800,marginBottom:12}}>🧾 Crear Pedido</div>
    <Card>
      <button onClick={()=>setCliOpen(o=>!o)} style={{background:'none',border:'none',color:'var(--ink)',width:'100%',textAlign:'left',cursor:'pointer',padding:0}}>
        <Row style={{justifyContent:'space-between'}}>
          <span style={{fontWeight:700}}>👤 Cliente {((cliMode==='nuevo'&&nuevoC.nombre)||cliSel)?'✅':''}</span>
          {cliOpen?<CUp/>:<CDown/>}
        </Row>
        {!cliOpen&&cliSel&&<div style={{fontSize:12,color:'var(--accent-text)',marginTop:2}}>{cliSel.nombre} · {cliSel.telefono}</div>}
        {!cliOpen&&cliMode==='nuevo'&&nuevoC.nombre&&<div style={{fontSize:12,color:'var(--accent-text)',marginTop:2}}>{nuevoC.nombre}</div>}
      </button>
      {cliOpen&&<div style={{marginTop:12}}>
        <Row style={{gap:6,marginBottom:10}}>
          {[['buscar','Existente'],['nuevo','Nuevo']].map(([v,l])=>(
            <button key={v} onClick={()=>setCliMode(v)} style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:cliMode===v?'var(--accent)':'var(--surface-2)',color:cliMode===v?'var(--ink)':'var(--ink-soft)',fontSize:12,fontWeight:700,cursor:'pointer'}}>{l}</button>
          ))}
        </Row>
        {cliMode==='buscar'?<>
          <Inp placeholder="Buscar cliente…" value={cliSearch} onChange={e=>setCliSearch(e.target.value)} style={{marginBottom:8}}/>
          <div style={{maxHeight:170,overflowY:'auto'}}>
            {cliFilt.map(c=><div key={c.id} onClick={()=>{setCliSel(c);setCliOpen(false);}} style={{padding:'9px 10px',borderRadius:8,cursor:'pointer',background:cliSel?.id===c.id?'var(--info-bg)':'transparent',marginBottom:3}}>
              <div style={{fontWeight:600,fontSize:13}}>{c.nombre}</div>
              <div style={{fontSize:11,color:'var(--ink-soft)'}}>📱 {c.telefono}</div>
            </div>)}
          </div>
        </>:<>
          <Inp placeholder="Nombre *" value={nuevoC.nombre} onChange={e=>setNuevoC(x=>({...x,nombre:e.target.value}))} style={{marginBottom:8}}/>
          <Inp placeholder="Teléfono" type="tel" value={nuevoC.telefono} onChange={e=>setNuevoC(x=>({...x,telefono:e.target.value}))}/>
        </>}
      </div>}
    </Card>
    <Card>
      <button onClick={()=>setProdOpen(o=>!o)} style={{background:'none',border:'none',color:'var(--ink)',width:'100%',textAlign:'left',cursor:'pointer',padding:0}}>
        <Row style={{justifyContent:'space-between'}}>
          <span style={{fontWeight:700}}>📦 Productos {cart.length?`(${cart.reduce((s,x)=>s+x.cant,0)} artículos)`:''}</span>
          {prodOpen?<CUp/>:<CDown/>}
        </Row>
      </button>
      {prodOpen&&<div style={{marginTop:12,maxHeight:220,overflowY:'auto'}}>
        {productos.map(p=><Row key={p.id} style={{justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--line)'}}>
          <div>
            <div style={{fontSize:13,fontWeight:600}}>{p.nombre}</div>
            <div style={{fontSize:11,color:'var(--accent-text)'}}>{fmt(p.precio)} / {p.unidad}</div>
          </div>
          <BFill onClick={()=>addCart(p)} style={{padding:'5px 12px',fontSize:12}}>+ Agregar</BFill>
        </Row>)}
      </div>}
    </Card>
    {cart.length>0&&<Card>
      <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginBottom:10}}>RESUMEN DEL PEDIDO</div>
      {cart.map(item=><Row key={item.id} style={{justifyContent:'space-between',marginBottom:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.nombre}</div>
          <div style={{fontSize:11,color:'var(--ink-faint)'}}>{fmt(item.precio)} c/u</div>
        </div>
        <Row style={{gap:5,flexShrink:0}}>
          <button onClick={()=>updQty(item.id,item.cant-1)} style={{background:'var(--surface-2)',border:'none',color:'var(--ink)',borderRadius:6,width:26,height:26,cursor:'pointer',fontSize:15}}>-</button>
          <input type="number" min="1" value={item.cant} onChange={e=>{ const v=e.target.value; if(v===''){return;} const n=parseInt(v); if(!isNaN(n)&&n>=1) updQty(item.id,n); }} onBlur={e=>{ if(!e.target.value||parseInt(e.target.value)<1) updQty(item.id,1); }} style={{width:44,textAlign:'center',fontWeight:700,fontSize:14,background:'var(--surface-2)',border:'1px solid var(--line-strong)',borderRadius:6,color:'var(--ink)',padding:'4px 2px'}}/>
          <button onClick={()=>updQty(item.id,item.cant+1)} style={{background:'var(--surface-2)',border:'none',color:'var(--ink)',borderRadius:6,width:26,height:26,cursor:'pointer',fontSize:15}}>+</button>
        </Row>
        <div style={{minWidth:62,textAlign:'right',fontWeight:700,color:'var(--accent-text)',fontSize:13}}>{fmt(item.precio*item.cant)}</div>
      </Row>)}
      <div style={{borderTop:'1px solid var(--line)',paddingTop:10,marginTop:4,marginBottom:12}}>
        <Row style={{justifyContent:'space-between'}}>
          <span style={{fontWeight:700,fontSize:15}}>Total</span>
          <span style={{fontSize:22,fontWeight:800,color:'var(--accent-text)'}}>{fmt(total)}</span>
        </Row>
      </div>
      <Row style={{gap:8,marginBottom:12}}>
        {[['efectivo','💵 Efectivo','var(--ok-bg)','var(--ok-text)'],['transferencia','🏦 Transferencia','var(--info-bg)','var(--info-text)'],['credito','📋 Crédito','var(--warn-bg)','var(--warn-text)']].map(([v,l,bg,col])=>(
          <button key={v} onClick={()=>setPago(v)} style={{flex:1,padding:'9px 2px',borderRadius:8,border:'none',background:pago===v?bg:'var(--surface-2)',color:pago===v?col:'var(--ink-soft)',fontSize:11,fontWeight:700,cursor:'pointer'}}>{l}</button>
        ))}
      </Row>
      <Row style={{gap:8}}>
        <BFill onClick={guardar} bg={canSave&&!saving?'var(--accent)':'var(--line-strong)'} color={canSave&&!saving?'var(--ink)':'var(--ink-faint)'} style={{flex:1}} disabled={!canSave||saving}>{saving?'Guardando…':'💾 Guardar pedido'}</BFill>
        {cliente?.telefono&&<BFill onClick={()=>window.open(makeWA(cliente,cart,total,pago),'_blank')} bg="#25d366" style={{padding:'8px 16px',fontSize:18}}>📲</BFill>}
      </Row>
    </Card>}
  </div>;
}
