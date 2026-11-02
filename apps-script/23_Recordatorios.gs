/**
 * CRM · ZERO WATTIOS
 * 23_Recordatorios.gs — «Eso también va en el CRM» (02/11/2026).
 *
 * Orden de Nando: desde el 03/11/2026 comerciales y captadores lo apuntan
 * todo en el CRM. Cuando se les olvida algo, o lo ponen en otro sitio
 * (WhatsApp, Trello, un correo) y no en el CRM, les llega un correo que se
 * lo recuerda. Solo a comerciales y captadores; dirección no recibe nada.
 *
 *  - Los agentes, al leer WhatsApp, Trello o el correo, apuntan con
 *    recordarCRM lo que alguien ha puesto fuera y no está en el CRM.
 *  - Dos veces al día (13:30 y 19:30, lunes a viernes) sale UN correo por
 *    persona con todo lo suyo. A las 19:30 se añade además lo que se ha
 *    quedado a medias: visitas sin resultado, sentadas sin proyecto pedido,
 *    propuestas listas sin enviar, fichas sin teléfono o dirección y el
 *    parte del día sin mandar.
 *  - Lo mismo no se repite antes de 3 días. Se apaga con avisos_crm = no.
 */

const K_COLA_RECORD = 'recordatorios_cola';
const K_ENVIADOS_RECORD = 'recordatorios_enviados';
const DIAS_REPETIR_RECORD = 3;
const ROLES_RECORD = ['comercial', 'captador'];
const DONDE_RECORD = {whatsapp: 'en WhatsApp', trello: 'en Trello', correo: 'por correo', otro: 'fuera del CRM'};

function leerProp_(k, defecto) {
  try { const v = PROPS.getProperty(k); return v ? JSON.parse(v) : defecto; } catch (e) { return defecto; }
}
function guardarProp_(k, v) { PROPS.setProperty(k, JSON.stringify(v)); }

function desdeRecordatorios_() { return txt_(config_().recordatorios_desde) || '2026-11-03'; }

/**
 * Un agente (o dirección) apunta que alguien ha puesto algo fuera del CRM.
 * p: {usuario_id | usuario (nombre), que, donde, cliente, clave}
 */
function accRecordarCRM_(u, p) {
  exigir_(u, 'editarTodo');
  const usuarios = leer_('USUARIOS');
  const quien = txt_(p.usuario_id)
    ? usuarios.filter(function (x) { return String(x.id) === String(p.usuario_id); })[0]
    : usuarios.filter(function (x) { return normal_(x.nombre) === normal_(p.usuario) || normal_(x.usuario) === normal_(p.usuario); })[0];
  if (!quien) return {ok: false, error: 'No sé quién es esa persona.'};
  if (ROLES_RECORD.indexOf(normal_(quien.rol)) < 0) return {ok: true, encolado: false, motivo: 'Solo se recuerda a comerciales y captadores.'};
  const que = txt_(p.que).slice(0, 220);
  if (!que) return {ok: false, error: 'Di qué falta por meter en el CRM.'};
  const clave = txt_(p.clave) || ('fuera|' + normal_(que).slice(0, 80) + '|' + normal_(p.cliente).slice(0, 60));
  const cola = leerProp_(K_COLA_RECORD, []);
  if (cola.some(function (x) { return x.usuario_id === quien.id && x.clave === clave; })) return {ok: true, encolado: false, motivo: 'Ya estaba apuntado.'};
  cola.push({usuario_id: quien.id, que: que, donde: normal_(p.donde) || 'otro', cliente: txt_(p.cliente).slice(0, 120),
             clave: clave, fecha: ahora_()});
  guardarProp_(K_COLA_RECORD, cola.slice(-300));
  registrar_(u, 'recordar_crm', 'USUARIOS', quien.id, que);
  return {ok: true, encolado: true};
}

/** Lo que cada comercial y captador ha dejado a medias en el CRM. */
function pendientesCRM_(hoy) {
  const desde = desdeRecordatorios_();
  const C = indexar_(leer_('CLIENTES'), 'id');
  const P = {}; leer_('PROYECTOS').forEach(function (x) { P[String(x.cliente_id)] = x; });
  const fuera = {};
  const add = function (uid, clave, texto, como) {
    if (!uid) return;
    (fuera[uid] = fuera[uid] || []).push({clave: clave, texto: texto, como: como});
  };
  const nombre = function (c) { return c ? [txt_(c.direccion), txt_(c.nombre)].filter(String).join(' · ') : ''; };
  const desdeYa = function (f) { const d = txt_(f).slice(0, 10); return d && d >= desde; };

  leer_('CAPTACIONES').forEach(function (k) {
    const c = C[String(k.cliente_id)];
    const f = txt_(k.fecha).slice(0, 10);
    const res = normal_(k.resultado || 'pendiente');
    /* Comercial: visita ya pasada sin resultado. */
    if (txt_(k.comercial_id) && desdeYa(f) && f < hoy && res === 'pendiente') {
      add(k.comercial_id, 'sinres|' + k.id, 'La visita del ' + f.split('-').reverse().join('/') + ' a ' + nombre(c) + ' no tiene resultado.',
        'Ficha del cliente › + Apuntar › La visita (o pestaña Citas › Resultado).');
    }
    /* Comercial: sentada hace 2 días o más y el proyecto sin pedir. */
    const fr = txt_(k.fecha_resultado).slice(0, 10) || f;
    if (txt_(k.comercial_id) && (res === 'sentada' || res === 'potencial') && desdeYa(fr) && diasEntre_(fr, hoy) >= 2) {
      const pr = P[String(k.cliente_id)];
      if (!pr || ['', 'borrador'].indexOf(normal_(pr.estado)) >= 0) {
        add(k.comercial_id, 'sinproy|' + k.cliente_id, 'Sentada en ' + nombre(c) + ' sin proyecto pedido al ingeniero.',
          'Modo visita › Guardar y mandar al ingeniero (con al menos una foto).');
      }
    }
    /* Captador: ficha de captación incompleta. */
    if (txt_(k.captador_id) && c && desdeYa(txt_(k.creado) || f)) {
      const falta = [];
      if (String(txt_(c.telefono)).replace(/\D/g, '').length < 9) falta.push('teléfono');
      if (!txt_(c.direccion)) falta.push('dirección');
      /* El gasto no: en la puerta casi nunca se sabe y lo confirma el comercial con la factura. */
      if (falta.length) add(k.captador_id, 'ficha|' + k.id + '|' + falta.join(','),
        'A la ficha de ' + (nombre(c) || 'un cliente') + ' le falta: ' + falta.join(', ') + '.',
        'Ficha del cliente › Falta por meter.');
    }
  });
  /* Comercial: propuesta lista hace 2 días o más y sin marcar como enviada. */
  leer_('PROYECTOS').forEach(function (pr) {
    const c = C[String(pr.cliente_id)];
    if (!c || !txt_(c.comercial_id)) return;
    const fe = txt_(pr.entregado || pr.modificado).slice(0, 10);
    if (normal_(pr.estado) === 'entregado' && !txt_(pr.enviado) && desdeYa(fe) && diasEntre_(fe, hoy) >= 2) {
      add(c.comercial_id, 'sinenviar|' + pr.id, 'La propuesta de ' + nombre(c) + ' está lista desde el ' + fe.split('-').reverse().join('/') + ' y no está marcada como enviada.',
        'Ficha › Proyecto › Enviar la propuesta › «Ya se lo he enviado».');
    }
    if (normal_(pr.estado) === 'faltan_datos' && desdeYa(txt_(pr.modificado)) && diasEntre_(txt_(pr.modificado).slice(0, 10), hoy) >= 2) {
      add(c.comercial_id, 'faltan|' + pr.id, 'El proyecto de ' + nombre(c) + ' sigue parado: falta ' + (function (f) { return f.length > 110 ? f.slice(0, 107) + '…' : f; })(txt_(pr.faltan)) + '.',
        'Ficha › Proyecto: súbelo ahí y vuelve solo a la cola.');
    }
  });
  /* Todos: el parte del último día laborable. */
  const ayer = (function () { let d = sumarDias_(hoy, -1); while ([0, 6].indexOf(fecha_(d).getDay()) >= 0) d = sumarDias_(d, -1); return d; })();
  if (ayer >= desde) {
    const conParte = {};
    leer_('PARTES').forEach(function (x) { if (txt_(x.fecha).slice(0, 10) === ayer) conParte[String(x.usuario_id)] = 1; });
    leer_('USUARIOS').forEach(function (us) {
      if (ROLES_RECORD.indexOf(normal_(us.rol)) >= 0 && normal_(us.activo) === 'si' && !conParte[String(us.id)]) {
        add(us.id, 'parte|' + ayer, 'No está el parte del día del ' + ayer.split('-').reverse().join('/') + '.', 'Menú › Parte del día.');
      }
    });
  }
  return fuera;
}

/** El correo de cada persona: lo de fuera del CRM y lo que está a medias. */
function cuerpoRecordatorio_(us, deFuera, aMedias) {
  const li = function (t, nota) { return '<li style="margin:0 0 8px">' + t + (nota ? '<br><span style="color:#5b6159;font-size:13px">→ ' + nota + '</span>' : '') + '</li>'; };
  let html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#17191c;max-width:620px">' +
    '<p>Hola ' + txt_(us.nombre) + ',</p>' +
    '<p>Desde el 3 de noviembre <b>todo se apunta en el CRM</b>, para que el equipo, el ingeniero y dirección lo vean a la vez y no se pierda nada.</p>';
  if (deFuera.length) {
    html += '<p style="margin:18px 0 6px"><b>Esto lo has puesto en otro sitio y también tiene que estar en el CRM:</b></p><ul style="padding-left:20px;margin:0">' +
      deFuera.map(function (x) { return li((DONDE_RECORD[x.donde] ? 'Lo pusiste ' + DONDE_RECORD[x.donde] + ': ' : '') + x.que +
        (x.cliente ? ' <b>(' + x.cliente + ')</b>' : ''), 'Mételo tú en el CRM; si ya lo ha pasado el sistema, la próxima vez hazlo directamente allí.'); }).join('') + '</ul>';
  }
  if (aMedias.length) {
    html += '<p style="margin:18px 0 6px"><b>Esto se ha quedado sin terminar en el CRM:</b></p><ul style="padding-left:20px;margin:0">' +
      aMedias.map(function (x) { return li(x.texto, x.como); }).join('') + '</ul>';
  }
  html += '<p style="margin:22px 0"><a href="' + WEB_CRM + '" style="background:#b4fa1e;color:#17191c;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Abrir el CRM</a></p>' +
    '<p style="color:#5b6159;font-size:12px">Este correo sale solo, como mucho dos veces al día, y no repite lo mismo antes de ' + DIAS_REPETIR_RECORD + ' días. ' +
    'Si algo de la lista ya está hecho, no hagas nada.</p></div>';
  return html;
}

/**
 * Manda los recordatorios. Lo llama el disparador de las 13:30 y las 19:30.
 * Con simular no manda nada: devuelve lo que mandaría.
 */
function enviarRecordatorios_(opciones) {
  opciones = opciones || {};
  const conf = config_();
  if (normal_(conf.avisos_crm) === 'no' && !opciones.simular) return {ok: true, apagado: true, correos: []};
  const hoy = opciones.hoy || hoyISO_();
  const dia = fecha_(hoy).getDay();
  if ((dia === 0 || dia === 6) && !opciones.forzar) return {ok: true, finde: true, correos: []};
  const tarde = opciones.tarde !== undefined ? opciones.tarde
    : Number(Utilities.formatDate(new Date(), zonaHoraria_(), 'H')) >= 16;
  const cola = leerProp_(K_COLA_RECORD, []);
  const enviados = leerProp_(K_ENVIADOS_RECORD, {});
  const reciente = function (uid, clave) { const f = enviados[uid + '#' + clave]; return f && diasEntre_(f, hoy) < DIAS_REPETIR_RECORD; };
  const aMedias = tarde ? pendientesCRM_(hoy) : {};
  const todos = leer_('USUARIOS');
  /* Si alguien de dirección también tiene cuenta de comercial con su mismo
     correo (Nando), tampoco le llega: los recordatorios son para el equipo. */
  const deDireccion = {};
  todos.forEach(function (x) { if (ROLES_RECORD.indexOf(normal_(x.rol)) < 0 && txt_(x.email)) deDireccion[normal_(x.email)] = 1; });
  const usuarios = todos.filter(function (x) {
    return ROLES_RECORD.indexOf(normal_(x.rol)) >= 0 && normal_(x.activo) === 'si' && txt_(x.email) && !deDireccion[normal_(x.email)];
  });
  const correos = [];
  usuarios.forEach(function (us) {
    const fuera = cola.filter(function (x) { return x.usuario_id === us.id && !reciente(us.id, x.clave); });
    const medias = (aMedias[us.id] || []).filter(function (x) { return !reciente(us.id, x.clave); });
    if (!fuera.length && !medias.length) return;
    const n = fuera.length + medias.length;
    const correo = {to: txt_(us.email), name: 'CRM · ZERO WATTIOS',
      subject: 'Falta' + (n > 1 ? 'n ' + n + ' cosas' : ' 1 cosa') + ' por meter en el CRM',
      htmlBody: cuerpoRecordatorio_(us, fuera, medias)};
    correos.push({usuario: us.nombre, email: us.email, fuera: fuera.map(function (x) { return x.que; }),
                  aMedias: medias.map(function (x) { return x.texto; }), asunto: correo.subject});
    if (opciones.simular) return;
    try {
      MailApp.sendEmail(correo);
      fuera.concat(medias).forEach(function (x) { enviados[us.id + '#' + x.clave] = hoy; });
    } catch (e) { /* sin cuota o sin correo: se intenta en la siguiente vuelta */ }
  });
  if (!opciones.simular) {
    /* Lo de la cola ya avisado sale de la cola; los avisados viejos se olvidan. */
    guardarProp_(K_COLA_RECORD, cola.filter(function (x) { return !enviados[x.usuario_id + '#' + x.clave]; }));
    Object.keys(enviados).forEach(function (k) { if (diasEntre_(enviados[k], hoy) > 30) delete enviados[k]; });
    guardarProp_(K_ENVIADOS_RECORD, enviados);
  }
  return {ok: true, correos: correos};
}

/** Disparador (13:30 y 19:30). */
function recordatoriosCRM() {
  /* Desde el 02/11/2026 los manda el servidor de crm.zerowattios.com (api/cron.php);
     esta hoja ya es solo el espejo y no debe mandar nada (saldría repetido y con datos viejos). */
  if (PROPS.getProperty('CRM_MIGRADO') === 'si') return {ok: true, migrado: true};
  return enviarRecordatorios_({});
}

/** Dirección: ver lo que saldría ahora (simular) o mandarlo ya. */
function accRecordatorios_(u, p) {
  exigir_(u, 'config');
  return enviarRecordatorios_({simular: p.simular !== false, tarde: p.tarde !== false, forzar: !!p.forzar, hoy: txt_(p.hoy) || undefined});
}

/** Se ejecuta una vez desde el editor: crea los dos disparadores diarios. */
function instalarRecordatorios() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'recordatoriosCRM') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('recordatoriosCRM').timeBased().everyDays(1).atHour(13).nearMinute(30).create();
  ScriptApp.newTrigger('recordatoriosCRM').timeBased().everyDays(1).atHour(19).nearMinute(30).create();
  Logger.log('Recordatorios del CRM: todos los días hacia las 13:30 y las 19:30 (los fines de semana no sale nada).');
  return true;
}
