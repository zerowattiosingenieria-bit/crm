/* vistas/vacaciones.js — calendario de vacaciones.
 *
 * Cada persona marca en el calendario los días que quiere y los pide.
 * Rubén y Fernando los aprueban o los deniegan; hasta entonces figuran
 * como pendientes y no descuentan del saldo aprobado.
 */

import {h, poner, txt, num, miles, fechaCorta, fechaLarga, capital, hoyISO, dias, sumarDias} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, aviso, avisoError,
        confirmar, filtros, cargando, ventanaFormulario} from '../ui.js';

const DIAS_CAB = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre'];

export async function vistaVacaciones({ir, refrescar}) {
  const caja = h('div');
  const contenido = h('div', cargando());
  const puedeAprobar = api.puede('nominasAjenas');
  const est = {anio: hoyISO().slice(0, 4), usuario_id: api.estado.usuario.id};

  const anios = [];
  const actual = Number(hoyISO().slice(0, 4));
  for (let a = actual - 1; a <= actual + 1; a++) anios.push(String(a));

  const controles = [{id: 'anio', tipo: 'select', valor: est.anio, opciones: anios}];
  if (puedeAprobar) controles.push({id: 'usuario_id', tipo: 'select', valor: est.usuario_id,
    opciones: api.estado.usuarios.map(u => [u.id, u.nombre + ' · ' + capital(u.rol)])});

  const f = filtros(controles, v => { Object.assign(est, v); cargar(); });

  async function cargar() {
    poner(contenido, cargando());
    try {
      const d = await api.pedir('vacaciones', {anio: est.anio});
      poner(contenido, pinta(d, est, puedeAprobar, cargar));
    } catch (e) { avisoError(e); poner(contenido, h('.vacio', txt(e.message))); }
  }

  poner(caja, f.nodo, contenido);
  await cargar();
  return caja;
}

function pinta(d, est, puedeAprobar, recargar) {
  const yo = api.estado.usuario;
  const quien = puedeAprobar ? est.usuario_id : yo.id;
  const saldo = (d.saldos || []).find(s => String(s.usuario_id) === String(quien)) ||
                {derecho: d.derecho, aprobados: 0, disfrutados: 0, pendientes: 0, restantes: d.derecho};

  const suyas = d.vacaciones.filter(v => String(v.usuario_id) === String(quien));
  const otras = d.vacaciones.filter(v => String(v.usuario_id) !== String(quien) &&
                                         txt(v.estado) === 'aprobada');
  const pendientes = d.vacaciones.filter(v => txt(v.estado) === 'solicitada');

  /* --- selección de fechas en el calendario --- */
  const seleccion = {desde: '', hasta: ''};
  const barra = h('div');
  const calendario = h('div');

  const estadoDia = fecha => {
    const mia = suyas.find(v => ['solicitada', 'aprobada'].includes(txt(v.estado)) &&
      txt(v.desde) <= fecha && fecha <= txt(v.hasta));
    if (mia) return txt(mia.estado);
    if (otras.some(v => txt(v.desde) <= fecha && fecha <= txt(v.hasta))) return 'otro';
    return '';
  };

  function pintaCalendario() {
    poner(calendario, h('.anio', MESES.map((nombre, m) => mes(Number(est.anio), m, nombre))));
    pintaBarra();
  }

  function mes(anio, m, nombre) {
    const primero = new Date(anio, m, 1);
    const ultimo = new Date(anio, m + 1, 0).getDate();
    const hueco = (primero.getDay() + 6) % 7;
    const celdas = [];
    for (let i = 0; i < hueco; i++) celdas.push(h('.dia.fuera', ''));
    for (let dia = 1; dia <= ultimo; dia++) {
      const fecha = anio + '-' + String(m + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
      const w = new Date(anio, m, dia).getDay();
      const finde = w === 0 || w === 6;
      const festivo = (d.festivos || []).includes(fecha);
      const marca = estadoDia(fecha);
      const elegido = seleccion.desde && fecha >= seleccion.desde &&
                      fecha <= (seleccion.hasta || seleccion.desde);
      const clases = ['dia'];
      if (finde) clases.push('finde');
      else if (festivo) clases.push('festivo');
      else if (elegido) clases.push('elegido');
      else if (marca) clases.push(marca);
      if (fecha === hoyISO()) clases.push('hoy');

      celdas.push(h('.' + clases.join('.'), {
        title: marca === 'otro' ? 'Alguien del equipo está fuera' :
               (marca ? 'Tus vacaciones: ' + api.etiquetaCatalogo('estadosVacaciones', marca) : fechaLarga(fecha)),
        onclick: finde || festivo ? null : () => elegir(fecha)
      }, String(dia)));
    }
    return h('.mes', h('h4', nombre),
      h('.semana', DIAS_CAB.map(x => h('.cab', x))),
      h('.semana', celdas));
  }

  function elegir(fecha) {
    if (!seleccion.desde || (seleccion.desde && seleccion.hasta) || fecha < seleccion.desde) {
      seleccion.desde = fecha; seleccion.hasta = '';
    } else {
      seleccion.hasta = fecha;
    }
    pintaCalendario();
  }

  function laborables(desde, hasta) {
    let n = 0, cursor = desde;
    while (cursor <= hasta) {
      const w = new Date(cursor + 'T12:00:00').getDay();
      if (w !== 0 && w !== 6 && !(d.festivos || []).includes(cursor)) n++;
      cursor = sumarDias(cursor, 1);
    }
    return n;
  }

  function pintaBarra() {
    if (!seleccion.desde) return poner(barra);
    const hasta = seleccion.hasta || seleccion.desde;
    const n = laborables(seleccion.desde, hasta);
    const btn = h('button.btn.lima', 'Pedir estos días');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.pedir('solicitarVacaciones', {
          desde: seleccion.desde, hasta: hasta, tipo: 'vacaciones',
          usuario_id: puedeAprobar ? quien : undefined
        });
        aviso(n + ' día(s) pedidos. A la espera de que dirección los apruebe.');
        seleccion.desde = seleccion.hasta = '';
        await recargar();
      } catch (e) { avisoError(e); btn.disabled = false; }
    });
    poner(barra, h('.seleccion',
      h('span', 'Del ', h('b', fechaCorta(seleccion.desde)), ' al ', h('b', fechaCorta(hasta)),
        ' · ', h('b', n + ' día' + (n === 1 ? '' : 's')), ' laborable' + (n === 1 ? '' : 's')),
      btn,
      h('button.btn.plano', {estilo: {color: '#cfd4cb'},
        onclick: () => { seleccion.desde = seleccion.hasta = ''; pintaCalendario(); }}, 'Quitar')));
  }

  pintaCalendario();

  /* --- tabla de solicitudes --- */
  const tablaSuyas = tabla([
    {clave: 'desde', et: 'Desde', pinta: v => fechaCorta(v.desde)},
    {clave: 'hasta', et: 'Hasta', pinta: v => fechaCorta(v.hasta)},
    {clave: 'dias', et: 'Días', num: true, valor: v => num(v.dias)},
    {clave: 'tipo', et: 'Tipo', valor: v => api.etiquetaCatalogo('tiposAusencia', v.tipo)},
    {clave: 'estado', et: 'Estado', pinta: v => etiquetaEstado(
      {solicitada: 'pendiente', aprobada: 'ganado', denegada: 'perdido', cancelada: 'frio'}[txt(v.estado)],
      api.etiquetaCatalogo('estadosVacaciones', v.estado))},
    {clave: 'respuesta', et: 'Respuesta', noOrden: true,
     pinta: v => txt(v.respuesta) ? h('span.nota', v.respuesta) : '—'},
    {clave: 'acciones', et: '', noOrden: true, pinta: v =>
      ['solicitada', 'aprobada'].includes(txt(v.estado)) && txt(v.hasta) >= hoyISO()
        ? h('button.btn.mini.peligro', {onclick: async () => {
            if (!await confirmar('¿Retiras la petición del ' + fechaCorta(v.desde) + ' al ' +
              fechaCorta(v.hasta) + '?', {botón: 'Retirar'})) return;
            try { await api.pedir('cancelarVacaciones', {id: v.id}); aviso('Petición retirada.');
                  await recargar(); } catch (e) { avisoError(e); }
          }}, 'Retirar')
        : ''}
  ], suyas, {vacio: 'Todavía no has pedido ningún día este año.'});

  /* --- pendientes de aprobar (dirección) --- */
  const tablaPendientes = puedeAprobar ? tabla([
    {clave: 'usuario', et: 'Quién', valor: v => api.nombrePersona(v.usuario_id),
     pinta: v => h('b', api.nombrePersona(v.usuario_id))},
    {clave: 'desde', et: 'Desde', pinta: v => fechaCorta(v.desde)},
    {clave: 'hasta', et: 'Hasta', pinta: v => fechaCorta(v.hasta)},
    {clave: 'dias', et: 'Días', num: true, valor: v => num(v.dias)},
    {clave: 'solicitada', et: 'Pedido el', pinta: v => fechaCorta(txt(v.solicitada).slice(0, 10))},
    {clave: 'nota', et: 'Nota', noOrden: true, pinta: v => txt(v.nota) ? h('span.nota', v.nota) : '—'},
    {clave: 'acciones', et: '', noOrden: true, pinta: v => h('.acciones',
      h('button.btn.mini.lima', {onclick: () => resolver(v, 'aprobada', recargar)}, 'Aprobar'),
      h('button.btn.mini.peligro', {onclick: () => resolver(v, 'denegada', recargar)}, 'Denegar'))}
  ], pendientes, {vacio: 'No hay nada pendiente de aprobar.'}) : null;

  /* --- quién está fuera --- */
  const fuera = d.vacaciones.filter(v => txt(v.estado) === 'aprobada' && txt(v.hasta) >= hoyISO())
    .sort((a, b) => txt(a.desde).localeCompare(txt(b.desde))).slice(0, 12);

  return h('div',
    kpis(
      kpi('Días del año', miles(saldo.derecho), 'laborables por persona', {destacado: true}),
      kpi('Aprobados', miles(saldo.aprobados), 'del ' + est.anio,
        {estado: saldo.aprobados ? 'bien' : null}),
      kpi('Ya disfrutados', miles(saldo.disfrutados), 'días pasados'),
      kpi('Pendientes de aprobar', miles(saldo.pendientes), 'en espera',
        {estado: saldo.pendientes ? 'aviso' : null}),
      kpi('Te quedan', miles(saldo.restantes), 'por pedir',
        {estado: saldo.restantes > 0 ? 'bien' : 'mal'})
    ),

    puedeAprobar && pendientes.length
      ? tarjeta('Pendientes de tu aprobación (' + pendientes.length + ')', tablaPendientes,
          {sinRelleno: true, subtitulo: 'Nadie tiene los días concedidos hasta que los apruebes'})
      : null,

    tarjeta('Calendario ' + est.anio,
      h('div',
        h('p.nota', {estilo: {marginTop: 0}},
          'Pulsa el primer día y luego el último para marcar un periodo. Los fines de semana y ' +
          'festivos no cuentan.'),
        calendario,
        barra,
        h('.leyenda-cal',
          h('span', h('i', {estilo: {background: 'var(--lima)'}}), 'Aprobadas'),
          h('span', h('i', {estilo: {background: 'var(--aviso-b)', border: '1px solid var(--aviso)'}}),
            'Pendientes de aprobar'),
          h('span', h('i', {estilo: {background: 'var(--info-b)', border: '1px solid var(--info)'}}),
            'Alguien del equipo fuera'),
          h('span', h('i', {estilo: {background: 'var(--carbon)'}}), 'Lo que estás marcando'),
          h('span', h('i', {estilo: {background: 'var(--fondo)'}}), 'Festivo'))),
      {subtitulo: puedeAprobar
        ? 'Estás viendo el calendario de ' + api.nombrePersona(quien)
        : 'Tus vacaciones y las del resto del equipo'}),

    tarjeta('Tus peticiones', tablaSuyas, {sinRelleno: true}),

    fuera.length ? tarjeta('Quién estará fuera',
      h('ul.lista-avisos', fuera.map(v => h('li',
        h('span.nivel.bajo'),
        h('div', h('b', api.nombrePersona(v.usuario_id)),
          h('div.nota', 'del ' + fechaCorta(v.desde) + ' al ' + fechaCorta(v.hasta) +
            ' · ' + num(v.dias) + ' días'))))), {subtitulo: 'Vacaciones aprobadas por delante'}) : null
  );
}

function resolver(v, estado, recargar) {
  return ventanaFormulario({
    titulo: (estado === 'aprobada' ? 'Aprobar' : 'Denegar') + ' las vacaciones de ' +
            api.nombrePersona(v.usuario_id),
    campos: [
      {id: 'respuesta', et: estado === 'aprobada' ? 'Comentario (opcional)' : 'Motivo',
       tipo: 'area', ancho: 3, requerido: estado === 'denegada'}
    ],
    valores: {},
    textoBoton: estado === 'aprobada' ? 'Aprobar los días' : 'Denegar',
    alGuardar: async d => {
      await api.pedir('resolverVacaciones', {id: v.id, estado: estado, respuesta: d.respuesta});
      aviso(estado === 'aprobada' ? 'Vacaciones aprobadas.' : 'Solicitud denegada.');
      await recargar();
    }
  });
}
