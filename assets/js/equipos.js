/* equipos.js — Catálogo de equipos y reglas de dimensionado (25/11/2026, Nando).
 *
 * «Esta es la gama actual de SolaX: ten en cuenta sus manuales, potencias y dimensionamiento para cuando
 *  en el CRM haya que escoger inversor o batería. Desde ahora trabajamos aerotermia con Domusa y con SolaX.»
 *
 * Datos de las fichas oficiales de SolaX (es.solaxpower.com, nov. 2026). Lo usan el cotizador, la ficha de
 * dimensionado y el visor 3D. Las compatibilidades inversor-batería son las de los manuales; ante duda,
 * confirmar con el manual del modelo (enlace en cada equipo).
 */

const WEB = 'https://es.solaxpower.com/products/';

/* ---------- inversores híbridos SolaX ---------- */
/* kw = potencia AC nominal · pvMax = kWp máximos que admite · mppt = seguidores · bat = familia de batería */
const fam = (serie, tri, bat, url, extra) => (kw, id, pvMax, mppt) => Object.assign({id, marca: 'SolaX', serie, n: 'SolaX ' + id, kw, tri, pvMax, mppt, bat, url: WEB + url}, extra || {});
const x1h = fam('X1-Hybrid G4', false, 'hv_mono', 'x1-hybrid-g4.html', {mpptV: '70–550 V', eps: 'EPS = potencia nominal'});
const x1v = fam('X1-VAST', false, 'hv_mono', 'x1-vast.html', {mpptV: '40–560 V', eps: '2 × nominal 10 s'});
const x3p = fam('X3-HYB-G4 PRO', true, 'hv_tri', 'x3-hyb-g4-pro.html', {mpptV: '110–950 V', eps: '1,1 Pn continuo, 2 Pn 10 s'});
const x3u = fam('X3-ULTRA', true, 'hv_tri', 'x3-ultra.html', {mpptV: '160–950 V', eps: '2 × nominal 10 s'});
export const INVERSORES_SOLAX = [
  x1h(3, 'X1-HYBRID-3.0-D', 6, 2), x1h(3.68, 'X1-HYBRID-3.7-D', 7.4, 2), x1h(4.6, 'X1-HYBRID-4.6-D', 9.2, 2), x1h(5, 'X1-HYBRID-5.0-D', 10, 2),
  x1h(6, 'X1-HYBRID-6.0-D', 12, 2), x1h(7.5, 'X1-HYBRID-7.5-D', 15, 2),
  x1v(5, 'X1-VAST-5K', 10, 3), x1v(6, 'X1-VAST-6K', 12, 3), x1v(8, 'X1-VAST-8K', 16, 4), x1v(10, 'X1-VAST-10K', 20, 4),
  x3p(4, 'X3-HYB-4.0-P', 8, 2), x3p(5, 'X3-HYB-5.0-P', 10, 2), x3p(6, 'X3-HYB-6.0-P', 12, 2), x3p(8, 'X3-HYB-8.0-P', 16, 3),
  x3p(10, 'X3-HYB-10.0-P', 20, 3), x3p(12, 'X3-HYB-12.0-P', 24, 3), x3p(15, 'X3-HYB-15.0-P', 30, 3),
  x3u(15, 'X3-ULT-15K', 30, 2), x3u(20, 'X3-ULT-20K', 40, 2), x3u(25, 'X3-ULT-25K', 50, 3), x3u(30, 'X3-ULT-30K', 60, 3)
];

/* ---------- baterías SolaX (alta tensión, LFP) ---------- */
/* kwh = por módulo · util = utilizable por módulo · min/max módulos por torre según la familia del inversor */
export const BATERIAS_SOLAX = [
  {id: 'T58', n: 'SolaX T-BAT H 5.8 (T58)', kwh: 5.8, util: 5.2, v: 115.2, imax: 35, url: WEB + 't-bat-sys-hv-5-8.html',
   torres: {hv_mono: [1, 4], hv_tri: [2, 4]}, nota: 'Maestra + esclavas HV11550; 5,8 a 23 kWh'},
  {id: 'HV-S3.6', n: 'SolaX T-BAT-SYS-HV-S3.6', kwh: 3.6, util: 3.6, v: 51.2, imax: 50, url: WEB + 't-bat-sys-hv-s3-6.html',
   torres: {hv_mono: [2, 13], hv_tri: [4, 13]}, nota: '7,4 a 47,9 kWh por torre'},
  {id: 'HV-S2.5', n: 'SolaX T-BAT-SYS-HV-S2.5', kwh: 2.56, util: 2.56, v: 51.2, imax: 45, url: WEB + 't-bat-sys-hv-s2-5-battery.html',
   torres: {hv_mono: [2, 13], hv_tri: [4, 13]}, nota: '5,1 a 33,3 kWh por torre'}
];

/* ---------- aerotermia ---------- */
/* SolaX Thermal R290 (monobloc, hasta 80 °C, R290): kw a A7/W35; scop35/55; dims ancho×alto×fondo (m) */
const stu = (kw, cod, tri, scop35, scop55, kg) => ({id: (tri ? 'STU3-' : 'STU1-') + cod + 'R290', marca: 'SolaX', serie: 'SolaX Thermal R290',
  n: 'SolaX Thermal ' + (tri ? 'STU3-' : 'STU1-') + cod + 'R290 ' + kw + ' kW (' + (tri ? 'trif.' : 'mono') + ')', kw, tri, scop35, scop55, kg,
  tmax: 80, d: [1.31, 1.05, 0.465], url: WEB + 'solax-thermal-r290-series.html'});
export const AERO_SOLAX = [
  ...[false, true].flatMap(tri => [stu(8, 'C08', tri, 5.42, 4.16, tri ? 150 : 140), stu(10, 'C10', tri, 5.35, 4.15, tri ? 150 : 140),
    stu(12, 'C12', tri, 4.97, 3.88, tri ? 160 : 150), stu(14, 'C14', tri, 4.89, 3.83, tri ? 160 : 150), stu(16, 'C16', tri, 4.84, 3.83, tri ? 160 : 150)]),
  ...[4, 5, 6].map(kw => ({id: 'ALT0' + kw + '-SF0', marca: 'SolaX', serie: 'SolaX Alture', n: 'SolaX Alture ALT0' + kw + ' ' + kw + ' kW (mono)', kw, tri: false,
    tmax: 80, d: [1.10, 0.865, 0.40], kg: 100, url: WEB + 'alture-series.html', nota: 'Viviendas pequeñas, pasivas o apartamentos'}))
];
export const AERO_DOMUSA = [12, 16, 19, 22].flatMap(kw => [
  kw < 22 ? {id: 'ht' + kw, marca: 'Domusa', serie: 'Dual Clima HT', n: 'Domusa Dual Clima HT ' + kw + ' kW (mono)', kw, tri: false, d: [1.04, 0.86, 0.42], url: 'https://www.domusateknik.com/es/documentos-tecnicos'} : null,
  kw >= 16 ? {id: 'htt' + kw, marca: 'Domusa', serie: 'Dual Clima HTT', n: 'Domusa Dual Clima HTT ' + kw + ' kW (trif.)', kw, tri: true, d: [1.10, 1.38, 0.45], url: 'https://www.domusateknik.com/es/documentos-tecnicos'} : null
]).filter(Boolean);
export const MARCAS_AERO = [['Domusa', 'Domusa'], ['SolaX', 'SolaX']];

/* ---------- reglas de dimensionado ---------- */
/** Inversor recomendado: el más pequeño cuya potencia AC × 1,3 cubra los kWp (sobredimensionado FV ≤ 30 %) y que admita esos kWp. */
export function inversorRecomendado(kwp, tri) {
  const l = INVERSORES_SOLAX.filter(i => i.tri === !!tri && (tri || i.serie === 'X1-Hybrid G4' || i.kw > 7.5) && !(tri && i.serie === 'X3-ULTRA' && kwp <= 19.5));
  const ok = l.filter(i => i.kw * 1.3 >= kwp && i.pvMax >= kwp).sort((a, b) => a.kw - b.kw || (a.serie === 'X1-Hybrid G4' ? -1 : 1));
  return ok[0] || l.sort((a, b) => b.kw - a.kw)[0];
}
export const buscarInversor = texto => { const t = String(texto || '').toUpperCase().replace(/\s+/g, ''); return INVERSORES_SOLAX.find(i => t.includes(i.id.replace(/\s+/g, '').toUpperCase())) || null; };
export const buscarBateria = texto => { const t = String(texto || '').toUpperCase(); return BATERIAS_SOLAX.find(b => t.includes(b.id.toUpperCase()) || (b.id === 'T58' && /5[.,]8|T-?BAT H/.test(t))) || null; };

/** Comprueba inversor + batería + nº de módulos con los manuales. Devuelve {ok, avisos[], kwh, util}. */
export function comprobarEquipo({inversor, bateria, modulos, kwp}) {
  const av = []; const inv = typeof inversor === 'string' ? buscarInversor(inversor) : inversor; const bat = typeof bateria === 'string' ? buscarBateria(bateria) : bateria;
  const n = Number(modulos) || 0;
  if (inv && kwp) {
    if (kwp > inv.pvMax) av.push(`${inv.id} admite como máximo ${inv.pvMax} kWp y hay ${kwp.toLocaleString('es-ES')} kWp: sube de inversor.`);
    else if (kwp > inv.kw * 1.5) av.push(`Relación FV/inversor de ${(kwp / inv.kw).toFixed(2).replace('.', ',')}: habrá recortes en verano; mejor un inversor mayor.`);
    else if (kwp < inv.kw * 0.6) av.push(`El inversor ${inv.id} va muy grande para ${kwp.toLocaleString('es-ES')} kWp.`);
  }
  let kwh = 0, util = 0;
  if (bat && n) {
    kwh = Math.round(bat.kwh * n * 100) / 100; util = Math.round(bat.util * n * 100) / 100;
    const r = inv ? bat.torres[inv.bat] : null;
    if (r && (n < r[0] || n > r[1])) av.push(`Con ${inv.serie} la ${bat.id} va de ${r[0]} a ${r[1]} módulos por torre (has puesto ${n}).`);
    if (inv && kwh && inv.kw > 0 && kwh / inv.kw < 0.6) av.push(`Batería pequeña para el inversor: ${kwh.toLocaleString('es-ES')} kWh con ${inv.kw} kW. Lo normal es ≥ 1 kWh por kW.`);
  }
  return {ok: !av.length, avisos: av, kwh, util, inv, bat};
}

/** Aerotermia recomendada según kW necesarios, fase y marca. Devuelve {modelo, unidades, kw, equipo}. */
export function aeroRecomendada(kw, tri, marca) {
  if (marca === 'SolaX') {
    const l = AERO_SOLAX.filter(a => a.serie === 'SolaX Thermal R290' && a.tri === !!tri).sort((a, b) => a.kw - b.kw);
    if (kw <= 6) { const a = AERO_SOLAX.find(x => x.serie === 'SolaX Alture' && x.kw >= kw) || AERO_SOLAX.find(x => x.id === 'ALT06-SF0'); return {equipo: a, unidades: 1, kw: a.kw, modelo: a.n}; }
    const una = l.find(a => a.kw >= kw);
    if (una) return {equipo: una, unidades: 1, kw: una.kw, modelo: una.n};
    const media = l.find(a => a.kw * 2 >= kw) || l[l.length - 1];   /* más de 16 kW: dos en cascada */
    return {equipo: media, unidades: 2, kw: media.kw, modelo: '2 × ' + media.n};
  }
  const l = AERO_DOMUSA.filter(a => a.tri === !!tri || (!tri && a.kw <= 19)).sort((a, b) => a.kw - b.kw);
  const una = l.find(a => a.kw >= kw) || l[l.length - 1];
  return {equipo: una, unidades: 1, kw: una.kw, modelo: una.n};
}
/** Escalón de tarifa (12/16/19/22) para un equipo de X kW. */
export const kwTarifaAero = kw => kw <= 12 ? 12 : kw <= 16 ? 16 : kw <= 19 ? 19 : 22;
