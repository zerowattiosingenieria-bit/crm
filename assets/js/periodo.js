/* periodo.js — Elegir de qué periodo son las cifras de los paneles (21/11/2026, Nando:
   «quiero poder elegir si ver las cifras por 1T, 2T, 3T y 4T, por meses de 16 a 15,
   por año natural o por todo lo acumulado»). La elección se recuerda en este aparato
   y la usan el Panel y el Resumen de Dinero. */

import {h} from './util.js';

const K = 'zw.crm.periodo';
const hoy = () => new Date().toLocaleDateString('sv-SE');
const pad = n => String(n).padStart(2, '0');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const finDeMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** Periodo de objetivos 16→15 en el que cae una fecha: devuelve el mes en que EMPIEZA (AAAA-MM). */
function mesObjetivoDe(f) {
  const [a, m, d] = f.split('-').map(Number);
  if (d >= 16) return a + '-' + pad(m);
  const pm = m === 1 ? 12 : m - 1, pa = m === 1 ? a - 1 : a;
  return pa + '-' + pad(pm);
}

export function periodoPorDefecto() {
  const f = hoy();
  return {modo: 'anio', anio: Number(f.slice(0, 4)), t: Math.ceil(Number(f.slice(5, 7)) / 3), mes: mesObjetivoDe(f)};
}

export function periodoGuardado() {
  try { const p = JSON.parse(localStorage.getItem(K) || 'null'); if (p && p.modo) return {...periodoPorDefecto(), ...p}; } catch (e) { /* sin almacenamiento */ }
  return periodoPorDefecto();
}
export function guardarPeriodo(p) { try { localStorage.setItem(K, JSON.stringify(p)); } catch (e) { /* nada */ } }

/** {desde, hasta, etiqueta, corta} del periodo elegido. «hasta» nunca pasa de hoy. */
export function rangoPeriodo(p = periodoGuardado()) {
  const tope = x => (x > hoy() ? hoy() : x);
  if (p.modo === 'todo') return {desde: '', hasta: hoy(), etiqueta: 'Todo lo acumulado', corta: 'acumulado'};
  if (p.modo === 'trimestre') {
    const m0 = (p.t - 1) * 3 + 1;
    const desde = p.anio + '-' + pad(m0) + '-01', hasta = p.anio + '-' + pad(m0 + 2) + '-' + pad(finDeMes(p.anio, m0 + 2));
    return {desde, hasta: tope(hasta), etiqueta: p.t + 'T ' + p.anio + ' (' + MESES[m0 - 1] + '–' + MESES[m0 + 1] + ')', corta: p.t + 'T ' + p.anio};
  }
  if (p.modo === 'mes') {
    const [a, m] = p.mes.split('-').map(Number);
    const ma = m === 12 ? 1 : m + 1, aa = m === 12 ? a + 1 : a;
    const desde = a + '-' + pad(m) + '-16', hasta = aa + '-' + pad(ma) + '-15';
    return {desde, hasta: tope(hasta), etiqueta: '16 ' + MESES[m - 1] + ' – 15 ' + MESES[ma - 1] + ' ' + aa, corta: '16 ' + MESES[m - 1] + '–15 ' + MESES[ma - 1]};
  }
  return {desde: p.anio + '-01-01', hasta: tope(p.anio + '-12-31'), etiqueta: 'Año ' + p.anio, corta: 'año ' + p.anio};
}

/** ¿Está la fecha (AAAA-MM-DD…) dentro del rango? */
export const enRango = (f, r) => { const x = String(f || '').slice(0, 10); return !!x && (!r.desde || x >= r.desde) && x <= r.hasta; };

/** Botones para elegir el periodo. Al cambiar, se guarda y se llama a alCambiar(periodo, rango). */
export function selectorPeriodo(alCambiar, p = periodoGuardado()) {
  const caja = h('div', {estilo: {display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px'}});
  const anioHoy = Number(hoy().slice(0, 4));
  const anios = []; for (let a = anioHoy; a >= 2025; a--) anios.push(a);
  const cambia = cambios => { const n = {...p, ...cambios}; guardarPeriodo(n); alCambiar(n, rangoPeriodo(n)); };
  const boton = (et, activo, fn, titulo) => h('button.btn.mini' + (activo ? '.primario' : ''), {onclick: fn, title: titulo || ''}, et);
  const sel = (opciones, valor, fn) => { const s = h('select', {estilo: {width: 'auto', padding: '4px 8px'}, onchange: e => fn(e.target.value)},
    opciones.map(([v, et]) => h('option', {value: v}, et))); s.value = String(valor); return s; };
  /* los últimos 18 periodos 16→15 */
  const meses = []; { let k = mesObjetivoDe(hoy()); for (let i = 0; i < 18; i++) { meses.push(k); const [a, m] = k.split('-').map(Number); k = (m === 1 ? a - 1 : a) + '-' + pad(m === 1 ? 12 : m - 1); } }
  caja.append(...[
    h('span.nota', {estilo: {marginRight: '2px'}}, '📅 Cifras de:'),
    ...[1, 2, 3, 4].map(t => boton(t + 'T', p.modo === 'trimestre' && p.t === t, () => cambia({modo: 'trimestre', t}), t + 'º trimestre')),
    boton('Mes 16→15', p.modo === 'mes', () => cambia({modo: 'mes'}), 'Del 16 de un mes al 15 del siguiente (periodo de objetivos)'),
    boton('Año', p.modo === 'anio', () => cambia({modo: 'anio'}), 'Año natural'),
    boton('Todo', p.modo === 'todo', () => cambia({modo: 'todo'}), 'Todo lo acumulado'),
    p.modo === 'mes' ? sel(meses.map(k => { const r = rangoPeriodo({modo: 'mes', mes: k}); return [k, r.etiqueta]; }), p.mes, v => cambia({mes: v})) : null,
    p.modo === 'trimestre' || p.modo === 'anio' ? sel(anios.map(a => [a, a]), p.anio, v => cambia({anio: Number(v)})) : null,
    h('b', {estilo: {marginLeft: '6px', fontSize: '13px'}}, rangoPeriodo(p).etiqueta)].filter(Boolean));
  return caja;
}
