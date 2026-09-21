/* graficos.js — gráficos en SVG, sin librerías.
 *
 * Reglas que se siguen en todos: una sola escala por eje, colores fijos
 * por serie (nunca por posición en el ranking), leyenda siempre que haya
 * más de una serie, etiquetas directas cuando caben y rejilla discreta.
 */

import {h, num, miles, eur, eurCorto, pct} from './util.js';

export const SERIES = ['var(--s1)','var(--s2)','var(--s3)','var(--s4)',
                       'var(--s5)','var(--s6)','var(--s7)','var(--s8)'];

const svgEl = (t, a = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', t);
  Object.entries(a).forEach(([k, v]) => { if (v !== null && v !== undefined) e.setAttribute(k, v); });
  return e;
};
const formatea = (v, f) => f === 'eur' ? eur(v) : (f === 'eurCorto' ? eurCorto(v)
  : (f === 'pct' ? pct(v) : miles(v)));

/* Escala bonita para el eje: 0, 25.000, 50.000… */
function escala(max) {
  if (max <= 0) return {max: 1, paso: 1};
  const bruto = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= bruto) || mag * 10;
  return {max: Math.ceil(max / paso) * paso, paso};
}

/* Globo de información compartido por todos los gráficos. */
function conGlobo(caja) {
  const globo = h('div', {estilo: {
    position: 'absolute', pointerEvents: 'none', opacity: '0', transition: 'opacity .12s',
    background: 'var(--carbon)', color: '#fff', padding: '7px 10px', borderRadius: '8px',
    fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', zIndex: '5',
    transform: 'translate(-50%,-115%)', boxShadow: 'var(--sombra-alta)'
  }});
  caja.style.position = 'relative';
  caja.appendChild(globo);
  return {
    mostrar(x, y, html) { globo.innerHTML = html; globo.style.left = x + 'px';
      globo.style.top = y + 'px'; globo.style.opacity = '1'; },
    ocultar() { globo.style.opacity = '0'; }
  };
}

function leyenda(series) {
  return h('.leyenda', series.map(s =>
    h('span', h('i', {estilo: {background: s.color}}), s.nombre)));
}

/* ---------- barras (una o varias series) ---------- */
export function barras({etiquetas, series, formato = 'num', alto = 240, etiquetasDirectas = true}) {
  const caja = h('.grafico-caja');
  const globo = conGlobo(caja);
  const W = 720, H = alto, ML = 58, MR = 12, MT = 14, MB = 34;
  const anchoUtil = W - ML - MR, altoUtil = H - MT - MB;
  const max = Math.max(1, ...series.flatMap(s => s.valores.map(num)));
  const esc = escala(max);
  const y = v => MT + altoUtil - (num(v) / esc.max) * altoUtil;

  const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, class: 'grafico',
    style: 'width:100%;height:auto;display:block'});

  for (let v = 0; v <= esc.max + 0.001; v += esc.paso) {
    svg.appendChild(svgEl('line', {x1: ML, x2: W - MR, y1: y(v), y2: y(v), class: 'rejilla-linea'}));
    const t = svgEl('text', {x: ML - 8, y: y(v) + 4, 'text-anchor': 'end'});
    t.textContent = formatea(v, formato === 'eur' ? 'eurCorto' : formato);
    svg.appendChild(t);
  }

  const n = etiquetas.length || 1;
  const anchoGrupo = anchoUtil / n;
  const anchoBarra = Math.max(4, Math.min(38, (anchoGrupo - 10) / series.length - 2));

  etiquetas.forEach((et, i) => {
    const x0 = ML + i * anchoGrupo + (anchoGrupo - (anchoBarra + 2) * series.length) / 2;
    series.forEach((s, j) => {
      const v = num(s.valores[i]);
      const x = x0 + j * (anchoBarra + 2);
      const altura = Math.max(v > 0 ? 2 : 0, MT + altoUtil - y(v));
      const r = svgEl('rect', {x, y: y(v), width: anchoBarra, height: altura, rx: 4,
        fill: s.color || SERIES[j % SERIES.length]});
      r.addEventListener('mousemove', e => {
        const b = caja.getBoundingClientRect();
        globo.mostrar(e.clientX - b.left, e.clientY - b.top,
          `<b>${et}</b><br>${s.nombre}: ${formatea(v, formato)}`);
      });
      r.addEventListener('mouseleave', () => globo.ocultar());
      svg.appendChild(r);
      if (etiquetasDirectas && series.length === 1 && n <= 14 && v > 0) {
        const t = svgEl('text', {x: x + anchoBarra / 2, y: y(v) - 6, 'text-anchor': 'middle', class: 'valor'});
        t.textContent = formatea(v, formato === 'eur' ? 'eurCorto' : formato);
        svg.appendChild(t);
      }
    });
    const t = svgEl('text', {x: ML + i * anchoGrupo + anchoGrupo / 2, y: H - 12, 'text-anchor': 'middle'});
    t.textContent = et;
    svg.appendChild(t);
  });

  svg.appendChild(svgEl('line', {x1: ML, x2: W - MR, y1: MT + altoUtil, y2: MT + altoUtil, class: 'eje'}));
  caja.appendChild(svg);
  if (series.length > 1) caja.appendChild(leyenda(series.map((s, j) =>
    ({nombre: s.nombre, color: s.color || SERIES[j % SERIES.length]}))));
  return caja;
}

/* ---------- barras apiladas ---------- */
export function apiladas({etiquetas, series, formato = 'eur', alto = 240}) {
  const caja = h('.grafico-caja');
  const globo = conGlobo(caja);
  const W = 720, H = alto, ML = 58, MR = 12, MT = 14, MB = 34;
  const anchoUtil = W - ML - MR, altoUtil = H - MT - MB;
  const totales = etiquetas.map((_, i) => series.reduce((a, s) => a + num(s.valores[i]), 0));
  const esc = escala(Math.max(1, ...totales));
  const y = v => MT + altoUtil - (num(v) / esc.max) * altoUtil;
  const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, class: 'grafico',
    style: 'width:100%;height:auto;display:block'});

  for (let v = 0; v <= esc.max + 0.001; v += esc.paso) {
    svg.appendChild(svgEl('line', {x1: ML, x2: W - MR, y1: y(v), y2: y(v), class: 'rejilla-linea'}));
    const t = svgEl('text', {x: ML - 8, y: y(v) + 4, 'text-anchor': 'end'});
    t.textContent = formatea(v, formato === 'eur' ? 'eurCorto' : formato);
    svg.appendChild(t);
  }
  const ancho = Math.min(42, anchoUtil / Math.max(1, etiquetas.length) - 12);
  etiquetas.forEach((et, i) => {
    const x = ML + (i + 0.5) * (anchoUtil / etiquetas.length) - ancho / 2;
    let acumulado = 0;
    series.forEach((s, j) => {
      const v = num(s.valores[i]);
      if (v <= 0) return;
      const yArriba = y(acumulado + v), yAbajo = y(acumulado);
      const r = svgEl('rect', {x, y: yArriba, width: ancho, height: Math.max(2, yAbajo - yArriba - 2),
        rx: 3, fill: s.color || SERIES[j % SERIES.length]});
      r.addEventListener('mousemove', e => {
        const b = caja.getBoundingClientRect();
        globo.mostrar(e.clientX - b.left, e.clientY - b.top, `<b>${et}</b><br>${s.nombre}: ${formatea(v, formato)}`);
      });
      r.addEventListener('mouseleave', () => globo.ocultar());
      svg.appendChild(r);
      acumulado += v;
    });
    const t = svgEl('text', {x: x + ancho / 2, y: H - 12, 'text-anchor': 'middle'});
    t.textContent = et; svg.appendChild(t);
  });
  svg.appendChild(svgEl('line', {x1: ML, x2: W - MR, y1: MT + altoUtil, y2: MT + altoUtil, class: 'eje'}));
  caja.appendChild(svg);
  caja.appendChild(leyenda(series.map((s, j) => ({nombre: s.nombre, color: s.color || SERIES[j % SERIES.length]}))));
  return caja;
}

/* ---------- líneas ---------- */
export function lineas({etiquetas, series, formato = 'eur', alto = 240, area = true}) {
  const caja = h('.grafico-caja');
  const globo = conGlobo(caja);
  const W = 720, H = alto, ML = 58, MR = 14, MT = 14, MB = 34;
  const anchoUtil = W - ML - MR, altoUtil = H - MT - MB;
  const max = Math.max(1, ...series.flatMap(s => s.valores.map(num)));
  const esc = escala(max);
  const x = i => ML + (etiquetas.length <= 1 ? anchoUtil / 2 : (i * anchoUtil) / (etiquetas.length - 1));
  const y = v => MT + altoUtil - (num(v) / esc.max) * altoUtil;
  const svg = svgEl('svg', {viewBox: `0 0 ${W} ${H}`, class: 'grafico',
    style: 'width:100%;height:auto;display:block'});

  for (let v = 0; v <= esc.max + 0.001; v += esc.paso) {
    svg.appendChild(svgEl('line', {x1: ML, x2: W - MR, y1: y(v), y2: y(v), class: 'rejilla-linea'}));
    const t = svgEl('text', {x: ML - 8, y: y(v) + 4, 'text-anchor': 'end'});
    t.textContent = formatea(v, formato === 'eur' ? 'eurCorto' : formato);
    svg.appendChild(t);
  }

  series.forEach((s, j) => {
    const color = s.color || SERIES[j % SERIES.length];
    const puntos = s.valores.map((v, i) => [x(i), y(v)]);
    if (area && series.length === 1) {
      const d = `M${puntos[0][0]},${MT + altoUtil} ` + puntos.map(p => `L${p[0]},${p[1]}`).join(' ') +
        ` L${puntos[puntos.length - 1][0]},${MT + altoUtil} Z`;
      svg.appendChild(svgEl('path', {d, fill: color, opacity: '.10'}));
    }
    svg.appendChild(svgEl('path', {
      d: puntos.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '),
      fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}));
    puntos.forEach((p, i) => {
      const c = svgEl('circle', {cx: p[0], cy: p[1], r: 4, fill: color, stroke: 'var(--papel)', 'stroke-width': 2});
      c.addEventListener('mousemove', e => {
        const b = caja.getBoundingClientRect();
        globo.mostrar(e.clientX - b.left, e.clientY - b.top,
          `<b>${etiquetas[i]}</b><br>${s.nombre}: ${formatea(s.valores[i], formato)}`);
      });
      c.addEventListener('mouseleave', () => globo.ocultar());
      svg.appendChild(c);
    });
  });

  etiquetas.forEach((et, i) => {
    if (etiquetas.length > 14 && i % 2) return;
    const t = svgEl('text', {x: x(i), y: H - 12, 'text-anchor': 'middle'});
    t.textContent = et; svg.appendChild(t);
  });
  svg.appendChild(svgEl('line', {x1: ML, x2: W - MR, y1: MT + altoUtil, y2: MT + altoUtil, class: 'eje'}));
  caja.appendChild(svg);
  if (series.length > 1) caja.appendChild(leyenda(series.map((s, j) =>
    ({nombre: s.nombre, color: s.color || SERIES[j % SERIES.length]}))));
  return caja;
}

/* ---------- anillo ---------- */
export function anillo({datos, formato = 'eur', centro, alto = 220}) {
  const caja = h('.grafico-caja', {estilo: {display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap'}});
  const globo = conGlobo(caja);
  const total = datos.reduce((a, d) => a + num(d.valor), 0) || 1;
  const R = 78, r = 50, C = 100;
  const svg = svgEl('svg', {viewBox: '0 0 200 200', style: `width:${alto}px;height:${alto}px;flex:none`});
  let a0 = -Math.PI / 2;
  datos.forEach((d, i) => {
    const frac = num(d.valor) / total;
    if (frac <= 0) return;
    const a1 = a0 + frac * Math.PI * 2;
    const hueco = frac > 0.02 ? 0.015 : 0;
    const p = (ang, rad) => [C + Math.cos(ang) * rad, C + Math.sin(ang) * rad];
    const [x1, y1] = p(a0 + hueco, R), [x2, y2] = p(a1 - hueco, R);
    const [x3, y3] = p(a1 - hueco, r), [x4, y4] = p(a0 + hueco, r);
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const path = svgEl('path', {
      d: `M${x1},${y1} A${R},${R} 0 ${grande} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${grande} 0 ${x4},${y4} Z`,
      fill: d.color || SERIES[i % SERIES.length], stroke: 'var(--papel)', 'stroke-width': 2});
    path.addEventListener('mousemove', e => {
      const b = caja.getBoundingClientRect();
      globo.mostrar(e.clientX - b.left, e.clientY - b.top,
        `<b>${d.nombre}</b><br>${formatea(d.valor, formato)} · ${(frac * 100).toFixed(1).replace('.', ',')} %`);
    });
    path.addEventListener('mouseleave', () => globo.ocultar());
    svg.appendChild(path);
    a0 = a1;
  });
  if (centro) {
    const t1 = svgEl('text', {x: C, y: C - 2, 'text-anchor': 'middle',
      style: 'font-size:17px;font-weight:700;fill:var(--tx)'});
    t1.textContent = centro.valor;
    const t2 = svgEl('text', {x: C, y: C + 16, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--tx-2)'});
    t2.textContent = centro.et;
    svg.appendChild(t1); svg.appendChild(t2);
  }
  caja.appendChild(svg);
  caja.appendChild(h('div', {estilo: {flex: '1', minWidth: '160px'}},
    datos.map((d, i) => h('div', {estilo: {display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '13px', padding: '3px 0'}},
      h('i', {estilo: {width: '10px', height: '10px', borderRadius: '3px', flex: 'none',
        background: d.color || SERIES[i % SERIES.length]}}),
      h('span', {estilo: {flex: '1'}}, d.nombre),
      h('b', formatea(d.valor, formato))))));
  return caja;
}

/* ---------- embudo ---------- */
export function embudo(pasos) {
  const max = Math.max(1, ...pasos.map(p => num(p.valor)));
  return h('.embudo', pasos.map(p => h('.paso',
    h('.et-e', p.fase),
    h('.barra-e', {estilo: {width: Math.max(3, (num(p.valor) / max) * 100) + '%'}}, miles(p.valor)),
    p.conversion && p.conversion <= 100
      ? h('.conv', pct(p.conversion) + ' del paso anterior') : null)));
}

/* ---------- minilínea ---------- */
export function chispa(valores, color = 'var(--lima-osc)', ancho = 90, alto = 26) {
  const max = Math.max(1, ...valores.map(num));
  const paso = ancho / Math.max(1, valores.length - 1);
  const svg = svgEl('svg', {viewBox: `0 0 ${ancho} ${alto}`, style: `width:${ancho}px;height:${alto}px`});
  svg.appendChild(svgEl('path', {
    d: valores.map((v, i) => (i ? 'L' : 'M') + (i * paso) + ',' + (alto - (num(v) / max) * (alto - 4) - 2)).join(' '),
    fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
  return svg;
}

/* ---------- barra comparativa (objetivo) ---------- */
export function progreso(valor, objetivo, {formato = 'num'} = {}) {
  const p = objetivo > 0 ? Math.min(100, (num(valor) / num(objetivo)) * 100) : 0;
  const color = p >= 100 ? 'var(--bien)' : (p >= 60 ? 'var(--lima-osc)' : 'var(--aviso)');
  return h('div',
    h('div', {estilo: {display: 'flex', justifyContent: 'space-between', fontSize: '12px',
      color: 'var(--tx-2)', marginBottom: '4px'}},
      h('span', formatea(valor, formato) + ' de ' + formatea(objetivo, formato)),
      h('b', {estilo: {color}}, Math.round(p) + ' %')),
    h('.barra-progreso', h('i', {estilo: {width: p + '%', background: color}})));
}
