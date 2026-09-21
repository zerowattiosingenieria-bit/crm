/**
 * CRM · ZERO WATTIOS
 * 15_Importar.gs — Meter de golpe el histórico de la empresa.
 *
 * Sirve para arrancar el CRM con lo que ya pasó: los clientes de la carpeta
 * de Drive, las facturas emitidas, sus cobros, los gastos y las nóminas.
 * Se puede lanzar las veces que haga falta: cada cosa tiene una clave natural
 * (la referencia del cliente, la de la operación, el número de factura…) y lo
 * que ya está se actualiza en lugar de duplicarse.
 */

/** Los usuarios por su nombre de entrada, para resolver comercial y captador. */
function usuariosPorNombre_() {
  const m = {};
  leer_('USUARIOS').forEach(function (u) {
    m[normal_(u.usuario)] = u.id;
    m[normal_(u.nombre)] = u.id;
  });
  return m;
}

/** Busca un registro por el valor de una columna, ya normalizado. */
function porClave_(tabla, columna) {
  const m = {};
  leer_(tabla).forEach(function (r) {
    const k = normal_(r[columna]);
    if (k) m[k] = r;
  });
  return m;
}

/**
 * El paquete puede venir en la llamada o, si es grande, en un archivo JSON
 * dejado en el Drive de la empresa. Así no hay que empujar megas por HTTP.
 */
function paqueteDeDrive_(nombre) {
  const it = DriveApp.getFilesByName(nombre);
  if (!it.hasNext()) throw new Error('No encuentro el archivo ' + nombre + ' en el Drive.');
  const f = it.next();
  return JSON.parse(f.getBlob().getDataAsString('UTF-8'));
}

function accImportar_(u, p) {
  exigir_(u, 'editarTodo');
  if (txt_(p.archivo)) {
    const paquete = paqueteDeDrive_(txt_(p.archivo));
    ['clientes', 'operaciones', 'facturas', 'cobros', 'gastos', 'nominas'].forEach(function (k) {
      if (paquete[k]) p[k] = paquete[k];
    });
  }
  const gente = usuariosPorNombre_();
  const quien = function (nombre) { return gente[normal_(nombre)] || ''; };
  const cuenta = {clientes: 0, operaciones: 0, facturas: 0, cobros: 0, gastos: 0,
                  actualizados: 0};

  /* ---------- clientes, por referencia ---------- */
  const clientesPorRef = porClave_('CLIENTES', 'etiquetas');
  const clientesPorNombre = porClave_('CLIENTES', 'nombre');
  const refACliente = {};
  (p.clientes || []).forEach(function (c) {
    const ref = txt_(c.ref);
    const existente = clientesPorRef[normal_(ref)] || clientesPorNombre[normal_(c.nombre)];
    const datos = {
      nombre: txt_(c.nombre), telefono: txt_(c.telefono), email: txt_(c.email),
      direccion: txt_(c.direccion), municipio: txt_(c.municipio), cp: txt_(c.cp),
      comercial_id: quien(c.comercial), captador_id: quien(c.captador),
      interes: txt_(c.interes), origen: txt_(c.origen) || 'historico',
      estado: txt_(c.estado) || 'nuevo', fecha_estado: txt_(c.fecha_estado),
      etiquetas: ref, otros: txt_(c.notas),
      modificado: ahora_(), modificado_por: u.id
    };
    if (existente) {
      actualizar_('CLIENTES', existente.id, datos);
      refACliente[ref] = existente.id;
      cuenta.actualizados++;
    } else {
      datos.creado = txt_(c.creado) || ahora_();
      datos.creado_por = u.id;
      refACliente[ref] = insertar_('CLIENTES', datos).id;
      cuenta.clientes++;
    }
  });

  /* ---------- operaciones, por referencia ---------- */
  const opsPorRef = porClave_('OPERACIONES', 'referencia');
  /* Las obras que ya están cuentan desde el principio: así un paquete que
     solo traiga gastos puede colgarlos de su instalación. */
  const refAOperacion = {};
  leer_('OPERACIONES').forEach(function (o) {
    if (txt_(o.referencia)) refAOperacion[txt_(o.referencia)] = o.id;
  });
  (p.operaciones || []).forEach(function (o) {
    const ref = txt_(o.referencia);
    const cliente = refACliente[txt_(o.ref_cliente)] ||
                    (clientesPorNombre[normal_(o.cliente)] || {}).id || '';
    if (!cliente) return;
    const datos = {
      cliente_id: cliente, comercial_id: quien(o.comercial), captador_id: quien(o.captador),
      referencia: ref, tipo: txt_(o.tipo), estado: txt_(o.estado) || 'instalada',
      fecha_propuesta: txt_(o.fecha_propuesta), fecha_contrato: txt_(o.fecha_contrato),
      fecha_firma: txt_(o.fecha_firma), fecha_instalacion: txt_(o.fecha_instalacion),
      forma_pago: txt_(o.forma_pago), financiera: txt_(o.financiera),
      importe_fv: num_(o.importe_fv), importe_aero: num_(o.importe_aero),
      importe_bateria: num_(o.importe_bateria), importe_cargador: num_(o.importe_cargador),
      importe_extras: num_(o.importe_extras),
      iva_pct: o.iva_pct === undefined ? configNum_('iva_pct', 21) : num_(o.iva_pct),
      paneles_num: num_(o.paneles_num), panel_modelo: txt_(o.panel_modelo),
      inversor_modelo: txt_(o.inversor_modelo), inversor_kw: num_(o.inversor_kw),
      bateria_kwh: num_(o.bateria_kwh), bateria_modelo: txt_(o.bateria_modelo),
      cargador_modelo: txt_(o.cargador_modelo),
      aero_kw: num_(o.aero_kw), aero_modelo: txt_(o.aero_modelo),
      precio_ajustado: txt_(o.precio_ajustado) || 'no',
      observaciones: txt_(o.observaciones)
    };
    /* El total lo manda el histórico si viene; si no, se suma por partidas. */
    const base = num_(o.base) || (datos.importe_fv + datos.importe_aero +
      datos.importe_bateria + datos.importe_cargador + datos.importe_extras);
    datos.base = redondear_(base, 2);
    datos.total = num_(o.total) || redondear_(base * (1 + datos.iva_pct / 100), 2);

    const existente = opsPorRef[normal_(ref)];
    if (existente) {
      actualizar_('OPERACIONES', existente.id, datos);
      refAOperacion[ref] = existente.id;
      cuenta.actualizados++;
    } else {
      datos.creado = txt_(o.creado) || txt_(o.fecha_firma) || ahora_();
      datos.creado_por = u.id;
      refAOperacion[ref] = insertar_('OPERACIONES', datos).id;
      cuenta.operaciones++;
    }
    sincronizarEstadoCliente_(cliente);
  });

  /* ---------- facturas, por número ---------- */
  const factPorNumero = porClave_('FACTURAS', 'numero');
  (p.facturas || []).forEach(function (f) {
    const opId = refAOperacion[txt_(f.ref_operacion)] || '';
    const cliId = refACliente[txt_(f.ref_cliente)] ||
      (opId ? txt_((leer_('OPERACIONES').filter(function (x) { return x.id === opId; })[0] || {}).cliente_id) : '');
    const datos = {
      numero: txt_(f.numero), operacion_id: opId, cliente_id: cliId,
      fecha_emision: txt_(f.fecha), concepto: txt_(f.concepto),
      base: num_(f.base), iva_pct: num_(f.iva_pct) || 21, iva: num_(f.iva),
      total: num_(f.total), estado: txt_(f.estado) || 'cobrada',
      fecha_vencimiento: txt_(f.fecha_vencimiento), fecha_cobro: txt_(f.fecha_cobro),
      emitida_por: u.id, notas: txt_(f.notas)
    };
    const existente = factPorNumero[normal_(f.numero)];
    if (existente) { actualizar_('FACTURAS', existente.id, datos); cuenta.actualizados++; }
    else { insertar_('FACTURAS', datos); cuenta.facturas++; }
  });

  /* ---------- cobros: la clave es la operación más el concepto ---------- */
  const cobrosPorClave = {};
  leer_('COBROS').forEach(function (c) {
    cobrosPorClave[txt_(c.operacion_id) + '|' + normal_(c.concepto) + '|' + redondear_(num_(c.importe), 2)] = c;
  });
  (p.cobros || []).forEach(function (c) {
    const opId = refAOperacion[txt_(c.ref_operacion)] || '';
    if (!opId) return;
    const clave = opId + '|' + normal_(c.concepto) + '|' + redondear_(num_(c.importe), 2);
    const datos = {
      operacion_id: opId, concepto: txt_(c.concepto), importe: redondear_(num_(c.importe), 2),
      fecha_prevista: txt_(c.fecha_prevista), fecha_cobro: txt_(c.fecha_cobro),
      estado: txt_(c.fecha_cobro) ? 'cobrado' : 'pendiente',
      metodo: txt_(c.metodo) || 'transferencia', notas: txt_(c.notas)
    };
    const existente = cobrosPorClave[clave];
    if (existente) { actualizar_('COBROS', existente.id, datos); cuenta.actualizados++; }
    else { datos.creado = ahora_(); datos.creado_por = u.id; insertar_('COBROS', datos); cuenta.cobros++; }
  });

  /* ---------- gastos: proveedor, fecha e importe ---------- */
  const gastosPorClave = {};
  leer_('GASTOS').forEach(function (g) {
    gastosPorClave[normal_(g.proveedor) + '|' + txt_(g.fecha) + '|' +
                   redondear_(num_(g.importe), 2)] = g;
  });
  const claveGasto = function (prov, fecha, importe) {
    return normal_(prov) + '|' + txt_(fecha) + '|' + redondear_(num_(importe), 2);
  };
  (p.gastos || []).forEach(function (g) {
    /* «anterior» señala un gasto que ya está, para corregirlo en su sitio:
       así el apunte del banco pasa a ser la factura de la obra, con su
       importe sin IVA y la instalación a la que pertenece, sin duplicarse. */
    const propia = claveGasto(g.proveedor, g.fecha, g.importe);
    const ant = g.anterior;
    const antigua = ant ? claveGasto(ant.proveedor, ant.fecha, ant.importe) : '';
    /* Si ya se corrigió en una pasada anterior, la clave vieja ya no está y
       vale la nueva; por eso se busca primero una y luego la otra. */
    const clave = (antigua && gastosPorClave[antigua]) ? antigua : propia;
    const datos = {
      operacion_id: refAOperacion[txt_(g.ref_operacion)] || '',
      categoria: txt_(g.categoria) || 'otros', proveedor: txt_(g.proveedor),
      concepto: txt_(g.concepto), importe: redondear_(num_(g.importe), 2),
      iva_pct: num_(g.iva_pct) || 21, fecha: txt_(g.fecha),
      estado_pago: txt_(g.estado_pago) || 'pagado', fecha_pago: txt_(g.fecha_pago) || txt_(g.fecha),
      factura_proveedor: txt_(g.factura_proveedor), notas: txt_(g.notas)
    };
    const existente = gastosPorClave[clave];
    if (existente) {
      actualizar_('GASTOS', existente.id, datos);
      delete gastosPorClave[clave];
      gastosPorClave[propia] = existente;
      cuenta.actualizados++;
    } else {
      datos.creado = ahora_(); datos.creado_por = u.id;
      insertar_('GASTOS', datos);
      gastosPorClave[propia] = datos;
      cuenta.gastos++;
    }
  });

  /* ---------- nóminas: una por persona y mes ---------- */
  const nomPorClave = {};
  leer_('NOMINAS').forEach(function (n) {
    nomPorClave[txt_(n.usuario_id) + '|' + txt_(n.periodo)] = n;
  });
  cuenta.nominas = 0;
  (p.nominas || []).forEach(function (n) {
    const uid = quien(n.usuario);
    if (!uid) return;
    const bruto = num_(n.bruto), dietas = num_(n.dietas), comisiones = num_(n.comisiones);
    const brutoTotal = num_(n.bruto_total) || redondear_(bruto + dietas + comisiones, 2);
    const irpf = num_(n.irpf), ss = num_(n.ss);
    const datos = {
      usuario_id: uid, periodo: txt_(n.periodo),
      bruto: bruto, dietas: dietas, comisiones: comisiones, otros: num_(n.otros),
      bruto_total: brutoTotal,
      irpf_pct: num_(n.irpf_pct) || pct_(irpf, brutoTotal), irpf: irpf,
      ss_pct: num_(n.ss_pct) || pct_(ss, brutoTotal), ss: ss,
      neto: num_(n.neto) || redondear_(brutoTotal - irpf - ss, 2),
      estado: txt_(n.estado) || 'pagada', fecha_pago: txt_(n.fecha_pago),
      detalle: txt_(n.detalle), notas: txt_(n.notas)
    };
    const clave = uid + '|' + datos.periodo;
    const existente = nomPorClave[clave];
    if (existente) { actualizar_('NOMINAS', existente.id, datos); cuenta.actualizados++; }
    else { datos.creado = ahora_(); insertar_('NOMINAS', datos); cuenta.nominas++; }
  });

  registrar_(u, 'importar_historico', 'CRM', '', JSON.stringify(cuenta));
  return {ok: true, resumen: cuenta};
}
