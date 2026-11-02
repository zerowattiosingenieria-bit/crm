/**
 * 21_Mejoras.gs — Mejoras del 02/11/2026 (orden de Nando).
 *
 * - Llave de servicio para los agentes: una sesión que no cae por
 *   inactividad, para que el sistema no se pare cuando caduca la de Nando.
 * - Agenda del CRM preparada para ser la única: huecos por comercial,
 *   días bloqueados (los viernes de Nando) y aviso de choques al dar citas.
 *   Mientras tanto Trello sigue mandando y los agentes lo copian aquí.
 * - Pedir cambios al ingeniero sobre un proyecto ya entregado.
 * - Banco: casado automático de cobros y alertas de pagos raros.
 * - Catastro: referencia, m² y año a partir de las coordenadas.
 * - Aviso por correo al captador cuando su ficha pasa a sentada, venta o se cae.
 */

/* ---------- llave de servicio ---------- */

const PREFIJO_SERVICIO = 'SERVICIO';
const DIAS_LLAVE_SERVICIO = 365;

function esSesionServicio_(s) { return txt_(s && s.agente).indexOf(PREFIJO_SERVICIO) === 0; }

/** El superadmin genera la llave de un usuario con rol «agente». Se enseña una vez. */
function accLlaveServicio_(u, p) {
  exigir_(u, 'usuarios');
  const dest = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(p.usuario_id); })[0];
  if (!dest) return {ok: false, error: 'No existe ese usuario.'};
  if (normal_(dest.rol) !== 'agente') {
    return {ok: false, error: 'Las llaves de servicio solo se dan a usuarios con rol «Agente».'};
  }
  const tk = token_();
  const expira = dentroDe_(DIAS_LLAVE_SERVICIO * 24 * 60);
  insertar_('SESIONES', {
    token: tk, usuario_id: dest.id, creado: ahora_(), expira: expira,
    agente: (PREFIJO_SERVICIO + ' · ' + (txt_(p.nota) || txt_(dest.nombre))).slice(0, 120),
    equipo: 'servicio', ultimo_uso: ahora_()
  });
  registrar_(u, 'llave_servicio', 'USUARIOS', dest.id, 'caduca ' + expira);
  return {ok: true, token: tk, expira: expira};
}

/** Quita todas las llaves de servicio de un usuario (si se pierde o se filtra). */
function accRevocarLlaves_(u, p) {
  exigir_(u, 'usuarios');
  const h = hoja_('SESIONES');
  const filas = leer_('SESIONES');
  let n = 0;
  for (let i = filas.length - 1; i >= 0; i--) {
    const s = filas[i];
    if (String(s.usuario_id) === String(p.usuario_id) && esSesionServicio_(s)) { h.deleteRow(i + 2); n++; }
  }
  registrar_(u, 'revocar_llaves', 'USUARIOS', p.usuario_id, n + ' llaves');
  return {ok: true, revocadas: n};
}

/* ---------- agenda ---------- */

/** Bloqueos fijos de la agenda: {"U-000004":{"dias":[5],"nota":"Viernes sin visitas"}}. */
function bloqueosAgenda_() {
  const c = config_();
  let b = {};
  try { b = JSON.parse(txt_(c.agenda_bloqueos) || '{}'); } catch (e) { b = {}; }
  if (!txt_(c.agenda_bloqueos)) b = {'U-000004': {dias: [5], nota: 'Viernes sin visitas (Nando)'}};
  /* Reglas de Nando (02/11/2026): como mucho 3 visitas al día, los viernes
     nada y ninguna después de las 17:30, salvo que él lo autorice. */
  const n = b['U-000004'] = b['U-000004'] || {};
  if (!n.dias) n.dias = [5];
  if (n.max_dia === undefined) n.max_dia = 3;
  if (n.hasta === undefined) n.hasta = '17:30';
  return b;
}

const NOMBRE_DIA_ = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Las reglas fijas de la agenda de un comercial: días sin visitas, hora
 * límite y máximo de visitas al día. Devuelve lo que no cumple (vacío si cumple).
 */
function reglasAgenda_(comercialId, fecha, hora, salvoId) {
  const fallos = [];
  fecha = txt_(fecha).slice(0, 10);
  const r = bloqueosAgenda_()[txt_(comercialId)];
  if (!r || !fecha) return fallos;
  const dia = new Date(fecha + 'T12:00:00').getDay();
  if ((r.dias || []).indexOf(dia) >= 0) fallos.push('los ' + NOMBRE_DIA_[dia] + ' no tiene visitas');
  const ini = minutosHora_(hora);
  if (txt_(r.hasta) && ini >= 0 && ini > minutosHora_(r.hasta)) fallos.push('no tiene visitas después de las ' + txt_(r.hasta));
  if (num_(r.max_dia) > 0) {
    const n = citasDelDia_(comercialId, fecha, salvoId).length;
    if (n >= num_(r.max_dia)) fallos.push('ese día ya tiene ' + n + ' visitas y como mucho son ' + num_(r.max_dia));
  }
  return fallos;
}

/* Orden de Nando (02/11/2026): una visita dura como mínimo 1 h 45 min, y entre
   una y otra hay que contar lo que tarda el comercial en coche. */
function duracionCita_() { return configNum_('agenda_duracion_min', 105); }

function minutosHora_(h) {
  const m = txt_(h).match(/^(\d{1,2})[:.](\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}
const hhmm_ = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

/** Dónde está la visita: coordenadas si las hay, si no la dirección con el municipio. */
function puntoCliente_(cli) {
  if (!cli) return '';
  const c = txt_(cli.coordenadas);
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(c)) return c.replace(/\s/g, '');
  return [txt_(cli.direccion), txt_(cli.municipio), txt_(cli.cp)].filter(String).join(', ');
}

/**
 * Minutos en coche de un punto a otro con Google Maps (servicio Maps de
 * Apps Script). Se guarda en caché 6 horas. Si Maps no contesta, 30 min.
 */
function minutosCoche_(origen, destino) {
  origen = txt_(origen); destino = txt_(destino);
  if (!origen || !destino) return {min: 30, estimado: true};
  if (normal_(origen) === normal_(destino)) return {min: 0, estimado: false};
  const k = ('coche|' + normal_(origen) + '>' + normal_(destino)).slice(0, 240);
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  const enCache = cache ? cache.get(k) : null;
  if (enCache) return {min: Number(enCache), estimado: false};
  try {
    const r = Maps.newDirectionFinder().setOrigin(origen).setDestination(destino)
      .setMode(Maps.DirectionFinder.Mode.DRIVING).setRegion('es').getDirections();
    const seg = r && r.routes && r.routes[0] && r.routes[0].legs[0].duration.value;
    if (!seg) return {min: 30, estimado: true};
    const min = Math.ceil(seg / 60);
    if (cache) cache.put(k, String(min), 21600);
    return {min: min, estimado: false};
  } catch (e) { return {min: 30, estimado: true}; }
}

/** Citas vivas de un comercial un día, ordenadas por hora, con su punto. */
function citasDelDia_(comercialId, fecha, salvoId) {
  const clientes = indexar_(leer_('CLIENTES'), 'id');
  return leer_('CAPTACIONES').filter(function (o) {
    return String(o.id) !== String(salvoId || '') && txt_(o.comercial_id) === txt_(comercialId) &&
           txt_(o.fecha).slice(0, 10) === fecha && minutosHora_(o.hora_cita) >= 0 &&
           ['no_sentada', 'cancelada'].indexOf(normal_(o.resultado)) < 0;
  }).map(function (o) {
    const cli = clientes[o.cliente_id];
    return {id: o.id, ini: minutosHora_(o.hora_cita), punto: puntoCliente_(cli),
            sitio: cli ? txt_(cli.direccion || cli.nombre) : ''};
  }).sort(function (a, b) { return a.ini - b.ini; });
}

/**
 * Comprueba una cita: día bloqueado, duración mínima y tiempo de coche desde
 * la visita anterior y hasta la siguiente. Devuelve un texto (vacío si cuadra).
 * Avisa, no bloquea: quien da la cita decide.
 */
function revisarCita_(comercialId, fecha, hora, punto, salvoId) {
  const avisos = [];
  fecha = txt_(fecha).slice(0, 10);
  if (!comercialId || !fecha) return {texto: '', detalle: []};
  const reglas = reglasAgenda_(comercialId, fecha, hora, salvoId);
  if (reglas.length) avisos.push('Sin su autorización no se puede: ' + reglas.join('; ') + '.');
  const ini = minutosHora_(hora);
  const detalle = [];
  if (ini >= 0) {
    const dur = duracionCita_();
    const citas = citasDelDia_(comercialId, fecha, salvoId);
    const antes = citas.filter(function (c) { return c.ini <= ini; }).pop();
    const despues = citas.filter(function (c) { return c.ini > ini; })[0];
    if (antes) {
      const t = minutosCoche_(antes.punto, punto);
      const libre = antes.ini + dur + t.min;
      detalle.push({de: antes.sitio, min: t.min, estimado: t.estimado});
      if (ini < libre) avisos.push('No le da tiempo: la visita de las ' + hhmm_(antes.ini) + ' (' + antes.sitio +
        ') acaba a las ' + hhmm_(antes.ini + dur) + ' y luego hay ' + t.min + ' min en coche' +
        (t.estimado ? ' (estimado)' : '') + '. Lo antes posible: ' + hhmm_(libre) + '.');
    }
    if (despues) {
      const t = minutosCoche_(punto, despues.punto);
      const tope = despues.ini - dur - t.min;
      detalle.push({a: despues.sitio, min: t.min, estimado: t.estimado});
      if (ini > tope) avisos.push('No llega a la siguiente: a las ' + hhmm_(despues.ini) + ' tiene ' + despues.sitio +
        ' y desde aquí son ' + t.min + ' min en coche' + (t.estimado ? ' (estimado)' : '') +
        '. Como muy tarde: ' + hhmm_(Math.max(0, tope)) + '.');
    }
  }
  return {texto: avisos.join(' '), detalle: detalle};
}

/** Correo al comercial para que autorice una cita que se sale de sus reglas. */
function pedirAutorizacionCita_(u, cap, pend) {
  try {
    const com = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(pend.comercial_id); })[0];
    if (!com || !txt_(com.email)) return;
    const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(cap.cliente_id); })[0] || {};
    const sitio = [txt_(cli.direccion), txt_(cli.municipio)].filter(String).join(', ') || 'un cliente';
    MailApp.sendEmail({to: txt_(com.email), name: 'CRM · ZERO WATTIOS',
      subject: 'Autoriza una visita · ' + fechaLarga_(pend.fecha, pend.hora) + ' · ' + sitio,
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px;color:#17191c;max-width:620px">' +
        '<p>Hola ' + txt_(com.nombre) + ',</p><p><b>' + txt_(u.nombre) + '</b> quiere darte una visita que se sale de tus reglas de agenda:</p>' +
        '<p style="margin:0 0 6px"><b>' + fechaLarga_(pend.fecha, pend.hora) + '</b> · ' + sitio + '</p>' +
        '<p style="margin:0 0 14px;color:#8a520b">' + pend.fallos.join('; ') + '.</p>' +
        '<p>La ficha está guardada <b>sin adjudicar</b>. Si la aceptas, adjudícatela en Captaciones («Adjudicar») o en la ficha del cliente. Si no, dile a ' +
        txt_(u.nombre) + ' que busque otra hora.</p>' +
        '<p style="margin:22px 0"><a href="' + WEB_CRM + '#cliente/' + txt_(cap.cliente_id) + '" style="background:#b4fa1e;color:#17191c;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir la ficha</a></p>' +
        '<p style="color:#5b6159;font-size:12px">Aviso automático del CRM.</p></div>'});
    registrar_(u, 'pedir_autorizacion_cita', 'CAPTACIONES', cap.id, pend.fallos.join('; '));
  } catch (e) { /* sin correo: la ficha queda igualmente sin adjudicar y con la nota */ }
}

/** Para el aviso al guardar una captación. */
function choqueAgenda_(cap) {
  try {
    if (!cap || !txt_(cap.comercial_id) || !txt_(cap.fecha)) return '';
    const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(cap.cliente_id); })[0];
    return revisarCita_(cap.comercial_id, cap.fecha, cap.hora_cita, puntoCliente_(cli), cap.id).texto;
  } catch (e) { return ''; }
}

/** Para comprobar una cita antes de darla (pantalla de nueva cita). */
function accComprobarCita_(u, p) {
  let punto = txt_(p.direccion);
  if (txt_(p.cliente_id)) {
    const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(p.cliente_id); })[0];
    if (cli && veCliente_(u, cli)) punto = puntoCliente_(cli) || punto;
  }
  const r = revisarCita_(p.comercial_id, p.fecha, p.hora, punto, p.captacion_id);
  return {ok: true, aviso: r.texto, detalle: r.detalle, duracion_min: duracionCita_()};
}

/** Huecos de cada comercial entre dos fechas: lo ocupado y lo bloqueado. */
function accAgendaHuecos_(u, p) {
  const desde = txt_(p.desde) || hoyISO_();
  const hasta = txt_(p.hasta) || sumarDias_(desde, 6);
  const comerciales = leer_('USUARIOS').filter(function (x) {
    return normal_(x.rol) === 'comercial' && normal_(x.activo) === 'si';
  }).map(function (x) { return {id: x.id, nombre: x.nombre}; });
  const clientes = indexar_(leer_('CLIENTES'), 'id');
  const citas = [];
  leer_('CAPTACIONES').forEach(function (c) {
    const f = txt_(c.fecha).slice(0, 10);
    if (!f || f < desde || f > hasta || !txt_(c.comercial_id)) return;
    if (['no_sentada', 'cancelada'].indexOf(normal_(c.resultado)) >= 0) return;
    const cli = clientes[c.cliente_id];
    const visible = cli && veCliente_(u, cli);
    citas.push({id: c.id, comercial_id: c.comercial_id, fecha: f, hora: txt_(c.hora_cita).slice(0, 5),
      confirmada: normal_(c.estado_cita) === 'confirmada',
      cliente: visible ? txt_(cli.direccion || cli.nombre) : 'Ocupado'});
  });
  return {ok: true, desde: desde, hasta: hasta, comerciales: comerciales, citas: citas,
          bloqueos: bloqueosAgenda_(), duracion_min: duracionCita_(),
          fuente: txt_(config_().agenda_fuente) || 'trello'};
}

/* ---------- proyecto: pedir cambios al ingeniero ---------- */

function accPedirCambios_(u, p) {
  const v = clienteVisible_(u, p.cliente_id);
  if (v.error) return {ok: false, error: v.error};
  const texto = txt_(p.texto);
  if (!texto) return {ok: false, error: 'Escribe qué hay que cambiar.'};
  let proy = proyectoDe_(v.cliente, u);
  const nota = '— CAMBIOS PEDIDOS (' + ahora_().slice(0, 16) + ' · ' + txt_(u.nombre) + '): ' + texto;
  proy = actualizar_('PROYECTOS', proy.id, {
    descripcion: (txt_(proy.descripcion) ? txt_(proy.descripcion) + '\n\n' : '') + nota,
    estado: 'pedido', pedido: ahora_(), pedido_por: u.id,
    modificado: ahora_(), modificado_por: u.id});
  registrar_(u, 'pedir_cambios', 'PROYECTOS', proy.id, v.cliente.nombre + ' · ' + texto.slice(0, 120));
  return {ok: true, proyecto: proy};
}

/* ---------- banco: casado automático y alertas ---------- */

/**
 * Casa las entradas del banco con los cobros pendientes cuando no hay duda:
 * el importe coincide con un único cobro pendiente, o el concepto lleva el
 * número de la factura del cobro. Con «simular» solo dice lo que haría.
 */
function accCasarAuto_(u, p) {
  exigir_(u, 'finanzas');
  const cobros = leer_('COBROS').filter(function (c) { return !txt_(c.fecha_cobro); });
  const facturas = indexar_(leer_('FACTURAS'), 'id');
  const movs = leer_('BANCO').filter(function (m) {
    return num_(m.importe) > 0 && !txt_(m.cobro_id) && normal_(m.conciliado) !== 'si';
  });
  const usados = {};
  const hechos = [];
  movs.forEach(function (m) {
    const imp = redondear_(num_(m.importe), 2);
    const concepto = normal_(m.concepto).replace(/\s/g, '');
    let elegido = null, motivo = '';
    const porFactura = cobros.filter(function (c) {
      const f = facturas[c.factura_id];
      return !usados[c.id] && f && txt_(f.numero) && concepto.indexOf(normal_(f.numero).replace(/\s/g, '')) >= 0;
    });
    if (porFactura.length === 1) { elegido = porFactura[0]; motivo = 'nº de factura en el concepto'; }
    if (!elegido) {
      const porImporte = cobros.filter(function (c) {
        return !usados[c.id] && Math.abs(redondear_(num_(c.importe), 2) - imp) < 0.02 &&
               (!txt_(c.fecha_prevista) || diasEntre_(txt_(c.fecha_prevista), txt_(m.fecha)) > -60);
      });
      if (porImporte.length === 1) { elegido = porImporte[0]; motivo = 'mismo importe, único pendiente'; }
    }
    if (!elegido) return;
    usados[elegido.id] = true;
    hechos.push({movimiento: m.id, fecha: txt_(m.fecha), importe: imp, concepto: txt_(m.concepto).slice(0, 60),
                 cobro: elegido.id, operacion: elegido.operacion_id, motivo: motivo});
    if (!p.simular) {
      accGuardarMovimiento_(u, {movimiento: {id: m.id, cobro_id: elegido.id}});
      const f = facturas[elegido.factura_id];
      if (f && !txt_(f.fecha_cobro)) actualizar_('FACTURAS', f.id, {fecha_cobro: txt_(m.fecha), estado: 'cobrada'});
    }
  });
  if (!p.simular && hechos.length) registrar_(u, 'casar_auto', 'BANCO', '', hechos.length + ' cobros casados');
  return {ok: true, simulado: !!p.simular, casados: hechos};
}

/** Pagos raros de los últimos 60 días: posibles duplicados y salidas grandes sin justificar. */
function accAlertasBanco_(u, p) {
  exigir_(u, 'finanzas');
  const dias = Number(p.dias) || 60;
  const desde = sumarDias_(hoyISO_(), -dias);
  const salidas = leer_('BANCO').filter(function (m) { return num_(m.importe) < 0 && txt_(m.fecha) >= desde; });
  const clave = function (m) { return normal_(m.concepto).replace(/[^a-z]/g, '').slice(0, 18); };
  const duplicados = [];
  for (let i = 0; i < salidas.length; i++) {
    for (let j = i + 1; j < salidas.length; j++) {
      const a = salidas[i], b = salidas[j];
      if (Math.abs(num_(a.importe) - num_(b.importe)) > 0.01 || clave(a) !== clave(b)) continue;
      if (Math.abs(diasEntre_(txt_(a.fecha), txt_(b.fecha))) > 5) continue;
      if (/nomina|tgss|seguridadsocial|traspaso/.test(clave(a))) continue;
      duplicados.push({fecha_a: a.fecha, fecha_b: b.fecha, importe: num_(a.importe), concepto: txt_(a.concepto).slice(0, 60),
                       ids: [a.id, b.id]});
    }
  }
  const umbral = Number(p.umbral) || 500;
  const sinJustificar = salidas.filter(function (m) {
    const cat = normal_(m.categoria);
    return Math.abs(num_(m.importe)) >= umbral && !txt_(m.gasto_id) &&
           ['', 'proveedor', 'montaje', 'otros_gastos', 'otros', 'sin_clasificar'].indexOf(cat) >= 0;
  }).map(function (m) { return {id: m.id, fecha: m.fecha, importe: num_(m.importe), concepto: txt_(m.concepto).slice(0, 60),
                                categoria: m.categoria}; });
  return {ok: true, duplicados: duplicados, sin_justificar: sinJustificar, desde: desde};
}

/* ---------- catastro ---------- */

/**
 * Con las coordenadas (o la referencia catastral) devuelve referencia,
 * dirección, superficie construida, año y uso. Servicio público de la
 * Sede Electrónica del Catastro (OVC), sin clave.
 */
function accCatastro_(u, p) {
  const base = 'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/';
  let rc = txt_(p.rc).replace(/\s/g, '');
  let direccion = '';
  try {
    if (!rc) {
      const lat = num_(p.lat), lon = num_(p.lon);
      if (!lat || !lon) return {ok: false, error: 'Faltan las coordenadas.'};
      const r1 = JSON.parse(UrlFetchApp.fetch(base + 'COVCCoordenadas.svc/json/Consulta_RCCOOR?SRS=EPSG:4326&CoorX=' +
        lon + '&CoorY=' + lat, {muteHttpExceptions: true}).getContentText());
      const res1 = r1.Consulta_RCCOORResult || r1;
      const c = ((res1.coordenadas || {}).coord || [])[0] || {};
      rc = txt_((c.pc || {}).pc1) + txt_((c.pc || {}).pc2);
      direccion = txt_(c.ldt);
      if (!rc) return {ok: false, error: 'El Catastro no da ninguna parcela en ese punto.'};
    }
    const r2 = JSON.parse(UrlFetchApp.fetch(base + 'COVCCallejero.svc/json/Consulta_DNPRC?RefCat=' + rc,
      {muteHttpExceptions: true}).getContentText());
    const res2 = r2.consulta_dnprcResult || r2.Consulta_DNPRCResult || r2;
    const bi = ((res2.bico || {}).bi) || (((res2.lrcdnp || {}).rcdnp || [])[0]) || {};
    const debi = bi.debi || {};
    return {ok: true, rc: rc, direccion: txt_(bi.ldt) || direccion,
            m2: num_(debi.sfc) || null, anyo: num_(debi.ant) || null, uso: txt_(debi.luso),
            varios: !bi.debi && !!res2.lrcdnp};
  } catch (e) {
    return {ok: false, error: 'No se ha podido consultar el Catastro: ' + e.message};
  }
}

/* ---------- avisos al captador ---------- */

/** Correo corto al captador cuando su ficha llega a sentada, venta o se cae. */
function avisarCaptador_(cap, cli) {
  try {
    if (normal_(config_().avisos_captador) === 'no') return;
    const res = normal_(cap && cap.resultado);
    const textos = {sentada: 'ha llegado a sentada', venta: '¡se ha vendido!', no_sentada: 'se ha caído',
                    potencial: 'ha quedado como potencial'};
    if (!textos[res] || !txt_(cap.captador_id)) return;
    const capt = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(cap.captador_id); })[0];
    if (!capt || !txt_(capt.email) || normal_(capt.activo) !== 'si') return;
    const quien = cli ? txt_(cli.direccion || cli.nombre) : '';
    MailApp.sendEmail({to: txt_(capt.email), name: 'CRM · ZERO WATTIOS',
      subject: 'Tu ficha ' + quien + ' ' + textos[res],
      body: 'Hola ' + txt_(capt.nombre) + ',\n\nLa ficha de ' + quien + ' ' + textos[res] + '.\n\n' +
            'Lo tienes en el CRM: ' + (typeof WEB_CRM !== 'undefined' ? WEB_CRM : '') + '\n\nZERO WATTIOS'});
  } catch (e) { /* un aviso que no sale no puede parar el guardado */ }
}
