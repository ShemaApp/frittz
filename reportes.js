function Reportes({
  productos,
  clientes,
  currentUser
}) {
  const [msg, setMsg] = useState('');
  const flash = m => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };
  const [subTab, setSubTab] = useState('respaldo');
  const [usuarios, setUsuarios] = useState([]);
  const [backupMeta, setBackupMeta] = useState(null);
  useEffect(() => {
    const unsubU = db.collection('usuarios').onSnapshot(snap => setUsuarios(snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }))), () => {});
    const unsubB = db.collection('_meta').doc('backups').onSnapshot(snap => setBackupMeta(snap.exists ? snap.data() : null), () => {});
    return () => {
      unsubU();
      unsubB();
    };
  }, []);
  const [backupGenerating, setBackupGenerating] = useState(false);
  const [excelGenerating, setExcelGenerating] = useState(false);
  const diasDesdeUltimoRespaldo = backupMeta && backupMeta.ultimoRespaldo ? Math.floor((Date.now() - new Date(backupMeta.ultimoRespaldo).getTime()) / 86400000) : null;
  const generarRespaldo = async () => {
    setBackupGenerating(true);
    try {
      const colecciones = ['productos', 'clientes', 'notas', 'creditos', 'rutas', 'devoluciones', 'inventario_historial', 'usuarios'];
      const data = {
        generado: new Date().toISOString(),
        generadoPor: currentUser.nombre || currentUser.email
      };
      for (const col of colecciones) {
        const snap = await db.collection(col).get();
        data[col] = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'respaldo_productos_de_la_costa_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      await db.collection('_meta').doc('backups').set({
        ultimoRespaldo: new Date().toISOString(),
        por: currentUser.nombre || currentUser.email
      }, {
        merge: true
      });
      flash('✅ Respaldo descargado');
    } catch (e) {
      flash('❌ ' + e.message);
    }
    setBackupGenerating(false);
  };
  const [ubicFecha, setUbicFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [ubicNotas, setUbicNotas] = useState(null);
  const [ubicLoading, setUbicLoading] = useState(false);
  const cargarUbicacionDia = async () => {
    setUbicLoading(true);
    try {
      const desde = new Date(ubicFecha + 'T00:00:00').toISOString();
      const hasta = new Date(ubicFecha + 'T23:59:59').toISOString();
      const snap = await db.collection('notas').where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
      const notas = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).filter(n => n.ubicacionVenta);
      notas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      setUbicNotas(notas);
    } catch (e) {
      flash('❌ ' + e.message);
    }
    setUbicLoading(false);
  };
  const [reporteRango, setReporteRango] = useState('semana');
  const [reporteDesde, setReporteDesde] = useState('');
  const [reporteHasta, setReporteHasta] = useState('');
  const [reporteData, setReporteData] = useState(null);
  const [reporteGenerating, setReporteGenerating] = useState(false);
  const [reporteEmail, setReporteEmail] = useState('');
  const rangoFechas = () => {
    const hoy = new Date();
    let desde, hasta;
    if (reporteRango === 'hoy') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
    } else if (reporteRango === 'semana') {
      desde = new Date(hoy);
      desde.setDate(hoy.getDate() - 7);
      hasta = hoy;
    } else if (reporteRango === 'mes') {
      desde = new Date(hoy);
      desde.setDate(hoy.getDate() - 30);
      hasta = hoy;
    } else {
      desde = reporteDesde ? new Date(reporteDesde) : new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      hasta = reporteHasta ? new Date(reporteHasta + 'T23:59:59') : hoy;
    }
    return {
      desde: desde.toISOString(),
      hasta: hasta.toISOString()
    };
  };
  const generarReporte = async () => {
    setReporteGenerating(true);
    try {
      const {
        desde,
        hasta
      } = rangoFechas();
      const snap = await db.collection('notas').where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
      const notas = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      const total = notas.reduce((s, n) => s + (n.total || 0), 0);
      const totalContado = notas.filter(n => n.formaPago === 'contado').reduce((s, n) => s + (n.total || 0), 0);
      const totalCredito = notas.filter(n => n.formaPago === 'credito').reduce((s, n) => s + (n.total || 0), 0);
      const totalAlmacen = notas.filter(n => n.origen === 'almacen' || !n.origen).reduce((s, n) => s + (n.total || 0), 0);
      const totalTransferencias = notas.filter(n => n.origen === 'transferencia_almacen' || n.origen === 'qr_cliente_ruta').reduce((s, n) => s + (n.total || 0), 0);
      const porCliente = {};
      const porProducto = {};
      notas.forEach(n => {
        porCliente[n.clienteNombre] = (porCliente[n.clienteNombre] || 0) + (n.total || 0);
        (n.items || []).forEach(it => {
          porProducto[it.nombre] = porProducto[it.nombre] || {
            cant: 0,
            total: 0
          };
          porProducto[it.nombre].cant += it.cant;
          porProducto[it.nombre].total += (it.precio || 0) * it.cant;
        });
      });
      const topClientes = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topProductos = Object.entries(porProducto).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
      setReporteData({
        desde,
        hasta,
        notas,
        total,
        totalContado,
        totalCredito,
        totalAlmacen,
        totalTransferencias,
        count: notas.length,
        topClientes,
        topProductos
      });
      flash('✅ Reporte generado');
    } catch (e) {
      flash('❌ ' + e.message);
    }
    setReporteGenerating(false);
  };
  const exportarReporteCSV = () => {
    if (!reporteData) return;
    const rows = [['Fecha', 'Cliente', 'Productos', 'Total', 'Forma de pago', 'Origen', 'Tipo de venta', 'Medio operativo', 'Responsable', 'Transferencia']];
    reporteData.notas.forEach(n => {
      const origen = n.origen === 'transferencia_almacen' || n.origen === 'qr_cliente_ruta' ? 'Transferencia de almacén' : 'Almacén';
      rows.push([fDateTime(n.fecha), n.clienteNombre, (n.items || []).map(it => it.nombre + ' x' + it.cant).join(' | '), (n.total || 0).toFixed(2), n.formaPago, origen, n.tipoVenta || '', n.medioOperacion || '', n.capturadoPorNombre || '', n.transferenciaId || '']);
    });
    downloadCSV('reporte_ventas_' + Date.now() + '.csv', rows);
  };
  const fechaExcel = valor => {
    if (!valor) return '';
    if (typeof valor.toDate === 'function') return valor.toDate();
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? '' : fecha;
  };
  const numeroExcel = valor => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
  };
  const numeroOVacioExcel = valor => valor === '' || valor === null || valor === undefined ? '' : numeroExcel(valor);
  const fechaHoraExcel = valor => {
    const fecha = fechaExcel(valor);
    return fecha ? fecha.getTime() : 0;
  };
  const ordenarPorFechaExcel = registros => registros.sort((a, b) => fechaHoraExcel(a.fecha) - fechaHoraExcel(b.fecha));
  const origenExcel = origen => origen === 'transferencia_almacen' || origen === 'qr_cliente_ruta' ? 'Transferencia de almacén' : origen === 'almacen' || !origen ? 'Almacén' : String(origen);
  const agregarHojaExcel = (libro, nombre, encabezados, filas, columnasMoneda, columnasFecha) => {
    const hoja = XLSX.utils.json_to_sheet(filas, {
      header: encabezados
    });
    if (filas.length === 0) {
      encabezados.forEach((encabezado, columna) => {
        hoja[XLSX.utils.encode_cell({
          r: 0,
          c: columna
        })] = {
          t: 's',
          v: encabezado
        };
      });
      hoja['!ref'] = 'A1:' + XLSX.utils.encode_col(encabezados.length - 1) + '1';
    }
    const ultimaFila = Math.max(filas.length + 1, 1);
    hoja['!autofilter'] = {
      ref: 'A1:' + XLSX.utils.encode_col(encabezados.length - 1) + ultimaFila
    };
    hoja['!cols'] = encabezados.map(encabezado => {
      const ancho = filas.slice(0, 200).reduce((maximo, fila) => Math.max(maximo, String(fila[encabezado] === undefined || fila[encabezado] === null ? '' : fila[encabezado]).length), encabezado.length);
      return {
        wch: Math.min(Math.max(ancho + 2, 12), 38)
      };
    });
    const aplicarFormato = (columnas, formato) => columnas.forEach(columna => {
      const indice = encabezados.indexOf(columna);
      if (indice < 0) return;
      for (let fila = 1; fila <= filas.length; fila++) {
        const celda = hoja[XLSX.utils.encode_cell({
          r: fila,
          c: indice
        })];
        if (celda && celda.v !== '') celda.z = formato;
      }
    });
    aplicarFormato(columnasMoneda || [], '$#,##0.00');
    aplicarFormato(columnasFecha || [], 'dd/mm/yyyy hh:mm');
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  };
  const exportarLibroExcel = async () => {
    if (excelGenerating) return;
    if (typeof XLSX === 'undefined') {
      flash('❌ No se pudo cargar la herramienta de Excel. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    setExcelGenerating(true);
    try {
      const [ventasSnap, creditosSnap, transferenciasSnap, historialSnap] = await Promise.all([db.collection('notas').get(), db.collection('creditos').get(), db.collection('rutas').get(), db.collection('inventario_historial').get()]);
      const ventas = ordenarPorFechaExcel(ventasSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      const creditosExcel = ordenarPorFechaExcel(creditosSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      const transferencias = ordenarPorFechaExcel(transferenciasSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      const movimientos = ordenarPorFechaExcel(historialSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      const ventasFilas = ventas.map(venta => {
        const items = Array.isArray(venta.items) ? venta.items : [];
        return {
          'Venta ID': venta.id,
          Fecha: fechaExcel(venta.fecha),
          'Cliente ID': venta.clienteId || '',
          Cliente: venta.clienteNombre || '',
          Teléfono: venta.clienteTelefono || '',
          'Vendedor UID': venta.capturadoPorUid || '',
          Vendedor: venta.capturadoPorNombre || '',
          'Forma de pago': venta.formaPago || '',
          Origen: origenExcel(venta.origen),
          'Tipo de venta': venta.tipoVenta || '',
          'Medio operativo': venta.medioOperacion || '',
          'Tipo de responsable': venta.responsableTipo || '',
          'Transferencia ID': venta.transferenciaId || venta.rutaId || '',
          'Líneas de venta': items.length,
          'Unidades vendidas': items.reduce((suma, item) => suma + numeroExcel(item.cant), 0),
          Total: numeroExcel(venta.total),
          'GPS venta disponible': venta.ubicacionVenta ? 'Sí' : 'No'
        };
      });
      const ventaDetalleFilas = [];
      ventas.forEach(venta => {
        (Array.isArray(venta.items) ? venta.items : []).forEach((item, indice) => {
          const cantidad = numeroExcel(item.cant);
          const precio = numeroExcel(item.precio);
          ventaDetalleFilas.push({
            'Venta ID': venta.id,
            Línea: indice + 1,
            'Fecha venta': fechaExcel(venta.fecha),
            'Cliente ID': venta.clienteId || '',
            Cliente: venta.clienteNombre || '',
            'Producto ID': item.id || item.productoId || '',
            Producto: item.nombre || item.productoNombre || '',
            Unidad: item.unidad || '',
            Cantidad: cantidad,
            'Precio unitario': precio,
            Subtotal: cantidad * precio,
            Origen: origenExcel(venta.origen),
            'Tipo de venta': venta.tipoVenta || '',
            'Medio operativo': venta.medioOperacion || '',
            'Tipo de responsable': venta.responsableTipo || '',
            'Transferencia ID': venta.transferenciaId || venta.rutaId || '',
            'Forma de pago': venta.formaPago || ''
          });
        });
      });
      const transferenciasFilas = transferencias.map(transferencia => ({
        'Transferencia ID': transferencia.id,
        'Fecha de salida': fechaExcel(transferencia.fechaSalidaReal || transferencia.fecha),
        'Fecha programada': fechaExcel(transferencia.fechaProgramada),
        'Regreso programado': fechaExcel(transferencia.fechaRegresoProgramada),
        'Fecha de recepción': fechaExcel(transferencia.fechaRecepcionAlmacen || transferencia.fechaRegresoReal),
        Estado: transferencia.estado || transferencia.estadoTransferencia || '',
        'Estado transferencia': transferencia.estadoTransferencia || '',
        Origen: transferencia.origen || 'almacen',
        Responsable: transferencia.repartidorNombre || '',
        'Responsable UID': transferencia.repartidorId || '',
        Vehículo: transferencia.vehiculo || '',
        Zona: transferencia.zona || '',
        'Asignada por': transferencia.asignadaPorNombre || '',
        'Recibida por': transferencia.recibidoPorNombre || '',
        'Motivo de merma': transferencia.motivoMerma || '',
        Conciliada: transferencia.conciliada ? 'Sí' : 'No'
      }));
      const transferenciaDetalleFilas = [];
      transferencias.forEach(transferencia => {
        const detalle = Array.isArray(transferencia.items) ? transferencia.items.map((item, indice) => [item.id || String(indice + 1), item]) : Object.entries(transferencia.items || {});
        detalle.forEach(([productoId, item]) => {
          transferenciaDetalleFilas.push({
            'Transferencia ID': transferencia.id,
            'Fecha de salida': fechaExcel(transferencia.fechaSalidaReal || transferencia.fecha),
            Estado: transferencia.estado || transferencia.estadoTransferencia || '',
            'Producto ID': productoId,
            Producto: item.nombre || '',
            Unidad: item.unidad || '',
            'Cantidad cargada': numeroOVacioExcel(item.cantCargada),
            'Cantidad restante': numeroOVacioExcel(item.cantRestante),
            'Cantidad devuelta': numeroOVacioExcel(item.cantDevuelta),
            Merma: numeroOVacioExcel(item.cantMerma),
            Responsable: transferencia.repartidorNombre || '',
            Zona: transferencia.zona || ''
          });
        });
      });
      const creditosFilas = creditosExcel.map(credito => {
        const total = numeroExcel(credito.total);
        const saldo = numeroExcel(credito.saldo);
        const abonos = Array.isArray(credito.abonos) ? credito.abonos : [];
        return {
          'Crédito ID': credito.id,
          'Venta ID': credito.notaId || '',
          Fecha: fechaExcel(credito.fecha),
          'Cliente ID': credito.clienteId || '',
          Cliente: credito.clienteNombre || '',
          Total: total,
          Abonado: Math.max(total - saldo, 0),
          Saldo: saldo,
          Estado: saldo <= 0 ? 'Liquidado' : 'Pendiente',
          'Cantidad de abonos': abonos.length,
          'Capturado por UID': credito.capturadoPorUid || ''
        };
      });
      const abonosFilas = [];
      creditosExcel.forEach(credito => {
        (Array.isArray(credito.abonos) ? credito.abonos : []).forEach((abono, indice) => {
          abonosFilas.push({
            'Crédito ID': credito.id,
            'Abono #': indice + 1,
            Fecha: fechaExcel(abono.fecha),
            'Cliente ID': credito.clienteId || '',
            Cliente: credito.clienteNombre || '',
            Monto: numeroExcel(abono.monto),
            'Forma de pago': abono.formaPago || '',
            'Capturado por UID': abono.capturadoPorUid || '',
            'Capturado por': abono.capturadoPorNombre || ''
          });
        });
      });
      const movimientosFilas = movimientos.map(movimiento => ({
        'Movimiento ID': movimiento.id,
        Fecha: fechaExcel(movimiento.fecha),
        'Producto ID': movimiento.productoId || '',
        Producto: movimiento.productoNombre || '',
        'Stock anterior': numeroOVacioExcel(movimiento.stockAnterior),
        'Stock nuevo': numeroOVacioExcel(movimiento.stockNuevo),
        Diferencia: numeroOVacioExcel(movimiento.diferencia),
        Motivo: movimiento.motivo || '',
        'Usuario UID': movimiento.usuarioUid || movimiento.capturadoPorUid || '',
        Usuario: movimiento.usuarioNombre || movimiento.capturadoPorNombre || '',
        'Correo usuario': movimiento.usuarioEmail || ''
      }));
      const productosFilas = (productos || []).map(producto => ({
        'Producto ID': producto.id || '',
        'Código de barras': producto.codigoBarras || '',
        Producto: producto.nombre || '',
        Unidad: producto.unidad || '',
        'Precio actual': numeroExcel(producto.precio),
        'Stock actual': numeroExcel(producto.stock),
        Activo: producto.activo === false ? 'No' : 'Sí'
      }));
      const clientesFilas = (clientes || []).map(cliente => {
        const ubicacion = cliente.ubicacion || {};
        return {
          'Cliente ID': cliente.id || '',
          Cliente: cliente.nombre || '',
          Teléfono: cliente.telefono || '',
          Localidad: cliente.localidad || cliente.domicilio || '',
          'Fuente de localidad': cliente.localidad ? 'Campo localidad' : cliente.domicilio ? 'Domicilio heredado' : 'Sin clasificar',
          'Domicilio histórico': cliente.localidad && cliente.domicilio && String(cliente.localidad).trim().toLocaleLowerCase('es') !== String(cliente.domicilio).trim().toLocaleLowerCase('es') ? cliente.domicilio : '',
          Activo: cliente.activo === false ? 'No' : 'Sí',
          'Código QR': qrTextForCliente(cliente.id),
          'Estado GPS': ubicacion.lat !== undefined && ubicacion.lng !== undefined ? 'Con GPS' : 'Sin GPS',
          'GPS latitud': ubicacion.lat === undefined ? '' : ubicacion.lat,
          'GPS longitud': ubicacion.lng === undefined ? '' : ubicacion.lng,
          'GPS precisión (m)': numeroOVacioExcel(ubicacion.precisionMetros),
          'Fecha GPS': fechaExcel(ubicacion.fecha),
          'Creado por UID': cliente.creadoPorUid || ''
        };
      });
      const libro = XLSX.utils.book_new();
      const totalVendido = ventas.reduce((suma, venta) => suma + numeroExcel(venta.total), 0);
      const totalContado = ventas.filter(venta => venta.formaPago === 'contado' || venta.formaPago === 'efectivo').reduce((suma, venta) => suma + numeroExcel(venta.total), 0);
      const totalCredito = ventas.filter(venta => venta.formaPago === 'credito').reduce((suma, venta) => suma + numeroExcel(venta.total), 0);
      const saldoPendiente = creditosExcel.reduce((suma, credito) => suma + numeroExcel(credito.saldo), 0);
      const resumenFilas = [{
        Indicador: 'Generado el',
        Valor: fDateTime(new Date().toISOString())
      }, {
        Indicador: 'Generado por',
        Valor: currentUser?.nombre || currentUser?.email || ''
      }, {
        Indicador: 'Ventas',
        Valor: ventas.length
      }, {
        Indicador: 'Total vendido',
        Valor: totalVendido
      }, {
        Indicador: 'Ventas de contado',
        Valor: totalContado
      }, {
        Indicador: 'Ventas a crédito',
        Valor: totalCredito
      }, {
        Indicador: 'Créditos pendientes',
        Valor: creditosExcel.filter(credito => numeroExcel(credito.saldo) > 0).length
      }, {
        Indicador: 'Saldo pendiente de crédito',
        Valor: saldoPendiente
      }, {
        Indicador: 'Transferencias',
        Valor: transferencias.length
      }, {
        Indicador: 'Movimientos de inventario',
        Valor: movimientos.length
      }, {
        Indicador: 'Productos',
        Valor: productosFilas.length
      }, {
        Indicador: 'Clientes',
        Valor: clientesFilas.length
      }];
      agregarHojaExcel(libro, 'Resumen', ['Indicador', 'Valor'], resumenFilas, [], []);
      agregarHojaExcel(libro, 'Ventas', ['Venta ID', 'Fecha', 'Cliente ID', 'Cliente', 'Teléfono', 'Vendedor UID', 'Vendedor', 'Forma de pago', 'Origen', 'Transferencia ID', 'Líneas de venta', 'Unidades vendidas', 'Total', 'GPS venta disponible'], ventasFilas, ['Total'], ['Fecha']);
      agregarHojaExcel(libro, 'VentaDetalle', ['Venta ID', 'Línea', 'Fecha venta', 'Cliente ID', 'Cliente', 'Producto ID', 'Producto', 'Unidad', 'Cantidad', 'Precio unitario', 'Subtotal', 'Origen', 'Transferencia ID', 'Forma de pago'], ventaDetalleFilas, ['Precio unitario', 'Subtotal'], ['Fecha venta']);
      agregarHojaExcel(libro, 'Transferencias', ['Transferencia ID', 'Fecha de salida', 'Fecha programada', 'Regreso programado', 'Fecha de recepción', 'Estado', 'Estado transferencia', 'Origen', 'Responsable', 'Responsable UID', 'Vehículo', 'Zona', 'Asignada por', 'Recibida por', 'Motivo de merma', 'Conciliada'], transferenciasFilas, [], ['Fecha de salida', 'Fecha programada', 'Regreso programado', 'Fecha de recepción']);
      agregarHojaExcel(libro, 'TransferenciaDetalle', ['Transferencia ID', 'Fecha de salida', 'Estado', 'Producto ID', 'Producto', 'Unidad', 'Cantidad cargada', 'Cantidad restante', 'Cantidad devuelta', 'Merma', 'Responsable', 'Zona'], transferenciaDetalleFilas, [], ['Fecha de salida']);
      agregarHojaExcel(libro, 'Créditos', ['Crédito ID', 'Venta ID', 'Fecha', 'Cliente ID', 'Cliente', 'Total', 'Abonado', 'Saldo', 'Estado', 'Cantidad de abonos', 'Capturado por UID'], creditosFilas, ['Total', 'Abonado', 'Saldo'], ['Fecha']);
      agregarHojaExcel(libro, 'Abonos', ['Crédito ID', 'Abono #', 'Fecha', 'Cliente ID', 'Cliente', 'Monto', 'Forma de pago', 'Capturado por UID', 'Capturado por'], abonosFilas, ['Monto'], ['Fecha']);
      agregarHojaExcel(libro, 'MovimientosInventario', ['Movimiento ID', 'Fecha', 'Producto ID', 'Producto', 'Stock anterior', 'Stock nuevo', 'Diferencia', 'Motivo', 'Usuario UID', 'Usuario', 'Correo usuario'], movimientosFilas, [], ['Fecha']);
      agregarHojaExcel(libro, 'Productos', ['Producto ID', 'Código de barras', 'Producto', 'Unidad', 'Precio actual', 'Stock actual', 'Activo'], productosFilas, ['Precio actual'], []);
      agregarHojaExcel(libro, 'Clientes', ['Cliente ID', 'Cliente', 'Teléfono', 'Localidad', 'Fuente de localidad', 'Domicilio histórico', 'Activo', 'Código QR', 'Estado GPS', 'GPS latitud', 'GPS longitud', 'GPS precisión (m)', 'Fecha GPS', 'Creado por UID'], clientesFilas, [], ['Fecha GPS']);
      XLSX.writeFile(libro, 'libro_operativo_productos_de_la_costa_' + new Date().toISOString().slice(0, 10) + '.xlsx', {
        compression: true,
        cellDates: true
      });
      flash('✅ Libro Excel descargado: ' + ventas.length + ' ventas y ' + clientesFilas.length + ' clientes');
    } catch (e) {
      flash('❌ No se pudo generar el libro Excel: ' + e.message);
    }
    setExcelGenerating(false);
  };
  const enviarReportePorCorreo = () => {
    if (!reporteData) return;
    const clientesTxt = reporteData.topClientes.map(([n, t]) => `• ${n}: ${fmtx(t)}`).join('\n') || 'Sin datos';
    const productosTxt = reporteData.topProductos.map(([n, d]) => `• ${n}: ${d.cant} unidades — ${fmtx(d.total)}`).join('\n') || 'Sin datos';
    const cuerpo = `REPORTE DE VENTAS\n${fDateTime(reporteData.desde)} — ${fDateTime(reporteData.hasta)}\n\nVentas: ${reporteData.count}\nTotal vendido: ${fmtx(reporteData.total)}\nVentas de almacén: ${fmtx(reporteData.totalAlmacen)}\nVentas desde transferencia: ${fmtx(reporteData.totalTransferencias)}\nContado: ${fmtx(reporteData.totalContado)}\nCrédito: ${fmtx(reporteData.totalCredito)}\n\nTOP CLIENTES\n${clientesTxt}\n\nTOP PRODUCTOS\n${productosTxt}`;
    const link = `mailto:${encodeURIComponent(reporteEmail || '')}?subject=${encodeURIComponent('Reporte de ventas — Productos de la Costa')}&body=${encodeURIComponent(cuerpo)}`;
    window.location.href = link;
  };
  const [clientesQrGenerating, setClientesQrGenerating] = useState(false);
  const exportarClientesCSV = () => {
    const rows = [['Nombre', 'Teléfono', 'Localidad', 'Fuente de localidad', 'Activo', 'Código QR']];
    clientes.forEach(c => rows.push([c.nombre, c.telefono || '', c.localidad || c.domicilio || '', c.localidad ? 'Campo localidad' : c.domicilio ? 'Domicilio heredado' : 'Sin clasificar', c.activo ? 'Sí' : 'No', qrTextForCliente(c.id)]));
    downloadCSV('clientes_qr_' + Date.now() + '.csv', rows);
  };
  const exportarClientesQRImprimible = () => {
    const activos = clientes.filter(c => c.activo);
    if (activos.length === 0) {
      flash('⚠️ No hay clientes activos');
      return;
    }
    setClientesQrGenerating(true);
    const results = {};
    let pending = activos.length;
    activos.forEach(c => {
      renderQRDataURL(qrTextForCliente(c.id), 200, url => {
        results[c.id] = url;
        pending--;
        if (pending === 0) {
          const w = window.open('', '_blank');
          if (!w) {
            flash('⚠️ Habilita las ventanas emergentes para imprimir.');
            setClientesQrGenerating(false);
            return;
          }
          const html = '<!doctype html><html><head><meta charset="utf-8"><title>QR clientes</title><style>' + 'body{font-family:system-ui,sans-serif;margin:0;padding:16px}' + '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}' + '.card{border:1px solid #ccc;border-radius:8px;padding:10px;text-align:center;page-break-inside:avoid}' + '.card img{width:100%;max-width:150px}' + '.card div{font-size:12px;margin-top:6px;word-break:break-word}' + '@media print{body{padding:0}}</style></head><body>' + '<div class="grid">' + activos.map(c => `<div class="card"><img src="${results[c.id]}"/><div>${c.nombre}</div></div>`).join('') + '</div>' + '<script>window.onload=()=>window.print()</script></body></html>';
          w.document.write(html);
          w.document.close();
          setClientesQrGenerating(false);
        }
      });
    });
  };
  const [ventasSemanaGenerating, setVentasSemanaGenerating] = useState(false);
  const exportarVentasSemanaCSV = async () => {
    setVentasSemanaGenerating(true);
    try {
      const hoy = new Date();
      const desde = new Date(hoy);
      desde.setDate(hoy.getDate() - 7);
      const snap = await db.collection('notas').where('fecha', '>=', desde.toISOString()).where('fecha', '<=', hoy.toISOString()).get();
      const notas = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      const rows = [['Fecha', 'Cliente', 'Vendedor', 'Productos', 'Total', 'Forma de pago', 'Origen', 'Tipo de venta', 'Medio operativo', 'Responsable', 'Transferencia']];
      notas.forEach(n => {
        const origen = n.origen === 'transferencia_almacen' || n.origen === 'qr_cliente_ruta' ? 'Transferencia de almacén' : 'Almacén';
        rows.push([fDateTime(n.fecha), n.clienteNombre, n.capturadoPorNombre || '', (n.items || []).map(it => it.nombre + ' x' + it.cant).join(' | '), (n.total || 0).toFixed(2), n.formaPago, origen, n.tipoVenta || '', n.medioOperacion || '', n.responsableTipo || '', n.transferenciaId || '']);
      });
      downloadCSV('ventas_semana_' + Date.now() + '.csv', rows);
      flash('✅ Ventas de la semana exportadas — ' + notas.length);
    } catch (e) {
      flash('❌ ' + e.message);
    }
    setVentasSemanaGenerating(false);
  };
  const [nominaVendedorId, setNominaVendedorId] = useState('');
  const [nominaRango, setNominaRango] = useState('semana');
  const [nominaDesde, setNominaDesde] = useState('');
  const [nominaHasta, setNominaHasta] = useState('');
  const [nominaData, setNominaData] = useState(null);
  const [nominaGenerating, setNominaGenerating] = useState(false);
  const rangoFechasNomina = () => {
    const hoy = new Date();
    let desde, hasta;
    if (nominaRango === 'semana') {
      desde = new Date(hoy);
      desde.setDate(hoy.getDate() - 7);
      hasta = hoy;
    } else if (nominaRango === 'mes') {
      desde = new Date(hoy);
      desde.setDate(hoy.getDate() - 30);
      hasta = hoy;
    } else {
      desde = nominaDesde ? new Date(nominaDesde) : new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      hasta = nominaHasta ? new Date(nominaHasta + 'T23:59:59') : hoy;
    }
    return {
      desde: desde.toISOString(),
      hasta: hasta.toISOString()
    };
  };
  const generarNomina = async () => {
    if (!nominaVendedorId) {
      flash('⚠️ Selecciona un vendedor');
      return;
    }
    setNominaGenerating(true);
    try {
      const {
        desde,
        hasta
      } = rangoFechasNomina();
      const snap = await db.collection('notas').where('capturadoPorUid', '==', nominaVendedorId).where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
      const notas = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      const porDia = {};
      notas.forEach(n => {
        const key = new Date(n.fecha).toDateString();
        porDia[key] = porDia[key] || {
          fecha: n.fecha,
          cant: 0,
          total: 0
        };
        porDia[key].cant += 1;
        porDia[key].total += n.total || 0;
      });
      const filas = Object.values(porDia).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      const vendedorNombre = (usuarios.find(u => u.id === nominaVendedorId) || {}).nombre || '';
      setNominaData({
        desde,
        hasta,
        vendedorNombre,
        filas,
        totalVentas: notas.length,
        totalVendido: notas.reduce((s, n) => s + (n.total || 0), 0)
      });
      flash('✅ Formato generado — ' + filas.length + ' día(s) con ventas');
    } catch (e) {
      flash('❌ ' + e.message);
    }
    setNominaGenerating(false);
  };
  const exportarNominaCSV = () => {
    if (!nominaData) return;
    const rows = [['Vendedor', 'Fecha', 'Ventas realizadas', 'Total vendido', 'Horas trabajadas']];
    nominaData.filas.forEach(f => {
      const fechaCorta = new Date(f.fecha).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      rows.push([nominaData.vendedorNombre, fechaCorta, f.cant, f.total.toFixed(2), '']);
    });
    rows.push(['', 'TOTAL', nominaData.totalVentas, nominaData.totalVendido.toFixed(2), '']);
    downloadCSV('sueldo_' + nominaData.vendedorNombre.replace(/\s+/g, '_') + '_' + Date.now() + '.csv', rows);
  };
  return React.createElement("div", {
    style: {
      padding: '16px 12px'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      marginBottom: 12
    }
  }, "📈 Reportes"), msg && React.createElement("div", {
    style: {
      background: 'var(--ok-bg)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      color: 'var(--ok-text)',
      marginBottom: 12
    }
  }, msg), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 14
    }
  }, [['respaldo', '💾 Respaldo'], ['ubicacion', '📍 Ubicación'], ['reporte', '📈 Reporte de ventas'], ['exportar', '📤 Exportar']].map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => setSubTab(v),
    style: {
      flex: 1,
      padding: '8px 4px',
      borderRadius: 8,
      border: 'none',
      background: subTab === v ? 'var(--accent)' : 'var(--surface)',
      color: subTab === v ? 'var(--surface-2)' : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), subTab === 'respaldo' && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "Respaldo completo"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)',
      marginBottom: 12
    }
  }, "Descarga un archivo con todos tus datos: productos, clientes, ventas, créditos, rutas, devoluciones e historial de inventario. Guárdalo en Drive, tu correo o donde prefieras."), React.createElement("div", {
    style: {
      fontSize: 12,
      color: diasDesdeUltimoRespaldo === null ? 'var(--warn-text)' : diasDesdeUltimoRespaldo >= 30 ? 'var(--danger-text)' : diasDesdeUltimoRespaldo >= 7 ? 'var(--warn-text)' : 'var(--ok-text)',
      marginBottom: 12
    }
  }, diasDesdeUltimoRespaldo === null ? '⚠️ Nunca se ha generado un respaldo' : `Último respaldo: hace ${diasDesdeUltimoRespaldo} día(s)${backupMeta.por ? ' · ' + backupMeta.por : ''}`), React.createElement("button", {
    onClick: generarRespaldo,
    disabled: backupGenerating,
    style: {
      width: '100%',
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 12,
      fontWeight: 700,
      cursor: 'pointer',
      opacity: backupGenerating ? 0.6 : 1
    }
  }, backupGenerating ? 'Generando…' : '💾 Generar y descargar respaldo')), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)'
    }
  }, "Recomendado: hazlo cada semana, y guarda uno aparte cada fin de mes. Te avisamos aquí arriba cuando ya lleve más de 7 días.")), subTab === 'ubicacion' && (() => {
    const ok = (ubicNotas || []).filter(n => n.ubicacionVenta.ok === true);
    const mal = (ubicNotas || []).filter(n => n.ubicacionVenta.ok === false);
    const sinDatos = (ubicNotas || []).filter(n => n.ubicacionVenta.ok === null);
    return React.createElement(React.Fragment, null, React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--ink-faint)',
        marginBottom: 12,
        lineHeight: 1.5
      }
    }, "Compara dónde se hizo cada venta de ruta contra el domicilio registrado del cliente (radio de ", RADIO_VISITA_METROS, " m). Es solo informativo: nunca bloquea ni anula una venta."), React.createElement(Row, {
      style: {
        gap: 8,
        marginBottom: 12
      }
    }, React.createElement("input", {
      type: "date",
      value: ubicFecha,
      onChange: e => setUbicFecha(e.target.value),
      style: {
        ...inputStyle,
        marginBottom: 0,
        flex: 1
      }
    }), React.createElement("button", {
      onClick: cargarUbicacionDia,
      disabled: ubicLoading,
      style: {
        background: 'var(--accent)',
        color: 'var(--surface-2)',
        border: 'none',
        borderRadius: 8,
        padding: '0 16px',
        fontWeight: 700,
        cursor: 'pointer',
        opacity: ubicLoading ? 0.6 : 1
      }
    }, ubicLoading ? '…' : 'Ver')), ubicNotas === null && React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-faint)',
        textAlign: 'center',
        padding: '20px 0'
      }
    }, "Elige una fecha y toca \"Ver\"."), ubicNotas !== null && ubicNotas.length === 0 && React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-faint)',
        textAlign: 'center',
        padding: '20px 0'
      }
    }, "Sin ventas de ruta con ubicación ese día."), ubicNotas !== null && ubicNotas.length > 0 && React.createElement(React.Fragment, null, React.createElement(Row, {
      style: {
        gap: 8,
        marginBottom: 14
      }
    }, React.createElement("div", {
      style: {
        flex: 1,
        background: 'var(--ok-bg)',
        borderRadius: 10,
        padding: '10px 8px',
        textAlign: 'center'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 800,
        color: 'var(--ok-text)'
      }
    }, ok.length), React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--ok-text)'
      }
    }, "✅ Concuerdan")), React.createElement("div", {
      style: {
        flex: 1,
        background: 'var(--danger-bg)',
        borderRadius: 10,
        padding: '10px 8px',
        textAlign: 'center'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 800,
        color: 'var(--danger-text)'
      }
    }, mal.length), React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--danger-text)'
      }
    }, "⚠️ No concuerdan")), React.createElement("div", {
      style: {
        flex: 1,
        background: 'var(--surface)',
        borderRadius: 10,
        padding: '10px 8px',
        textAlign: 'center'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 20,
        fontWeight: 800,
        color: 'var(--ink-faint)'
      }
    }, sinDatos.length), React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--ink-faint)'
      }
    }, "➖ Sin datos"))), mal.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--danger-text)',
        fontWeight: 700,
        marginBottom: 8
      }
    }, "VENTAS FUERA DE RANGO"), mal.map(n => React.createElement("div", {
      key: n.id,
      style: {
        background: 'var(--danger-bg)',
        borderRadius: 10,
        padding: '10px 12px',
        marginBottom: 6
      }
    }, React.createElement(Row, {
      style: {
        justifyContent: 'space-between'
      }
    }, React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--danger-text)'
      }
    }, n.clienteNombre), React.createElement("span", {
      style: {
        fontSize: 12,
        color: 'var(--danger-text)'
      }
    }, fmtx(n.total))), React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--danger-text)',
        marginTop: 2
      }
    }, fDateTime(n.fecha), " · a ", n.ubicacionVenta.distanciaM, " m del domicilio registrado", n.capturadoPorNombre ? ' · ' + n.capturadoPorNombre : '')))), sinDatos.length > 0 && React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--ink-faint)',
        marginTop: mal.length ? 14 : 0
      }
    }, "\"Sin datos\" significa que el cliente no tiene ubicación registrada, o no se pudo obtener el GPS del repartidor en ese momento — no es evidencia de nada, solo falta información para comparar.")));
  })(), subTab === 'reporte' && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 10
    }
  }, [['hoy', 'Hoy'], ['semana', '7 días'], ['mes', '30 días'], ['custom', 'Rango']].map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => setReporteRango(v),
    style: {
      flex: 1,
      padding: '7px 2px',
      borderRadius: 8,
      border: 'none',
      background: reporteRango === v ? 'var(--accent)' : 'var(--surface-2)',
      color: reporteRango === v ? 'var(--surface-2)' : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), reporteRango === 'custom' && React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 10
    }
  }, React.createElement("input", {
    type: "date",
    value: reporteDesde,
    onChange: e => setReporteDesde(e.target.value),
    style: {
      ...inputStyle,
      marginBottom: 0,
      flex: 1
    }
  }), React.createElement("input", {
    type: "date",
    value: reporteHasta,
    onChange: e => setReporteHasta(e.target.value),
    style: {
      ...inputStyle,
      marginBottom: 0,
      flex: 1
    }
  })), React.createElement("button", {
    onClick: generarReporte,
    disabled: reporteGenerating,
    style: {
      width: '100%',
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      marginBottom: 14,
      opacity: reporteGenerating ? 0.6 : 1
    }
  }, reporteGenerating ? 'Generando…' : '📊 Generar reporte'), reporteData && React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 10
    }
  }, fDateTime(reporteData.desde), " — ", fDateTime(reporteData.hasta)), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10,
      marginBottom: 14
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-soft)'
    }
  }, "Total vendido"), React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: 'var(--accent)'
    }
  }, fmtx(reporteData.total))), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-soft)'
    }
  }, "Pedidos"), React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800
    }
  }, reporteData.count)), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-soft)'
    }
  }, "Contado"), React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--ok-text)'
    }
  }, fmtx(reporteData.totalContado))), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-soft)'
    }
  }, "Crédito"), React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--warn-text)'
    }
  }, fmtx(reporteData.totalCredito))), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-soft)'
    }
  }, "Desde almacén"), React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--accent-text)'
    }
  }, fmtx(reporteData.totalAlmacen))), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-soft)'
    }
  }, "Desde transferencia"), React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--info-text)'
    }
  }, fmtx(reporteData.totalTransferencias)))), reporteData.topClientes.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      marginBottom: 6
    }
  }, "TOP CLIENTES"), reporteData.topClientes.map(([n, t], i) => React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 4
    }
  }, React.createElement("span", null, n), React.createElement("span", {
    style: {
      color: 'var(--accent)',
      fontWeight: 700
    }
  }, fmtx(t))))), reporteData.topProductos.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      fontWeight: 700,
      margin: '10px 0 6px'
    }
  }, "TOP PRODUCTOS"), reporteData.topProductos.map(([n, d], i) => React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 4
    }
  }, React.createElement("span", null, n, " x", d.cant), React.createElement("span", {
    style: {
      color: 'var(--accent)',
      fontWeight: 700
    }
  }, fmtx(d.total)))))), reporteData && React.createElement(React.Fragment, null, React.createElement("button", {
    onClick: exportarReporteCSV,
    style: {
      width: '100%',
      background: 'var(--surface)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 12,
      marginBottom: 10
    }
  }, "📤 Exportar CSV"), React.createElement("div", {
    style: lblStyle
  }, "Correo destino (opcional)"), React.createElement("input", {
    value: reporteEmail,
    onChange: e => setReporteEmail(e.target.value),
    placeholder: "correo@ejemplo.com",
    style: inputStyle
  }), React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-faint)',
      marginBottom: 10
    }
  }, "Abre tu app de correo con el resumen ya escrito — revisa y dale enviar. Si quieres adjuntar el CSV, descárgalo arriba y agrégalo ahí."), React.createElement("button", {
    onClick: enviarReportePorCorreo,
    style: {
      width: '100%',
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 12,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, "📧 Preparar correo"))), subTab === 'exportar' && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 14,
      border: '1px solid var(--line-strong)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "📊 Libro Excel estructurado"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)',
      marginBottom: 12,
      lineHeight: 1.45
    }
  }, "Genera un archivo XLSX con una hoja por tipo de información: resumen, ventas, detalle de ventas, transferencias, créditos, abonos, movimientos de inventario, productos y clientes. Cada fila representa un registro o un producto de una operación."), React.createElement("button", {
    onClick: exportarLibroExcel,
    disabled: excelGenerating,
    style: {
      width: '100%',
      background: 'var(--ok)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 11,
      fontWeight: 700,
      cursor: 'pointer',
      opacity: excelGenerating ? 0.6 : 1
    }
  }, excelGenerating ? 'Generando libro…' : '📊 Descargar libro Excel (.xlsx)')), React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "👥 Clientes con su código QR"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)',
      marginBottom: 12
    }
  }, "Genera una hoja imprimible con el QR de cada cliente activo (para pegar en su tienda), o descarga los datos en CSV."), React.createElement("button", {
    onClick: exportarClientesQRImprimible,
    disabled: clientesQrGenerating,
    style: {
      width: '100%',
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      marginBottom: 8,
      opacity: clientesQrGenerating ? 0.6 : 1
    }
  }, clientesQrGenerating ? 'Generando…' : '🖨️ Generar hoja de QR imprimible'), React.createElement("button", {
    onClick: exportarClientesCSV,
    style: {
      width: '100%',
      background: 'var(--surface-2)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 12
    }
  }, "📤 CSV con datos + código QR")), React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "📈 Ventas de la semana"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)',
      marginBottom: 12
    }
  }, "Descarga todas las ventas de los últimos 7 días, una fila por pedido."), React.createElement("button", {
    onClick: exportarVentasSemanaCSV,
    disabled: ventasSemanaGenerating,
    style: {
      width: '100%',
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      opacity: ventasSemanaGenerating ? 0.6 : 1
    }
  }, ventasSemanaGenerating ? 'Generando…' : '📤 Exportar ventas de esta semana (CSV)')), React.createElement("div", {
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 16
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "💵 Formato de ventas para cálculo de sueldo"), React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-soft)',
      marginBottom: 12
    }
  }, "Ventas que hizo el vendedor por día. La columna \"Horas trabajadas\" queda en blanco para llenarla a mano."), React.createElement("div", {
    style: lblStyle
  }, "Vendedor"), React.createElement("select", {
    value: nominaVendedorId,
    onChange: e => {
      setNominaVendedorId(e.target.value);
      setNominaData(null);
    },
    style: {
      ...inputStyle
    }
  }, React.createElement("option", {
    value: ""
  }, "Selecciona…"), usuarios.map(u => React.createElement("option", {
    key: u.id,
    value: u.id
  }, u.nombre))), React.createElement("div", {
    style: lblStyle
  }, "Periodo"), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 10
    }
  }, [['semana', '7 días'], ['mes', '30 días'], ['custom', 'Rango']].map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => {
      setNominaRango(v);
      setNominaData(null);
    },
    style: {
      flex: 1,
      padding: '7px 2px',
      borderRadius: 8,
      border: 'none',
      background: nominaRango === v ? 'var(--accent)' : 'var(--surface-2)',
      color: nominaRango === v ? 'var(--surface-2)' : 'var(--ink-soft)',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, l))), nominaRango === 'custom' && React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 10
    }
  }, React.createElement("input", {
    type: "date",
    value: nominaDesde,
    onChange: e => setNominaDesde(e.target.value),
    style: {
      ...inputStyle,
      marginBottom: 0,
      flex: 1
    }
  }), React.createElement("input", {
    type: "date",
    value: nominaHasta,
    onChange: e => setNominaHasta(e.target.value),
    style: {
      ...inputStyle,
      marginBottom: 0,
      flex: 1
    }
  })), React.createElement("button", {
    onClick: generarNomina,
    disabled: nominaGenerating,
    style: {
      width: '100%',
      background: 'var(--accent)',
      color: 'var(--surface-2)',
      border: 'none',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      marginBottom: nominaData ? 12 : 0,
      opacity: nominaGenerating ? 0.6 : 1
    }
  }, nominaGenerating ? 'Generando…' : '📊 Generar formato'), nominaData && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      background: 'var(--surface-2)',
      borderRadius: 8,
      padding: 12,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 6
    }
  }, nominaData.vendedorNombre), nominaData.filas.length === 0 && React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-faint)'
    }
  }, "Sin ventas en este periodo"), nominaData.filas.map((f, i) => React.createElement(Row, {
    key: i,
    style: {
      justifyContent: 'space-between',
      fontSize: 12,
      marginBottom: 3
    }
  }, React.createElement("span", null, new Date(f.fecha).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short'
  })), React.createElement("span", {
    style: {
      color: 'var(--ink-soft)'
    }
  }, f.cant, " venta(s)"), React.createElement("span", {
    style: {
      fontWeight: 700,
      color: 'var(--accent)'
    }
  }, fmtx(f.total)))), React.createElement("div", {
    style: {
      borderTop: '1px solid var(--line-strong)',
      paddingTop: 6,
      marginTop: 6,
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      fontWeight: 700
    }
  }, React.createElement("span", null, "Total (", nominaData.totalVentas, " ventas)"), React.createElement("span", null, fmtx(nominaData.totalVendido)))), React.createElement("button", {
    onClick: exportarNominaCSV,
    style: {
      width: '100%',
      background: 'var(--surface-2)',
      color: 'var(--ink-soft)',
      border: '1px solid var(--line-strong)',
      borderRadius: 8,
      padding: 10,
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 12
    }
  }, "📤 Exportar CSV (con columna de horas en blanco)")))));
}