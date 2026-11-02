/**
 * CRM · ZERO WATTIOS
 * 24_Estadisticas.gs — Citas reagendadas y canceladas, estadísticas de
 * captación y ventas, y aviso de captadores en la misma zona (02/11/2026).
 *
 * Orden de Nando:
 *  - Un botón para reagendar un lead y otro para cancelarlo. Cada cambio se
 *    guarda (CITAS_CAMBIOS) para saber cuántas citas se cancelan o se
 *    aplazan.
 *  - Conteo diario, semanal, mensual, trimestral y anual por captador y del
 *    grupo: citas sacadas, reagendadas, canceladas, sentadas y ventas, y
 *    cuántas citas hacen falta para cerrar una venta.
 *  - Los captadores ven los números de sus compañeros (sin importes: el
 *    dinero solo lo ve dirección).
 *  - Si dos captadores sacan leads a menos de 200 m, correo a los dos y a
 *    dirección.
 */

const ESTADOS_OP_VENTA = ['firmada', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'];
const METROS_ZONA = 200;
const HORAS_ZONA = 48;   // coincidir en la misma zona en menos de 48 h (orden de Nando, 02/11/2026)
const DIAS_ZONA = 90;    // solo para buscar coordenadas de las fichas recientes
const K_AVISOS_ZONA = 'avisos_zona';

const MOTIVOS_CANCELACION = [
  ['no_interesa', 'Ya no le interesa'],
  ['no_contesta', 'No contesta / no abre'],
  ['no_decide', 'No está quien decide'],
  ['ya_tiene', 'Ya lo tiene o lo ha contratado con otro'],
  ['no_viable', 'No es viable (vivienda, tejado, comunidad…)'],
  ['precio', 'Por el precio / no puede pagarlo'],
  ['otro', 'Otro motivo']
];

/* ---------- reagendar y cancelar ---------- */

function captacionVisible_(u, id) {
  const cap = leer_('CAPTACIONES').filter(function (x) { return String(x.id) === String(id); })[0];
  if (!cap) throw new Error('No existe esa cita.');
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(cap.cliente_id); })[0];
  if (!cli) throw new Error('Falta el cliente de la cita.');
  const per = permisos_(u);
  if (!per.editarTodo && !veCliente_(u, cli) && String(cap.captador_id) !== String(u.id) &&
      String(cap.comercial_id) !== String(u.id)) throw new Error('Esa cita no es tuya.');
  return {cap: cap, cli: cli};
}

/** Apunta un cambio de cita para las estadísticas. */
function apuntarCambioCita_(u, cap, tipo, datos) {
  datos = datos || {};
  return insertar_('CITAS_CAMBIOS', {
    captacion_id: cap.id, cliente_id: cap.cliente_id, captador_id: txt_(cap.captador_id),
    comercial_id: txt_(cap.comercial_id), tipo: tipo,
    fecha_antes: txt_(cap.fecha).slice(0, 10), hora_antes: txt_(cap.hora_cita),
    fecha_nueva: txt_(datos.fecha), hora_nueva: txt_(datos.hora_cita),
    motivo: txt_(datos.motivo).slice(0, 200), usuario_id: u ? u.id : '', creado: ahora_()
  });
}

function fechaLarga_(f, hora) {
  return txt_(f).slice(0, 10).split('-').reverse().join('/') + (txt_(hora) ? ' ' + txt_(hora) : '');
}

/** Reagendar: nueva fecha y hora, y queda apuntado para las estadísticas. */
function accReagendarCita_(u, p) {
  const fecha = txt_(p.fecha).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return {ok: false, error: 'Pon la nueva fecha de la cita.'};
  const v = captacionVisible_(u, p.id);
  const cap = v.cap;
  if (['venta', 'sentada'].indexOf(normal_(cap.resultado)) >= 0) return {ok: false, error: 'Esa cita ya se hizo: no se puede reagendar.'};
  const hora = txt_(p.hora_cita) || txt_(cap.hora_cita);
  if (fecha === txt_(cap.fecha).slice(0, 10) && hora === txt_(cap.hora_cita)) return {ok: false, error: 'Es la misma fecha y hora que ya tenía.'};
  const motivo = txt_(p.motivo);
  const nota = 'Reagendada del ' + fechaLarga_(cap.fecha, cap.hora_cita) + ' al ' + fechaLarga_(fecha, hora) +
    (motivo ? ' (' + motivo + ')' : '') + '.';
  apuntarCambioCita_(u, cap, 'reagendada', {fecha: fecha, hora_cita: hora, motivo: motivo});
  const r = accGuardarCaptacion_(u, {captacion: {id: cap.id, cliente_id: cap.cliente_id, fecha: fecha, hora_cita: hora,
    estado_cita: p.confirmada ? 'confirmada' : 'pendiente', resultado: 'pendiente',
    notas: (txt_(cap.notas) ? txt_(cap.notas) + '\n' : '') + nota, _cambio_apuntado: true}});
  registrar_(u, 'reagendar_cita', 'CAPTACIONES', cap.id, nota);
  return {ok: true, captacion: r.captacion, aviso_agenda: r.aviso_agenda || ''};
}

/** Cancelar: la cita no se hace; queda el motivo para las estadísticas. */
function accCancelarCita_(u, p) {
  const v = captacionVisible_(u, p.id);
  const cap = v.cap;
  if (normal_(cap.resultado) === 'cancelada') return {ok: false, error: 'Esa cita ya estaba cancelada.'};
  if (['venta', 'sentada'].indexOf(normal_(cap.resultado)) >= 0) return {ok: false, error: 'Esa cita ya se hizo: no se puede cancelar.'};
  const cat = {};
  MOTIVOS_CANCELACION.forEach(function (m) { cat[m[0]] = m[1]; });
  const motivo = cat[normal_(p.motivo)] || txt_(p.motivo) || 'Sin motivo';
  const detalle = txt_(p.detalle);
  const texto = motivo + (detalle ? ': ' + detalle : '');
  apuntarCambioCita_(u, cap, 'cancelada', {motivo: texto});
  const r = accGuardarCaptacion_(u, {captacion: {id: cap.id, cliente_id: cap.cliente_id, resultado: 'cancelada',
    fecha_resultado: hoyISO_(), notas: (txt_(cap.notas) ? txt_(cap.notas) + '\n' : '') +
      'Cancelada el ' + fechaLarga_(hoyISO_()) + ': ' + texto + '.', _cambio_apuntado: true}});
  registrar_(u, 'cancelar_cita', 'CAPTACIONES', cap.id, texto);
  return {ok: true, captacion: r.captacion};
}

/**
 * Si se cambia la cita por otro camino (editar la ficha, el agente que
 * copia Trello…), también cuenta: cambio de día = reagendada; resultado
 * cancelada = cancelada.
 */
function apuntarCambiosDeCaptacion_(u, anterior, nueva) {
  if (!anterior || !nueva) return;
  const fA = txt_(anterior.fecha).slice(0, 10), fN = txt_(nueva.fecha).slice(0, 10);
  if (fA && fN && fA !== fN && ['venta', 'sentada', 'cancelada'].indexOf(normal_(anterior.resultado)) < 0) {
    apuntarCambioCita_(u, anterior, 'reagendada', {fecha: fN, hora_cita: txt_(nueva.hora_cita)});
  }
  if (normal_(nueva.resultado) === 'cancelada' && normal_(anterior.resultado) !== 'cancelada') {
    apuntarCambioCita_(u, anterior, 'cancelada', {motivo: ''});
  }
}

/* ---------- estadísticas ---------- */

function isoDeFecha_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

/** Los cortes de tiempo: hoy, semana (lunes a hoy), mes, trimestre y año. */
function periodosEstadistica_(hoy) {
  const d = fecha_(hoy);
  const lunes = new Date(d.getTime()); lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const tri = Math.floor(d.getMonth() / 3);
  return [
    {clave: 'dia', titulo: 'Hoy', desde: hoy, hasta: hoy},
    {clave: 'semana', titulo: 'Esta semana', desde: isoDeFecha_(lunes), hasta: hoy},
    {clave: 'mes', titulo: 'Este mes', desde: hoy.slice(0, 8) + '01', hasta: hoy},
    {clave: 'trimestre', titulo: (tri + 1) + 'º trimestre', desde: hoy.slice(0, 5) + ('0' + (tri * 3 + 1)).slice(-2) + '-01', hasta: hoy},
    {clave: 'anio', titulo: 'Año ' + hoy.slice(0, 4), desde: hoy.slice(0, 4) + '-01-01', hasta: hoy}
  ];
}

/**
 * Cuenta todo lo que hace falta para las estadísticas. Cada cosa se cuenta
 * el día en que pasa: la cita, el día que se mete; la cancelación y el
 * cambio de fecha, el día que se apuntan; la sentada, el día de la visita;
 * la venta, el día de la firma.
 */
function sucesosEstadistica_() {
  const clientes = indexar_(leer_('CLIENTES'), 'id');
  const caps = leer_('CAPTACIONES');
  const cambios = leer_('CITAS_CAMBIOS');
  const sucesos = [];   // {tipo, fecha, captador_id, comercial_id}
  const canceladaCon = {};
  cambios.forEach(function (x) {
    const f = txt_(x.creado).slice(0, 10);
    if (!f) return;
    if (normal_(x.tipo) === 'cancelada') canceladaCon[String(x.captacion_id)] = 1;
    sucesos.push({tipo: normal_(x.tipo), fecha: f, captador_id: txt_(x.captador_id), comercial_id: txt_(x.comercial_id)});
  });
  const captadorDeCliente = {};
  caps.forEach(function (k) {
    const alta = txt_(k.creado).slice(0, 10) || txt_(k.fecha).slice(0, 10);
    const capt = txt_(k.captador_id);
    if (capt && !captadorDeCliente[String(k.cliente_id)]) captadorDeCliente[String(k.cliente_id)] = capt;
    if (alta) sucesos.push({tipo: 'cita', fecha: alta, captador_id: capt, comercial_id: txt_(k.comercial_id)});
    const res = normal_(k.resultado);
    /* Las canceladas de antes de que existiera el botón también cuentan. */
    if (res === 'cancelada' && !canceladaCon[String(k.id)]) {
      const f = txt_(k.fecha_resultado).slice(0, 10) || txt_(k.fecha).slice(0, 10);
      if (f) sucesos.push({tipo: 'cancelada', fecha: f, captador_id: capt, comercial_id: txt_(k.comercial_id)});
    }
    if (['sentada', 'potencial', 'venta'].indexOf(res) >= 0) {
      const f = txt_(k.fecha).slice(0, 10) || txt_(k.fecha_resultado).slice(0, 10);
      if (f) sucesos.push({tipo: 'sentada', fecha: f, captador_id: capt, comercial_id: txt_(k.comercial_id)});
    }
  });
  leer_('OPERACIONES').forEach(function (o) {
    if (ESTADOS_OP_VENTA.indexOf(normal_(o.estado)) < 0) return;
    const f = (txt_(o.fecha_firma) || txt_(o.fecha_contrato) || txt_(o.creado)).slice(0, 10);
    if (!f) return;
    const cli = clientes[String(o.cliente_id)] || {};
    sucesos.push({tipo: 'venta', fecha: f,
      captador_id: txt_(o.captador_id) || txt_(cli.captador_id) || captadorDeCliente[String(o.cliente_id)] || '',
      comercial_id: txt_(o.comercial_id) || txt_(cli.comercial_id)});
  });
  return sucesos;
}

function cifrasVacias_() { return {citas: 0, reagendadas: 0, canceladas: 0, sentadas: 0, ventas: 0}; }

function cerrarCifras_(c) {
  c.pct_canceladas = c.citas ? Math.round(c.canceladas * 1000 / c.citas) / 10 : 0;
  c.pct_reagendadas = c.citas ? Math.round(c.reagendadas * 1000 / c.citas) / 10 : 0;
  c.citas_por_venta = c.ventas ? Math.round(c.citas * 10 / c.ventas) / 10 : null;
  return c;
}

function contarPeriodo_(sucesos, desde, hasta, campo, ids) {
  const total = cifrasVacias_();
  const por = {};
  ids.forEach(function (id) { por[id] = cifrasVacias_(); });
  const clave = {cita: 'citas', reagendada: 'reagendadas', cancelada: 'canceladas', sentada: 'sentadas', venta: 'ventas'};
  sucesos.forEach(function (s) {
    if (s.fecha < desde || s.fecha > hasta || !clave[s.tipo]) return;
    total[clave[s.tipo]]++;
    const quien = s[campo];
    if (quien && por[quien]) por[quien][clave[s.tipo]]++;
  });
  Object.keys(por).forEach(function (k) { cerrarCifras_(por[k]); });
  return {total: cerrarCifras_(total), por: por};
}

/**
 * Las estadísticas que ve todo el mundo: por captador y del grupo, en cada
 * periodo, más las ventas por semana, mes, trimestre y año y la serie de
 * los últimos 14 días. Solo números: nada de importes ni de clientes.
 */
function accEstadisticas_(u, p) {
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(txt_(p.hoy)) ? txt_(p.hoy) : hoyISO_();
  const usuarios = leer_('USUARIOS').filter(function (x) { return normal_(x.activo) === 'si'; });
  const captadores = usuarios.filter(function (x) { return normal_(x.rol) === 'captador'; });
  const comerciales = usuarios.filter(function (x) { return normal_(x.rol) === 'comercial'; });
  const sucesos = sucesosEstadistica_();
  const idsCapt = captadores.map(function (x) { return String(x.id); });
  const idsCom = comerciales.map(function (x) { return String(x.id); });
  const verComerciales = permisos_(u).alcance === 'todo';

  const periodos = periodosEstadistica_(hoy).map(function (per) {
    const capt = contarPeriodo_(sucesos, per.desde, per.hasta, 'captador_id', idsCapt);
    const out = {clave: per.clave, titulo: per.titulo, desde: per.desde, hasta: per.hasta,
      grupo: capt.total,
      captadores: captadores.map(function (x) {
        return Object.assign({id: x.id, nombre: x.nombre, yo: String(x.id) === String(u.id)}, capt.por[String(x.id)]);
      }).sort(function (a, b) { return b.citas - a.citas || b.ventas - a.ventas; })};
    if (verComerciales) {
      const com = contarPeriodo_(sucesos, per.desde, per.hasta, 'comercial_id', idsCom);
      out.comerciales = comerciales.map(function (x) {
        return Object.assign({id: x.id, nombre: x.nombre}, com.por[String(x.id)]);
      });
    }
    return out;
  });

  /* Últimos 14 días, del grupo y de cada captador: citas, canceladas y reagendadas. */
  const dias = [];
  for (let i = 13; i >= 0; i--) dias.push(sumarDias_(hoy, -i));
  const serie = dias.map(function (f) {
    const c = contarPeriodo_(sucesos, f, f, 'captador_id', idsCapt);
    const fila = {fecha: f, citas: c.total.citas, canceladas: c.total.canceladas, reagendadas: c.total.reagendadas,
                  ventas: c.total.ventas, por: {}};
    idsCapt.forEach(function (id) { fila.por[id] = c.por[id].citas; });
    return fila;
  });

  /* Ventas cerradas: las últimas 8 semanas, los meses del año, los trimestres y los años. */
  const ventas = sucesos.filter(function (s) { return s.tipo === 'venta'; });
  const lunesDe = function (f) { const d = fecha_(f); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDeFecha_(d); };
  const semanas = [];
  let l = lunesDe(hoy);
  for (let i = 0; i < 8; i++) { semanas.unshift(l); l = sumarDias_(l, -7); }
  const anio = hoy.slice(0, 4);
  const ventasPor = {
    semanas: semanas.map(function (s) {
      return {desde: s, ventas: ventas.filter(function (v) { return v.fecha >= s && v.fecha <= sumarDias_(s, 6); }).length};
    }),
    meses: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(function (m) {
      return {mes: anio + '-' + m, ventas: ventas.filter(function (v) { return v.fecha.slice(0, 7) === anio + '-' + m; }).length};
    }),
    trimestres: [1, 2, 3, 4].map(function (t) {
      return {trimestre: t, ventas: ventas.filter(function (v) {
        return v.fecha.slice(0, 4) === anio && Math.floor((Number(v.fecha.slice(5, 7)) - 1) / 3) + 1 === t; }).length};
    }),
    anios: (function () {
      const m = {};
      ventas.forEach(function (v) { const a = v.fecha.slice(0, 4); m[a] = (m[a] || 0) + 1; });
      return Object.keys(m).sort().map(function (a) { return {anio: a, ventas: m[a]}; });
    })()
  };

  /* Citas que hacen falta para una venta: con lo de los últimos 12 meses, que un mes suelto engaña. */
  const doce = contarPeriodo_(sucesos, sumarDias_(hoy, -365), hoy, 'captador_id', idsCapt);

  return {ok: true, hoy: hoy, periodos: periodos, serie: serie, ventas: ventasPor,
          ultimo_ano: {grupo: doce.total, captadores: captadores.map(function (x) {
            return Object.assign({id: x.id, nombre: x.nombre, yo: String(x.id) === String(u.id)}, doce.por[String(x.id)]);
          })},
          captadores: captadores.map(function (x) { return {id: x.id, nombre: x.nombre}; }),
          motivos_cancelacion: MOTIVOS_CANCELACION};
}

/* ---------- dos captadores en la misma zona ---------- */

function metrosEntre_(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Coordenadas del cliente; si no tiene y la dirección lleva número, se buscan (y se guardan). */
function coordenadasCliente_(cli) {
  const co = coordenadas_(cli.coordenadas);
  if (co) return co;
  if (!/\d/.test(txt_(cli.direccion))) return null;
  /* Sin municipio, solo si la dirección ya lo lleva (o el código postal). */
  if (!txt_(cli.municipio) && !/\b\d{5}\b|,.*[a-záéíóúñ]{3}/i.test(txt_(cli.direccion).replace(/^[^,]*,/, ''))) return null;
  try {
    const r = Maps.newGeocoder().setRegion('es').geocode([txt_(cli.direccion), txt_(cli.municipio), txt_(cli.cp), 'España']
      .filter(String).join(', '));
    const res = r && r.status === 'OK' && r.results && r.results[0];
    /* Solo si Google la encuentra en el portal (no el centro de la calle o del pueblo). */
    if (!res || ['ROOFTOP', 'RANGE_INTERPOLATED'].indexOf(res.geometry.location_type) < 0) return null;
    const loc = res.geometry.location;
    actualizar_('CLIENTES', cli.id, {coordenadas: redondear_(loc.lat, 6) + ',' + redondear_(loc.lng, 6)});
    return [redondear_(loc.lat, 6), redondear_(loc.lng, 6)];
  } catch (e) { return null; }
}

function correosDireccion_() {
  const vistos = {};
  return leer_('USUARIOS').filter(function (x) {
    return ['admin', 'superadmin'].indexOf(normal_(x.rol)) >= 0 && normal_(x.activo) === 'si' && txt_(x.email);
  }).map(function (x) { return txt_(x.email); }).filter(function (e) {
    const k = normal_(e); if (vistos[k]) return false; vistos[k] = 1; return true;
  });
}

/**
 * Al meter una ficha de captación: ¿hay otra de OTRO captador a menos de
 * 200 m en las últimas 48 horas? Si la hay, correo a los dos y a dirección
 * (una vez por pareja de fichas). Devuelve el aviso para enseñarlo ya.
 */
function avisoZonaCaptacion_(cap) {
  try {
    if (normal_(config_().aviso_zona) === 'no') return '';
    const capt = txt_(cap.captador_id);
    if (!capt) return '';
    const clientes = indexar_(leer_('CLIENTES'), 'id');
    const cli = clientes[String(cap.cliente_id)];
    if (!cli) return '';
    const aqui = coordenadasCliente_(cli);
    if (!aqui) return '';
    const usuarios = indexar_(leer_('USUARIOS'), 'id');
    const desde = Utilities.formatDate(new Date(Date.now() - HORAS_ZONA * 3600000), zonaHoraria_(), 'yyyy-MM-dd HH:mm:ss');
    const cerca = [];
    leer_('CAPTACIONES').forEach(function (k) {
      if (String(k.id) === String(cap.id) || !txt_(k.captador_id) || String(k.captador_id) === capt) return;
      if (String(k.cliente_id) === String(cap.cliente_id)) return;
      /* Solo cuenta lo que el otro metió en las últimas 48 horas. */
      const alta = txt_(k.creado);
      if (alta.length < 16 || alta < desde) return;
      const otro = clientes[String(k.cliente_id)];
      const co = otro && coordenadas_(otro.coordenadas);
      if (!co) return;
      const m = metrosEntre_(aqui, co);
      if (m < METROS_ZONA) cerca.push({cap: k, cli: otro, metros: Math.round(m)});
    });
    if (!cerca.length) return '';
    cerca.sort(function (a, b) { return a.metros - b.metros; });
    const avisados = leerProp_(K_AVISOS_ZONA, {});
    const yo = usuarios[capt] || {};
    const etiqueta = function (c) { return [txt_(c.direccion), txt_(c.municipio)].filter(String).join(', '); };
    const lineas = [];
    const otros = {};
    cerca.forEach(function (x) {
      const k = [String(cap.id), String(x.cap.id)].sort().join('|');
      const quien = usuarios[String(x.cap.captador_id)] || {};
      lineas.push({k: k, texto: (quien.nombre || 'Otro captador') + ' sacó el ' + fechaLarga_(txt_(x.cap.creado) || x.cap.fecha) +
        ' una ficha en ' + etiqueta(x.cli) + ' (a ' + x.metros + ' m)'});
      otros[String(x.cap.captador_id)] = quien;
    });
    const nuevas = lineas.filter(function (x) { return !avisados[x.k]; });
    const aviso = 'Ojo: ' + lineas.map(function (x) { return x.texto; }).join('; ') + '.';
    if (!nuevas.length) return aviso;
    const para = [txt_(yo.email)].concat(Object.keys(otros).map(function (id) { return txt_(otros[id].email); }))
      .concat(correosDireccion_()).filter(String);
    const unicos = para.filter(function (e, i) { return para.map(normal_).indexOf(normal_(e)) === i; });
    const nombres = [yo.nombre].concat(Object.keys(otros).map(function (id) { return otros[id].nombre; })).filter(String);
    const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#17191c;max-width:620px">' +
      '<p>Hola,</p><p><b>' + nombres.join(' y ') + '</b>: estáis sacando leads en la misma zona (a menos de ' + METROS_ZONA + ' m).</p>' +
      '<p style="margin:14px 0 6px"><b>La ficha nueva</b></p><p style="margin:0">' + (yo.nombre || '') + ' · ' + etiqueta(cli) +
      ' · ' + fechaLarga_(txt_(cap.creado) || hoyISO_()) + '</p>' +
      '<p style="margin:14px 0 6px"><b>Lo que ya había cerca (últimas ' + HORAS_ZONA + ' horas)</b></p><ul style="padding-left:20px;margin:0">' +
      nuevas.map(function (x) { return '<li style="margin:0 0 6px">' + x.texto + '</li>'; }).join('') + '</ul>' +
      '<p style="margin:16px 0">Hablad entre vosotros para repartiros las calles y no llamar dos veces a la misma puerta.</p>' +
      '<p style="margin:22px 0"><a href="' + WEB_CRM + '#captaciones" style="background:#b4fa1e;color:#17191c;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir el CRM</a></p>' +
      '<p style="color:#5b6159;font-size:12px">Aviso automático del CRM. La distancia sale de las coordenadas de cada ficha.</p></div>';
    if (unicos.length) {
      try {
        MailApp.sendEmail({to: unicos.join(','), name: 'CRM · ZERO WATTIOS',
          subject: 'Dos captadores en la misma zona · ' + etiqueta(cli), htmlBody: html});
      } catch (e) { /* sin cuota: el aviso sale igualmente en pantalla */ }
    }
    nuevas.forEach(function (x) { avisados[x.k] = hoyISO_(); });
    Object.keys(avisados).forEach(function (k) { if (diasEntre_(avisados[k], hoyISO_()) > 180) delete avisados[k]; });
    guardarProp_(K_AVISOS_ZONA, avisados);
    registrar_(null, 'aviso_zona', 'CAPTACIONES', cap.id, nuevas.length + ' cerca');
    return aviso;
  } catch (e) {
    return '';
  }
}

/**
 * Dirección: busca las coordenadas de los clientes de las fichas de los
 * últimos 90 días que no las tienen (solo si Google da el portal), para que
 * el aviso de misma zona tenga con qué comparar. Va por tandas.
 */
function accCoordenadasZona_(u, p) {
  exigir_(u, 'editarTodo');
  const limite = Math.min(num_(p.limite) || 25, 60);
  const desde = sumarDias_(hoyISO_(), -DIAS_ZONA);
  const clientes = indexar_(leer_('CLIENTES'), 'id');
  const vistos = {};
  const pendientes = [];
  /* Los que Google no sabe situar en el portal no se vuelven a preguntar en 30 días. */
  const fallidos = leerProp_('zona_sin_coordenadas', {});
  leer_('CAPTACIONES').forEach(function (k) {
    const alta = txt_(k.creado).slice(0, 10) || txt_(k.fecha).slice(0, 10);
    const c = clientes[String(k.cliente_id)];
    if (!c || !txt_(k.captador_id) || !alta || alta < desde || vistos[c.id] || coordenadas_(c.coordenadas)) return;
    if (fallidos[c.id] && diasEntre_(fallidos[c.id], hoyISO_()) < 30) return;
    vistos[c.id] = 1;
    pendientes.push(c);
  });
  let hechos = 0, sin = 0;
  const tanda = pendientes.slice(0, limite);
  tanda.forEach(function (c) { if (coordenadasCliente_(c)) hechos++; else { sin++; fallidos[c.id] = hoyISO_(); } });
  guardarProp_('zona_sin_coordenadas', fallidos);
  registrar_(u, 'coordenadas_zona', 'CLIENTES', '', hechos + ' de ' + tanda.length);
  return {ok: true, hechos: hechos, sin_precision: sin, quedan: Math.max(0, pendientes.length - tanda.length)};
}
