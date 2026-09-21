/**
 * 13_Banco.gs — Movimientos del banco.
 *
 * Se importa el extracto que baja el banco (CaixaBank y compañía) y el
 * CRM lo clasifica solo. Sirve para dos cosas: ver de verdad qué entra y
 * qué sale cada mes, y casar los cobros de los clientes con el dinero
 * que ha llegado a la cuenta.
 */

/* Palabras que aparecen en los conceptos del banco y qué significan. */
const REGLAS_BANCO = [
  /* Primero los movimientos entre cuentas propias: el dinero no sale de la
     empresa, solo cambia de sitio, y si cuenta como gasto la estructura y los
     impuestos salen inflados. */
  {categoria: 'traspaso',         claves: ['traspaso para imp', 'traspaso entre cuentas',
                                           'traspaso a impuestos',
                                           'zero wattios', 'zero watios']},
  {categoria: 'nominas',          claves: ['nomina', 'nóminas', 'nominas']},
  {categoria: 'seguridad_social', claves: ['tgss', 'cotizacion', 'seg social', 'seguridad social']},
  {categoria: 'impuestos',        claves: ['aeat', 'hacienda', 'tributaria', 'iva ', 'irpf', 'modelo 3',
                                           'impuesto', 'tributos', 'ayto', 'ayuntamiento']},
  {categoria: 'telefonia',        claves: ['digi', 'movistar', 'vodafone', 'orange', 'jazztel', 'telefonica',
                                           'yoigo', 'pepephone', 'telec']},
  {categoria: 'ropa_epi',         claves: ['uniforme', 'ropa corpora', 'ropa de tra', 'bordados', 'decathlon',
                                           'workwear', 'epi']},
  {categoria: 'montaje',          claves: ['greenfield', 'montaje', 'instalacion subcontrat']},
  {categoria: 'proveedor',        claves: ['pago factura', 'pago oferta', 'facturas abonadas', 'proveedor',
                                           'pago presupuesto', 'pago proforma', 'pago fianza', 'pago 40',
                                           'pago 50', 'pago 60', 'pago 25', 'pago 75', 'domusat', 'obramat',
                                           'leroy', 'bricomart', 'saltoki', 'escoda', 'suministros',
                                           'sun', 'solar', 'hanersun', 'solax', 'almacen']},
  {categoria: 'servicios',        claves: ['jibble', 'google', 'microsoft', 'adobe', 'zoom', 'openai',
                                           'anthropic', 'canva', 'dominio', 'hosting', 'www.', 'suscripcion']},
  {categoria: 'seguros',          claves: ['seguro', 'mapfre', 'allianz', 'axa', 'generali', 'legalitas',
                                           'asist.', 'mutua']},
  {categoria: 'banco',            claves: ['comision', 'mantenimiento cuenta', 'intereses', 'v.negocios',
                                           'cuota t.', 'tarjeta cuota', 'p.serv', 'trf. ajena']},
  {categoria: 'financiacion',     claves: ['prestamo', 'leasing', 'renting', 'cuota prestamo', 'amortizacion']},
  {categoria: 'transporte',       claves: ['repsol', 'cepsa', 'galp', 'shell', 'bp ', 'gasolinera', 'peaje',
                                           'parking', 'autopista', 'renfe', 'iberia', 'combustible']},
  {categoria: 'dietas',           claves: ['restaurante', 'cafeteria', 'bar ', 'hotel', 'menu', 'obm ']}
];

function categoriaBanco_(concepto, importe) {
  const c = normal_(concepto);
  for (let i = 0; i < REGLAS_BANCO.length; i++) {
    const r = REGLAS_BANCO[i];
    for (let j = 0; j < r.claves.length; j++) {
      if (c.indexOf(r.claves[j]) >= 0) return r.categoria;
    }
  }
  if (num_(importe) > 0) {
    return /(transferencia|transf|traspaso|ingreso|abono|su favor)/.test(c)
      ? 'cobro_cliente' : 'otros_ingresos';
  }
  return 'otros_gastos';
}

/* Coste fijo de tener la empresa abierta: lo que se paga haya o no obra.
   El material y el montaje NO entran aquí, porque son coste de la
   instalación, ni tampoco lo que todavía está sin clasificar. */
const CATEGORIAS_ESTRUCTURA = ['nominas', 'seguridad_social', 'servicios', 'seguros',
                               'banco', 'financiacion', 'transporte', 'dietas', 'telefonia',
                               'ropa_epi'];
/* Los impuestos salen aparte: el IVA no es un coste, es dinero que pasa por
   la cuenta, y meterlo en el coste fijo desvirtúa el punto de equilibrio. */
const CATEGORIAS_IMPUESTOS = ['impuestos'];

/* Cuando el extracto no dice de qué cuenta viene, se supone la principal. */
const CUENTA_POR_DEFECTO = 'CaixaBank';

/** Importa movimientos ya troceados por el navegador. */
function accImportarBanco_(u, p) {
  exigir_(u, 'finanzas');
  const filas = p.movimientos || [];
  if (!filas.length) return {ok: false, error: 'No ha llegado ningún movimiento.'};
  const cuenta = txt_(p.cuenta) || CUENTA_POR_DEFECTO;
  const pref = normal_(cuenta) === normal_(CUENTA_POR_DEFECTO) ? '' : normal_(cuenta) + '|';

  /* El saldo entra en la clave: dos apuntes iguales el mismo día son dos
     movimientos distintos y el saldo suele separarlos. Pero un cargo, su
     devolución y el mismo cargo otra vez dejan el saldo igual las dos veces,
     y los dos son de verdad. Por eso se cuentan las repeticiones: se compara
     cuántas veces aparece cada apunte en el extracto contra cuántas hay ya
     guardadas, y solo entra lo que sobra. Reimportar el mismo archivo sigue
     sin duplicar nada. */
  const guardadas = {};
  leer_('BANCO').forEach(function (m) {
    const base = txt_(m.clave).replace(/#\d+$/, '');
    guardadas[base] = (guardadas[base] || 0) + 1;
  });

  const nuevos = [];
  const entrantes = {};
  let repetidos = 0;
  filas.forEach(function (f) {
    const fecha = txt_(f.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    const importe = num_(f.importe);
    const concepto = txt_(f.concepto);
    /* La cuenta principal no lleva prefijo, para que las claves guardadas
       antes de que existieran varias cuentas sigan valiendo y reimportar su
       extracto no duplique nada. */
    const base = pref + fecha + '|' + normal_(concepto) + '|' +
                 redondear_(importe, 2) + '|' + redondear_(num_(f.saldo), 2);
    const vez = (entrantes[base] || 0) + 1;
    entrantes[base] = vez;
    if (vez <= (guardadas[base] || 0)) { repetidos++; return; }
    const clave = vez > 1 ? base + '#' + vez : base;
    nuevos.push({
      cuenta: cuenta,
      fecha: fecha, concepto: concepto, importe: redondear_(importe, 2),
      saldo: redondear_(num_(f.saldo), 2),
      tipo: importe >= 0 ? 'ingreso' : 'gasto',
      categoria: categoriaBanco_(concepto, importe), manual: 'no',
      operacion_id: '', cobro_id: '', gasto_id: '', conciliado: 'no',
      notas: '', clave: clave, creado: ahora_()
    });
  });

  if (nuevos.length) insertarLote_('BANCO', nuevos);
  registrar_(u, 'importar_banco', 'BANCO', '', cuenta + ': ' + nuevos.length + ' nuevos, ' +
             repetidos + ' repetidos');
  return {ok: true, cuenta: cuenta, nuevos: nuevos.length, repetidos: repetidos,
          total: leer_('BANCO').length};
}

/** Los movimientos y las cuentas que salen de ellos. */
function accBanco_(u, p) {
  exigir_(u, 'finanzas');
  const todos = leer_('BANCO').sort(function (a, b) {
    return txt_(b.fecha).localeCompare(txt_(a.fecha)); });
  const desde = txt_(p.desde) || '';
  const hasta = txt_(p.hasta) || '';
  const lista = todos.filter(function (m) {
    return (!desde || txt_(m.fecha) >= desde) && (!hasta || txt_(m.fecha) <= hasta);
  });

  const porMes = {};
  const porCategoria = {};
  lista.forEach(function (m) {
    const mes = mesDe_(txt_(m.fecha));
    if (!porMes[mes]) porMes[mes] = {mes: mes, ingresos: 0, gastos: 0, estructura: 0,
                                     impuestos: 0, neto: 0};
    const imp = num_(m.importe);
    if (imp >= 0) porMes[mes].ingresos = redondear_(porMes[mes].ingresos + imp, 2);
    else {
      porMes[mes].gastos = redondear_(porMes[mes].gastos - imp, 2);
      if (CATEGORIAS_ESTRUCTURA.indexOf(txt_(m.categoria)) >= 0) {
        porMes[mes].estructura = redondear_(porMes[mes].estructura - imp, 2);
      }
      if (CATEGORIAS_IMPUESTOS.indexOf(txt_(m.categoria)) >= 0) {
        porMes[mes].impuestos = redondear_(porMes[mes].impuestos - imp, 2);
      }
    }
    porMes[mes].neto = redondear_(porMes[mes].ingresos - porMes[mes].gastos, 2);

    const k = txt_(m.categoria) || 'otros_gastos';
    if (!porCategoria[k]) porCategoria[k] = {categoria: k, importe: 0, movimientos: 0};
    porCategoria[k].importe = redondear_(porCategoria[k].importe + Math.abs(imp), 2);
    porCategoria[k].movimientos += 1;
  });

  const meses = Object.keys(porMes).sort().map(function (k) { return porMes[k]; });
  /* Los meses cerrados dicen cuánto cuesta de verdad tener la empresa abierta. */
  const cerrados = meses.filter(function (m) { return m.mes < mesDe_(hoyISO_()); }).slice(-6);
  const estructuraReal = cerrados.length
    ? redondear_(cerrados.reduce(function (a, m) { return a + m.estructura; }, 0) / cerrados.length, 2)
    : 0;

  /* El saldo es el del último apunte de CADA cuenta; sumar el último de todos
     daría el de una sola y la tesorería saldría corta. */
  const porCuenta = {};
  todos.forEach(function (m) {
    const c = txt_(m.cuenta) || CUENTA_POR_DEFECTO;
    if (!porCuenta[c]) porCuenta[c] = {cuenta: c, saldo: num_(m.saldo), fecha: txt_(m.fecha),
                                       movimientos: 0};
    porCuenta[c].movimientos += 1;
  });
  const cuentas = Object.keys(porCuenta).map(function (k) { return porCuenta[k]; })
    .sort(function (a, b) { return b.saldo - a.saldo; });
  const saldoTotal = cuentas.reduce(function (a, c) { return a + c.saldo; }, 0);

  const ultimo = todos[0] || {};
  const sinConciliar = lista.filter(function (m) {
    return num_(m.importe) > 0 && normal_(m.conciliado) !== 'si'; });

  return {ok: true,
    movimientos: lista,
    meses: meses,
    categorias: Object.keys(porCategoria).map(function (k) { return porCategoria[k]; })
      .sort(function (a, b) { return b.importe - a.importe; }),
    cuentas: cuentas,
    saldo: redondear_(saldoTotal, 2), fecha_saldo: txt_(ultimo.fecha),
    estructura_real: estructuraReal,
    estructura_config: configNum_('coste_estructura_mes', 0),
    ingresos_sin_casar: sinConciliar.length,
    total: todos.length};
}

/** Cambia la categoría de un movimiento o lo casa con un cobro. */
function accGuardarMovimiento_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.movimiento || {};
  const cambios = {};
  ['categoria', 'notas', 'operacion_id', 'conciliado'].forEach(function (c) {
    if (d[c] !== undefined) cambios[c] = d[c];
  });
  /* Si alguien cambia la categoría a mano, mandan sus manos. */
  if (d.categoria !== undefined) cambios.manual = 'si';

  /* Casar con un cobro deja el cobro marcado con la fecha del banco. */
  if (txt_(d.cobro_id)) {
    const m = leer_('BANCO').filter(function (x) { return String(x.id) === String(d.id); })[0];
    const cobro = leer_('COBROS').filter(function (c) { return String(c.id) === String(d.cobro_id); })[0];
    if (m && cobro) {
      actualizar_('COBROS', cobro.id, {fecha_cobro: txt_(m.fecha), estado: 'cobrado',
        notas: txt_(cobro.notas) + ' · casado con el banco'});
      cambios.cobro_id = cobro.id;
      cambios.operacion_id = cobro.operacion_id;
      cambios.conciliado = 'si';
      cambios.categoria = 'cobro_cliente';
    }
  }

  const r = actualizar_('BANCO', d.id, cambios);
  registrar_(u, 'editar_movimiento', 'BANCO', d.id, txt_(cambios.categoria));
  return {ok: true, movimiento: r};
}

/** Crea el gasto de la instalación a partir de un movimiento del banco. */
function accGastoDesdeBanco_(u, p) {
  exigir_(u, 'finanzas');
  const m = leer_('BANCO').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!m) return {ok: false, error: 'Ese movimiento ya no está.'};
  if (num_(m.importe) >= 0) return {ok: false, error: 'Ese movimiento es un ingreso, no un gasto.'};

  const gasto = insertar_('GASTOS', {
    operacion_id: txt_(p.operacion_id), categoria: txt_(p.categoria) || 'otro',
    proveedor: txt_(p.proveedor) || txt_(m.concepto),
    concepto: txt_(p.concepto) || txt_(m.concepto),
    importe: Math.abs(num_(m.importe)), iva_pct: num_(p.iva_pct) || 21,
    fecha: txt_(m.fecha), estado_pago: 'pagado', fecha_pago: txt_(m.fecha),
    factura_proveedor: '', creado: ahora_(), creado_por: u.id,
    notas: 'Creado desde el movimiento bancario ' + m.id
  });
  actualizar_('BANCO', m.id, {gasto_id: gasto.id, conciliado: 'si',
    operacion_id: txt_(p.operacion_id)});
  registrar_(u, 'gasto_desde_banco', 'GASTOS', gasto.id, m.concepto);
  return {ok: true, gasto: gasto};
}

/**
 * Vuelve a pasar las reglas por los movimientos que nadie ha tocado a mano.
 * Sirve cuando se afinan las reglas y ya hay extractos importados.
 */
function accReclasificarBanco_(u, p) {
  exigir_(u, 'finanzas');
  let cambiados = 0;
  leer_('BANCO').forEach(function (m) {
    if (normal_(m.manual) === 'si') return;
    const nueva = categoriaBanco_(txt_(m.concepto), num_(m.importe));
    if (nueva !== txt_(m.categoria)) { actualizar_('BANCO', m.id, {categoria: nueva}); cambiados++; }
  });
  registrar_(u, 'reclasificar_banco', 'BANCO', '', cambiados + ' movimientos');
  return {ok: true, cambiados: cambiados};
}

/** Pone como coste de estructura lo que dice el banco. */
function accAjustarEstructura_(u, p) {
  exigir_(u, 'config');
  const valor = redondear_(num_(p.valor), 2);
  accGuardarConfig_(u, {config: {coste_estructura_mes: valor}});
  return {ok: true, valor: valor};
}
/**
 * 13_Banco.gs — Movimientos del banco.
 *
 * Se importa el extracto que baja el banco (CaixaBank y compañía) y el
 * CRM lo clasifica solo. Sirve para dos cosas: ver de verdad qué entra y
 * qué sale cada mes, y casar los cobros de los clientes con el dinero
 * que ha llegado a la cuenta.
 */

/* Palabras que aparecen en los conceptos del banco y qué significan. */
const REGLAS_BANCO = [
  {categoria: 'nominas',          claves: ['nomina', 'nóminas', 'nominas']},
  {categoria: 'seguridad_social', claves: ['tgss', 'cotizacion', 'seg social', 'seguridad social']},
  {categoria: 'impuestos',        claves: ['aeat', 'hacienda', 'tributaria', 'iva ', 'irpf', 'modelo 3',
                                           'impuesto', 'para imp', 'tributos', 'ayto', 'ayuntamiento']},
  {categoria: 'telefonia',        claves: ['digi', 'movistar', 'vodafone', 'orange', 'jazztel', 'telefonica',
                                           'yoigo', 'pepephone', 'telec']},
  {categoria: 'ropa_epi',         claves: ['uniforme', 'ropa corpora', 'ropa de tra', 'bordados', 'decathlon',
                                           'workwear', 'epi']},
  {categoria: 'montaje',          claves: ['greenfield', 'montaje', 'instalacion subcontrat']},
  {categoria: 'proveedor',        claves: ['pago factura', 'pago oferta', 'facturas abonadas', 'proveedor',
                                           'pago presupuesto', 'pago proforma', 'pago fianza', 'pago 40',
                                           'pago 50', 'pago 60', 'pago 25', 'pago 75', 'domusat', 'obramat',
                                           'leroy', 'bricomart', 'saltoki', 'escoda', 'suministros',
                                           'sun', 'solar', 'hanersun', 'solax', 'almacen']},
  {categoria: 'servicios',        claves: ['jibble', 'google', 'microsoft', 'adobe', 'zoom', 'openai',
                                           'anthropic', 'canva', 'dominio', 'hosting', 'www.', 'suscripcion']},
  {categoria: 'seguros',          claves: ['seguro', 'mapfre', 'allianz', 'axa', 'generali', 'legalitas',
                                           'asist.', 'mutua']},
  {categoria: 'banco',            claves: ['comision', 'mantenimiento cuenta', 'intereses', 'v.negocios',
                                           'cuota t.', 'tarjeta cuota', 'p.serv', 'trf. ajena']},
  {categoria: 'financiacion',     claves: ['prestamo', 'leasing', 'renting', 'cuota prestamo', 'amortizacion']},
  {categoria: 'transporte',       claves: ['repsol', 'cepsa', 'galp', 'shell', 'bp ', 'gasolinera', 'peaje',
                                           'parking', 'autopista', 'renfe', 'iberia', 'combustible']},
  {categoria: 'dietas',           claves: ['restaurante', 'cafeteria', 'bar ', 'hotel', 'menu', 'obm ']}
];

function categoriaBanco_(concepto, importe) {
  const c = normal_(concepto);
  for (let i = 0; i < REGLAS_BANCO.length; i++) {
    const r = REGLAS_BANCO[i];
    for (let j = 0; j < r.claves.length; j++) {
      if (c.indexOf(r.claves[j]) >= 0) return r.categoria;
    }
  }
  if (num_(importe) > 0) {
    return /(transferencia|transf|traspaso|ingreso|abono|su favor)/.test(c)
      ? 'cobro_cliente' : 'otros_ingresos';
  }
  return 'otros_gastos';
}

/* Coste fijo de tener la empresa abierta: lo que se paga haya o no obra.
   El material y el montaje NO entran aquí, porque son coste de la
   instalación, ni tampoco lo que todavía está sin clasificar. */
const CATEGORIAS_ESTRUCTURA = ['nominas', 'seguridad_social', 'servicios', 'seguros',
                               'banco', 'financiacion', 'transporte', 'dietas', 'telefonia',
                               'ropa_epi'];
/* Los impuestos salen aparte: el IVA no es un coste, es dinero que pasa por
   la cuenta, y meterlo en el coste fijo desvirtúa el punto de equilibrio. */
const CATEGORIAS_IMPUESTOS = ['impuestos'];

/** Importa movimientos ya troceados por el navegador. */
function accImportarBanco_(u, p) {
  exigir_(u, 'finanzas');
  const filas = p.movimientos || [];
  if (!filas.length) return {ok: false, error: 'No ha llegado ningún movimiento.'};

  /* El saldo entra en la clave: dos apuntes iguales el mismo día son dos
     movimientos distintos y el saldo suele separarlos. Pero un cargo, su
     devolución y el mismo cargo otra vez dejan el saldo igual las dos veces,
     y los dos son de verdad. Por eso se cuentan las repeticiones: se compara
     cuántas veces aparece cada apunte en el extracto contra cuántas hay ya
     guardadas, y solo entra lo que sobra. Reimportar el mismo archivo sigue
     sin duplicar nada. */
  const guardadas = {};
  leer_('BANCO').forEach(function (m) {
    const base = txt_(m.clave).replace(/#\d+$/, '');
    guardadas[base] = (guardadas[base] || 0) + 1;
  });

  const nuevos = [];
  const entrantes = {};
  let repetidos = 0;
  filas.forEach(function (f) {
    const fecha = txt_(f.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    const importe = num_(f.importe);
    const concepto = txt_(f.concepto);
    const base = fecha + '|' + normal_(concepto) + '|' + redondear_(importe, 2) +
                 '|' + redondear_(num_(f.saldo), 2);
    const vez = (entrantes[base] || 0) + 1;
    entrantes[base] = vez;
    if (vez <= (guardadas[base] || 0)) { repetidos++; return; }
    const clave = vez > 1 ? base + '#' + vez : base;
    nuevos.push({
      fecha: fecha, concepto: concepto, importe: redondear_(importe, 2),
      saldo: redondear_(num_(f.saldo), 2),
      tipo: importe >= 0 ? 'ingreso' : 'gasto',
      categoria: categoriaBanco_(concepto, importe), manual: 'no',
      operacion_id: '', cobro_id: '', gasto_id: '', conciliado: 'no',
      notas: '', clave: clave, creado: ahora_()
    });
  });

  if (nuevos.length) insertarLote_('BANCO', nuevos);
  registrar_(u, 'importar_banco', 'BANCO', '', nuevos.length + ' nuevos, ' + repetidos + ' repetidos');
  return {ok: true, nuevos: nuevos.length, repetidos: repetidos, total: leer_('BANCO').length};
}

/** Los movimientos y las cuentas que salen de ellos. */
function accBanco_(u, p) {
  exigir_(u, 'finanzas');
  const todos = leer_('BANCO').sort(function (a, b) {
    return txt_(b.fecha).localeCompare(txt_(a.fecha)); });
  const desde = txt_(p.desde) || '';
  const hasta = txt_(p.hasta) || '';
  const lista = todos.filter(function (m) {
    return (!desde || txt_(m.fecha) >= desde) && (!hasta || txt_(m.fecha) <= hasta);
  });

  const porMes = {};
  const porCategoria = {};
  lista.forEach(function (m) {
    const mes = mesDe_(txt_(m.fecha));
    if (!porMes[mes]) porMes[mes] = {mes: mes, ingresos: 0, gastos: 0, estructura: 0,
                                     impuestos: 0, neto: 0};
    const imp = num_(m.importe);
    if (imp >= 0) porMes[mes].ingresos = redondear_(porMes[mes].ingresos + imp, 2);
    else {
      porMes[mes].gastos = redondear_(porMes[mes].gastos - imp, 2);
      if (CATEGORIAS_ESTRUCTURA.indexOf(txt_(m.categoria)) >= 0) {
        porMes[mes].estructura = redondear_(porMes[mes].estructura - imp, 2);
      }
      if (CATEGORIAS_IMPUESTOS.indexOf(txt_(m.categoria)) >= 0) {
        porMes[mes].impuestos = redondear_(porMes[mes].impuestos - imp, 2);
      }
    }
    porMes[mes].neto = redondear_(porMes[mes].ingresos - porMes[mes].gastos, 2);

    const k = txt_(m.categoria) || 'otros_gastos';
    if (!porCategoria[k]) porCategoria[k] = {categoria: k, importe: 0, movimientos: 0};
    porCategoria[k].importe = redondear_(porCategoria[k].importe + Math.abs(imp), 2);
    porCategoria[k].movimientos += 1;
  });

  const meses = Object.keys(porMes).sort().map(function (k) { return porMes[k]; });
  /* Los meses cerrados dicen cuánto cuesta de verdad tener la empresa abierta. */
  const cerrados = meses.filter(function (m) { return m.mes < mesDe_(hoyISO_()); }).slice(-6);
  const estructuraReal = cerrados.length
    ? redondear_(cerrados.reduce(function (a, m) { return a + m.estructura; }, 0) / cerrados.length, 2)
    : 0;

  const ultimo = todos[0] || {};
  const sinConciliar = lista.filter(function (m) {
    return num_(m.importe) > 0 && normal_(m.conciliado) !== 'si'; });

  return {ok: true,
    movimientos: lista,
    meses: meses,
    categorias: Object.keys(porCategoria).map(function (k) { return porCategoria[k]; })
      .sort(function (a, b) { return b.importe - a.importe; }),
    saldo: num_(ultimo.saldo), fecha_saldo: txt_(ultimo.fecha),
    estructura_real: estructuraReal,
    estructura_config: configNum_('coste_estructura_mes', 0),
    ingresos_sin_casar: sinConciliar.length,
    total: todos.length};
}

/** Cambia la categoría de un movimiento o lo casa con un cobro. */
function accGuardarMovimiento_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.movimiento || {};
  const cambios = {};
  ['categoria', 'notas', 'operacion_id', 'conciliado'].forEach(function (c) {
    if (d[c] !== undefined) cambios[c] = d[c];
  });
  /* Si alguien cambia la categoría a mano, mandan sus manos. */
  if (d.categoria !== undefined) cambios.manual = 'si';

  /* Casar con un cobro deja el cobro marcado con la fecha del banco. */
  if (txt_(d.cobro_id)) {
    const m = leer_('BANCO').filter(function (x) { return String(x.id) === String(d.id); })[0];
    const cobro = leer_('COBROS').filter(function (c) { return String(c.id) === String(d.cobro_id); })[0];
    if (m && cobro) {
      actualizar_('COBROS', cobro.id, {fecha_cobro: txt_(m.fecha), estado: 'cobrado',
        notas: txt_(cobro.notas) + ' · casado con el banco'});
      cambios.cobro_id = cobro.id;
      cambios.operacion_id = cobro.operacion_id;
      cambios.conciliado = 'si';
      cambios.categoria = 'cobro_cliente';
    }
  }

  const r = actualizar_('BANCO', d.id, cambios);
  registrar_(u, 'editar_movimiento', 'BANCO', d.id, txt_(cambios.categoria));
  return {ok: true, movimiento: r};
}

/** Crea el gasto de la instalación a partir de un movimiento del banco. */
function accGastoDesdeBanco_(u, p) {
  exigir_(u, 'finanzas');
  const m = leer_('BANCO').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!m) return {ok: false, error: 'Ese movimiento ya no está.'};
  if (num_(m.importe) >= 0) return {ok: false, error: 'Ese movimiento es un ingreso, no un gasto.'};

  const gasto = insertar_('GASTOS', {
    operacion_id: txt_(p.operacion_id), categoria: txt_(p.categoria) || 'otro',
    proveedor: txt_(p.proveedor) || txt_(m.concepto),
    concepto: txt_(p.concepto) || txt_(m.concepto),
    importe: Math.abs(num_(m.importe)), iva_pct: num_(p.iva_pct) || 21,
    fecha: txt_(m.fecha), estado_pago: 'pagado', fecha_pago: txt_(m.fecha),
    factura_proveedor: '', creado: ahora_(), creado_por: u.id,
    notas: 'Creado desde el movimiento bancario ' + m.id
  });
  actualizar_('BANCO', m.id, {gasto_id: gasto.id, conciliado: 'si',
    operacion_id: txt_(p.operacion_id)});
  registrar_(u, 'gasto_desde_banco', 'GASTOS', gasto.id, m.concepto);
  return {ok: true, gasto: gasto};
}

/**
 * Vuelve a pasar las reglas por los movimientos que nadie ha tocado a mano.
 * Sirve cuando se afinan las reglas y ya hay extractos importados.
 */
function accReclasificarBanco_(u, p) {
  exigir_(u, 'finanzas');
  let cambiados = 0;
  leer_('BANCO').forEach(function (m) {
    if (normal_(m.manual) === 'si') return;
    const nueva = categoriaBanco_(txt_(m.concepto), num_(m.importe));
    if (nueva !== txt_(m.categoria)) { actualizar_('BANCO', m.id, {categoria: nueva}); cambiados++; }
  });
  registrar_(u, 'reclasificar_banco', 'BANCO', '', cambiados + ' movimientos');
  return {ok: true, cambiados: cambiados};
}

/** Pone como coste de estructura lo que dice el banco. */
function accAjustarEstructura_(u, p) {
  exigir_(u, 'config');
  const valor = redondear_(num_(p.valor), 2);
  accGuardarConfig_(u, {config: {coste_estructura_mes: valor}});
  return {ok: true, valor: valor};
}
