const { useState, useEffect, useRef } = React;

const uid = ()=>Date.now().toString(36)+Math.random().toString(36).slice(2);

// true si el snapshot trae al menos un documento con una escritura local
// que todavía no se confirma con el servidor (offline o en cola de subida).
const snapTienePendientes = snap => snap.docs.some(d => d.metadata.hasPendingWrites);

// PIN de acceso rápido: candado LOCAL sobre una sesión de Firebase ya
// iniciada (no reemplaza la contraseña, no se manda a Firebase). Se guarda
// solo un hash+sal en localStorage de este dispositivo, por uid.
const pinKey = uid_ => 'pdc_pin_'+uid_;
const hashPin = async (pin,salt)=>{
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin+':'+salt));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
};
const savePin = async (uid_,pin)=>{
  const salt = uid()+uid();
  const hash = await hashPin(pin,salt);
  localStorage.setItem(pinKey(uid_), JSON.stringify({hash,salt,len:pin.length}));
};
const clearPin = uid_ => localStorage.removeItem(pinKey(uid_));
const fmt = n=>'$'+Number(n||0).toFixed(2);
const fDate = d=>new Date(d).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'});
// S_PROD y S_CLI se usan solo como datos semilla la primera vez que Firestore está vacío
const S_PROD = [
  {identificación: 'p1', nombre: 'Paquete jumbo', precio: 250.00, existencias: 298, unidad: 'paquete', código: '750000000010'},
  {identificación: 'p2', nombre: 'Sueros', precio: 290.00, existencias: 300, unidad: 'paquete (12 pzas)', código: '750000000015'},
  {identificación: 'p3', nombre: 'Papa ondulada', precio: 13.00, existencias: 5050, unidad: 'pieza', código: '750000000003'},
  {identificación: 'p4', nombre: 'Paquete fiesta', precio: 85.00, existencias: 200, unidad: 'paquete', código: '01 526371137561 002'},
  {identificación: 'p5', nombre: 'Paquete Maruchan', precio: 185.00, existencias: 299, unidad: 'paquete (12 pzas)', código: '750000000012'},
  {identificación: 'p6', nombre: 'Amper Energy', precio: 210.00, existencias: 300, unidad: '12 pack', código: '750000000014'},
  {identificación: 'p7', nombre: 'Chicharrón de puerco', precio: 27.00, existencias: 500, unidad: 'pieza', código: '750000000004'},
  {identificación: 'p8', nombre: 'Paquete grande', precio: 30.00, existencias: 200, unidad: 'paquete', código: '750000000008'},
  {identificación: 'p9', nombre: 'Frituras', precio: 10.00, existencias: 10000, unidad: 'pieza', código: '750000000001'},
  {identificación: 'p10', nombre: 'Paquete mixto grande', precio: 35.00, existencias: 200, unidad: 'paquete', código: '750000000009'},
  {identificación: 'p11', nombre: 'Bolis pack', precio: 72.00, existencias: 299, unidad: 'Pqt', código: '750000000005'},
  {identificación: 'p12', nombre: 'Cacahuates', precio: 15.00, existencias: 4997, unidad: 'pieza', código: '750000000002'},
  {identificación: 'p13', nombre: 'Bolis pieza', precio: 6.00, existencias: 9999, unidad: 'pieza', código: '750000000006'}
];

const S_CLI = [
  {identificación: 'c1', nombre: 'Doña María los Sapos', dirección: 'Campo los Sapos'},
  {identificación: 'c2', nombre: 'Doña Luz', dirección: 'Santa Cecilia'},
  {identificación: 'c3', nombre: 'Doña Cecilia los Sapos', dirección: 'Los sapos'}
];

/* ── Icons ── */
const Ic = ({children,size=18})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
const CDown = ()=><Ic><polyline points="6 9 12 15 18 9"/></Ic>;
const CUp   = ()=><Ic><polyline points="18 15 12 9 6 15"/></Ic>;
const XI    = ({size=20})=><Ic size={size}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Ic>;
const ChkSq = ()=><Ic><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Ic>;
const SqI   = ()=><Ic><rect x="3" y="3" width="18" height="18" rx="2"/></Ic>;
const EyeI  = ()=><Ic size={16}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></Ic>;
const EyeX  = ()=><Ic size={16}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></Ic>;
const Gear  = ()=><Ic><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></Ic>;
const Menu  = ()=><Ic><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></Ic>;

/* ── UI Atoms ── */
const Card  = ({children,style={}})=><div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:4,padding:'12px 14px',marginBottom:10,...style}}>{children}</div>;
const BFill = ({children,onClick,bg='var(--accent)',color='var(--accent-ink)',style={},...p})=><button onClick={onClick} style={{background:bg,color,border:'none',borderRadius:3,padding:'9px 14px',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'var(--font-display)',textTransform:'uppercase',letterSpacing:'.03em',...style}} {...p}>{children}</button>;
const BOut  = ({children,onClick,color='var(--accent-text)',style={},...p})=><button onClick={onClick} style={{background:'transparent',color,border:`1.5px solid ${color}`,borderRadius:3,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'var(--font-display)',textTransform:'uppercase',letterSpacing:'.03em',...style}} {...p}>{children}</button>;
const Inp   = ({style={},...p})=><input style={{background:'var(--surface-2)',border:'1px solid var(--line-strong)',borderRadius:3,padding:'8px 10px',color:'var(--ink)',fontSize:13,width:'100%',boxSizing:'border-box',...style}} {...p}/>;
const Lbl   = ({children})=><div style={{fontSize:10,color:'var(--ink-faint)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.06em',fontFamily:'var(--font-mono)',fontWeight:600}}>{children}</div>;
const Row   = ({children,style={}})=><div style={{display:'flex',alignItems:'center',gap:8,...style}}>{children}</div>;
const Tag   = ({children,color='var(--accent-text)',style={}})=><span style={{background:`color-mix(in srgb, ${color} 14%, white)`,color,border:`1px solid color-mix(in srgb, ${color} 45%, white)`,borderRadius:3,padding:'2px 8px',fontSize:11,fontWeight:700,fontFamily:'var(--font-mono)',...style}}>{children}</span>;

function Modal({title,onClose,children}){
  return <div style={{position:'fixed',inset:0,background:'#1B1D19cc',zIndex:300,display:'flex',alignItems:'flex-end'}}>
    <div style={{background:'var(--surface)',width:'100%',maxWidth:420,margin:'0 auto',borderRadius:'6px 6px 0 0',padding:20,paddingTop:16,maxHeight:'90vh',overflowY:'auto',borderTop:'4px solid var(--accent)'}}>
      <Row style={{justifyContent:'space-between',marginBottom:16}}>
        <span style={{fontSize:15,fontWeight:700,fontFamily:'var(--font-display)',textTransform:'uppercase',letterSpacing:'.02em'}}>{title}</span>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--ink-soft)',cursor:'pointer',display:'flex'}}><XI/></button>
      </Row>
      {children}
    </div>
  </div>;
}

/* ── Interruptor ON/OFF reutilizable ── */
/* ── Validación de ubicación de venta (repartidor vs. domicilio del cliente) ──
   Fórmula de Haversine: distancia en metros entre dos coordenadas. Se usa
   para comparar dónde se hizo una venta contra la ubicación registrada del
   cliente, sin exponer nunca la coordenada cruda del repartidor en la nota
   (ver rutas-repartidores.js: guardarVentaRapida / confirmarEntrega). */
function distanciaMetros(lat1,lng1,lat2,lng2){
  const R=6371000, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
// Mismo radio que ya usa el proyecto Sello para su geocerca — así el criterio
// de "¿llegó al cliente?" es consistente entre ambos proyectos.
const RADIO_VISITA_METROS=150;

const Toggle = ({checked,onChange,disabled=false})=>(
  <button
    onClick={()=>!disabled&&onChange(!checked)}
    disabled={disabled}
    aria-pressed={checked}
    style={{width:44,height:26,borderRadius:13,border:'none',padding:2,flexShrink:0,
      background:checked?'var(--ok)':'var(--line-strong)',
      cursor:disabled?'default':'pointer',position:'relative',
      transition:'background .15s',opacity:disabled?0.5:1}}>
    <div style={{width:22,height:22,borderRadius:'50%',background:'#fff',
      transform:checked?'translateX(18px)':'translateX(0)',
      transition:'transform .15s',boxShadow:'0 1px 2px rgba(0,0,0,.3)'}}/>
  </button>
);

/* ── Modelo de permisos por pantalla/formulario ──
   Cada usuario puede tener overrides en usuarios/{uid}.permisos, que se
   combinan sobre los valores por defecto de su rol. Un admin siempre ve y
   edita todo, sin excepción. */
const TABS_INFO = [
  ['productos','📦','Productos'],
  ['nota','🧾','Pedido'],
  ['clientes','👥','Clientes'],
  ['creditos','💳','Créditos'],
  ['ruta','🚚','Ruta'],
  ['repartidores','🧭','Rutas repartidores'],
  ['inventario','📋','Inventario'],
  ['reportes','📈','Reportes'],
  ['gerencia','💰','Gerencia'],
];
const EDICION_INFO = [
  ['productos','📦','Editar / dar de alta productos'],
  ['clientes','👥','Editar / dar de alta clientes'],
  ['creditos','💳','Registrar abonos a créditos'],
];
// Permisos sueltos que no son ni "ver pantalla" ni "editar formulario":
// acciones puntuales del dispositivo o de la cuenta.
const ACCIONES_INFO = [
  ['camara','📷','Usar cámara (escanear QR de cliente)'],
  ['csv','📄','Descargar reportes en CSV'],
  ['gps','📍','Compartir ubicación en vivo (GPS)'],
  ['password','🔑','Cambiar su propia contraseña'],
];
const ACCIONES_DEFAULT_ROL = {
  admin:      {camara:true, csv:true,  gps:true,  password:true},
  usuario:    {camara:false,csv:true,  gps:false, password:true},
  repartidor: {camara:true, csv:false, gps:true,  password:true},
};
const permisoAcciones = u => u?.role==='admin' ? ACCIONES_DEFAULT_ROL.admin : ({...(ACCIONES_DEFAULT_ROL[u?.role]||ACCIONES_DEFAULT_ROL.usuario), ...(u?.permisos?.acciones||{})});
const TABS_DEFAULT_ROL = {
  // 'ruta' (cargar camión, ruta.js) es exclusiva del admin: es quien carga el
  // camión y arranca la ruta. 'repartidores' (rutas-repartidores.js) es el
  // panel de seguimiento/GPS/QR/inventario que sí ven repartidor y admin,
  // pero no 'usuario' de oficina — además de este permiso de pestaña, el
  // propio componente vuelve a validar el rol como defensa adicional.
  // 'gerencia' aquí es solo el default de lectura de esa pestaña.
  admin:      {productos:true,nota:true,clientes:true,creditos:true,ruta:true,repartidores:true, inventario:true, reportes:true, gerencia:true},
  usuario:    {productos:true,nota:true,clientes:true,creditos:true,ruta:false,repartidores:false,inventario:true, reportes:false,gerencia:true},
  repartidor: {productos:false,nota:true,clientes:false,creditos:false,ruta:false,repartidores:true, inventario:false,reportes:false,gerencia:true},
};
const EDITA_DEFAULT_ROL = {
  admin:      {productos:true,clientes:true,creditos:true},
  usuario:    {productos:true,clientes:true,creditos:true},
  repartidor: {productos:false,clientes:false,creditos:false},
};
const permisoTabs = u => ({...(TABS_DEFAULT_ROL[u?.role]||TABS_DEFAULT_ROL.usuario), ...(u?.permisos?.tabs||{})});
const permisoEdita = u => u?.role==='admin' ? EDITA_DEFAULT_ROL.admin : ({...(EDITA_DEFAULT_ROL[u?.role]||EDITA_DEFAULT_ROL.usuario), ...(u?.permisos?.edita||{})});

function PwInp({value,onChange,placeholder}){
  const [show,setShow]=useState(false);
  return <div style={{position:'relative',marginBottom:10}}>
    <Inp type={show?'text':'password'} value={value} onChange={onChange} placeholder={placeholder||'••••••'} style={{paddingRight:38}}/>
    <button onClick={()=>setShow(v=>!v)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--ink-faint)',cursor:'pointer',padding:0,display:'flex'}}>
      {show?<EyeX/>:<EyeI/>}
    </button>
  </div>;
}

/* ── Escáner de código de barras (cámara) ── */
function BarcodeScanner({onDetected,onClose}){
  const [elId]=useState(()=>'scanner-'+uid());
  const [err,setErr]=useState('');
  useEffect(()=>{
    if(typeof Html5Qrcode==='undefined'){ setErr('No se pudo cargar la librería de escaneo. Revisa tu conexión a internet.'); return; }
    let scanner=null, stopped=false, cancelled=false;
    (async()=>{
      try{
        scanner=new Html5Qrcode(elId);
        await scanner.start(
          {facingMode:'environment'},
          {fps:10,qrbox:{width:260,height:130}},
          (decodedText)=>{
            if(stopped||cancelled) return;
            stopped=true;
            scanner.stop().then(()=>scanner.clear()).catch(()=>{});
            onDetected(decodedText);
          },
          ()=>{}
        );
      }catch(e){ if(!cancelled) setErr('No se pudo acceder a la cámara. Revisa los permisos del navegador.'); }
    })();
    return ()=>{
      cancelled=true;
      if(scanner&&!stopped){
        stopped=true;
        try{ scanner.stop().then(()=>scanner.clear()).catch(()=>{}); }catch(e){}
      }
    };
  },[]);
  return <Modal title="📷 Escanear código de barras" onClose={onClose}>
    {err
      ?<div style={{fontSize:13,color:'var(--danger-text)',textAlign:'center',padding:'24px 0'}}>{err}</div>
      :<div id={elId} style={{width:'100%',borderRadius:4,overflow:'hidden',background:'#000'}}/>}
    <div style={{fontSize:11,color:'var(--ink-faint)',textAlign:'center',marginTop:10}}>Apunta la cámara al código de barras del producto</div>
  </Modal>;
}
