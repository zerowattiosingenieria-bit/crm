/* vistas/ficha.js — la ficha de dimensionado dentro de la ficha del cliente.
 *
 * Es la misma ficha de visita que el comercial usaba suelta en el móvil
 * (zerowattiosingenieria-bit.github.io/ficha): vivienda, instalación
 * actual, gastos, ACS, fotovoltaica, oferta y cierre, con el resumen en vivo
 * y los avisos. Aquí sale ya rellena con lo que el CRM sabe del cliente.
 *
 * Dónde se guarda: en el campo «notas» del proyecto del cliente (pestaña
 * PROYECTOS), como texto que empieza por FICHA_DIM_V1: y sigue con el JSON.
 * Si en notas ya había otra cosa escrita, se conserva dentro del mismo JSON
 * (notasPrevias) y no se pierde. El servidor guarda siempre la descripción
 * del proyecto junto con las notas, así que antes de guardar se vuelve a
 * leer el proyecto y se manda la descripción tal y como está.
 */

import {h, poner, txt, num, eur, eur2, fechaCorta, hoyISO} from '../util.js';
import * as api from '../api.js';
import {tarjeta, formulario, marca, aviso, avisoError, confirmar, cargando} from '../ui.js';
import {gastoAnual} from './clientes.js';

export const PREFIJO_FICHA = 'FICHA_DIM_V1:';
const MARCA_INICIO = '=== FICHA DE DIMENSIONADO ===';
const MARCA_FIN = '=== FIN DE LA FICHA ===';

/* ---------- tablas de la ficha (las mismas que la ficha del móvil) ---------- */

const ZONAS = {A: 0.80, B: 0.88, C: 1.00, D: 1.12, E: 1.25};
const AISL = {'<1980': 92, '1980-2007': 70, '2007-2019': 52, '>2019': 38};
const FACTOR = {gasoil: 0.35, glp: 0.30, gas: 0.55, electrica: 0.30, ninguno: 1.00};

/* Bonificación de IBI por municipio (Comunidad de Madrid). ok:false = sin
   confirmar contra la ordenanza: revisar antes de ponerlo por escrito. */
const IBI = {
  'Madrid': {pct: 50, anios: 5, ok: true, nota: '7 años si hay baterías.'},
  'Móstoles': {pct: 50, anios: 4, ok: true},
  'Pozuelo de Alarcón': {pct: 50, anios: 3, ok: true},
  'Coslada': {pct: 50, anios: 3, ok: true},
  'Galapagar': {pct: 50, anios: 5, ok: true, nota: 'Exige cubrir el 40 % del suministro y tener la bonificación concedida antes del 1 de enero.'},
  'Boadilla del Monte': {pct: 45, anios: 3, ok: true},
  'Las Rozas': {pct: 40, anios: 5, ok: true, nota: 'Entre 40 y 50 % según cobertura; va el valor prudente.'},
  'Alcobendas': {pct: 40, anios: 3, ok: true, nota: 'Entre 40 y 50 % según cobertura; va el valor prudente.'},
  'Getafe': {pct: 30, anios: 4, ok: true},
  'San Sebastián de los Reyes': {pct: 50, anios: 8, tope: 400, ok: false},
  'Guadalix de la Sierra': {pct: 30, anios: 5, ok: false},
  'Collado Villalba': {pct: 50, anios: 5, ok: false},
  'Algete': {pct: 50, anios: 5, ok: false},
  'Majadahonda': {pct: 50, anios: 3, ok: false},
  'Valdemoro': {pct: 35, anios: 10, ok: false},
  'Rivas-Vaciamadrid': {pct: 35, anios: 5, ok: false},
  'Otro / a confirmar': {pct: 0, anios: 0, ok: false}
};

const BASE_IRPF = 7500;   // por tecnología
const IRPF = {'60': 60, '40': 40, '20': 20, '0': 0};

/* Coeficientes de financiación: cuota = importe financiado × coeficiente. */
const COEF_FIN = {
  72: 0.018336, 84: 0.01636, 108: 0.01376, 120: 0.01234902, 132: 0.01161679,
  144: 0.01101403, 156: 0.01050942, 168: 0.01008303, 180: 0.00971918,
  192: 0.0094053, 204: 0.00913215, 216: 0.0088948, 228: 0.00868524, 240: 0.00850064
};
const PLAZOS = Object.keys(COEF_FIN).map(Number);

const KWH_MODULO_BATERIA = 5.3;
const PRECIO_MODULO_BATERIA = 2570;   // IVA incluido
const PRECIO_CARGADOR = 1870;         // IVA incluido

const SI_NO = [['si', 'Sí'], ['no', 'No']];

const VACIA = {
  tecnico: '', cliente: '', dni: '', cotitular: '', direccion: '', municipio: 'Madrid', municipioOtro: '',
  cp: '', telefono: '', email: '', cups: '', aero: 'si', pv: 'si', bateria: 'no', cargador: 'no',
  zona: 'D', m2: 120, altura: 2.6, anyo: '1980-2007', personas: 4, banos: 2,
  caldera: 'gasoil', calderaKw: 24, emisor: 'rad_bt', suministro: 'mono', potenciaContratada: 5.75,
  ec: 'si', refrig: 'si',
  gastoLuzMes: 0, gastoCombAnio: 0, consumo: 0, ibiAnual: 0, factorSust: 0, coberturaFV: 60,
  acsL: 0, modulo: 'trio', inerciaL: 0, distDep: 1.5, distExt: 8,
  placas: 0, tipoPlaca: '', numInversores: 1, inversor: '', tejado: 'teja',
  bateriaModulos: 0, bateriaModelo: '',
  precioAero: 0, precioFV: 0, precioBateria: 0, precioCargador: 0, cae: 0, tramoIrpf: '60',
  reserva: 0, mensualidades: 120, slot: '', campana: 'regular',
  estado: 'propuesta', fechaDecision: '', observaciones: '', motivoNo: ''
};

/* ---------- secciones del formulario ---------- */

const SECCIONES = [
  {titulo: '1 · Comercial y cliente', campos: [
    {id: 'tecnico', et: 'Técnico comercial'},
    {id: 'cliente', et: 'Titular (nombre y apellidos)', ancho: 2},
    {id: 'dni', et: 'DNI / fecha de nacimiento'},
    {id: 'cotitular', et: 'Cotitular'},
    {id: 'direccion', et: 'Dirección de la instalación', ancho: 2},
    {id: 'municipio', et: 'Municipio (bonificación IBI)', tipo: 'select', vacio: false,
     opciones: Object.keys(IBI)},
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
     ayuda: 'Míralo en el Catastro. ≤160 → 12 kW · ≤270 → 16 kW · ≤350 → 19 kW · más → 22 kW'},
    {id: 'altura', et: 'Altura libre (m)', tipo: 'numero', paso: '0.1'},
    {id: 'zona', et: 'Zona climática', tipo: 'select', vacio: false,
     opciones: [['B', 'Cálida'], ['C', 'Templada'], ['D', 'Fría · Madrid'], ['E', 'Muy fría']]},
    {id: 'anyo', et: 'Año / aislamiento', tipo: 'select', vacio: false,
     opciones: [['<1980', 'Antes de 1980'], ['1980-2007', '1980–2007'], ['2007-2019', '2007–2019'], ['>2019', 'CTE 2019']]},
    {id: 'personas', et: 'Ocupantes habituales', tipo: 'numero'},
    {id: 'banos', et: 'Baños con ducha', tipo: 'numero'}
  ]},
  {titulo: '3 · Instalación actual', campos: [
    {id: 'caldera', et: 'Generador actual', tipo: 'select', vacio: false,
     opciones: [['gasoil', 'Gasóleo'], ['gas', 'Gas natural'], ['glp', 'Propano'], ['electrica', 'Eléctrica'], ['ninguno', 'Obra nueva / otro']]},
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
  {titulo: '7 · Oferta y financiación', nota: 'Precios con IVA incluido.', campos: [
    {id: 'precioAero', et: 'Precio aerotermia (€)', tipo: 'euro', solo: f => f.aero === 'si'},
    {id: 'precioFV', et: 'Precio fotovoltaica (€)', tipo: 'euro', solo: f => f.pv === 'si'},
    {id: 'precioBateria', et: 'Precio batería (€, 0 = tarifa)', tipo: 'euro',
     solo: f => f.pv === 'si' && f.bateria === 'si'},
    {id: 'precioCargador', et: 'Precio cargador (€, 0 = tarifa)', tipo: 'euro', solo: f => f.cargador === 'si'},
    {id: 'cae', et: 'CAE estimado (€)', tipo: 'euro',
     ayuda: 'Lo cobra el cliente; solo si se sustituye una caldera de combustión.'},
    {id: 'tramoIrpf', et: 'Tramo de deducción IRPF', tipo: 'select', vacio: false,
     opciones: [['60', '60 %'], ['40', '40 %'], ['20', '20 %'], ['0', 'Ninguno']]},
    {id: 'reserva', et: 'Reserva (€)', tipo: 'euro'},
    {id: 'mensualidades', et: 'Plazo de financiación', tipo: 'select', vacio: false,
     opciones: PLAZOS.map(m => [String(m), m + ' meses · ' + (m / 12) + ' años'])},
    {id: 'slot', et: 'Slot de instalación', pista: 'Semana del …'},
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

const NUMERICOS = new Set(SECCIONES.flatMap(s => s.campos)
  .filter(c => c.tipo === 'numero' || c.tipo === 'euro').map(c => c.id).concat(['mensualidades']));

/* ---------- cálculo (el mismo que la ficha del móvil) ---------- */

export function calcular(f) {
  const conAero = f.aero === 'si', conFV = f.pv === 'si';
  const m2 = num(f.m2);
  const cascada = m2 > 500;
  const kw = m2 <= 160 ? 12 : m2 <= 270 ? 16 : m2 <= 350 ? 19 : 22;
  const demanda = m2 * (AISL[f.anyo] || 70) * (ZONAS[f.zona] || 1) * (num(f.altura) || 2.5) / 2.5 / 1000;
  const acs = num(f.acsL) || (num(f.personas) <= 6 ? 200 : 300);
  const acsCat = [150, 200, 300].includes(acs);
  const gama = (f.suministro === 'tri' ? 'HTT' : 'HT') + (f.ec === 'si' ? ' EC' : '') + ' PRO';
  const modelo = (cascada ? '2 × ' : '') + 'Dual Clima ' + kw + ' ' + gama;
  const acumulador = acsCat ? (f.modulo === 'trio' ? 'Fusion HT Trio ' + acs : 'Sanit ' + acs)
                            : 'Acumulador ACS ' + acs + ' L (fuera de catálogo)';

  const factor = num(f.factorSust) > 0 ? num(f.factorSust) / 100 : (FACTOR[f.caldera] ?? 1);
  const luzAnio = num(f.gastoLuzMes) * 12;
  const combAnio = num(f.gastoCombAnio);
  const actual = luzAnio + combAnio;
  const termFut = conAero ? combAnio * factor : combAnio;
  const futuro = (termFut + luzAnio) * (1 - (conFV ? num(f.coberturaFV) / 100 : 0));
  const ahorro = Math.max(0, actual - futuro);
  const ahorroMes = ahorro / 12;

  const conBat = conFV && f.bateria === 'si';
  const conCar = f.cargador === 'si';
  const modulosBat = conBat ? num(f.bateriaModulos) : 0;
  const kwhBat = Math.round(modulosBat * KWH_MODULO_BATERIA * 10) / 10;
  const precioAero = conAero ? num(f.precioAero) : 0;
  const precioFV = conFV ? num(f.precioFV) : 0;
  const precioBat = conBat ? (num(f.precioBateria) > 0 ? num(f.precioBateria) : modulosBat * PRECIO_MODULO_BATERIA) : 0;
  const precioCar = conCar ? (num(f.precioCargador) > 0 ? num(f.precioCargador) : PRECIO_CARGADOR) : 0;
  const inversion = precioAero + precioFV + precioBat + precioCar;

  const tramo = IRPF[f.tramoIrpf] ?? 0;
  const baseIrpf = tramo > 0 ? (conAero ? Math.min(precioAero, BASE_IRPF) : 0) +
                               (conFV ? Math.min(precioFV + precioBat, BASE_IRPF) : 0) : 0;
  const deduccion = Math.round(baseIrpf * tramo / 100);
  const muni = f.municipio === 'Otro / a confirmar' && txt(f.municipioOtro) ? txt(f.municipioOtro) : f.municipio;
  const ibiMun = IBI[muni] || IBI['Otro / a confirmar'];
  const ibiAnual = num(f.ibiAnual) * ibiMun.pct / 100;
  const ibiTotal = Math.round((ibiMun.tope ? Math.min(ibiAnual, ibiMun.tope) : ibiAnual) * ibiMun.anios);
  const cae = num(f.cae);
  const costeReal = Math.max(0, inversion - deduccion - ibiTotal - cae);
  const retorno = ahorro > 0 ? costeReal / ahorro : 0;

  const meses = num(f.mensualidades) || 120;
  const coef = COEF_FIN[meses] || 0;
  const reserva = num(f.reserva);
  const financiado = Math.max(0, inversion - reserva);
  const cuota = Math.round(financiado * coef * 100) / 100;
  const esfuerzo = cuota - ahorroMes;
  const coste0 = cuota > 0 && esfuerzo <= 0;
  const plazoCoste0 = ahorroMes > 0 ? Math.ceil(financiado / ahorroMes) : 0;
  const cuota10 = Math.round(financiado * COEF_FIN[120] * 100) / 100;

  return {conAero, conFV, conBat, conCar, kw, cascada, demanda, acs, acsCat, modelo, acumulador,
    factor, actual, futuro, ahorro, ahorroMes, modulosBat, kwhBat, precioAero, precioFV, precioBat,
    precioCar, inversion, tramo, baseIrpf, deduccion, muni, ibiMun, ibiTotal, cae, costeReal, retorno,
    meses, coef, reserva, financiado, cuota, cuota10, esfuerzo, coste0, plazoCoste0};
}

export function avisosFicha(f, r) {
  const a = [];
  const E = x => a.push(['mal', x]), W = x => a.push(['aviso', x]), I = x => a.push(['info', x]),
        OK = x => a.push(['bien', x]);
  if (!r.conAero && !r.conFV) E('No hay marcada ni aerotermia ni fotovoltaica: activa al menos una.');
  if (!txt(f.cliente)) E('Falta el nombre del titular.');
  if (!txt(f.email)) E('Falta el correo del cliente: sin él no se puede enviar la propuesta.');
  if (!num(f.gastoCombAnio) && !num(f.gastoLuzMes)) E('Sin gastos actuales no se puede calcular el ahorro. Pide la factura.');
  if (!num(f.ibiAnual) && r.ibiMun.pct) W('Falta el IBI anual: sin él no se cuantifica la bonificación del ' + r.ibiMun.pct + ' % durante ' + r.ibiMun.anios + ' años.');
  if (f.municipio === 'Otro / a confirmar' && !txt(f.municipioOtro)) E('Has marcado «Otro»: escribe el municipio.');
  else if (!r.ibiMun.pct) W(r.muni + ': sin bonificación de IBI cargada. Mira la ordenanza fiscal antes de prometer nada.');
  else if (!r.ibiMun.ok) W('La bonificación de IBI de ' + r.muni + ' no está verificada: compruébala antes de ponerla por escrito.');
  else if (r.ibiMun.nota) I(r.muni + ': ' + r.ibiMun.nota);
  if (!txt(f.cups)) W('Falta el CUPS (factura de la luz): hace falta para legalizar.');
  if (r.conAero && r.cascada) W('Más de 500 m²: cascada de dos unidades. La combinación la decide el técnico.');
  if (r.conAero && r.kw >= 22 && f.suministro === 'mono') W('22 kW en monofásico: revisar potencia contratada y arranque; mejor trifásica.');
  if (r.conAero && f.refrig === 'si' && (f.emisor === 'rad_at' || f.emisor === 'rad_bt')) W('Los radiadores no dan frío: prever fancoils o suelo refrescante.');
  if (r.conAero && r.kw && Math.abs(r.demanda - r.kw) / r.kw > 0.3) W('La estimación por zona y aislamiento da ' + r.demanda.toFixed(1).replace('.', ',') + ' kW frente a los ' + r.kw + ' kW de tarifa: revisa el escalón.');
  if (r.conAero && num(f.distDep) > 2) W('Más de 2 m de la máquina a los depósitos: contar tubería, aislamiento y pérdidas.');
  if (r.conAero && num(f.distExt) > 10) W('Más de 10 m hasta la unidad exterior: revisar sección, caudal y glicol.');
  if (r.conAero && !r.acsCat) W(r.acs + ' L no es capacidad de catálogo (150, 200 o 300 L).');
  if (f.bateria === 'si' && !r.conFV) W('Hay batería sin fotovoltaica: la batería va con la instalación solar.');
  if (r.conBat && !r.modulosBat) W('Batería marcada sin módulos: pon cuántos lleva.');
  if (r.conAero && f.caldera === 'gas') W('Cliente de gas natural: el ahorro es moderado y el coste 0 puede no salir. No lo prometas sin el número.');
  if (f.caldera === 'gasoil' || f.caldera === 'glp') OK('Cliente de ' + (f.caldera === 'gasoil' ? 'gasóleo' : 'propano') + ': el mejor caso de amortización.');
  if (r.cuota > 0 && r.coste0) OK('COSTE 0: la cuota de ' + eur2(r.cuota) + '/mes cabe en el ahorro de ' + eur2(r.ahorroMes) + '/mes.');
  if (r.cuota > 0 && !r.coste0) W('No es coste 0: la cuota de ' + eur2(r.cuota) + '/mes supera el ahorro de ' + eur2(r.ahorroMes) + '/mes en ' + eur2(r.esfuerzo) + '.' + (r.plazoCoste0 ? ' Harían falta unas ' + r.plazoCoste0 + ' mensualidades.' : ''));
  if (r.tramo === 60) W('Tramo del 60 %: di «hasta ' + eur(r.deduccion) + '» y que lo confirme con su asesor; hay límite anual de base.');
  if (!txt(f.fechaDecision) && f.estado === 'propuesta') E('Sin fecha de decisión pactada. No salgas de la visita sin ella.');
  return a;
}

/* ---------- lo que el CRM ya sabe del cliente ---------- */

const CALDERA = {'gasoleo': 'gasoil', 'gas natural': 'gas', 'propano': 'glp', 'electrica': 'electrica'};
const sinAcentos = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function fichaDesdeCliente(c) {
  const f = Object.assign({}, VACIA);
  const ops = api.operacionesDe(c.id);
  const o = ops[0];
  f.tecnico = api.nombrePersona(c.comercial_id) !== '—' ? api.nombrePersona(c.comercial_id)
    : txt((api.estado.usuario || {}).nombre);
  f.cliente = txt(c.nombre); f.dni = txt(c.dni); f.cotitular = txt(c.cotitular);
  f.direccion = txt(c.direccion); f.cp = txt(c.cp); f.telefono = txt(c.telefono);
  f.email = txt(c.email); f.cups = txt(c.cups);
  const mun = Object.keys(IBI).find(k => sinAcentos(k) === sinAcentos(c.municipio));
  if (mun) f.municipio = mun;
  else if (txt(c.municipio)) { f.municipio = 'Otro / a confirmar'; f.municipioOtro = txt(c.municipio); }
  if (num(c.m2)) f.m2 = num(c.m2);
  if (num(c.personas)) f.personas = num(c.personas);
  const anyo = num(c.anyo);
  if (anyo > 1800) f.anyo = anyo < 1980 ? '<1980' : anyo <= 2007 ? '1980-2007' : anyo <= 2019 ? '2007-2019' : '>2019';
  const cal = sinAcentos(c.calefaccion);
  if (cal) f.caldera = CALDERA[cal] || 'ninguno';
  if (num(c.potencia_contratada)) f.potenciaContratada = num(c.potencia_contratada);
  f.gastoLuzMes = num(c.gasto_luz_mes);
  f.gastoCombAnio = Math.max(0, gastoAnual(c) - Math.round(num(c.gasto_luz_mes) * 12));
  if (o) {
    const t = txt(o.tipo);
    f.aero = ['aero', 'fv_aero'].includes(t) ? 'si' : 'no';
    f.pv = ['fv', 'fv_aero', 'bateria'].includes(t) ? 'si' : 'no';
    if (num(o.importe_bateria) || num(o.bateria_kwh)) f.bateria = 'si';
    if (num(o.importe_cargador)) f.cargador = 'si';
    f.precioAero = num(o.importe_aero); f.precioFV = num(o.importe_fv);
    f.precioBateria = num(o.importe_bateria); f.precioCargador = num(o.importe_cargador);
    if (num(o.paneles_num)) f.placas = num(o.paneles_num);
    if (txt(o.panel_modelo)) f.tipoPlaca = txt(o.panel_modelo) + (num(o.panel_wp) ? ' ' + num(o.panel_wp) + ' Wp' : '');
    if (txt(o.inversor_modelo)) f.inversor = txt(o.inversor_modelo) + (num(o.inversor_kw) ? ' ' + num(o.inversor_kw) + ' kW' : '');
    if (num(o.bateria_kwh)) f.bateriaModulos = Math.round(num(o.bateria_kwh) / KWH_MODULO_BATERIA);
    if (txt(o.bateria_modelo)) f.bateriaModelo = txt(o.bateria_modelo);
    if (num(o.reserva)) f.reserva = num(o.reserva);
    if (COEF_FIN[num(o.plazo_meses)]) f.mensualidades = num(o.plazo_meses);
  }
  return f;
}

/* ---------- guardar sin pisar nada ---------- */

/** Lee lo guardado en notas: la ficha (si la hay) y el texto que hubiera antes. */
export function leerNotas(notas) {
  const s = txt(notas);
  if (s.startsWith(PREFIJO_FICHA)) {
    try {
      const d = JSON.parse(s.slice(PREFIJO_FICHA.length));
      return {ficha: d.ficha || null, notasPrevias: txt(d.notasPrevias), guardada: d.guardada, por: d.por};
    } catch (e) { return {ficha: null, notasPrevias: s}; }
  }
  return {ficha: null, notasPrevias: s};
}

export const empaquetarNotas = (ficha, notasPrevias) => PREFIJO_FICHA + JSON.stringify({
  v: 1, ficha, notasPrevias: notasPrevias || '',
  guardada: new Date().toISOString(), por: txt((api.estado.usuario || {}).nombre)});

const etSel = (id, v) => {
  const c = SECCIONES.flatMap(s => s.campos).find(x => x.id === id);
  const o = c && (c.opciones || []).find(x => String(Array.isArray(x) ? x[0] : x) === String(v));
  return o ? (Array.isArray(o) ? o[1] : o) : txt(v);
};

/** El resumen que lee el ingeniero en la descripción del proyecto. */
export function textoResumen(f, r) {
  const l = [MARCA_INICIO + ' (' + fechaCorta(hoyISO()) + ')'];
  l.push('Titular: ' + txt(f.cliente) + (txt(f.cotitular) ? ' · cotitular ' + txt(f.cotitular) : ''));
  l.push('Dirección: ' + [txt(f.direccion), r.muni, txt(f.cp)].filter(Boolean).join(', '));
  l.push('Instalación: ' + [r.conAero ? 'aerotermia' : '', r.conFV ? 'fotovoltaica' : '',
    r.conBat ? 'batería' : '', r.conCar ? 'cargador' : ''].filter(Boolean).join(' + '));
  l.push('Vivienda: ' + num(f.m2) + ' m² · ' + etSel('anyo', f.anyo) + ' · zona ' + etSel('zona', f.zona) +
    ' · ' + num(f.personas) + ' personas · ' + num(f.banos) + ' baños');
  l.push('Hoy: ' + etSel('caldera', f.caldera) + (num(f.calderaKw) ? ' ' + num(f.calderaKw) + ' kW' : '') +
    ' · ' + etSel('emisor', f.emisor) + ' · ' + etSel('suministro', f.suministro) +
    ' · ' + String(num(f.potenciaContratada)).replace('.', ',') + ' kW contratados');
  l.push('Gasto actual: luz ' + eur(num(f.gastoLuzMes)) + '/mes · combustible ' + eur(num(f.gastoCombAnio)) +
    '/año · total ' + eur(r.actual) + '/año' + (num(f.consumo) ? ' · ' + num(f.consumo) + ' kWh/año' : ''));
  if (r.conAero) l.push('Aerotermia: ' + r.modelo + ' · ' + r.acumulador +
    (num(f.inerciaL) ? ' · inercia ' + num(f.inerciaL) + ' L' : ' · sin inercia') +
    ' · ' + (f.refrig === 'si' ? 'frío y calor' : 'solo calor'));
  if (r.conFV) l.push('Fotovoltaica: ' + num(f.placas) + ' placas' + (txt(f.tipoPlaca) ? ' ' + txt(f.tipoPlaca) : '') +
    (txt(f.inversor) ? ' · inversor ' + txt(f.inversor) : '') + ' · tejado ' + etSel('tejado', f.tejado) +
    (r.conBat ? ' · batería ' + String(r.kwhBat).replace('.', ',') + ' kWh' + (txt(f.bateriaModelo) ? ' ' + txt(f.bateriaModelo) : '') : ''));
  if (r.inversion) {
    l.push('Inversión (IVA incluido): ' + eur(r.inversion) + [r.precioAero ? 'aerotermia ' + eur(r.precioAero) : '',
      r.precioFV ? 'FV ' + eur(r.precioFV) : '', r.precioBat ? 'batería ' + eur(r.precioBat) : '',
      r.precioCar ? 'cargador ' + eur(r.precioCar) : ''].filter(Boolean).map(x => ' · ' + x).join(''));
    l.push('Ayudas: IRPF ' + eur(r.deduccion) + ' · IBI ' + eur(r.ibiTotal) + ' · CAE ' + eur(r.cae) +
      ' → coste real ' + eur(r.costeReal));
    l.push('Financiación: cuota a 10 años ' + eur2(r.cuota10) + '/mes' +
      (r.meses !== 120 ? ' (a ' + r.meses + ' meses, ' + eur2(r.cuota) + '/mes)' : '') +
      (r.reserva ? ' · reserva ' + eur(r.reserva) : '') + ' · amortización anticipada sin coste');
  }
  if (r.ahorro) l.push('Ahorro estimado: ' + eur(r.ahorro) + '/año (' + eur2(r.ahorroMes) + '/mes)' +
    (r.coste0 ? ' · COSTE 0' : ''));
  l.push('Cierre: ' + etSel('estado', f.estado) + (txt(f.fechaDecision) ? ' · decisión ' + fechaCorta(f.fechaDecision) : '') +
    (txt(f.slot) ? ' · slot ' + txt(f.slot) : ''));
  if (txt(f.observaciones)) l.push('Observaciones: ' + txt(f.observaciones));
  if (txt(f.motivoNo)) l.push('Motivo del no: ' + txt(f.motivoNo));
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

export function panelFicha(cliente) {
  const caja = h('div', cargando('Abriendo la ficha de dimensionado…'));
  arranca();
  return caja;

  async function arranca() {
    let proy;
    try { proy = (await api.proyectoDe(cliente.id)).proyecto || {}; }
    catch (e) { poner(caja, tarjeta('Ficha de dimensionado', h('p.nota', txt(e.message)))); return; }

    const guardado = leerNotas(proy.notas);
    const valores = Object.assign({}, fichaDesdeCliente(cliente), guardado.ficha || {});
    valores.mensualidades = String(valores.mensualidades);

    const formularios = SECCIONES.map(s => ({s, f: formulario(s.campos, valores)}));
    const leer = () => {
      const o = {};
      formularios.forEach(({f}) => Object.assign(o, f.leer()));
      NUMERICOS.forEach(k => { if (k in o) o[k] = num(o[k]); });
      return o;
    };

    const bloques = formularios.map(({s, f}) => h('.tarjeta.ficha-seccion',
      h('header', h('div', h('h2', s.titulo), s.nota ? h('.nota', s.nota) : null)),
      h('.cuerpo', f.nodo)));

    const resumen = h('div');
    const avisosCaja = h('div');
    const estadoGuardado = h('span.nota');
    let sucio = false;

    function visibles(f) {
      formularios.forEach(({s, f: fo}, i) => {
        bloques[i].style.display = s.solo && !s.solo(f) ? 'none' : '';
        s.campos.forEach(c => {
          if (!c.solo) return;
          const n = fo.nodos[c.id];
          const lab = n && n.control.closest('label');
          if (lab) lab.style.display = c.solo(f) ? '' : 'none';
        });
      });
    }

    function repinta() {
      const f = leer();
      const r = calcular(f);
      visibles(f);
      const kv = (et, v, fuerte) => h('.dato', h('.et', et), h('.v', fuerte ? h('b', v) : v));
      poner(resumen,
        h('div', {estilo: {marginBottom: '8px'}},
          h('.nota', r.conAero ? 'Equipo recomendado' : 'Instalación'),
          h('h3', {estilo: {margin: '2px 0 6px'}},
            r.conAero ? r.modelo : (r.conFV ? num(f.placas) + ' placas fotovoltaicas' : 'Sin equipos marcados')),
          h('.acciones',
            r.conAero ? marca(r.kw + ' kW', 'info') : null,
            r.conAero ? marca(r.acumulador) : null,
            r.conAero ? marca('Carga estimada ' + r.demanda.toFixed(1).replace('.', ',') + ' kW') : null,
            r.conFV ? marca('FV ' + num(f.placas) + ' placas', 'info') : null,
            r.conFV ? marca(r.conBat ? 'Batería ' + String(r.kwhBat).replace('.', ',') + ' kWh' : 'Sin batería') : null)),
        r.actual > 0 ? h('div',
          kv('Gasto energético hoy', eur(r.actual) + '/año'),
          kv('Gasto previsto después', eur(r.futuro) + '/año'),
          kv('Ahorro anual', eur(r.ahorro) + ' · ' + eur2(r.ahorroMes) + '/mes', true)) : null,
        r.inversion > 0 ? h('div',
          kv('Inversión (IVA incluido)', eur(r.inversion), true),
          kv('− Deducción IRPF (' + r.tramo + ' % sobre ' + eur(r.baseIrpf) + ')', '− ' + eur(r.deduccion)),
          kv('− Bonificación IBI (' + r.ibiMun.pct + ' % × ' + r.ibiMun.anios + ' años)', '− ' + eur(r.ibiTotal)),
          kv('− CAE (lo cobra el cliente)', '− ' + eur(r.cae)),
          kv('Coste real tras ayudas', eur(r.costeReal), true),
          r.ahorro > 0 ? kv('Se paga sola en', r.retorno.toFixed(1).replace('.', ',') + ' años') : null) : null,
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

    const alCambiar = () => {
      sucio = true;
      estadoGuardado.textContent = 'Cambios sin guardar';
      repinta();
    };
    bloques.forEach(b => { b.addEventListener('input', alCambiar); b.addEventListener('change', alCambiar); });

    /* Antes de guardar se vuelve a leer el proyecto: la descripción viaja
       siempre (el servidor la reescribe) y puede que alguien la haya tocado
       en la pestaña Proyecto mientras tanto. */
    async function guardar({conResumen} = {}) {
      const fresco = (await api.proyectoDe(cliente.id)).proyecto || {};
      const previas = leerNotas(fresco.notas).notasPrevias;
      const f = leer();
      const datos = {cliente_id: cliente.id, descripcion: txt(fresco.descripcion),
                     notas: empaquetarNotas(f, previas)};
      if (conResumen) datos.descripcion = descripcionConResumen(fresco.descripcion, textoResumen(f, calcular(f)));
      const r = await api.guardarProyecto(datos);
      sucio = false;
      estadoGuardado.textContent = 'Guardada el ' + fechaCorta(hoyISO()) + ' a las ' +
        new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
      return r;
    }

    const conEspera = fn => async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try { await fn(); } catch (x) { avisoError(x); } finally { b.disabled = false; }
    };

    const btnGuardar = h('button.btn.primario', {onclick: conEspera(async () => {
      await guardar();
      aviso('Ficha de dimensionado guardada.');
    })}, 'Guardar ficha');

    const btnPasar = h('button.btn.lima', {onclick: conEspera(async () => {
      const ok = await confirmar('Se escribe el resumen de la ficha en la descripción del proyecto, ' +
        'que es lo que lee el ingeniero. Lo que ya hubiera escrito se queda; si ya había un resumen ' +
        'de la ficha, se cambia por el nuevo.',
        {titulo: 'Pasar la ficha al proyecto', botón: 'Sí, pasarla', peligro: false});
      if (!ok) return;
      const r = await guardar({conResumen: true});
      aviso(r.proyecto && txt(r.proyecto.estado) === 'pedido'
        ? 'Resumen pasado al proyecto. El proyecto ya está pedido.'
        : 'Resumen pasado a la descripción del proyecto.');
    })}, 'Pasar al proyecto');

    const btnRellenar = h('button.btn', {onclick: async () => {
      if (!await confirmar('Se vuelven a poner los datos de la ficha del cliente (nombre, dirección, ' +
        'metros, gastos, la última instalación…). Lo que hayas cambiado a mano en esos campos se pierde.',
        {titulo: 'Rellenar con los datos del cliente', botón: 'Rellenar', peligro: false})) return;
      const base = fichaDesdeCliente(cliente);
      base.mensualidades = String(base.mensualidades);
      formularios.forEach(({f}) => f.poner(base));
      alCambiar();
    }}, 'Rellenar con el cliente');

    if (guardado.guardada) {
      estadoGuardado.textContent = 'Guardada el ' + fechaCorta(String(guardado.guardada).slice(0, 10)) +
        (guardado.por ? ' por ' + guardado.por : '');
    } else estadoGuardado.textContent = 'Todavía sin guardar: sale rellena con lo que hay del cliente.';

    repinta();
    poner(caja,
      h('.acciones.ficha-botones', {estilo: {marginBottom: '12px', flexWrap: 'wrap'}},
        btnGuardar, btnPasar, btnRellenar, estadoGuardado),
      h('.doble.ficha-dim',
        h('div', bloques),
        h('div',
          tarjeta('Resumen en vivo', resumen, {subtitulo: 'Se recalcula al escribir · importes con IVA'}),
          tarjeta('Avisos', avisosCaja))));
  }
}
