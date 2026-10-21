/**
 * 19_Tablero.gs — El tablero de cada uno y las cifras del Centro de Mando.
 *
 * Dos cosas que hasta ahora vivían fuera del CRM:
 *
 * 1. LAS CIFRAS. El Centro de Mando lleva las cifras buenas de la casa
 *    (cobrado en banco, firmado, operaciones del objetivo, facturado del
 *    mes…). El CRM calculaba las suyas por su cuenta y no siempre salía lo
 *    mismo. Ahora el agente del panel las vuelca aquí tres veces al día y
 *    el CRM enseña las dos columnas juntas: la del panel, la que sale de
 *    sus propias hojas y la diferencia. Lo que no cuadra se ve en el acto
 *    y se sabe qué falta meter.
 *
 * 2. LAS TAREAS. Cada uno entra y ve lo suyo: contabilidad y administración
 *    lo de Rubén, las aprobaciones y decisiones lo de dirección, y el resto
 *    lo que le hayan asignado. Las escribe el agente del Centro de Mando
 *    (origen "panel") o la propia dirección desde el CRM.
 *
 * Nadie ve tareas de otra área: se filtran en el servidor, no en el
 * navegador.
 */

const AREAS = ['direccion', 'contabilidad', 'comercial', 'captacion'];
const ESTADOS_TAREA = ['pendiente', 'en_curso', 'hecha', 'descartada'];

/** El puesto de una persona. Si no está escrito, se deduce del rol. */
function areaDe_(u) {
  const a = normal_(u && u.area);
  if (AREAS.indexOf(a) >= 0) return a;
  if (!u) return 'direccion';
  if (u.rol === 'comercial') return 'comercial';
  if (u.rol === 'captador') return 'captacion';
  return 'direccion';
}

function asegurarTablero_() {
  asegurarHoja_('CIFRAS');
  asegurarHoja_('TAREAS');
}

/* =========================================================================
   LAS CIFRAS
   ========================================================================= */

/* Lo que el agente del Centro de Mando vuelca en cada ronda. El CRM calcula
   su propia versión de las que llevan «crm» y enseña las dos. */
function catalogoCifras_() {
  return [
    {clave: 'cobrado', grupo: 'Objetivo 2026', titulo: 'Cobrado en banco',
     unidad: 'eur', orden: 1, crm: 'cobrado'},
    {clave: 'firmado', grupo: 'Objetivo 2026', titulo: 'Vendido en firme',
     unidad: 'eur', orden: 2, crm: 'firmado'},
    {clave: 'operaciones', grupo: 'Objetivo 2026', titulo: 'Operaciones',
     unidad: 'n', orden: 3, crm: 'operaciones'},
    {clave: 'clientes_vendidos', grupo: 'Objetivo 2026', titulo: 'Clientes vendidos',
     unidad: 'n', orden: 4, crm: 'clientes_vendidos'},
    {clave: 'ticket_medio', grupo: 'Objetivo 2026', titulo: 'Ticket medio',
     unidad: 'eur', orden: 5, crm: 'ticket_medio'},
    {clave: 'facturado_mes', grupo: 'Del mes', titulo: 'Facturado del mes',
     unidad: 'eur', orden: 6, crm: 'facturado_mes'},
    {clave: 'facturas_mes', grupo: 'Del mes', titulo: 'Facturas emitidas',
     unidad: 'n', orden: 7, crm: 'facturas_mes'},
    {clave: 'pendiente_cobro', grupo: 'Por cobrar', titulo: 'Pendiente de cobro',
     unidad: 'eur', orden: 8, crm: 'pendiente_cobro'},
    {clave: 'en_cierre', grupo: 'Por cerrar', titulo: 'En cierre',
     unidad: 'eur', orden: 9, crm: 'en_cierre'},
    {clave: 'en_cierre_n', grupo: 'Por cerrar', titulo: 'Operaciones en cierre',
     unidad: 'n', orden: 10, crm: 'en_cierre_n'},
    {clave: 'ops_aerotermia', grupo: 'Objetivo 2026', titulo: 'Con aerotermia',
     unidad: 'n', orden: 11, crm: 'ops_aerotermia'},
    {clave: 'ops_fv', grupo: 'Objetivo 2026', titulo: 'Con fotovoltaica',
     unidad: 'n', orden: 12, crm: 'ops_fv'},
    {clave: 'vendido_pendiente_cobro', grupo: 'Por cobrar',
     titulo: 'Vendido pendiente de cobrar', unidad: 'eur', orden: 13}
  ];
}

/** ¿Cuenta esta operación como vendida? (lo mismo que mira contabilidad) */
function esVendida_(op) {
  return ['cancelada', 'propuesta', 'financiacion'].indexOf(normal_(op.estado)) < 0;
}

/**
 * Las mismas cifras, calculadas con lo que hay hoy en las hojas del CRM.
 * Si falta un cobro o una factura por meter, aquí sale más bajo que en el
 * panel, y esa diferencia es justo lo que hay que arreglar.
 */
function cifrasDelCrm_(refISO) {
  const hoy = txt_(refISO) || hoyISO_();
  const anyo = hoy.slice(0, 4);
  const mes = mesDe_(hoy);

  const operaciones = leer_('OPERACIONES');
  const cobros = leer_('COBROS');
  const facturas = leer_('FACTURAS');

  const vendidas = operaciones.filter(esVendida_);
  const enCierre = operaciones.filter(function (o) {
    return ['propuesta', 'financiacion'].indexOf(normal_(o.estado)) >= 0;
  });

  const clientes = {};
  vendidas.forEach(function (o) { if (txt_(o.cliente_id)) clientes[txt_(o.cliente_id)] = true; });

  const aero = vendidas.filter(function (o) { return num_(o.importe_aero) > 0; }).length;
  const fv = vendidas.filter(function (o) { return num_(o.importe_fv) > 0; }).length;

  const firmado = vendidas.reduce(function (a, o) { return a + num_(o.total); }, 0);
  const nClientes = Object.keys(clientes).length;
  const facturasMes = facturas.filter(function (f) { return mesDe_(txt_(f.fecha_emision)) === mes; });

  return {
    cobrado: redondear_(cobros.filter(function (c) {
      return txt_(c.fecha_cobro).slice(0, 4) === anyo;
    }).reduce(function (a, c) { return a + num_(c.importe); }, 0), 2),
    firmado: redondear_(firmado, 2),
    operaciones: aero + fv,
    ops_aerotermia: aero,
    ops_fv: fv,
    clientes_vendidos: nClientes,
    ticket_medio: nClientes ? redondear_(firmado / nClientes, 2) : 0,
    facturado_mes: redondear_(facturasMes.reduce(function (a, f) { return a + num_(f.total); }, 0), 2),
    facturas_mes: facturasMes.length,
    pendiente_cobro: redondear_(cobros.filter(function (c) { return !txt_(c.fecha_cobro); })
      .reduce(function (a, c) { return a + num_(c.importe); }, 0), 2),
    en_cierre: redondear_(enCierre.reduce(function (a, o) { return a + num_(o.total); }, 0), 2),
    en_cierre_n: enCierre.length
  };
}

/** Diferencia que ya merece mirarse: un euro en dinero, una unidad en cuentas. */
function descuadra_(unidad, panel, crm) {
  if (panel === null || panel === undefined || panel === '') return false;
  const d = Math.abs(num_(panel) - num_(crm));
  return unidad === 'eur' ? d >= 1 : d >= 1;
}

/** Reescribe una fila entera (para las tablas que no llevan id, como CIFRAS). */
function escribirFila_(nombre, fila, obj) {
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  const actual = h.getRange(fila, 1, 1, cab.length).getValues()[0];
  cab.forEach(function (c, j) {
    if (Object.prototype.hasOwnProperty.call(obj, c)) actual[j] = obj[c];
  });
  h.getRange(fila, 1, 1, cab.length).setValues([actual]);
  return obj;
}

function accCifras_(u, p) {
  exigir_(u, 'finanzas');
  asegurarTablero_();
  const guardadas = indexar_(leer_('CIFRAS'), 'clave');
  const delCrm = cifrasDelCrm_(txt_(p && p.hasta));

  const lista = catalogoCifras_().map(function (c) {
    const g = guardadas[c.clave] || {};
    const tienePanel = txt_(g.valor) !== '';
    const panel = tienePanel ? num_(g.valor) : null;
    const crm = c.crm ? num_(delCrm[c.crm]) : null;
    return {
      clave: c.clave,
      grupo: txt_(g.grupo) || c.grupo,
      titulo: txt_(g.titulo) || c.titulo,
      unidad: txt_(g.unidad) || c.unidad,
      orden: num_(g.orden) || c.orden,
      panel: panel,
      crm: crm,
      meta: num_(g.meta) || 0,
      nota: txt_(g.nota),
      fecha: txt_(g.fecha),
      actualizado: txt_(g.actualizado),
      diferencia: (panel === null || crm === null) ? null : redondear_(panel - crm, 2),
      descuadre: crm === null ? false : descuadra_(txt_(g.unidad) || c.unidad, panel, crm)
    };
  });

  /* Cifras que el panel manda y el CRM no sabe calcular: se enseñan igual. */
  const conocidas = {};
  lista.forEach(function (x) { conocidas[x.clave] = true; });
  leer_('CIFRAS').forEach(function (g) {
    if (conocidas[txt_(g.clave)]) return;
    lista.push({
      clave: txt_(g.clave), grupo: txt_(g.grupo) || 'Otras', titulo: txt_(g.titulo) || txt_(g.clave),
      unidad: txt_(g.unidad) || 'n', orden: num_(g.orden) || 90,
      panel: txt_(g.valor) === '' ? null : num_(g.valor), crm: null,
      meta: num_(g.meta) || 0, nota: txt_(g.nota), fecha: txt_(g.fecha),
      actualizado: txt_(g.actualizado), diferencia: null, descuadre: false
    });
  });

  lista.sort(function (a, b) { return a.orden - b.orden; });
  const ultima = lista.reduce(function (a, x) {
    return txt_(x.actualizado) > a ? txt_(x.actualizado) : a;
  }, '');

  return {
    ok: true, cifras: lista, crm: delCrm,
    descuadres: lista.filter(function (x) { return x.descuadre; }).length,
    actualizado: ultima
  };
}

/**
 * Lo que escribe el agente del Centro de Mando en cada ronda.
 * p.cifras = [{clave, valor, titulo, grupo, unidad, meta, nota, fecha}, …]
 */
function accGuardarCifras_(u, p) {
  exigir_(u, 'editarTodo');
  asegurarTablero_();
  const pedidas = (p && p.cifras) || (p && p.cifra ? [p.cifra] : []);
  if (!pedidas.length) return {ok: false, error: 'No has mandado ninguna cifra.'};

  const guardadas = indexar_(leer_('CIFRAS'), 'clave');
  const catalogo = indexar_(catalogoCifras_(), 'clave');
  const ahora = ahora_();
  let nuevas = 0, cambiadas = 0;

  pedidas.forEach(function (c) {
    const clave = txt_(c.clave);
    if (!clave) return;
    const base = catalogo[clave] || {};
    const fila = {
      clave: clave,
      grupo: txt_(c.grupo) || txt_((guardadas[clave] || {}).grupo) || txt_(base.grupo) || 'Otras',
      titulo: txt_(c.titulo) || txt_((guardadas[clave] || {}).titulo) || txt_(base.titulo) || clave,
      unidad: txt_(c.unidad) || txt_((guardadas[clave] || {}).unidad) || txt_(base.unidad) || 'n',
      valor: c.valor === undefined || c.valor === null ? '' : num_(c.valor),
      meta: c.meta === undefined ? num_((guardadas[clave] || {}).meta) : num_(c.meta),
      nota: c.nota === undefined ? txt_((guardadas[clave] || {}).nota) : txt_(c.nota),
      fecha: txt_(c.fecha) || hoyISO_(),
      orden: c.orden === undefined ? (num_((guardadas[clave] || {}).orden) || num_(base.orden) || 90)
                                   : num_(c.orden),
      actualizado: ahora,
      actualizado_por: u.id
    };
    const vieja = guardadas[clave];
    if (vieja) { escribirFila_('CIFRAS', vieja._fila, fila); cambiadas++; }
    else { insertar_('CIFRAS', fila); nuevas++; }
  });

  registrar_(u, 'guardar_cifras', 'CIFRAS', '',
    nuevas + ' nuevas, ' + cambiadas + ' actualizadas');
  return {ok: true, nuevas: nuevas, cambiadas: cambiadas};
}

/* =========================================================================
   LAS TAREAS
   ========================================================================= */

/** ¿Le toca a esta persona? */
function tareaMia_(u, t) {
  if (txt_(t.usuario_id)) return String(t.usuario_id) === String(u.id);
  return normal_(t.area) === areaDe_(u);
}

function tareaPublica_(t, clientes, usuarios) {
  const cli = clientes[String(t.cliente_id)] || {};
  const pers = usuarios[String(t.usuario_id)] || {};
  return {
    id: t.id, area: normal_(t.area), usuario_id: txt_(t.usuario_id), usuario: txt_(pers.nombre),
    titulo: txt_(t.titulo), detalle: txt_(t.detalle),
    cliente_id: txt_(t.cliente_id), cliente: txt_(cli.nombre),
    importe: num_(t.importe), prioridad: normal_(t.prioridad) || 'normal',
    vence: txt_(t.vence), estado: normal_(t.estado) || 'pendiente',
    origen: txt_(t.origen), origen_id: txt_(t.origen_id),
    creado: txt_(t.creado), hecho: txt_(t.hecho)
  };
}

function accTareas_(u, p) {
  asegurarTablero_();
  const per = permisos_(u);
  const clientes = indexar_(leer_('CLIENTES'));
  const usuarios = indexar_(leer_('USUARIOS'));
  const todas = p && p.todas && per.alcance === 'todo';
  const cerradas = !!(p && p.cerradas);

  const lista = leer_('TAREAS').filter(function (t) {
    if (!cerradas && ['hecha', 'descartada'].indexOf(normal_(t.estado) || 'pendiente') >= 0) return false;
    return todas || tareaMia_(u, t);
  }).map(function (t) { return tareaPublica_(t, clientes, usuarios); });

  /* Lo que vence antes, primero; y dentro del mismo día, lo urgente. */
  const peso = {urgente: 0, alta: 1, normal: 2, baja: 3};
  lista.sort(function (a, b) {
    const fa = a.vence || '9999-12-31', fb = b.vence || '9999-12-31';
    if (fa !== fb) return fa < fb ? -1 : 1;
    return (peso[a.prioridad] === undefined ? 2 : peso[a.prioridad]) -
           (peso[b.prioridad] === undefined ? 2 : peso[b.prioridad]);
  });

  return {ok: true, tareas: lista, area: areaDe_(u), puede_asignar: !!per.editarTodo};
}

/**
 * Crea o cambia una tarea.
 * - Dirección puede crear, asignar y cambiarlo todo.
 * - Los demás solo pueden mover el estado de las suyas y añadir detalle.
 * - Si llega con origen + origen_id y no existe, se crea; si existe, se
 *   actualiza. Así el agente del panel puede repetir el volcado sin
 *   duplicar nada.
 */
function accGuardarTarea_(u, p) {
  asegurarTablero_();
  const per = permisos_(u);
  const d = (p && p.tarea) || {};
  const todas = leer_('TAREAS');

  let actual = null;
  if (txt_(d.id)) {
    actual = todas.filter(function (t) { return String(t.id) === txt_(d.id); })[0];
    if (!actual) return {ok: false, error: 'Esa tarea ya no existe.'};
  } else if (txt_(d.origen) && txt_(d.origen_id)) {
    actual = todas.filter(function (t) {
      return normal_(t.origen) === normal_(d.origen) && txt_(t.origen_id) === txt_(d.origen_id);
    })[0] || null;
  }

  if (!per.editarTodo) {
    if (!actual) return {ok: false, error: 'Las tareas las reparte dirección.'};
    if (!tareaMia_(u, actual)) return {ok: false, error: 'Esa tarea no es tuya.'};
  }

  const cambios = {};
  const libres = ['titulo', 'detalle', 'area', 'usuario_id', 'cliente_id', 'importe',
                  'prioridad', 'vence', 'estado', 'origen', 'origen_id'];
  const mios = ['detalle', 'estado'];
  (per.editarTodo ? libres : mios).forEach(function (c) {
    if (d[c] !== undefined) cambios[c] = c === 'importe' ? num_(d[c]) : txt_(d[c]);
  });

  if (cambios.area && AREAS.indexOf(normal_(cambios.area)) < 0) {
    return {ok: false, error: 'Esa área no existe.'};
  }
  if (cambios.estado && ESTADOS_TAREA.indexOf(normal_(cambios.estado)) < 0) {
    return {ok: false, error: 'Ese estado de tarea no existe.'};
  }
  if (cambios.estado) {
    cambios.estado = normal_(cambios.estado);
    if (['hecha', 'descartada'].indexOf(cambios.estado) >= 0) {
      cambios.hecho = ahora_();
      cambios.hecho_por = u.id;
    } else {
      cambios.hecho = '';
      cambios.hecho_por = '';
    }
  }
  cambios.modificado = ahora_();
  cambios.modificado_por = u.id;

  if (actual) {
    const r = actualizar_('TAREAS', actual.id, cambios);
    registrar_(u, 'editar_tarea', 'TAREAS', actual.id, cambios);
    return {ok: true, tarea: tareaPublica_(r, indexar_(leer_('CLIENTES')), indexar_(leer_('USUARIOS')))};
  }

  if (!txt_(cambios.titulo)) return {ok: false, error: 'La tarea necesita un título.'};
  cambios.area = normal_(cambios.area) || (txt_(cambios.usuario_id) ? '' : 'direccion');
  if (!cambios.area && txt_(cambios.usuario_id)) {
    const dueno = leer_('USUARIOS').filter(function (x) {
      return String(x.id) === txt_(cambios.usuario_id);
    })[0];
    cambios.area = areaDe_(dueno);
  }
  cambios.estado = cambios.estado || 'pendiente';
  cambios.prioridad = normal_(cambios.prioridad) || 'normal';
  cambios.creado = ahora_();
  cambios.creado_por = u.id;
  const nueva = insertar_('TAREAS', cambios);
  registrar_(u, 'alta_tarea', 'TAREAS', nueva.id, {titulo: cambios.titulo, area: cambios.area});
  return {ok: true, tarea: tareaPublica_(nueva, indexar_(leer_('CLIENTES')), indexar_(leer_('USUARIOS')))};
}

/** Marcar una tarea (hecha, en curso, otra vez pendiente…). */
function accEstadoTarea_(u, p) {
  return accGuardarTarea_(u, {tarea: {id: txt_(p && p.id), estado: txt_(p && p.estado) || 'hecha'}});
}

function accBorrarTarea_(u, p) {
  exigir_(u, 'editarTodo');
  asegurarTablero_();
  const id = txt_(p && p.id);
  if (!id) return {ok: false, error: 'No has dicho qué tarea borrar.'};
  const n = borrarVarios_('TAREAS', [id]);
  registrar_(u, 'borrar_tarea', 'TAREAS', id, '');
  return {ok: n > 0, borradas: n};
}

/* =========================================================================
   PUESTOS — se ejecuta UNA VEZ desde el editor al instalar esta versión
   ========================================================================= */

/**
 * Deja escrito el puesto de cada uno en la columna «area» de USUARIOS,
 * que es la que decide qué ve cada persona en su pestaña «Mi tablero».
 *
 * Por defecto va por el rol (comercial → comercial, captador → captación,
 * administrador y superadmin → dirección). La única excepción es Rubén,
 * que lleva contabilidad y administración (orden de Nando del 21/10/2026).
 * A partir de aquí se cambia desde Usuarios, sin tocar código.
 */
function ponerPuestos() {
  asegurarHoja_('USUARIOS');
  const hechos = [];
  leer_('USUARIOS').forEach(function (x) {
    if (txt_(x.area)) return;
    const area = normal_(x.nombre).indexOf('ruben') === 0 && x.rol === 'admin'
      ? 'contabilidad' : areaDe_(x);
    actualizar_('USUARIOS', x.id, {area: area});
    hechos.push(x.nombre + ' → ' + area);
  });
  Logger.log(hechos.length ? hechos.join('\n') : 'Ya estaban todos puestos.');
  return hechos;
}
