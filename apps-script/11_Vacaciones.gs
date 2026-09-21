/**
 * 11_Vacaciones.gs — Calendario de vacaciones.
 *
 * Cada persona pide sus días; solo dirección (Rubén y Fernando, o el
 * superadmin) los aprueba o los deniega. Hasta que no están aprobados, no
 * cuentan como disfrutados. Al aprobarse, esos días quedan marcados como
 * vacaciones en el calendario de nóminas.
 */

function diasVacacionesAnio_() { return configNum_('dias_vacaciones', 22); }

function festivos_() {
  const c = config_();
  return String(c.festivos || '').split(/[,\s;]+/)
    .map(function (x) { return txt_(x); })
    .filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); });
}

/** Días laborables entre dos fechas, quitando fines de semana y festivos. */
function laborablesEntre_(desde, hasta) {
  const fiestas = festivos_();
  let dias = 0, cursor = txt_(desde), guardia = 0;
  const lista = [];
  while (cursor <= txt_(hasta) && guardia++ < 400) {
    const d = fecha_(cursor);
    const finde = d.getDay() === 0 || d.getDay() === 6;
    if (!finde && fiestas.indexOf(cursor) < 0) { dias++; lista.push(cursor); }
    cursor = sumarDias_(cursor, 1);
  }
  return {dias: dias, fechas: lista};
}

/** Lo que ve cada uno: sus vacaciones; dirección, las de todo el equipo. */
function accVacaciones_(u, p) {
  const per = permisos_(u);
  const anio = txt_(p.anio) || hoyISO_().slice(0, 4);
  let todas = leer_('VACACIONES').filter(function (v) { return txt_(v.anio) === anio; });
  if (!per.nominasAjenas) {
    todas = todas.filter(function (v) { return String(v.usuario_id) === String(u.id); });
  } else if (txt_(p.usuario_id)) {
    todas = todas.filter(function (v) { return String(v.usuario_id) === String(p.usuario_id); });
  }
  todas.sort(function (a, b) { return txt_(a.desde).localeCompare(txt_(b.desde)); });

  /* Saldo de cada persona visible. */
  const gente = per.nominasAjenas
    ? leer_('USUARIOS').filter(function (x) { return normal_(x.activo) === 'si'; })
    : [u];
  const saldos = gente.map(function (g) {
    const suyas = leer_('VACACIONES').filter(function (v) {
      return String(v.usuario_id) === String(g.id) && txt_(v.anio) === anio; });
    const aprobadas = suyas.filter(function (v) { return normal_(v.estado) === 'aprobada'; });
    const pendientes = suyas.filter(function (v) { return normal_(v.estado) === 'solicitada'; });
    const disfrutados = aprobadas.filter(function (v) { return txt_(v.hasta) < hoyISO_(); })
      .reduce(function (a, v) { return a + num_(v.dias); }, 0);
    const aprobados = aprobadas.reduce(function (a, v) { return a + num_(v.dias); }, 0);
    return {
      usuario_id: g.id, nombre: g.nombre, rol: g.rol,
      derecho: diasVacacionesAnio_(),
      aprobados: aprobados,
      disfrutados: disfrutados,
      pendientes: pendientes.reduce(function (a, v) { return a + num_(v.dias); }, 0),
      restantes: diasVacacionesAnio_() - aprobados
    };
  });

  return {ok: true, anio: anio, vacaciones: todas, saldos: saldos,
          festivos: festivos_(), derecho: diasVacacionesAnio_(),
          puede_aprobar: !!per.nominasAjenas};
}

/** Pedir días. Cualquiera puede pedir los suyos. */
function accSolicitarVacaciones_(u, p) {
  const desde = txt_(p.desde), hasta = txt_(p.hasta) || txt_(p.desde);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return {ok: false, error: 'Faltan las fechas.'};
  }
  if (hasta < desde) return {ok: false, error: 'La fecha de vuelta es anterior a la de salida.'};

  /* Dirección puede pedir en nombre de alguien; el resto, solo para sí. */
  const objetivoId = (permisos_(u).nominasAjenas && txt_(p.usuario_id)) ? txt_(p.usuario_id) : u.id;
  const anio = desde.slice(0, 4);
  const cuenta = laborablesEntre_(desde, hasta);
  if (!cuenta.dias) return {ok: false, error: 'Ese periodo no tiene ningún día laborable.'};

  /* Que no se pisen dos peticiones de la misma persona. */
  const suyas = leer_('VACACIONES').filter(function (v) {
    return String(v.usuario_id) === String(objetivoId) &&
           ['solicitada', 'aprobada'].indexOf(normal_(v.estado)) >= 0;
  });
  const pisa = suyas.some(function (v) { return !(txt_(v.hasta) < desde || txt_(v.desde) > hasta); });
  if (pisa) return {ok: false, error: 'Ya tienes días pedidos o aprobados en esas fechas.'};

  /* Que no se pasen del derecho anual. */
  const gastados = suyas.filter(function (v) { return txt_(v.anio) === anio; })
    .reduce(function (a, v) { return a + num_(v.dias); }, 0);
  const derecho = diasVacacionesAnio_();
  if (gastados + cuenta.dias > derecho) {
    return {ok: false, error: 'Te quedan ' + (derecho - gastados) + ' día(s) de los ' + derecho +
      ' del año y estás pidiendo ' + cuenta.dias + '.'};
  }

  const r = insertar_('VACACIONES', {
    usuario_id: objetivoId, anio: anio, desde: desde, hasta: hasta, dias: cuenta.dias,
    tipo: txt_(p.tipo) || 'vacaciones', estado: 'solicitada', nota: txt_(p.nota),
    solicitada: ahora_(), resuelta_por: '', resuelta_fecha: '', respuesta: ''
  });
  registrar_(u, 'solicitar_vacaciones', 'VACACIONES', r.id, desde + ' a ' + hasta);
  return {ok: true, vacaciones: r};
}

/** Aprobar o denegar. Solo dirección. */
function accResolverVacaciones_(u, p) {
  exigir_(u, 'nominasAjenas');
  const estado = normal_(p.estado);
  if (['aprobada', 'denegada'].indexOf(estado) < 0) return {ok: false, error: 'Estado no válido.'};
  const v = leer_('VACACIONES').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!v) return {ok: false, error: 'Esa solicitud ya no existe.'};

  const r = actualizar_('VACACIONES', v.id, {
    estado: estado, resuelta_por: u.id, resuelta_fecha: ahora_(), respuesta: txt_(p.respuesta)
  });

  /* Al aprobar, los días quedan marcados en el calendario de la persona. */
  if (estado === 'aprobada') marcarJornadas_(v, 'vacaciones');
  else limpiarJornadas_(v);

  registrar_(u, estado === 'aprobada' ? 'aprobar_vacaciones' : 'denegar_vacaciones',
    'VACACIONES', v.id, txt_(v.desde) + ' a ' + txt_(v.hasta));
  return {ok: true, vacaciones: r};
}

/** Cancelar: la persona puede retirar lo suyo; dirección, cualquier cosa. */
function accCancelarVacaciones_(u, p) {
  const v = leer_('VACACIONES').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!v) return {ok: false, error: 'Esa solicitud ya no existe.'};
  if (String(v.usuario_id) !== String(u.id) && !permisos_(u).nominasAjenas) {
    return {ok: false, error: 'Esa solicitud no es tuya.'};
  }
  const r = actualizar_('VACACIONES', v.id, {estado: 'cancelada', resuelta_por: u.id,
    resuelta_fecha: ahora_()});
  limpiarJornadas_(v);
  registrar_(u, 'cancelar_vacaciones', 'VACACIONES', v.id, txt_(v.desde));
  return {ok: true, vacaciones: r};
}

function marcarJornadas_(v, tipo) {
  const dias = laborablesEntre_(txt_(v.desde), txt_(v.hasta)).fechas;
  const ya = leer_('JORNADAS').filter(function (j) { return String(j.usuario_id) === String(v.usuario_id); });
  dias.forEach(function (f) {
    const existente = ya.filter(function (j) { return txt_(j.fecha) === f; })[0];
    const datos = {usuario_id: v.usuario_id, fecha: f, tipo: tipo, horas: 0, dietas: 0,
      comisiones: 0, concepto: 'Vacaciones aprobadas', notas: txt_(v.id)};
    if (existente) actualizar_('JORNADAS', existente.id, datos);
    else insertar_('JORNADAS', datos);
  });
}

function limpiarJornadas_(v) {
  const dias = laborablesEntre_(txt_(v.desde), txt_(v.hasta)).fechas;
  leer_('JORNADAS').filter(function (j) {
    return String(j.usuario_id) === String(v.usuario_id) && dias.indexOf(txt_(j.fecha)) >= 0 &&
           txt_(j.notas) === txt_(v.id);
  }).forEach(function (j) { borrar_('JORNADAS', j.id); });
}
