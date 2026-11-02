/* vistas/ficha-cliente.js — un cliente, una ficha (02/11/2026).
 *
 * Orden de Nando: «todo dentro de la ficha del cliente, sin duplicar cosas,
 * todo enlazado y fácil de introducir». Aquí vive lo que lo hace posible:
 *  - Aviso de cliente repetido mientras se escribe el teléfono o la calle.
 *  - Un solo botón «+ Apuntar» con todo lo que se puede apuntar.
 *  - El historial único: contactos, comentarios, citas e instalaciones.
 *  - Todas las citas del cliente (antes solo se veía la primera).
 *  - Qué falta por meter, con el botón que lo abre.
 *  - Para dirección, las fichas repetidas y el botón de fusionarlas.
 */

import {h, poner, txt, num, eur, fechaCorta, fechaLarga, normal, hoyISO, etiquetaCliente} from '../util.js';
import * as api from '../api.js';
import {tarjeta, marca, etiquetaEstado, ventana, ventanaFormulario, aviso, avisoError, confirmar} from '../ui.js';

/* ---------- duplicados (mismo criterio que el servidor) ---------- */

export const telefono9 = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
export const direccionClave = dir => {
  const n = normal(dir)
    .replace(/\b(calle|c|cl|avenida|avda|av|plaza|pza|pl|paseo|po|camino|cm|urb|urbanizacion|carretera|ctra)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '');
  return /\d/.test(n) && n.length >= 6 ? n : '';
};

/** Entre los clientes que ve este usuario, el que coincide en teléfono o casa. */
export function duplicadoLocal(d, salvoId) {
  const tel = telefono9(d.telefono), dir = direccionClave(d.direccion), mun = normal(d.municipio);
  if (!tel && !dir) return null;
  const otros = api.estado.clientes.filter(c => String(c.id) !== String(salvoId || ''));
  const porTel = tel && otros.find(c => telefono9(c.telefono) === tel);
  if (porTel) return {cliente: porTel, por: 'teléfono'};
  const porDir = dir && otros.find(c => direccionClave(c.direccion) === dir &&
    (!mun || !normal(c.municipio) || normal(c.municipio) === mun));
  return porDir ? {cliente: porDir, por: 'dirección'} : null;
}

/**
 * Debajo de un formulario de alta: en cuanto el teléfono o la calle
 * coinciden con alguien que ya está, lo dice y deja abrir su ficha.
 * `alAbrir(id)` cierra el formulario y lleva a la ficha.
 */
export function avisoDuplicadoVivo(f, {salvoId, alAbrir, textoCita} = {}) {
  const caja = h('div', {estilo: {gridColumn: '1 / -1'}});
  const mira = () => {
    const d = f.leer();
    const dup = duplicadoLocal(d, salvoId);
    if (!dup) return poner(caja);
    poner(caja, h('.aviso-duplicado',
      h('b', '⚠ Ya está en el CRM por el ' + dup.por + ': '), etiquetaCliente(dup.cliente) + ' (' + dup.cliente.id + ').',
      h('div.nota', textoCita || 'No hace falta darlo de alta otra vez: abre su ficha y apunta ahí lo nuevo.'),
      alAbrir ? h('button.btn.mini', {type: 'button', estilo: {marginTop: '6px'},
        onclick: () => alAbrir(dup.cliente.id)}, 'Abrir su ficha') : null));
  };
  ['telefono', 'direccion', 'municipio'].forEach(id => {
    const n = f.nodos[id] && f.nodos[id].control;
    if (n) { n.addEventListener('change', mira); n.addEventListener('input', mira); }
  });
  return caja;
}

/** Cuando el servidor dice «ya existe»: ventana con su ficha y, para dirección, crear igualmente. */
export function ventanaYaExiste(e, {ir, forzar}) {
  const dup = (e && e.datos && e.datos.duplicado) || null;
  if (!dup) return false;
  const v = ventana({
    titulo: 'Este cliente ya está en el CRM',
    cuerpo: h('div', h('p', e.message),
      h('p.nota', 'Así no hay dos fichas del mismo cliente con los datos repartidos.')),
    acciones: [
      h('button.btn', {onclick: () => v.cerrar()}, 'Cancelar'),
      forzar && api.puede('editarTodo') ? h('button.btn', {onclick: async () => { v.cerrar(); await forzar(); }},
        'Es otra vivienda: crear igualmente') : null,
      dup.visible && ir ? h('button.btn.primario', {onclick: () => { v.cerrar(); ir('cliente/' + dup.id); }}, 'Abrir su ficha') : null
    ].filter(Boolean)
  });
  return true;
}

/* ---------- qué falta por meter ---------- */

export function faltaPorMeter(c, {editarContacto, editarVivienda, irA}) {
  const op = api.operacionesDe(c.id)[0];
  const f = [];
  if (!telefono9(c.telefono)) f.push(['Teléfono', editarContacto]);
  if (!txt(c.direccion)) f.push(['Dirección', editarContacto]);
  if (!txt(c.municipio)) f.push(['Municipio', editarContacto]);
  if (!num(c.m2)) f.push(['m² (del Catastro)', editarVivienda]);
  if (!num(c.gasto_luz_mes)) f.push(['Gasto de luz', editarVivienda]);
  if (!txt(c.calefaccion)) f.push(['Calefacción actual', editarVivienda]);
  if (txt(c.calefaccion) && !/sin calef|electrica|bomba/.test(normal(c.calefaccion)) && !num(c.gasto_combustible))
    f.push(['Gasto en ' + txt(c.calefaccion).toLowerCase(), editarVivienda]);
  if (!txt(c.proxima_fecha) && !['ganado', 'perdido'].includes(normal(c.estado))) f.push(['Próximo paso con fecha', () => irA('apuntar')]);
  if (op && !num(op.total)) f.push(['Importe de la instalación', () => irA('instalaciones')]);
  return f;
}

/* ---------- el único botón de apuntar ---------- */

export function menuApuntar(c, {contacto, comentario, cita, instalacion, visita}) {
  const opcion = (icono, titulo, texto, fn) => h('button.opcion-apuntar', {onclick: () => { v.cerrar(); fn(); }},
    h('span.icono', icono), h('span', h('b', titulo), h('div.nota', texto)));
  const v = ventana({
    titulo: 'Apuntar en ' + etiquetaCliente(c),
    cuerpo: h('.lista-apuntar',
      opcion('📞', 'Una llamada, un WhatsApp o un correo', 'Qué ha pasado y el próximo paso. Sale en el historial y mueve la fecha del cliente.', contacto),
      opcion('📋', 'La visita (estoy en casa del cliente)', 'Fotos, facturas, nota dictada y resultado de la cita, todo de una vez.', visita),
      opcion('📅', 'Una cita', 'Comprueba la agenda del comercial (1 h 45 min por visita más el coche).', cita),
      opcion('✎', 'Mi comentario sobre el cliente', 'Lo que el equipo tiene que saber, en dos líneas. Sale en el listado.', comentario),
      ...(instalacion ? [opcion('⚡', 'Una instalación (propuesta o venta)', 'Equipos, importes con IVA y forma de pago.', instalacion)] : []))
  });
  return v;
}

/* ---------- historial único ---------- */

const CLASE = {contacto: 'Contactos', cita: 'Citas', instalacion: 'Instalación', comentario: 'Comentarios'};

export function sucesosDe(c) {
  const ev = [];
  api.seguimientoDe(c.id).forEach(s => {
    const com = txt(s.origen) === 'comentario';
    ev.push({fecha: txt(s.fecha), tipo: com ? 'comentario' : 'contacto',
      titulo: (com ? 'Comentario' : api.etiquetaCatalogo('canales', s.canal)) + ' · ' + api.nombrePersona(s.usuario_id) +
        (txt(s.origen) === 'parte' ? ' · desde el parte' : ''),
      texto: txt(s.nota),
      pie: txt(s.proximo_paso) ? '→ ' + s.proximo_paso + (txt(s.proxima_fecha) ? ' · ' + fechaCorta(s.proxima_fecha) : '') : '',
      estado: txt(s.estado_resultante)});
  });
  api.captacionesDe(c.id).forEach(k => {
    ev.push({fecha: txt(k.fecha).slice(0, 10), tipo: 'cita',
      titulo: 'Cita' + (txt(k.hora_cita) ? ' a las ' + k.hora_cita : '') + ' · ' +
        (txt(k.comercial_id) ? api.nombrePersona(k.comercial_id) : 'sin comercial') +
        (txt(k.captador_id) ? ' · captó ' + api.nombrePersona(k.captador_id) : ''),
      texto: [api.etiquetaCatalogo('resultadosCaptacion', k.resultado), txt(k.tecnologia),
        num(k.interes) ? 'interés ' + num(k.interes) + '/10' : ''].filter(Boolean).join(' · '),
      pie: txt(k.notas)});
  });
  api.operacionesDe(c.id).forEach(o => {
    const nombre = api.etiquetaCatalogo('tiposOperacion', o.tipo) + (num(o.total) ? ' · ' + eur(o.total) : '');
    [['fecha_propuesta', 'Propuesta'], ['fecha_firma', 'Firma'], ['fecha_instalacion', 'Instalación'],
     ['fecha_legalizacion', 'Legalización']].forEach(([k, et]) => {
      if (txt(o[k])) ev.push({fecha: txt(o[k]).slice(0, 10), tipo: 'instalacion', titulo: et + ' · ' + nombre,
        texto: k === 'fecha_firma' ? [txt(o.forma_pago), txt(o.financiera)].filter(Boolean).join(' · ') : ''});
    });
    if (txt(o.fecha_prevista_instalacion) && !txt(o.fecha_instalacion) && txt(o.fecha_prevista_instalacion) >= hoyISO())
      ev.push({fecha: txt(o.fecha_prevista_instalacion).slice(0, 10), tipo: 'instalacion', titulo: 'Instalación prevista · ' + nombre, texto: ''});
  });
  return ev.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function panelHistorial(c, {apuntar}) {
  const todos = sucesosDe(c);
  let filtro = '';
  const lista = h('div');
  const chips = h('.acciones', {estilo: {marginBottom: '10px'}});
  const pinta = () => {
    const ver = todos.filter(e => !filtro || e.tipo === filtro);
    poner(lista, ver.length ? h('ul.linea-tiempo', ver.map(e => h('li', {'data-tipo': e.tipo},
      h('.cuando', (e.fecha ? fechaCorta(e.fecha) : 'sin fecha') + (e.fecha > hoyISO() ? ' · próximamente' : '') + ' · ' + e.titulo),
      e.texto ? h('.que', e.texto) : null,
      e.pie ? h('.nota', e.pie) : null,
      e.estado ? h('div', {estilo: {marginTop: '4px'}}, etiquetaEstado(e.estado, api.etiquetaCatalogo('estadosCliente', e.estado))) : null)))
      : h('.vacio', 'Nada apuntado todavía.'));
    poner(chips, [['', 'Todo'], ...Object.entries(CLASE)].map(([k, et]) => {
      const n = k ? todos.filter(e => e.tipo === k).length : todos.length;
      return h('button.btn.mini' + (filtro === k ? '.primario' : ''), {onclick: () => { filtro = k; pinta(); }}, et + ' (' + n + ')');
    }));
  };
  pinta();
  return tarjeta('Todo lo que ha pasado con este cliente', h('div', chips, lista),
    {subtitulo: 'Contactos, comentarios, citas e instalación en una sola línea de tiempo',
     acciones: [h('button.btn.mini.lima', {onclick: apuntar}, '+ Apuntar')]});
}

/* ---------- todas las citas ---------- */

export function panelCitas(c, {refrescar, nuevaCita}) {
  const citas = api.captacionesDe(c.id);
  const fila = k => h('li',
    h('.cuando', fechaLarga(k.fecha) + (txt(k.hora_cita) ? ' a las ' + k.hora_cita : '') + ' · ' +
      api.etiquetaCatalogo('estadosCita', k.estado_cita)),
    h('.que', [txt(k.comercial_id) ? 'Va ' + api.nombrePersona(k.comercial_id) : 'Sin comercial',
      txt(k.captador_id) ? 'captó ' + api.nombrePersona(k.captador_id) : '', txt(k.tecnologia)].filter(Boolean).join(' · ')),
    h('div', {estilo: {marginTop: '4px'}},
      marca(api.etiquetaCatalogo('resultadosCaptacion', k.resultado) || 'Pendiente',
        {venta: 'bien', sentada: 'info', potencial: 'aviso', no_sentada: 'mal'}[normal(k.resultado)] || ''),
      num(k.interes) ? ' ' : null, num(k.interes) ? marca('Interés ' + num(k.interes) + '/10') : null),
    txt(k.notas) ? h('.nota', k.notas) : null,
    h('.acciones', {estilo: {marginTop: '6px'}},
      h('button.btn.mini', {onclick: () => editarCita(k, c, refrescar)}, 'Resultado o cambio')));
  return tarjeta('Citas (' + citas.length + ')',
    citas.length ? h('ul.linea-tiempo', citas.map(fila)) : h('.vacio', 'Sin citas.'),
    {subtitulo: 'La de arriba es la que cuenta', acciones: [h('button.btn.mini.lima', {onclick: nuevaCita}, '+ Cita')]});
}

function editarCita(k, c, refrescar) {
  const comerciales = api.estado.usuarios.filter(u => ['comercial', 'admin', 'superadmin'].includes(u.rol)).map(u => [u.id, u.nombre]);
  return ventanaFormulario({
    titulo: 'Cita del ' + fechaCorta(k.fecha) + ' · ' + etiquetaCliente(c),
    campos: [
      {id: 'resultado', et: 'Cómo ha ido', tipo: 'select', opciones: api.opciones('resultadosCaptacion'), vacio: false},
      {id: 'interes', et: 'Interés (1-10)', tipo: 'numero', min: 1, max: 10, ayuda: 'Es el interés del cliente: se cambia también en su ficha'},
      {id: 'fecha', et: 'Día', tipo: 'fecha'},
      {id: 'hora_cita', et: 'Hora', tipo: 'hora'},
      {id: 'estado_cita', et: 'Estado de la cita', tipo: 'select', opciones: api.opciones('estadosCita'), vacio: false},
      ...(api.puede('editarTodo') ? [{id: 'comercial_id', et: 'Comercial', tipo: 'select', opciones: comerciales}] : []),
      {id: 'notas', et: 'Notas de la cita', tipo: 'area', ancho: 3}
    ],
    valores: Object.assign({}, k, {interes: k.interes || c.interes, resultado: k.resultado || 'pendiente'}),
    alGuardar: async d => {
      const r = await api.guardarCaptacion(Object.assign({id: k.id, cliente_id: c.id}, d,
        d.resultado !== k.resultado ? {fecha_resultado: hoyISO()} : {}));
      aviso(r.aviso_agenda ? 'Guardado. Ojo: ' + r.aviso_agenda : 'Cita guardada.', r.aviso_agenda ? 'error' : undefined);
      await refrescar();
    }
  });
}

/* ---------- vivienda y consumo: un solo formulario ---------- */

export const CAMPOS_VIVIENDA = ['tipo_vivienda', 'regimen', 'm2', 'personas', 'anyo', 'calefaccion', 'gasto_combustible',
  'periodo_combustible', 'gasto_luz_mes', 'comercializadora', 'cups', 'potencia_contratada', 'ya_fv'];
export const CAMPOS_CONTACTO = ['nombre', 'dni', 'cotitular', 'telefono', 'email', 'direccion', 'municipio', 'cp', 'coordenadas'];

/* ---------- fichas repetidas (dirección) ---------- */

export async function ventanaRepetidos({ir, refrescar}) {
  let r;
  try { r = await api.duplicados(); } catch (e) { return avisoError(e); }
  const cuerpo = h('div');
  const v = ventana({titulo: 'Fichas repetidas (' + r.grupos.length + ')', ancha: true, cuerpo});
  if (!r.grupos.length) { poner(cuerpo, h('p', 'No hay clientes repetidos. 👌')); return v; }
  const resumen = en => Object.entries(en || {}).map(([k, n]) => n + ' ' + k.toLowerCase()).join(', ') || 'nada enlazado';
  poner(cuerpo, h('p.nota', 'Mismo teléfono o misma casa. Elige la ficha buena: lo de las demás (citas, instalaciones, apuntes, ' +
      'facturas, archivos y tareas) pasa a ella, lo que le falte se rellena y la repetida desaparece.'),
    r.grupos.map(g => tarjeta('Coinciden por ' + g.por, h('ul.zw-docs', g.clientes.map(c => h('li',
      h('span', h('b', [txt(c.direccion), txt(c.nombre)].filter(Boolean).join(' · ')),
        h('div.nota', [c.id, txt(c.municipio), txt(c.telefono), api.etiquetaCatalogo('estadosCliente', c.estado),
          txt(c.comercial), 'alta ' + fechaCorta(c.creado), resumen(c.enlazados)].filter(Boolean).join(' · '))),
      h('button.btn.mini.primario', {onclick: async () => {
        const otros = g.clientes.filter(x => x.id !== c.id);
        const ok = await confirmar('Se queda ' + c.id + ' y se le pasa todo lo de ' + otros.map(x => x.id).join(', ') +
          ', que se borra' + (otros.length > 1 ? 'n' : '') + '. No se puede deshacer.', {botón: 'Fusionar', peligro: true});
        if (!ok) return;
        try {
          for (const o of otros) await api.fusionarClientes(o.id, c.id);
          aviso('Fichas fusionadas en ' + c.id + '.');
          v.cerrar();
          await refrescar();
          ir('cliente/' + c.id);
        } catch (e) { avisoError(e); }
      }}, 'Quedarse con esta')))))));
  return v;
}
