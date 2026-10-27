/* vistas/ficha.js — la ficha de dimensionado dentro de la ficha del cliente.
 *
 * Es la misma ficha de visita que el comercial usaba suelta en el móvil
 * (zerowattiosingenieria-bit.github.io/ficha): vivienda, instalación
 * actual, gastos, ACS, fotovoltaica, oferta y cierre, con el resumen en vivo
 * y los avisos. Los cálculos son los de aquella ficha, con una diferencia
 * querida: la deducción de IRPF va siempre al 60 %.
 *
 * Siempre al día con el CRM:
 *  - Los datos que vienen del cliente (nombre, dirección, m², gastos…) se
 *    leen del cliente cada vez que se abre la ficha, y si el comercial los
 *    cambia aquí, al guardar se guardan también en el cliente.
 *  - Los que vienen de la instalación (importes con IVA, placas, inversor,
 *    batería, depósitos, plazo…) se leen de su última operación y aquí no se
 *    tocan: se cambian en la pestaña Instalaciones.
 *  - Lo que solo existe en la ficha (altura, zona, emisor, distancias…) se
 *    queda como se guardó.
 *
 * Dónde se guarda: en el campo «notas» del proyecto (PROYECTOS), como texto
 * que empieza por FICHA_DIM_V1: y sigue con el JSON; lo que hubiera antes
 * en notas se conserva dentro (notasPrevias). Y cada vez que se guarda, el
 * resumen completo para el ingeniero se escribe en la descripción del
 * proyecto, entre marcas, sin tocar el resto del texto.
 */

import {h, poner, txt, num, fechaCorta, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, formulario, marca, aviso, avisoError, confirmar, cargando, ventana} from '../ui.js';
import {gastoAnual} from './clientes.js';

export const PREFIJO_FICHA = 'FICHA_DIM_V1:';
const MARCA_INICIO = '=== FICHA DE DIMENSIONADO ===';
const MARCA_FIN = '=== FIN DE LA FICHA ===';

/* ---------- formato: el mismo de la ficha del móvil ---------- */
/* Los miles siempre con punto (9.000 €), como en la ficha original. */
const miles = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const eur = n => miles(n) + ' €';
export const eur2 = n => {
  const v = Math.round(n * 100) / 100, e = Math.floor(Math.abs(v)),
        d = String(Math.round((Math.abs(v) - e) * 100)).padStart(2, '0');
  return (v < 0 ? '-' : '') + miles(e) + ',' + d + ' €';
};
const fechaHora = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return fechaCorta(iso);
  return fechaCorta(d.toLocaleDateString('sv-SE')) + ' ' + d.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
};
const coma = (n, dec = 1) => Number(n).toFixed(dec).replace('.', ',');

/* ---------- tablas (copiadas de la ficha del móvil) ---------- */

const ZONAS = {A: 0.80, B: 0.88, C: 1.00, D: 1.12, E: 1.25};
const ZONA_TXT = {A: 'Muy cálida', B: 'Cálida', C: 'Templada', D: 'Fría', E: 'Muy fría'};
const AISL = {'<1980': 92, '1980-2007': 70, '2007-2019': 52, '>2019': 38};
const FACTOR = {gasoil: 0.35, glp: 0.30, gas: 0.55, electrica: 0.30, ninguno: 1.00};

/* Bonificación de IBI por municipio (Comunidad de Madrid), a agosto de 2026.
   ok:false = existe bonificación pero el % o el plazo NO están confirmados. */
const IBI = {
  'Madrid':               {pct: 50, anios: 5, ok: true,  nota: '7 años si hay baterías. Tope: 50% del coste al año, 95% acumulado.'},
  'Móstoles':             {pct: 50, anios: 4, ok: true,  nota: ''},
  'Pozuelo de Alarcón':   {pct: 50, anios: 3, ok: true,  nota: ''},
  'Coslada':              {pct: 50, anios: 3, ok: true,  nota: ''},
  'Galapagar':            {pct: 50, anios: 5, ok: true,  nota: 'Requiere que la instalación cubra al menos el 40% del suministro total. La bonificación tiene que estar CONCEDIDA antes del 1 de enero del año en que empieza a aplicar: pídela con tiempo.'},
  'Boadilla del Monte':   {pct: 45, anios: 3, ok: true,  nota: ''},
  'Las Rozas':            {pct: 40, anios: 5, ok: true,  nota: 'Entre 40% y 50% según el porcentaje de suministro cubierto. Aquí va el valor prudente.'},
  'Alcobendas':           {pct: 40, anios: 3, ok: true,  nota: 'Entre 40% y 50% según el porcentaje de suministro cubierto. Aquí va el valor prudente.'},
  'Getafe':               {pct: 30, anios: 4, ok: true,  nota: 'Antes eran 10 años; se redujo a 4.'},
  'San Sebastián de los Reyes': {pct: 50, anios: 8, tope: 400, ok: false, nota: 'Subió del 25% al 50% en 2025. Tope de 400 € al año: si el 50% de tu IBI pasa de esa cifra, la bonificación se queda en 400 €. Sin confirmar contra la ordenanza: compruébalo.'},
  'Guadalix de la Sierra': {pct: 30, anios: 5, ok: false, nota: 'Sin confirmar contra la ordenanza. Las fuentes que hay dicen que exige cubrir al menos el 70% del suministro total: con una cobertura del 60% NO entraría. Compruébalo en el ayuntamiento antes de ponerlo por escrito.'},
  'Collado Villalba':     {pct: 50, anios: 5, ok: false, nota: ''},
  'Algete':               {pct: 50, anios: 5, ok: false, nota: ''},
  'Majadahonda':          {pct: 50, anios: 3, ok: false, nota: ''},
  'Valdemoro':            {pct: 35, anios: 10, ok: false, nota: ''},
  'Rivas-Vaciamadrid':    {pct: 35, anios: 5, ok: false, nota: ''},
  'Otro / a confirmar':   {pct: 0,  anios: 0, ok: false, nota: ''}
};

/* Deducción de IRPF: SIEMPRE el 60 % (lo pide la dirección) de un máximo
   de 15.000 €: 7.500 € de aerotermia y 7.500 € de fotovoltaica. Como mucho
   4.500 € + 4.500 € = 9.000 €. No hay desplegable para cambiarlo. */
const BASE_IRPF = 7500;
export const PCT_IRPF = 60;

/* Coeficientes de financiación (Finlight, vigentes desde el 16/10/2026: TIN 8,95 %
   con la comisión de apertura del 2 % prorrateada en las cuotas):
   cuota = importe financiado × coeficiente. De 10 a 20 años son los oficiales;
   72, 84 y 108 meses salen de la misma fórmula (cuota francesa × 1,02). */
const COEF_FIN = {
  72: 0.018361, 84: 0.016385, 108: 0.013787, 120: 0.012894, 132: 0.012172,
  144: 0.01158, 156: 0.011086, 168: 0.01067, 180: 0.010316,
  192: 0.010012, 204: 0.00975, 216: 0.00952, 228: 0.009322, 240: 0.009146
};
const PLAZOS = Object.keys(COEF_FIN).map(Number);

const KWH_MODULO_BATERIA = 5.3;
const PRECIO_MODULO_BATERIA = 2570;   // IVA incluido
const PRECIO_CARGADOR = 1870;         // IVA incluido

/* Los mismos topes que la ficha del móvil aplica al salir de cada número. */
const LIMITES = {
  m2: [40, 900], altura: [2.2, 4], personas: [1, 14], banos: [1, 8], calderaKw: [0, 80],
  potenciaContratada: [1.15, 45], gastoLuzMes: [0, 1500], gastoCombAnio: [0, 20000],
  consumo: [0, 40000], ibiAnual: [0, 5000], factorSust: [0, 100], coberturaFV: [0, 95],
  acsL: [0, 1000], inerciaL: [0, 1000], distDep: [0, 40], distExt: [0, 100], placas: [0, 60],
  numInversores: [0, 10], bateriaModulos: [0, 12], precioAero: [0, 60000], precioFV: [0, 60000],
  precioBateria: [0, 40000], precioCargador: [0, 20000], cae: [0, 6000], reserva: [0, 10000]
};

const SI_NO = [['si', 'Sí'], ['no', 'No']];

const VACIA = {
  tecnico: '', cliente: '', dni: '', cotitular: '', direccion: '', municipio: 'Madrid', municipioOtro: '',
  cp: '', telefono: '', email: '', cups: '', aero: 'si', pv: 'si', bateria: 'no', cargador: 'no',
  zona: 'D', m2: 120, altura: 2.6, anyoConst: '', anyo: '1980-2007', personas: 4, banos: 2,
  caldera: 'gasoil', calderaKw: 24, emisor: 'rad_bt', suministro: 'mono', potenciaContratada: 5.75,
  ec: 'si', refrig: 'si',
  gastoLuzMes: 110, gastoCombAnio: 1800, consumo: 6000, ibiAnual: 0, factorSust: 0, coberturaFV: 60,
  acsL: 0, modulo: 'trio', inerciaL: 0, distDep: 1.5, distExt: 8,
  placas: 0, tipoPlaca: '', numInversores: 1, inversor: '', tejado: 'teja',
  bateriaModulos: 0, bateriaModelo: '',
  precioAero: 0, precioFV: 0, precioBateria: 0, precioCargador: 0, cae: 0, tramoIrpf: '60',
  reserva: 0, mensualidades: 120, slot: '', garantiaAero: 10, garantiaFV: 15, campana: 'regular',
  estado: 'propuesta', fechaDecision: '', observaciones: '', motivoNo: ''
};

/* ---------- de dónde sale cada dato ---------- */

const sinAcentos = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const CALDERA_DE = {'gasoleo': 'gasoil', 'gas natural': 'gas', 'propano': 'glp', 'electrica': 'electrica',
                    'biomasa': 'ninguno', 'bomba de calor': 'ninguno', 'sin calefaccion': 'ninguno'};
const CALDERA_A = {gasoil: 'Gasóleo', gas: 'Gas natural', glp: 'Propano', electrica: 'Eléctrica',
                   ninguno: 'Sin calefacción'};
const anyoValido = v => { const n = num(v); return n > 1800 && n < 2100 ? Math.round(n) : 0; };
export const tramoAnyo = n => n < 1980 ? '<1980' : n <= 2007 ? '1980-2007' : n <= 2019 ? '2007-2019' : '>2019';
const vacio = v => v === null || v === undefined || txt(v) === '';
const numONull = v => num(v) ? num(v) : null;
const txtONull = v => txt(v) || null;

/* Datos del cliente: se leen al abrir y, si se cambian aquí, se guardan en
   el cliente. leer(c) devuelve null si el cliente no tiene ese dato. */
const DEL_CLIENTE = {
  cliente:            {et: 'nombre', leer: c => txtONull(c.nombre), escribir: v => ({nombre: v})},
  dni:                {et: 'DNI', leer: c => txtONull(c.dni), escribir: v => ({dni: v})},
  cotitular:          {et: 'cotitular', leer: c => txtONull(c.cotitular), escribir: v => ({cotitular: v})},
  direccion:          {et: 'dirección', leer: c => txtONull(c.direccion), escribir: v => ({direccion: v})},
  municipio:          {et: 'municipio', leer: c => txtONull(c.municipio), escribir: v => ({municipio: v})},
  cp:                 {et: 'código postal', leer: c => txtONull(c.cp), escribir: v => ({cp: v})},
  telefono:           {et: 'teléfono', leer: c => txtONull(c.telefono), escribir: v => ({telefono: v})},
  email:              {et: 'correo', leer: c => txtONull(c.email), escribir: v => ({email: v})},
  cups:               {et: 'CUPS', leer: c => txtONull(c.cups), escribir: v => ({cups: v})},
  m2:                 {et: 'm²', num: true, leer: c => numONull(c.m2), escribir: v => ({m2: v})},
  personas:           {et: 'personas', num: true, leer: c => numONull(c.personas), escribir: v => ({personas: v})},
  anyoConst:          {et: 'año de construcción', leer: c => anyoValido(c.anyo) ? String(anyoValido(c.anyo)) : null,
                       escribir: v => ({anyo: v})},
  caldera:            {et: 'calefacción', leer: c => CALDERA_DE[sinAcentos(c.calefaccion)] || null,
                       escribir: v => ({calefaccion: CALDERA_A[v] || ''})},
  gastoLuzMes:        {et: 'gasto de luz', num: true, leer: c => vacio(c.gasto_luz_mes) ? null : num(c.gasto_luz_mes),
                       escribir: v => ({gasto_luz_mes: v})},
  gastoCombAnio:      {et: 'gasto de combustible', num: true,
                       leer: c => vacio(c.gasto_combustible) ? null : Math.max(0, gastoAnual(c) - Math.round(num(c.gasto_luz_mes) * 12)),
                       escribir: v => ({gasto_combustible: v, periodo_combustible: 'al año'})},
  potenciaContratada: {et: 'potencia contratada', num: true, leer: c => numONull(c.potencia_contratada),
                       escribir: v => ({potencia_contratada: v})}
};

/* Datos de la última instalación: mandan siempre y aquí no se tocan.
   leer(o) devuelve null si la operación no lo dice: entonces el campo queda
   libre en la ficha. */
const tipoDe = o => txt(o.tipo);
const DE_LA_OPERACION = {
  aero:           {et: 'aerotermia', leer: o => ['aero', 'fv_aero'].includes(tipoDe(o)) ? 'si' : 'no'},
  pv:             {et: 'fotovoltaica', leer: o => ['fv', 'fv_aero', 'bateria'].includes(tipoDe(o)) ? 'si' : 'no'},
  bateria:        {et: 'batería', leer: o => num(o.importe_bateria) || num(o.bateria_kwh) ? 'si' : 'no'},
  cargador:       {et: 'cargador', leer: o => num(o.importe_cargador) || txt(o.cargador_modelo) ? 'si' : 'no'},
  precioAero:     {et: 'importe aerotermia', leer: o => num(o.importe_aero)},
  precioFV:       {et: 'importe FV', leer: o => num(o.importe_fv)},
  precioBateria:  {et: 'importe batería', leer: o => num(o.importe_bateria)},
  precioCargador: {et: 'importe cargador', leer: o => num(o.importe_cargador)},
  reserva:        {et: 'reserva', leer: o => num(o.reserva)},
  mensualidades:  {et: 'plazo', leer: o => COEF_FIN[num(o.plazo_meses)] ? num(o.plazo_meses) : null},
  placas:         {et: 'nº de placas', leer: o => numONull(o.paneles_num)},
  tipoPlaca:      {et: 'tipo de placa', leer: o => txt(o.panel_modelo)
                    ? txt(o.panel_modelo) + (num(o.panel_wp) ? ' ' + num(o.panel_wp) + ' Wp' : '') : null},
  inversor:       {et: 'inversor', leer: o => txt(o.inversor_modelo)
                    ? txt(o.inversor_modelo) + (num(o.inversor_kw) ? ' ' + num(o.inversor_kw) + ' kW' : '') : null},
  bateriaModulos: {et: 'módulos de batería', leer: o => num(o.bateria_kwh) ? Math.round(num(o.bateria_kwh) / KWH_MODULO_BATERIA) : null},
  bateriaModelo:  {et: 'modelo de batería', leer: o => txtONull(o.bateria_modelo)},
  acsL:           {et: 'depósito ACS', leer: o => numONull(o.deposito_acs)},
  inerciaL:       {et: 'depósito de inercia', leer: o => numONull(o.deposito_inercia)},
  tejado:         {et: 'tejado', leer: o => ['teja', 'pizarra', 'chapa', 'plana', 'suelo'].includes(txt(o.tejado)) ? txt(o.tejado) : null}
};

/** La operación que manda: la más reciente (firma, propuesta o alta). */
export function ultimaOperacionDe(c) {
  const fecha = o => txt(o.fecha_firma) || txt(o.fecha_propuesta) || txt(o.creado);
  return api.operacionesDe(c.id).slice().sort((a, b) => fecha(b).localeCompare(fecha(a)))[0] || null;
}

/* ---------- secciones del formulario ---------- */

const SECCIONES = [
  {titulo: '1 · Comercial y cliente', campos: [
    {id: 'tecnico', et: 'Técnico comercial'},
    {id: 'cliente', et: 'Titular (nombre y apellidos)', ancho: 2},
    {id: 'dni', et: 'DNI / fecha de nacimiento'},
    {id: 'cotitular', et: 'Cotitular'},
    {id: 'direccion', et: 'Dirección de la instalación', ancho: 2},
    {id: 'municipio', et: 'Municipio (bonificación IBI)', tipo: 'select', vacio: false, opciones: Object.keys(IBI)},
    {id: 'municipioOtro', et: '¿Qué municipio?', solo: f => f.municipio === 'Otro / a confirmar'},
    {id: 'cp', et: 'Código postal'},
    {id: 'telefono', et: 'Teléfono', tipo: 'tel'},
    {id: 'email', et: 'Correo del cliente', tipo: 'email'},
    {id: 'cups', et: 'CUPS', ayuda: 'Está en la factura de la luz.'},
    {id: 'aero', et: 'Aerotermia en esta obra', tipo: 'select', vacio: false, opciones: SI_NO},
    {id: 'pv', et: 'Fotovoltaica en esta obra', tipo: 'select', vacio: false, opciones: SI_NO},
    {id: 'bateria', et: 'Batería', tipo: 'select', vacio: false, opciones: SI_NO},
    {id: 'cargador', et: 'Cargador de coche', tipo: 'select', vacio: false, opciones: SI_NO}
  ]},
  {titulo: '2 · Vivienda', campos: [
    {id: 'm2', et: 'Superficie útil a climatizar (m²)', tipo: 'numero',
     ayuda: 'Míralo en el Catastro. ≤160 → 12 kW · 161–270 → 16 kW · 271–350 → 19 kW · 351–500 → 22 kW · más, cascada'},
    {id: 'altura', et: 'Altura libre (m)', tipo: 'numero', paso: '0.1'},
    {id: 'zona', et: 'Zona climática', tipo: 'select', vacio: false,
     opciones: [['B', 'Cálida'], ['C', 'Templada'], ['D', 'Fría · Madrid'], ['E', 'Muy fría']]},
    {id: 'anyoConst', et: 'Año de construcción', tipo: 'numero', ayuda: 'Con el año, el aislamiento sale solo.'},
    {id: 'anyo', et: 'Año / aislamiento', tipo: 'select', vacio: false,
     opciones: [['<1980', 'Antes de 1980'], ['1980-2007', '1980–2007'], ['2007-2019', '2007–2019'], ['>2019', 'CTE 2019']]},
    {id: 'personas', et: 'Ocupantes habituales', tipo: 'numero'},
    {id: 'banos', et: 'Baños con ducha', tipo: 'numero'}
  ]},
  {titulo: '3 · Instalación actual', campos: [
    {id: 'caldera', et: 'Generador actual', tipo: 'select', vacio: false,
     opciones: [['gasoil', 'Gasóleo'], ['gas', 'Gas natural'], ['glp', 'Propano'], ['electrica', 'Eléctrica'], ['ninguno', 'Obra nueva / sin calefacción']]},
    {id: 'calderaKw', et: 'Potencia caldera actual (kW)', tipo: 'numero'},
    {id: 'emisor', et: 'Emisor existente', tipo: 'select', vacio: false,
     opciones: [['suelo', 'Suelo radiante'], ['rad_bt', 'Radiador baja Tª'], ['rad_at', 'Radiador tradicional'], ['fancoil', 'Fancoil']]},
    {id: 'suministro', et: 'Suministro eléctrico', tipo: 'select', vacio: false,
     opciones: [['mono', 'Monofásico 230 V'], ['tri', 'Trifásico 400 V']]},
    {id: 'potenciaContratada', et: 'Potencia contratada (kW)', tipo: 'numero', paso: '0.01'},
    {id: 'ec', et: 'Módulo wifi Easy Connect', tipo: 'select', vacio: false, opciones: SI_NO},
    {id: 'refrig', et: 'Refrigeración', tipo: 'select', vacio: false, opciones: SI_NO}
  ]},
  {titulo: '4 · Gastos actuales', nota: 'Son los números que sostienen la venta: no los estimes, pide la factura.', campos: [
    {id: 'gastoLuzMes', et: 'Gasto de luz (€/mes)', tipo: 'euro'},
    {id: 'gastoCombAnio', et: 'Gasóleo / gas / propano (€/año)', tipo: 'euro'},
    {id: 'consumo', et: 'Consumo eléctrico anual (kWh)', tipo: 'numero'},
    {id: 'ibiAnual', et: 'IBI anual de la vivienda (€)', tipo: 'euro'},
    {id: 'factorSust', et: 'Factor de sustitución (%, 0 = automático)', tipo: 'numero',
     ayuda: 'Gasóleo 35 % · propano 30 % · gas natural 55 % · eléctrica 30 %'},
    {id: 'coberturaFV', et: 'Cobertura fotovoltaica (%)', tipo: 'numero',
     ayuda: 'Orientativo: 55–65 % sin batería, 70–85 % con batería.'}
  ]},
  {titulo: '5 · ACS, inercia y tramos', solo: f => f.aero === 'si', campos: [
    {id: 'acsL', et: 'Capacidad de ACS (L, 0 = automático)', tipo: 'numero',
     ayuda: '200 L hasta 6 personas, 300 L a partir de 7.'},
    {id: 'modulo', et: 'Acumulación ACS', tipo: 'select', vacio: false,
     opciones: [['trio', 'Fusion HT Trio'], ['sanit', 'Sanit + inercia']]},
    {id: 'inerciaL', et: 'Depósito de inercia (L)', tipo: 'numero'},
    {id: 'distDep', et: 'Metros de caldera a depósitos', tipo: 'numero', paso: '0.5'},
    {id: 'distExt', et: 'Metros de depósitos a unidad exterior', tipo: 'numero'}
  ]},
  {titulo: '6 · Fotovoltaica', solo: f => f.pv === 'si', campos: [
    {id: 'placas', et: 'Nº de placas', tipo: 'numero'},
    {id: 'tipoPlaca', et: 'Tipo de placa', pista: 'Ej. 580 Wp full black'},
    {id: 'numInversores', et: 'Nº de inversores', tipo: 'numero'},
    {id: 'inversor', et: 'Inversor (marca, modelo, kW)'},
    {id: 'tejado', et: 'Tipo de tejado', tipo: 'select', vacio: false,
     opciones: [['teja', 'Teja'], ['pizarra', 'Pizarra'], ['chapa', 'Chapa'], ['plana', 'Plana'], ['suelo', 'Suelo']]},
    {id: 'bateriaModulos', et: 'Módulos de batería (5,3 kWh c/u)', tipo: 'numero', solo: f => f.bateria === 'si'},
    {id: 'bateriaModelo', et: 'Modelo de batería', solo: f => f.bateria === 'si'}
  ]},
  {titulo: '7 · Oferta y financiación', nota: 'Precios con IVA incluido. Deducción de IRPF siempre al 60 %.', campos: [
    {id: 'precioAero', et: 'Precio aerotermia (€)', tipo: 'euro', solo: f => f.aero === 'si'},
    {id: 'precioFV', et: 'Precio fotovoltaica (€)', tipo: 'euro', solo: f => f.pv === 'si'},
    {id: 'precioBateria', et: 'Precio batería (€, 0 = tarifa)', tipo: 'euro',
     solo: f => f.pv === 'si' && f.bateria === 'si'},
    {id: 'precioCargador', et: 'Precio cargador (€, 0 = tarifa)', tipo: 'euro', solo: f => f.cargador === 'si'},
    {id: 'cae', et: 'CAE estimado (€)', tipo: 'euro',
     ayuda: 'Lo cobra el cliente; solo si se sustituye una caldera de combustión.'},
    {id: 'reserva', et: 'Reserva (€)', tipo: 'euro'},
    {id: 'mensualidades', et: 'Plazo de financiación', tipo: 'select', vacio: false,
     opciones: PLAZOS.map(m => [String(m), m + ' meses · ' + (m / 12) + ' años'])},
    {id: 'slot', et: 'Slot de instalación', pista: 'Semana del …'},
    {id: 'garantiaAero', et: 'Garantía aerotermia (años)', tipo: 'numero', solo: f => f.aero === 'si'},
    {id: 'garantiaFV', et: 'Garantía fotovoltaica (años)', tipo: 'numero', solo: f => f.pv === 'si'},
    {id: 'campana', et: 'Tipo de oferta', tipo: 'select', vacio: false,
     opciones: [['regular', 'Regular'], ['campana', 'Campaña']]}
  ]},
  {titulo: '8 · Cierre y seguimiento', campos: [
    {id: 'estado', et: 'Estado de la venta', tipo: 'select', vacio: false,
     opciones: [['cerrada', 'Cerrada'], ['propuesta', 'Propuesta enviada'], ['pensando', 'Lo está pensando'], ['no', 'No cerrada']]},
    {id: 'fechaDecision', et: 'Fecha de decisión pactada', tipo: 'fecha'},
    {id: 'observaciones', et: 'Observaciones', tipo: 'area', ancho: 3, filas: 3},
    {id: 'motivoNo', et: 'Motivo del no', tipo: 'area', ancho: 3, filas: 2, solo: f => f.estado === 'no'}
  ]}
];

const TODOS = SECCIONES.flatMap(s => s.campos);
const NUMERICOS = new Set(TODOS.filter(c => c.tipo === 'numero' || c.tipo === 'euro').map(c => c.id)
  .concat(['mensualidades']).filter(k => k !== 'anyoConst'));

/** Normaliza lo leído: números como números, dentro de los topes de la ficha. */
export function normalizar(f) {
  const o = Object.assign({}, VACIA, f);
  NUMERICOS.forEach(k => {
    let v = num(o[k]);
    const l = LIMITES[k];
    if (l) v = Math.min(l[1], Math.max(l[0], v));
    o[k] = Math.round(v * 100) / 100;
  });
  o.tramoIrpf = String(PCT_IRPF);
  const a = anyoValido(o.anyoConst);
  o.anyoConst = a ? String(a) : '';
  if (a) o.anyo = tramoAnyo(a);
  if (!COEF_FIN[o.mensualidades]) o.mensualidades = 120;
  return o;
}

/* ---------- cálculo: el de la ficha del móvil, con el IRPF al 60 % ---------- */

export function calcular(fEntrada) {
  const f = normalizar(fEntrada);
  const conAero = f.aero === 'si', conFV = f.pv === 'si';
  const cascada = f.m2 > 500;
  const kw = f.m2 <= 160 ? 12 : f.m2 <= 270 ? 16 : f.m2 <= 350 ? 19 : 22;
  const demanda = f.m2 * AISL[f.anyo] * ZONAS[f.zona] * (f.altura / 2.5) / 1000;
  const acs = f.acsL || (f.personas <= 6 ? 200 : 300);
  const ht = f.suministro === 'tri' ? 'HTT' : 'HT';
  const gama = ht + (f.ec === 'si' ? ' EC' : '') + ' PRO';
  const unidades = cascada ? 2 : 1;
  const modelo = (cascada ? '2 × ' : '') + 'Dual Clima ' + kw + ' ' + gama;
  const separador = f.emisor !== 'suelo';
  const tanque = !f.inerciaL ? 'Sin depósito de inercia' : (separador ? 'BTS ' : 'BT ') + f.inerciaL;
  const acsCat = [150, 200, 300].indexOf(acs) !== -1;
  const acumulador = acsCat
    ? (f.modulo === 'trio' ? 'Fusion HT Trio ' + acs : 'Sanit ' + acs)
    : 'Acumulador ACS ' + acs + ' L (fuera de catálogo Fusion)';
  const tejadoTxt = {teja: 'Cubierta de teja inclinada', pizarra: 'Cubierta de pizarra',
    chapa: 'Cubierta de chapa', plana: 'Cubierta plana con lastre', suelo: 'Estructura en suelo'}[f.tejado] || '';

  /* economía */
  const factor = f.factorSust > 0 ? f.factorSust / 100 : FACTOR[f.caldera];
  const luzAnio = f.gastoLuzMes * 12;
  const combAnio = f.gastoCombAnio;
  const actual = luzAnio + combAnio;
  const termFut = conAero ? combAnio * factor : combAnio;
  const subtotal = termFut + luzAnio;
  const cobFV = conFV ? f.coberturaFV / 100 : 0;
  const futuro = subtotal * (1 - cobFV);
  const ahorro = Math.max(0, actual - futuro);
  const ahorroMes = ahorro / 12;

  /* inversión y ayudas */
  const conBat = conFV && f.bateria === 'si';
  const conCar = f.cargador === 'si';
  const modulosBat = conBat ? (Number(f.bateriaModulos) || 0) : 0;
  const kwhBat = Math.round(modulosBat * KWH_MODULO_BATERIA * 10) / 10;
  const precioBatSug = modulosBat * PRECIO_MODULO_BATERIA;
  const precioAero = conAero ? f.precioAero : 0;
  const precioFV = conFV ? f.precioFV : 0;
  const precioBat = conBat ? (f.precioBateria > 0 ? f.precioBateria : precioBatSug) : 0;
  const precioCar = conCar ? (f.precioCargador > 0 ? f.precioCargador : PRECIO_CARGADOR) : 0;
  const inversion = precioAero + precioFV + precioBat + precioCar;
  const tramo = PCT_IRPF;
  /* IRPF: el 60 % de un máximo de 15.000 €, 7.500 € de aerotermia y
     7.500 € de fotovoltaica (batería y cargador van en la parte de FV).
     Como mucho 4.500 € + 4.500 € = 9.000 €. */
  const baseAeroIrpf = conAero ? Math.min(precioAero, BASE_IRPF) : 0;
  const baseFVIrpf = conFV || conCar ? Math.min(precioFV + precioBat + precioCar, BASE_IRPF) : 0;
  const baseIrpf = baseAeroIrpf + baseFVIrpf;
  const deduccionAero = Math.round(baseAeroIrpf * tramo / 100);
  const deduccionFV = Math.round(baseFVIrpf * tramo / 100);
  const deduccion = deduccionAero + deduccionFV;
  const muni = f.municipio === 'Otro / a confirmar' && txt(f.municipioOtro) ? txt(f.municipioOtro) : f.municipio;
  const ibiMun = IBI[muni] || IBI['Otro / a confirmar'];
  const ibiAnual = f.ibiAnual * ibiMun.pct / 100;
  const ibiTopado = ibiMun.tope ? Math.min(ibiAnual, ibiMun.tope) : ibiAnual;
  const ibiTotal = Math.round(ibiTopado * ibiMun.anios);
  const cae = f.cae;
  const ayudas = deduccion + ibiTotal + cae;
  const facturado = inversion;
  const costeReal = Math.max(0, facturado - deduccion - ibiTotal - cae);
  const retorno = ahorro > 0 ? costeReal / ahorro : 0;

  /* financiación: partida a partida, con la reserva repartida entre ellas */
  const meses = f.mensualidades;
  const coef = COEF_FIN[meses] || 0;
  const reserva = f.reserva;
  const repartoRes = p => inversion > 0 ? reserva * p / inversion : 0;
  const finAero = Math.max(0, precioAero - repartoRes(precioAero));
  const finFV = Math.max(0, precioFV - repartoRes(precioFV));
  const finBat = Math.max(0, precioBat - repartoRes(precioBat));
  const finCar = Math.max(0, precioCar - repartoRes(precioCar));
  const cuotaDe = (c, fin) => Math.round(fin * c * 100) / 100;
  const cuotaCon = c => (conAero ? cuotaDe(c, finAero) : 0) + (conFV ? cuotaDe(c, finFV) : 0) +
                        (conBat ? cuotaDe(c, finBat) : 0) + (conCar ? cuotaDe(c, finCar) : 0);
  const cuota = cuotaCon(coef);
  const cuota10 = cuotaCon(COEF_FIN[120]);
  const esfuerzo = cuota - ahorroMes;
  const coste0 = cuota > 0 && esfuerzo <= 0;
  const aplazado = Math.max(0, facturado - reserva);
  const cuotaTeorica = meses > 0 ? aplazado / meses : 0;
  const plazoCoste0 = ahorroMes > 0 ? Math.ceil(aplazado / ahorroMes) : 0;
  const totalPagado = cuota * meses + reserva;
  const intereses = Math.max(0, totalPagado - facturado);

  /* potencia pico, si se sabe la potencia de la placa */
  const wp = (String(f.tipoPlaca).match(/(\d{3})\s*W/i) || [])[1];
  const kwp = conFV && f.placas && wp ? Math.round(f.placas * Number(wp) / 10) / 100 : 0;

  return {f, conAero, conFV, conBat, conCar, kw, cascada, unidades, demanda, acs, acsCat, acumulador,
    modelo, gama, tanque, separador, tejadoTxt, factor, luzAnio, combAnio, actual, futuro, ahorro, ahorroMes,
    modulosBat, kwhBat, precioBatSug, precioAero, precioFV, precioBat, precioCar, inversion,
    tramo, baseIrpf, baseAeroIrpf, baseFVIrpf, deduccionAero, deduccionFV, deduccion, muni, ibiMun, ibiTotal, cae, ayudas, facturado,
    costeReal, retorno, meses, coef, reserva, finAero, finFV, finBat, finCar, cuota, cuota10, esfuerzo,
    coste0, aplazado, cuotaTeorica, plazoCoste0, totalPagado, intereses, kwp};
}

/* Los avisos de la ficha del móvil, con el mismo texto (sin negritas). */
export function avisosFicha(fEntrada, r) {
  const f = normalizar(fEntrada);
  r = r || calcular(f);
  const a = [];
  const W = t => a.push(['aviso', t]), I = t => a.push(['info', t]), E = t => a.push(['mal', t]),
        OK = t => a.push(['bien', t]);

  if (!r.conAero && !r.conFV) E('La ficha no tiene marcada ni aerotermia ni fotovoltaica: activa al menos una.');
  if (!f.cliente) E('Falta el nombre del cliente.');
  if (!f.email) E('Falta el email: sin él el motor no puede enviar la propuesta.');
  if (!f.gastoCombAnio && !f.gastoLuzMes) E('Sin gastos actuales no se puede calcular el ahorro. Pide la factura antes de salir de la casa.');
  const mun = r.ibiMun;
  if (!f.ibiAnual && mun.pct) W('Falta el IBI anual: sin él no se puede cuantificar la bonificación de ' + mun.pct + '% durante ' + mun.anios + ' años.');
  if (f.municipio === 'Otro / a confirmar' && !String(f.municipioOtro || '').trim()) E('Has marcado «Otro»: escribe el nombre del municipio en el campo de debajo.');
  else if (!mun.pct) W(r.muni + ': no hay bonificación de IBI cargada. Consulta la ordenanza fiscal del ayuntamiento antes de prometer nada.');
  else if (!mun.ok) W('La bonificación de IBI de ' + r.muni + ' NO está verificada contra la ordenanza vigente. Compruébala en la web del ayuntamiento antes de ponerla por escrito en la propuesta.');
  else if (mun.nota) I(r.muni + ': ' + mun.nota);
  if (!f.cups) W('Falta el CUPS. Está en la factura de la luz y hace falta para la legalización.');

  if (r.conAero && r.cascada) W('Superficie por encima de 500 m²: cascada de dos unidades de igual potencia. La combinación final la decide el técnico.');
  if (r.conAero && r.kw >= 22 && f.suministro === 'mono') W('22 kW en monofásico: comprobar potencia contratada y arranque. Recomendable trifásica 400 V.');
  if (r.conAero && f.refrig === 'si' && (f.emisor === 'rad_at' || f.emisor === 'rad_bt')) W('Los radiadores no dan frío: prever fancoils o suelo refrescante en las estancias a refrigerar.');
  if (r.conAero && f.emisor === 'rad_at') I('Radiador tradicional a 60–75 °C: la Dual Clima HT/HTT (R290) llega a 75 °C de impulsión, no hace falta apoyo de caldera.');
  if (r.conAero && Math.abs(r.demanda - r.kw) / r.kw > 0.3) W('La estimación por zona y aislamiento da ' + coma(r.demanda) + ' kW frente a los ' + r.kw + ' kW de tarifa. Revisar si procede subir o bajar un escalón.');
  if (r.conAero && f.distDep > 2) W('Son ' + String(f.distDep).replace('.', ',') + ' m de la máquina a los depósitos (más de 2 m): contar tubería, aislamiento reforzado y pérdidas de carga en el presupuesto.');
  if (r.conAero && f.distExt > 10) W('Son ' + f.distExt + ' m de los depósitos a la unidad exterior (más de 10 m): revisar sección de tubería, caudal mínimo, aislamiento a la intemperie y volumen de glicol.');
  if (r.conAero && !r.acsCat) W(r.acs + ' L no es una capacidad de catálogo (150, 200 o 300 L): ajustar o confirmar disponibilidad antes de pedir material.');
  if (r.conFV && r.conAero) {
    if (f.ec === 'si') I('Dual Clima ' + (f.suministro === 'tri' ? 'HTT' : 'HT') + ' EC PRO con Easy Connect: gestión de excedente fotovoltaico integrada hacia ACS e inercia.');
    else W('Sin módulo Easy Connect la máquina va como ' + (f.suministro === 'tri' ? 'HTT' : 'HT') + ' PRO: no hay conectividad wifi ni gestión automática del excedente fotovoltaico.');
  }
  if (f.bateria === 'si' && !r.conFV) W('Hay batería marcada pero no fotovoltaica: la batería va con la instalación solar. Revísalo.');
  if (r.conBat && !r.modulosBat) W('Batería marcada como sí pero sin módulos: pon cuántos lleva y completa el modelo antes de cerrar la ficha.');

  if (r.conAero && f.caldera === 'gas') W('Cliente de gas natural: el ahorro es más moderado y el coste 0 puede no salir. Argumenta confort, refrigeración y letra energética, y NO prometas coste 0 sin comprobar el número.');
  if (f.caldera === 'gasoil' || f.caldera === 'glp') OK('Cliente de ' + (f.caldera === 'gasoil' ? 'gasóleo' : 'propano') + ': es el mejor caso de amortización. Retorno típico de 4 a 6 años.');
  if (r.cuota > 0 && r.coste0) OK('COSTE 0: la cuota de ' + eur2(r.cuota) + '/mes cabe dentro del ahorro de ' + eur2(r.ahorroMes) + '/mes. Se puede plantear así.');
  if (r.intereses > 0) I('Con ' + f.mensualidades + ' meses el cliente paga ' + eur(r.totalPagado) + ' en total por ' + eur(r.facturado) + ' de instalación: ' + eur(r.intereses) + ' de coste de financiación. Dilo si te lo preguntan.');
  if (r.tramo === 60) W('Tramo del 60%: la ficha calcula ' + eur(r.deduccion) + ' con base de ' + eur(BASE_IRPF) + ' por tecnología. La normativa fija además un límite anual de base de deducción, así que puede que el cliente no se lo deduzca todo en un solo ejercicio. Di "hasta ' + eur(r.deduccion) + '" y que lo confirme con su asesor: no prometas que se lo devuelven de golpe el año que viene.');
  if (r.tramo === 60 && !(r.conAero && r.conFV)) I('Con una sola tecnología la base es ' + eur(r.baseIrpf) + ', no ' + eur(2 * BASE_IRPF) + '.');
  if (r.tramo > 0 && r.baseIrpf < (r.conAero ? BASE_IRPF : 0) + (r.conFV ? BASE_IRPF : 0)) I('La base de deducción (' + eur(r.baseIrpf) + ') es menor que el máximo porque algún precio está por debajo de ' + eur(BASE_IRPF) + '.');
  if (r.cuota > 0 && !r.coste0) W('NO es coste 0: la cuota de ' + eur2(r.cuota) + '/mes supera el ahorro de ' + eur2(r.ahorroMes) + '/mes en ' + eur2(r.esfuerzo) + '. Para que salga a coste 0 harían falta unas ' + r.plazoCoste0 + ' mensualidades. Dilo tal cual: no lo prometas.');
  if (!f.fechaDecision && f.estado === 'propuesta') E('Sin fecha de decisión. No salgas de la visita sin ella.');
  return a;
}

/* ---------- la ficha al abrirla: guardada + lo que diga hoy el CRM ---------- */

const igual = (a, b, esNum) => esNum ? num(a) === num(b) : sinAcentos(a) === sinAcentos(b);

/* El municipio de la ficha es un desplegable con los de la tabla de IBI; si
   no está, va en «Otro» con el nombre escrito. */
function ponerMunicipio(f, nombre) {
  const k = Object.keys(IBI).find(x => sinAcentos(x) === sinAcentos(nombre));
  if (k) { f.municipio = k; f.municipioOtro = ''; } else { f.municipio = 'Otro / a confirmar'; f.municipioOtro = txt(nombre); }
}
const municipioDe = f => f.municipio === 'Otro / a confirmar' ? txt(f.municipioOtro) : txt(f.municipio);

/**
 * Junta la ficha guardada con lo que hay hoy en el CRM. Devuelve los
 * valores, qué campos manda el CRM (y de dónde) y qué ha cambiado respecto
 * a lo guardado.
 */
export function fichaConCRM(c, guardada) {
  const f = Object.assign({}, VACIA, guardada || {});
  const op = ultimaOperacionDe(c);
  const delCliente = {}, deOperacion = {};
  const cambios = [], claves = [];
  const pon = (k, v, et, esNum) => {
    if (guardada && k in guardada && !igual(k === 'municipio' ? municipioDe(guardada) : guardada[k], v, esNum)) {
      cambios.push(et); claves.push(k);
      if (k === 'municipio') claves.push('municipioOtro');
    }
    if (k === 'municipio') ponerMunicipio(f, v); else f[k] = v;
  };

  const comercial = api.nombrePersona(c.comercial_id);
  f.tecnico = comercial !== '—' ? comercial : (txt(f.tecnico) || txt((api.estado.usuario || {}).nombre));
  if (guardada && 'tecnico' in guardada && txt(guardada.tecnico) !== f.tecnico) claves.push('tecnico');

  Object.entries(DEL_CLIENTE).forEach(([k, d]) => {
    const v = d.leer(c);
    if (v === null) return;
    delCliente[k] = v;
    pon(k, v, d.et, d.num);
  });
  if (op) Object.entries(DE_LA_OPERACION).forEach(([k, d]) => {
    const v = d.leer(op);
    if (v === null) return;
    deOperacion[k] = v;
    pon(k, v, d.et, typeof v === 'number');
  });
  if (anyoValido(f.anyoConst)) f.anyo = tramoAnyo(anyoValido(f.anyoConst));
  f.tramoIrpf = String(PCT_IRPF);
  f.mensualidades = String(COEF_FIN[num(f.mensualidades)] ? num(f.mensualidades) : 120);
  if (guardada && anyoValido(f.anyoConst) && guardada.anyo !== f.anyo) claves.push('anyo');
  return {valores: f, op, delCliente, deOperacion, cambios: [...new Set(cambios)], clavesCRM: [...new Set(claves)]};
}

/** Lo que el comercial ha cambiado en la ficha y hay que llevar al cliente. */
export function cambiosParaCliente(c, f) {
  const datos = {};
  Object.entries(DEL_CLIENTE).forEach(([k, d]) => {
    let v = k === 'municipio' ? municipioDe(f) : f[k];
    if (vacio(v) || (d.num && !num(v))) return;          // vaciar aquí no borra nada del cliente
    if (k === 'anyoConst' && !anyoValido(v)) return;
    const actual = d.leer(c);
    if (actual !== null && igual(actual, v, d.num)) return;
    if (k === 'caldera' && actual === null && v === 'ninguno' && txt(c.calefaccion)) return;
    Object.assign(datos, d.escribir(d.num ? num(v) : txt(v), c));
  });
  return datos;
}

/* ---------- guardar sin pisar nada ---------- */

/* ---------- versiones ----------
 * En notas va un JSON con la ficha actual completa y su historial: cada
 * versión guarda solo lo que cambió respecto a la anterior, {campo: [antes,
 * después]}, quién, cuándo y si el cambio vino del comercial o del CRM.
 * Para ver una versión vieja se parte de la actual y se deshacen los cambios
 * de las posteriores. Si el JSON se acerca al tope de una celda de Google
 * Sheets (50.000 caracteres), se podan las versiones más viejas, pero nunca
 * la v1 (como resumen), ni las 20 últimas, ni la ficha actual.
 */
export const TOPE_NOTAS = 45000;
const VERSIONES_MINIMAS = 20;

/** Lee lo guardado en notas: ficha, versiones y el texto que hubiera antes. */
export function leerNotas(notas) {
  const s = txt(notas);
  const vacioP = extra => Object.assign({ficha: null, notasPrevias: '', version: 0, historial: [], podadas: 0}, extra);
  if (s.startsWith(PREFIJO_FICHA)) {
    try {
      const d = JSON.parse(s.slice(PREFIJO_FICHA.length));
      return vacioP({ficha: d.ficha || null, notasPrevias: txt(d.notasPrevias), guardada: d.guardada, por: d.por,
        version: num(d.version), historial: Array.isArray(d.historial) ? d.historial : [],
        podadas: num(d.podadas), formatoAntiguo: !Array.isArray(d.historial)});
    } catch (e) { return vacioP({notasPrevias: s}); }
  }
  return vacioP({notasPrevias: s});
}

const valorPlano = v => v === null || v === undefined ? '' : (typeof v === 'number' ? v : String(v));
const mismo = (a, b) => String(valorPlano(a)) === String(valorPlano(b));

/** Lo que cambia de una ficha a otra: {campo: [antes, después]}. */
export function diferencias(antes, despues, claves) {
  const out = {};
  const ks = claves || [...new Set(Object.keys(antes || {}).concat(Object.keys(despues || {})))];
  ks.forEach(k => {
    const a = (antes || {})[k], b = (despues || {})[k];
    if (!mismo(a, b)) out[k] = [valorPlano(a), valorPlano(b)];
  });
  return out;
}

const empaquetar = p => PREFIJO_FICHA + JSON.stringify({
  v: 2, ficha: p.ficha, version: p.version, guardada: p.guardada, por: p.por,
  historial: p.historial, podadas: p.podadas || 0, notasPrevias: p.notasPrevias || ''});

/**
 * Añade las versiones de este guardado. `clavesCRM` son los campos que al
 * abrir la ficha se refrescaron con datos del CRM: esos cambios van en una
 * versión aparte con origen «crm». Devuelve el paquete nuevo y si ha
 * habido versión (si no cambió nada, no la hay).
 */
export function nuevaVersion(paquete, ficha, {por, clavesCRM = [], ahora} = {}) {
  const p = Object.assign({historial: [], version: 0, podadas: 0}, paquete);
  p.historial = (p.historial || []).slice();
  const fecha = ahora || new Date().toISOString();
  const base = {fecha, por: por || ''};
  let creadas = 0;
  if (!p.ficha || !p.version || !p.historial.length) {
    p.version = 1;
    p.historial = [Object.assign({v: 1, origen: 'comercial', inicial: true, cambios: {},
      resumen: p.ficha ? 'Ficha migrada del formato anterior' : 'Ficha creada'}, base)];
    creadas = 1;
  } else {
    const anterior = normalizar(p.ficha);
    const todo = diferencias(anterior, ficha);
    const delCRM = {}, delComercial = {};
    Object.entries(todo).forEach(([k, d]) => { (clavesCRM.includes(k) ? delCRM : delComercial)[k] = d; });
    [[delCRM, 'crm'], [delComercial, 'comercial']].forEach(([cambios, origen]) => {
      if (!Object.keys(cambios).length) return;
      p.version += 1;
      p.historial.push(Object.assign({v: p.version, origen, cambios}, base));
      creadas++;
    });
  }
  p.ficha = ficha;
  if (creadas) { p.guardada = fecha; p.por = por || ''; }
  return {paquete: podar(p), creadas};
}

/** Mantiene el JSON por debajo del tope sin perder la ficha actual. */
export function podar(p) {
  const tam = () => empaquetar(p).length;
  const quitable = () => {
    const resto = p.historial.filter(e => !e.inicial);
    const protegidas = new Set(resto.slice(-VERSIONES_MINIMAS).map(e => e.v));
    return p.historial.findIndex(e => !e.inicial && !protegidas.has(e.v));
  };
  let i;
  while (tam() > TOPE_NOTAS && (i = quitable()) >= 0) { p.historial.splice(i, 1); p.podadas = (p.podadas || 0) + 1; }
  if (tam() > TOPE_NOTAS) {
    /* Último recurso: textos larguísimos en los cambios viejos se recortan. */
    p.historial.forEach(e => Object.values(e.cambios || {}).forEach(par => par.forEach((v, j) => {
      if (typeof v === 'string' && v.length > 200) par[j] = v.slice(0, 199) + '…';
    })));
  }
  while (tam() > TOPE_NOTAS && p.historial.length > 2) {
    const j = p.historial.findIndex(e => !e.inicial);
    p.historial.splice(j, 1); p.podadas = (p.podadas || 0) + 1;
  }
  return p;
}

/** Reconstruye la ficha de la versión v, o null si ya no se puede (podada). */
export function fichaDeVersion(paquete, v) {
  const actual = paquete.version;
  if (v === actual) return Object.assign({}, paquete.ficha);
  const posteriores = (paquete.historial || []).filter(e => e.v > v).sort((a, b) => b.v - a.v);
  if (posteriores.length !== actual - v) return null;
  if (!(paquete.historial || []).some(e => e.v === v)) return null;
  const f = Object.assign({}, paquete.ficha);
  posteriores.forEach(e => Object.entries(e.cambios || {}).forEach(([k, [antes]]) => { f[k] = antes; }));
  return f;
}

export const empaquetarNotas = (ficha, notasPrevias) => empaquetar({ficha, notasPrevias, version: 0, historial: []});

const etSel = (id, v) => {
  const c = TODOS.find(x => x.id === id);
  const o = c && (c.opciones || []).find(x => String(Array.isArray(x) ? x[0] : x) === String(v));
  return o ? (Array.isArray(o) ? o[1] : o) : txt(v);
};
const siNo = v => v === 'si' ? 'sí' : 'no';

/** Nombre en castellano de un campo y su valor, para el historial. */
export const etiquetaCampo = k => ({tramoIrpf: 'Tramo IRPF', tecnico: 'Técnico comercial'}[k]) ||
  ((TODOS.find(c => c.id === k) || {}).et || k).replace(/ \(.*\)$/, '');
export function valorCampo(k, v) {
  const c = TODOS.find(x => x.id === k) || {};
  if (vacio(v)) return '—';
  if (c.tipo === 'euro') return eur(num(v));
  if (c.tipo === 'select') return etSel(k, v);
  if (c.tipo === 'fecha') return fechaCorta(v);
  return String(v);
}

/** El bloque que lee el ingeniero en la descripción del proyecto. */
export function textoResumen(fEntrada, r, {op, por, cuando, version} = {}) {
  const f = normalizar(fEntrada);
  r = r || calcular(f);
  const l = [];
  const s = t => { l.push(''); l.push('— ' + t + ' —'); };
  const p = (et, v) => { if (!vacio(v)) l.push(et + ': ' + v); };
  l.push(MARCA_INICIO);
  if (version) p('Versión', 'v' + version + ' · ' + (cuando || fechaCorta(hoyISO())) + ' · ' + (por || txt(f.tecnico) || '—'));
  p('Última actualización', (cuando || fechaCorta(hoyISO())) + ' · ' + (por || txt(f.tecnico) || '—'));

  s('1 · Comercial y cliente');
  p('Técnico comercial', f.tecnico);
  p('Titular', f.cliente + (f.dni ? ' (' + f.dni + ')' : ''));
  p('Cotitular', f.cotitular);
  p('Dirección', [f.direccion, r.muni, f.cp].filter(Boolean).join(', '));
  p('Teléfono', f.telefono); p('Correo', f.email); p('CUPS', f.cups);
  p('Alcance', [r.conAero ? 'aerotermia' : '', r.conFV ? 'fotovoltaica' : '', r.conBat ? 'batería' : '',
    r.conCar ? 'cargador de coche' : ''].filter(Boolean).join(' + ') || 'sin equipos marcados');

  s('2 · Vivienda');
  p('Superficie útil', f.m2 + ' m²');
  p('Altura libre', String(f.altura).replace('.', ',') + ' m');
  p('Zona climática', ZONA_TXT[f.zona]);
  p('Aislamiento', etSel('anyo', f.anyo) + (f.anyoConst ? ' (construida en ' + f.anyoConst + ')' : ''));
  p('Ocupantes / baños', f.personas + ' personas · ' + f.banos + ' baños con ducha');

  s('3 · Instalación actual');
  p('Generador', etSel('caldera', f.caldera) + (f.calderaKw ? ' · ' + f.calderaKw + ' kW' : ''));
  p('Emisor', etSel('emisor', f.emisor));
  p('Suministro', etSel('suministro', f.suministro) + ' · ' + String(f.potenciaContratada).replace('.', ',') + ' kW contratados');
  p('Easy Connect / refrigeración', siNo(f.ec) + ' / ' + siNo(f.refrig));

  s('4 · Gastos actuales');
  p('Luz', eur(f.gastoLuzMes) + '/mes');
  p('Combustible', eur(f.gastoCombAnio) + '/año');
  p('Consumo eléctrico', f.consumo ? miles(f.consumo) + ' kWh/año' : '');
  p('IBI anual', eur(f.ibiAnual));
  p('Hipótesis', 'factor de sustitución ' + Math.round(r.factor * 100) + ' %' +
    (r.conFV ? ' · cobertura FV ' + f.coberturaFV + ' %' : ''));

  if (r.conAero) {
    s('5 · ACS, inercia y tramos');
    p('ACS', r.acs + ' L' + (f.acsL ? '' : ' (por ocupantes)') + ' · ' + r.acumulador);
    p('Inercia', r.tanque);
    p('Tramos', 'caldera → depósitos ' + String(f.distDep).replace('.', ',') + ' m · depósitos → exterior ' + f.distExt + ' m');
  }
  if (r.conFV) {
    s('6 · Fotovoltaica');
    p('Placas', f.placas + (f.tipoPlaca ? ' × ' + f.tipoPlaca : '') + (r.kwp ? ' · ' + coma(r.kwp, 2) + ' kWp' : ''));
    p('Inversor', (f.numInversores > 1 ? f.numInversores + ' × ' : '') + (f.inversor || 'sin definir'));
    p('Cubierta', r.tejadoTxt);
    if (r.conBat) p('Batería', r.modulosBat + ' módulo(s) · ' + coma(r.kwhBat) + ' kWh' + (f.bateriaModelo ? ' · ' + f.bateriaModelo : ''));
  }

  s('7 · Oferta y financiación (IVA incluido)');
  if (r.conAero) p('Aerotermia', eur(r.precioAero));
  if (r.conFV) p('Fotovoltaica', eur(r.precioFV));
  if (r.conBat) p('Batería', eur(r.precioBat));
  if (r.conCar) p('Cargador', eur(r.precioCar));
  p('Inversión total', eur(r.inversion));
  p('Deducción IRPF 60 %', 'aerotermia ' + eur(r.deduccionAero) + ' + fotovoltaica ' + eur(r.deduccionFV) +
    ' = ' + eur(r.deduccion) + ' (base máxima 7.500 € por tecnología)');
  p('Ayudas', 'IRPF ' + eur(r.deduccion) + ' · IBI ' + eur(r.ibiTotal) +
    ' (' + r.ibiMun.pct + ' % × ' + r.ibiMun.anios + ' años) · CAE ' + eur(r.cae));
  p('Coste real tras ayudas', eur(r.costeReal));
  p('Financiación', 'cuota a 10 años ' + eur2(r.cuota10) + '/mes' +
    (r.meses !== 120 ? ' · a ' + r.meses + ' meses ' + eur2(r.cuota) + '/mes' : '') +
    (r.reserva ? ' · reserva ' + eur(r.reserva) : '') + ' · amortización anticipada sin coste');
  p('Slot de instalación', f.slot);
  p('Garantías', [r.conAero ? 'aerotermia ' + f.garantiaAero + ' años' : '', r.conFV ? 'fotovoltaica ' + f.garantiaFV + ' años' : '']
    .filter(Boolean).join(' · '));
  p('Tipo de oferta', etSel('campana', f.campana));

  s('8 · Cierre y seguimiento');
  p('Estado', etSel('estado', f.estado) + (f.fechaDecision ? ' · decisión el ' + fechaCorta(f.fechaDecision) : ''));
  p('Observaciones', f.observaciones);
  p('Motivo del no', f.motivoNo);

  s('Resultado');
  if (r.conAero) {
    p('Equipo recomendado', r.modelo + ' · ' + r.kw + ' kW' + (r.unidades > 1 ? ' (' + r.unidades + ' unidades)' : ''));
    p('Carga estimada', coma(r.demanda) + ' kW');
    p('Depósitos', r.acumulador + ' · ' + r.tanque);
  }
  if (r.conFV) p('Fotovoltaica', f.placas + ' placas' + (r.kwp ? ' · ' + coma(r.kwp, 2) + ' kWp' : '') +
    (f.inversor ? ' · ' + f.inversor : '') + (r.conBat ? ' · batería ' + coma(r.kwhBat) + ' kWh' : ''));
  p('Inversión con IVA', eur(r.inversion));
  p('Cuota a 10 años', eur2(r.cuota10) + '/mes');
  p('Gasto hoy / después', eur(r.actual) + '/año → ' + eur(r.futuro) + '/año');
  p('Ahorro', eur(r.ahorro) + '/año (' + eur2(r.ahorroMes) + '/mes)' + (r.ahorro > 0 ? ' · se paga sola en ' + coma(r.retorno) + ' años' : ''));
  if (r.cuota > 0) p(r.coste0 ? 'Coste 0 · sobra cada mes' : 'Esfuerzo neto', eur2(Math.abs(r.esfuerzo)) + '/mes');

  if (op) {
    s('Instalación en el CRM');
    p('Referencia', [txt(op.referencia), api.etiquetaCatalogo('tiposOperacion', op.tipo),
      api.etiquetaCatalogo('estadosOperacion', op.estado)].filter(Boolean).join(' · '));
    p('Importe', eur(num(op.total)) + ' IVA incluido');
    p('Pago', txt(op.forma_pago) === 'financiado'
      ? 'financiado' + (txt(op.financiera) ? ' con ' + txt(op.financiera) : '') + (num(op.plazo_meses) ? ' a ' + num(op.plazo_meses) + ' meses' : '')
      : (txt(op.forma_pago) || 'sin definir'));
    if (num(op.aero_kw) || txt(op.aero_modelo)) p('Aerotermia', [txt(op.aero_modelo), num(op.aero_kw) ? num(op.aero_kw) + ' kW' : ''].filter(Boolean).join(' · '));
    if (num(op.deposito_acs) || num(op.deposito_inercia)) p('Depósitos', 'ACS ' + (num(op.deposito_acs) || '—') + ' L · inercia ' + (num(op.deposito_inercia) || '—') + ' L');
    if (txt(op.cargador_modelo)) p('Cargador', txt(op.cargador_modelo));
    if (txt(op.observaciones)) p('Observaciones', txt(op.observaciones));
  }

  const av = avisosFicha(f, r);
  if (av.length) {
    s('Avisos');
    av.forEach(([nivel, t]) => l.push('· ' + (nivel === 'mal' ? '[!] ' : '') + t));
  }
  l.push('');
  l.push(MARCA_FIN);
  return l.join('\n');
}

/** Pone el resumen en la descripción: sustituye el de antes o lo añade al final. */
export function descripcionConResumen(descripcion, resumen) {
  const d = String(descripcion || '');
  const i = d.indexOf(MARCA_INICIO), j = d.indexOf(MARCA_FIN);
  if (i >= 0 && j > i) return (d.slice(0, i) + resumen + d.slice(j + MARCA_FIN.length)).trim();
  return (d.trim() ? d.trim() + '\n\n' : '') + resumen;
}

/* ---------- la pestaña ---------- */

const ESTADOS_PROYECTO = {
  borrador:     ['Sin pedir', '', 'Todavía no está en la cola del ingeniero.'],
  pedido:       ['En cola del ingeniero', 'aviso', 'El ingeniero lo tiene pedido y lee esta ficha en la descripción.'],
  en_curso:     ['El ingeniero lo está montando', 'aviso', 'Lo que cambies aquí le llega al guardar.'],
  faltan_datos: ['Falta algo', 'mal', ''],
  entregado:    ['Proyecto entregado', 'bien', 'El PDF está en la pestaña Proyecto.'],
  cancelado:    ['Cancelado', 'mal', '']
};

const irAPestana = nombre => {
  const b = [...document.querySelectorAll('.pestanas button')].find(x => x.textContent.trim() === nombre);
  if (b) { b.click(); window.scrollTo({top: 0}); }
};

export function panelFicha(cliente) {
  const caja = h('div', cargando('Abriendo la ficha de dimensionado…'));
  arranca();
  return caja;

  async function arranca() {
    let d;
    try { d = await api.proyectoDe(cliente.id); }
    catch (e) { poner(caja, tarjeta('Ficha de dimensionado', h('p.nota', txt(e.message)))); return; }
    let proy = d.proyecto || {};
    let fotos = (d.archivos || []).filter(a => a.clase === 'foto').length;

    const guardado = leerNotas(proy.notas);
    let paquete = guardado;
    const base = fichaConCRM(cliente, guardado.ficha);
    /* Lo que el CRM ha cambiado al abrir va en una versión aparte (origen «crm»). */
    let pendientesCRM = base.clavesCRM;
    const valores = base.valores;
    const op = base.op;

    const formularios = SECCIONES.map(s => ({s, f: formulario(s.campos, valores)}));
    const nodo = id => { for (const {f} of formularios) if (f.nodos[id]) return f.nodos[id]; return null; };
    const leer = () => {
      const o = {};
      formularios.forEach(({f}) => Object.assign(o, f.leer()));
      o.tramoIrpf = String(PCT_IRPF);
      return o;
    };

    /* Lo que viene de la instalación no se toca aquí; lo del cliente sí,
       y se guarda también en el cliente. */
    const pista = (id, texto, color) => {
      const n = nodo(id);
      if (!n) return;
      const lab = n.control.closest('label');
      lab.appendChild(h('small.ficha-origen', {estilo: {color: color || 'var(--tx-3)', fontWeight: '400'}}, texto));
    };
    Object.keys(base.deOperacion).forEach(k => {
      const n = nodo(k);
      if (!n) return;
      n.control.disabled = true;
      n.control.dataset.crm = 'operacion';
      pista(k, 'De la instalación · se cambia en Instalaciones');
    });
    if (!op) ['precioAero', 'precioFV', 'precioBateria', 'precioCargador'].forEach(k =>
      pista(k, 'Sin instalación todavía: cuando la haya, el importe saldrá de ella'));
    Object.keys(DEL_CLIENTE).forEach(k => {
      const n = nodo(k);
      if (n) { n.control.dataset.crm = 'cliente'; pista(k, 'Se guarda también en el cliente'); }
    });
    const tec = nodo('tecnico');
    if (tec) { tec.control.disabled = true; pista('tecnico', 'El comercial del cliente'); }

    const bloques = formularios.map(({s, f}) => h('.tarjeta.ficha-seccion',
      h('header', h('div', h('h2', s.titulo), s.nota ? h('.nota', s.nota) : null)),
      h('.cuerpo', f.nodo)));

    const resumen = h('div');
    const avisosCaja = h('div');
    const estadoGuardado = h('span.nota');
    const cabeceraProyecto = h('div');
    const avisoFotos = h('div');
    const lineaVersion = h('span.nota.ficha-version');
    const historialCaja = h('div');

    function pintaVersion() {
      poner(lineaVersion, paquete.version
        ? [h('b', 'Versión v' + paquete.version), ' · guardada el ' + fechaHora(paquete.guardada) +
           (paquete.por ? ' por ' + paquete.por : '')]
        : (paquete.ficha ? 'Ficha del formato anterior: al guardar pasa a ser la v1'
                         : 'Todavía sin guardar: sale rellena con lo que hay del cliente'));
    }

    function verVersion(v) {
      const f = fichaDeVersion(paquete, v);
      if (!f) return aviso('Esa versión ya no se puede reconstruir: se podó por espacio.', 'error');
      ventana({titulo: 'Versión v' + v + ' (solo lectura)', ancha: true,
        cuerpo: h('pre.ficha-pre', textoResumen(f, null, {version: v,
          cuando: fechaHora((paquete.historial.find(e => e.v === v) || {}).fecha),
          por: (paquete.historial.find(e => e.v === v) || {}).por}))});
    }

    async function restaurar(v) {
      const f = fichaDeVersion(paquete, v);
      if (!f) return aviso('Esa versión ya no se puede reconstruir: se podó por espacio.', 'error');
      const ok = await confirmar('Se cargan en el formulario los datos de la v' + v + '. Los de la instalación ' +
        'siguen saliendo de Instalaciones. No se guarda nada hasta que pulses «Guardar ficha», y entonces ' +
        'se crea una versión nueva.', {titulo: 'Restaurar la v' + v, botón: 'Restaurar', peligro: false});
      if (!ok) return;
      const datos = Object.assign({}, f);
      Object.keys(base.deOperacion).forEach(k => { delete datos[k]; });
      delete datos.tecnico;
      datos.mensualidades = String(datos.mensualidades || 120);
      formularios.forEach(({f: fo}) => fo.poner(datos));
      alCambiar();
      estadoGuardado.textContent = 'v' + v + ' restaurada en el formulario · sin guardar';
      window.scrollTo({top: 0});
    }

    function pintaHistorial() {
      const lista = (paquete.historial || []).slice().sort((a, b) => b.v - a.v);
      poner(historialCaja, tarjeta('Historial de versiones',
        lista.length ? h('ul.ficha-versiones', lista.map(e => {
          const n = Object.keys(e.cambios || {}).length;
          const detalle = h('div', {estilo: {display: 'none', margin: '6px 0 4px'}},
            n ? h('ul.ficha-cambios', Object.entries(e.cambios).map(([k, [a, b]]) =>
                h('li', h('b', etiquetaCampo(k) + ': '), valorCampo(k, a) + ' → ' + valorCampo(k, b))))
              : h('.nota', e.resumen || 'Versión inicial'),
            h('.acciones', {estilo: {marginTop: '6px'}},
              h('button.btn.mini', {onclick: () => verVersion(e.v),
                disabled: fichaDeVersion(paquete, e.v) ? null : true}, 'Ver esta versión'),
              e.v !== paquete.version ? h('button.btn.mini', {onclick: () => restaurar(e.v),
                disabled: fichaDeVersion(paquete, e.v) ? null : true}, 'Restaurar esta versión') : null));
          const cab = h('button.btn.plano.ficha-version-cab', {onclick: () => {
            detalle.style.display = detalle.style.display === 'none' ? '' : 'none'; }},
            'v' + e.v + ' · ' + fechaHora(e.fecha) + ' · ' + (e.por || '—') + ' · ' +
            (e.inicial ? (e.resumen || 'versión inicial') : n + ' cambio' + (n === 1 ? '' : 's')) +
            (e.origen === 'crm' ? ' · datos del CRM' : ''));
          return h('li', {datos: {v: e.v}}, cab, detalle);
        })) : h('.vacio', 'Cada vez que se guarde la ficha quedará aquí una versión.'),
        {subtitulo: paquete.podadas ? paquete.podadas + ' versión(es) antiguas podadas por espacio' :
          'Pulsa una versión para ver qué cambió'}));
    }


    function pintaEstadoProyecto() {
      const [et, color, texto] = ESTADOS_PROYECTO[txt(proy.estado)] || ESTADOS_PROYECTO.borrador;
      const faltan = txt(proy.faltan).split(' · ').filter(Boolean);
      poner(cabeceraProyecto, h('.tarjeta', h('.cuerpo',
        h('.acciones', {estilo: {alignItems: 'center', flexWrap: 'wrap'}},
          h('b', 'Proyecto:'), marca(et, color),
          txt(proy.pedido) ? h('span.nota', 'pedido el ' + fechaCorta(txt(proy.pedido).slice(0, 10))) : null,
          h('span.nota', fotos + ' foto(s)'),
          texto ? h('span.nota', texto) : null),
        txt(proy.estado) === 'faltan_datos' && faltan.length
          ? h('ul.zw-faltan', {estilo: {marginTop: '8px'}}, faltan.map(x => h('li', x))) : null)));
    }

    function visibles(f) {
      formularios.forEach(({s, f: fo}, i) => {
        bloques[i].style.display = s.solo && !s.solo(f) ? 'none' : '';
        s.campos.forEach(c => {
          if (!c.solo) return;
          const lab = fo.nodos[c.id] && fo.nodos[c.id].control.closest('label');
          if (lab) lab.style.display = c.solo(f) ? '' : 'none';
        });
      });
      /* Con el año de construcción, el aislamiento sale solo. */
      const a = anyoValido(f.anyoConst), sel = nodo('anyo');
      if (sel) { sel.control.disabled = !!a; if (a) sel.control.value = tramoAnyo(a); }
    }

    function repinta() {
      const r = calcular(leer());
      const f = r.f;
      visibles(f);
      const kv = (et, v, fuerte) => h('.dato', h('.et', et), h('.v', fuerte ? h('b', v) : v));
      poner(resumen,
        h('div', {estilo: {marginBottom: '8px'}},
          h('.nota', r.conAero ? 'Equipo recomendado' : 'Instalación'),
          h('h3', {estilo: {margin: '2px 0 6px'}},
            r.conAero ? r.modelo : (r.conFV ? f.placas + ' placas fotovoltaicas' : 'Sin equipos marcados')),
          h('.acciones',
            r.conAero ? marca(r.kw + ' kW', 'info') : null,
            r.conAero ? marca(r.acumulador) : null,
            r.conAero ? marca(r.tanque) : null,
            r.conAero ? marca('Carga estimada ' + coma(r.demanda) + ' kW') : null,
            r.conFV ? marca('FV ' + f.placas + ' placas' + (r.kwp ? ' · ' + coma(r.kwp, 2) + ' kWp' : ''), 'info') : null,
            r.conFV ? marca(r.conBat ? 'Batería ' + coma(r.kwhBat) + ' kWh' : 'Sin batería') : null)),
        r.actual > 0 ? h('div',
          kv('Gasto energético hoy', eur(r.actual) + '/año'),
          kv('Gasto previsto después', eur(r.futuro) + '/año'),
          kv('Ahorro anual', eur(r.ahorro) + ' · ' + eur2(r.ahorroMes) + '/mes', true)) : null,
        r.inversion > 0 ? h('div',
          kv('Inversión (IVA incluido)', eur(r.inversion), true),
          kv('− Deducción IRPF 60 %', '− ' + eur(r.deduccion)),
          h('.nota.ficha-irpf', {estilo: {margin: '-2px 0 4px'}}, 'Deducción IRPF 60 %: aerotermia ' + eur(r.deduccionAero) +
            ' + fotovoltaica ' + eur(r.deduccionFV) + ' = ' + eur(r.deduccion) +
            ' (máximo 7.500 € de base por tecnología)'),
          kv('− Bonificación IBI (' + r.ibiMun.pct + ' % × ' + r.ibiMun.anios + ' años' +
            (r.ibiMun.tope ? ', tope ' + r.ibiMun.tope + ' €/año' : '') + ')', '− ' + eur(r.ibiTotal)),
          kv('− CAE (lo cobra el cliente)', '− ' + eur(r.cae)),
          kv('Coste real tras ayudas', eur(r.costeReal), true),
          r.ahorro > 0 ? kv('Se paga sola en', coma(r.retorno) + ' años') : null) : null,
        r.cuota > 0 ? h('div',
          kv('Cuota a 10 años', eur2(r.cuota10) + '/mes', true),
          r.meses !== 120 ? kv('Cuota a ' + r.meses + ' meses', eur2(r.cuota) + '/mes') : null,
          kv(r.coste0 ? 'Sobra cada mes' : 'Esfuerzo neto', eur2(Math.abs(r.esfuerzo)) + '/mes', true),
          h('p.nota', {estilo: {margin: '6px 0 0'}}, 'Amortización anticipada sin coste.')) : null);
      const av = avisosFicha(f, r);
      poner(avisosCaja, av.length
        ? h('ul.lista-avisos', av.map(([nivel, t]) => h('li',
            h('span.nivel.' + (nivel === 'mal' ? 'alto' : nivel === 'aviso' ? 'medio' : 'bajo')),
            h('span', {estilo: nivel === 'mal' ? {color: 'var(--mal)'} : null}, t))))
        : h('.vacio', 'Sin avisos.'));
    }

    /* ---------- borrador en este equipo: nunca se pierde lo escrito ---------- */
    const claveBorrador = 'zw.crm.ficha.borrador.' + cliente.id;
    const leerBorrador = () => { try { return JSON.parse(localStorage.getItem(claveBorrador) || 'null'); } catch (e) { return null; } };
    const guardarBorrador = () => {
      try { localStorage.setItem(claveBorrador, JSON.stringify({valores: leer(), hora: new Date().toISOString(),
        version: paquete.version || 0})); } catch (e) { /* sin almacenamiento: seguimos sin borrador */ }
    };
    const borrarBorrador = () => { try { localStorage.removeItem(claveBorrador); } catch (e) { /* nada */ } };

    /* ---------- estado del guardado ---------- */
    let sucio = false, guardando = false;
    const estadoCajas = [];          // un indicador en cada barra de guardar
    const botonesGuardar = [];
    const pintaEstado = (tipo, texto, reintentar) => {
      estadoCajas.forEach(c => poner(c,
        tipo === 'guardando' ? [h('span.cargando'), ' ', texto] : texto,
        reintentar ? h('button.btn.mini', {estilo: {marginLeft: '8px'}, onclick: () => guardarSeguro(reintentar)}, 'Reintentar') : null));
      estadoCajas.forEach(c => { c.className = 'ficha-estado ' + tipo; });
    };
    const marcarSucio = () => {
      sucio = true;
      if (!guardando) pintaEstado('sucio', 'Cambios sin guardar');
    };

    let tBorrador;
    const alCambiar = () => {
      repinta();
      marcarSucio();
      clearTimeout(tBorrador);
      tBorrador = setTimeout(guardarBorrador, 300);
    };
    bloques.forEach(b => { b.addEventListener('input', alCambiar); b.addEventListener('change', alCambiar); });

    /* Guardar, en este orden: (1) la ficha y su versión en las notas del
       proyecto, con el bloque para el ingeniero en la descripción; (2) se
       vuelve a leer del servidor y se comprueba que ha quedado igual; (3) lo
       del cliente, al cliente. Si algo falla se dice exactamente qué. */
    class FalloGuardado extends Error {
      constructor(paso, e) { super(paso + ': ' + ((e && e.message) || e || 'error desconocido')); this.paso = paso; }
    }

    async function guardar() {
      const f = normalizar(leer());
      let fresco;
      try { fresco = await api.proyectoDe(cliente.id); }
      catch (e) { throw new FalloGuardado('No se ha guardado nada (no se pudo leer el proyecto)', e); }
      const por = txt((api.estado.usuario || {}).nombre);
      const ahora = new Date();
      const {paquete: nuevo, creadas} = nuevaVersion(leerNotas((fresco.proyecto || {}).notas), f,
        {por, clavesCRM: pendientesCRM, ahora: ahora.toISOString()});
      const bloque = textoResumen(f, calcular(f), {op, por: nuevo.por || por, version: nuevo.version,
        cuando: fechaHora(nuevo.guardada || ahora.toISOString())});
      const descripcion = descripcionConResumen((fresco.proyecto || {}).descripcion, bloque);
      const notas = empaquetar(nuevo);
      let r;
      try { r = await api.guardarProyecto({cliente_id: cliente.id, descripcion, notas}); }
      catch (e) { throw new FalloGuardado('No se ha guardado la ficha', e); }

      /* Comprobación: lo que hay ahora en el servidor es lo que se mandó. */
      let comprobado;
      try { comprobado = await api.proyectoDe(cliente.id); }
      catch (e) { throw new FalloGuardado('La ficha se ha mandado pero no se ha podido comprobar', e); }
      const vuelta = leerNotas((comprobado.proyecto || {}).notas);
      const difiere = Object.keys(diferencias(normalizar(vuelta.ficha || {}), f));
      if (vuelta.version !== nuevo.version || difiere.length ||
          txt((comprobado.proyecto || {}).descripcion).indexOf(MARCA_INICIO) < 0) {
        throw new FalloGuardado('La ficha no ha quedado bien guardada en el servidor',
          'versión ' + vuelta.version + ' en vez de ' + nuevo.version +
          (difiere.length ? ' · campos distintos: ' + difiere.map(etiquetaCampo).join(', ') : ''));
      }
      paquete = nuevo;
      pendientesCRM = [];
      proy = comprobado.proyecto || r.proyecto || proy;
      fotos = (comprobado.archivos || []).filter(a => a.clase === 'foto').length;
      pintaEstadoProyecto(); pintaVersion(); pintaHistorial();

      /* Lo del cliente, al cliente (solo lo que ha cambiado). */
      const alCliente = cambiosParaCliente(cliente, f);
      const campos = Object.keys(alCliente);
      if (campos.length) {
        try {
          const rc = await api.guardarCliente(Object.assign({id: cliente.id}, alCliente));
          Object.assign(cliente, (rc && rc.cliente) || alCliente);
        } catch (e) {
          throw new FalloGuardado('La ficha se ha guardado (v' + paquete.version + '), pero no se ha podido ' +
            'actualizar el cliente (' + campos.map(k => k.replace(/_/g, ' ')).join(', ') + ')', e);
        }
      }
      return {creadas, campos};
    }

    /** Guarda sin dobles envíos y dejando claro cómo ha ido. */
    async function guardarSeguro(despues) {
      if (guardando) return null;
      guardando = true;
      botonesGuardar.forEach(b => { b.disabled = true; });
      pintaEstado('guardando', 'Guardando…');
      try {
        const res = await guardar();
        sucio = false;
        borrarBorrador();
        poner(bannerBorrador, null);
        const hora = new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
        pintaEstado('ok', (res.creadas ? 'Guardado · v' : 'Sin cambios · v') + paquete.version + ' · ' + hora +
          (res.campos.length ? ' · cliente actualizado' : ''));
        aviso(res.creadas ? 'Ficha guardada (v' + paquete.version + ') y enviada al proyecto.' +
          (res.campos.length ? ' También se ha actualizado el cliente.' : '')
          : 'No había cambios: la ficha sigue en la v' + paquete.version + '.');
        if (typeof despues === 'function') await despues(res);
        return res;
      } catch (e) {
        guardarBorrador();
        pintaEstado('error', txt(e.message) + ' · lo escrito queda como borrador en este equipo.', despues || true);
        avisoError(e);
        return null;
      } finally {
        guardando = false;
        botonesGuardar.forEach(b => { b.disabled = false; });
      }
    }

    const botonGuardar = extra => {
      const b = h('button.btn.primario.ficha-guardar', {onclick: () => guardarSeguro(), title: 'Guardar (Ctrl+S)'},
        '💾 Guardar ficha');
      botonesGuardar.push(b);
      const est = h('span.ficha-estado');
      estadoCajas.push(est);
      return [b, extra, est];
    };

    const tras = async () => {
      if (!fotos) {
        poner(avisoFotos, h('.tarjeta', {estilo: {borderColor: 'var(--aviso)'}}, h('.cuerpo',
          h('b', 'La ficha ya está en el proyecto, pero falta al menos una foto.'),
          h('p.nota', {estilo: {margin: '6px 0 10px'}},
            'El proyecto solo entra en la cola del ingeniero cuando tiene la descripción y una foto de la casa. ' +
            'Sube las fotos en la pestaña Proyecto y se pedirá solo.'),
          h('button.btn.primario', {onclick: () => irAPestana('Proyecto')}, '📷 Ir a subir las fotos'))));
        aviso('Ficha guardada. Falta una foto para que el ingeniero la reciba.');
      } else {
        poner(avisoFotos, null);
        const est = txt(proy.estado);
        aviso(est === 'pedido' ? 'Enviada: el proyecto está en la cola del ingeniero.'
          : est === 'entregado' ? 'Ficha actualizada. El proyecto ya estaba entregado.'
          : 'Enviada al ingeniero.');
      }
    };
    const btnEnviar = h('button.btn.lima', {onclick: () => guardarSeguro(tras)}, 'Enviar al ingeniero');
    botonesGuardar.push(btnEnviar);

    /* Ctrl/Cmd+S guarda; salir con cambios sin guardar avisa. Los oyentes
       se quitan solos cuando la ficha deja de estar en pantalla. */
    const viva = () => caja.isConnected;
    const teclado = e => {
      if (!viva()) { document.removeEventListener('keydown', teclado); return; }
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') { e.preventDefault(); guardarSeguro(); }
    };
    document.addEventListener('keydown', teclado);
    const alCerrar = e => {
      if (!viva()) { window.removeEventListener('beforeunload', alCerrar); return; }
      if (sucio) { guardarBorrador(); e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', alCerrar);
    let dejarPasar = false;
    const salida = async e => {
      if (!viva()) { document.removeEventListener('click', salida, true); return; }
      if (!sucio || dejarPasar) return;
      const el = e.target.closest('.pestanas button, .lateral nav button, .lateral a, #vista > div > button.btn.plano');
      if (!el || caja.contains(el) || /Ficha de dimensionado/.test(el.textContent)) return;
      e.preventDefault(); e.stopPropagation();
      guardarBorrador();
      const ok = await confirmar('Hay cambios en la ficha sin guardar. Si sales ahora, se quedan como borrador ' +
        'en este equipo y podrás recuperarlos al volver.', {titulo: 'Cambios sin guardar', botón: 'Salir sin guardar'});
      if (!ok) return;
      dejarPasar = true;
      el.click();
      dejarPasar = false;
    };
    document.addEventListener('click', salida, true);

    /* ¿Quedó algo sin guardar la última vez? */
    const bannerBorrador = h('div');
    const borrador = leerBorrador();
    if (borrador && borrador.valores) {
      const hora = new Date(borrador.hora);
      poner(bannerBorrador, h('.tarjeta.ficha-borrador', h('.cuerpo.acciones', {estilo: {alignItems: 'center', flexWrap: 'wrap'}},
        h('b', 'Tienes cambios sin guardar de las ' + (isNaN(hora) ? '—' :
          hora.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})) +
          (isNaN(hora) || hora.toLocaleDateString('sv-SE') === hoyISO() ? '' : ' del ' + fechaCorta(hora.toLocaleDateString('sv-SE')))),
        h('button.btn.primario', {onclick: () => {
          const datos = Object.assign({}, borrador.valores);
          Object.keys(base.deOperacion).forEach(k => { delete datos[k]; });
          delete datos.tecnico;
          formularios.forEach(({f}) => f.poner(datos));
          poner(bannerBorrador, null);
          alCambiar();
        }}, 'Recuperar'),
        h('button.btn', {onclick: () => { borrarBorrador(); poner(bannerBorrador, null); }}, 'Descartar'))));
    }

    const notaCRM = base.cambios.length && guardado.ficha
      ? h('.tarjeta.ficha-crm', h('.cuerpo', h('span.nota',
          h('b', 'Actualizado desde el CRM: '), base.cambios.join(', ') + '.')))
      : null;

    const fichaOp = op ? tarjeta('Instalación en el CRM', h('div',
      h('.acciones', {estilo: {flexWrap: 'wrap', marginBottom: '6px'}},
        marca(api.etiquetaCatalogo('tiposOperacion', op.tipo), 'info'),
        marca(api.etiquetaCatalogo('estadosOperacion', op.estado)),
        marca(eur(num(op.total)) + ' IVA incl.'),
        txt(op.forma_pago) === 'financiado'
          ? marca('Financiado' + (txt(op.financiera) ? ' · ' + txt(op.financiera) : '') +
              (num(op.plazo_meses) ? ' · ' + num(op.plazo_meses) + ' meses' : ''), 'aviso')
          : (txt(op.forma_pago) ? marca('Contado') : null)),
      h('p.nota', {estilo: {margin: 0}},
        [num(op.aero_kw) || txt(op.aero_modelo) ? 'Aerotermia ' + [txt(op.aero_modelo), num(op.aero_kw) ? num(op.aero_kw) + ' kW' : ''].filter(Boolean).join(' ') : '',
         num(op.deposito_acs) ? 'ACS ' + num(op.deposito_acs) + ' L' : '',
         num(op.deposito_inercia) ? 'inercia ' + num(op.deposito_inercia) + ' L' : '',
         txt(op.cargador_modelo) ? 'cargador ' + txt(op.cargador_modelo) : '']
          .filter(Boolean).join(' · ') || 'Los datos de la instalación se cambian en la pestaña Instalaciones.')),
      {subtitulo: 'Se cambia en Instalaciones; aquí solo se lee'}) : null;

    repinta();
    pintaEstadoProyecto();
    pintaVersion();
    pintaHistorial();
    const barraFinal = h('.acciones.ficha-barra', ...botonGuardar(btnEnviar));
    poner(caja,
      cabeceraProyecto,
      h('.acciones.ficha-botones', {estilo: {marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center'}},
        lineaVersion, estadoGuardado),
      bannerBorrador,
      avisoFotos,
      notaCRM,
      h('.doble.ficha-dim',
        h('div', fichaOp, bloques,
          h('.acciones.ficha-fin', ...botonGuardar(null))),
        h('div',
          tarjeta('Resumen en vivo', resumen, {subtitulo: 'Se recalcula al escribir · importes con IVA'}),
          tarjeta('Avisos', avisosCaja),
          historialCaja)),
      barraFinal);
    pintaEstado('', sucio ? 'Cambios sin guardar' : '');
  }
}
