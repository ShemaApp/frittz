/* ── Dashboard ── */
function StatTile({value,label,bg,color,onClick}){
  return <div onClick={onClick} style={{background:bg,color,borderRadius:6,padding:'16px 14px',cursor:onClick?'pointer':'default',display:'flex',flexDirection:'column',minHeight:118,justifyContent:'space-between'}}>
    <div>
      <div style={{fontSize:28,fontWeight:800,fontFamily:'var(--font-display)',lineHeight:1}}>{value}</div>
      <div style={{fontSize:12,fontWeight:600,marginTop:6}}>{label}</div>
    </div>
    {onClick&&<Row style={{gap:4,fontSize:11,fontWeight:700,opacity:.85,marginTop:8}}><span>Ver más</span><span>→</span></Row>}
  </div>;
}

function Dashboard({notas,productos,creditos,clientes,rutas,currentUser,onIrA,onVentaRapida,onAgregarProducto,onAgregarUsuario}){
  const isAdmin=currentUser.role==='admin';
  const isRepartidor=currentUser.role==='repartidor';
  const esEfectivo=fp=>fp==='efectivo'||fp==='contado';
  const hoy=new Date().toDateString();
  const vhoy=notas.filter(n=>new Date(n.fecha).toDateString()===hoy);
  const thoy=vhoy.reduce((s,n)=>s+n.total,0);
  const pend=creditos.filter(c=>c.saldo>0);
  const tcred=pend.reduce((s,c)=>s+c.saldo,0);
  const bajo=productos.filter(p=>p.stock<10);
  const bmap=notas.reduce((m,n)=>{ m[n.clienteId]=m[n.clienteId]||{nombre:n.clienteNombre,total:0,count:0}; m[n.clienteId].total+=n.total; m[n.clienteId].count+=1; return m; },{});
  const top=Object.values(bmap).sort((a,b)=>b.total-a.total).slice(0,5);
  const maxT=top[0]?.total||1;

  // ── Solo para repartidor: sus propias cifras del día ──
  const misNotasHoy=vhoy.filter(n=>n.capturadoPorUid===currentUser.uid);
  const miVentaEfectivoHoy=misNotasHoy.filter(n=>esEfectivo(n.formaPago)).reduce((s,n)=>s+n.total,0);
  const misClientesHoy=new Set(misNotasHoy.map(n=>n.clienteId)).size;
  const rutaActiva=(rutas||[]).find(r=>r.estado==='activa');

  const acciones=[
    ...(!isRepartidor?[{icon:'📦',label:'Agregar producto',onClick:onAgregarProducto}]:[]),
    {icon:'🧾',label:'Agregar pedido',onClick:()=>onIrA('nota')},
    {icon:'⚡',label:'Venta rápida',onClick:onVentaRapida},
    {icon:'💰',label:'Agregar gasto',onClick:()=>onIrA('gerencia')},
    ...(isAdmin?[{icon:'👤',label:'Agregar usuario',onClick:onAgregarUsuario}]:[]),
  ];

  return <div style={{padding:'16px 12px'}}>
    <div style={{fontSize:20,fontWeight:800,marginBottom:14}}>📊 Inicio</div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
      {isRepartidor?<>
        <StatTile value={misNotasHoy.length} label="Entregas de hoy" bg="var(--rail)" color="var(--rail-ink)" onClick={()=>onIrA('ruta')}/>
        <StatTile value={fmt(miVentaEfectivoHoy)} label="Venta efectivo hoy" bg="var(--accent)" color="var(--accent-ink)" onClick={()=>onIrA('gerencia')}/>
        <StatTile value={misClientesHoy} label="Clientes atendidos hoy" bg="var(--info)" color="#fff" onClick={()=>onIrA('ruta')}/>
        <StatTile value={rutaActiva?'Activa':'Sin ruta'} label="Estado de tu ruta" bg={rutaActiva?'var(--ok)':'var(--warn)'} color="#fff" onClick={()=>onIrA('ruta')}/>
      </>:<>
        <StatTile value={vhoy.length} label="Pedidos de hoy" bg="var(--rail)" color="var(--rail-ink)" onClick={()=>onIrA('nota')}/>
        <StatTile value={fmt(thoy)} label="Ingresos de hoy" bg="var(--accent)" color="var(--accent-ink)" onClick={()=>onIrA('gerencia')}/>
        <StatTile value={clientes.filter(c=>c.activo).length} label="Clientes registrados" bg="var(--info)" color="#fff" onClick={()=>onIrA('clientes')}/>
        <StatTile value={fmt(tcred)} label="Créditos pendientes" bg="var(--warn)" color="#fff" onClick={()=>onIrA('creditos')}/>
      </>}
    </div>

    <Card>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12,fontFamily:'var(--font-display)',textTransform:'uppercase',letterSpacing:'.02em'}}>Acciones rápidas</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {acciones.map(a=><button key={a.label} onClick={a.onClick} style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:6,padding:'14px 8px',display:'flex',flexDirection:'column',alignItems:'center',gap:6,cursor:'pointer'}}>
          <span style={{fontSize:22}}>{a.icon}</span>
          <span style={{fontSize:12,fontWeight:600,textAlign:'center',color:'var(--ink)'}}>{a.label}</span>
        </button>)}
      </div>
    </Card>

    {!isRepartidor&&<>
      {top.length>0&&<Card>
        <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginBottom:10}}>🏆 CLIENTES QUE MÁS COMPRAN</div>
        {top.map((b,i)=><div key={i} style={{marginBottom:10}}>
          <Row style={{justifyContent:'space-between',marginBottom:3}}>
            <span style={{fontSize:13,fontWeight:600}}>{b.nombre}</span>
            <Row style={{gap:6}}><Tag color="var(--ink-faint)">{b.count} ped.</Tag><span style={{fontSize:13,fontWeight:700,color:'var(--accent-text)'}}>{fmt(b.total)}</span></Row>
          </Row>
          <div style={{background:'var(--surface-2)',borderRadius:10,height:5}}>
            <div style={{background:'linear-gradient(90deg,var(--accent),var(--warn))',borderRadius:10,height:5,width:`${(b.total/maxT*100).toFixed(0)}%`}}/>
          </div>
        </div>)}
      </Card>}
      {bajo.length>0&&<Card style={{borderLeft:'3px solid var(--danger-text)'}}>
        <div style={{fontSize:12,color:'var(--danger-text)',fontWeight:700,marginBottom:6}}>⚠️ Stock bajo</div>
        {bajo.map(p=><Row key={p.id} style={{justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:13}}>{p.nombre}</span><Tag color="var(--danger-text)">{p.stock} {p.unidad}</Tag></Row>)}
      </Card>}
      {vhoy.length>0&&<Card>
        <div style={{fontSize:11,color:'var(--ink-faint)',fontWeight:700,marginBottom:8}}>PEDIDOS DE HOY</div>
        {vhoy.map(n=><Row key={n.id} style={{justifyContent:'space-between',paddingBottom:8,borderBottom:'1px solid var(--line)',marginBottom:4}}>
          <div><div style={{fontSize:13,fontWeight:600}}>{n.clienteNombre}</div><div style={{fontSize:11,color:'var(--ink-faint)'}}>{n.items.length} prod. · {n.formaPago}</div></div>
          <span style={{fontWeight:700,color:'var(--accent-text)'}}>{fmt(n.total)}</span>
        </Row>)}
      </Card>}
    </>}
  </div>;
}
