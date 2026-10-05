/**
 * 17_Directorio.gs — El archivo histórico y las puertas tocadas.
 *
 * Aquí viven los clientes de siempre (Zero Wattios y Aurus) y las puertas
 * que se han ido tocando, que son miles. No se mezclan con el pipeline:
 * el CRM del día a día sigue teniendo sus operaciones y sus cobros, y esto
 * es la memoria de la casa, para buscar y para mirar en el mapa.
 *
 * No lo ve todo el mundo. La lista de quién entra está en Ajustes, en la
 * clave directorio_usuarios, y se comprueba SIEMPRE en el servidor.
 */

/* ---------- quién pasa ---------- */

function veDirectorio_(u) {
  const lista = txt_(config_().directorio_usuarios);
  if (!lista) return normal_(u.rol) === 'superadmin';
  const permitidos = lista.split(',').map(function (x) { return normal_(x); });
  return permitidos.indexOf(normal_(u.usuario)) >= 0;
}

function exigirDirectorio_(u) {
  if (!veDirectorio_(u)) throw new Error('El directorio no está abierto para tu usuario.');
}

/* ---------- consultar el directorio ---------- */

function accDirectorio_(u, p) {
  exigirDirectorio_(u);
  const buscar = normal_(p.buscar);
  const empresa = normal_(p.empresa);
  const municipio = normal_(p.municipio);
  const pagina = Math.max(1, num_(p.pagina) || 1);
  const porPagina = Math.min(200, Math.max(10, num_(p.por_pagina) || 50));

  const todos = leer_('DIRECTORIO');
  const municipios = {};
  const empresas = {};
  todos.forEach(function (c) {
    const m = txt_(c.municipio); if (m) municipios[m] = (municipios[m] || 0) + 1;
    const e = txt_(c.empresa); if (e) empresas[e] = (empresas[e] || 0) + 1;
  });

  const filtrados = todos.filter(function (c) {
    if (empresa && normal_(c.empresa) !== empresa) return false;
    if (municipio && normal_(c.municipio) !== municipio) return false;
    if (!buscar) return true;
    const heno = normal_([c.nombre, c.otros, c.direccion, c.municipio, c.telefono, c.email,
                          c.ref, c.interes, c.producto, c.notas].join(' '));
    return heno.indexOf(buscar) >= 0;
  });

  /* Primero los que se han movido hace menos. */
  filtrados.sort(function (a, b) {
    return txt_(b.ultima_visita).localeCompare(txt_(a.ultima_visita)) ||
           txt_(a.nombre).localeCompare(txt_(b.nombre));
  });

  const desde = (pagina - 1) * porPagina;
  return {ok: true,
    total: todos.length,
    encontrados: filtrados.length,
    pagina: pagina, por_pagina: porPagina,
    clientes: filtrados.slice(desde, desde + porPagina),
    /* Para el mapa hace falta todo lo que tenga coordenada, pero en corto. */
    puntos: filtrados.filter(function (c) { return c.lat && c.lon; }).map(function (c) {
      return [txt_(c.ref), num_(c.lat), num_(c.lon), txt_(c.nombre), txt_(c.empresa),
              txt_(c.municipio), txt_(c.precision)];
    }),
    municipios: Object.keys(municipios).sort().map(function (k) { return {municipio: k, n: municipios[k]}; }),
    empresas: Object.keys(empresas).sort().map(function (k) { return {empresa: k, n: empresas[k]}; })};
}

/** La ficha entera de uno, con sus visitas. */
function accDirectorioFicha_(u, p) {
  exigirDirectorio_(u);
  const ref = txt_(p.ref);
  const c = leer_('DIRECTORIO').filter(function (x) { return txt_(x.ref) === ref; })[0];
  if (!c) return {ok: false, error: 'No existe esa ficha.'};
  const visitas = leer_('DIR_VISITAS').filter(function (v) { return txt_(v.ref) === ref; })
    .sort(function (a, b) { return txt_(b.fecha).localeCompare(txt_(a.fecha)); });
  return {ok: true, cliente: c, visitas: visitas};
}

/* ---------- las puertas ---------- */

/** El lunes de la semana de una fecha, para contar "lo de esta semana". */
function lunesDe_(iso) {
  const d = fecha_(iso) || new Date();
  const dia = (d.getDay() + 6) % 7;            // lunes = 0
  const l = new Date(d.getTime() - dia * 86400000);
  return Utilities.formatDate(l, zonaHoraria_(), 'yyyy-MM-dd');
}

function accPuertas_(u, p) {
  exigirDirectorio_(u);
  const zona = normal_(p.zona);
  const desde = txt_(p.desde);
  const hasta = txt_(p.hasta);
  const buscar = normal_(p.buscar);

  const todas = leer_('PUERTAS');
  const zonas = {};
  todas.forEach(function (x) { const z = txt_(x.zona) || '(sin zona)'; zonas[z] = (zonas[z] || 0) + 1; });

  /* Para filtrar por fechas vale la que haya; para decir si es nueva, solo
     cuenta el día en que se tocó: una puerta sin fecha no es de esta semana
     por mucho que se haya cargado hoy. */
  const cuando = function (x) { return txt_(x.fecha) || txt_(x.alta_crm); };
  const esNueva = function (x, lunes) { return !!txt_(x.fecha) && txt_(x.fecha) >= lunes; };
  const lista = todas.filter(function (x) {
    if (zona && normal_(x.zona) !== zona) return false;
    const f = cuando(x);
    if (desde && f && f < desde) return false;
    if (hasta && f && f > hasta) return false;
    if (!buscar) return true;
    return normal_([x.nombre, x.direccion, x.zona, x.nota, x.categoria].join(' ')).indexOf(buscar) >= 0;
  });

  /* Lo nuevo de esta semana y el reparto por semanas, que es lo que se mira. */
  const lunes = lunesDe_(hoyISO_());
  const semanaPasada = Utilities.formatDate(new Date(fecha_(lunes).getTime() - 7 * 86400000),
                                            zonaHoraria_(), 'yyyy-MM-dd');
  const nuevas = todas.filter(function (x) { return esNueva(x, lunes); });
  const previas = todas.filter(function (x) {
    const f = txt_(x.fecha); return f && f >= semanaPasada && f < lunes; });
  const sinFecha = todas.filter(function (x) { return !txt_(x.fecha); }).length;

  const porSemana = {};
  todas.forEach(function (x) {
    const f = txt_(x.fecha); if (!f) return;
    const l = lunesDe_(f);
    porSemana[l] = (porSemana[l] || 0) + 1;
  });

  return {ok: true,
    total: todas.length,
    encontradas: lista.length,
    puertas: lista.map(function (x) {
      return {id: x.id, nombre: txt_(x.nombre), direccion: txt_(x.direccion), zona: txt_(x.zona),
              fecha: txt_(x.fecha), hora: txt_(x.hora), nota: txt_(x.nota),
              categoria: txt_(x.categoria), lista: txt_(x.lista),
              lat: num_(x.lat), lon: num_(x.lon),
              nueva: esNueva(x, lunes) ? 'si' : 'no'};
    }),
    semana: {lunes: lunes, nuevas: nuevas.length, semana_pasada: previas.length,
             sin_fecha: sinFecha},
    zonas: Object.keys(zonas).sort(function (a, b) { return zonas[b] - zonas[a]; })
      .map(function (k) { return {zona: k, n: zonas[k]}; }),
    semanas: Object.keys(porSemana).sort().slice(-16)
      .map(function (k) { return {semana: k, n: porSemana[k]}; })};
}

/* ---------- cargar desde los Excel de la carpeta ---------- */

/** Clave de una puerta: dónde está y qué día se tocó. */
function clavePuerta_(x) {
  return redondear_(num_(x.lat), 5) + '|' + redondear_(num_(x.lon), 5) + '|' + txt_(x.fecha);
}

function accImportarPuertas_(u, p) {
  exigirDirectorio_(u);
  const entran = Array.isArray(p.puertas) ? p.puertas : [];
  if (!entran.length) return {ok: true, nuevas: 0, repetidas: 0};

  const ya = {};
  leer_('PUERTAS').forEach(function (x) { ya[clavePuerta_(x)] = true; });

  const hoy = hoyISO_();
  const nuevas = [];
  entran.forEach(function (x) {
    const k = clavePuerta_(x);
    if (ya[k]) return;
    ya[k] = true;
    nuevas.push({lista: txt_(x.lista), nota: txt_(x.nota), categoria: txt_(x.categoria),
                 nombre: txt_(x.nombre), direccion: txt_(x.direccion), zona: txt_(x.zona),
                 fecha: txt_(x.fecha), hora: txt_(x.hora),
                 lat: num_(x.lat), lon: num_(x.lon), alta_crm: hoy});
  });
  añadirFilas_('PUERTAS', nuevas);
  registrar_(u, 'importar_puertas', 'PUERTAS', '', nuevas.length + ' nuevas de ' + entran.length);
  return {ok: true, nuevas: nuevas.length, repetidas: entran.length - nuevas.length,
          total: leer_('PUERTAS').length};
}

function accImportarDirectorio_(u, p) {
  exigirDirectorio_(u);
  const entran = Array.isArray(p.clientes) ? p.clientes : [];
  if (!entran.length) return {ok: true, altas: 0, actualizados: 0};

  const porRef = {};
  leer_('DIRECTORIO').forEach(function (c) { porRef[txt_(c.ref)] = c; });

  const hoy = hoyISO_();
  const campos = ['ref','empresa','nombre','otros','telefono','email','direccion','municipio','cp',
                  'lat','lon','precision','interes','situacion','etiquetas','comerciales','n_visitas',
                  'primera_visita','ultima_visita','importe','producto','financiera','instalador',
                  'n_documentos','carpeta','notas','ultima_actividad'];
  const altas = [];
  let actualizados = 0;
  entran.forEach(function (x) {
    const ref = txt_(x.ref);
    if (!ref) return;
    const fila = {};
    campos.forEach(function (c) { fila[c] = x[c] === undefined || x[c] === null ? '' : x[c]; });
    fila.actualizado = hoy;
    if (porRef[ref]) {
      /* Al actualizar no se pisa con vacío lo que ya estaba: si el Excel de
         esta semana no trae un dato, el que había sigue valiendo. */
      const soloLoQueViene = {actualizado: hoy};
      campos.forEach(function (c) { if (txt_(fila[c]) !== '') soloLoQueViene[c] = fila[c]; });
      actualizar_('DIRECTORIO', porRef[ref].id, soloLoQueViene);
      actualizados++;
    } else {
      fila.alta_crm = hoy;
      altas.push(fila);
      porRef[ref] = fila;
    }
  });
  añadirFilas_('DIRECTORIO', altas);
  registrar_(u, 'importar_directorio', 'DIRECTORIO', '', altas.length + ' altas, ' + actualizados + ' al día');
  return {ok: true, altas: altas.length, actualizados: actualizados, total: leer_('DIRECTORIO').length};
}

function accImportarDirVisitas_(u, p) {
  exigirDirectorio_(u);
  const entran = Array.isArray(p.visitas) ? p.visitas : [];
  if (!entran.length) return {ok: true, nuevas: 0};

  const ya = {};
  leer_('DIR_VISITAS').forEach(function (v) {
    ya[txt_(v.ref) + '|' + txt_(v.fecha) + '|' + txt_(v.hora)] = true; });

  const nuevas = [];
  entran.forEach(function (x) {
    const k = txt_(x.ref) + '|' + txt_(x.fecha) + '|' + txt_(x.hora);
    if (ya[k]) return;
    ya[k] = true;
    nuevas.push({ref: txt_(x.ref), cliente: txt_(x.cliente), empresa: txt_(x.empresa),
                 fecha: txt_(x.fecha), hora: txt_(x.hora), comercial: txt_(x.comercial),
                 etiquetas: txt_(x.etiquetas), tarjeta: txt_(x.tarjeta)});
  });
  añadirFilas_('DIR_VISITAS', nuevas);
  return {ok: true, nuevas: nuevas.length, repetidas: entran.length - nuevas.length};
}

/* ---------- el correo de las puertas nuevas ---------- */

function avisoPuertasSemana(desdeLunes) {
  /* Va a quien puede ver el directorio, que para eso es suyo. Si hay un
     «resumen_a» puesto, manda ese, que es el desvío de toda la casa. */
  const cfg = config_();
  const desvio = txt_(cfg.resumen_a);
  const destino = desvio || leer_('USUARIOS').filter(function (x) {
      return veDirectorio_(x) && normal_(x.activo) === 'si' && txt_(x.email);
    }).map(function (x) { return txt_(x.email); })
      .filter(function (e, i, a) { return a.indexOf(e) === i; }).join(',');
  if (!destino) return {ok: false, error: 'No hay nadie a quien mandárselo.'};

  /* Si lo lanza el disparador un lunes, lo interesante es la semana que
     acaba de cerrarse, de lunes a domingo. Si se pide a mano, la semana en
     curso desde su lunes hasta hoy. */
  const hoy = fecha_(hoyISO_());
  const esLunes = !txt_(desdeLunes) && hoy && hoy.getDay() === 1;
  const lunes = txt_(desdeLunes) || (esLunes
    ? Utilities.formatDate(new Date(hoy.getTime() - 7 * 86400000), zonaHoraria_(), 'yyyy-MM-dd')
    : lunesDe_(hoyISO_()));
  const hasta = esLunes ? hoyISO_() : '';     // el lunes se corta en domingo
  const todas = leer_('PUERTAS');
  const nuevas = todas.filter(function (x) {
    const f = txt_(x.fecha);
    return !!f && f >= lunes && (!hasta || f < hasta); });

  const porZona = {};
  nuevas.forEach(function (x) { const z = txt_(x.zona) || '(sin zona)'; porZona[z] = (porZona[z] || 0) + 1; });
  const zonas = Object.keys(porZona).sort(function (a, b) { return porZona[b] - porZona[a]; });

  const filas = nuevas.slice(0, 40).map(function (x) {
    return '<tr><td style="padding:6px 10px;border-top:1px solid #e3e7e0">' +
      txt_(x.fecha) + (txt_(x.hora) ? ' ' + txt_(x.hora) : '') + '</td>' +
      '<td style="padding:6px 10px;border-top:1px solid #e3e7e0">' + txt_(x.zona) + '</td>' +
      '<td style="padding:6px 10px;border-top:1px solid #e3e7e0">' +
      (txt_(x.nombre) || txt_(x.direccion)) + '</td></tr>';
  }).join('');

  const html =
    '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f3;padding:24px">' +
    '<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e3e7e0;' +
    'border-radius:14px;overflow:hidden">' +
      '<div style="background:#242422;padding:18px 22px">' +
        '<img src="' + LOGO_CORREO + '" alt="ZERO WATTIOS" style="height:26px">' +
        '<div style="color:#b4fa1e;font-size:11px;letter-spacing:.14em;text-transform:uppercase;' +
        'margin-top:6px">Puertas de la semana</div>' +
      '</div>' +
      '<div style="padding:22px">' +
        '<h2 style="margin:0 0 4px;font-size:19px;color:#17191c">' + nuevas.length +
        ' puertas nuevas</h2>' +
        '<p style="margin:0 0 16px;color:#5b6159;font-size:13.5px">' +
        (hasta ? 'Semana del ' + lunes + ' al ' + hasta : 'Desde el lunes ' + lunes) +
        '. En total llevamos ' + todas.length + ' puertas tocadas.</p>' +
        (zonas.length ? '<p style="margin:0 0 16px;font-size:13.5px">' + zonas.map(function (z) {
          return '<b>' + z + '</b> ' + porZona[z]; }).join(' · ') + '</p>' : '') +
        (filas ? '<table style="width:100%;border-collapse:collapse;font-size:13px">' + filas +
          '</table>' : '<p style="font-size:13.5px">Esta semana no se ha tocado ninguna puerta nueva.</p>') +
        (nuevas.length > 40 ? '<p style="margin:12px 0 0;color:#8b918a;font-size:12.5px">Y ' +
          (nuevas.length - 40) + ' más, que están todas en el CRM.</p>' : '') +
        '<p style="margin:20px 0 0;font-size:13px">' +
        '<a href="' + WEB_CRM + '#directorio" style="color:#17191c;font-weight:600">' +
        'Abrir el directorio</a></p>' +
      '</div>' +
      '<div style="padding:14px 22px;border-top:1px solid #e3e7e0;color:#8b918a;font-size:11.5px">' +
      'ZERO WATTIOS INGENIERÍA, S.L. · Correo automático del CRM, no hace falta contestar.' +
      '</div>' +
    '</div></div>';

  MailApp.sendEmail({to: destino, subject: 'Puertas nuevas de la semana · ' + nuevas.length,
                     htmlBody: html, name: 'CRM ZERO WATTIOS'});
  Logger.log('Aviso de puertas enviado a ' + destino + ': ' + nuevas.length + ' nuevas');
  return {ok: true, nuevas: nuevas.length, destino: destino};
}

function accAvisoPuertas_(u, p) {
  exigirDirectorio_(u);
  return {ok: true, resultado: avisoPuertasSemana(txt_(p.desde))};
}
