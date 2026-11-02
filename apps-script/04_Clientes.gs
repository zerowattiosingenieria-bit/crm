/**
 * 04_Clientes.gs — Clientes, operaciones, seguimiento y captaciones.
 *
 * El navegador pide una foto completa de lo que esa persona puede ver
 * (accDatos_) y a partir de ahí trabaja en local. Cada guardado vuelve
 * al servidor, que es quien comprueba de nuevo si puede tocar esa ficha.
 */

/* ---------- foto de datos ---------- */

function accDatos_(u, p) {
  const per = permisos_(u);
  const clientes = misClientes_(u);
  const visibles = {};
  clientes.forEach(function (c) { visibles[String(c.id)] = true; });

  const operaciones = leer_('OPERACIONES').filter(function (op) {
    return veOperacion_(u, op) || visibles[String(op.cliente_id)];
  });
  const opVisibles = {};
  operaciones.forEach(function (op) { opVisibles[String(op.id)] = true; });

  const seguimiento = leer_('SEGUIMIENTO').filter(function (s) { return visibles[String(s.cliente_id)]; });
  const captaciones = leer_('CAPTACIONES').filter(function (c) { return visibles[String(c.cliente_id)]; });

  const salida = {
    ok: true,
    usuario: publico_(u),
    permisos: per,
    catalogo: CATALOGO,
    config: configVisible_(u),
    usuarios: leer_('USUARIOS').map(publico_),
    clientes: clientes.map(function (c) { return clienteParaVer_(u, c); }),
    operaciones: operaciones,
    seguimiento: seguimiento,
    captaciones: captaciones,
    servidor: ahora_(),
    version: VERSION
  };

  /* La parte financiera solo viaja si el rol la tiene abierta. */
  if (per.finanzas) {
    salida.cobros = leer_('COBROS');
    salida.facturas = leer_('FACTURAS');
    salida.gastos = leer_('GASTOS');
  } else {
    /* Lo financiero y contable (cobros, facturas, gastos, banco) solo lo ve
       dirección; comerciales y captadores no reciben nada (30/10/2026). */
    salida.cobros = [];
    salida.facturas = [];
    salida.gastos = [];
  }
  return salida;
}

/* El coste y el margen de una instalación no viven en la operación, sino en
   la tabla GASTOS, que solo viaja a quien tiene las finanzas abiertas. Por eso
   la operación se envía entera: lo que enseña son importes de venta, que el
   comercial necesita. */

/* ---------- clientes ---------- */

function accGuardarCliente_(u, p) {
  const d = p.cliente || {};
  const per = permisos_(u);
  const campos = ESQUEMA.CLIENTES.filter(function (c) {
    return ['id','creado','creado_por','modificado','modificado_por'].indexOf(c) < 0;
  });

  if (d.id) {
    const actual = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(d.id); })[0];
    if (!actual) return {ok: false, error: 'Ese cliente ya no existe.'};
    if (!veCliente_(u, actual)) return {ok: false, error: 'Ese cliente no es tuyo.'};
    const cambios = {modificado: ahora_(), modificado_por: u.id};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    /* Nadie que no sea jefe puede regalarse o quitarse un cliente. */
    if (!per.editarTodo) { delete cambios.comercial_id; delete cambios.captador_id; }
    /* Lo que llega todavía tapado con asteriscos no pisa el DNI ni el email buenos. */
    ['dni', 'email', 'cotitular'].forEach(function (k) {
      if (cambios[k] !== undefined && esTapado_(cambios[k])) delete cambios[k];
    });
    if (cambios.estado && cambios.estado !== actual.estado) cambios.fecha_estado = hoyISO_();
    const r = actualizar_('CLIENTES', d.id, cambios);
    registrar_(u, 'editar_cliente', 'CLIENTES', d.id, cambios.estado || '');
    /* Si al corregir el teléfono o la calle resulta que es otro cliente que ya
       estaba, se avisa (no se bloquea: dirección decide si se fusionan). */
    let avisoDup = null;
    if (cambios.telefono !== undefined || cambios.direccion !== undefined) {
      const dup = buscarDuplicado_(r, r.id);
      if (dup) avisoDup = etiquetaDuplicado_(u, dup);
    }
    return {ok: true, cliente: clienteParaVer_(u, r), duplicado: avisoDup};
  }

  const nuevo = {creado: hoyISO_(), creado_por: u.id, modificado: ahora_(), modificado_por: u.id};
  campos.forEach(function (c) { if (d[c] !== undefined) nuevo[c] = d[c]; });
  if (!txt_(nuevo.nombre)) return {ok: false, error: 'El cliente necesita un nombre.'};
  /* Un cliente, una ficha: si ya está por teléfono o dirección, no se crea
     otro. Solo dirección puede forzarlo (dos viviendas del mismo dueño). */
  const dup = buscarDuplicado_(nuevo);
  if (dup && !(d.forzar && per.editarTodo)) {
    const info = etiquetaDuplicado_(u, dup);
    return {ok: false, duplicado: info,
            error: 'Ya existe un cliente con ese ' + dup.por + ': ' + info.etiqueta + ' (' + info.id + ')' +
                   (info.visible ? '. Ábrelo y apunta ahí lo nuevo.' : ', que lleva ' + (info.comercial || 'otra persona') +
                   '. Pide a dirección que te lo pase.')};
  }
  /* Quien da de alta se queda el cliente, salvo que un jefe diga otra cosa. */
  if (u.rol === 'comercial') nuevo.comercial_id = u.id;
  if (u.rol === 'captador') { nuevo.captador_id = u.id; nuevo.origen = nuevo.origen || 'captacion'; }
  nuevo.estado = nuevo.estado || (u.rol === 'captador' ? 'captado' : 'nuevo');
  nuevo.fecha_estado = hoyISO_();
  const r = insertar_('CLIENTES', nuevo);
  registrar_(u, 'alta_cliente', 'CLIENTES', r.id, r.nombre);
  return {ok: true, cliente: clienteParaVer_(u, r)};
}

function accBorrarCliente_(u, p) {
  exigir_(u, 'editarTodo');
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(p.id); })[0];
  if (!cli) return {ok: false, error: 'No existe.'};
  /* Borrar una ficha con cosas colgando dejaba apuntes y proyectos sueltos. */
  const enl = enlazadosDe_(p.id);
  const n = Object.keys(enl).reduce(function (a, k) { return a + enl[k]; }, 0);
  if (n) return {ok: false, enlazados: enl,
    error: 'Tiene ' + n + ' cosas enlazadas (' + Object.keys(enl).map(function (k) { return enl[k] + ' ' + k.toLowerCase(); }).join(', ') +
           '). Si es un duplicado, fusiónalo con la ficha buena en vez de borrarlo.'};
  borrar_('CLIENTES', p.id);
  registrar_(u, 'borrar_cliente', 'CLIENTES', p.id, cli.nombre);
  return {ok: true};
}

/* ---------- operaciones ---------- */

function accGuardarOperacion_(u, p) {
  const d = p.operacion || {};
  const per = permisos_(u);
  const campos = ESQUEMA.OPERACIONES.filter(function (c) {
    return ['id','creado','creado_por','modificado','modificado_por'].indexOf(c) < 0;
  });

  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(d.cliente_id); })[0];
  if (!cli) return {ok: false, error: 'La operación necesita un cliente.'};
  if (!veCliente_(u, cli)) return {ok: false, error: 'Ese cliente no es tuyo.'};

  const calc = totalesOperacion_(d);

  if (d.id) {
    const actual = leer_('OPERACIONES').filter(function (o) { return String(o.id) === String(d.id); })[0];
    if (!actual) return {ok: false, error: 'Esa operación ya no existe.'};
    if (!veOperacion_(u, actual) && !veCliente_(u, cli)) return {ok: false, error: 'Esa operación no es tuya.'};
    const cambios = {modificado: ahora_(), modificado_por: u.id};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    if (!per.editarTodo) { delete cambios.comercial_id; delete cambios.captador_id; }
    cambios.base = calc.base; cambios.total = calc.total;
    const r = actualizar_('OPERACIONES', d.id, cambios);
    sincronizarEstadoCliente_(u, r);
    /* Si cambia el importe y todavía no se ha cobrado nada, el calendario
       de cobros se rehace para que no quede descuadrado. */
    if (Math.abs(num_(actual.total) - calc.total) > 0.01) recalcularCobros_(u, r);
    registrar_(u, 'editar_operacion', 'OPERACIONES', d.id, cambios.estado || '');
    return {ok: true, operacion: r, cobros: cobrosDe_(u, d.id)};
  }

  const nueva = {creado: hoyISO_(), creado_por: u.id, modificado: ahora_(), modificado_por: u.id};
  campos.forEach(function (c) { if (d[c] !== undefined) nueva[c] = d[c]; });
  nueva.comercial_id = per.editarTodo && d.comercial_id ? d.comercial_id : (cli.comercial_id || u.id);
  nueva.captador_id = cli.captador_id || '';
  nueva.base = calc.base; nueva.total = calc.total;
  nueva.estado = nueva.estado || 'propuesta';
  nueva.referencia = nueva.referencia || ('ZW-' + hoyISO_().slice(0, 4) + '-' + Utilities.getUuid().slice(0, 4).toUpperCase());
  const r = insertar_('OPERACIONES', nueva);
  /* Al firmar en contado, el calendario de cobro 50/25/25 se crea solo. */
  if (normal_(r.forma_pago) === 'contado' && num_(r.total) > 0) crearCobrosEstandar_(u, r);
  sincronizarEstadoCliente_(u, r);
  registrar_(u, 'alta_operacion', 'OPERACIONES', r.id, cli.nombre);
  return {ok: true, operacion: r, cobros: cobrosDe_(u, r.id)};
}

/** Suma los importes de la operación y reparte base e IVA. */
function totalesOperacion_(d) {
  const total = num_(d.importe_fv) + num_(d.importe_aero) + num_(d.importe_bateria)
              + num_(d.importe_cargador) + num_(d.importe_extras);
  const iva = num_(d.iva_pct) || 21;
  return {total: redondear_(total, 2), base: redondear_(total / (1 + iva / 100), 2)};
}

/** Cuando una operación se firma o se cae, el cliente cambia de estado. */
function sincronizarEstadoCliente_(u, op) {
  if (!op) return;
  const mapa = {
    propuesta: 'propuesta', firmada: 'ganado', financiacion: 'negociando', tramite: 'ganado',
    material: 'ganado', instalacion: 'ganado', instalada: 'ganado', legalizada: 'ganado',
    cerrada: 'ganado', cancelada: 'perdido'
  };
  const nuevo = mapa[normal_(op.estado)];
  if (!nuevo) return;
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(op.cliente_id); })[0];
  if (cli && normal_(cli.estado) !== nuevo) {
    actualizar_('CLIENTES', cli.id, {estado: nuevo, fecha_estado: hoyISO_(),
      modificado: ahora_(), modificado_por: u.id});
  }
  /* Si venía de una captación, se marca cómo acabó. */
  const cap = captacionActual_(op.cliente_id, op.id);
  if (cap) {
    const res = nuevo === 'ganado' ? 'venta' : (nuevo === 'perdido' ? 'no_sentada' : 'sentada');
    if (normal_(cap.resultado) !== res) {
      const nuevaCap = actualizar_('CAPTACIONES', cap.id, {resultado: res, fecha_resultado: hoyISO_(), operacion_id: op.id});
      avisarCaptador_(nuevaCap, cli);
    }
  }
}

function crearCobrosEstandar_(u, op) {
  const total = num_(op.total);
  const firma = txt_(op.fecha_firma) || hoyISO_();
  const tramos = [['firma', 0.5, 0], ['material', 0.25, 25], ['final', 0.25, 45]];
  tramos.forEach(function (t) {
    insertar_('COBROS', {
      operacion_id: op.id, concepto: t[0], importe: redondear_(total * t[1], 2),
      fecha_prevista: sumarDias_(firma, t[2]), fecha_cobro: '', estado: 'previsto',
      metodo: 'transferencia', factura_id: '', notas: 'Generado automáticamente al crear la operación.',
      creado: ahora_(), creado_por: u.id
    });
  });
}

/**
 * Rehace el calendario de cobros de una operación cuando cambia su importe.
 * Solo toca los cobros que aún no se han cobrado: si ya ha entrado dinero,
 * se deja como está y se avisa en el registro.
 */
function recalcularCobros_(u, op) {
  const cobros = leer_('COBROS').filter(function (c) {
    return String(c.operacion_id) === String(op.id); });
  if (!cobros.length) {
    if (normal_(op.forma_pago) === 'contado' && num_(op.total) > 0) crearCobrosEstandar_(u, op);
    return;
  }
  const cobrado = cobros.filter(function (c) { return txt_(c.fecha_cobro); });
  /* 02/11/2026: los cobros metidos a mano (hitos de Finlight, acuerdos con
     el cliente) no se tocan nunca. Solo se rehacen los que creó el CRM. */
  const aMano = cobros.filter(function (c) { return txt_(c.notas).indexOf('Generado automáticamente') !== 0; });
  if (aMano.length) {
    registrar_(u, 'importe_cambiado_con_cobros', 'OPERACIONES', op.id,
      'Cobros puestos a mano: no se rehacen solos; revisar el calendario si hace falta.');
    return;
  }
  if (cobrado.length) {
    registrar_(u, 'importe_cambiado_con_cobros', 'OPERACIONES', op.id,
      'Revisar a mano el calendario de cobros: ya había dinero cobrado.');
    return;
  }
  cobros.forEach(function (c) { borrar_('COBROS', c.id); });
  if (num_(op.total) > 0) crearCobrosEstandar_(u, op);
}

function cobrosDe_(u, operacionId) {
  /* Cobros = contabilidad: solo dirección (30/10/2026). */
  if (!permisos_(u).finanzas) return [];
  return leer_('COBROS').filter(function (c) { return String(c.operacion_id) === String(operacionId); });
}

function accBorrarOperacion_(u, p) {
  exigir_(u, 'editarTodo');
  borrar_('OPERACIONES', p.id);
  registrar_(u, 'borrar_operacion', 'OPERACIONES', p.id, '');
  return {ok: true};
}

/* ---------- seguimiento ---------- */

function accGuardarSeguimiento_(u, p) {
  const d = p.seguimiento || {};
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(d.cliente_id); })[0];
  if (!cli) return {ok: false, error: 'Falta el cliente.'};
  if (!veCliente_(u, cli)) return {ok: false, error: 'Ese cliente no es tuyo.'};

  if (d.id) {
    const cambios = {};
    ['fecha','canal','nota','proximo_paso','proxima_fecha','estado_resultante','operacion_id']
      .forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    const r = actualizar_('SEGUIMIENTO', d.id, cambios);
    return {ok: true, seguimiento: r};
  }

  const nuevo = {
    cliente_id: d.cliente_id, operacion_id: d.operacion_id || '', usuario_id: u.id,
    fecha: d.fecha || hoyISO_(), canal: d.canal || 'llamada', nota: txt_(d.nota),
    proximo_paso: txt_(d.proximo_paso), proxima_fecha: d.proxima_fecha || '',
    estado_resultante: d.estado_resultante || '', origen: d.origen || 'manual', creado: ahora_()
  };
  const r = insertar_('SEGUIMIENTO', nuevo);

  const cambiosCliente = {modificado: ahora_(), modificado_por: u.id};
  if (nuevo.proximo_paso) cambiosCliente.proxima_accion = nuevo.proximo_paso;
  if (nuevo.proxima_fecha) cambiosCliente.proxima_fecha = nuevo.proxima_fecha;
  if (nuevo.estado_resultante) {
    cambiosCliente.estado = nuevo.estado_resultante;
    cambiosCliente.fecha_estado = hoyISO_();
  }
  const clienteActualizado = actualizar_('CLIENTES', cli.id, cambiosCliente);
  registrar_(u, 'seguimiento', 'CLIENTES', cli.id, nuevo.canal);
  return {ok: true, seguimiento: r, cliente: clienteActualizado};
}

/* ---------- captaciones ---------- */

function accGuardarCaptacion_(u, p) {
  const d = p.captacion || {};
  let clienteId = d.cliente_id;

  /* Un captador puede crear cliente y captación de una vez. */
  let avisoDup = null;
  let yaExistia = false;
  if (!clienteId && d.cliente) {
    const res = accGuardarCliente_(u, {cliente: d.cliente});
    if (!res.ok && res.duplicado) {
      /* Ya estaba: la cita se apunta en su ficha, no en una nueva. */
      clienteId = res.duplicado.id;
      avisoDup = res.duplicado;
      yaExistia = true;
    } else if (!res.ok) {
      return res;
    } else {
      clienteId = res.cliente.id;
    }
  }
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(clienteId); })[0];
  if (!cli) return {ok: false, error: 'Falta el cliente de la captación.'};
  if (!yaExistia && !veCliente_(u, cli)) return {ok: false, error: 'Ese cliente no es tuyo.'};
  if (yaExistia && d.id) return {ok: false, error: 'Ese cliente no es tuyo.'};
  /* Lo que trae la ficha nueva y la vieja no tenía (m², gastos…) se aprovecha;
     lo que ya estaba no se pisa. */
  if (yaExistia) {
    const relleno = {};
    Object.keys(d.cliente).forEach(function (k) {
      if (['id', 'nombre', 'comercial_id', 'captador_id', 'estado', 'origen'].indexOf(k) >= 0) return;
      if (ESQUEMA.CLIENTES.indexOf(k) >= 0 && !txt_(cli[k]) && txt_(d.cliente[k])) relleno[k] = d.cliente[k];
    });
    if (Object.keys(relleno).length) actualizar_('CLIENTES', cli.id, relleno);
  }

  const campos = ['fecha','hora_cita','estado_cita','tecnologia','comercial_id','resultado',
                  'fecha_resultado','operacion_id','interes','notas'];
  if (d.id) {
    const anterior = leer_('CAPTACIONES').filter(function (x) { return String(x.id) === String(d.id); })[0];
    const cambios = {};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    const r = actualizar_('CAPTACIONES', d.id, cambios);
    if (anterior && txt_(cambios.resultado) && normal_(cambios.resultado) !== normal_(anterior.resultado)) {
      avisarCaptador_(r, cli);
    }
    sincronizarCaptacionCliente_(u, r, leer_('CLIENTES').filter(function (c) { return String(c.id) === String(cli.id); })[0]);

    /* Adjudicar la captación a un comercial es lo que hace que ese comercial
       la vea: el cliente pasa a ser suyo. Si se quita, deja de verla. */
    if (d.comercial_id !== undefined &&
        txt_(d.comercial_id) !== txt_(anterior ? anterior.comercial_id : '')) {
      actualizar_('CLIENTES', cli.id, {comercial_id: txt_(d.comercial_id),
        modificado: ahora_(), modificado_por: u.id});
      registrar_(u, 'adjudicar_captacion', 'CAPTACIONES', d.id,
        txt_(d.comercial_id) ? 'a ' + txt_(d.comercial_id) : 'sin comercial');
    }
    /* Si cambia el día de la cita, la ficha del cliente lo refleja. */
    if (txt_(cambios.fecha) && normal_(r.resultado) === 'pendiente') {
      actualizar_('CLIENTES', cli.id, {proxima_accion: 'Sentada concertada',
        proxima_fecha: txt_(cambios.fecha), modificado: ahora_(), modificado_por: u.id});
    }
    return {ok: true, captacion: r,
            aviso_agenda: (cambios.fecha || cambios.hora_cita || cambios.comercial_id) ? choqueAgenda_(r) : ''};
  }
  const nueva = {cliente_id: clienteId,
                 captador_id: u.rol === 'captador' ? u.id : (d.captador_id || cli.captador_id || ''),
                 creado: ahora_()};
  campos.forEach(function (c) { nueva[c] = d[c] === undefined ? '' : d[c]; });
  /* El comercial que da una cita a un cliente suyo se la queda él. */
  if (!nueva.comercial_id && u.rol === 'comercial') nueva.comercial_id = u.id;
  nueva.fecha = nueva.fecha || hoyISO_();
  nueva.resultado = nueva.resultado || 'pendiente';
  const r = insertar_('CAPTACIONES', nueva);

  const cambiosCliente = {modificado: ahora_(), modificado_por: u.id};
  /* Una cita nueva no hace retroceder a un cliente que ya va por delante. */
  if (['ganado', 'propuesta', 'negociando', 'sentada'].indexOf(normal_(cli.estado)) < 0) {
    cambiosCliente.estado = 'cita';
    cambiosCliente.fecha_estado = hoyISO_();
  }
  if (txt_(nueva.interes)) cambiosCliente.interes = nueva.interes;
  if (nueva.comercial_id) cambiosCliente.comercial_id = nueva.comercial_id;
  if (nueva.fecha) { cambiosCliente.proxima_accion = 'Sentada concertada'; cambiosCliente.proxima_fecha = nueva.fecha; }
  actualizar_('CLIENTES', cli.id, cambiosCliente);
  registrar_(u, 'alta_captacion', 'CAPTACIONES', r.id, cli.nombre);
  return {ok: true, captacion: r, aviso_agenda: choqueAgenda_(r), duplicado: avisoDup,
          aviso_duplicado: avisoDup ? 'Este cliente ya estaba en el CRM (' + avisoDup.etiqueta + ', ' + avisoDup.id +
            '): la cita se ha apuntado en su ficha, sin crear otra.' : ''};
}

/**
 * Borra captaciones. Hasta hoy se podian borrar clientes, operaciones,
 * facturas, cobros y gastos, pero las captaciones solo se podian cancelar,
 * asi que los duplicados se quedaban en la hoja estorbando.
 * Acepta una sola (p.id) o varias de golpe (p.ids).
 */
function accBorrarCaptacion_(u, p) {
  exigir_(u, 'editarTodo');
  const pedidos = (p.ids && p.ids.length ? p.ids : (p.id ? [p.id] : []))
    .map(function (x) { return String(x); })
    .filter(function (x) { return x; });
  if (!pedidos.length) return {ok: false, error: 'No has dicho que captacion borrar.'};

  const todas = leer_('CAPTACIONES');
  const suyas = todas.filter(function (c) { return pedidos.indexOf(String(c.id)) >= 0; });
  if (!suyas.length) return {ok: false, error: 'No existe.'};

  /* Si alguna estaba enganchada a una operacion, esa operacion se queda sin
     captacion. No se impide, pero queda dicho en el registro para que el
     rastro no se pierda. */
  const conOperacion = suyas.filter(function (c) { return txt_(c.operacion_id); })
    .map(function (c) { return c.id + '>' + c.operacion_id; });

  const borradas = borrarVarios_('CAPTACIONES', suyas.map(function (c) { return c.id; }));
  registrar_(u, 'borrar_captacion', 'CAPTACIONES',
    suyas.map(function (c) { return c.id; }).join(' '),
    borradas + ' captaciones' +
    (conOperacion.length ? ' - tenian operacion: ' + conOperacion.join(', ') : ''));
  return {ok: true, borradas: borradas};
}

/* ---------- búsqueda rápida ---------- */

function accBuscar_(u, p) {
  const q = normal_(p.q);
  if (q.length < 2) return {ok: true, resultados: []};
  const clientes = misClientes_(u);
  const res = clientes.filter(function (c) {
    return normal_(c.nombre).indexOf(q) >= 0 || normal_(c.direccion).indexOf(q) >= 0
        || normal_(c.municipio).indexOf(q) >= 0 || normal_(c.telefono).indexOf(q) >= 0
        || normal_(c.email).indexOf(q) >= 0 || normal_(c.id).indexOf(q) >= 0;
  }).slice(0, 40);
  return {ok: true, resultados: res};
}
