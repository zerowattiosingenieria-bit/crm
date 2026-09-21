/**
 * 07_Resumen.gs — Cómo va cada persona y cómo va la casa.
 *
 * Un comercial solo puede pedir su propio resumen; los administradores
 * pueden pedir el de cualquiera y el del equipo entero.
 */

/* Los objetivos de venta se computan del 16 al 15 del mes siguiente. */
function periodoObjetivos_(refISO) {
  const ref = refISO || hoyISO_();
  const d = fecha_(ref);
  const inicio = new Date(d.getFullYear(), d.getMonth(), 16);
  if (d.getDate() < 16) inicio.setMonth(inicio.getMonth() - 1);
  const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 15);
  return {
    desde: Utilities.formatDate(inicio, zonaHoraria_(), 'yyyy-MM-dd'),
    hasta: Utilities.formatDate(fin, zonaHoraria_(), 'yyyy-MM-dd')
  };
}

function accResumen_(u, p) {
  const per = permisos_(u);
  const objetivoId = txt_(p.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !per.partesAjenos) {
    return {ok: false, error: 'Solo puedes consultar tu propio resumen.'};
  }
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -180);
  return {ok: true, resumen: resumenPersona_(persona, desde, hasta, permisos_(u).costes)};
}

function resumenPersona_(persona, desde, hasta, conImportes) {
  const esComercial = persona.rol === 'comercial' || persona.rol === 'admin' || persona.rol === 'superadmin';
  const clientes = leer_('CLIENTES');
  const operaciones = leer_('OPERACIONES');
  const captaciones = leer_('CAPTACIONES');
  const partes = leer_('PARTES').filter(function (x) {
    return String(x.usuario_id) === String(persona.id) && txt_(x.fecha) >= desde && txt_(x.fecha) <= hasta;
  });
  const seguimiento = leer_('SEGUIMIENTO').filter(function (s) { return String(s.usuario_id) === String(persona.id); });
  const hoy = hoyISO_();
  const obj = periodoObjetivos_(hasta);

  const misClientes = clientes.filter(function (c) {
    return persona.rol === 'captador' ? String(c.captador_id) === String(persona.id)
                                      : String(c.comercial_id) === String(persona.id);
  });
  const misOps = operaciones.filter(function (o) {
    return persona.rol === 'captador' ? String(o.captador_id) === String(persona.id)
                                      : String(o.comercial_id) === String(persona.id);
  });
  const enRango = function (f) { return txt_(f) >= desde && txt_(f) <= hasta; };
  const ganadas = misOps.filter(function (o) { return esGanada_(o); });
  const ganadasRango = ganadas.filter(function (o) { return enRango(txt_(o.fecha_firma) || txt_(o.creado)); });
  const perdidas = misOps.filter(function (o) { return normal_(o.estado) === 'cancelada'; });
  const abiertas = misOps.filter(function (o) {
    return ['propuesta', 'financiacion'].indexOf(normal_(o.estado)) >= 0;
  });

  const sentadas = partes.reduce(function (a, x) { return a + num_(x.sentadas); }, 0);
  const puertas = partes.reduce(function (a, x) { return a + num_(x.puertas); }, 0);
  const visitas = partes.reduce(function (a, x) { return a + num_(x.visitas); }, 0);
  const fichas = captaciones.filter(function (c) {
    return String(c.captador_id) === String(persona.id) && enRango(c.fecha);
  });
  const citasConfirmadas = fichas.filter(function (c) { return normal_(c.estado_cita) === 'confirmada'; });
  /* Se cuentan sobre las fichas del periodo, para que las conversiones
     comparen siempre lo mismo y no pasen del 100 %. */
  const captacionesVenta = fichas.filter(function (c) { return normal_(c.resultado) === 'venta'; });
  const captacionesSentada = fichas.filter(function (c) {
    return ['sentada', 'venta'].indexOf(normal_(c.resultado)) >= 0;
  });
  const captacionesVentaTodas = captaciones.filter(function (c) {
    return String(c.captador_id) === String(persona.id) && normal_(c.resultado) === 'venta';
  });

  const importeVendido = ganadasRango.reduce(function (a, o) { return a + num_(o.total); }, 0);
  /* Las captaciones que acaban en venta se pagan a quien abrió la puerta,
     sea captador o comercial, así que se miran por captador_id siempre. */
  const misCaptacionesVendidas = captaciones.filter(function (c) {
    return String(c.captador_id) === String(persona.id) && normal_(c.resultado) === 'venta' &&
           enRango(txt_(c.fecha_resultado) || txt_(c.fecha));
  });
  const comisiones = comisionesDe_(persona, ganadasRango, misCaptacionesVendidas,
    ventasDeSuEquipo_(persona, desde, hasta));

  /* Objetivo del periodo 16-15: una operación doble cuenta por dos. */
  const delPeriodo = misOps.filter(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    return esGanada_(o) && f >= obj.desde && f <= obj.hasta;
  });
  const sencillasPeriodo = delPeriodo.reduce(function (a, o) {
    return a + (normal_(o.tipo) === 'fv_aero' ? 2 : 1);
  }, 0);
  const objetivoMes = num_(persona.objetivo_mes) || (persona.rol === 'captador' ? 60 : 6);
  const logradoObjetivo = persona.rol === 'captador'
    ? fichas.filter(function (c) { return txt_(c.fecha) >= obj.desde && txt_(c.fecha) <= obj.hasta; }).length
    : sencillasPeriodo;

  /* Evolución mes a mes */
  const meses = {};
  function m_(k) {
    if (!meses[k]) meses[k] = {mes: k, ventas: 0, importe: 0, sentadas: 0, fichas: 0, propuestas: 0};
    return meses[k];
  }
  ganadas.forEach(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    if (enRango(f)) { const x = m_(mesDe_(f)); x.ventas += 1; x.importe = redondear_(x.importe + num_(o.total), 2); }
  });
  misOps.forEach(function (o) {
    const f = txt_(o.fecha_propuesta) || txt_(o.creado);
    if (enRango(f)) m_(mesDe_(f)).propuestas += 1;
  });
  partes.forEach(function (x) { m_(mesDe_(txt_(x.fecha))).sentadas += num_(x.sentadas); });
  fichas.forEach(function (c) { m_(mesDe_(txt_(c.fecha))).fichas += 1; });
  const evolucion = Object.keys(meses).sort().map(function (k) { return meses[k]; });

  /* Cartera y avisos */
  const ultimoContacto = {};
  seguimiento.forEach(function (s) {
    const k = String(s.cliente_id);
    if (!ultimoContacto[k] || ultimoContacto[k] < txt_(s.fecha)) ultimoContacto[k] = txt_(s.fecha);
  });
  const frios = misClientes.filter(function (c) {
    if (['ganado', 'perdido'].indexOf(normal_(c.estado)) >= 0) return false;
    const ult = ultimoContacto[String(c.id)] || txt_(c.fecha_estado) || txt_(c.creado);
    return (diasEntre_(ult, hoy) || 0) > 15;
  }).map(function (c) {
    return {id: c.id, nombre: c.nombre, municipio: c.municipio, estado: c.estado,
            dias: diasEntre_(ultimoContacto[String(c.id)] || txt_(c.fecha_estado) || txt_(c.creado), hoy)};
  }).sort(function (a, b) { return b.dias - a.dias; }).slice(0, 25);

  const proximas = misClientes.filter(function (c) { return txt_(c.proxima_fecha); })
    .map(function (c) {
      return {id: c.id, nombre: c.nombre, accion: c.proxima_accion, fecha: txt_(c.proxima_fecha),
              vencida: txt_(c.proxima_fecha) < hoy, estado: c.estado};
    }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); }).slice(0, 30);

  const tasa = function (a, b) { return pct_(a, b); };

  const r = {
    persona: publico_(persona),
    desde: desde, hasta: hasta,
    periodo_objetivos: obj,
    clientes: misClientes.length,
    clientes_activos: misClientes.filter(function (c) {
      return ['ganado', 'perdido'].indexOf(normal_(c.estado)) < 0; }).length,
    propuestas: misOps.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length,
    ventas: ganadasRango.length,
    perdidas: perdidas.filter(function (o) { return enRango(txt_(o.modificado) || txt_(o.creado)); }).length,
    sentadas: sentadas, puertas: puertas, visitas: visitas,
    fichas: fichas.length, citas_confirmadas: citasConfirmadas.length,
    captaciones_sentada: captacionesSentada.length, captaciones_venta: captacionesVenta.length,
    conversion_sentada_venta: tasa(ganadasRango.length, sentadas),
    conversion_propuesta_venta: tasa(ganadasRango.length,
      misOps.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length),
    conversion_ficha_sentada: tasa(captacionesSentada.length, fichas.length),
    conversion_ficha_venta: tasa(captacionesVenta.length, fichas.length),
    conversion_puerta_ficha: tasa(fichas.length, puertas),
    objetivo_mes: objetivoMes, logrado_objetivo: logradoObjetivo,
    objetivo_pct: pct_(logradoObjetivo, objetivoMes),
    cartera_abierta: abiertas.length,
    evolucion: evolucion,
    frios: frios, proximas: proximas,
    partes_enviados: partes.length,
    dias_sin_parte: diasSinParte_(persona, partes),
    comisiones: comisiones
  };

  if (conImportes || persona.rol !== 'captador') {
    r.importe_vendido = redondear_(importeVendido, 2);
    r.ticket_medio = ganadasRango.length ? redondear_(importeVendido / ganadasRango.length, 2) : 0;
    r.cartera_importe = redondear_(abiertas.reduce(function (a, o) { return a + num_(o.total); }, 0), 2);
    /* Cartera ponderada: lo que razonablemente va a entrar. */
    r.cartera_ponderada = redondear_(abiertas.reduce(function (a, o) {
      const peso = normal_(o.estado) === 'financiacion' ? 0.6 : 0.35;
      return a + num_(o.total) * peso;
    }, 0), 2);
  }
  return r;
}

function esGanada_(o) {
  return ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada']
    .indexOf(normal_(o.estado)) >= 0;
}

/**
 * Lo que cobra una persona por su trabajo comercial. Hay cuatro formas de
 * comisionar y no se excluyen entre sí:
 *
 *   venta      · la instalación que ha cerrado, a su tarifa
 *   ajustada   · la misma venta cuando se ha bajado el precio estándar
 *   captación  · haber abierto la puerta de algo que acabó vendiéndose,
 *                aunque la venta la cerrara otro
 *   equipo     · cada venta de alguien que tiene a esta persona de
 *                responsable; es lo que cobra un sénior por lo que cierra
 *                su júnior
 *
 * Las tarifas son las de la persona; si no las tiene puestas, las de Ajustes.
 */
function comisionesDe_(persona, ganadas, captacionesVenta, ventasEquipo) {
  const cfg = config_();
  const tarifa = function (campo, porDefecto) {
    const propia = num_(persona[campo]);
    return propia || num_(cfg[porDefecto || campo]);
  };
  const cFV = tarifa('comision_fv');
  const cAero = tarifa('comision_aero');
  const cFVaj = tarifa('comision_fv_ajustada');
  const cAeroaj = tarifa('comision_aero_ajustada');
  const cCapFV = tarifa('comision_captacion_fv');
  const cCapAero = tarifa('comision_captacion_aero');
  const cEqFV = tarifa('comision_equipo_fv');
  const cEqAero = tarifa('comision_equipo_aero');

  let total = 0;
  const detalle = [];
  const apuntar = function (importe, concepto, o, extra) {
    if (!importe) return;
    total += importe;
    detalle.push(Object.assign({
      operacion_id: o && o.id ? o.id : '', referencia: (o && o.referencia) || '',
      tipo: o ? o.tipo : '', concepto: concepto, importe: redondear_(importe, 2),
      fecha: o ? (txt_(o.fecha_firma) || txt_(o.creado)) : ''
    }, extra || {}));
  };
  const porTipo = function (o, fv, aero) {
    const t = normal_(o.tipo);
    return (t === 'fv' || t === 'fv_aero' ? fv : 0) + (t === 'aero' || t === 'fv_aero' ? aero : 0);
  };

  ganadas.forEach(function (o) {
    const ajustada = normal_(o.precio_ajustado) === 'si';
    apuntar(porTipo(o, ajustada ? cFVaj : cFV, ajustada ? cAeroaj : cAero),
            ajustada ? 'venta con precio ajustado' : 'venta', o);
  });

  (captacionesVenta || []).forEach(function (c) {
    const tipo = normal_(c.tecnologia) || 'fv';
    const importe = (tipo === 'fv' || tipo === 'fv_aero' ? cCapFV : 0) +
                    (tipo === 'aero' || tipo === 'fv_aero' ? cCapAero : 0);
    apuntar(importe, 'captación vendida', null,
      {operacion_id: c.operacion_id || '', referencia: 'Captación ' + c.id, tipo: tipo,
       fecha: txt_(c.fecha_resultado) || txt_(c.fecha)});
  });

  (ventasEquipo || []).forEach(function (o) {
    apuntar(porTipo(o, cEqFV, cEqAero), 'venta de su equipo', o, {de: o._de || ''});
  });

  return {total: redondear_(total, 2), detalle: detalle};
}

/** Las ventas cerradas por la gente que tiene a esta persona de responsable. */
function ventasDeSuEquipo_(persona, desde, hasta) {
  const suyos = leer_('USUARIOS').filter(function (x) {
    return String(x.responsable_id || '') === String(persona.id) && String(x.id) !== String(persona.id);
  });
  if (!suyos.length) return [];
  const nombre = {};
  suyos.forEach(function (x) { nombre[String(x.id)] = txt_(x.nombre); });
  return leer_('OPERACIONES').filter(function (o) {
    if (!nombre[String(o.comercial_id)] || !esGanada_(o)) return false;
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    return f >= desde && f <= hasta;
  }).map(function (o) {
    const copia = Object.assign({}, o);
    copia._de = nombre[String(o.comercial_id)];
    return copia;
  });
}

function diasSinParte_(persona, partes) {
  if (!partes.length) return null;
  const ultimo = partes.map(function (x) { return txt_(x.fecha); }).sort().pop();
  return diasEntre_(ultimo, hoyISO_());
}

/* ---------- el equipo al completo ---------- */

function accEquipo_(u, p) {
  exigir_(u, 'partesAjenos');
  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -90);
  const gente = leer_('USUARIOS').filter(function (x) { return normal_(x.activo) === 'si'; });
  const resumenes = gente.map(function (g) { return resumenPersona_(g, desde, hasta, true); });

  const comerciales = resumenes.filter(function (r) { return r.persona.rol === 'comercial'; })
    .sort(function (a, b) { return (b.importe_vendido || 0) - (a.importe_vendido || 0); });
  const captadores = resumenes.filter(function (r) { return r.persona.rol === 'captador'; })
    .sort(function (a, b) { return b.fichas - a.fichas; });

  return {ok: true, desde: desde, hasta: hasta, equipo: resumenes,
          ranking_comerciales: comerciales, ranking_captadores: captadores};
}

/* ---------- analítica de la casa ---------- */

function accAnalitica_(u, p) {
  exigir_(u, 'partesAjenos');
  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -365);
  const clientes = leer_('CLIENTES');
  const operaciones = leer_('OPERACIONES');
  const captaciones = leer_('CAPTACIONES');
  const partes = leer_('PARTES').filter(function (x) { return txt_(x.fecha) >= desde && txt_(x.fecha) <= hasta; });
  const usuarios = indexar_(leer_('USUARIOS'));
  const enRango = function (f) { return txt_(f) >= desde && txt_(f) <= hasta; };

  /* Embudo: puerta -> ficha -> sentada -> propuesta -> venta */
  const puertas = partes.reduce(function (a, x) { return a + num_(x.puertas); }, 0);
  const fichas = captaciones.filter(function (c) { return enRango(c.fecha); }).length;
  const sentadas = partes.reduce(function (a, x) { return a + num_(x.sentadas); }, 0);
  const propuestas = operaciones.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length;
  const ventas = operaciones.filter(function (o) {
    return esGanada_(o) && enRango(txt_(o.fecha_firma) || txt_(o.creado)); }).length;

  const embudo = [
    {fase: 'Puertas', valor: puertas},
    {fase: 'Fichas de captación', valor: fichas, conversion: pct_(fichas, puertas)},
    {fase: 'Sentadas', valor: sentadas, conversion: pct_(sentadas, fichas)},
    {fase: 'Propuestas', valor: propuestas, conversion: pct_(propuestas, sentadas)},
    {fase: 'Ventas', valor: ventas, conversion: pct_(ventas, propuestas)}
  ];

  /* Por municipio */
  const mun = {};
  clientes.forEach(function (c) {
    const k = txt_(c.municipio) || 'Sin municipio';
    if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, interes: 0, n: 0};
    mun[k].clientes += 1;
    if (num_(c.interes)) { mun[k].interes += num_(c.interes); mun[k].n += 1; }
  });
  operaciones.filter(esGanada_).forEach(function (o) {
    const c = clientes.filter(function (x) { return String(x.id) === String(o.cliente_id); })[0];
    const k = c ? (txt_(c.municipio) || 'Sin municipio') : 'Sin municipio';
    if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, interes: 0, n: 0};
    mun[k].ventas += 1;
    mun[k].importe = redondear_(mun[k].importe + num_(o.total), 2);
  });
  const municipios = Object.keys(mun).map(function (k) {
    const m = mun[k];
    m.conversion = pct_(m.ventas, m.clientes);
    m.interes_medio = m.n ? redondear_(m.interes / m.n, 1) : 0;
    return m;
  }).sort(function (a, b) { return b.importe - a.importe; });

  /* Tiempos medios por fase */
  const tiempos = {propuesta_firma: [], firma_instalacion: [], instalacion_legalizacion: []};
  operaciones.forEach(function (o) {
    const a = diasEntre_(txt_(o.fecha_propuesta), txt_(o.fecha_firma));
    if (a !== null && a >= 0) tiempos.propuesta_firma.push(a);
    const b = diasEntre_(txt_(o.fecha_firma), txt_(o.fecha_instalacion));
    if (b !== null && b >= 0) tiempos.firma_instalacion.push(b);
    const c = diasEntre_(txt_(o.fecha_instalacion), txt_(o.fecha_legalizacion));
    if (c !== null && c >= 0) tiempos.instalacion_legalizacion.push(c);
  });
  const media = function (l) { return l.length ? redondear_(l.reduce(function (a, b) { return a + b; }, 0) / l.length, 1) : 0; };

  /* Motivos de pérdida */
  const motivos = {};
  operaciones.filter(function (o) { return normal_(o.estado) === 'cancelada'; }).forEach(function (o) {
    const k = txt_(o.motivo_perdida) || 'Sin indicar';
    motivos[k] = (motivos[k] || 0) + 1;
  });

  /* Mezcla de producto */
  const tipos = {};
  operaciones.filter(esGanada_).forEach(function (o) {
    const k = txt_(o.tipo) || 'otro';
    if (!tipos[k]) tipos[k] = {tipo: k, ventas: 0, importe: 0};
    tipos[k].ventas += 1;
    tipos[k].importe = redondear_(tipos[k].importe + num_(o.total), 2);
  });

  /* Previsión: cartera abierta ponderada por estado */
  const abiertas = operaciones.filter(function (o) {
    return ['propuesta', 'financiacion'].indexOf(normal_(o.estado)) >= 0; });
  const prevision = redondear_(abiertas.reduce(function (a, o) {
    return a + num_(o.total) * (normal_(o.estado) === 'financiacion' ? 0.6 : 0.35); }, 0), 2);

  return {ok: true, desde: desde, hasta: hasta,
    embudo: embudo, municipios: municipios,
    tiempos: {propuesta_firma: media(tiempos.propuesta_firma),
              firma_instalacion: media(tiempos.firma_instalacion),
              instalacion_legalizacion: media(tiempos.instalacion_legalizacion)},
    motivos: Object.keys(motivos).map(function (k) { return {motivo: k, n: motivos[k]}; })
      .sort(function (a, b) { return b.n - a.n; }),
    producto: Object.keys(tipos).map(function (k) { return tipos[k]; }),
    cartera_abierta: abiertas.length, prevision_ponderada: prevision
  };
}

/* ---------- avisos ---------- */

function accAlertas_(u, p) {
  const per = permisos_(u);
  const hoy = hoyISO_();
  const clientes = misClientes_(u);
  const operaciones = misOperaciones_(u);
  const avisos = [];

  clientes.forEach(function (c) {
    if (txt_(c.proxima_fecha) && txt_(c.proxima_fecha) < hoy &&
        ['ganado', 'perdido'].indexOf(normal_(c.estado)) < 0) {
      avisos.push({tipo: 'accion_vencida', nivel: 'alto', cliente_id: c.id,
        texto: c.nombre + ': "' + (txt_(c.proxima_accion) || 'seguimiento') + '" venció el ' + txt_(c.proxima_fecha) + '.'});
    }
  });

  operaciones.forEach(function (o) {
    const f = txt_(o.fecha_propuesta);
    if (normal_(o.estado) === 'propuesta' && f && (diasEntre_(f, hoy) || 0) > 15) {
      avisos.push({tipo: 'propuesta_dormida', nivel: 'medio', operacion_id: o.id, cliente_id: o.cliente_id,
        texto: 'Propuesta de ' + diasEntre_(f, hoy) + ' días sin cerrar (' + (o.referencia || o.id) + ').'});
    }
    if (['material','instalacion'].indexOf(normal_(o.estado)) >= 0 && !txt_(o.fecha_prevista_instalacion)) {
      avisos.push({tipo: 'sin_fecha', nivel: 'medio', operacion_id: o.id, cliente_id: o.cliente_id,
        texto: 'Obra en marcha sin fecha prevista de instalación (' + (o.referencia || o.id) + ').'});
    }
  });

  if (per.finanzas) {
    const opIds = {};
    leer_('OPERACIONES').forEach(function (o) { opIds[String(o.id)] = o; });
    leer_('COBROS').forEach(function (c) {
      if (!txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < hoy) {
        const op = opIds[String(c.operacion_id)] || {};
        avisos.push({tipo: 'cobro_vencido', nivel: 'alto', operacion_id: c.operacion_id,
          texto: 'Cobro vencido de ' + redondear_(num_(c.importe), 0) + ' € (' + (op.referencia || c.operacion_id) + ') desde el ' + txt_(c.fecha_prevista) + '.'});
      }
    });
    leer_('FACTURAS').forEach(function (f) {
      if (!txt_(f.fecha_cobro) && txt_(f.fecha_vencimiento) && txt_(f.fecha_vencimiento) < hoy) {
        avisos.push({tipo: 'factura_vencida', nivel: 'alto', texto:
          'Factura ' + f.numero + ' vencida el ' + txt_(f.fecha_vencimiento) + ' (' + redondear_(num_(f.total), 0) + ' €).'});
      }
    });
  }

  /* ¿Falta el parte de hoy? */
  if (u.rol === 'comercial' || u.rol === 'captador') {
    const hayParte = leer_('PARTES').some(function (x) {
      return String(x.usuario_id) === String(u.id) && txt_(x.fecha) === hoy; });
    if (!hayParte) avisos.push({tipo: 'parte_pendiente', nivel: 'bajo',
      texto: 'Todavía no has enviado el parte de hoy.'});
  }

  const orden = {alto: 0, medio: 1, bajo: 2};
  avisos.sort(function (a, b) { return orden[a.nivel] - orden[b.nivel]; });
  return {ok: true, alertas: avisos.slice(0, 80)};
}
/**
 * 07_Resumen.gs — Cómo va cada persona y cómo va la casa.
 *
 * Un comercial solo puede pedir su propio resumen; los administradores
 * pueden pedir el de cualquiera y el del equipo entero.
 */

/* Los objetivos de venta se computan del 16 al 15 del mes siguiente. */
function periodoObjetivos_(refISO) {
  const ref = refISO || hoyISO_();
  const d = fecha_(ref);
  const inicio = new Date(d.getFullYear(), d.getMonth(), 16);
  if (d.getDate() < 16) inicio.setMonth(inicio.getMonth() - 1);
  const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 15);
  return {
    desde: Utilities.formatDate(inicio, zonaHoraria_(), 'yyyy-MM-dd'),
    hasta: Utilities.formatDate(fin, zonaHoraria_(), 'yyyy-MM-dd')
  };
}

function accResumen_(u, p) {
  const per = permisos_(u);
  const objetivoId = txt_(p.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !per.partesAjenos) {
    return {ok: false, error: 'Solo puedes consultar tu propio resumen.'};
  }
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -180);
  return {ok: true, resumen: resumenPersona_(persona, desde, hasta, permisos_(u).costes)};
}

function resumenPersona_(persona, desde, hasta, conImportes) {
  const esComercial = persona.rol === 'comercial' || persona.rol === 'admin' || persona.rol === 'superadmin';
  const clientes = leer_('CLIENTES');
  const operaciones = leer_('OPERACIONES');
  const captaciones = leer_('CAPTACIONES');
  const partes = leer_('PARTES').filter(function (x) {
    return String(x.usuario_id) === String(persona.id) && txt_(x.fecha) >= desde && txt_(x.fecha) <= hasta;
  });
  const seguimiento = leer_('SEGUIMIENTO').filter(function (s) { return String(s.usuario_id) === String(persona.id); });
  const hoy = hoyISO_();
  const obj = periodoObjetivos_(hasta);

  const misClientes = clientes.filter(function (c) {
    return persona.rol === 'captador' ? String(c.captador_id) === String(persona.id)
                                      : String(c.comercial_id) === String(persona.id);
  });
  const misOps = operaciones.filter(function (o) {
    return persona.rol === 'captador' ? String(o.captador_id) === String(persona.id)
                                      : String(o.comercial_id) === String(persona.id);
  });
  const enRango = function (f) { return txt_(f) >= desde && txt_(f) <= hasta; };
  const ganadas = misOps.filter(function (o) { return esGanada_(o); });
  const ganadasRango = ganadas.filter(function (o) { return enRango(txt_(o.fecha_firma) || txt_(o.creado)); });
  const perdidas = misOps.filter(function (o) { return normal_(o.estado) === 'cancelada'; });
  const abiertas = misOps.filter(function (o) {
    return ['propuesta', 'financiacion'].indexOf(normal_(o.estado)) >= 0;
  });

  const sentadas = partes.reduce(function (a, x) { return a + num_(x.sentadas); }, 0);
  const puertas = partes.reduce(function (a, x) { return a + num_(x.puertas); }, 0);
  const visitas = partes.reduce(function (a, x) { return a + num_(x.visitas); }, 0);
  const fichas = captaciones.filter(function (c) {
    return String(c.captador_id) === String(persona.id) && enRango(c.fecha);
  });
  const citasConfirmadas = fichas.filter(function (c) { return normal_(c.estado_cita) === 'confirmada'; });
  /* Se cuentan sobre las fichas del periodo, para que las conversiones
     comparen siempre lo mismo y no pasen del 100 %. */
  const captacionesVenta = fichas.filter(function (c) { return normal_(c.resultado) === 'venta'; });
  const captacionesSentada = fichas.filter(function (c) {
    return ['sentada', 'venta'].indexOf(normal_(c.resultado)) >= 0;
  });
  const captacionesVentaTodas = captaciones.filter(function (c) {
    return String(c.captador_id) === String(persona.id) && normal_(c.resultado) === 'venta';
  });

  const importeVendido = ganadasRango.reduce(function (a, o) { return a + num_(o.total); }, 0);
  const comisiones = comisionesDe_(persona, ganadasRango, captacionesVentaTodas.filter(function (c) {
    return enRango(txt_(c.fecha_resultado) || txt_(c.fecha));
  }));

  /* Objetivo del periodo 16-15: una operación doble cuenta por dos. */
  const delPeriodo = misOps.filter(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    return esGanada_(o) && f >= obj.desde && f <= obj.hasta;
  });
  const sencillasPeriodo = delPeriodo.reduce(function (a, o) {
    return a + (normal_(o.tipo) === 'fv_aero' ? 2 : 1);
  }, 0);
  const objetivoMes = num_(persona.objetivo_mes) || (persona.rol === 'captador' ? 60 : 6);
  const logradoObjetivo = persona.rol === 'captador'
    ? fichas.filter(function (c) { return txt_(c.fecha) >= obj.desde && txt_(c.fecha) <= obj.hasta; }).length
    : sencillasPeriodo;

  /* Evolución mes a mes */
  const meses = {};
  function m_(k) {
    if (!meses[k]) meses[k] = {mes: k, ventas: 0, importe: 0, sentadas: 0, fichas: 0, propuestas: 0};
    return meses[k];
  }
  ganadas.forEach(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    if (enRango(f)) { const x = m_(mesDe_(f)); x.ventas += 1; x.importe = redondear_(x.importe + num_(o.total), 2); }
  });
  misOps.forEach(function (o) {
    const f = txt_(o.fecha_propuesta) || txt_(o.creado);
    if (enRango(f)) m_(mesDe_(f)).propuestas += 1;
  });
  partes.forEach(function (x) { m_(mesDe_(txt_(x.fecha))).sentadas += num_(x.sentadas); });
  fichas.forEach(function (c) { m_(mesDe_(txt_(c.fecha))).fichas += 1; });
  const evolucion = Object.keys(meses).sort().map(function (k) { return meses[k]; });

  /* Cartera y avisos */
  const ultimoContacto = {};
  seguimiento.forEach(function (s) {
    const k = String(s.cliente_id);
    if (!ultimoContacto[k] || ultimoContacto[k] < txt_(s.fecha)) ultimoContacto[k] = txt_(s.fecha);
  });
  const frios = misClientes.filter(function (c) {
    if (['ganado', 'perdido'].indexOf(normal_(c.estado)) >= 0) return false;
    const ult = ultimoContacto[String(c.id)] || txt_(c.fecha_estado) || txt_(c.creado);
    return (diasEntre_(ult, hoy) || 0) > 15;
  }).map(function (c) {
    return {id: c.id, nombre: c.nombre, municipio: c.municipio, estado: c.estado,
            dias: diasEntre_(ultimoContacto[String(c.id)] || txt_(c.fecha_estado) || txt_(c.creado), hoy)};
  }).sort(function (a, b) { return b.dias - a.dias; }).slice(0, 25);

  const proximas = misClientes.filter(function (c) { return txt_(c.proxima_fecha); })
    .map(function (c) {
      return {id: c.id, nombre: c.nombre, accion: c.proxima_accion, fecha: txt_(c.proxima_fecha),
              vencida: txt_(c.proxima_fecha) < hoy, estado: c.estado};
    }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); }).slice(0, 30);

  const tasa = function (a, b) { return pct_(a, b); };

  const r = {
    persona: publico_(persona),
    desde: desde, hasta: hasta,
    periodo_objetivos: obj,
    clientes: misClientes.length,
    clientes_activos: misClientes.filter(function (c) {
      return ['ganado', 'perdido'].indexOf(normal_(c.estado)) < 0; }).length,
    propuestas: misOps.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length,
    ventas: ganadasRango.length,
    perdidas: perdidas.filter(function (o) { return enRango(txt_(o.modificado) || txt_(o.creado)); }).length,
    sentadas: sentadas, puertas: puertas, visitas: visitas,
    fichas: fichas.length, citas_confirmadas: citasConfirmadas.length,
    captaciones_sentada: captacionesSentada.length, captaciones_venta: captacionesVenta.length,
    conversion_sentada_venta: tasa(ganadasRango.length, sentadas),
    conversion_propuesta_venta: tasa(ganadasRango.length,
      misOps.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length),
    conversion_ficha_sentada: tasa(captacionesSentada.length, fichas.length),
    conversion_ficha_venta: tasa(captacionesVenta.length, fichas.length),
    conversion_puerta_ficha: tasa(fichas.length, puertas),
    objetivo_mes: objetivoMes, logrado_objetivo: logradoObjetivo,
    objetivo_pct: pct_(logradoObjetivo, objetivoMes),
    cartera_abierta: abiertas.length,
    evolucion: evolucion,
    frios: frios, proximas: proximas,
    partes_enviados: partes.length,
    dias_sin_parte: diasSinParte_(persona, partes),
    comisiones: comisiones
  };

  if (conImportes || persona.rol !== 'captador') {
    r.importe_vendido = redondear_(importeVendido, 2);
    r.ticket_medio = ganadasRango.length ? redondear_(importeVendido / ganadasRango.length, 2) : 0;
    r.cartera_importe = redondear_(abiertas.reduce(function (a, o) { return a + num_(o.total); }, 0), 2);
    /* Cartera ponderada: lo que razonablemente va a entrar. */
    r.cartera_ponderada = redondear_(abiertas.reduce(function (a, o) {
      const peso = normal_(o.estado) === 'financiacion' ? 0.6 : 0.35;
      return a + num_(o.total) * peso;
    }, 0), 2);
  }
  return r;
}

function esGanada_(o) {
  return ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada']
    .indexOf(normal_(o.estado)) >= 0;
}

function comisionesDe_(persona, ganadas, captacionesVenta) {
  const cfg = config_();
  const cFV = num_(persona.comision_fv) || num_(cfg.comision_fv);
  const cAero = num_(persona.comision_aero) || num_(cfg.comision_aero);
  const cCap = num_(cfg.comision_captacion);
  let total = 0;
  const detalle = [];
  ganadas.forEach(function (o) {
    let c = 0;
    const t = normal_(o.tipo);
    if (t === 'fv' || t === 'fv_aero') c += cFV;
    if (t === 'aero' || t === 'fv_aero') c += cAero;
    if (c) { total += c; detalle.push({operacion_id: o.id, referencia: o.referencia, tipo: o.tipo, importe: c,
      fecha: txt_(o.fecha_firma) || txt_(o.creado)}); }
  });
  (captacionesVenta || []).forEach(function (c) {
    total += cCap;
    detalle.push({operacion_id: c.operacion_id || '', referencia: 'Captación ' + c.id, tipo: 'captacion',
      importe: cCap, fecha: txt_(c.fecha_resultado) || txt_(c.fecha)});
  });
  return {total: redondear_(total, 2), detalle: detalle};
}

function diasSinParte_(persona, partes) {
  if (!partes.length) return null;
  const ultimo = partes.map(function (x) { return txt_(x.fecha); }).sort().pop();
  return diasEntre_(ultimo, hoyISO_());
}

/* ---------- el equipo al completo ---------- */

function accEquipo_(u, p) {
  exigir_(u, 'partesAjenos');
  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -90);
  const gente = leer_('USUARIOS').filter(function (x) { return normal_(x.activo) === 'si'; });
  const resumenes = gente.map(function (g) { return resumenPersona_(g, desde, hasta, true); });

  const comerciales = resumenes.filter(function (r) { return r.persona.rol === 'comercial'; })
    .sort(function (a, b) { return (b.importe_vendido || 0) - (a.importe_vendido || 0); });
  const captadores = resumenes.filter(function (r) { return r.persona.rol === 'captador'; })
    .sort(function (a, b) { return b.fichas - a.fichas; });

  return {ok: true, desde: desde, hasta: hasta, equipo: resumenes,
          ranking_comerciales: comerciales, ranking_captadores: captadores};
}

/* ---------- analítica de la casa ---------- */

function accAnalitica_(u, p) {
  exigir_(u, 'partesAjenos');
  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -365);
  const clientes = leer_('CLIENTES');
  const operaciones = leer_('OPERACIONES');
  const captaciones = leer_('CAPTACIONES');
  const partes = leer_('PARTES').filter(function (x) { return txt_(x.fecha) >= desde && txt_(x.fecha) <= hasta; });
  const usuarios = indexar_(leer_('USUARIOS'));
  const enRango = function (f) { return txt_(f) >= desde && txt_(f) <= hasta; };

  /* Embudo: puerta -> ficha -> sentada -> propuesta -> venta */
  const puertas = partes.reduce(function (a, x) { return a + num_(x.puertas); }, 0);
  const fichas = captaciones.filter(function (c) { return enRango(c.fecha); }).length;
  const sentadas = partes.reduce(function (a, x) { return a + num_(x.sentadas); }, 0);
  const propuestas = operaciones.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length;
  const ventas = operaciones.filter(function (o) {
    return esGanada_(o) && enRango(txt_(o.fecha_firma) || txt_(o.creado)); }).length;

  const embudo = [
    {fase: 'Puertas', valor: puertas},
    {fase: 'Fichas de captación', valor: fichas, conversion: pct_(fichas, puertas)},
    {fase: 'Sentadas', valor: sentadas, conversion: pct_(sentadas, fichas)},
    {fase: 'Propuestas', valor: propuestas, conversion: pct_(propuestas, sentadas)},
    {fase: 'Ventas', valor: ventas, conversion: pct_(ventas, propuestas)}
  ];

  /* Por municipio */
  const mun = {};
  clientes.forEach(function (c) {
    const k = txt_(c.municipio) || 'Sin municipio';
    if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, interes: 0, n: 0};
    mun[k].clientes += 1;
    if (num_(c.interes)) { mun[k].interes += num_(c.interes); mun[k].n += 1; }
  });
  operaciones.filter(esGanada_).forEach(function (o) {
    const c = clientes.filter(function (x) { return String(x.id) === String(o.cliente_id); })[0];
    const k = c ? (txt_(c.municipio) || 'Sin municipio') : 'Sin municipio';
    if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, interes: 0, n: 0};
    mun[k].ventas += 1;
    mun[k].importe = redondear_(mun[k].importe + num_(o.total), 2);
  });
  const municipios = Object.keys(mun).map(function (k) {
    const m = mun[k];
    m.conversion = pct_(m.ventas, m.clientes);
    m.interes_medio = m.n ? redondear_(m.interes / m.n, 1) : 0;
    return m;
  }).sort(function (a, b) { return b.importe - a.importe; });

  /* Tiempos medios por fase */
  const tiempos = {propuesta_firma: [], firma_instalacion: [], instalacion_legalizacion: []};
  operaciones.forEach(function (o) {
    const a = diasEntre_(txt_(o.fecha_propuesta), txt_(o.fecha_firma));
    if (a !== null && a >= 0) tiempos.propuesta_firma.push(a);
    const b = diasEntre_(txt_(o.fecha_firma), txt_(o.fecha_instalacion));
    if (b !== null && b >= 0) tiempos.firma_instalacion.push(b);
    const c = diasEntre_(txt_(o.fecha_instalacion), txt_(o.fecha_legalizacion));
    if (c !== null && c >= 0) tiempos.instalacion_legalizacion.push(c);
  });
  const media = function (l) { return l.length ? redondear_(l.reduce(function (a, b) { return a + b; }, 0) / l.length, 1) : 0; };

  /* Motivos de pérdida */
  const motivos = {};
  operaciones.filter(function (o) { return normal_(o.estado) === 'cancelada'; }).forEach(function (o) {
    const k = txt_(o.motivo_perdida) || 'Sin indicar';
    motivos[k] = (motivos[k] || 0) + 1;
  });

  /* Mezcla de producto */
  const tipos = {};
  operaciones.filter(esGanada_).forEach(function (o) {
    const k = txt_(o.tipo) || 'otro';
    if (!tipos[k]) tipos[k] = {tipo: k, ventas: 0, importe: 0};
    tipos[k].ventas += 1;
    tipos[k].importe = redondear_(tipos[k].importe + num_(o.total), 2);
  });

  /* Previsión: cartera abierta ponderada por estado */
  const abiertas = operaciones.filter(function (o) {
    return ['propuesta', 'financiacion'].indexOf(normal_(o.estado)) >= 0; });
  const prevision = redondear_(abiertas.reduce(function (a, o) {
    return a + num_(o.total) * (normal_(o.estado) === 'financiacion' ? 0.6 : 0.35); }, 0), 2);

  return {ok: true, desde: desde, hasta: hasta,
    embudo: embudo, municipios: municipios,
    tiempos: {propuesta_firma: media(tiempos.propuesta_firma),
              firma_instalacion: media(tiempos.firma_instalacion),
              instalacion_legalizacion: media(tiempos.instalacion_legalizacion)},
    motivos: Object.keys(motivos).map(function (k) { return {motivo: k, n: motivos[k]}; })
      .sort(function (a, b) { return b.n - a.n; }),
    producto: Object.keys(tipos).map(function (k) { return tipos[k]; }),
    cartera_abierta: abiertas.length, prevision_ponderada: prevision
  };
}

/* ---------- avisos ---------- */

function accAlertas_(u, p) {
  const per = permisos_(u);
  const hoy = hoyISO_();
  const clientes = misClientes_(u);
  const operaciones = misOperaciones_(u);
  const avisos = [];

  clientes.forEach(function (c) {
    if (txt_(c.proxima_fecha) && txt_(c.proxima_fecha) < hoy &&
        ['ganado', 'perdido'].indexOf(normal_(c.estado)) < 0) {
      avisos.push({tipo: 'accion_vencida', nivel: 'alto', cliente_id: c.id,
        texto: c.nombre + ': "' + (txt_(c.proxima_accion) || 'seguimiento') + '" venció el ' + txt_(c.proxima_fecha) + '.'});
    }
  });

  operaciones.forEach(function (o) {
    const f = txt_(o.fecha_propuesta);
    if (normal_(o.estado) === 'propuesta' && f && (diasEntre_(f, hoy) || 0) > 15) {
      avisos.push({tipo: 'propuesta_dormida', nivel: 'medio', operacion_id: o.id, cliente_id: o.cliente_id,
        texto: 'Propuesta de ' + diasEntre_(f, hoy) + ' días sin cerrar (' + (o.referencia || o.id) + ').'});
    }
    if (['material','instalacion'].indexOf(normal_(o.estado)) >= 0 && !txt_(o.fecha_prevista_instalacion)) {
      avisos.push({tipo: 'sin_fecha', nivel: 'medio', operacion_id: o.id, cliente_id: o.cliente_id,
        texto: 'Obra en marcha sin fecha prevista de instalación (' + (o.referencia || o.id) + ').'});
    }
  });

  if (per.finanzas) {
    const opIds = {};
    leer_('OPERACIONES').forEach(function (o) { opIds[String(o.id)] = o; });
    leer_('COBROS').forEach(function (c) {
      if (!txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < hoy) {
        const op = opIds[String(c.operacion_id)] || {};
        avisos.push({tipo: 'cobro_vencido', nivel: 'alto', operacion_id: c.operacion_id,
          texto: 'Cobro vencido de ' + redondear_(num_(c.importe), 0) + ' € (' + (op.referencia || c.operacion_id) + ') desde el ' + txt_(c.fecha_prevista) + '.'});
      }
    });
    leer_('FACTURAS').forEach(function (f) {
      if (!txt_(f.fecha_cobro) && txt_(f.fecha_vencimiento) && txt_(f.fecha_vencimiento) < hoy) {
        avisos.push({tipo: 'factura_vencida', nivel: 'alto', texto:
          'Factura ' + f.numero + ' vencida el ' + txt_(f.fecha_vencimiento) + ' (' + redondear_(num_(f.total), 0) + ' €).'});
      }
    });
  }

  /* ¿Falta el parte de hoy? */
  if (u.rol === 'comercial' || u.rol === 'captador') {
    const hayParte = leer_('PARTES').some(function (x) {
      return String(x.usuario_id) === String(u.id) && txt_(x.fecha) === hoy; });
    if (!hayParte) avisos.push({tipo: 'parte_pendiente', nivel: 'bajo',
      texto: 'Todavía no has enviado el parte de hoy.'});
  }

  const orden = {alto: 0, medio: 1, bajo: 2};
  avisos.sort(function (a, b) { return orden[a.nivel] - orden[b.nivel]; });
  return {ok: true, alertas: avisos.slice(0, 80)};
}
