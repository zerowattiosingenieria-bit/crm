/* vistas/controlsub.js — Control de subcontratas de un vistazo (25/11/2026, Nando).
   Solo Nando, Fernando y el superadmin (permiso «controlsub»). Semáforo por subcontrata, tablero
   de obras por estado, incidencias y mensajes, próximos 14 días y actividad. Desde aquí se les
   manda un mensaje o un documento, se les aclara cómo hacer la instalación (instrucciones de la
   obra) y se responden o resuelven sus incidencias. */
import {h, poner, txt, fechaCorta, hoyISO, sumarDias, telHref, normal} from '../util.js';
import * as api from '../api.js';
import {cargando, ventana, aviso, avisoError} from '../ui.js';

const SEM = {verde: ['#2f9e44', 'Todo bien', '🟢'], ambar: ['#e8890c', 'Revisar', '🟠'], rojo: ['#d63b30', 'Problemas', '🔴']};
const ESP = {fotovoltaica: '☀️ Fotovoltaica', aerotermia: '🌀 Aerotermia'};
const COLS = [['pendiente', 'Sin asignar', '#8a8f80'], ['asignada', 'Asignadas', '#2f6fd6'], ['en_curso', 'En curso', '#5E8C00'], ['terminada', 'Por validar', '#e8890c']];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function estilos() {
  if (document.getElementById('cs-css')) return;
  const css = `
  .cs-top { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .cs-sem { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--linea, #e3e7e0); border-radius: 16px; padding: 12px 16px; flex: 1; min-width: 150px; }
  .cs-sem .b { width: 14px; height: 14px; border-radius: 50%; } .cs-sem .n { font-size: 28px; font-weight: 800; line-height: 1; } .cs-sem .t { font-size: 13px; color: #6b6f66; font-weight: 700; }
  .cs-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .cs-kpi { background: #fff; border: 1px solid var(--linea, #e3e7e0); border-radius: 14px; padding: 12px 14px; cursor: default; border-top: 5px solid #ccc; }
  .cs-kpi .v { font-size: 30px; font-weight: 800; } .cs-kpi .t { font-size: 12.5px; color: #6b6f66; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
  .cs-h2 { display: flex; align-items: center; gap: 10px; margin: 22px 0 10px; font-size: 17px; }
  .cs-h2 .der { margin-left: auto; display: flex; gap: 6px; }
  .cs-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .cs-card { background: #fff; border: 1px solid var(--linea, #e3e7e0); border-radius: 18px; padding: 14px; border-top: 6px solid #ccc; display: flex; flex-direction: column; gap: 10px; }
  .cs-card .cab { display: flex; gap: 10px; align-items: center; }
  .cs-card .cab b { font-size: 16px; } .cs-card .cab .esp { font-size: 12.5px; color: #6b6f66; }
  .cs-card .luz { margin-left: auto; font-weight: 800; font-size: 12px; padding: 4px 10px; border-radius: 99px; color: #fff; background: #888; white-space: nowrap; }
  .cs-mini { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center; }
  .cs-mini div { background: #f4f6f3; border-radius: 10px; padding: 6px 2px; } .cs-mini b { display: block; font-size: 19px; } .cs-mini span { font-size: 11px; color: #6b6f66; }
  .cs-mot { font-size: 12.5px; color: #8a5300; background: #fff6e6; border-radius: 10px; padding: 7px 10px; } .cs-mot.rojo { color: #a52a20; background: #fde9e6; }
  .cs-mot div + div { margin-top: 3px; }
  .cs-pie { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 12px; color: #6b6f66; }
  .cs-pie .esp { flex: 1; }
  .cs-board { display: grid; grid-template-columns: repeat(4, minmax(220px, 1fr)); gap: 10px; overflow-x: auto; padding-bottom: 6px; }
  .cs-col { background: #eef1ec; border-radius: 16px; padding: 10px; min-height: 120px; }
  .cs-col h3 { margin: 2px 4px 10px; font-size: 14px; display: flex; gap: 8px; align-items: center; }
  .cs-col h3 i { width: 10px; height: 10px; border-radius: 50%; } .cs-col h3 span { margin-left: auto; background: #fff; border-radius: 99px; padding: 1px 9px; font-size: 12px; }
  .cs-obra { background: #fff; border-radius: 12px; padding: 10px; margin-bottom: 8px; cursor: pointer; border: 1.5px solid transparent; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .cs-obra:hover { border-color: #242422; }
  .cs-obra b { display: block; font-size: 13.5px; } .cs-obra .s { font-size: 12px; color: #6b6f66; margin-top: 2px; }
  .cs-obra .bar { height: 7px; background: #eef1ec; border-radius: 99px; margin-top: 8px; overflow: hidden; } .cs-obra .bar i { display: block; height: 100%; background: #5E8C00; }
  .cs-badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
  .cs-bd { font-size: 11px; font-weight: 800; border-radius: 99px; padding: 2px 8px; background: #eef0ec; } .cs-bd.r { background: #fde4e1; color: #a52a20; } .cs-bd.v { background: #e6f4d7; color: #3f6b00; } .cs-bd.a { background: #fff1d6; color: #8a5300; }
  .cs-vivo { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #2f9e44; margin-right: 4px; animation: csl 1.4s infinite; } @keyframes csl { 50% { opacity: .3; } }
  .cs-tk { display: flex; gap: 10px; align-items: center; background: #fff; border: 1px solid var(--linea, #e3e7e0); border-left: 6px solid #ccc; border-radius: 14px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; }
  .cs-tk .q { flex: 1; min-width: 0; } .cs-tk .q b { display: block; } .cs-tk .q span { font-size: 12.5px; color: #6b6f66; }
  .cs-dias { display: grid; grid-template-columns: repeat(14, minmax(104px, 1fr)); gap: 6px; overflow-x: auto; }
  .cs-dia { background: #fff; border: 1px solid var(--linea, #e3e7e0); border-radius: 12px; padding: 6px; min-height: 90px; }
  .cs-dia.hoy { border: 2px solid #B4FA1E; } .cs-dia.finde { background: #f7f8f5; }
  .cs-dia .d { font-size: 11px; font-weight: 800; color: #6b6f66; text-transform: uppercase; } .cs-dia .d b { font-size: 16px; color: #242422; }
  .cs-dia .o { font-size: 10.5px; line-height: 1.25; border-radius: 8px; padding: 4px 6px; margin-top: 4px; color: #fff; cursor: pointer; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .cs-act { background: #fff; border: 1px solid var(--linea, #e3e7e0); border-radius: 14px; padding: 4px 12px; }
  .cs-act div { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid #eef1ec; font-size: 13px; } .cs-act div:last-child { border-bottom: 0; }
  .cs-act time { color: #8a8f80; white-space: nowrap; min-width: 92px; }
  .cs-chat { max-height: 320px; overflow: auto; display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
  .cs-msg { max-width: 80%; padding: 8px 12px; border-radius: 14px; background: #f1f3ef; font-size: 13.5px; white-space: pre-wrap; } .cs-msg.zw { align-self: flex-end; background: #242422; color: #fff; }
  .cs-msg small { display: block; opacity: .65; font-size: 11px; margin-bottom: 2px; } .cs-msg.int { background: #fff6e6; color: #8a5300; }
  .cs-filtro { font-size: 13px; background: #242422; color: #B4FA1E; border-radius: 99px; padding: 4px 12px; font-weight: 700; display: inline-flex; gap: 8px; align-items: center; }
  .cs-filtro button { background: none; border: 0; color: #fff; cursor: pointer; font-size: 14px; }
  `;
  document.head.appendChild(Object.assign(document.createElement('style'), {id: 'cs-css', textContent: css}));
}

export async function vistaControlSub() {
  estilos();
  const caja = h('div', cargando('Mirando cómo van las subcontratas…'));
  let D = null, filtro = '';
  async function cargar() {
    try { D = await api.pedir('controlSubcontratas'); } catch (e) { return poner(caja, h('p.nota', e.message)); }
    pinta();
  }
  const nombreContrata = id => (D.contratas.find(k => k.id === id) || {}).nombre || 'Sin instalador';
  const colorContrata = id => { const i = D.contratas.findIndex(k => k.id === id); return ['#5E8C00', '#2f6fd6', '#9c6ade', '#e8890c', '#242422', '#2f9e44', '#d63b30'][(i < 0 ? 6 : i) % 7]; };

  function pinta() {
    const ks = D.contratas.filter(k => k.activo);
    const n = c => ks.filter(k => k.semaforo === c).length;
    const obras = D.obras.filter(o => o.estado !== 'cancelada' && (!filtro || o.contrata_id === filtro));
    const vivas = D.obras.filter(o => ['asignada', 'en_curso', 'terminada'].includes(o.estado));
    const tAbiertos = D.tickets.filter(t => ['abierto', 'en_curso'].includes(t.estado) && t.contrata_id);
    const kpi = (t, v, c) => h('.cs-kpi', {estilo: {'border-top-color': c}}, h('.v', String(v)), h('.t', t));
    poner(caja,
      h('.cs-top', ['verde', 'ambar', 'rojo'].map(c => h('.cs-sem', h('.b', {estilo: {background: SEM[c][0]}}), h('div', h('.n', String(n(c))), h('.t', SEM[c][1]))))),
      h('.cs-kpis',
        kpi('Trabajando ahora', vivas.filter(o => o.en_obra).length, '#2f9e44'),
        kpi('Obras en curso', vivas.filter(o => o.estado === 'en_curso').length, '#5E8C00'),
        kpi('Asignadas sin empezar', vivas.filter(o => o.estado === 'asignada').length, '#2f6fd6'),
        kpi('Retrasadas', vivas.filter(o => o.retraso_dias > 0).length, '#d63b30'),
        kpi('Por validar', vivas.filter(o => o.estado === 'terminada').length, '#e8890c'),
        kpi('Incidencias abiertas', tAbiertos.filter(t => t.origen !== 'zw').length, '#d63b30'),
        kpi('Sin instalador', D.pendientes.length, '#8a8f80')),
      h('h2.cs-h2', '👷 Subcontratas', h('.der', h('button.btn.primario', {onclick: () => mensaje()}, '✉ Mandar un mensaje'))),
      ks.length ? h('.cs-cards', ks.map(tarjetaContrata)) : h('p.nota', 'Todavía no hay subcontratas dadas de alta.'),
      h('h2.cs-h2', '🏗 Obras', filtro ? h('span.cs-filtro', nombreContrata(filtro), h('button', {onclick: () => { filtro = ''; pinta(); }, title: 'Quitar filtro'}, '✕')) : null),
      h('.cs-board', COLS.map(([k, et, c]) => {
        const l = k === 'pendiente' ? (filtro ? [] : D.pendientes) : obras.filter(o => o.estado === k);
        return h('.cs-col', h('h3', h('i', {estilo: {background: c}}), et, h('span', String(l.length))),
          l.length ? l.map(o => k === 'pendiente' ? tarjetaPendiente(o) : tarjetaObra(o)) : h('p.nota', {estilo: {textAlign: 'center', margin: '18px 0'}}, '—'));
      })),
      h('h2.cs-h2', '💬 Incidencias y mensajes', h('span.nota', 'primero lo que espera respuesta')),
      tAbiertos.length ? h('div', ordenTickets(tAbiertos).map(filaTicket)) : h('p.nota', '✓ No hay incidencias ni mensajes abiertos.'),
      h('h2.cs-h2', '📅 Próximos 14 días'), calendario(),
      h('h2.cs-h2', '⚡ Lo que han hecho esta semana'),
      D.actividad.length ? h('.cs-act', D.actividad.slice(0, 25).map(a => h('div', h('time', fechaCorta(a.fecha) + ' ' + a.fecha.slice(11, 16)),
        h('span', h('b', nombreContrata(a.contrata_id)), ' · ', (D.obras.find(o => o.id === a.obra_id) || {}).direccion || '', ' — ', a.detalle || a.tipo)))) : h('p.nota', 'Sin actividad en los últimos 7 días.'));
  }

  function tarjetaContrata(k) {
    const [c, et] = SEM[k.semaforo] || SEM.verde;
    return h('.cs-card', {estilo: {'border-top-color': c}},
      h('.cab', h('div', h('b', k.nombre), h('.esp', ESP[k.especialidad] || k.especialidad, k.contacto ? ' · ' + k.contacto : '')), h('span.luz', {estilo: {background: c}}, et)),
      h('.cs-mini', [['En obra ahora', k.en_obra], ['Activas', k.activas], ['Retrasadas', k.retrasadas], ['Terminadas', k.terminadas]].map(([t, v]) => h('div', h('b', {estilo: {color: t === 'Retrasadas' && v ? '#d63b30' : null}}, String(v)), h('span', t)))),
      k.motivos.length ? h('.cs-mot' + (k.semaforo === 'rojo' ? '.rojo' : ''), k.motivos.map(m => h('div', '⚠ ' + m))) : h('.cs-mot', {estilo: {background: '#eef7e4', color: '#3f6b00'}}, '✓ Al día: sin retrasos, sin incidencias y con la documentación en regla.'),
      h('.cs-pie', h('span', '🕑 ' + (k.ultimo_acceso ? 'Entró ' + haceTexto(k.ultimo_acceso) : 'Nunca ha entrado')), h('span', '· ' + k.actividad_7d + ' acciones esta semana'), h('span.esp'),
        k.telefono ? h('a.btn.mini', {href: telHref(k.telefono), title: 'Llamar'}, '📞') : null,
        h('button.btn.mini', {onclick: () => { filtro = k.id; pinta(); }}, 'Ver obras'),
        h('button.btn.mini.primario', {onclick: () => mensaje(k.id)}, '✉ Mensaje')));
  }

  function haceTexto(iso) { const d = Math.round((new Date(hoyISO() + 'T12:00') - new Date(iso.slice(0, 10) + 'T12:00')) / 86400000); return d <= 0 ? 'hoy a las ' + iso.slice(11, 16) : d === 1 ? 'ayer' : 'hace ' + d + ' días'; }

  function tarjetaObra(o) {
    return h('.cs-obra', {onclick: () => abrirObra(o)},
      h('b', o.direccion || o.cliente), h('.s', o.cliente),
      h('.cs-badges', h('span.cs-bd', {estilo: {background: colorContrata(o.contrata_id), color: '#fff'}}, nombreContrata(o.contrata_id)),
        h('span.cs-bd', ESP[o.especialidad] || o.especialidad),
        o.en_obra ? h('span.cs-bd.v', h('span.cs-vivo'), 'En obra ahora') : null,
        o.retraso_dias > 0 ? h('span.cs-bd.r', '⏰ ' + o.retraso_dias + ' días de retraso') : null,
        o.fecha_prevista ? h('span.cs-bd', '📅 ' + fechaCorta(o.fecha_prevista)) : null,
        (o.avisos || []).some(a => !a.hecho && a.vencido) ? h('span.cs-bd.a', '🔔 aviso vencido') : null),
      o.estado === 'en_curso' || o.progreso ? h('.bar', h('i', {estilo: {width: (o.progreso || 0) + '%'}})) : null,
      o.estado === 'en_curso' || o.progreso ? h('.s', (o.progreso || 0) + ' % hecho') : null);
  }

  function tarjetaPendiente(p) {
    return h('.cs-obra', {onclick: () => { location.hash = '#subcontratas'; }, title: 'Asignar en Obras de subcontratas'},
      h('b', p.direccion || p.cliente), h('.s', p.cliente),
      h('.cs-badges', p.especialidades.map(e => h('span.cs-bd', ESP[e] || e)), p.fecha_prevista ? h('span.cs-bd.a', '📅 ' + fechaCorta(p.fecha_prevista)) : h('span.cs-bd', 'sin fecha'),
        h('span.cs-bd.r', 'Falta instalador')));
  }

  function ordenTickets(l) {
    const peso = t => t.fuera_de_plazo && t.origen !== 'zw' ? 0 : esperando(t) ? 1 : 2;
    return l.slice().sort((a, b) => peso(a) - peso(b) || String(b.modificado).localeCompare(String(a.modificado)));
  }
  const esperando = t => { const m = t.mensajes || []; return m.length && m[m.length - 1].de !== 'zw'; };
  function filaTicket(t) {
    const c = t.fuera_de_plazo && t.origen !== 'zw' ? '#d63b30' : esperando(t) ? '#e8890c' : '#2f9e44';
    const ult = (t.mensajes || [])[t.mensajes.length - 1] || {};
    return h('.cs-tk', {estilo: {'border-left-color': c}, onclick: () => abrirTicket(t)},
      h('.q', h('b', (t.origen === 'zw' ? '✉ ' : '⚠ ') + t.titulo),
        h('span', nombreContrata(t.contrata_id) + (t.cliente ? ' · ' + t.cliente : '') + ' · ' + (esperando(t) ? 'Esperando tu respuesta' : 'Contestado por Zero Wattios') + ' · ' + fechaCorta(t.modificado))),
      h('span.cs-bd' + (c === '#d63b30' ? '.r' : c === '#e8890c' ? '.a' : '.v'), t.fuera_de_plazo && t.origen !== 'zw' ? 'Fuera de plazo' : esperando(t) ? 'Responder' : 'Al día'),
      h('span', {estilo: {fontSize: '12px', color: '#8a8f80', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}, ult.texto || ''));
  }

  function calendario() {
    const hoy = hoyISO();
    const vivas = D.obras.filter(o => ['asignada', 'en_curso'].includes(o.estado) && o.fecha_prevista);
    return h('.cs-dias', Array.from({length: 14}, (_, i) => {
      const d = sumarDias(hoy, i); const dt = new Date(d + 'T12:00'); const dw = dt.getDay();
      const del = vivas.filter(o => o.fecha_prevista === d);
      return h('.cs-dia' + (i === 0 ? '.hoy' : '') + (dw === 0 || dw === 6 ? '.finde' : ''), h('.d', DIAS[dw] + ' ', h('b', String(dt.getDate()))),
        del.map(o => h('.o', {estilo: {background: colorContrata(o.contrata_id)}, title: o.direccion + ' · ' + nombreContrata(o.contrata_id), onclick: () => abrirObra(o)}, (o.especialidad === 'aerotermia' ? '🌀 ' : '☀️ ') + (o.direccion || o.cliente))));
    }));
  }

  /* ---------- obra: detalle, instrucciones y documentos para el instalador ---------- */
  function abrirObra(o) {
    const ins = h('textarea', {rows: 6, estilo: {width: '100%'}, placeholder: 'Ej.: el inversor va en el garaje, pared izquierda; la línea sube por el patio; la llave está con el vecino del 2º…'}, o.instrucciones || '');
    const avisos = (o.avisos || []);
    const {cerrar} = ventana({titulo: (o.direccion || o.cliente), ancha: true, cuerpo: h('div',
      h('.cs-badges', h('span.cs-bd', {estilo: {background: colorContrata(o.contrata_id), color: '#fff'}}, nombreContrata(o.contrata_id)), h('span.cs-bd', ESP[o.especialidad] || ''),
        h('span.cs-bd', (COLS.find(c => c[0] === o.estado) || [0, o.estado])[1]), o.fecha_prevista ? h('span.cs-bd', '📅 ' + fechaCorta(o.fecha_prevista)) : null,
        o.retraso_dias > 0 ? h('span.cs-bd.r', '⏰ ' + o.retraso_dias + ' días de retraso') : null, o.en_obra ? h('span.cs-bd.v', h('span.cs-vivo'), 'En obra ahora') : null),
      h('div', {estilo: {margin: '12px 0'}}, h('div', {estilo: {display: 'flex', justifyContent: 'space-between', fontSize: '13px'}}, h('b', 'Avance'), h('b', (o.progreso || 0) + ' %')),
        h('.cs-obra', {estilo: {cursor: 'default', padding: 0, boxShadow: 'none'}}, h('.bar', {estilo: {height: '12px'}}, h('i', {estilo: {width: (o.progreso || 0) + '%'}})))),
      o.cliente ? h('p', {estilo: {margin: '0 0 8px', fontSize: '13px'}}, '👤 ', o.cliente, o.telefono ? ' · ' : '', o.telefono ? h('a', {href: telHref(o.telefono)}, o.telefono) : null) : null,
      o.ultima_actividad ? h('p.nota', 'Último movimiento: ' + o.ultima_actividad) : null,
      avisos.length ? h('div', {estilo: {margin: '8px 0'}}, h('b', 'Avisos'), avisos.map(a => h('div', {estilo: {fontSize: '13px'}}, (a.hecho ? '✅ ' : a.vencido ? '🔴 ' : '⏳ ') + a.texto + (a.fecha ? ' · ' + fechaCorta(a.fecha) : '')))) : null,
      h('h3', {estilo: {margin: '14px 0 6px'}}, '🛠 Cómo hacer la instalación (lo ve el instalador en la ficha de la obra)'), ins),
      acciones: [
        h('button.btn', {onclick: () => { cerrar(); mensaje(o.contrata_id, o); }}, '📎 Mandar documento o mensaje'),
        h('button.btn', {onclick: () => { location.hash = '#subcontratas/' + o.id; cerrar(); }}, 'Ficha completa'),
        h('button.btn.primario', {onclick: async ev => { ev.currentTarget.disabled = true;
          try { await api.pedir('instruccionesObra', {obra_id: o.id, instrucciones: ins.value}); aviso('Instrucciones guardadas: el instalador ya las ve', 'ok'); cerrar(); cargar(); }
          catch (e) { avisoError(e); ev.currentTarget.disabled = false; } }}, 'Guardar instrucciones')]});
  }

  /* ---------- mandar algo a una subcontrata ---------- */
  function mensaje(contrataId, obra) {
    const selK = h('select', D.contratas.filter(k => k.activo).map(k => h('option', {value: k.id, selected: k.id === contrataId ? true : null}, k.nombre)));
    const selO = h('select');
    const llenarObras = () => {
      poner(selO, h('option', {value: ''}, '— Mensaje general (sin obra) —'),
        D.obras.filter(o => o.contrata_id === selK.value && o.estado !== 'cancelada').map(o => h('option', {value: o.id, selected: obra && obra.id === o.id ? true : null}, (o.direccion || o.cliente) + ' · ' + (ESP[o.especialidad] || ''))));
    };
    selK.onchange = llenarObras; llenarObras();
    const tit = h('input', {placeholder: 'Asunto (p. ej. «Cambio de ubicación del inversor»)'});
    const tx = h('textarea', {rows: 5, placeholder: 'Escribe aquí lo que les quieras decir…'});
    const prio = h('select', h('option', {value: 'media'}, 'Normal'), h('option', {value: 'urgente'}, 'Urgente'), h('option', {value: 'baja'}, 'Sin prisa'));
    const arch = h('input', {type: 'file', accept: 'application/pdf,image/*'});
    const campo = (et, el) => h('label', {estilo: {display: 'grid', gap: '4px', fontSize: '13px', fontWeight: 700}}, et, el);
    const {cerrar} = ventana({titulo: '✉ Mandar a una subcontrata', ancha: true, cuerpo: h('div', {estilo: {display: 'grid', gap: '10px'}},
      h('div', {estilo: {display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: '10px'}}, campo('Subcontrata', selK), campo('Obra', selO), campo('Prioridad', prio)),
      campo('Asunto', tit), campo('Mensaje', tx),
      campo('Documento (opcional: plano, esquema, foto, ficha técnica · solo si eliges obra)', arch),
      h('p.nota', 'Les sale en su app, en «Tickets», y pueden contestarte desde ahí. Te llegará aviso cuando respondan.')),
      acciones: [h('button.btn.primario', {onclick: async ev => {
        const b = ev.currentTarget; b.disabled = true;
        try {
          const p = {contrata_id: selK.value, obra_id: selO.value, titulo: tit.value, texto: tx.value, prioridad: prio.value};
          const f = arch.files[0];
          if (f) {
            if (!selO.value) throw new Error('Para mandar un documento elige la obra.');
            if (f.size > 15 * 1024 * 1024) throw new Error('El archivo pasa de 15 MB.');
            p.datos = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = mal; r.readAsDataURL(f); });
            p.nombre = f.name; p.mime = f.type || 'application/pdf';
          }
          await api.pedir('mensajeContrata', p);
          aviso('Mandado ✓ Les aparece en su app', 'ok'); cerrar(); cargar();
        } catch (e) { avisoError(e); b.disabled = false; }
      }}, 'Mandar')]});
  }

  /* ---------- incidencia o conversación ---------- */
  function abrirTicket(t) {
    const tx = h('textarea', {rows: 3, estilo: {width: '100%'}, placeholder: 'Escribe la respuesta o cómo resolverlo…'});
    const responder = async (estado, b) => {
      b.disabled = true;
      try {
        if (!tx.value.trim() && !estado) throw new Error('Escribe la respuesta.');
        await api.pedir('ticketControl', {id: t.id, texto: tx.value, para: 'contrata', estado: estado || undefined});
        aviso(estado === 'resuelto' ? 'Marcada como resuelta ✓' : 'Respuesta enviada ✓', 'ok'); cerrar(); cargar();
      } catch (e) { avisoError(e); b.disabled = false; }
    };
    const {cerrar} = ventana({titulo: (t.origen === 'zw' ? '✉ ' : '⚠ ') + t.titulo, ancha: true, cuerpo: h('div',
      h('p.nota', {estilo: {marginTop: 0}}, nombreContrata(t.contrata_id) + (t.cliente ? ' · ' + t.cliente : '') + ' · abierta el ' + fechaCorta(t.creado) +
        (t.origen !== 'zw' ? ' · resolver antes del ' + fechaCorta(t.limite_resolucion) + ' ' + String(t.limite_resolucion).slice(11, 16) : '')),
      h('.cs-chat', (t.mensajes || []).map(m => h('.cs-msg' + (m.de === 'zw' ? (m.interno ? '.int' : '.zw') : ''), h('small', (m.autor || m.de) + ' · ' + fechaCorta(m.fecha) + ' ' + String(m.fecha).slice(11, 16) + (m.interno ? ' · nota interna' : '')), m.texto))),
      tx),
      acciones: [
        h('button.btn', {onclick: ev => responder('resuelto', ev.currentTarget)}, '✅ Resolver y cerrar'),
        h('button.btn.primario', {onclick: ev => responder('', ev.currentTarget)}, 'Responder')]});
    setTimeout(() => { const c = document.querySelector('.cs-chat'); if (c) c.scrollTop = c.scrollHeight; }, 50);
  }

  cargar();
  return caja;
}
