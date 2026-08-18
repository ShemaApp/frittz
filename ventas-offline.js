/*
 * Ventas offline de transferencia — Frittz v46
 *
 * Firestore conserva los datos consultados y encola escrituras simples, pero
 * no ejecuta runTransaction() sin red. Este módulo guarda la intención de
 * venta en IndexedDB y la concilia con una transacción online idempotente.
 *
 * Regla operativa: una venta capturada sin red aparece como pendiente local;
 * queda definitivamente en Firestore cuando la conciliación termina. Si el
 * saldo remoto no alcanza, la venta se conserva con incidencia explícita y
 * se descuenta únicamente la cantidad disponible, sin permitir stock negativo.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'frittz-offline-ventas-v1';
  const DB_VERSION = 1;
  const STORE = 'ventas_transferencia';
  const RETRY_STATES = ['pendiente', 'reintentando'];
  const GPS_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  let dbOpenPromise = null;
  let syncPromise = null;
  const listeners = new Set();

  const notify = async () => {
    const resumen = await (global.frittzResumenVentasOffline ? global.frittzResumenVentasOffline() : Promise.resolve({ total: 0, pendientes: 0, incidencias: 0 })).catch(() => ({ total: 0, pendientes: 0, incidencias: 0 }));
    listeners.forEach(fn => {
      try { fn(resumen); } catch (e) { console.warn('Listener de ventas offline:', e); }
    });
  };

  const openDb = () => {
    if (dbOpenPromise) return dbOpenPromise;
    dbOpenPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in global)) {
        reject(new Error('Este dispositivo no ofrece almacenamiento local IndexedDB'));
        return;
      }
      const request = global.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir la cola local'));
      request.onupgradeneeded = event => {
        const localDb = event.target.result;
        if (localDb.objectStoreNames.contains(STORE)) localDb.deleteObjectStore(STORE);
        const store = localDb.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('estado', 'estado', { unique: false });
        store.createIndex('transferenciaId', 'transferenciaId', { unique: false });
        store.createIndex('creadoEn', 'creadoEn', { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
    });
    return dbOpenPromise;
  };

  const withStore = async (mode, action) => {
    const localDb = await openDb();
    return new Promise((resolve, reject) => {
      const tx = localDb.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try { result = action(store); } catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Error en la cola local'));
      tx.onabort = () => reject(tx.error || new Error('Operación local cancelada'));
    });
  };

  const requestResult = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Error al leer la cola local'));
  });

  const allRecordsRaw = async () => withStore('readonly', store => requestResult(store.getAll()));
  const currentUid = () => {
    try {
      return global.auth?.currentUser?.uid || global.firebase?.auth?.().currentUser?.uid || null;
    } catch (e) { return null; }
  };
  const allRecords = async () => {
    const uid = currentUid();
    if (!uid) return [];
    return (await allRecordsRaw()).filter(record => record.repartidorUid === uid);
  };

  const getRecord = async id => withStore('readonly', store => requestResult(store.get(id)));

  const putRecord = async record => withStore('readwrite', store => {
    store.put(record);
    return record;
  });

  const deleteRecord = async id => withStore('readwrite', store => {
    store.delete(id);
    return id;
  });

  const uid = () => {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return 'off-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };

  const clone = value => JSON.parse(JSON.stringify(value));

  const quitarValidacionVencida = venta => {
    const creadoMs = Date.parse(venta?.creadoEn || '');
    if (!Number.isFinite(creadoMs) || Date.now() - creadoMs <= GPS_AUDIT_RETENTION_MS) return venta;
    const copia = { ...venta };
    delete copia.validacionVisita;
    delete copia.ubicacionVenta;
    return copia;
  };

  const normalizeItems = items => (items || []).map(item => ({
    id: String(item.id),
    nombre: String(item.nombre || ''),
    unidad: String(item.unidad || ''),
    cant: Math.max(0, Number(item.cant || 0)),
    precio: Number(item.precio || 0)
  })).filter(item => item.id && item.cant > 0);

  const normalizePayload = payload => {
    const ventaId = payload.ventaId || payload.id || uid();
    const fecha = payload.fecha || new Date().toISOString();
    const items = normalizeItems(payload.items);
    if (!payload.transferenciaId) throw new Error('La venta offline necesita una transferencia');
    if (!payload.repartidorUid) throw new Error('La venta offline necesita un repartidor');
    if (!payload.cliente || !payload.cliente.id || !payload.cliente.nombre) throw new Error('La venta offline necesita un cliente');
    if (!items.length) throw new Error('La venta offline necesita productos');
    const total = Number(payload.total != null ? payload.total : items.reduce((s, item) => s + item.precio * item.cant, 0));
    return {
      id: ventaId,
      estado: 'pendiente',
      tipoOperacion: 'venta_transferencia_offline',
      version: 1,
      creadoEn: fecha,
      actualizadoEn: fecha,
      transferenciaId: String(payload.transferenciaId),
      rutaId: String(payload.rutaId || payload.transferenciaId),
      repartidorUid: String(payload.repartidorUid),
      repartidorNombre: String(payload.repartidorNombre || ''),
      cliente: clone(payload.cliente),
      items,
      total: Number.isFinite(total) ? total : 0,
      formaPago: payload.formaPago || 'efectivo',
      origen: 'transferencia_almacen',
      tipoVenta: payload.tipoVenta || 'rapida_repartidor',
      validacionVisita: payload.validacionVisita || payload.ubicacionVenta || null,
      pedidoId: payload.pedidoId || null,
      notaId: payload.notaId || ventaId,
      creditoId: payload.formaPago === 'credito' ? (payload.creditoId || uid()) : null,
      ultimoError: '',
      intentos: 0
    };
  };

  const isRetryableError = error => {
    const code = String(error?.code || '');
    return !code || ['unavailable', 'deadline-exceeded', 'aborted', 'cancelled', 'internal', 'unknown'].includes(code);
  };

  const obtenerDb = () => {
    if (global.db) return global.db;
    try { return db; } catch (e) { return null; }
  };

  const esIncidencia = error => error && error.__frittzIncidencia === true;

  const errorIncidencia = (mensaje, detalle = {}) => {
    const error = new Error(mensaje);
    error.__frittzIncidencia = true;
    error.__frittzDetalle = detalle;
    return error;
  };

  const construirNotaBase = (venta, fecha, items, incidencia, itemsAplicados, itemsFaltantes) => ({
    fecha,
    fechaCapturaOffline: venta.creadoEn,
    ventaOfflineId: venta.id,
    modoRegistro: 'conciliada_offline',
    clienteId: venta.cliente.id,
    clienteNombre: venta.cliente.nombre,
    clienteTelefono: venta.cliente.telefono || '',
    items: items.map(item => ({ ...item })),
    itemsAplicadosInventario: itemsAplicados.map(item => ({ ...item })),
    total: venta.total,
    formaPago: venta.formaPago,
    origen: 'transferencia_almacen',
    tipoVenta: venta.tipoVenta,
    transferenciaId: venta.transferenciaId,
    rutaId: venta.rutaId,
    pedidoId: venta.pedidoId || null,
    capturadoPorUid: venta.repartidorUid,
    capturadoPorNombre: venta.repartidorNombre || '',
    estado: incidencia ? 'incidencia_inventario' : 'confirmada',
    requiereRevision: !!incidencia,
    incidenciaInventario: incidencia ? {
      tipo: 'inventario_insuficiente_al_sincronizar',
      mensaje: 'La venta fue capturada offline, pero el saldo remoto no alcanzó para aplicar toda la mercancía.',
      itemsFaltantes: itemsFaltantes.map(item => ({ ...item })),
      fechaConciliacion: fecha,
      revisarEnCierreCaja: true
    } : null
  });

  const conciliar = async venta => {
    const firestore = obtenerDb();
    if (!firestore || !global.firebase?.firestore) throw new Error('Firestore aún no está inicializado');
    const rutaRef = firestore.collection('rutas').doc(venta.transferenciaId);
    const notaRef = firestore.collection('notas').doc(venta.notaId || venta.id);
    const auditRef = firestore.collection('ubicacion_auditoria').doc(venta.notaId || venta.id);
    const creditoRef = venta.formaPago === 'credito' && venta.creditoId ? firestore.collection('creditos').doc(venta.creditoId) : null;
    const pedidoRef = venta.pedidoId ? firestore.collection('pedidos').doc(venta.pedidoId) : null;

    return firestore.runTransaction(async tx => {
      const lecturas = [tx.get(notaRef), tx.get(rutaRef)];
      if (pedidoRef) lecturas.push(tx.get(pedidoRef));
      const resultados = await Promise.all(lecturas);
      const notaSnap = resultados[0];
      const rutaSnap = resultados[1];
      const pedidoSnap = resultados[2];

      // Idempotencia: si la operación ya llegó a Firestore pero el dispositivo
      // perdió la respuesta, el reintento no duplica nota, crédito ni entrega.
      if (notaSnap.exists) return { estado: notaSnap.data().estado || 'confirmada', notaId: notaSnap.id, yaExistia: true, data: notaSnap.data(), validacionVisita: venta.validacionVisita || null };
      if (!rutaSnap.exists) throw errorIncidencia('La transferencia ya no existe', { tipo: 'transferencia_no_encontrada' });

      const ruta = rutaSnap.data();
      if (ruta.repartidorId !== venta.repartidorUid) throw errorIncidencia('La transferencia pertenece a otro repartidor', { tipo: 'responsable_distinto' });
      if (ruta.estado !== 'activa') throw errorIncidencia('La transferencia ya no está activa para conciliar ventas', { tipo: 'transferencia_cerrada' });

      let cliente = venta.cliente;
      let items = venta.items;
      let formaPago = venta.formaPago;
      let total = venta.total;
      if (pedidoRef) {
        if (!pedidoSnap || !pedidoSnap.exists) throw errorIncidencia('El pedido ya no existe', { tipo: 'pedido_no_encontrado' });
        const pedido = pedidoSnap.data();
        if (pedido.estado !== 'transferencia_confirmada' || pedido.transferenciaId !== venta.transferenciaId || pedido.repartidorId !== venta.repartidorUid) {
          throw errorIncidencia('El pedido ya no está disponible para entrega', { tipo: 'pedido_no_disponible' });
        }
        cliente = { id: pedido.clienteId, nombre: pedido.clienteNombre, telefono: pedido.clienteTelefono || '' };
        items = normalizeItems(pedido.items);
        formaPago = pedido.formaPagoPrevista || formaPago;
        total = Number(pedido.total || total);
      }

      const itemsAplicados = [];
      const itemsFaltantes = [];
      items.forEach(item => {
        const transferItem = ruta.items && ruta.items[item.id];
        const restante = Number(transferItem?.cantRestante || 0);
        const reservado = Number(transferItem?.cantReservadaPedidos || 0);
        const libre = Math.max(0, restante - (pedidoRef ? 0 : reservado));
        const aplicado = Math.min(Number(item.cant || 0), libre);
        const faltante = Math.max(0, Number(item.cant || 0) - aplicado);
        itemsAplicados.push({ ...item, cant: aplicado });
        if (faltante > 0) itemsFaltantes.push({ ...item, cantSolicitada: item.cant, cantAplicada: aplicado, cantFaltante: faltante, saldoRemoto: restante, reservadoPedidos: reservado });
      });
      const incidencia = itemsFaltantes.length > 0;
      const fecha = new Date().toISOString();
      const ventaParaNota = { ...venta, cliente, items, formaPago, total };
      const nota = construirNotaBase(ventaParaNota, fecha, items, incidencia, itemsAplicados, itemsFaltantes);
      tx.set(notaRef, nota);
      const validacionVisita = venta.validacionVisita || null;
      if (validacionVisita && validacionVisita.ok !== null && validacionVisita.ok !== undefined) {
        const fechaMs = Date.parse(fecha);
        tx.set(auditRef, {
          notaId: notaRef.id,
          rutaId: venta.rutaId,
          clienteId: cliente.id,
          capturadoPorUid: venta.repartidorUid,
          ok: validacionVisita.ok === true,
          distanciaM: Number.isFinite(Number(validacionVisita.distanciaM)) ? Number(validacionVisita.distanciaM) : null,
          fecha,
          fechaAuditoria: firebase.firestore.Timestamp.fromDate(new Date(fecha)),
          expiresAt: firebase.firestore.Timestamp.fromDate(new Date(fechaMs + GPS_AUDIT_RETENTION_MS)),
          retentionClass: 'gps_visit_30d'
        });
      }

      if (formaPago === 'credito' && creditoRef) {
        tx.set(creditoRef, {
          notaId: notaRef.id,
          ventaOfflineId: venta.id,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          fecha,
          total,
          saldo: total,
          abonos: [],
          capturadoPorUid: venta.repartidorUid,
          capturadoPorNombre: venta.repartidorNombre || '',
          estado: incidencia ? 'requiere_revision_venta' : 'vigente'
        });
      }

      const entrega = {
        id: notaRef.id,
        ventaOfflineId: venta.id,
        fecha,
        clienteNombre: cliente.nombre,
        total,
        formaPago,
        items: items.map(item => ({ ...item })),
        itemsAplicadosInventario: itemsAplicados.map(item => ({ ...item })),
        tipoVenta: venta.tipoVenta,
        requiereRevision: incidencia,
        capturadoPorNombre: venta.repartidorNombre || ''
      };
      const cambiosRuta = { entregas: global.firebase.firestore.FieldValue.arrayUnion(entrega) };
      items.forEach(item => {
        const actual = ruta.items?.[item.id];
        const aplicado = itemsAplicados.find(x => x.id === item.id)?.cant || 0;
        // Si el producto fue retirado de la transferencia, se conserva en la
        // nota como faltante pero no se crea un nodo artificial en inventario.
        if (!actual) return;
        cambiosRuta['items.' + item.id + '.cantRestante'] = Math.max(0, Number(actual.cantRestante || 0) - Number(aplicado));
        if (pedidoRef) {
          cambiosRuta['items.' + item.id + '.cantReservadaPedidos'] = Math.max(0, Number(actual.cantReservadaPedidos || 0) - Number(item.cant || 0));
        }
      });
      tx.update(rutaRef, cambiosRuta);
      if (pedidoRef) {
        tx.update(pedidoRef, {
          estado: 'entregado',
          notaId: notaRef.id,
          fechaEntrega: fecha,
          entregadoPorUid: venta.repartidorUid,
          entregadoPorNombre: venta.repartidorNombre || '',
          fechaActualizacion: fecha,
          requiereRevision: incidencia
        });
      }
      return { estado: incidencia ? 'incidencia_inventario' : 'confirmada', notaId: notaRef.id, incidencia, itemsFaltantes, total, fecha, validacionVisita: venta.validacionVisita || null };
    });
  };

  const registrarIncidenciaSinTransaccion = async (venta, error) => {
    const firestore = obtenerDb();
    if (!firestore) throw error;
    const notaRef = firestore.collection('notas').doc(venta.notaId || venta.id);
    const fecha = new Date().toISOString();
    const detalle = error.__frittzDetalle || { tipo: 'conciliacion_requiere_revision' };
    await notaRef.set({
      fecha,
      fechaCapturaOffline: venta.creadoEn,
      ventaOfflineId: venta.id,
      modoRegistro: 'conciliada_offline',
      clienteId: venta.cliente.id,
      clienteNombre: venta.cliente.nombre,
      clienteTelefono: venta.cliente.telefono || '',
      items: venta.items.map(item => ({ ...item })),
      itemsAplicadosInventario: [],
      total: venta.total,
      formaPago: venta.formaPago,
      origen: 'transferencia_almacen',
      tipoVenta: venta.tipoVenta,
      transferenciaId: venta.transferenciaId,
      rutaId: venta.rutaId,
      pedidoId: venta.pedidoId || null,
      capturadoPorUid: venta.repartidorUid,
      capturadoPorNombre: venta.repartidorNombre || '',
      estado: 'incidencia_inventario',
      requiereRevision: true,
      incidenciaInventario: {
        tipo: detalle.tipo || 'conciliacion_requiere_revision',
        mensaje: error.message,
        itemsFaltantes: detalle.itemsFaltantes || venta.items.map(item => ({ ...item, cantFaltante: item.cant })),
        fechaConciliacion: fecha,
        revisarEnCierreCaja: true
      }
    });
    const validacionVisita = venta.validacionVisita || null;
    if (validacionVisita && validacionVisita.ok !== null && validacionVisita.ok !== undefined) {
      const fechaMs = Date.parse(fecha);
      await firestore.collection('ubicacion_auditoria').doc(venta.notaId || venta.id).set({
        notaId: venta.notaId || venta.id,
        rutaId: venta.rutaId,
        clienteId: venta.cliente.id,
        capturadoPorUid: venta.repartidorUid,
        ok: validacionVisita.ok === true,
        distanciaM: Number.isFinite(Number(validacionVisita.distanciaM)) ? Number(validacionVisita.distanciaM) : null,
        fecha,
        fechaAuditoria: firebase.firestore.Timestamp.fromDate(new Date(fecha)),
        expiresAt: firebase.firestore.Timestamp.fromDate(new Date(fechaMs + GPS_AUDIT_RETENTION_MS)),
        retentionClass: 'gps_visit_30d'
      });
    }
    return { estado: 'incidencia_inventario', notaId: notaRef.id, incidencia: true, total: venta.total, fecha, validacionVisita: venta.validacionVisita || null };
  };

  const enqueue = async payload => {
    const venta = quitarValidacionVencida(normalizePayload(payload));
    await putRecord(venta);
    await notify();
    // La sincronización automática se intenta de inmediato si la red volvió
    // entre la validación de la pantalla y el guardado local.
    if (global.navigator?.onLine) setTimeout(() => global.frittzSincronizarVentasOffline && global.frittzSincronizarVentasOffline(), 0);
    return { estado: 'pendiente_local', ventaId: venta.id, notaId: venta.notaId, total: venta.total, validacionVisita: venta.validacionVisita || null };
  };

  const guardar = async payload => {
    const venta = quitarValidacionVencida(normalizePayload(payload));
    try {
      if (!global.navigator?.onLine) return enqueue(venta);
      const resultado = await conciliar(venta);
      await notify();
      return resultado;
    } catch (error) {
      if (esIncidencia(error)) {
        const resultado = await registrarIncidenciaSinTransaccion(venta, error);
        await notify();
        return resultado;
      }
      if (isRetryableError(error)) return enqueue(venta);
      throw error;
    }
  };

  const processOne = async venta => {
    const actual = await getRecord(venta.id);
    if (!actual || !RETRY_STATES.includes(actual.estado)) return { estado: actual?.estado || 'omitida' };
    const reintentando = quitarValidacionVencida({ ...actual, estado: 'reintentando', intentos: Number(actual.intentos || 0) + 1, actualizadoEn: new Date().toISOString() });
    await putRecord(reintentando);
    try {
      const resultado = await conciliar(reintentando);
      await deleteRecord(reintentando.id);
      return resultado;
    } catch (error) {
      if (esIncidencia(error)) {
        const resultado = await registrarIncidenciaSinTransaccion(reintentando, error);
        await deleteRecord(reintentando.id);
        return resultado;
      }
      const pendiente = { ...reintentando, estado: isRetryableError(error) ? 'pendiente' : 'requiere_revision', ultimoError: error.message, actualizadoEn: new Date().toISOString() };
      await putRecord(pendiente);
      if (!isRetryableError(error)) return { estado: 'requiere_revision', ventaId: pendiente.id, error: error.message };
      throw error;
    }
  };

  const sincronizar = async () => {
    if (!global.navigator?.onLine) return { total: 0, sincronizadas: 0, incidencias: 0, pendientes: 0 };
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      const records = (await allRecords()).filter(record => RETRY_STATES.includes(record.estado)).sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));
      const resultado = { total: records.length, sincronizadas: 0, incidencias: 0, pendientes: 0, errores: [] };
      for (const record of records) {
        try {
          const r = await processOne(record);
          if (r.estado === 'incidencia_inventario') resultado.incidencias++;
          else if (r.estado === 'confirmada' || r.estado === 'pendiente_local') resultado.sincronizadas++;
        } catch (error) {
          resultado.pendientes++;
          resultado.errores.push({ ventaId: record.id, mensaje: error.message });
          break;
        }
      }
      await notify();
      return resultado;
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  };

  const pendientesRuta = async transferenciaId => {
    const records = (await allRecords()).filter(record => record.transferenciaId === transferenciaId && RETRY_STATES.includes(record.estado));
    const cantidades = {};
    records.forEach(record => (record.items || []).forEach(item => { cantidades[item.id] = (cantidades[item.id] || 0) + Number(item.cant || 0); }));
    return { total: records.length, ventas: records, cantidades };
  };

  const resumen = async () => {
    const records = await allRecords();
    return {
      total: records.length,
      pendientes: records.filter(record => RETRY_STATES.includes(record.estado)).length,
      incidencias: records.filter(record => record.estado === 'requiere_revision').length,
      registros: records
    };
  };

  const subscribe = callback => {
    listeners.add(callback);
    resumen().then(callback).catch(() => {});
    return () => listeners.delete(callback);
  };

  global.frittzGuardarVentaTransferencia = guardar;
  global.frittzEncolarVentaTransferencia = enqueue;
  global.frittzSincronizarVentasOffline = sincronizar;
  global.frittzVentasPendientesRuta = pendientesRuta;
  global.frittzResumenVentasOffline = resumen;
  global.frittzSuscribirVentasOffline = subscribe;

  global.addEventListener('online', () => setTimeout(() => sincronizar(), 250));
  try {
    global.firebase?.auth?.().onAuthStateChanged(user => {
      notify();
      if (user && global.navigator?.onLine) setTimeout(() => sincronizar(), 250);
    });
  } catch (e) {}
  if (global.navigator?.onLine) setTimeout(() => sincronizar(), 1000);
})(window);
