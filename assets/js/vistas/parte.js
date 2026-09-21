/* vistas/parte.js — el parte del día.
 *
 * El captador dice cuántas puertas ha tocado; el comercial, cuántas
 * sentadas ha tenido y con quién, y escribe en lenguaje normal cómo ha
 * ido. El sistema lee ese texto, propone cambios de estado y fechas, y
 * espera a que la persona los confirme. Nada se cambia por su cuenta.
 */

import {h, poner, txt, num, eur, miles, fechaCorta, fechaLarga, hoyISO, normal} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, aviso, avisoError, cargando} from '../ui.js';

export async function vistaParte({ir, refrescar}) {
  const u = api.estado.usuario;
  const esCaptador = u.rol === 'captador';
  const caja = h('div');
  const fecha = hoyISO();

  const previos = await api.pedir('partes', {desde: '', hasta: fecha});
  const deHoy = (previos.partes || []).find(p => txt(p.fecha) === fecha);

  /* --- sentadas: se eligen entre los clientes de la persona --- */
  const clientes = api.estado.clientes.slice()
    .sort((a, b) => txt(a.nombre).localeCompare(txt(b.nombre), 'es'));
  let sentadas = [];
  try { sentadas = deHoy ? JSON.parse(deHoy.sentadas_detalle || '[]') : []; } catch (e) { sentadas = []; }

  const listaSentadas = h('div', {estilo: {display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px'}});
  const selector = h('select',
    [h('option', {value: ''}, '+ Añadir una sentada…')].concat(
      clientes.map(c => h('option', {value: c.id}, c.nombre + (c.municipio ? ' · ' + c.municipio : '')))));
  selector.addEventListener('change', () => {
    const id = selector.value;
    if (!id) return;
    if (!sentadas.some(s => String(s.cliente_id) === String(id))) {
      sentadas.push({cliente_id: id, resultado: 'sentada'});
      pintaSentadas();
    }
    selector.value = '';
  });

  function pintaSentadas() {
    poner(listaSentadas, sentadas.length ? sentadas.map(s => {
      const c = api.cliente(s.cliente_id) || {};
      return h('span.etiqueta.marca', c.nombre || s.cliente_id, ' ',
        h('button', {estilo: {border: 0, background: 'none', cursor: 'pointer', padding: '0 0 0 4px'},
          onclick: () => { sentadas = sentadas.filter(x => x.cliente_id !== s.cliente_id); pintaSentadas(); }}, '✕'));
    }) : [h('span.nota', 'Todavía no has apuntado ninguna sentada.')]);
    if (campoSentadas) campoSentadas.value = sentadas.length;
  }

  const campoPuertas = h('input', {type: 'number', min: '0', value: deHoy ? num(deHoy.puertas) : ''});
  const campoVisitas = h('input', {type: 'number', min: '0', value: deHoy ? num(deHoy.visitas) : ''});
  const campoSentadas = h('input', {type: 'number', min: '0', value: deHoy ? num(deHoy.sentadas) : 0});
  const campoVentas = h('input', {type: 'number', min: '0', value: deHoy ? num(deHoy.ventas) : ''});
  const campoImporte = h('input', {type: 'number', step: '0.01', min: '0',
    value: deHoy ? num(deHoy.importe_vendido) : ''});
  const campoResumen = h('textarea', {rows: 7, placeholder: esCaptador
    ? 'Zona trabajada, qué te has encontrado, casas a las que hay que volver…'
    : 'Cuenta el día como se lo contarías a un compañero. Nombra a los clientes: '
      + '"He estado con Marta Sanz y firmamos el contrato. Óscar se lo piensa, le vuelvo a llamar el lunes."'},
    deHoy ? txt(deHoy.resumen) : '');

  const zonaAnalisis = h('div');
  let parteGuardado = deHoy || null;

  const btnEnviar = h('button.btn.primario', deHoy ? 'Actualizar el parte' : 'Enviar el parte');
  btnEnviar.addEventListener('click', async () => {
    btnEnviar.disabled = true;
    const original = btnEnviar.textContent;
    poner(btnEnviar, h('span.cargando'), ' Enviando');
    try {
      const r = await api.pedir('guardarParte', {parte: {
        fecha,
        puertas: num(campoPuertas.value), visitas: num(campoVisitas.value),
        sentadas: num(campoSentadas.value), sentadas_detalle: sentadas,
        ventas: num(campoVentas.value), importe_vendido: num(campoImporte.value),
        resumen: txt(campoResumen.value)
      }});
      parteGuardado = r.parte;
      aviso('Parte enviado. Gracias.');
      pintaAnalisis(r.analisis);
    } catch (e) { avisoError(e); }
    finally { btnEnviar.disabled = false; btnEnviar.textContent = original; }
  });

  function pintaAnalisis(analisis) {
    if (!analisis || !analisis.propuestas || !analisis.propuestas.length) {
      poner(zonaAnalisis, analisis && analisis.avisos && analisis.avisos.length
        ? tarjeta('Lectura del resumen', h('div',
            h('p.nota', 'No he sacado ningún cambio claro del texto.'),
            h('ul', analisis.avisos.map(a => h('li.nota', a)))))
        : h('div'));
      return;
    }
    const marcados = new Set(analisis.propuestas.map(p => p.cliente_id));
    const filas = analisis.propuestas.map(p => {
      const check = h('input', {type: 'checkbox', checked: true, estilo: {width: 'auto'},
        onchange: e => e.target.checked ? marcados.add(p.cliente_id) : marcados.delete(p.cliente_id)});
      return h('tr',
        h('td', check),
        h('td', h('b', p.cliente), h('div.nota', '"' + txt(p.nota) + '"')),
        h('td', p.estado
          ? h('div', etiquetaEstado(p.estado_actual, api.etiquetaCatalogo('estadosCliente', p.estado_actual)),
              ' → ', etiquetaEstado(p.estado, api.etiquetaCatalogo('estadosCliente', p.estado)))
          : h('span.nota', 'sin cambio de estado')),
        h('td', txt(p.proximo_paso) || '—'),
        h('td', txt(p.proxima_fecha) ? fechaCorta(p.proxima_fecha) : '—'));
    });

    const btnAplicar = h('button.btn.lima', 'Aplicar los cambios marcados');
    btnAplicar.addEventListener('click', async () => {
      const cambios = analisis.propuestas.filter(p => marcados.has(p.cliente_id));
      if (!cambios.length) return aviso('No has marcado ningún cambio.', 'error');
      btnAplicar.disabled = true;
      try {
        await api.pedir('aplicarParte', {id: parteGuardado.id, cambios});
        aviso('Fichas actualizadas.');
        await refrescar();
      } catch (e) { avisoError(e); btnAplicar.disabled = false; }
    });

    poner(zonaAnalisis, tarjeta('Lo que he entendido de tu resumen',
      h('div',
        h('p.nota', 'Repasa y desmarca lo que no cuadre. Solo se cambia lo que dejes marcado.'),
        h('.tabla-caja', h('table.datos',
          h('thead', h('tr', h('th', ''), h('th', 'Cliente y frase'), h('th', 'Estado'),
            h('th', 'Próximo paso'), h('th', 'Fecha'))),
          h('tbody', filas))),
        analisis.avisos && analisis.avisos.length
          ? h('div', {estilo: {marginTop: '10px'}}, analisis.avisos.map(a => h('p.nota', '· ' + a))) : null,
        h('.acciones', {estilo: {marginTop: '14px'}}, btnAplicar)),
      {subtitulo: 'Propuestas automáticas a partir del texto'}));
  }

  if (deHoy && txt(deHoy.analisis)) {
    try { pintaAnalisis(JSON.parse(deHoy.analisis)); } catch (e) { /* nada */ }
  }

  const campo = (et, control, ayuda) => h('label.campo', h('span', et), control,
    ayuda ? h('small', {estilo: {color: 'var(--tx-3)', fontWeight: '400'}}, ayuda) : null);

  const formulario = esCaptador
    ? h('.rejilla',
        campo('Puertas tocadas', campoPuertas, 'Cuántas casas has llamado hoy'),
        campo('Visitas hechas', campoVisitas, 'Casas donde te han recibido'),
        campo('Fichas subidas', h('input', {value: deHoy ? num(deHoy.fichas) : 0, disabled: true}),
          'Se cuentan solas de las fichas de captación'))
    : h('.rejilla',
        campo('Sentadas', campoSentadas, 'Se rellena solo al añadirlas abajo'),
        campo('Ventas cerradas', campoVentas),
        campo('Importe vendido (€)', campoImporte));

  if (!esCaptador) pintaSentadas();
  const historial = (previos.partes || []).filter(p => txt(p.fecha) !== fecha).slice(0, 14);

  return poner(caja,
    h('div', {estilo: {marginBottom: '14px'}},
      h('h2', 'Parte del ' + fechaLarga(fecha)),
      h('p.nota', deHoy ? 'Ya has enviado el parte de hoy: puedes corregirlo y volver a enviarlo.'
                        : 'Dos minutos al acabar el día y mañana el CRM está al día.')),

    tarjeta('Tu día',
      h('div', formulario,
        esCaptador ? null : h('div', {estilo: {marginTop: '6px'}},
          h('label.campo', h('span', '¿Con quién te has sentado?'), selector), listaSentadas),
        h('label.campo', {estilo: {marginTop: '16px'}},
          h('span', 'Resumen del día'), campoResumen,
          h('small', {estilo: {color: 'var(--tx-3)', fontWeight: '400'}},
            esCaptador ? 'Lo que cuentes aquí lo ve dirección en el parte.'
              : 'Nombra a los clientes tal y como están en el CRM: así puedo actualizar sus fichas.')),
        h('.acciones', btnEnviar,
          h('button.btn', {onclick: () => ir('panel')}, 'Volver al panel')))),

    zonaAnalisis,

    tarjeta('Tus últimos partes',
      historial.length ? tabla([
        {clave: 'fecha', et: 'Día', pinta: p => fechaCorta(p.fecha)},
        ...(esCaptador
          ? [{clave: 'puertas', et: 'Puertas', num: true, valor: p => num(p.puertas)},
             {clave: 'visitas', et: 'Visitas', num: true, valor: p => num(p.visitas)},
             {clave: 'fichas', et: 'Fichas', num: true, valor: p => num(p.fichas)}]
          : [{clave: 'sentadas', et: 'Sentadas', num: true, valor: p => num(p.sentadas)},
             {clave: 'ventas', et: 'Ventas', num: true, valor: p => num(p.ventas)},
             {clave: 'importe_vendido', et: 'Importe', num: true, valor: p => num(p.importe_vendido),
              pinta: p => num(p.importe_vendido) ? eur(p.importe_vendido) : '—'}]),
        {clave: 'resumen', et: 'Resumen', noOrden: true,
         pinta: p => h('span.nota', txt(p.resumen).slice(0, 120) + (txt(p.resumen).length > 120 ? '…' : ''))}
      ], historial, {vacio: 'Todavía no hay partes anteriores.'})
        : h('.vacio', 'Este es tu primer parte.'), {sinRelleno: true})
  );
}
