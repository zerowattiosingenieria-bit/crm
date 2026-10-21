/* vistas/tablero.js — «Mi tablero»: lo que tiene que hacer cada uno y cómo
 * va lo suyo, de un vistazo.
 *
 * Cuatro pantallas distintas según el puesto:
 *   dirección     · cifras de la casa, lo que no cuadra con el Centro de
 *                   Mando, y lo que hay que decidir o aprobar
 *   contabilidad  · las tareas de contabilidad y administración, con el
 *                   dinero del mes y el cuadre
 *   comercial     · su cartera, su agenda y lo que se le está pasando
 *   captador      · sus captaciones, su ritmo y en qué fase va cada cliente
 */

import {h, txt, num, eur, eurCorto, miles, pct, fechaCorta, hoyISO, sumarDias,
        dias, normal, capital} from '../util.js';
import * as api from '../api.js';
import {kpi, kpis, tarjeta, tabla, marca, etiquetaEstado, aviso, avisoError} from '../ui.js';
import {barras, embudo, progreso} from '../graficos.js';

const TITULOS = {
  direccion: 'Tareas y aprobaciones',
  contabilidad: 'Tareas de contabilidad y administración',
  comercial: 'Mi cartera y mi agenda',
  captacion: 'Mis captaciones'
};

const PIES = {
  direccion: 'Lo que tienes que decidir y lo que no cuadra con el Centro de Mando.',
  contabilidad: 'Lo que hay que hacer hoy y cómo va el dinero del mes.',
  comercial: 'Tus clientes, tu semana y lo que se te está pasando.',
  captacion: 'Cómo vas de fichas y qué ha sido de la gente que has captado.'
};

export function areaDe(usuario) {
  const a = normal(usuario && usuario.area);
  if (['direccion', 'contabilidad', 'comercial', 'captacion'].includes(a)) return a;
  if (!usuario) return 'direccion';
  if (usuario.rol === 'comercial') return 'comercial';
  if (usuario.rol === 'captador') return 'captacion';
  return 'direccion';
}

export const tituloTablero = usuario => TITULOS[areaDe(usuario)] || 'Mi tablero';

export async function vistaTablero({ir, refrescar}) {
  const u = api.estado.usuario;
  const area = areaDe(u);
  const conCifras = api.esDireccion();

  const [tar, res, cif] = await Promise.all([
    api.tareas().catch(() => ({tareas: [], area})),
    api.pedir('resumen').catch(() => ({resumen: null})),
    conCifras ? api.cifras().catch(() => null) : Promise.resolve(null)
  ]);

  const mias = tar.tareas || [];
  const r = res.resumen;
  const recarga = () => refrescar ? refrescar() : null;

  /* El título ya está arriba, en la barra: aquí solo la frase que dice de
     qué va la pantalla. */
  const cabecera = h('div', {estilo: {marginBottom: '16px'}},
    h('p.nota', PIES[area]));

  if (area === 'direccion') return h('div', cabecera, ...panelDireccion({mias, cif, ir, recarga}));
  if (area === 'contabilidad') return h('div', cabecera, ...panelContabilidad({mias, cif, ir, recarga}));
  if (area === 'captacion') return h('div', cabecera, ...panelCaptador({mias, r, ir, recarga}));
  return h('div', cabecera, ...panelComercial({mias, r, ir, recarga}));
}

/* ======================= lo común: las tareas ========================= */

const PRIORIDAD = {urgente: 'mal', alta: 'aviso', normal: '', baja: 'info'};

function diaDe(t) {
  const hoy = hoyISO();
  if (!t.vence) return 'sin fecha';
  if (t.vence < hoy) return 'vencidas';
  if (t.vence === hoy) return 'hoy';
  if (t.vence <= sumarDias(hoy, 7)) return 'esta semana';
  return 'más adelante';
}

const ORDEN_DIAS = ['vencidas', 'hoy', 'esta semana', 'más adelante', 'sin fecha'];

function lineaTarea(t, {ir, recarga}) {
  const hoy = hoyISO();
  const nivel = t.vence && t.vence < hoy ? 'alto' : (t.vence === hoy ? 'medio' : 'bajo');

  const marcar = async (estado) => {
    try {
      await api.estadoTarea(t.id, estado);
      aviso(estado === 'hecha' ? 'Tarea hecha.' : 'Tarea en curso.');
      await recarga();
    } catch (e) { avisoError(e); }
  };

  return h('li.zw-tarea',
    h('span.nivel.' + nivel),
    h('div', {estilo: {flex: '1', minWidth: '0'}},
      h('b', t.titulo),
      t.detalle ? h('div.nota', t.detalle) : null,
      h('div.zw-tarea-pies',
        t.vence ? marca(fechaCorta(t.vence), t.vence < hoy ? 'mal' : '') : null,
        t.prioridad && t.prioridad !== 'normal' ? marca(capital(t.prioridad), PRIORIDAD[t.prioridad]) : null,
        t.importe ? marca(eur(t.importe)) : null,
        t.cliente ? h('a.zw-enlace', {onclick: () => ir('cliente/' + t.cliente_id)}, t.cliente) : null,
        t.usuario ? marca(t.usuario, 'info') : null,
        t.origen === 'panel' ? marca('Centro de Mando', 'info') : null)),
    h('div.zw-tarea-botones',
      t.estado !== 'en_curso'
        ? h('button.btn.pequeno', {onclick: () => marcar('en_curso')}, 'En curso') : null,
      h('button.btn.primario.pequeno', {onclick: () => marcar('hecha')}, '✓ Hecha')));
}

function tarjetaTareas(lista, {ir, recarga, titulo, subtitulo, vacio}) {
  if (!lista.length) {
    return tarjeta(titulo, h('p.nota', vacio || 'No tienes nada pendiente ahora mismo.'),
      {subtitulo});
  }
  const grupos = {};
  lista.forEach(t => (grupos[diaDe(t)] = grupos[diaDe(t)] || []).push(t));
  return tarjeta(titulo + ' (' + lista.length + ')',
    ORDEN_DIAS.filter(k => grupos[k]).map(k => h('div.zw-grupo',
      h('h3.zw-grupo-tit' + (k === 'vencidas' ? '.mal' : ''), capital(k),
        h('span.nota', ' · ' + grupos[k].length)),
      h('ul.zw-tareas', grupos[k].map(t => lineaTarea(t, {ir, recarga}))))),
    {subtitulo});
}

/* ======================= dirección ========================= */

function cifra(c) {
  return c.unidad === 'eur' ? eurCorto(c.panel === null ? c.crm : c.panel)
                            : miles(c.panel === null ? c.crm : c.panel);
}

function tarjetaCuadre(cif) {
  if (!cif) return null;
  const filas = (cif.cifras || []).filter(c => c.crm !== null && c.panel !== null);
  const malas = filas.filter(c => c.descuadre);
  const fmt = c => v => c.unidad === 'eur' ? eur(v) : miles(v);

  const cuerpo = !filas.length
    ? h('p.nota', 'El Centro de Mando todavía no ha volcado sus cifras. En cuanto lo haga ' +
        '(a las 9:30, a las 14:30 y a las 18:00) aparecerán aquí junto a las del CRM.')
    : tabla([
        {clave: 'titulo', et: 'Cifra'},
        {clave: 'panel', et: 'Centro de Mando', num: true,
         pinta: c => fmt(c)(c.panel)},
        {clave: 'crm', et: 'CRM', num: true, pinta: c => fmt(c)(c.crm)},
        {clave: 'diferencia', et: 'Diferencia', num: true,
         pinta: c => c.descuadre
           ? h('b', {estilo: {color: 'var(--mal)'}},
               (c.diferencia > 0 ? '+' : '') + fmt(c)(c.diferencia))
           : h('span', {estilo: {color: 'var(--bien)'}}, 'cuadra')}
      ], filas, {vacio: 'Sin cifras todavía.'});

  return tarjeta('Cuadre con el Centro de Mando', cuerpo, {
    subtitulo: !filas.length ? null
      : (malas.length
          ? malas.length + ' cifra' + (malas.length > 1 ? 's' : '') + ' sin cuadrar: lo que falta ' +
            'está sin meter en el CRM' + (cif.actualizado ? ' · panel al ' + cif.actualizado.slice(0, 10) : '')
          : 'Todo cuadra' + (cif.actualizado ? ' · panel al ' + cif.actualizado.slice(0, 10) : ''))
  });
}

function panelDireccion({mias, cif, ir, recarga}) {
  const porClave = {};
  ((cif || {}).cifras || []).forEach(c => { porClave[c.clave] = c; });
  const v = k => porClave[k] || {panel: null, crm: null, unidad: 'n', meta: 0};

  const cobrado = v('cobrado'), ops = v('operaciones');
  const metaEuros = num(cobrado.meta) || 1000000;
  const metaOps = num(ops.meta) || 50;

  const resumen = cif ? kpis(
    kpi('Cobrado en banco', cifra(cobrado), 'de ' + eurCorto(metaEuros) + ' del objetivo',
      {destacado: true}),
    kpi('Operaciones', miles(cobrado.panel === null ? ops.crm : ops.panel) + ' / ' + miles(metaOps),
      'aerotermia 1 + fotovoltaica 1'),
    kpi('Facturado del mes', cifra(v('facturado_mes')), miles(v('facturas_mes').panel === null
      ? v('facturas_mes').crm : v('facturas_mes').panel) + ' facturas'),
    kpi('En cierre', cifra(v('en_cierre')), miles(v('en_cierre_n').panel === null
      ? v('en_cierre_n').crm : v('en_cierre_n').panel) + ' operaciones'),
    kpi('Pendiente de cobro', cifra(v('pendiente_cobro')), 'de lo ya vendido',
      {estado: num(v('pendiente_cobro').crm) > 0 ? 'aviso' : null}),
    kpi('Sin cuadrar', miles((cif || {}).descuadres || 0), 'cifras que no coinciden',
      {estado: (cif || {}).descuadres ? 'mal' : 'bien'})
  ) : null;

  const barra = cif && cobrado.panel !== null
    ? tarjeta('Objetivo 2026', h('div',
        progreso(cobrado.panel, metaEuros, {formato: 'eur'}),
        h('p.nota', {estilo: {marginTop: '10px'}},
          'Faltan ' + eur(Math.max(0, metaEuros - num(cobrado.panel))) + '. ' +
          'Solo cuenta el dinero que ha entrado en el banco.')),
        {subtitulo: cobrado.fecha ? 'Dato del panel al ' + fechaCorta(cobrado.fecha) : null})
    : null;

  const porArea = {};
  mias.forEach(t => { porArea[t.area || 'direccion'] = (porArea[t.area || 'direccion'] || 0) + 1; });

  return [
    resumen,
    barra,
    tarjetaTareas(mias, {ir, recarga,
      titulo: 'Para decidir o aprobar',
      subtitulo: 'Lo que el Centro de Mando y el equipo han dejado en tu mano',
      vacio: 'Nada pendiente de dirección. Si el Centro de Mando levanta algo, aparecerá aquí.'}),
    tarjetaCuadre(cif)
  ].filter(Boolean);
}

/* ======================= contabilidad ========================= */

function panelContabilidad({mias, cif, ir, recarga}) {
  const hoy = hoyISO();
  const vencidas = mias.filter(t => t.vence && t.vence < hoy).length;
  const deHoy = mias.filter(t => t.vence === hoy).length;
  const porClave = {};
  ((cif || {}).cifras || []).forEach(c => { porClave[c.clave] = c; });
  const v = k => porClave[k] || {panel: null, crm: null, unidad: 'eur'};

  return [
    kpis(
      kpi('Tareas pendientes', miles(mias.length), 'contabilidad y administración',
        {destacado: true}),
      kpi('Vencidas', miles(vencidas), 'pasadas de fecha',
        {estado: vencidas ? 'mal' : 'bien'}),
      kpi('Para hoy', miles(deHoy), 'con fecha de hoy'),
      cif ? kpi('Facturado del mes', cifra(v('facturado_mes')), 'con IVA') : null,
      cif ? kpi('Pendiente de cobro', cifra(v('pendiente_cobro')), 'de lo ya vendido') : null,
      cif ? kpi('Sin cuadrar', miles((cif || {}).descuadres || 0), 'cifras que no coinciden',
        {estado: (cif || {}).descuadres ? 'mal' : 'bien'}) : null
    ),
    tarjetaTareas(mias, {ir, recarga,
      titulo: 'Lo que tienes que hacer',
      subtitulo: 'Lo que deja el Centro de Mando y lo que te pasa dirección',
      vacio: 'No hay nada pendiente de contabilidad ni de administración.'}),
    tarjetaCuadre(cif)
  ].filter(Boolean);
}

/* ======================= comercial ========================= */

const FASES_CLIENTE = [
  ['nuevo', 'Nuevos'], ['cita', 'Con cita'], ['sentada', 'Sentadas'],
  ['potencial', 'Con potencial'], ['propuesta', 'Con propuesta'],
  ['negociando', 'Negociando'], ['ganado', 'Ganados'], ['perdido', 'Perdidos']
];

function tarjetaFases(clientes, ir, titulo) {
  const cuenta = {};
  clientes.forEach(c => { const k = normal(c.estado) || 'nuevo'; cuenta[k] = (cuenta[k] || 0) + 1; });
  const pasos = FASES_CLIENTE
    .filter(([k]) => cuenta[k])
    .map(([k, et]) => ({fase: et, valor: cuenta[k]}));
  const otros = Object.keys(cuenta).filter(k => !FASES_CLIENTE.some(([f]) => f === k));
  otros.forEach(k => pasos.push({fase: capital(k), valor: cuenta[k]}));

  return tarjeta(titulo, pasos.length
    ? h('div', embudo(pasos),
        h('p.nota', {estilo: {marginTop: '10px'}},
          'Cada barra es la gente que tienes parada en esa fase. En «Mis clientes» ' +
          'los tienes uno a uno.'))
    : h('p.nota', 'Todavía no tienes clientes asignados.'));
}

function agendaProxima(ir) {
  const hoy = hoyISO();
  const tope = sumarDias(hoy, 7);

  const citas = api.estado.captaciones.filter(c => {
    const cli = api.cliente(c.cliente_id);
    return cli && txt(c.fecha) >= hoy && txt(c.fecha) <= tope && normal(c.resultado) === 'pendiente';
  }).map(c => ({fecha: txt(c.fecha), hora: txt(c.hora_cita), cliente: api.cliente(c.cliente_id),
                que: 'Sentada', icono: '⚑'}));

  const seguimientos = api.estado.clientes.filter(c =>
    txt(c.proxima_fecha) && txt(c.proxima_fecha) >= hoy && txt(c.proxima_fecha) <= tope &&
    !['ganado', 'perdido'].includes(normal(c.estado))
  ).map(c => ({fecha: txt(c.proxima_fecha), cliente: c,
               que: txt(c.proxima_accion) || 'Seguimiento', icono: '☎'}));

  const obras = api.estado.operaciones.filter(o =>
    txt(o.fecha_prevista_instalacion) >= hoy && txt(o.fecha_prevista_instalacion) <= tope &&
    !txt(o.fecha_instalacion) && normal(o.estado) !== 'cancelada'
  ).map(o => ({fecha: txt(o.fecha_prevista_instalacion), cliente: api.cliente(o.cliente_id),
               que: 'Instalación · ' + eur(o.total), icono: '⚡'}));

  return citas.concat(seguimientos, obras)
    .filter(x => x.cliente)
    .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
}

function tarjetaSemana(ir) {
  const prox = agendaProxima(ir);
  const hoy = hoyISO();
  const porDia = {};
  prox.forEach(x => (porDia[x.fecha] = porDia[x.fecha] || []).push(x));
  const fechas = Object.keys(porDia).sort();

  return tarjeta('Mi semana', fechas.length
    ? h('div', fechas.map(d => h('div.zw-grupo',
        h('h3.zw-grupo-tit' + (d === hoy ? '.hoy' : ''),
          d === hoy ? 'Hoy' : capital(fechaCorta(d)),
          h('span.nota', ' · ' + porDia[d].length)),
        h('ul.zw-tareas', porDia[d].map(x => h('li.zw-tarea',
          h('span.nivel.' + (d === hoy ? 'medio' : 'bajo')),
          h('div', {estilo: {flex: '1', cursor: 'pointer'},
            onclick: () => ir('cliente/' + x.cliente.id)},
            h('b', x.icono + ' ' + txt(x.cliente.nombre)),
            [txt(x.cliente.direccion), txt(x.cliente.municipio)].filter(Boolean).length
              ? h('div.senas', [txt(x.cliente.direccion), txt(x.cliente.municipio)]
                  .filter(Boolean).join(', ')) : null,
            h('div.nota', x.que + (x.hora ? ' · ' + x.hora : ''))))))))) 
    : h('p.nota', 'No tienes nada en los próximos siete días.'),
    {subtitulo: 'Citas, seguimientos e instalaciones de los próximos siete días'});
}

function tarjetaSePasa(ir) {
  const hoy = hoyISO();
  const tarde = api.estado.clientes.filter(c =>
    txt(c.proxima_fecha) && txt(c.proxima_fecha) < hoy &&
    !['ganado', 'perdido'].includes(normal(c.estado))
  ).sort((a, b) => txt(a.proxima_fecha).localeCompare(txt(b.proxima_fecha)));

  return tarjeta('Se te está pasando (' + tarde.length + ')', tarde.length
    ? tabla([
        {clave: 'nombre', et: 'Cliente'},
        {clave: 'proxima_accion', et: 'Qué tocaba', pinta: c => txt(c.proxima_accion) || 'Seguimiento'},
        {clave: 'proxima_fecha', et: 'Desde', pinta: c =>
          h('b', {estilo: {color: 'var(--mal)'}},
            Math.abs(dias(txt(c.proxima_fecha), hoy)) + ' días')},
        {clave: 'estado', et: 'Fase', pinta: c => etiquetaEstado(c.estado)}
      ], tarde.slice(0, 20), {alPulsar: c => ir('cliente/' + c.id)})
    : h('p.nota', 'Nada atrasado. Así da gusto.'),
    {subtitulo: 'Clientes con la próxima acción pasada de fecha'});
}

function panelComercial({mias, r, ir, recarga}) {
  const clientes = api.estado.clientes;
  const hoy = hoyISO();
  const activos = clientes.filter(c => !['ganado', 'perdido'].includes(normal(c.estado)));
  const prox = agendaProxima(ir);
  const atrasados = clientes.filter(c =>
    txt(c.proxima_fecha) && txt(c.proxima_fecha) < hoy &&
    !['ganado', 'perdido'].includes(normal(c.estado))).length;

  return [
    kpis(
      kpi('Cartera viva', miles(activos.length), 'de ' + miles(clientes.length) + ' clientes',
        {destacado: true}),
      r ? kpi('Propuestas abiertas', miles(r.cartera_abierta),
        eurCorto(r.cartera_importe || 0) + ' en juego') : null,
      r ? kpi('Ventas del periodo', miles(r.logrado_objetivo) + ' / ' + miles(r.objetivo_mes),
        pct(r.objetivo_pct) + ' del objetivo',
        {estado: r.objetivo_pct >= 100 ? 'bien' : (r.objetivo_pct >= 60 ? null : 'aviso')}) : null,
      kpi('Esta semana', miles(prox.length), 'citas, llamadas e instalaciones'),
      kpi('Se te pasa', miles(atrasados), 'clientes sin tocar a tiempo',
        {estado: atrasados ? 'mal' : 'bien'}),
      kpi('Tareas', miles(mias.length), 'que te ha pasado dirección')
    ),
    r && r.objetivo_mes
      ? tarjeta('Mi objetivo del mes', progreso(r.logrado_objetivo, r.objetivo_mes),
          {subtitulo: 'Del 16 al 15, como se cuentan los objetivos en casa'})
      : null,
    tarjetaSemana(ir),
    tarjetaSePasa(ir),
    tarjetaFases(clientes, ir, 'Mi cartera, fase a fase'),
    mias.length ? tarjetaTareas(mias, {ir, recarga, titulo: 'Tareas para ti'}) : null
  ].filter(Boolean);
}

/* ======================= captador ========================= */

function semanasDe(captaciones, cuantas) {
  const hoy = hoyISO();
  const grupos = [];
  for (let i = cuantas - 1; i >= 0; i--) {
    const fin = sumarDias(hoy, -7 * i);
    const ini = sumarDias(fin, -6);
    grupos.push({ini, fin,
      n: captaciones.filter(c => txt(c.fecha) >= ini && txt(c.fecha) <= fin).length});
  }
  return grupos;
}

function panelCaptador({mias, r, ir, recarga}) {
  const u = api.estado.usuario;
  const mis = api.estado.captaciones.filter(c => txt(c.captador_id) === txt(u.id));
  const semanas = semanasDe(mis, 8);
  const ultimas4 = semanas.slice(-4).reduce((a, s) => a + s.n, 0) / 4;
  const previas4 = semanas.slice(0, 4).reduce((a, s) => a + s.n, 0) / 4;
  const tendencia = previas4 ? ((ultimas4 - previas4) / previas4) * 100 : 0;

  const clientes = api.estado.clientes;
  const vendidos = mis.filter(c => normal(c.resultado) === 'venta').length;
  const sentadas = mis.filter(c => ['sentada', 'venta'].includes(normal(c.resultado))).length;

  const fichasTabla = mis.slice().sort((a, b) => txt(b.fecha).localeCompare(txt(a.fecha)))
    .map(c => {
      const cli = api.cliente(c.cliente_id) || {};
      return {
        id: c.cliente_id, nombre: txt(cli.nombre) || '—', municipio: txt(cli.municipio),
        fecha: txt(c.fecha), resultado: normal(c.resultado) || 'pendiente',
        fase: txt(cli.estado) || 'nuevo'
      };
    });

  return [
    kpis(
      r ? kpi('Fichas del periodo', miles(r.logrado_objetivo) + ' / ' + miles(r.objetivo_mes),
        pct(r.objetivo_pct) + ' del objetivo', {destacado: true}) : null,
      kpi('Ritmo', miles(Math.round(ultimas4 * 10) / 10) + ' / semana',
        (tendencia >= 0 ? '▲ ' : '▼ ') + pct(Math.abs(Math.round(tendencia))) + ' que el mes anterior',
        {estado: tendencia >= 0 ? 'bien' : 'aviso'}),
      kpi('Captaciones vivas', miles(mis.filter(c => normal(c.resultado) === 'pendiente').length),
        'citas todavía por celebrar'),
      kpi('Llegan a sentada', pct(mis.length ? (sentadas / mis.length) * 100 : 0),
        miles(sentadas) + ' de ' + miles(mis.length)),
      kpi('Acaban en venta', pct(mis.length ? (vendidos / mis.length) * 100 : 0),
        miles(vendidos) + ' ventas',
        {estado: vendidos ? 'bien' : null}),
      kpi('Tareas', miles(mias.length), 'que te ha pasado dirección')
    ),
    r && r.objetivo_mes
      ? tarjeta('Mi objetivo del mes', progreso(r.logrado_objetivo, r.objetivo_mes),
          {subtitulo: 'Del 16 al 15, como se cuentan los objetivos en casa'})
      : null,
    tarjeta('Mi ritmo, semana a semana',
      barras({etiquetas: semanas.map(s => fechaCorta(s.ini)),
              series: [{nombre: 'Fichas', valores: semanas.map(s => s.n)}], alto: 200}),
      {subtitulo: 'Fichas que has metido cada una de las últimas ocho semanas'}),
    tarjetaFases(clientes, ir, 'En qué fase va la gente que has captado'),
    tarjeta('Todo lo que has captado (' + fichasTabla.length + ')',
      tabla([
        {clave: 'fecha', et: 'Fecha', pinta: f => fechaCorta(f.fecha)},
        {clave: 'nombre', et: 'Cliente'},
        {clave: 'municipio', et: 'Dónde'},
        {clave: 'resultado', et: 'Cómo fue', pinta: f => etiquetaEstado(f.resultado)},
        {clave: 'fase', et: 'En qué va ahora', pinta: f => etiquetaEstado(f.fase)}
      ], fichasTabla, {alPulsar: f => f.id && ir('cliente/' + f.id),
                       vacio: 'Todavía no has metido ninguna ficha.',
                       csv: 'mis-captaciones.csv'}),
      {sinRelleno: true}),
    mias.length ? tarjetaTareas(mias, {ir, recarga, titulo: 'Tareas para ti'}) : null
  ].filter(Boolean);
}
