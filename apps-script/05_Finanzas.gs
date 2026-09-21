/**
 * 05_Finanzas.gs — Contabilidad, tesorería y salud financiera.
 *
 * Solo entran aquí superadmin y administradores: la comprobación se hace
 * en cada acción, no en el menú del navegador.
 */

/* ---------- cobros ---------- */

function accGuardarCobro_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.cobro || {};
  const campos = ['operacion_id','concepto','importe','fecha_prevista','fecha_cobro','estado',
                  'metodo','factura_id','notas'];
  if (d.id) {
    const cambios = {};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    if (txt_(cambios.fecha_cobro)) cambios.estado = 'cobrado';
    const r = actualizar_('COBROS', d.id, cambios);
    registrar_(u, 'editar_cobro', 'COBROS', d.id, cambios.estado || '');
    return {ok: true, cobro: r};
  }
  const nuevo = {creado: ahora_(), creado_por: u.id};
  campos.forEach(function (c) { nuevo[c] = d[c] === undefined ? '' : d[c]; });
  nuevo.estado = nuevo.estado || (txt_(nuevo.fecha_cobro) ? 'cobrado' : 'previsto');
  const r = insertar_('COBROS', nuevo);
  registrar_(u, 'alta_cobro', 'COBROS', r.id, r.importe);
  return {ok: true, cobro: r};
}

function accBorrarCobro_(u, p) {
  exigir_(u, 'finanzas');
  borrar_('COBROS', p.id);
  return {ok: true};
}

/* ---------- facturas ---------- */

function accGuardarFactura_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.factura || {};
  const campos = ['numero','operacion_id','cliente_id','fecha_emision','concepto','base','iva_pct',
                  'iva','total','estado','fecha_vencimiento','fecha_cobro','url','notas'];
  const base = num_(d.base), ivaPct = num_(d.iva_pct) || configNum_('iva_pct', 21);
  const iva = redondear_(base * ivaPct / 100, 2);
  if (d.id) {
    const cambios = {};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    if (d.base !== undefined) { cambios.iva = iva; cambios.total = redondear_(base + iva, 2); }
    if (txt_(cambios.fecha_cobro)) cambios.estado = 'cobrada';
    const r = actualizar_('FACTURAS', d.id, cambios);
    registrar_(u, 'editar_factura', 'FACTURAS', d.id, cambios.estado || '');
    return {ok: true, factura: r};
  }
  const nueva = {emitida_por: u.id};
  campos.forEach(function (c) { nueva[c] = d[c] === undefined ? '' : d[c]; });
  nueva.numero = txt_(nueva.numero) || siguienteNumeroFactura_();
  nueva.fecha_emision = nueva.fecha_emision || hoyISO_();
  nueva.iva_pct = ivaPct; nueva.iva = iva; nueva.total = redondear_(base + iva, 2);
  nueva.estado = nueva.estado || 'emitida';
  nueva.fecha_vencimiento = nueva.fecha_vencimiento || sumarDias_(nueva.fecha_emision, 30);
  const r = insertar_('FACTURAS', nueva);
  registrar_(u, 'alta_factura', 'FACTURAS', r.id, r.numero);
  return {ok: true, factura: r};
}

function siguienteNumeroFactura_() {
  const anio = hoyISO_().slice(0, 4);
  const n = leer_('FACTURAS').filter(function (f) { return String(f.numero).indexOf('ZW/' + anio) === 0; }).length;
  return 'ZW/' + anio + '/' + String(n + 1).padStart(4, '0');
}

function accBorrarFactura_(u, p) {
  exigir_(u, 'finanzas');
  borrar_('FACTURAS', p.id);
  return {ok: true};
}

/* ---------- gastos ---------- */

function accGuardarGasto_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.gasto || {};
  const campos = ['operacion_id','categoria','proveedor','concepto','importe','iva_pct','fecha',
                  'estado_pago','fecha_pago','factura_proveedor','notas'];
  if (d.id) {
    const cambios = {};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    if (txt_(cambios.fecha_pago)) cambios.estado_pago = 'pagado';
    const r = actualizar_('GASTOS', d.id, cambios);
    registrar_(u, 'editar_gasto', 'GASTOS', d.id, '');
    return {ok: true, gasto: r};
  }
  const nuevo = {creado: ahora_(), creado_por: u.id};
  campos.forEach(function (c) { nuevo[c] = d[c] === undefined ? '' : d[c]; });
  nuevo.fecha = nuevo.fecha || hoyISO_();
  nuevo.estado_pago = nuevo.estado_pago || (txt_(nuevo.fecha_pago) ? 'pagado' : 'pendiente');
  const r = insertar_('GASTOS', nuevo);
  registrar_(u, 'alta_gasto', 'GASTOS', r.id, r.importe);
  return {ok: true, gasto: r};
}

function accBorrarGasto_(u, p) {
  exigir_(u, 'finanzas');
  borrar_('GASTOS', p.id);
  return {ok: true};
}

/* ---------- cuadro de mando contable ---------- */

/**
 * Devuelve las cuentas de la casa en un periodo, la cuenta de cada
 * instalación y la tabla de salud financiera con sus consejos.
 * p.desde y p.hasta en formato yyyy-mm-dd (por defecto, los últimos 12 meses).
 */
function accFinanzas_(u, p) {
  exigir_(u, 'finanzas');
  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -365);

  const operaciones = leer_('OPERACIONES');
  const clientes = indexar_(leer_('CLIENTES'));
  const cobros = leer_('COBROS');
  const gastos = leer_('GASTOS');
  const facturas = leer_('FACTURAS');
  const usuarios = indexar_(leer_('USUARIOS'));
  const cfg = config_();
  const estructuraMes = num_(cfg.coste_estructura_mes);
  const hoy = hoyISO_();

  const cobrosPorOp = {}, gastosPorOp = {};
  cobros.forEach(function (c) { (cobrosPorOp[String(c.operacion_id)] = cobrosPorOp[String(c.operacion_id)] || []).push(c); });
  gastos.forEach(function (g) { (gastosPorOp[String(g.operacion_id)] = gastosPorOp[String(g.operacion_id)] || []).push(g); });

  const vendidas = operaciones.filter(function (op) {
    return ['cancelada', 'propuesta', 'financiacion'].indexOf(normal_(op.estado)) < 0;
  });

  /* --- cuenta de cada instalación --- */
  const porOperacion = vendidas.map(function (op) {
    const cs = cobrosPorOp[String(op.id)] || [];
    const gs = gastosPorOp[String(op.id)] || [];
    const ingreso = num_(op.total);
    const base = num_(op.base) || redondear_(ingreso / (1 + (num_(op.iva_pct) || 21) / 100), 2);
    const cobrado = cs.filter(function (c) { return txt_(c.fecha_cobro); })
                      .reduce(function (a, c) { return a + num_(c.importe); }, 0);
    const pendiente = redondear_(ingreso - cobrado, 2);
    const vencido = cs.filter(function (c) {
      return !txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < hoy;
    }).reduce(function (a, c) { return a + num_(c.importe); }, 0);
    const coste = gs.reduce(function (a, g) { return a + num_(g.importe); }, 0);
    const costePendiente = gs.filter(function (g) { return normal_(g.estado_pago) !== 'pagado'; })
                             .reduce(function (a, g) { return a + num_(g.importe); }, 0);
    const margen = redondear_(base - coste, 2);
    const cli = clientes[String(op.cliente_id)] || {};
    return {
      id: op.id, referencia: op.referencia, cliente_id: op.cliente_id,
      cliente: cli.nombre || '—', municipio: cli.municipio || '',
      comercial: (usuarios[String(op.comercial_id)] || {}).nombre || '—',
      captador: (usuarios[String(op.captador_id)] || {}).nombre || '',
      tipo: op.tipo, estado: op.estado,
      fecha: txt_(op.fecha_firma) || txt_(op.fecha_propuesta) || txt_(op.creado),
      ingreso: redondear_(ingreso, 2), base: base, cobrado: redondear_(cobrado, 2),
      pendiente: pendiente, vencido: redondear_(vencido, 2),
      coste: redondear_(coste, 2), coste_pendiente: redondear_(costePendiente, 2),
      margen: margen, margen_pct: pct_(margen, base),
      ayudas: num_(op.ayudas_estimadas), cae: num_(op.cae_estimado),
      beneficio_no_economico: txt_(op.beneficio_no_economico),
      cobros: cs.length, gastos: gs.length
    };
  });

  const enRango = porOperacion.filter(function (o) { return o.fecha >= desde && o.fecha <= hasta; });

  /* --- totales del periodo --- */
  const ingresos = enRango.reduce(function (a, o) { return a + o.base; }, 0);
  const costes = enRango.reduce(function (a, o) { return a + o.coste; }, 0);
  const margenBruto = redondear_(ingresos - costes, 2);
  const meses = Math.max(1, Math.round((diasEntre_(desde, hasta) || 365) / 30.4));
  const estructura = redondear_(estructuraMes * meses, 2);
  const beneficioNeto = redondear_(margenBruto - estructura, 2);

  const cobradoPeriodo = cobros.filter(function (c) {
    return txt_(c.fecha_cobro) >= desde && txt_(c.fecha_cobro) <= hasta;
  }).reduce(function (a, c) { return a + num_(c.importe); }, 0);

  const pagadoPeriodo = gastos.filter(function (g) {
    return txt_(g.fecha_pago) >= desde && txt_(g.fecha_pago) <= hasta;
  }).reduce(function (a, g) { return a + num_(g.importe); }, 0);

  const pendienteCobro = cobros.filter(function (c) { return !txt_(c.fecha_cobro); })
                               .reduce(function (a, c) { return a + num_(c.importe); }, 0);
  const vencidoCobro = cobros.filter(function (c) {
    return !txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < hoy;
  }).reduce(function (a, c) { return a + num_(c.importe); }, 0);
  const pendientePago = gastos.filter(function (g) { return normal_(g.estado_pago) !== 'pagado'; })
                              .reduce(function (a, g) { return a + num_(g.importe); }, 0);

  /* --- gastos por categoría --- */
  const porCategoria = {};
  gastos.filter(function (g) { return txt_(g.fecha) >= desde && txt_(g.fecha) <= hasta; })
    .forEach(function (g) {
      const k = txt_(g.categoria) || 'otro';
      porCategoria[k] = redondear_((porCategoria[k] || 0) + num_(g.importe), 2);
    });

  /* --- evolución mes a mes --- */
  const porMes = {};
  function mes_(k) {
    if (!porMes[k]) porMes[k] = {mes: k, ingresos: 0, costes: 0, cobrado: 0, pagado: 0, ventas: 0};
    return porMes[k];
  }
  enRango.forEach(function (o) {
    const m = mes_(mesDe_(o.fecha));
    m.ingresos = redondear_(m.ingresos + o.base, 2);
    m.costes = redondear_(m.costes + o.coste, 2);
    m.ventas += 1;
  });
  cobros.forEach(function (c) {
    const f = txt_(c.fecha_cobro);
    if (f >= desde && f <= hasta) { const m = mes_(mesDe_(f)); m.cobrado = redondear_(m.cobrado + num_(c.importe), 2); }
  });
  gastos.forEach(function (g) {
    const f = txt_(g.fecha_pago);
    if (f >= desde && f <= hasta) { const m = mes_(mesDe_(f)); m.pagado = redondear_(m.pagado + num_(g.importe), 2); }
  });
  const evolucion = Object.keys(porMes).sort().map(function (k) {
    const m = porMes[k];
    m.margen = redondear_(m.ingresos - m.costes, 2);
    m.caja = redondear_(m.cobrado - m.pagado, 2);
    return m;
  });

  /* --- tesorería a 30 / 60 / 90 días --- */
  const tramos = [30, 60, 90].map(function (d) {
    const limite = sumarDias_(hoy, d);
    const entra = cobros.filter(function (c) {
      return !txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) <= limite;
    }).reduce(function (a, c) { return a + num_(c.importe); }, 0);
    const sale = gastos.filter(function (g) {
      return normal_(g.estado_pago) !== 'pagado' && txt_(g.fecha) && sumarDias_(txt_(g.fecha), 30) <= limite;
    }).reduce(function (a, g) { return a + num_(g.importe); }, 0);
    const fijos = redondear_(estructuraMes * (d / 30), 2);
    return {dias: d, entra: redondear_(entra, 2), sale: redondear_(sale, 2), estructura: fijos,
            neto: redondear_(entra - sale - fijos, 2)};
  });

  /* --- días medios de cobro --- */
  const cobrosConFecha = cobros.filter(function (c) { return txt_(c.fecha_cobro) && txt_(c.fecha_prevista); });
  const dso = cobrosConFecha.length
    ? redondear_(cobrosConFecha.reduce(function (a, c) {
        return a + (diasEntre_(c.fecha_prevista, c.fecha_cobro) || 0); }, 0) / cobrosConFecha.length, 1)
    : 0;

  /* --- facturación --- */
  const facturasPeriodo = facturas.filter(function (f) {
    return txt_(f.fecha_emision) >= desde && txt_(f.fecha_emision) <= hasta;
  });
  const facturado = facturasPeriodo.reduce(function (a, f) { return a + num_(f.base); }, 0);
  const facturasVencidas = facturas.filter(function (f) {
    return !txt_(f.fecha_cobro) && txt_(f.fecha_vencimiento) && txt_(f.fecha_vencimiento) < hoy;
  });

  const resumen = {
    desde: desde, hasta: hasta, meses: meses,
    ingresos: redondear_(ingresos, 2), costes: redondear_(costes, 2),
    margen_bruto: margenBruto, margen_pct: pct_(margenBruto, ingresos),
    estructura: estructura, beneficio_neto: beneficioNeto,
    beneficio_pct: pct_(beneficioNeto, ingresos),
    cobrado: redondear_(cobradoPeriodo, 2), pagado: redondear_(pagadoPeriodo, 2),
    caja_periodo: redondear_(cobradoPeriodo - pagadoPeriodo, 2),
    pendiente_cobro: redondear_(pendienteCobro, 2), vencido_cobro: redondear_(vencidoCobro, 2),
    pendiente_pago: redondear_(pendientePago, 2),
    operaciones: enRango.length, ticket_medio: enRango.length ? redondear_(ingresos / enRango.length, 2) : 0,
    facturado: redondear_(facturado, 2), facturas_emitidas: facturasPeriodo.length,
    facturas_vencidas: facturasVencidas.length,
    importe_facturas_vencidas: redondear_(facturasVencidas.reduce(function (a, f) { return a + num_(f.total); }, 0), 2),
    dso: dso, estructura_mes: estructuraMes
  };

  const salud = saludFinanciera_(resumen, enRango, tramos, cfg, operaciones);

  return {ok: true, resumen: resumen, operaciones: porOperacion, evolucion: evolucion,
          categorias: porCategoria, tesoreria: tramos, salud: salud.indicadores,
          consejos: salud.consejos, nota: salud.nota,
          facturas: facturas, cobros: cobros, gastos: gastos};
}

/**
 * Tabla de salud financiera: cada línea es un indicador con su valor,
 * su objetivo, un semáforo y qué hacer si está en rojo.
 */
function saludFinanciera_(r, operaciones, tesoreria, cfg, todasOperaciones) {
  const objetivoMargen = num_(cfg.margen_objetivo_pct) || 32;
  const objetivoDso = num_(cfg.dias_cobro_objetivo) || 45;
  const ind = [];
  const consejos = [];

  function linea(nombre, valor, formato, objetivo, estado, lectura) {
    ind.push({indicador: nombre, valor: valor, formato: formato, objetivo: objetivo,
              estado: estado, lectura: lectura});
  }
  function semaforo(v, bien, regular, alReves) {
    if (alReves) return v <= bien ? 'bien' : (v <= regular ? 'aviso' : 'mal');
    return v >= bien ? 'bien' : (v >= regular ? 'aviso' : 'mal');
  }

  /* 1. Margen bruto */
  const est1 = semaforo(r.margen_pct, objetivoMargen, objetivoMargen - 8);
  linea('Margen bruto', r.margen_pct, 'pct', objetivoMargen + ' %', est1,
    'De cada 100 € facturados quedan ' + redondear_(r.margen_pct, 1) + ' € antes de gastos de estructura.');
  if (est1 !== 'bien') consejos.push({
    titulo: 'El margen está por debajo del objetivo',
    accion: 'Revisa las tres instalaciones con peor margen de la tabla inferior. Si el desvío viene del material, renegocia precio por volumen con el proveedor; si viene del montaje, revisa el precio cerrado con la subcontrata antes de firmar más obras.',
    urgencia: est1 === 'mal' ? 'alta' : 'media'
  });

  /* 2. Beneficio neto */
  const est2 = r.beneficio_neto > 0 ? (r.beneficio_pct >= 10 ? 'bien' : 'aviso') : 'mal';
  linea('Beneficio neto del periodo', r.beneficio_neto, 'eur', '> 0 €', est2,
    'Margen bruto menos ' + redondear_(r.estructura, 0) + ' € de estructura (' + r.meses + ' meses).');
  if (est2 === 'mal') consejos.push({
    titulo: 'La estructura se come el margen',
    accion: 'Con ' + redondear_(r.estructura_mes, 0) + ' € de coste fijo al mes y un margen medio de ' +
            redondear_(r.margen_pct, 1) + ' %, hacen falta ' + puntoEquilibrio_(r) +
            ' instalaciones al mes solo para cubrir gastos. O suben las ventas o baja el fijo: no hay tercera vía.',
    urgencia: 'alta'
  });

  /* 3. Tesorería a 30 días */
  const t30 = (tesoreria[0] || {}).neto || 0;
  const est3 = t30 > 0 ? 'bien' : (t30 > -r.estructura_mes ? 'aviso' : 'mal');
  linea('Caja prevista a 30 días', t30, 'eur', '> 0 €', est3,
    'Cobros previstos menos pagos comprometidos y estructura del próximo mes.');
  if (est3 !== 'bien') consejos.push({
    titulo: 'El mes que viene entra menos de lo que sale',
    accion: 'Adelanta la facturación del 25 % de material de las obras ya firmadas y pide a la financiera la liquidación de las operaciones instaladas. Si aun así no cuadra, negocia con el proveedor de material pago a 60 días en lugar de 30.',
    urgencia: est3 === 'mal' ? 'alta' : 'media'
  });

  /* 4. Cobros vencidos */
  const pctVencido = pct_(r.vencido_cobro, r.pendiente_cobro);
  const est4 = semaforo(pctVencido, 5, 15, true);
  linea('Cobros vencidos sobre el pendiente', pctVencido, 'pct', '< 5 %', est4,
    redondear_(r.vencido_cobro, 0) + ' € pasados de fecha de un total pendiente de ' + redondear_(r.pendiente_cobro, 0) + ' €.');
  if (est4 !== 'bien') consejos.push({
    titulo: 'Hay dinero vencido sin reclamar',
    accion: 'Llama hoy a los clientes con cobros vencidos (los tienes marcados en rojo en la tabla de cobros). Un recordatorio a los 3 días del vencimiento recupera la mayoría sin tensar la relación.',
    urgencia: est4 === 'mal' ? 'alta' : 'media'
  });

  /* 5. Días medios de cobro */
  const est5 = semaforo(r.dso, 0, objetivoDso, true);
  linea('Desvío medio de cobro', r.dso, 'dias', '≤ 0 días sobre lo previsto', est5,
    r.dso > 0 ? 'Se cobra de media ' + r.dso + ' días más tarde de lo pactado.' : 'Se está cobrando en fecha.');
  if (est5 === 'mal') consejos.push({
    titulo: 'Se cobra tarde de forma sistemática',
    accion: 'Cambia el calendario de pagos del contrato: 50 % a la firma y 25 % contra entrega de material en obra, con la factura emitida el mismo día del hito. Emitir tarde es cobrar tarde.',
    urgencia: 'media'
  });

  /* 6. Fondo de maniobra operativo */
  const cobertura = r.pendiente_pago ? redondear_(r.pendiente_cobro / r.pendiente_pago, 2) : 99;
  const est6 = semaforo(cobertura, 1.5, 1);
  linea('Pendiente de cobro / pendiente de pago', cobertura, 'ratio', '≥ 1,5', est6,
    'Por cada euro que debemos, hay ' + cobertura + ' € por cobrar.');
  if (est6 !== 'bien') consejos.push({
    titulo: 'Debemos más de lo que vamos a cobrar a corto',
    accion: 'Frena los pedidos de material que no estén asociados a una obra firmada y con entrada cobrada. Encargar material a cuenta de ventas que aún no están firmadas es la forma más rápida de quedarse sin caja.',
    urgencia: 'alta'
  });

  /* 7. Concentración de clientes */
  const porCliente = {};
  operaciones.forEach(function (o) { porCliente[o.cliente] = (porCliente[o.cliente] || 0) + o.base; });
  const mayor = Object.keys(porCliente).sort(function (a, b) { return porCliente[b] - porCliente[a]; })[0];
  const pctMayor = mayor ? pct_(porCliente[mayor], r.ingresos) : 0;
  const est7 = semaforo(pctMayor, 20, 35, true);
  linea('Peso del mayor cliente', pctMayor, 'pct', '< 20 %', est7,
    mayor ? mayor + ' supone el ' + pctMayor + ' % de la facturación del periodo.' : 'Sin datos suficientes.');
  if (est7 === 'mal') consejos.push({
    titulo: 'Demasiada facturación en un solo cliente',
    accion: 'Mantén la captación a puerta activa aunque entren obras grandes. Un cliente que pesa más de un tercio de la facturación convierte cualquier retraso suyo en un problema de nóminas.',
    urgencia: 'media'
  });

  /* 8. Ticket medio */
  linea('Ticket medio por instalación', r.ticket_medio, 'eur', '—', 'info',
    r.operaciones + ' operaciones cerradas en el periodo.');

  /* 9. Punto de equilibrio */
  linea('Instalaciones al mes para cubrir gastos', puntoEquilibrio_(r), 'num', '—', 'info',
    'Con el margen y el ticket medio actuales.');

  /* 10. Conversión de propuestas */
  const propuestas = todasOperaciones.length;
  const ganadas = todasOperaciones.filter(function (o) {
    return ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada'].indexOf(normal_(o.estado)) >= 0;
  }).length;
  const conv = pct_(ganadas, propuestas);
  const est10 = semaforo(conv, 35, 20);
  linea('Propuestas que acaban en venta', conv, 'pct', '≥ 35 %', est10,
    ganadas + ' cerradas de ' + propuestas + ' propuestas emitidas.');
  if (est10 !== 'bien') consejos.push({
    titulo: 'Se emiten muchas propuestas que no cierran',
    accion: 'Repasa con cada comercial las propuestas de más de 15 días sin respuesta: o se cierran con una llamada de decisión, o se marcan como perdidas para dejar de contarlas como cartera. Una cartera inflada esconde el problema real.',
    urgencia: 'media'
  });

  /* Nota de cabecera */
  const malos = ind.filter(function (i) { return i.estado === 'mal'; }).length;
  const avisos = ind.filter(function (i) { return i.estado === 'aviso'; }).length;
  const nota = malos === 0 && avisos === 0
    ? {nivel: 'bien', texto: 'La empresa está sana: margen, cobro y caja dentro de objetivo.'}
    : (malos === 0
      ? {nivel: 'aviso', texto: 'Nada grave, pero hay ' + avisos + ' indicador(es) fuera de objetivo. Merece media hora esta semana.'}
      : {nivel: 'mal', texto: 'Hay ' + malos + ' indicador(es) en rojo. Empieza por los consejos marcados como urgencia alta.'});

  if (!consejos.length) consejos.push({
    titulo: 'Todo en verde: toca consolidar',
    accion: 'Aprovecha para adelantar la compra de material de las obras firmadas si el proveedor mejora precio por volumen, y deja en caja al menos dos meses de estructura antes de ampliar equipo.',
    urgencia: 'baja'
  });

  return {indicadores: ind, consejos: consejos, nota: nota};
}

function puntoEquilibrio_(r) {
  const margenUnidad = r.ticket_medio * (r.margen_pct / 100);
  if (margenUnidad <= 0) return 0;
  return Math.ceil(r.estructura_mes / margenUnidad);
}
