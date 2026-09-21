/* ui.js — piezas de interfaz que se repiten: avisos, ventanas, tablas,
   formularios y tarjetas de indicador. */

import {h, poner, $, txt, num, ordenarPor, descargarCSV} from './util.js';

/* ---------- aviso flotante ---------- */
let tAviso;
export function aviso(texto, tipo) {
  const el = $('#aviso');
  if (!el) return;
  el.textContent = texto;
  el.className = 'aviso-flotante visible' + (tipo === 'error' ? ' error' : '');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.classList.remove('visible'), tipo === 'error' ? 5200 : 3000);
}
export const avisoError = e => aviso(typeof e === 'string' ? e : (e && e.message) || 'Algo ha fallado.', 'error');

/* ---------- ventana ---------- */
export function ventana({titulo, cuerpo, acciones, ancha, alCerrar}) {
  const velo = h('.velo');
  const cerrar = () => { velo.remove(); document.body.style.overflow = ''; if (alCerrar) alCerrar(); };
  const caja = h('.ventana' + (ancha ? '.ancha' : ''), {role: 'dialog', 'aria-modal': 'true'},
    h('header', h('h2', titulo || ''), h('button.btn.plano', {onclick: cerrar, 'aria-label': 'Cerrar'}, '✕')),
    h('.cuerpo', cuerpo),
    acciones && acciones.length ? h('footer', acciones) : null
  );
  velo.appendChild(caja);
  velo.addEventListener('mousedown', e => { if (e.target === velo) cerrar(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', esc); }
  });
  $('#ventanas').appendChild(velo);
  document.body.style.overflow = 'hidden';
  /* Se lleva el foco al primer campo en cuanto se pinta la ventana, nunca
     más tarde: si se hiciera con retraso, podría robarle el foco a alguien
     que ya ha empezado a escribir. */
  requestAnimationFrame(() => {
    if (document.activeElement && caja.contains(document.activeElement)) return;
    const f = caja.querySelector('input,select,textarea,button.primario');
    if (f) f.focus();
  });
  return {cerrar, caja};
}

export function confirmar(texto, {titulo = '¿Seguro?', botón = 'Sí, continuar', peligro = true} = {}) {
  return new Promise(resolve => {
    let hecho = false;
    const v = ventana({
      titulo, cuerpo: h('p', texto),
      alCerrar: () => { if (!hecho) resolve(false); },
      acciones: [
        h('button.btn', {onclick: () => { hecho = true; v.cerrar(); resolve(false); }}, 'Cancelar'),
        h('button.btn' + (peligro ? '.peligro' : '.primario'),
          {onclick: () => { hecho = true; v.cerrar(); resolve(true); }}, botón)
      ]
    });
  });
}

/* ---------- indicadores ---------- */
export function kpi(etiqueta, valor, pie, {destacado, estado, icono} = {}) {
  return h('.kpi' + (destacado ? '.destacado' : ''),
    h('.et', icono ? h('span', icono) : null, etiqueta),
    h('.val', {estilo: estado ? {color: `var(--${estado})`} : null}, valor),
    pie ? h('.pie', pie) : null);
}
export const kpis = (...tarjetas) => h('.kpis', tarjetas.flat().filter(Boolean));

export function tarjeta(titulo, cuerpo, {acciones, sinRelleno, subtitulo} = {}) {
  return h('.tarjeta',
    titulo ? h('header',
      h('div', h('h2', titulo), subtitulo ? h('.nota', subtitulo) : null),
      acciones ? h('.acciones', acciones) : null) : null,
    h('.cuerpo' + (sinRelleno ? '.sin' : ''), cuerpo));
}

export const marca = (texto, clase) => h('span.etiqueta' + (clase ? '.' + clase : ''), texto);

/* Colores de estado para clientes y operaciones. */
const CLASES_ESTADO = {
  ganado: 'bien', legalizada: 'bien', cerrada: 'bien', instalada: 'bien', firmada: 'bien',
  cobrado: 'bien', pagado: 'bien', cobrada: 'bien', venta: 'bien', confirmada: 'bien',
  perdido: 'mal', cancelada: 'mal', vencido: 'mal', vencida: 'mal', incobrable: 'mal', no_interesa: 'mal',
  negociando: 'aviso', financiacion: 'aviso', frio: 'aviso', pendiente: 'aviso', parcial: 'aviso',
  recontactar: 'aviso', tramite: 'aviso',
  propuesta: 'info', cita: 'info', sentada: 'info', captado: 'info', material: 'info',
  instalacion: 'info', emitida: 'info', enviada: 'info'
};
export const claseEstado = v => CLASES_ESTADO[String(v || '').toLowerCase()] || '';
export const etiquetaEstado = (valor, texto) => marca(texto || valor || '—', claseEstado(valor));

/* ---------- tabla ordenable ---------- */
/**
 * columnas: [{clave, et, num, ancho, valor(fila), pinta(fila), orden(fila), noOrden}]
 * opciones: {alPulsar(fila), vacio, pie:[...], csv:'nombre.csv', ordenInicial:{clave,desc}}
 */
export function tabla(columnas, filas, opciones = {}) {
  const est = Object.assign({clave: null, desc: false}, opciones.ordenInicial || {});
  const caja = h('.tabla-caja');

  const valorDe = (col, fila) => col.orden ? col.orden(fila)
    : (col.valor ? col.valor(fila) : fila[col.clave]);

  function pinta() {
    let datos = filas.slice();
    if (est.clave) {
      const col = columnas.find(c => c.clave === est.clave);
      if (col) datos = ordenarPor(datos, f => valorDe(col, f), est.desc);
    }
    const t = h('table.datos',
      h('thead', h('tr', columnas.map(col => h('th' + (col.num ? '.num' : '') + (col.noOrden ? '.no-orden' : ''),
        {
          estilo: col.ancho ? {width: col.ancho} : null,
          onclick: col.noOrden ? null : () => {
            if (est.clave === col.clave) est.desc = !est.desc;
            else { est.clave = col.clave; est.desc = !!col.num; }
            pinta();
          }
        },
        col.et + (est.clave === col.clave ? (est.desc ? ' ↓' : ' ↑') : ''))))),
      h('tbody', datos.length ? datos.map(fila => h('tr' + (opciones.alPulsar ? '.pulsable' : ''),
        {onclick: opciones.alPulsar ? e => {
          if (e.target.closest('button,a,input,select')) return;
          opciones.alPulsar(fila);
        } : null},
        columnas.map(col => h('td' + (col.num ? '.num' : ''),
          col.pinta ? col.pinta(fila) : String(col.valor ? col.valor(fila) : (fila[col.clave] ?? '—')))))
      ) : [h('tr', h('td.vacio', {colspan: columnas.length}, opciones.vacio || 'No hay nada que mostrar.'))]),
      opciones.pie ? h('tfoot', h('tr', opciones.pie.map(c =>
        h('td' + (c.num ? '.num' : ''), {colspan: c.colspan || 1}, c.texto ?? '')))) : null
    );
    poner(caja, t);
  }
  pinta();

  if (opciones.csv) {
    caja.exportar = () => descargarCSV(opciones.csv, columnas.map(c => c.et),
      filas.map(f => columnas.map(c => {
        const v = c.valor ? c.valor(f) : f[c.clave];
        return typeof v === 'object' ? txt(v && v.textContent) : v;
      })));
  }
  return caja;
}

/* ---------- formularios ---------- */
/**
 * campos: [{id, et, tipo, opciones, ancho, ayuda, requerido, min, max, paso, filas}]
 * tipo: texto | numero | euro | fecha | hora | select | area | tel | email | check
 */
export function formulario(campos, valores = {}) {
  const nodos = {};
  const pinta = campo => {
    if (campo.separador) return h('h3', {estilo: {gridColumn: '1/-1', margin: '10px 0 6px', fontSize: '13px',
      color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '.05em'}}, campo.separador);
    const v = valores[campo.id];
    let control;
    if (campo.tipo === 'select') {
      control = h('select', {id: 'c_' + campo.id},
        (campo.vacio !== false ? [h('option', {value: ''}, campo.vacio || '—')] : []).concat(
          (campo.opciones || []).map(o => {
            const [val, et] = Array.isArray(o) ? o : [o, o];
            return h('option', {value: val, selected: String(val) === String(v ?? '')}, et);
          })));
    } else if (campo.tipo === 'area') {
      control = h('textarea', {id: 'c_' + campo.id, rows: campo.filas || 4,
        placeholder: campo.pista || ''}, txt(v));
    } else if (campo.tipo === 'check') {
      control = h('input', {id: 'c_' + campo.id, type: 'checkbox', checked: String(v) === 'si' || v === true,
        estilo: {width: 'auto'}});
    } else {
      const tipos = {numero: 'number', euro: 'number', fecha: 'date', hora: 'time', tel: 'tel', email: 'email'};
      control = h('input', {
        id: 'c_' + campo.id, type: tipos[campo.tipo] || 'text',
        value: v ?? '', placeholder: campo.pista || '',
        step: campo.paso || (campo.tipo === 'euro' ? '0.01' : (campo.tipo === 'numero' ? '1' : null)),
        min: campo.min, max: campo.max,
        inputmode: campo.tipo === 'numero' || campo.tipo === 'euro' ? 'decimal' : null,
        required: campo.requerido
      });
    }
    nodos[campo.id] = {control, campo};
    return h('label.campo', {estilo: campo.ancho ? {gridColumn: `span ${campo.ancho}`} : null},
      h('span', campo.et + (campo.requerido ? ' *' : '')),
      control,
      campo.ayuda ? h('small', {estilo: {color: 'var(--tx-3)', fontWeight: '400'}}, campo.ayuda) : null);
  };

  const nodo = h('.rejilla', campos.map(pinta));

  const leer = () => {
    const o = {};
    Object.entries(nodos).forEach(([id, {control, campo}]) => {
      if (campo.tipo === 'check') o[id] = control.checked ? 'si' : 'no';
      else if (campo.tipo === 'numero' || campo.tipo === 'euro') o[id] = control.value === '' ? '' : num(control.value);
      else o[id] = txt(control.value);
    });
    return o;
  };
  const validar = () => {
    let falla = null;
    Object.entries(nodos).forEach(([id, {control, campo}]) => {
      if (campo.requerido && !txt(control.value)) falla = falla || campo.et;
    });
    return falla;
  };
  const poner_ = datos => Object.entries(nodos).forEach(([id, {control, campo}]) => {
    if (datos[id] === undefined) return;
    if (campo.tipo === 'check') control.checked = datos[id] === 'si';
    else control.value = datos[id];
  });

  return {nodo, leer, validar, poner: poner_, nodos};
}

/** Ventana con formulario y botón de guardar. `alGuardar` recibe los valores. */
export function ventanaFormulario({titulo, campos, valores, alGuardar, ancha, textoBoton, extra}) {
  const f = formulario(campos, valores || {});
  const btn = h('button.btn.primario', textoBoton || 'Guardar');
  const v = ventana({
    titulo, ancha,
    cuerpo: h('div', f.nodo, extra || null),
    acciones: [h('button.btn', {onclick: () => v.cerrar()}, 'Cancelar'), btn]
  });
  btn.addEventListener('click', async () => {
    const falta = f.validar();
    if (falta) return aviso('Falta rellenar: ' + falta, 'error');
    btn.disabled = true;
    const original = btn.textContent;
    poner(btn, h('span.cargando'), ' Guardando');
    try {
      await alGuardar(f.leer(), v);
      v.cerrar();
    } catch (e) {
      avisoError(e);
      btn.disabled = false; btn.textContent = original;
    }
  });
  return {ventana: v, formulario: f};
}

/* ---------- filtros ---------- */
export function filtros(controles, alCambiar) {
  const caja = h('.filtros');
  const valores = {};
  controles.forEach(c => {
    if (c.tipo === 'select') {
      const s = h('select', {onchange: () => { valores[c.id] = s.value; alCambiar(valores); }},
        (c.opciones || []).map(o => {
          const [v, e] = Array.isArray(o) ? o : [o, o];
          return h('option', {value: v, selected: String(v) === String(c.valor ?? '')}, e);
        }));
      valores[c.id] = c.valor ?? '';
      caja.appendChild(s);
    } else if (c.tipo === 'fecha') {
      const i = h('input', {type: 'date', value: c.valor || '',
        onchange: () => { valores[c.id] = i.value; alCambiar(valores); }});
      valores[c.id] = c.valor || '';
      caja.appendChild(h('label.campo', {estilo: {margin: 0, display: 'flex', alignItems: 'center', gap: '6px',
        flexDirection: 'row'}}, h('span', {estilo: {margin: 0}}, c.et), i));
    } else if (c.tipo === 'boton') {
      caja.appendChild(h('button.btn' + (c.clase ? '.' + c.clase : ''), {onclick: c.accion}, c.et));
    } else {
      const i = h('input', {placeholder: c.et, value: c.valor || '',
        oninput: () => { valores[c.id] = i.value; alCambiar(valores); }});
      valores[c.id] = c.valor || '';
      caja.appendChild(h('div.crece', i));
    }
  });
  return {nodo: caja, valores};
}

export const cargando = (texto = 'Cargando…') =>
  h('.vacio', h('span.cargando'), ' ' + texto);

export const barraProgreso = porcentaje =>
  h('.barra-progreso', h('i', {estilo: {width: Math.max(0, Math.min(100, porcentaje)) + '%'}}));
