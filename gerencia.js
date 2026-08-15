const esVentaEfectivo = fp => fp === 'efectivo' || fp === 'contado';
const mismoDia = (isoA, isoB) => new Date(isoA).toDateString() === new Date(isoB).toDateString();
function Gerencia({ currentUser, notas, creditos }) {
    const isAdmin = currentUser.role === 'admin';
    const [gastos, setGastos] = useState(null);
    const [cierres, setCierres] = useState(null);
    const [form, setForm] = useState({ pagadoA: '', monto: '', motivo: '', formaPago: 'efectivo' });
    const [saving, setSaving] = useState(false);
    const [rango, setRango] = useState('semana');
    const [expandedId, setExpandedId] = useState(null);
    const [cierreOpen, setCierreOpen] = useState(false);
    const [cierreSaving, setCierreSaving] = useState(false);
    const pressTimer = useRef(null);
    const longPressed = useRef(false);
    const startPress = id => {
        longPressed.current = false;
        clearTimeout(pressTimer.current);
        pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            if (navigator.vibrate)
                navigator.vibrate(12);
            setExpandedId(eid => eid === id ? null : id);
        }, 500);
    };
    const cancelPress = () => clearTimeout(pressTimer.current);
    const onGastoTap = id => {
        if (longPressed.current) {
            longPressed.current = false;
            return;
        }
        if (expandedId === id)
            setExpandedId(null);
    };
    const [msg, setMsg] = useState('');
    const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
    useEffect(() => {
        const query = isAdmin
            ? db.collection('gastos').orderBy('fecha', 'desc').limit(500)
            : db.collection('gastos').where('capturadoPorUid', '==', currentUser.uid).orderBy('fecha', 'desc').limit(300);
        const unsub = query.onSnapshot(snap => setGastos(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setGastos([]));
        return unsub;
    }, [isAdmin, currentUser.uid]);
    useEffect(() => {
        const query = isAdmin
            ? db.collection('cierres_caja').orderBy('fecha', 'desc').limit(200)
            : db.collection('cierres_caja').where('capturadoPorUid', '==', currentUser.uid).orderBy('fecha', 'desc').limit(100);
        const unsub = query.onSnapshot(snap => setCierres(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setCierres([]));
        return unsub;
    }, [isAdmin, currentUser.uid]);
    const guardar = async () => {
        if (!form.pagadoA || !form.monto || +form.monto <= 0) {
            alert('Completa "Pagado a" y un monto válido');
            return;
        }
        setSaving(true);
        try {
            await db.collection('gastos').add({
                fecha: new Date().toISOString(),
                pagadoA: form.pagadoA,
                monto: +form.monto,
                motivo: form.motivo || '',
                formaPago: form.formaPago,
                capturadoPorUid: currentUser.uid,
                capturadoPorNombre: currentUser.nombre,
            });
            setForm({ pagadoA: '', monto: '', motivo: '', formaPago: 'efectivo' });
            flash('✅ Gasto registrado');
        }
        catch (e) {
            alert('Error al guardar el gasto: ' + e.message);
        }
        setSaving(false);
    };
    const eliminar = async (g) => {
        if (!confirm(`¿Eliminar el gasto de ${fmt(g.monto)} a "${g.pagadoA}"?`))
            return;
        await db.collection('gastos').doc(g.id).delete();
    };
    const hoyISO = new Date().toISOString();
    const misGastos = gastos ? gastos.filter(g => g.capturadoPorUid === currentUser.uid) : [];
    const misNotasHoy = (notas || []).filter(n => n.capturadoPorUid === currentUser.uid && mismoDia(n.fecha, hoyISO));
    const ventaEfectivoHoy = misNotasHoy.filter(n => esVentaEfectivo(n.formaPago)).reduce((s, n) => s + n.total, 0);
    // Abonos: viven como arreglo embebido dentro de cada documento de creditos,
    // así que se aplanan primero y luego se filtran igual que cualquier otro
    // movimiento del día (por quién lo capturó y por fecha).
    const misAbonosHoy = (creditos || [])
        .flatMap(c => (c.abonos || []).map(a => ({ ...a, clienteNombre: c.clienteNombre })))
        .filter(a => a.capturadoPorUid === currentUser.uid && mismoDia(a.fecha, hoyISO));
    const abonoEfectivoHoy = misAbonosHoy.filter(a => a.formaPago === 'efectivo').reduce((s, a) => s + a.monto, 0);
    const misGastosHoy = misGastos.filter(g => mismoDia(g.fecha, hoyISO));
    const gastoEfectivoHoy = misGastosHoy.filter(g => g.formaPago === 'efectivo').reduce((s, g) => s + g.monto, 0);
    const gastosTarjetaHoy = misGastosHoy.filter(g => g.formaPago === 'tarjeta');
    // Fórmula base = la que pide modelo.md (HU11): Ventas efectivo + Abonos
    // efectivo. Los créditos otorgados y las ventas por transferencia ya
    // quedan fuera de "ventaEfectivoHoy" por construcción (solo se suman las
    // notas con formaPago==='efectivo'), así que restarlos aparte sería
    // restarlos dos veces — por eso no aparecen como resta explícita aquí.
    const formulaBaseHoy = ventaEfectivoHoy + abonoEfectivoHoy;
    // Ajuste adicional (no pedido por modelo.md, pero es lo que de verdad
    // debe traer de vuelta la persona): descontar lo que ya gastó en efectivo.
    const efectivoEsperadoHoy = formulaBaseHoy - gastoEfectivoHoy;
    const incidenciasInventarioHoy = misNotasHoy.filter(n => n.requiereRevision === true || n.estado === 'incidencia_inventario').flatMap(n => {
        const items = n.incidenciaInventario?.itemsFaltantes || [];
        return [{
            notaId: n.id,
            ventaOfflineId: n.ventaOfflineId || '',
            fecha: n.fecha,
            clienteNombre: n.clienteNombre || '',
            transferenciaId: n.transferenciaId || '',
            items: items.length ? items : (n.items || []).map(item => ({ ...item, cantSolicitada: item.cant, cantAplicada: 0, cantFaltante: item.cant }))
        }];
    });
    const misCierresHoy = (cierres || []).filter(c => c.capturadoPorUid === currentUser.uid && mismoDia(c.fecha, hoyISO));
    const confirmarCierre = async () => {
        setCierreSaving(true);
        try {
            await db.collection('cierres_caja').add({
                fecha: new Date().toISOString(),
                capturadoPorUid: currentUser.uid,
                capturadoPorNombre: currentUser.nombre,
                ventaEfectivo: ventaEfectivoHoy,
                abonoEfectivo: abonoEfectivoHoy,
                gastoEfectivo: gastoEfectivoHoy,
                formulaBase: formulaBaseHoy,
                efectivoAEntregar: efectivoEsperadoHoy,
                numPedidos: misNotasHoy.length,
                numClientesAtendidos: new Set(misNotasHoy.map(n => n.clienteId)).size,
                numIncidenciasInventario: incidenciasInventarioHoy.length,
                incidenciasInventario: incidenciasInventarioHoy,
                gastosTarjetaPendientes: gastosTarjetaHoy.map(g => ({ pagadoA: g.pagadoA, monto: g.monto })),
            });
            flash('✅ Caja cerrada — comprobante guardado');
            setCierreOpen(false);
        }
        catch (e) {
            alert('Error al generar el cierre: ' + e.message);
        }
        setCierreSaving(false);
    };
    const now = new Date();
    const rangeStart = rango === 'semana' ? new Date(now - 7 * 86400000) : rango === 'mes' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(0);
    const filas = {};
    if (isAdmin) {
        (notas || []).filter(n => esVentaEfectivo(n.formaPago) && new Date(n.fecha) >= rangeStart).forEach(n => {
            const key = (n.capturadoPorUid || 'sin_id') + '_' + new Date(n.fecha).toDateString();
            filas[key] = filas[key] || { nombre: n.capturadoPorNombre || 'Sin identificar', fecha: n.fecha, venta: 0, abono: 0, gasto: 0, tarjeta: [] };
            filas[key].venta += n.total;
        });
        (creditos || []).forEach(c => (c.abonos || []).forEach(a => {
            if (!a.capturadoPorUid || a.formaPago !== 'efectivo' || new Date(a.fecha) < rangeStart)
                return;
            const key = a.capturadoPorUid + '_' + new Date(a.fecha).toDateString();
            filas[key] = filas[key] || { nombre: a.capturadoPorNombre || 'Sin identificar', fecha: a.fecha, venta: 0, abono: 0, gasto: 0, tarjeta: [] };
            filas[key].abono += a.monto;
        }));
        (gastos || []).filter(g => new Date(g.fecha) >= rangeStart).forEach(g => {
            const key = g.capturadoPorUid + '_' + new Date(g.fecha).toDateString();
            filas[key] = filas[key] || { nombre: g.capturadoPorNombre, fecha: g.fecha, venta: 0, abono: 0, gasto: 0, tarjeta: [] };
            if (g.formaPago === 'efectivo')
                filas[key].gasto += g.monto;
            else
                filas[key].tarjeta.push(g);
        });
    }
    const filasList = Object.values(filas).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return React.createElement("div", { style: { padding: '16px 12px' } },
        React.createElement("div", { style: { fontSize: 20, fontWeight: 800, marginBottom: 12 } }, "\uD83D\uDCB0 Gerencia"),
        msg && React.createElement("div", { style: { background: 'var(--ok-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--ok-text)', marginBottom: 12 } }, msg),
        React.createElement(Card, { style: { borderLeft: '3px solid var(--accent-text)' } },
            React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 8 } }, "TU CAJA DE HOY"),
            React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement("span", { style: { fontSize: 13 } }, "Venta en efectivo"),
                React.createElement("span", { style: { fontWeight: 700, color: 'var(--ok-text)' } }, fmt(ventaEfectivoHoy))),
            React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement("span", { style: { fontSize: 13 } }, "Abonos en efectivo"),
                React.createElement("span", { style: { fontWeight: 700, color: 'var(--ok-text)' } }, fmt(abonoEfectivoHoy))),
            React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 8, paddingTop: 6, borderTop: '1px dashed var(--line)' } },
                React.createElement("span", { style: { fontSize: 12, color: 'var(--ink-faint)' } }, "= F\u00F3rmula base (modelo.md)"),
                React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' } }, fmt(formulaBaseHoy))),
            React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 8 } },
                React.createElement("span", { style: { fontSize: 13 } }, "Gasto en efectivo"),
                React.createElement("span", { style: { fontWeight: 700, color: 'var(--danger-text)' } },
                    "-",
                    fmt(gastoEfectivoHoy))),
            React.createElement("div", { style: { borderTop: '1px solid var(--line)', paddingTop: 8 } },
                React.createElement(Row, { style: { justifyContent: 'space-between' } },
                    React.createElement("span", { style: { fontWeight: 700 } }, "Efectivo a entregar"),
                    React.createElement("span", { style: { fontSize: 20, fontWeight: 800, color: 'var(--accent-text)' } }, fmt(efectivoEsperadoHoy)))),
            gastosTarjetaHoy.length > 0 && React.createElement("div", { style: { marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line)' } },
                React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 4 } }, "PAGADO CON TARJETA HOY (pendiente que te reembolsen)"),
                gastosTarjetaHoy.map(g => React.createElement(Row, { key: g.id, style: { justifyContent: 'space-between', fontSize: 12, marginBottom: 3 } },
                    React.createElement("span", null, g.pagadoA),
                    React.createElement("span", { style: { fontWeight: 700 } }, fmt(g.monto))))),
            React.createElement(BFill, { onClick: () => setCierreOpen(true), style: { width: '100%', marginTop: 12 } }, "\uD83D\uDD12 Cerrar caja de hoy"),
            misCierresHoy.length > 0 && React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', marginTop: 6, textAlign: 'center' } },
                "Ya cerraste caja ",
                misCierresHoy.length,
                " vez/veces hoy \u2014 puedes volver a cerrar si algo cambi\u00F3, no bloquea nada.")),
        React.createElement(Card, null,
            React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10 } }, "REGISTRAR GASTO"),
            React.createElement(Lbl, null, "Pagado a"),
            React.createElement(Inp, { value: form.pagadoA, onChange: e => setForm(f => ({ ...f, pagadoA: e.target.value })), placeholder: "Ej. Pemex, Materia prima\u2026", style: { marginBottom: 10 } }),
            React.createElement(Lbl, null, "Monto"),
            React.createElement(Inp, { type: "number", value: form.monto, onChange: e => setForm(f => ({ ...f, monto: e.target.value })), placeholder: "0.00", style: { marginBottom: 10 } }),
            React.createElement(Lbl, null, "Motivo (nota)"),
            React.createElement(Inp, { value: form.motivo, onChange: e => setForm(f => ({ ...f, motivo: e.target.value })), placeholder: "Ej. gasolina para la ruta de hoy\u2026", style: { marginBottom: 10 } }),
            React.createElement(Lbl, null, "\u00BFC\u00F3mo se pag\u00F3?"),
            React.createElement(Row, { style: { gap: 8, marginBottom: 14 } }, [['efectivo', '💵 Efectivo', 'var(--ok-bg)', 'var(--ok-text)'], ['tarjeta', '💳 Tarjeta', 'var(--info-bg)', 'var(--info-text)']].map(([v, l, bg, col]) => (React.createElement("button", { key: v, onClick: () => setForm(f => ({ ...f, formaPago: v })), style: { flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: form.formaPago === v ? bg : 'var(--surface-2)', color: form.formaPago === v ? col : 'var(--ink-soft)', fontSize: 12, fontWeight: 700, cursor: 'pointer' } }, l)))),
            React.createElement(BFill, { onClick: guardar, style: { width: '100%' }, disabled: saving }, saving ? 'Guardando…' : '💾 Guardar gasto')),
        isAdmin && React.createElement(Card, null,
            React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 10 } },
                React.createElement("span", { style: { fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700 } }, "REPORTE DE CAJA POR PERSONA")),
            React.createElement(Row, { style: { gap: 6, marginBottom: 12 } }, [['semana', 'Semana'], ['mes', 'Mes'], ['todo', 'Todo']].map(([v, l]) => (React.createElement("button", { key: v, onClick: () => setRango(v), style: { flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: rango === v ? 'var(--accent)' : 'var(--surface-2)', color: rango === v ? 'var(--ink)' : 'var(--ink-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer' } }, l)))),
            filasList.length === 0 && React.createElement("div", { style: { fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '16px 0' } }, "Sin movimientos en este rango"),
            filasList.map((f, i) => React.createElement("div", { key: i, style: { paddingBottom: 10, borderBottom: '1px solid var(--line)', marginBottom: 10 } },
                React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 4 } },
                    React.createElement("span", { style: { fontWeight: 700, fontSize: 13 } }, f.nombre),
                    React.createElement("span", { style: { fontSize: 11, color: 'var(--ink-faint)' } }, fDate(f.fecha))),
                React.createElement(Row, { style: { justifyContent: 'space-between', fontSize: 12, marginBottom: 2 } },
                    React.createElement("span", { style: { color: 'var(--ink-soft)' } }, "Venta efectivo"),
                    React.createElement("span", { style: { color: 'var(--ok-text)' } }, fmt(f.venta))),
                React.createElement(Row, { style: { justifyContent: 'space-between', fontSize: 12, marginBottom: 2 } },
                    React.createElement("span", { style: { color: 'var(--ink-soft)' } }, "Abonos efectivo"),
                    React.createElement("span", { style: { color: 'var(--ok-text)' } }, fmt(f.abono))),
                React.createElement(Row, { style: { justifyContent: 'space-between', fontSize: 12, marginBottom: 4 } },
                    React.createElement("span", { style: { color: 'var(--ink-soft)' } }, "Gasto efectivo"),
                    React.createElement("span", { style: { color: 'var(--danger-text)' } },
                        "-",
                        fmt(f.gasto))),
                React.createElement(Row, { style: { justifyContent: 'space-between' } },
                    React.createElement("span", { style: { fontWeight: 700, fontSize: 13 } }, "Esperado"),
                    React.createElement("span", { style: { fontWeight: 800, color: 'var(--accent-text)' } }, fmt(f.venta + f.abono - f.gasto))),
                f.tarjeta.length > 0 && React.createElement("div", { style: { marginTop: 6 } }, f.tarjeta.map(g => React.createElement(Row, { key: g.id, style: { justifyContent: 'space-between', fontSize: 11, color: 'var(--info-text)' } },
                    React.createElement("span", null,
                        "\uD83D\uDCB3 ",
                        g.pagadoA,
                        " (pendiente reembolso)"),
                    React.createElement("span", null, fmt(g.monto)))))))),
        React.createElement(Card, null,
            React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10 } }, isAdmin ? 'HISTORIAL DE CIERRES DE CAJA' : 'TUS CIERRES DE CAJA'),
            cierres === null && React.createElement("div", { style: { fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '16px 0' } }, "Cargando\u2026"),
            cierres && cierres.length === 0 && React.createElement("div", { style: { fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '16px 0' } }, "Sin cierres registrados a\u00FAn"),
            cierres && cierres.map(c => React.createElement("div", { key: c.id, style: { paddingBottom: 8, borderBottom: '1px solid var(--line)', marginBottom: 8 } },
                React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 2 } },
                    React.createElement("span", { style: { fontWeight: 700, fontSize: 13 } }, isAdmin ? c.capturadoPorNombre : fDate(c.fecha)),
                    React.createElement("span", { style: { fontWeight: 800, color: 'var(--accent-text)' } }, fmt(c.efectivoAEntregar))),
                React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)' } },
                    isAdmin ? fDate(c.fecha) : '',
                    " ",
                    c.numPedidos,
                    " pedido(s) · ",
                    c.numClientesAtendidos,
                    " cliente(s)",
                    c.numIncidenciasInventario ? ' · ' + c.numIncidenciasInventario + ' incidencia(s)' : '')))),
        React.createElement(Card, null,
            React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10 } }, isAdmin ? 'TODOS LOS GASTOS' : 'TUS GASTOS REGISTRADOS'),
            gastos === null && React.createElement("div", { style: { fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '16px 0' } }, "Cargando\u2026"),
            gastos && (isAdmin ? gastos : misGastos).length === 0 && React.createElement("div", { style: { fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '16px 0' } }, "Sin gastos registrados a\u00FAn"),
            isAdmin && gastos && (isAdmin ? gastos : misGastos).length > 0 && React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', marginBottom: 10 } }, "Mant\u00E9n presionado un gasto para eliminarlo."),
            gastos && (isAdmin ? gastos : misGastos).map(g => {
                const expanded = expandedId === g.id;
                const fila = React.createElement(React.Fragment, null,
                    React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 3 } },
                        React.createElement("span", { style: { fontWeight: 700, fontSize: 13 } }, g.pagadoA),
                        React.createElement(Row, { style: { gap: 6 } },
                            React.createElement(Tag, { color: g.formaPago === 'tarjeta' ? 'var(--info-text)' : 'var(--ok-text)' }, g.formaPago === 'tarjeta' ? '💳 Tarjeta' : '💵 Efectivo'),
                            React.createElement("span", { style: { fontWeight: 700, color: 'var(--danger-text)' } }, fmt(g.monto)))),
                    g.motivo && React.createElement("div", { style: { fontSize: 12, color: 'var(--ink-soft)' } }, g.motivo),
                    React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 } },
                        g.capturadoPorNombre,
                        " \u00B7 ",
                        fDate(g.fecha)));
                if (!isAdmin) {
                    return React.createElement("div", { key: g.id, style: { paddingBottom: 8, borderBottom: '1px solid var(--line)', marginBottom: 8 } }, fila);
                }
                return React.createElement("div", { key: g.id, style: { borderBottom: '1px solid var(--line)', marginBottom: 8 } },
                    React.createElement("div", { onMouseDown: () => startPress(g.id), onMouseUp: cancelPress, onMouseLeave: cancelPress, onTouchStart: () => startPress(g.id), onTouchEnd: cancelPress, onTouchMove: cancelPress, onClick: () => onGastoTap(g.id), style: { paddingBottom: 8, cursor: 'pointer', userSelect: 'none', WebkitTapHighlightColor: 'transparent' } }, fila),
                    React.createElement("div", { style: { maxHeight: expanded ? 50 : 0, overflow: 'hidden', transition: 'max-height .2s ease' } },
                        React.createElement(Row, { style: { paddingBottom: 8 } },
                            React.createElement(BOut, { onClick: () => { eliminar(g); setExpandedId(null); }, color: "var(--danger-text)", style: { flex: 1 } }, "\uD83D\uDDD1 Eliminar"))));
            })),
        cierreOpen && React.createElement(Modal, { title: "\uD83D\uDD12 Cerrar caja de hoy", onClose: () => setCierreOpen(false) },
            React.createElement("div", { style: { fontSize: 12, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 } }, "Esto guarda un comprobante permanente con los n\u00FAmeros de hoy. No bloquea que sigas registrando ventas o gastos despu\u00E9s \u2014 si algo cambia, puedes volver a cerrar."),
            React.createElement(Card, { style: { background: 'var(--surface-2)' } },
                React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 4 } },
                    React.createElement("span", { style: { fontSize: 12 } }, "Venta efectivo"),
                    React.createElement("span", { style: { fontWeight: 700 } }, fmt(ventaEfectivoHoy))),
                React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 4 } },
                    React.createElement("span", { style: { fontSize: 12 } }, "Abonos efectivo"),
                    React.createElement("span", { style: { fontWeight: 700 } }, fmt(abonoEfectivoHoy))),
                React.createElement(Row, { style: { justifyContent: 'space-between', marginBottom: 4 } },
                    React.createElement("span", { style: { fontSize: 12 } }, "Gasto efectivo"),
                    React.createElement("span", { style: { fontWeight: 700, color: 'var(--danger-text)' } },
                        "-",
                        fmt(gastoEfectivoHoy))),
                React.createElement(Row, { style: { justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTop: '1px solid var(--line-strong)' } },
                    React.createElement("span", { style: { fontWeight: 700 } }, "Efectivo a entregar"),
                    React.createElement("span", { style: { fontWeight: 800, fontSize: 18, color: 'var(--accent-text)' } }, fmt(efectivoEsperadoHoy)))),
            incidenciasInventarioHoy.length > 0 && React.createElement(Card, { style: { background: 'var(--warn-bg)', marginTop: 10, marginBottom: 10 } },
                React.createElement("div", { style: { fontWeight: 800, color: 'var(--warn-text)', marginBottom: 6 } }, "⚠️ Productos a revisar"),
                incidenciasInventarioHoy.map((incidencia, index) => React.createElement("div", { key: incidencia.notaId || index, style: { fontSize: 11, color: 'var(--warn-text)', padding: '6px 0', borderBottom: index < incidenciasInventarioHoy.length - 1 ? '1px solid rgba(0,0,0,.12)' : 'none' } },
                    React.createElement("div", { style: { fontWeight: 700 } }, incidencia.clienteNombre, " · venta ", incidencia.notaId),
                    (incidencia.items || []).map(item => React.createElement("div", { key: item.id || item.nombre }, item.nombre, " — solicitado ", item.cantSolicitada || item.cant, ", aplicado ", item.cantAplicada || 0, ", faltante ", item.cantFaltante || 0))))),
            React.createElement("div", { style: { fontSize: 11, color: 'var(--ink-faint)', margin: '10px 0 16px' } },
                misNotasHoy.length,
                " pedido(s) · ",
                new Set(misNotasHoy.map(n => n.clienteId)).size,
                " cliente(s) atendido(s) hoy",
                incidenciasInventarioHoy.length ? ' · ' + incidenciasInventarioHoy.length + ' incidencia(s) para revisión' : ''),
            React.createElement(BFill, { onClick: confirmarCierre, style: { width: '100%' }, disabled: cierreSaving }, cierreSaving ? 'Guardando…' : '✅ Confirmar cierre')));
}
