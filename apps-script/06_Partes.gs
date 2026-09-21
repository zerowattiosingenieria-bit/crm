/**
 * 06_Partes.gs — Parte diario del equipo y lectura automática del resumen.
 *
 * Al final del día, el captador dice cuántas puertas y cuántas fichas ha
 * hecho; el comercial dice cuántas sentadas ha tenido y con quién, y
 * escribe un resumen en lenguaje normal. El servidor lee ese resumen,
 * reconoce a los clientes y propone cambios de estado, próximos pasos y
 * fechas. Nada se aplica sin que la persona lo confirme.
 */

function accGuardarParte_(u, p) {
  const d = p.parte || {};
  const fecha = txt_(d.fecha) || hoyISO_();
  const existente = leer_('PARTES').filter(function (x) {
    return String(x.usuario_id) === String(u.id) && txt_(x.fecha) === fecha;
  })[0];

  /* Las fichas de captación del día se cuentan solas. */
  const fichasHoy = leer_('CAPTACIONES').filter(function (c) {
    return String(c.captador_id) === String(u.id) && txt_(c.fecha) === fecha;
  }).length;

  const sentadas = Array.isArray(d.sentadas_detalle) ? d.sentadas_detalle : [];
  const analisis = analizarResumen_(u, txt_(d.resumen), fecha);

  const datos = {
    fecha: fecha, usuario_id: u.id, rol: u.rol,
    visitas: num_(d.visitas), puertas: num_(d.puertas), fichas: fichasHoy,
    sentadas: sentadas.length || num_(d.sentadas),
    sentadas_detalle: JSON.stringify(sentadas),
    ventas: num_(d.ventas), importe_vendido: num_(d.importe_vendido),
    resumen: txt_(d.resumen), analisis: JSON.stringify(analisis),
    estado: 'enviado', modificado: ahora_()
  };

  let r;
  if (existente) {
    datos.propuestas_aplicadas = existente.propuestas_aplicadas;
    r = actualizar_('PARTES', existente.id, datos);
  } else {
    datos.creado = ahora_();
    datos.propuestas_aplicadas = '';
    r = insertar_('PARTES', datos);
  }
  registrar_(u, 'parte_diario', 'PARTES', r.id, fecha);
  return {ok: true, parte: r, analisis: analisis};
}

/** Aplica las propuestas que la persona ha confirmado. */
function accAplicarParte_(u, p) {
  const parte = leer_('PARTES').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!parte) return {ok: false, error: 'No existe ese parte.'};
  if (String(parte.usuario_id) !== String(u.id) && !permisos_(u).editarTodo) {
    return {ok: false, error: 'Ese parte no es tuyo.'};
  }
  const cambios = p.cambios || [];
  const aplicados = [];
  cambios.forEach(function (c) {
    const cli = leer_('CLIENTES').filter(function (x) { return String(x.id) === String(c.cliente_id); })[0];
    if (!cli || !veCliente_(u, cli)) return;
    const upd = {modificado: ahora_(), modificado_por: u.id};
    if (c.estado) { upd.estado = c.estado; upd.fecha_estado = txt_(parte.fecha); }
    if (c.proximo_paso) upd.proxima_accion = c.proximo_paso;
    if (c.proxima_fecha) upd.proxima_fecha = c.proxima_fecha;
    actualizar_('CLIENTES', cli.id, upd);
    insertar_('SEGUIMIENTO', {
      cliente_id: cli.id, operacion_id: c.operacion_id || '', usuario_id: u.id,
      fecha: txt_(parte.fecha), canal: c.canal || 'visita',
      nota: txt_(c.nota) || 'Anotado en el parte diario.',
      proximo_paso: txt_(c.proximo_paso), proxima_fecha: txt_(c.proxima_fecha),
      estado_resultante: txt_(c.estado), origen: 'parte', creado: ahora_()
    });
    aplicados.push(cli.id);
  });
  actualizar_('PARTES', parte.id, {propuestas_aplicadas: JSON.stringify(aplicados), estado: 'aplicado'});
  registrar_(u, 'aplicar_parte', 'PARTES', parte.id, aplicados.join(','));
  return {ok: true, aplicados: aplicados};
}

function accPartes_(u, p) {
  const per = permisos_(u);
  const desde = txt_(p.desde) || sumarDias_(hoyISO_(), -30);
  const hasta = txt_(p.hasta) || hoyISO_();
  let partes = leer_('PARTES').filter(function (x) {
    return txt_(x.fecha) >= desde && txt_(x.fecha) <= hasta;
  });
  if (!per.partesAjenos) {
    partes = partes.filter(function (x) { return String(x.usuario_id) === String(u.id); });
  } else if (p.usuario_id) {
    partes = partes.filter(function (x) { return String(x.usuario_id) === String(p.usuario_id); });
  }
  partes.sort(function (a, b) { return txt_(b.fecha).localeCompare(txt_(a.fecha)); });
  return {ok: true, partes: partes};
}

/* ================= lectura del resumen escrito ================= */

/* Lo que dice el comercial -> lo que significa para la ficha del cliente. */
const REGLAS_ESTADO = [
  {estado: 'ganado', claves: ['firmado','firmamos','firma el contrato','cerrado','cerramos','vendido',
      'vendida','acepta la propuesta','acepta el presupuesto','me da el si','me da el sí','adelante con la obra',
      'contrato firmado','se lo queda']},
  {estado: 'perdido', claves: ['no interesa','no le interesa','descartado','descartamos','se cae',
      'se ha caido','se ha caído','no sigue adelante','ha dicho que no','nos dice que no','perdido',
      'se va con otra','ha contratado a otra','lo deja','no quiere']},
  {estado: 'negociando', claves: ['se lo piensa','lo va a pensar','pide descuento','esta negociando',
      'está negociando','quiere rebaja','compara presupuestos','duda','pendiente de decidir',
      'le tengo que ajustar','pide mejorar precio','consultarlo con']},
  {estado: 'propuesta', claves: ['le mando la propuesta','propuesta enviada','presupuesto enviado',
      'le envio el presupuesto','le envío el presupuesto','mandada la oferta','oferta enviada',
      'le paso la propuesta','enviada la propuesta']},
  {estado: 'sentada', claves: ['sentada','he estado en casa de','visita realizada','estuve con',
      'he visitado','hemos visitado','visita hecha']},
  {estado: 'cita', claves: ['cita concertada','quedamos el','concertada la visita','me recibe el',
      'visita el']},
  {estado: 'frio', claves: ['en frio','en frío','lo dejamos aparcado','para mas adelante',
      'para más adelante','ahora no','el año que viene','despues del verano','después del verano']}
];

/* Pistas de que hay que volver a llamar. */
const REGLAS_PASO = [
  {paso: 'Llamar para cerrar', claves: ['llamar para cerrar','cerrar por telefono','cerrar por teléfono','llamada de cierre']},
  {paso: 'Volver a llamar', claves: ['volver a llamar','le llamo','llamarle','rellamada','le vuelvo a llamar','llamar']},
  {paso: 'Enviar propuesta', claves: ['mandar propuesta','enviar propuesta','preparar presupuesto','pasar presupuesto','hacer la oferta']},
  {paso: 'Segunda visita', claves: ['segunda visita','volver a casa','volver a la vivienda','ir otra vez']},
  {paso: 'Pendiente de financiación', claves: ['financiacion','financiación','banco','cetelem','estudio de financiera','scoring']},
  {paso: 'Pendiente de documentación', claves: ['falta el dni','manda el dni','falta la factura de la luz','cups','documentacion','documentación']},
  {paso: 'Visita técnica', claves: ['visita tecnica','visita técnica','medir','replanteo','ver el tejado']}
];

const DIAS_SEMANA = [['domingo',0],['lunes',1],['martes',2],['miercoles',3],['miércoles',3],
  ['jueves',4],['viernes',5],['sabado',6],['sábado',6]];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
  'septiembre','octubre','noviembre','diciembre'];

/**
 * Lee el resumen, localiza a los clientes de esa persona por su nombre y
 * propone cambios. Devuelve propuestas, nunca cambios hechos.
 */
function analizarResumen_(u, texto, fechaParte) {
  const limpio = normal_(texto);
  if (!limpio) return {frases: [], propuestas: [], avisos: []};

  const clientes = misClientes_(u);
  const operaciones = misOperaciones_(u);
  const opPorCliente = {};
  operaciones.forEach(function (o) { opPorCliente[String(o.cliente_id)] = o; });

  /* Se parte por frases: cada una suele hablar de un cliente. */
  const frases = String(texto).split(/(?:\.|;|\n|\r|•|·)+/)
    .map(function (f) { return f.trim(); })
    .filter(function (f) { return f.length > 3; });

  const propuestas = [];
  const avisos = [];

  let ultimos = [];   // de quién se venía hablando en la frase anterior
  frases.forEach(function (frase) {
    const f = normal_(frase);
    let encontrados = clientes.filter(function (c) { return mencionado_(f, c); });
    const estado = estadoDe_(f);
    const paso = pasoDe_(f);
    const fecha = fechaDe_(f, fechaParte);
    let heredado = false;

    if (!encontrados.length) {
      /* "Le llamo el lunes" suele seguir hablando del cliente anterior. */
      if (ultimos.length && (estado || paso || fecha)) {
        encontrados = ultimos;
        heredado = true;
      } else {
        if (/(firm|cerr|vend|no interesa|propuesta|presupuesto)/.test(f)) {
          avisos.push('No he reconocido a ningún cliente tuyo en: "' + frase.trim() + '"');
        }
        return;
      }
    } else {
      ultimos = encontrados;
    }

    encontrados.forEach(function (c) {
      if (!estado && !paso && !fecha) return;
      const op = opPorCliente[String(c.id)];
      propuestas.push({
        cliente_id: c.id, cliente: c.nombre, operacion_id: op ? op.id : '',
        estado_actual: c.estado, estado: estado && estado !== c.estado ? estado : '',
        proximo_paso: paso || '', proxima_fecha: fecha || '',
        nota: frase.trim(), canal: /llama|telefono|teléfono/.test(f) ? 'llamada'
              : (/whatsapp|wasap/.test(f) ? 'whatsapp' : (/correo|email|mail/.test(f) ? 'email' : 'visita')),
        confianza: (estado ? 2 : 0) + (paso ? 1 : 0) + (fecha ? 1 : 0) - (heredado ? 1 : 0)
      });
    });
  });

  /* Si dos frases hablan del mismo cliente, manda la de más confianza. */
  const porCliente = {};
  propuestas.forEach(function (p) {
    const k = String(p.cliente_id);
    if (!porCliente[k] || porCliente[k].confianza < p.confianza) porCliente[k] = p;
    else {
      if (!porCliente[k].estado && p.estado) porCliente[k].estado = p.estado;
      if (!porCliente[k].proximo_paso && p.proximo_paso) porCliente[k].proximo_paso = p.proximo_paso;
      if (!porCliente[k].proxima_fecha && p.proxima_fecha) porCliente[k].proxima_fecha = p.proxima_fecha;
    }
  });

  const lista = Object.keys(porCliente).map(function (k) { return porCliente[k]; })
    .filter(function (p) { return p.estado || p.proximo_paso || p.proxima_fecha; })
    .sort(function (a, b) { return b.confianza - a.confianza; });

  return {frases: frases, propuestas: lista, avisos: avisos};
}

/** ¿Se está hablando de este cliente? Por nombre, apellido o dirección. */
function mencionado_(fraseNormal, cliente) {
  const nombre = normal_(cliente.nombre);
  if (!nombre) return false;
  if (fraseNormal.indexOf(nombre) >= 0) return true;
  const partes = nombre.split(' ').filter(function (x) { return x.length >= 4; });
  /* Con el nombre de pila basta si es razonablemente distintivo. */
  const aciertos = partes.filter(function (x) {
    return new RegExp('(^|[^a-z0-9])' + x + '([^a-z0-9]|$)').test(fraseNormal);
  }).length;
  if (aciertos >= 1 && partes.length === 1) return true;
  if (aciertos >= 1 && fraseNormal.indexOf(partes[0]) >= 0) return true;
  const dir = normal_(cliente.direccion);
  if (dir.length > 8 && fraseNormal.indexOf(dir) >= 0) return true;
  return false;
}

function estadoDe_(f) {
  for (let i = 0; i < REGLAS_ESTADO.length; i++) {
    const r = REGLAS_ESTADO[i];
    for (let j = 0; j < r.claves.length; j++) {
      if (f.indexOf(r.claves[j]) >= 0) return r.estado;
    }
  }
  return '';
}

function pasoDe_(f) {
  for (let i = 0; i < REGLAS_PASO.length; i++) {
    const r = REGLAS_PASO[i];
    for (let j = 0; j < r.claves.length; j++) {
      if (f.indexOf(r.claves[j]) >= 0) return r.paso;
    }
  }
  return '';
}

/** Saca una fecha de expresiones normales: mañana, el lunes, el 3 de octubre, 12/10. */
function fechaDe_(f, referenciaISO) {
  const ref = referenciaISO || hoyISO_();

  if (/\bhoy\b/.test(f)) return ref;
  if (/\bmanana\b|\bmañana\b/.test(f)) return sumarDias_(ref, 1);
  if (/pasado manana|pasado mañana/.test(f)) return sumarDias_(ref, 2);
  if (/semana que viene|proxima semana|próxima semana/.test(f)) return sumarDias_(ref, 7);
  if (/en quince dias|en 15 dias|dos semanas/.test(f)) return sumarDias_(ref, 14);
  if (/mes que viene|proximo mes|próximo mes/.test(f)) return sumarDias_(ref, 30);

  let m = f.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    const d = Number(m[1]), mes = Number(m[2]);
    let anio = m[3] ? Number(m[3]) : Number(ref.slice(0, 4));
    if (anio < 100) anio += 2000;
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) {
      const iso = anio + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      return iso < ref && !m[3] ? (anio + 1) + iso.slice(4) : iso;
    }
  }

  m = f.match(/\b(\d{1,2})\s+de\s+([a-z]+)/);
  if (m) {
    const d = Number(m[1]);
    const mes = MESES.indexOf(m[2]);
    if (mes >= 0 && d >= 1 && d <= 31) {
      const anio = Number(ref.slice(0, 4));
      const iso = anio + '-' + String(mes + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      return iso < ref ? (anio + 1) + iso.slice(4) : iso;
    }
  }

  for (let i = 0; i < DIAS_SEMANA.length; i++) {
    if (new RegExp('\\b' + DIAS_SEMANA[i][0] + '\\b').test(f)) {
      const objetivo = DIAS_SEMANA[i][1];
      const base = fecha_(ref) || new Date();
      let dias = (objetivo - base.getDay() + 7) % 7;
      if (dias === 0) dias = 7;
      return sumarDias_(ref, dias);
    }
  }
  return '';
}

/** Relee un parte ya guardado (por si se ha corregido el texto). */
function accReanalizar_(u, p) {
  const parte = leer_('PARTES').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!parte) return {ok: false, error: 'No existe ese parte.'};
  if (String(parte.usuario_id) !== String(u.id) && !permisos_(u).partesAjenos) {
    return {ok: false, error: 'Ese parte no es tuyo.'};
  }
  const analisis = analizarResumen_(u, txt_(p.resumen) || txt_(parte.resumen), txt_(parte.fecha));
  actualizar_('PARTES', parte.id, {analisis: JSON.stringify(analisis),
    resumen: txt_(p.resumen) || txt_(parte.resumen), modificado: ahora_()});
  return {ok: true, analisis: analisis};
}
