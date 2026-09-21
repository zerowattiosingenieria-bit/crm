/**
 * 09_Mapa.gs — Mapa de clientes visitados. Solo dirección.
 *
 * Devuelve un punto por cliente con todo lo que hace falta para
 * decidir dónde merece la pena volver: estado, tecnología, gasto
 * energético, interés, quién lo lleva y qué se vendió.
 */

function soloDireccion_(u) {
  if (permisos_(u).alcance !== 'todo') {
    throw new Error('El mapa de clientes es solo para dirección.');
  }
}

function accMapa_(u, p) {
  soloDireccion_(u);
  const clientes = leer_('CLIENTES');
  const operaciones = leer_('OPERACIONES');
  const captaciones = leer_('CAPTACIONES');
  const usuarios = indexar_(leer_('USUARIOS'));
  const seguimiento = leer_('SEGUIMIENTO');

  const opPorCliente = {};
  operaciones.forEach(function (o) {
    const k = String(o.cliente_id);
    if (!opPorCliente[k] || esGanada_(o)) opPorCliente[k] = o;
  });
  const capPorCliente = indexar_(captaciones, 'cliente_id');
  const ultimoContacto = {};
  seguimiento.forEach(function (s) {
    const k = String(s.cliente_id);
    if (!ultimoContacto[k] || ultimoContacto[k] < txt_(s.fecha)) ultimoContacto[k] = txt_(s.fecha);
  });

  const puntos = [];
  let sinCoordenadas = 0;

  clientes.forEach(function (c) {
    const co = coordenadas_(c.coordenadas);
    if (!co) { sinCoordenadas++; return; }
    const op = opPorCliente[String(c.id)];
    const cap = capPorCliente[String(c.id)];
    puntos.push({
      id: c.id, nombre: c.nombre, lat: co[0], lng: co[1],
      direccion: c.direccion, municipio: c.municipio, cp: c.cp,
      telefono: c.telefono, email: c.email,
      estado: c.estado, fecha_estado: c.fecha_estado, origen: c.origen,
      comercial: (usuarios[String(c.comercial_id)] || {}).nombre || '',
      comercial_id: c.comercial_id,
      captador: (usuarios[String(c.captador_id)] || {}).nombre || '',
      captador_id: c.captador_id,
      interes: num_(c.interes), m2: num_(c.m2), personas: num_(c.personas),
      tipo_vivienda: c.tipo_vivienda, calefaccion: c.calefaccion,
      gasto_luz_mes: num_(c.gasto_luz_mes),
      gasto_combustible: num_(c.gasto_combustible),
      periodo_combustible: c.periodo_combustible,
      gasto_anual: gastoAnual_(c),
      creado: c.creado, ultimo_contacto: ultimoContacto[String(c.id)] || '',
      proxima_accion: c.proxima_accion, proxima_fecha: c.proxima_fecha,
      perfil: c.perfil,
      tecnologia: cap ? cap.tecnologia : (op ? op.tipo : ''),
      operacion: op ? {id: op.id, referencia: op.referencia, tipo: op.tipo, estado: op.estado,
        total: num_(op.total), fecha_firma: op.fecha_firma, fecha_instalacion: op.fecha_instalacion,
        paneles: num_(op.paneles_num), aero_kw: num_(op.aero_kw), bateria_kwh: num_(op.bateria_kwh)} : null
    });
  });

  /* Resumen por municipio, para las zonas calientes. */
  const mun = {};
  puntos.forEach(function (x) {
    const k = txt_(x.municipio) || 'Sin municipio';
    if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, gasto: 0, lat: 0, lng: 0};
    const m = mun[k];
    m.clientes += 1; m.gasto += x.gasto_anual; m.lat += x.lat; m.lng += x.lng;
    if (x.operacion && ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada']
        .indexOf(normal_(x.operacion.estado)) >= 0) {
      m.ventas += 1; m.importe += x.operacion.total;
    }
  });
  const municipios = Object.keys(mun).map(function (k) {
    const m = mun[k];
    return {municipio: k, clientes: m.clientes, ventas: m.ventas,
            importe: redondear_(m.importe, 2), conversion: pct_(m.ventas, m.clientes),
            gasto_medio: redondear_(m.gasto / m.clientes, 0),
            lat: redondear_(m.lat / m.clientes, 6), lng: redondear_(m.lng / m.clientes, 6)};
  }).sort(function (a, b) { return b.clientes - a.clientes; });

  return {ok: true, puntos: puntos, municipios: municipios,
          sin_coordenadas: sinCoordenadas, total: clientes.length};
}

function gastoAnual_(c) {
  const luz = num_(c.gasto_luz_mes) * 12;
  const comb = num_(c.gasto_combustible);
  const per = normal_(c.periodo_combustible);
  const combAnual = per === 'al mes' ? comb * 12 : (per === 'por deposito' || per === 'por depósito' ? comb * 2 : comb);
  return redondear_(luz + combAnual, 0);
}

function coordenadas_(v) {
  const s = txt_(v).replace(/\s/g, '');
  if (!s) return null;
  const p = s.split(',');
  if (p.length !== 2) return null;
  const lat = parseFloat(p[0]), lng = parseFloat(p[1]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [redondear_(lat, 6), redondear_(lng, 6)];
}

/**
 * Busca las coordenadas de los clientes que no las tienen, a partir de
 * su dirección. Va de 20 en 20 para no agotar el tiempo de ejecución.
 */
function accGeocodificar_(u, p) {
  soloDireccion_(u);
  const limite = Math.min(num_(p.limite) || 20, 40);
  const pendientes = leer_('CLIENTES').filter(function (c) {
    return !coordenadas_(c.coordenadas) && txt_(c.direccion);
  }).slice(0, limite);

  let hechos = 0, fallos = 0;
  const geo = Maps.newGeocoder().setRegion('es');
  pendientes.forEach(function (c) {
    const dir = [txt_(c.direccion), txt_(c.municipio), txt_(c.cp), 'España']
      .filter(String).join(', ');
    try {
      const r = geo.geocode(dir);
      if (r.status === 'OK' && r.results && r.results.length) {
        const loc = r.results[0].geometry.location;
        actualizar_('CLIENTES', c.id, {coordenadas: redondear_(loc.lat, 6) + ',' + redondear_(loc.lng, 6)});
        hechos++;
      } else { fallos++; }
    } catch (e) { fallos++; }
    Utilities.sleep(120);
  });
  registrar_(u, 'geocodificar', 'CLIENTES', '', hechos + ' de ' + pendientes.length);
  const quedan = leer_('CLIENTES').filter(function (c) {
    return !coordenadas_(c.coordenadas) && txt_(c.direccion); }).length;
  return {ok: true, hechos: hechos, fallos: fallos, pendientes: quedan};
}
