/* util.js — formato, fechas y construcción de elementos.
   Todo lo que se repite en las pantallas vive aquí. */

/* ---------- selección ---------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/**
 * Crea elementos sin escribir HTML a mano:
 *   h('div.tarjeta', {onclick}, h('h2', 'Título'), 'texto')
 * Los hijos pueden ser nodos, textos, listas o null.
 */
export function h(sel, props, ...hijos) {
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    hijos.unshift(props); props = null;
  }
  const m = String(sel).match(/^([a-z0-9]+)?((?:[.#][^.#]+)*)$/i) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').split(/(?=[.#])/).filter(Boolean).forEach(t => {
    if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1);
  });
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'html') el.innerHTML = v;
    else if (k === 'texto') el.textContent = v;
    else if (k === 'datos') Object.entries(v).forEach(([dk, dv]) => el.dataset[dk] = dv);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'estilo') Object.assign(el.style, v);
    else if (k === 'valor') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  const poner = c => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(poner);
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  hijos.forEach(poner);
  return el;
}

export const vaciar = el => { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };
export const poner = (el, ...hijos) => {
  vaciar(el);
  hijos.flat(3).forEach(c => {
    if (c === null || c === undefined || c === false) return;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return el;
};

/* ---------- números y dinero ---------- */
export const num = v => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/[^\d,.\-]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

const fmtN = new Intl.NumberFormat('es-ES');
const fmtN2 = new Intl.NumberFormat('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2});

export const miles = n => fmtN.format(Math.round(num(n)));
export const eur = n => miles(n) + ' €';
export const eur2 = n => fmtN2.format(num(n)) + ' €';
/** Importes grandes en corto: 1,2 M€ / 84,5 k€ */
export const eurCorto = n => {
  const v = num(n);
  if (Math.abs(v) >= 1000000) return fmtN2.format(v / 1000000).replace(',00', '') + ' M€';
  if (Math.abs(v) >= 10000) return fmtN.format(Math.round(v / 1000)) + ' k€';
  return eur(v);
};
export const pct = n => fmtN2.format(num(n)).replace(',00', '') + ' %';
export const numero = n => fmtN.format(num(n));

/* ---------- fechas ---------- */
export const hoyISO = () => new Date().toLocaleDateString('sv-SE');
export const mesISO = (iso = hoyISO()) => String(iso).slice(0, 7);

export const fechaCorta = iso => {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a.slice(2)}`;
};
export const fechaLarga = iso => {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('es-ES', {day: 'numeric', month: 'long', year: 'numeric'});
};
export const mesLargo = m => {
  if (!/^\d{4}-\d{2}$/.test(String(m || ''))) return m || '—';
  const d = new Date(m + '-01T12:00:00');
  return d.toLocaleDateString('es-ES', {month: 'short', year: '2-digit'}).replace('.', '');
};
export const dias = (a, b) => {
  const x = new Date(String(a).slice(0, 10) + 'T12:00:00'), y = new Date(String(b).slice(0, 10) + 'T12:00:00');
  if (isNaN(x) || isNaN(y)) return null;
  return Math.round((y - x) / 86400000);
};
export const sumarDias = (iso, n) => {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + Number(n || 0));
  return d.toLocaleDateString('sv-SE');
};
export const primerDiaMes = (iso = hoyISO()) => String(iso).slice(0, 8) + '01';
export const haceDias = iso => {
  const d = dias(iso, hoyISO());
  if (d === null) return '—';
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 0) return 'en ' + Math.abs(d) + ' días';
  if (d < 31) return 'hace ' + d + ' días';
  if (d < 365) return 'hace ' + Math.round(d / 30) + ' meses';
  return 'hace ' + (d / 365).toFixed(1).replace('.', ',') + ' años';
};

/* ---------- texto ---------- */
export const txt = v => String(v ?? '').trim();
export const normal = v => txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const iniciales = n => txt(n).split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
export const capital = s => { s = txt(s); return s ? s[0].toUpperCase() + s.slice(1) : ''; };
export const recortar = (s, n) => { s = txt(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* ---------- varios ---------- */
export const debounce = (fn, ms = 250) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
export const agrupar = (lista, clave) => lista.reduce((m, x) => {
  const k = typeof clave === 'function' ? clave(x) : x[clave];
  (m[k] = m[k] || []).push(x); return m;
}, {});
export const suma = (lista, campo) => lista.reduce((a, x) =>
  a + num(typeof campo === 'function' ? campo(x) : x[campo]), 0);
export const ordenarPor = (lista, campo, desc) => lista.slice().sort((a, b) => {
  const x = typeof campo === 'function' ? campo(a) : a[campo];
  const y = typeof campo === 'function' ? campo(b) : b[campo];
  const nx = num(x), ny = num(y);
  const esNum = String(x).trim() !== '' && String(y).trim() !== '' && !isNaN(nx) && !isNaN(ny)
    && /^[\d.,\s€%-]+$/.test(String(x)) && /^[\d.,\s€%-]+$/.test(String(y));
  const r = esNum ? nx - ny : String(x ?? '').localeCompare(String(y ?? ''), 'es');
  return desc ? -r : r;
});

/** Descarga una tabla como CSV (lo abre Excel sin pelear con los acentos). */
export function descargarCSV(nombre, cabeceras, filas) {
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const texto = '﻿' + [cabeceras.map(esc).join(';')]
    .concat(filas.map(f => f.map(esc).join(';'))).join('\r\n');
  const url = URL.createObjectURL(new Blob([texto], {type: 'text/csv;charset=utf-8'}));
  const a = h('a', {href: url, download: nombre.replace(/[^\w.\-]+/g, '_')});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const telHref = t => 'tel:' + txt(t).replace(/\s/g, '');
export const waHref = t => 'https://wa.me/34' + txt(t).replace(/\D/g, '').replace(/^34/, '');
export const mapsHref = c => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(txt(c));
