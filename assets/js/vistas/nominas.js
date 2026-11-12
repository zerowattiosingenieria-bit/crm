/* vistas/nominas.js — nóminas.
 *
 * Rubén y Fernando suben cada mes el PDF de la nómina de cada persona y
 * cada uno se descarga las suyas. Solo eso (12/11/2026): sin importes ni
 * devengo; y el aviso de comisiones ajustadas hasta el periodo anterior.
 */

import {h, poner, txt, num, eur, eur2, miles, pct, fechaCorta, fechaLarga, mesLargo,
        capital, hoyISO, primerDiaMes, mesISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, tabla, kpi, kpis, etiquetaEstado, marca, ventana, ventanaFormulario,
        aviso, avisoError, confirmar, filtros, cargando} from '../ui.js';
import {barras} from '../graficos.js';

export async function vistaNomina({id, ir, refrescar}) {
  const puedeOtras = api.puede('nominasAjenas');
  const caja = h('div');
  const contenido = h('div', cargando());
  const est = {usuario_id: id || api.estado.usuario.id, anio: hoyISO().slice(0, 4)};

  const anios = [];
  for (let a = Number(hoyISO().slice(0, 4)); a >= Number(hoyISO().slice(0, 4)) - 4; a--) anios.push(String(a));

  const controles = [];
  if (puedeOtras) controles.push({id: 'usuario_id', tipo: 'select', valor: est.usuario_id,
    opciones: api.estado.usuarios.map(u => [u.id, u.nombre + ' · ' + capital(u.rol)])});
  controles.push({id: 'anio', tipo: 'select', valor: est.anio,
    opciones: [['', 'Todos los años']].concat(anios)});
  if (puedeOtras) controles.push({tipo: 'boton', et: '+ Subir nómina en PDF', clase: 'primario',
    accion: () => subir(est.usuario_id, cargar)});

  const f = filtros(controles, v => { Object.assign(est, v); cargar(); });

  async function cargar() {
    poner(contenido, cargando());
    try {
      const d = await api.pedir('nominas', {usuario_id: est.usuario_id});
      poner(contenido, pinta(d, est, puedeOtras, cargar, ir));
    } catch (e) { avisoError(e); poner(contenido, h('.vacio', txt(e.message))); }
  }

  poner(caja, f.nodo, contenido);
  await cargar();
  return caja;
}

/* ---------- pantalla ----------
 * 12/11/2026, Nando: «en la parte de nóminas solo muestra los PDF de las
 * nóminas para que se las puedan descargar, no des más detalles», y un aviso
 * de que las comisiones están ajustadas hasta el periodo anterior al actual.
 * Nada de importes, KPIs ni devengo día a día. Dirección conserva subir,
 * corregir y borrar, que es como llegan los PDF. */
function pinta(d, est, puedeOtras, recargar, ir) {
  const p = d.persona;
  const lista = (d.nominas || [])
    .filter(n => !est.anio || txt(n.periodo).startsWith(est.anio))
    .filter(n => puedeOtras || txt(n.archivo_id))
    .sort((a, b) => txt(b.periodo).localeCompare(txt(a.periodo)));

  const t = tabla([
    {clave: 'periodo', et: 'Mes', pinta: n => h('b', mesLargoCompleto(n.periodo))},
    {clave: 'acciones', et: '', noOrden: true, pinta: n => h('.acciones',
      txt(n.archivo_id)
        ? h('button.btn.mini.lima', {onclick: e => descargar(n, e.target)}, '⤓ Descargar PDF')
        : h('span.nota', 'sin PDF'),
      puedeOtras ? h('button.btn.mini', {onclick: () => editar(n, recargar)}, 'Editar') : null,
      puedeOtras ? h('button.btn.mini.peligro', {onclick: async () => {
        if (!await confirmar('Se borra la nómina de ' + mesLargoCompleto(n.periodo) +
          ' y su PDF.', {botón: 'Borrar'})) return;
        try { await api.pedir('borrarNomina', {id: n.id}); aviso('Nómina borrada.'); await recargar(); }
        catch (e) { avisoError(e); }
      }}, 'Borrar') : null)}
  ], lista, {vacio: puedeOtras
    ? 'Todavía no hay nóminas subidas para esta persona.'
    : 'Todavía no te han subido ninguna nómina. En cuanto lo hagan, aparecerá aquí.'});

  const hasta = txt(d.comisionado_hasta);
  return h('div',
    h('div', {estilo: {marginBottom: '12px'}}, h('h2', p.nombre)),
    h('p', {estilo: {background: 'var(--bien-b)', borderLeft: '4px solid var(--lima-osc)', padding: '10px 14px',
      borderRadius: '6px', margin: '0 0 14px', fontWeight: '600'}},
      '✓ Comisiones ajustadas hasta el periodo anterior al actual' + (hasta ? ' (hasta el ' + fechaCorta(hasta) + ' incluido).' : '.')),
    estimacion(p),
    tarjeta('Mis nóminas', t, {sinRelleno: true,
      subtitulo: 'Pulsa «Descargar PDF» para bajarte la de ese mes',
      acciones: puedeOtras
        ? [h('button.btn.mini.primario', {onclick: () => subir(p.id, recargar)}, '+ Subir nómina')]
        : null}));
}

/* Estimación de comisiones del periodo en curso y de qué clientes vienen (12/11/2026). */
const ESTADO_OP = {firmada: 'Firmada · falta aprobación o pago', tramite: 'Aprobada', material: 'Material pedido', instalacion: 'Instalando',
  instalada: 'Instalada', legalizada: 'Legalizada', cerrada: 'Cerrada'};
function estimacion(p) {
  const cuerpo = h('div', cargando());
  const caja = tarjeta('Estimación de comisiones de este periodo', cuerpo, {sinRelleno: true,
    acciones: [h('button.btn.mini', {onclick: reportarError, title: 'Si algo no encaja, cuéntalo y le llega a Nando'}, '⚠ Reportar un error')]});
  api.pedir('estimacionComisiones', {usuario_id: p.id}).then(r => {
    const sub = caja.querySelector('.nota, small');
    const t = tabla([
      {clave: 'cliente', et: 'Cliente', pinta: l => h('div', h('b', l.direccion || '—'), l.cliente ? h('div.nota', l.cliente) : null)},
      {clave: 'concepto', et: 'Por qué', pinta: l => h('span.nota', capital(l.concepto))},
      {clave: 'fecha', et: 'Firma', pinta: l => l.fecha ? fechaCorta(l.fecha) : '—'},
      {clave: 'estado', et: 'Estado', pinta: l => etiquetaEstado(l.sin_aprobar ? 'pendiente' : 'ganado', ESTADO_OP[l.estado] || capital(l.estado || '—'))},
      {clave: 'importe', et: 'Comisión', num: true, valor: l => num(l.importe), pinta: l => h('b', eur2(l.importe))}
    ], r.lineas, {vacio: 'De momento no hay comisiones en este periodo.',
      pie: r.lineas.length ? [{texto: 'Total estimado', colspan: 4}, {texto: eur2(r.total), num: true}] : null});
    poner(cuerpo,
      h('p', {estilo: {margin: '10px 14px', fontSize: '14px'}},
        'Del ' + fechaCorta(r.desde) + ' al ' + fechaCorta(r.hasta) + ': ', h('b', eur2(r.total)),
        num(r.total) !== num(r.aprobado) ? h('span.nota', ' · ' + eur2(r.aprobado) + ' de ventas ya aprobadas o pagadas; el resto, a falta de aprobación de la financiera o del pago') : null,
        h('span.nota', ' · Estimación: lo definitivo es la nómina en PDF.')),
      t);
  }).catch(e => poner(cuerpo, h('.vacio', txt(e.message))));
  return caja;
}

/* «Si algo no encaja»: el comentario le llega por correo a Nando (12/11/2026). */
function reportarError() {
  const area = h('textarea', {rows: 6, placeholder: '¿Qué no encaja? Por ejemplo: falta la venta de tal cliente, una comisión no es la que toca, una nómina tiene un dato mal…',
    estilo: {width: '100%', boxSizing: 'border-box', font: 'inherit', padding: '8px'}});
  const btn = h('button.btn.primario', 'Enviar');
  const v = ventana({titulo: 'Reportar un error en nóminas',
    cuerpo: h('div', h('p.nota', 'Cuéntalo con detalle: le llega por correo a Nando junto con la estimación que estás viendo.'), area),
    acciones: [h('button.btn', {onclick: () => v.cerrar()}, 'Cancelar'), btn]});
  btn.addEventListener('click', async () => {
    if (txt(area.value).length < 5) return aviso('Cuenta qué es lo que no encaja.', 'error');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try { await api.pedir('reportarErrorNomina', {comentario: area.value}); aviso('Enviado. Nando lo revisará.'); v.cerrar(); }
    catch (e) { avisoError(e); btn.disabled = false; btn.textContent = 'Enviar'; }
  });
}

function mesLargoCompleto(periodo) {
  if (!/^\d{4}-\d{2}$/.test(txt(periodo))) return txt(periodo) || '—';
  const d = new Date(periodo + '-01T12:00:00');
  return capital(d.toLocaleDateString('es-ES', {month: 'long', year: 'numeric'}));
}

/* ---------- abrir el PDF ---------- */
async function descargar(nomina, boton) {
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Abriendo…';
  try {
    const d = await api.pedir('descargarNomina', {id: nomina.id});
    const bytes = Uint8Array.from(atob(d.datos), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: d.tipo || 'application/pdf'}));
    const a = h('a', {href: url, download: d.nombre, target: '_blank'});
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) { avisoError(e); }
  finally { boton.disabled = false; boton.textContent = original; }
}

/* ---------- subir el PDF ---------- */
function subir(usuarioId, recargar) {
  const gente = api.estado.usuarios.map(u => [u.id, u.nombre + ' · ' + capital(u.rol)]);
  const archivo = h('input', {type: 'file', accept: 'application/pdf,.pdf'});
  const quien = h('select', gente.map(([v, e]) =>
    h('option', {value: v, selected: String(v) === String(usuarioId)}, e)));
  const mes = h('input', {type: 'month', value: mesISO()});
  const neto = h('input', {type: 'number', step: '0.01', placeholder: 'Opcional'});
  const estado = h('select', [h('option', {value: 'pagada'}, 'Pagada'),
                              h('option', {value: 'pendiente'}, 'Pendiente')]);
  const fechaPago = h('input', {type: 'date'});
  const notas = h('input', {placeholder: 'Opcional'});
  const btn = h('button.btn.primario', 'Subir nómina');

  const campo = (et, control, ayuda) => h('label.campo', h('span', et), control,
    ayuda ? h('small', {estilo: {color: 'var(--tx-3)', fontWeight: '400'}}, ayuda) : null);

  const v = ventana({
    titulo: 'Subir nómina en PDF',
    cuerpo: h('div',
      h('p.nota', 'El PDF se guarda en el Drive de la empresa. Solo lo pueden abrir esa persona ' +
        'y dirección, desde el propio CRM.'),
      h('.rejilla',
        campo('¿De quién es?', quien),
        campo('Mes', mes),
        campo('Archivo PDF', archivo),
        campo('Neto (€)', neto, 'Para verlo en la lista'),
        campo('Estado', estado),
        campo('Fecha de pago', fechaPago),
        campo('Notas', notas))),
    acciones: [h('button.btn', {onclick: () => v.cerrar()}, 'Cancelar'), btn]
  });

  btn.addEventListener('click', async () => {
    const f = archivo.files && archivo.files[0];
    if (!f) return aviso('Elige el archivo PDF.', 'error');
    if (f.size > 8 * 1024 * 1024) return aviso('El PDF no puede pasar de 8 MB.', 'error');
    if (!/^\d{4}-\d{2}$/.test(mes.value)) return aviso('Elige el mes.', 'error');
    btn.disabled = true;
    poner(btn, h('span.cargando'), ' Subiendo');
    try {
      const datos = await new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(String(lector.result).split(',')[1]);
        lector.onerror = () => reject(new Error('No he podido leer el archivo.'));
        lector.readAsDataURL(f);
      });
      await api.pedir('subirNomina', {
        usuario_id: quien.value, periodo: mes.value, nombre: f.name,
        tipo: f.type || 'application/pdf', datos: datos,
        neto: neto.value, estado: estado.value, fecha_pago: fechaPago.value, notas: notas.value
      });
      aviso('Nómina subida.');
      v.cerrar();
      await recargar();
    } catch (e) {
      avisoError(e);
      btn.disabled = false; btn.textContent = 'Subir nómina';
    }
  });
}

function editar(nomina, recargar) {
  return ventanaFormulario({
    titulo: 'Nómina de ' + mesLargoCompleto(nomina.periodo),
    campos: [
      {id: 'neto', et: 'Neto (€)', tipo: 'euro'},
      {id: 'estado', et: 'Estado', tipo: 'select', vacio: false,
       opciones: [['pagada', 'Pagada'], ['pendiente', 'Pendiente']]},
      {id: 'fecha_pago', et: 'Fecha de pago', tipo: 'fecha'},
      {id: 'notas', et: 'Notas', tipo: 'area', ancho: 3}
    ],
    valores: nomina,
    alGuardar: async d => {
      d.id = nomina.id;
      await api.guardarNomina(d);
      aviso('Nómina actualizada.');
      await recargar();
    }
  });
}

/* ---------- devengo día a día (secundario) ---------- */
function devengo(persona, ir) {
  const caja = h('div');
  const contenido = h('div', cargando());
  const est = {desde: primerDiaMes(), hasta: hoyISO()};

  const f = filtros([
    {id: 'desde', tipo: 'fecha', et: 'Desde', valor: est.desde},
    {id: 'hasta', tipo: 'fecha', et: 'Hasta', valor: est.hasta},
    {tipo: 'boton', et: 'Mes actual', accion: () => cargar({desde: primerDiaMes(), hasta: hoyISO()})}
  ], v => { Object.assign(est, v); cargar(); });

  async function cargar(r) {
    Object.assign(est, r || {});
    poner(contenido, cargando());
    try {
      const d = await api.pedir('nominaDias',
        {usuario_id: persona.id, desde: est.desde, hasta: est.hasta});
      poner(contenido, pintaDias(d));
    } catch (e) { poner(contenido, h('.vacio', txt(e.message))); }
  }

  poner(caja, f.nodo, contenido);
  cargar();
  return caja;
}

function pintaDias(d) {
  const t = d.totales;
  const tablaDias = tabla([
    {clave: 'fecha', et: 'Día', pinta: x => h('div', h('b', fechaCorta(x.fecha)), h('div.nota', x.dia_semana))},
    {clave: 'tipo', et: 'Jornada', pinta: x => etiquetaEstado(
      x.tipo === 'trabajado' ? 'ganado' : (x.tipo === 'libre' ? '' : 'aviso'),
      api.etiquetaCatalogo('tiposJornada', x.tipo))},
    {clave: 'devengo', et: 'Sueldo del día', num: true, pinta: x => x.devengo ? eur2(x.devengo) : '—'},
    {clave: 'dietas', et: 'Dietas', num: true, pinta: x => x.dietas ? eur2(x.dietas) : '—'},
    {clave: 'comisiones', et: 'Comisiones', num: true, pinta: x => x.comisiones
      ? h('div', h('b', {estilo: {color: 'var(--bien)'}}, eur2(x.comisiones)),
          x.comisionado ? h('div', h('span.etiqueta.bien', {title: 'Ya pagada'}, '✓ Comisionado')) : null) : '—'},
    {clave: 'total_dia', et: 'Total', num: true, pinta: x => h('b', eur2(x.total_dia))},
    {clave: 'actividad', et: 'Actividad', noOrden: true, valor: x => x.sentadas + x.puertas + x.fichas,
     pinta: x => {
       const partes = [];
       if (x.puertas) partes.push(x.puertas + ' puertas');
       if (x.fichas) partes.push(x.fichas + ' fichas');
       if (x.sentadas) partes.push(x.sentadas + ' sentadas');
       if (x.ventas) partes.push(x.ventas + ' ventas');
       return partes.length ? h('span.nota', partes.join(' · ')) : '—';
     }},
    {clave: 'concepto_comision', et: 'Concepto', noOrden: true,
     pinta: x => x.concepto_comision ? h('span.nota', x.concepto_comision) : '—'}
  ], d.dias, {csv: 'devengo_' + d.persona.usuario + '.csv', vacio: 'Sin días en el rango.',
    pie: [{texto: 'Totales', colspan: 2}, {texto: eur2(t.devengo), num: true},
          {texto: eur2(t.dietas), num: true}, {texto: eur2(t.comisiones), num: true},
          {texto: eur2(t.bruto_periodo), num: true}, {texto: '', colspan: 2}]});

  const hastaPag = txt(d.comisionado_hasta);
  return h('div',
    hastaPag ? h('p.nota.ci-alerta-ok', {estilo: {background: 'var(--bien-b)', borderLeft: '4px solid var(--lima-osc)', padding: '8px 12px', borderRadius: '6px', margin: '0 0 10px'}},
      '✓ Todas las comisiones hasta el ' + fechaCorta(hastaPag) + ' (incluido) ya están comisionadas, para todo el equipo.') : null,
    kpis(
      kpi('Devengado', eur2(t.bruto_periodo), fechaCorta(d.desde) + ' — ' + fechaCorta(d.hasta)),
      kpi('Sueldo', eur2(t.devengo), miles(t.laborables) + ' días trabajados'),
      kpi('Comisiones', eur2(t.comisiones), num(t.comisiones_comisionadas)
        ? (num(t.comisiones_pendientes) ? eur2(t.comisiones_comisionadas) + ' ya comisionado · ' + eur2(t.comisiones_pendientes) + ' pendiente' : '✓ Todo ya comisionado')
        : 'en el periodo'),
      kpi('Neto estimado', eur2(t.neto_periodo), 'tras IRPF y Seguridad Social')
    ),
    tarjeta('Día a día', tablaDias, {sinRelleno: true,
      subtitulo: 'Cálculo orientativo del CRM; la nómina buena es el PDF de arriba',
      acciones: [h('button.btn.mini', {onclick: () => tablaDias.exportar && tablaDias.exportar()},
        'Exportar CSV')]}));
}
