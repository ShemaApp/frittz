/* ── Créditos ── */
function Creditos({creditos,currentUser}){
  const puedeEditar=currentUser?.role==='admin'||permisoEdita(currentUser).creditos;
  const [abonoId,setAbonoId]=useState(null);
  const [monto,setMonto]=useState('');
  const [savingAbono,setSavingAbono]=useState(false);
  const pend=creditos.filter(c=>c.saldo>0);
  const totalPend=pend.reduce((s,c)=>s+c.saldo,0);
  const abonar=async(c)=>{
    if(savingAbono) return;
    let m=parseFloat(monto); if(!m||m<=0) return;
    m=Math.min(m,c.saldo);
    setSavingAbono(true);
    try{
      await db.collection('creditos').doc(c.id).update({
        saldo:firebase.firestore.FieldValue.increment(-m),
        abonos:firebase.firestore.FieldValue.arrayUnion({fecha:new Date().toISOString(),monto:m})
      });
      setMonto(''); setAbonoId(null);
    }catch(e){ alert('Error al registrar abono: '+e.message); }
    setSavingAbono(false);
  };
  return <div style={{padding:'16px 12px'}}>
    <div style={{fontSize:20,fontWeight:800,marginBottom:12}}>💳 Créditos</div>
    <Card style={{borderLeft:'3px solid var(--warn-text)',marginBottom:14}}>
      <div style={{fontSize:12,color:'var(--ink-soft)'}}>Total pendiente</div>
      <div style={{fontSize:28,fontWeight:800,color:'var(--warn-text)'}}>{fmt(totalPend)}</div>
      <div style={{fontSize:11,color:'var(--ink-faint)'}}>{pend.length} cuenta(s)</div>
    </Card>
    {pend.length===0&&<div style={{textAlign:'center',color:'var(--ink-faint)',fontSize:14,paddingTop:20}}>Sin créditos pendientes ✅</div>}
    {pend.map(c=><Card key={c.id}>
      <Row style={{justifyContent:'space-between',marginBottom:8}}>
        <div><div style={{fontWeight:700,fontSize:14}}>{c.clienteNombre}</div><div style={{fontSize:11,color:'var(--ink-faint)'}}>{fDate(c.fecha)}</div></div>
        <div style={{textAlign:'right'}}><div style={{fontSize:18,fontWeight:800,color:'var(--warn-text)'}}>{fmt(c.saldo)}</div><div style={{fontSize:11,color:'var(--ink-faint)'}}>de {fmt(c.total)}</div></div>
      </Row>
      <div style={{background:'var(--surface-2)',borderRadius:10,height:6,marginBottom:10}}>
        <div style={{background:'var(--ok)',borderRadius:10,height:6,width:`${Math.round((c.total-c.saldo)/c.total*100)}%`}}/>
      </div>
      {c.abonos.length>0&&<div style={{marginBottom:10,paddingTop:6,borderTop:'1px solid var(--line)'}}>
        <div style={{fontSize:11,color:'var(--ink-faint)',marginBottom:4,fontWeight:700}}>ABONOS</div>
        {c.abonos.map((a,i)=><Row key={i} style={{justifyContent:'space-between',fontSize:12,marginBottom:3}}>
          <span style={{color:'var(--ink-soft)'}}>{fDate(a.fecha)}</span>
          <span style={{color:'var(--ok-text)',fontWeight:700}}>+{fmt(a.monto)}</span>
        </Row>)}
      </div>}
      {puedeEditar&&(abonoId===c.id?<Row style={{gap:8}}>
        <Inp type="number" placeholder="Monto abono…" value={monto} onChange={e=>setMonto(e.target.value)} style={{flex:1}}/>
        <BFill onClick={()=>abonar(c)} bg="var(--ok)" color="var(--ink)" style={{padding:'8px 14px',opacity:savingAbono?0.6:1}} disabled={savingAbono}>{savingAbono?'…':'✓'}</BFill>
        <button onClick={()=>{setAbonoId(null);setMonto('');}} style={{background:'none',border:'none',color:'var(--ink-soft)',cursor:'pointer',display:'flex'}}><XI size={18}/></button>
      </Row>:<BOut onClick={()=>setAbonoId(c.id)} color="var(--ok-text)" style={{width:'100%'}}>+ Registrar abono</BOut>)}
    </Card>)}
  </div>;
}
