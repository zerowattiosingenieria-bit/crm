/**
 * CRM · ZERO WATTIOS
 * 22_Ficha.gs — Un cliente, una ficha (02/11/2026).
 *
 * Orden de Nando: «todo tiene que estar enlazado, sin duplicar cosas y
 * fácil de introducir». La revisión de los datos reales dio clientes
 * repetidos (mismo teléfono o misma casa), clientes con varias citas de las
 * que el CRM solo miraba la primera, el interés apuntado en dos sitios con
 * números distintos y fichas borradas que dejaban sueltos sus apuntes.
 *
 *  - Al dar de alta se busca si el cliente ya está (teléfono o dirección).
 *    Si está, no se crea otro: se avisa con su ficha, y si es una cita de un
 *    captador, la cita se apunta en el cliente que ya existía.
 *  - Dirección puede fusionar dos fichas: todo lo de una pasa a la otra.
 *  - La cita que manda es la última (o la de la instalación), no la primera.
 *  - El interés y el estado que deja una cita pasan al cliente: un solo dato.
 *  - Un cliente con cosas enlazadas no se borra: se fusiona.
 */

/* ---------- duplicados ---------- */

function telefono9_(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}

/* La calle sin «calle», «avenida», signos ni espacios: «C/ Gerifalte, 15» = «calle gerifalte 15». */
function direccionClave_(dir) {
  const n = normal_(dir)
    .replace(/\b(calle|c|cl|avenida|avda|av|plaza|pza|pl|paseo|po|camino|cm|urb|urbanizacion|carretera|ctra)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '');
  return /\d/.test(n) && n.length >= 6 ? n : '';
}

/** El cliente que ya existe con ese teléfono o esa dirección (o null). */
function buscarDuplicado_(d, salvoId, todos) {
  const tel = telefono9_(d.telefono);
  const dir = direccionClave_(d.direccion);
  if (!tel && !dir) return null;
  const mun = normal_(d.municipio);
  const lista = todos || leer_('CLIENTES');
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    if (salvoId && String(c.id) === String(salvoId)) continue;
    if (tel && telefono9_(c.telefono) === tel) return {cliente: c, por: 'teléfono'};
  }
  if (!dir) return null;
  for (let j = 0; j < lista.length; j++) {
    const k = lista[j];
    if (salvoId && String(k.id) === String(salvoId)) continue;
    if (direccionClave_(k.direccion) !== dir) continue;
    const mk = normal_(k.municipio);
    if (!mun || !mk || mun === mk) return {cliente: k, por: 'dirección'};
  }
  return null;
}

function etiquetaDuplicado_(u, dup) {
  const c = dup.cliente;
  const visible = veCliente_(u, c);
  return {
    id: c.id, por: dup.por, visible: visible,
    etiqueta: visible ? [txt_(c.direccion), txt_(c.nombre)].filter(String).join(' · ') : 'cliente de otro compañero',
    comercial: nombreUsuario_(c.comercial_id)
  };
}

function nombreUsuario_(id, usuarios) {
  if (!txt_(id)) return '';
  const x = (usuarios || leer_('USUARIOS')).filter(function (v) { return String(v.id) === String(id); })[0];
  return x ? txt_(x.nombre) : '';
}

/* Las tablas que cuelgan de un cliente (todas las que tienen cliente_id). */
function tablasDeCliente_() {
  return Object.keys(ESQUEMA).filter(function (t) {
    return t !== 'CLIENTES' && ESQUEMA[t].indexOf('cliente_id') >= 0;
  });
}

function enlazadosDe_(clienteId) {
  return conteoEnlazados_()[String(clienteId)] || {};
}

/* Cuántas cosas cuelgan de cada cliente, leyendo cada tabla una sola vez. */
function conteoEnlazados_() {
  const r = {};
  tablasDeCliente_().forEach(function (t) {
    leer_(t).forEach(function (x) {
      const k = String(x.cliente_id || '');
      if (!k) return;
      r[k] = r[k] || {};
      r[k][t] = (r[k][t] || 0) + 1;
    });
  });
  return r;
}

/** Dirección: grupos de fichas que parecen el mismo cliente. */
function accDuplicados_(u, p) {
  exigir_(u, 'editarTodo');
  const C = leer_('CLIENTES');
  const grupos = {};
  const add = function (k, c, por) { if (!k) return; (grupos[por + '|' + k] = grupos[por + '|' + k] || []).push(c); };
  C.forEach(function (c) {
    add(telefono9_(c.telefono), c, 'teléfono');
    /* Por calle sin mirar el municipio: muchas fichas viejas no lo tienen.
       Si son de pueblos distintos, se ve en la lista y no se fusionan. */
    add(direccionClave_(c.direccion), c, 'dirección');
  });
  const vistos = {};
  const lista = [];
  const cuenta = conteoEnlazados_();
  const U = leer_('USUARIOS');
  Object.keys(grupos).forEach(function (k) {
    const g = grupos[k];
    if (g.length < 2) return;
    const clave = g.map(function (c) { return c.id; }).sort().join('+');
    if (vistos[clave]) return;
    vistos[clave] = 1;
    lista.push({por: k.split('|')[0], clientes: g.map(function (c) {
      return {id: c.id, nombre: c.nombre, direccion: c.direccion, municipio: c.municipio, telefono: c.telefono,
              estado: c.estado, comercial: nombreUsuario_(c.comercial_id, U), creado: c.creado,
              enlazados: cuenta[String(c.id)] || {}};
    })});
  });
  return {ok: true, grupos: lista};
}

/**
 * Dirección: pasa todo lo de «origen» a «destino» y borra «origen».
 * Lo que la ficha buena tenga vacío se rellena con lo de la otra; las notas
 * se juntan. Las citas, instalaciones, apuntes, facturas, archivos y tareas
 * pasan tal cual. Si las dos tenían proyecto, se queda el de destino con
 * los archivos y la descripción de los dos.
 */
function accFusionarClientes_(u, p) {
  exigir_(u, 'editarTodo');
  const C = leer_('CLIENTES');
  const o = C.filter(function (c) { return String(c.id) === String(p.origen); })[0];
  const d = C.filter(function (c) { return String(c.id) === String(p.destino); })[0];
  if (!o || !d) return {ok: false, error: 'Falta una de las dos fichas.'};
  if (String(o.id) === String(d.id)) return {ok: false, error: 'Es la misma ficha.'};

  const cambios = {modificado: ahora_(), modificado_por: u.id};
  ESQUEMA.CLIENTES.forEach(function (k) {
    if (['id', 'creado', 'creado_por', 'modificado', 'modificado_por', 'perfil', 'otros'].indexOf(k) >= 0) return;
    if (!txt_(d[k]) && txt_(o[k])) cambios[k] = o[k];
  });
  ['perfil', 'otros'].forEach(function (k) {
    const a = txt_(d[k]), b = txt_(o[k]);
    if (b && normal_(a).indexOf(normal_(b)) < 0) cambios[k] = a ? a + '\n' + b : b;
  });
  /* Se queda la ficha más antigua como fecha de alta. */
  if (txt_(o.creado) && txt_(o.creado) < txt_(d.creado)) cambios.creado = o.creado;
  actualizar_('CLIENTES', d.id, cambios);

  /* Proyecto: uno por cliente. */
  const P = leer_('PROYECTOS');
  const po = P.filter(function (x) { return String(x.cliente_id) === String(o.id); })[0];
  const pd = P.filter(function (x) { return String(x.cliente_id) === String(d.id); })[0];
  if (po && pd) {
    leer_('ARCHIVOS').filter(function (a) { return String(a.proyecto_id) === String(po.id); })
      .forEach(function (a) { actualizar_('ARCHIVOS', a.id, {proyecto_id: pd.id, cliente_id: d.id}); });
    const desc = [txt_(pd.descripcion), txt_(po.descripcion)].filter(String).join('\n\n');
    actualizar_('PROYECTOS', pd.id, {descripcion: desc});
    borrar_('PROYECTOS', po.id);
  }

  const movidos = {};
  tablasDeCliente_().forEach(function (t) {
    if (ESQUEMA[t].indexOf('id') < 0) return;
    leer_(t).filter(function (x) { return String(x.cliente_id) === String(o.id); }).forEach(function (x) {
      actualizar_(t, x.id, {cliente_id: d.id});
      movidos[t] = (movidos[t] || 0) + 1;
    });
  });
  borrar_('CLIENTES', o.id);
  registrar_(u, 'fusionar_cliente', 'CLIENTES', d.id, o.id + ' → ' + d.id + ' ' + JSON.stringify(movidos));
  const r = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(d.id); })[0];
  return {ok: true, cliente: clienteParaVer_(u, r), movidos: movidos};
}

/* ---------- la cita que manda ---------- */

/** La cita de un cliente que cuenta: la de esa instalación, si no la última. */
function captacionActual_(clienteId, operacionId) {
  const lista = leer_('CAPTACIONES').filter(function (c) { return String(c.cliente_id) === String(clienteId); });
  if (!lista.length) return null;
  if (operacionId) {
    const de = lista.filter(function (c) { return String(c.operacion_id) === String(operacionId); })[0];
    if (de) return de;
  }
  const clave = function (c) { return txt_(c.fecha).slice(0, 10) + ' ' + txt_(c.hora_cita) + ' ' + txt_(c.creado); };
  return lista.slice().sort(function (a, b) { return clave(b) < clave(a) ? -1 : (clave(b) > clave(a) ? 1 : 0); })[0];
}

/* Estado del cliente según el resultado de su cita, solo hacia delante. */
const ORDEN_ESTADO_ = ['nuevo', 'captado', 'frio', 'cita', 'sentada', 'propuesta', 'negociando', 'ganado'];

/**
 * Lo que una cita deja en el cliente: el interés (un solo dato, el del
 * cliente) y el estado, solo si avanza (una sentada no deshace un «propuesta»).
 */
function sincronizarCaptacionCliente_(u, cap, cli) {
  if (!cap || !cli) return;
  const cambios = {};
  if (txt_(cap.interes) && Number(cap.interes) !== Number(cli.interes)) cambios.interes = cap.interes;
  const res = normal_(cap.resultado);
  const actual = normal_(cli.estado);
  let nuevo = '';
  if (res === 'sentada' || res === 'potencial') nuevo = 'sentada';
  if (res === 'no_sentada' && actual === 'cita') nuevo = 'captado';
  if (nuevo && actual !== 'perdido' && actual !== 'ganado' &&
      (res === 'no_sentada' || ORDEN_ESTADO_.indexOf(nuevo) > ORDEN_ESTADO_.indexOf(actual))) {
    cambios.estado = nuevo;
    cambios.fecha_estado = hoyISO_();
  }
  if (Object.keys(cambios).length) {
    cambios.modificado = ahora_();
    cambios.modificado_por = u.id;
    actualizar_('CLIENTES', cli.id, cambios);
  }
}
