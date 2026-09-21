/**
 * 08_Nominas.gs — Nómina de cada persona, con desglose por días y fechas.
 *
 * Cada uno ve la suya; superadmin y administradores ven las de todos.
 * La nómina se compone de sueldo bruto, dietas y comisiones devengadas
 * en el periodo (del 16 al 15, que es como se computan los objetivos),
 * y se abona a final de mes.
 */

function accNominas_(u, p) {
  const per = permisos_(u);
  const objetivoId = txt_(p.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !per.nominasAjenas) {
    return {ok: false, error: 'Solo puedes ver tu propia nómina.'};
  }
  const nominas = leer_('NOMINAS').filter(function (n) { return String(n.usuario_id) === String(objetivoId); })
    .sort(function (a, b) { return txt_(b.periodo).localeCompare(txt_(a.periodo)); });
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  return {ok: true, nominas: nominas, persona: persona ? publicoConNomina_(persona) : null};
}

/**
 * Desglose día a día entre dos fechas: qué se devenga cada jornada,
 * qué dietas corresponden, qué comisiones han caído y qué hizo ese día.
 */
function accNominaDias_(u, p) {
  const per = permisos_(u);
  const objetivoId = txt_(p.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !per.nominasAjenas) {
    return {ok: false, error: 'Solo puedes ver tu propio desglose.'};
  }
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || (hasta.slice(0, 8) + '01');

  const bruto = num_(persona.salario_bruto);
  const dietasMes = num_(persona.dietas_mes);
  const jornadaH = num_(persona.jornada_horas) || 7.5;

  const jornadas = indexar_(leer_('JORNADAS').filter(function (j) {
    return String(j.usuario_id) === String(objetivoId); }), 'fecha');

  const partes = indexar_(leer_('PARTES').filter(function (x) {
    return String(x.usuario_id) === String(objetivoId); }), 'fecha');

  const operaciones = leer_('OPERACIONES').filter(function (o) {
    return String(o.comercial_id) === String(objetivoId) && esGanada_(o); });
  const captaciones = leer_('CAPTACIONES').filter(function (c) {
    return String(c.captador_id) === String(objetivoId) && normal_(c.resultado) === 'venta'; });

  const cfg = config_();
  const cFV = num_(persona.comision_fv) || num_(cfg.comision_fv);
  const cAero = num_(persona.comision_aero) || num_(cfg.comision_aero);
  const cCap = num_(cfg.comision_captacion);

  const comisionDia = {};
  operaciones.forEach(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    const t = normal_(o.tipo);
    let c = 0;
    if (t === 'fv' || t === 'fv_aero') c += cFV;
    if (t === 'aero' || t === 'fv_aero') c += cAero;
    if (!c) return;
    if (!comisionDia[f]) comisionDia[f] = {importe: 0, conceptos: []};
    comisionDia[f].importe += c;
    comisionDia[f].conceptos.push((o.referencia || o.id) + ' · ' + c + ' €');
  });
  captaciones.forEach(function (c) {
    const f = txt_(c.fecha_resultado) || txt_(c.fecha);
    if (!comisionDia[f]) comisionDia[f] = {importe: 0, conceptos: []};
    comisionDia[f].importe += cCap;
    comisionDia[f].conceptos.push('Captación ' + c.id + ' · ' + cCap + ' €');
  });

  /* Días laborables del mes de referencia, para prorratear. */
  const dias = [];
  let cursor = desde;
  let guardia = 0;
  const totales = {devengo: 0, dietas: 0, comisiones: 0, horas: 0, laborables: 0,
                   sentadas: 0, puertas: 0, fichas: 0, ventas: 0};

  while (cursor <= hasta && guardia++ < 400) {
    const d = fecha_(cursor);
    const finde = d.getDay() === 0 || d.getDay() === 6;
    const j = jornadas[cursor];
    const tipo = j ? txt_(j.tipo) : (finde ? 'libre' : 'trabajado');
    const laborable = tipo === 'trabajado';
    const labMes = diasLaborables_(cursor.slice(0, 7));
    const devengo = laborable ? redondear_(bruto / labMes, 2) : 0;
    const dieta = laborable ? redondear_(dietasMes / labMes, 2) : 0;
    const com = comisionDia[cursor] ? redondear_(comisionDia[cursor].importe, 2) : 0;
    const parte = partes[cursor];

    dias.push({
      fecha: cursor,
      dia_semana: ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d.getDay()],
      tipo: tipo, horas: laborable ? (j ? num_(j.horas) || jornadaH : jornadaH) : 0,
      devengo: devengo, dietas: dieta, comisiones: com,
      concepto_comision: comisionDia[cursor] ? comisionDia[cursor].conceptos.join(' · ') : '',
      total_dia: redondear_(devengo + dieta + com, 2),
      sentadas: parte ? num_(parte.sentadas) : 0,
      puertas: parte ? num_(parte.puertas) : 0,
      fichas: parte ? num_(parte.fichas) : 0,
      ventas: parte ? num_(parte.ventas) : 0,
      parte: parte ? txt_(parte.resumen).slice(0, 180) : '',
      notas: j ? txt_(j.notas) : ''
    });

    totales.devengo += devengo; totales.dietas += dieta; totales.comisiones += com;
    totales.horas += laborable ? jornadaH : 0;
    totales.laborables += laborable ? 1 : 0;
    if (parte) {
      totales.sentadas += num_(parte.sentadas);
      totales.puertas += num_(parte.puertas);
      totales.fichas += num_(parte.fichas);
      totales.ventas += num_(parte.ventas);
    }
    cursor = sumarDias_(cursor, 1);
  }

  Object.keys(totales).forEach(function (k) { totales[k] = redondear_(totales[k], 2); });
  totales.bruto_periodo = redondear_(totales.devengo + totales.dietas + totales.comisiones, 2);
  const irpf = redondear_(totales.bruto_periodo * num_(persona.irpf_pct) / 100, 2);
  const ss = redondear_((totales.devengo) * num_(persona.ss_pct) / 100, 2);
  totales.irpf = irpf; totales.ss = ss;
  totales.neto_periodo = redondear_(totales.bruto_periodo - irpf - ss, 2);

  return {ok: true, persona: publicoConNomina_(persona), desde: desde, hasta: hasta,
          dias: dias, totales: totales};
}

function diasLaborables_(mesISO) {
  const anio = Number(mesISO.slice(0, 4)), mes = Number(mesISO.slice(5, 7));
  const ultimo = new Date(anio, mes, 0).getDate();
  let n = 0;
  for (let d = 1; d <= ultimo; d++) {
    const dia = new Date(anio, mes - 1, d).getDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return n || 21;
}

/** Genera (o rehace) la nómina de un periodo. Solo administradores. */
function accGenerarNomina_(u, p) {
  exigir_(u, 'nominasAjenas');
  const objetivoId = txt_(p.usuario_id);
  const periodo = txt_(p.periodo) || mesDe_(hoyISO_());
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  /* Comisiones del 16 del mes anterior al 15 del mes de la nómina. */
  const anio = Number(periodo.slice(0, 4)), mes = Number(periodo.slice(5, 7));
  const iniC = new Date(anio, mes - 2, 16);
  const finC = new Date(anio, mes - 1, 15);
  const desdeC = Utilities.formatDate(iniC, zonaHoraria_(), 'yyyy-MM-dd');
  const hastaC = Utilities.formatDate(finC, zonaHoraria_(), 'yyyy-MM-dd');

  const ganadas = leer_('OPERACIONES').filter(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    return String(o.comercial_id) === String(objetivoId) && esGanada_(o) && f >= desdeC && f <= hastaC;
  });
  const capVenta = leer_('CAPTACIONES').filter(function (c) {
    const f = txt_(c.fecha_resultado) || txt_(c.fecha);
    return String(c.captador_id) === String(objetivoId) && normal_(c.resultado) === 'venta' &&
           f >= desdeC && f <= hastaC;
  });
  const com = comisionesDe_(persona, ganadas, capVenta,
    ventasDeSuEquipo_(persona, desdeC, hastaC));

  const bruto = num_(persona.salario_bruto);
  const dietas = num_(persona.dietas_mes);
  const otros = num_(p.otros);
  const brutoTotal = redondear_(bruto + dietas + com.total + otros, 2);
  const irpfPct = num_(persona.irpf_pct), ssPct = num_(persona.ss_pct);
  const irpf = redondear_(brutoTotal * irpfPct / 100, 2);
  const ss = redondear_(bruto * ssPct / 100, 2);
  const neto = redondear_(brutoTotal - irpf - ss, 2);

  const detalle = {comisiones: com.detalle, periodo_comisiones: {desde: desdeC, hasta: hastaC}};
  const existente = leer_('NOMINAS').filter(function (n) {
    return String(n.usuario_id) === String(objetivoId) && txt_(n.periodo) === periodo; })[0];

  const datos = {usuario_id: objetivoId, periodo: periodo, bruto: bruto, dietas: dietas,
    comisiones: com.total, otros: otros, bruto_total: brutoTotal, irpf_pct: irpfPct, irpf: irpf,
    ss_pct: ssPct, ss: ss, neto: neto, estado: existente ? existente.estado : 'pendiente',
    fecha_pago: existente ? existente.fecha_pago : '', url: existente ? existente.url : '',
    detalle: JSON.stringify(detalle), notas: txt_(p.notas)};

  const r = existente ? actualizar_('NOMINAS', existente.id, datos)
                      : insertar_('NOMINAS', Object.assign({creado: ahora_()}, datos));
  registrar_(u, 'nomina', 'NOMINAS', r.id, persona.usuario + ' ' + periodo);
  return {ok: true, nomina: r};
}

function accGuardarNomina_(u, p) {
  exigir_(u, 'nominasAjenas');
  const d = p.nomina || {};
  const campos = ['estado','fecha_pago','url','notas','otros','bruto','dietas','comisiones',
                  'irpf_pct','ss_pct'];
  const cambios = {};
  campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
  if (cambios.bruto !== undefined || cambios.otros !== undefined || cambios.comisiones !== undefined) {
    const actual = leer_('NOMINAS').filter(function (n) { return String(n.id) === String(d.id); })[0] || {};
    const bruto = num_(cambios.bruto !== undefined ? cambios.bruto : actual.bruto);
    const dietas = num_(cambios.dietas !== undefined ? cambios.dietas : actual.dietas);
    const com = num_(cambios.comisiones !== undefined ? cambios.comisiones : actual.comisiones);
    const otros = num_(cambios.otros !== undefined ? cambios.otros : actual.otros);
    const bt = redondear_(bruto + dietas + com + otros, 2);
    const irpf = redondear_(bt * num_(cambios.irpf_pct !== undefined ? cambios.irpf_pct : actual.irpf_pct) / 100, 2);
    const ss = redondear_(bruto * num_(cambios.ss_pct !== undefined ? cambios.ss_pct : actual.ss_pct) / 100, 2);
    cambios.bruto_total = bt; cambios.irpf = irpf; cambios.ss = ss;
    cambios.neto = redondear_(bt - irpf - ss, 2);
  }
  const r = actualizar_('NOMINAS', d.id, cambios);
  registrar_(u, 'editar_nomina', 'NOMINAS', d.id, cambios.estado || '');
  return {ok: true, nomina: r};
}

/** Vacaciones, bajas y festivos: quien los apunta es quien manda. */
function accGuardarJornada_(u, p) {
  const d = p.jornada || {};
  const objetivoId = txt_(d.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !permisos_(u).nominasAjenas) {
    return {ok: false, error: 'No puedes tocar el calendario de otra persona.'};
  }
  const existente = leer_('JORNADAS').filter(function (j) {
    return String(j.usuario_id) === String(objetivoId) && txt_(j.fecha) === txt_(d.fecha); })[0];
  const datos = {usuario_id: objetivoId, fecha: txt_(d.fecha), tipo: txt_(d.tipo) || 'trabajado',
    horas: num_(d.horas), dietas: num_(d.dietas), comisiones: num_(d.comisiones),
    concepto: txt_(d.concepto), notas: txt_(d.notas)};
  const r = existente ? actualizar_('JORNADAS', existente.id, datos) : insertar_('JORNADAS', datos);
  return {ok: true, jornada: r};
}

/* ================= la nómina en PDF ================= */
/*
 * Rubén y Fernando suben cada mes el PDF de la nómina de cada persona.
 * El archivo se guarda en una carpeta del Drive de la empresa y NO se
 * comparte con nadie: para verlo hay que pedirlo por aquí, y el servidor
 * solo lo entrega a su dueño o a dirección.
 */

function carpetaNominas_() {
  const id = PROPS.getProperty('ID_CARPETA_NOMINAS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  const nombre = 'NÓMINAS · CRM ZERO WATTIOS';
  const busca = DriveApp.getFoldersByName(nombre);
  const carpeta = busca.hasNext() ? busca.next() : DriveApp.createFolder(nombre);
  PROPS.setProperty('ID_CARPETA_NOMINAS', carpeta.getId());
  return carpeta;
}

/** Sube (o reemplaza) el PDF de la nómina de una persona en un mes. */
function accSubirNomina_(u, p) {
  exigir_(u, 'nominasAjenas');
  const objetivoId = txt_(p.usuario_id);
  const periodo = txt_(p.periodo);
  const datos = txt_(p.datos);
  if (!objetivoId || !/^\d{4}-\d{2}$/.test(periodo)) {
    return {ok: false, error: 'Falta la persona o el periodo (aaaa-mm).'};
  }
  if (!datos) return {ok: false, error: 'No ha llegado el archivo.'};

  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  const tipo = txt_(p.tipo) || 'application/pdf';
  const nombre = 'Nomina_' + normal_(persona.usuario).replace(/\s+/g, '_') + '_' + periodo + '.pdf';
  const blob = Utilities.newBlob(Utilities.base64Decode(datos), tipo, nombre);
  const archivo = carpetaNominas_().createFile(blob);

  const existente = leer_('NOMINAS').filter(function (n) {
    return String(n.usuario_id) === String(objetivoId) && txt_(n.periodo) === periodo; })[0];

  /* Si ya había un PDF para ese mes, el viejo se manda a la papelera. */
  if (existente && txt_(existente.archivo_id)) {
    try { DriveApp.getFileById(txt_(existente.archivo_id)).setTrashed(true); } catch (e) {}
  }

  const datosFila = {
    usuario_id: objetivoId, periodo: periodo,
    archivo_id: archivo.getId(), archivo_nombre: nombre,
    subida_por: u.id, subida_fecha: ahora_(),
    estado: txt_(p.estado) || (existente ? txt_(existente.estado) : 'pagada'),
    fecha_pago: txt_(p.fecha_pago) || (existente ? txt_(existente.fecha_pago) : ''),
    neto: p.neto !== undefined && txt_(p.neto) !== '' ? num_(p.neto) : (existente ? num_(existente.neto) : ''),
    notas: txt_(p.notas) || (existente ? txt_(existente.notas) : '')
  };

  const r = existente ? actualizar_('NOMINAS', existente.id, datosFila)
                      : insertar_('NOMINAS', Object.assign({creado: ahora_()}, datosFila));
  registrar_(u, 'subir_nomina', 'NOMINAS', r.id, persona.usuario + ' ' + periodo);
  return {ok: true, nomina: r};
}

/** Devuelve el PDF en base64, solo a su dueño o a dirección. */
function accDescargarNomina_(u, p) {
  const n = leer_('NOMINAS').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!n) return {ok: false, error: 'No existe esa nómina.'};
  if (String(n.usuario_id) !== String(u.id) && !permisos_(u).nominasAjenas) {
    return {ok: false, error: 'Esa nómina no es tuya.'};
  }
  if (!txt_(n.archivo_id)) return {ok: false, error: 'Esa nómina todavía no tiene PDF subido.'};
  let archivo;
  try { archivo = DriveApp.getFileById(txt_(n.archivo_id)); }
  catch (e) { return {ok: false, error: 'El archivo ya no está en el Drive de la empresa.'}; }
  registrar_(u, 'ver_nomina', 'NOMINAS', n.id, txt_(n.periodo));
  return {ok: true, nombre: txt_(n.archivo_nombre) || archivo.getName(),
          tipo: archivo.getMimeType(),
          datos: Utilities.base64Encode(archivo.getBlob().getBytes())};
}

/** Quita la nómina de un mes (y su PDF). Solo dirección. */
function accBorrarNomina_(u, p) {
  exigir_(u, 'nominasAjenas');
  const n = leer_('NOMINAS').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!n) return {ok: false, error: 'No existe esa nómina.'};
  if (txt_(n.archivo_id)) {
    try { DriveApp.getFileById(txt_(n.archivo_id)).setTrashed(true); } catch (e) {}
  }
  borrar_('NOMINAS', p.id);
  registrar_(u, 'borrar_nomina', 'NOMINAS', p.id, txt_(n.periodo));
  return {ok: true};
}
