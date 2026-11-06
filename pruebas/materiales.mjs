/* Prueba de la lista de materiales (assets/js/materiales.js): node pruebas/materiales.mjs */
import {catalogoCostes, materialesDe, esTrifasica, costeApuntado, margenEstimado, margenesBajos} from '../assets/js/materiales.js';
let fallos = 0;
const ok = (c, m) => { if (!c) { fallos++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const cat = catalogoCostes({catalogo_costes: JSON.stringify([
  {clave: 'fv_modulo_630', concepto: 'Módulo 630', coste: 76.26}, {clave: 'fv_wp', coste: 0.12},
  {clave: 'estructura_modulo', coste: 27}, {clave: 'fv_optimizador', coste: 29.5},
  {clave: 'inv_mono_10', coste: 1150.86}, {clave: 'inv_tri_10', coste: 1390}, {clave: 'meter_tri', coste: 115.2},
  {clave: 'bat_master', coste: 1261.6}, {clave: 'bat_esclava', coste: 1178},
  {clave: 'aero_16', coste: 3656.28}, {clave: 'aero_22', coste: 4660}, {clave: 'acs_200', coste: 886.28},
  {clave: 'inercia_100', coste: 389.16}, {clave: 'cite_tasas', coste: 183.12, iva_pct: 0}, {clave: 'cee', coste: 78.51}
])});
ok(Object.keys(cat).length === 15, 'el catálogo se lee del JSON de CONFIG');
ok(Object.keys(catalogoCostes({})).length === 0, 'sin catálogo (comercial) no hay precios');
const fv = materialesDe({tipo: 'fv', paneles_num: 18, panel_wp: 630, inversor_modelo: 'SolaX X1 VAST', bateria_kwh: 11.6}, cat);
const l = k => fv.lineas.find(x => x.clave === k) || {};
ok(l('fv_modulo_630').cantidad === 18 && l('fv_modulo_630').importe === 1372.68, '18 módulos de 630 W a 76,26 €');
ok(l('fv_optimizador').cantidad === 6, 'optimizadores: un tercio de los módulos');
ok(l('inv_mono_10').cantidad === 1 && !l('inv_tri_10').clave, 'X1 = inversor monofásico');
ok(l('bat_master').cantidad === 1 && l('bat_esclava').cantidad === 1, '11,6 kWh = 1 master + 1 esclava');
ok(fv.faltan.length > 0, 'avisa de las piezas sin precio');
const ae = materialesDe({tipo: 'aero', aero_kw: 22, deposito_acs: 200, deposito_inercia: 100}, cat);
ok(ae.lineas.some(x => x.clave === 'aero_22'), '22 kW → Domusa 22 HTT');
ok(esTrifasica({aero_kw: 22}), 'una aerotermia de 22 kW es trifásica (no hay monofásica)');
ok(ae.lineas.find(x => x.clave === 'cee').cantidad === 2, 'dos certificados energéticos');
const tasas = ae.lineas.find(x => x.clave === 'cite_tasas');
ok(tasas.iva_pct === 0, 'las tasas de Industria van sin IVA');
ok(Math.abs(ae.total - (ae.base + ae.lineas.reduce((s, x) => s + x.importe * x.iva_pct / 100, 0))) < 0.02, 'total = base + IVA');
const ap = costeApuntado([{importe: 100, estado_pago: 'pagado'}, {importe: 50, estado_pago: 'estimado'}]);
ok(ap.real === 100 && ap.estimado === 50, 'separa gastos reales de estimados');
const opA = {id: 'A', estado: 'propuesta', tipo: 'aero', aero_kw: 22, deposito_acs: 200, deposito_inercia: 100, total: ae.base * 1.21 * 1.2};
const opB = {id: 'B', estado: 'propuesta', tipo: 'aero', aero_kw: 22, deposito_acs: 200, deposito_inercia: 100, total: ae.base * 1.21 * 2};
const opC = {id: 'C', estado: 'legalizada', tipo: 'aero', aero_kw: 22, deposito_acs: 200, deposito_inercia: 100, total: ae.base * 1.21 * 1.1};
ok(Math.abs(margenEstimado(opA, cat).pct - (1 - 1 / 1.2)) < 0.001 && margenEstimado(opA, cat).bajo, 'margen estimado del 17 % = bajo');
ok(!margenEstimado(opB, cat).bajo, 'margen del 50 % no avisa');
const bajos = margenesBajos([opA, opB, opC], cat);
ok(bajos.length === 1 && bajos[0].o.id === 'A', 'solo avisa de propuestas y obras en curso, no de las ya legalizadas');
ok(margenEstimado({estado: 'propuesta', total: 1000}, cat) === null, 'sin equipos no hay margen que estimar');
console.log(fallos ? fallos + ' fallo(s)' : 'Todo bien.');
process.exit(fallos ? 1 : 0);
