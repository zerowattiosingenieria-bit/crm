/* Prueba de humo del backend: instala, carga datos, entra con cada rol y
   comprueba que cada uno ve exactamente lo que le toca. */
require('./mock.js');

let fallos = 0, pruebas = 0;
function comprobar(nombre, condicion, extra) {
  pruebas++;
  if (condicion) { console.log('  ok · ' + nombre); }
  else { fallos++; console.log('  FALLA · ' + nombre + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

console.log('\n== Instalación ==');
instalar();
const claves = {};
libroClaves().forEach(f => { claves[f[1]] = f[3]; });
function libroClaves() {
  const h = SpreadsheetApp.openById().getSheetByName('CLAVES_INICIALES');
  return h.getRange(2, 1, h.getLastRow() - 1, 4).getValues();
}
comprobar('se crean 7 usuarios con clave', Object.keys(claves).length === 7, Object.keys(claves));
comprobar('las claves son de 10 caracteres alfanuméricos',
  Object.values(claves).every(c => /^[A-Za-z0-9]{10}$/.test(c)), Object.values(claves));

console.log('\n== Datos de ejemplo ==');
const n = cargarDemo();
comprobar('se cargan clientes de ejemplo', n === 16, n);
comprobar('hay operaciones', leer_('OPERACIONES').length > 0, leer_('OPERACIONES').length);
comprobar('hay cobros', leer_('COBROS').length > 0, leer_('COBROS').length);
comprobar('hay gastos', leer_('GASTOS').length > 0, leer_('GASTOS').length);

console.log('\n== Entrada al sistema ==');
function entrar(usuario) {
  const r = despachar_({accion: 'login', usuario: usuario, clave: claves[usuario]});
  if (!r.ok) throw new Error('No entra ' + usuario + ': ' + r.error);
  return r;
}
const sesiones = {};
['superadmin','ruben','fernando','nando','rober','sandra','abraham'].forEach(u => { sesiones[u] = entrar(u); });
comprobar('entran los siete usuarios', Object.keys(sesiones).length === 7);
comprobar('clave incorrecta rechazada',
  despachar_({accion: 'login', usuario: 'nando', clave: 'xxxxxxxxxx'}).ok === false);
comprobar('el hash nunca sale del servidor', !JSON.stringify(sesiones.nando).includes('hash'));

console.log('\n== Qué ve cada rol ==');
function datos(u) { return despachar_({accion: 'datos', token: sesiones[u].token}); }
const dAdmin = datos('fernando'), dNando = datos('nando'), dRober = datos('rober'),
      dSandra = datos('sandra'), dSuper = datos('superadmin');

comprobar('el administrador ve todos los clientes', dAdmin.clientes.length === 16, dAdmin.clientes.length);
comprobar('Nando solo ve los suyos',
  dNando.clientes.length > 0 && dNando.clientes.every(c => c.comercial_id === sesiones.nando.usuario.id),
  dNando.clientes.length);
comprobar('Nando y Rober no comparten clientes',
  dNando.clientes.every(c => !dRober.clientes.some(x => x.id === c.id)));
comprobar('Sandra solo ve lo que ha captado',
  dSandra.clientes.length > 0 && dSandra.clientes.every(c => c.captador_id === sesiones.sandra.usuario.id),
  dSandra.clientes.length);
comprobar('el comercial no recibe gastos', dNando.gastos.length === 0);
comprobar('el comercial no recibe facturas', dNando.facturas.length === 0);
comprobar('el comercial sí ve los cobros de sus operaciones', dNando.cobros.length > 0, dNando.cobros.length);
comprobar('el administrador sí recibe gastos y facturas',
  dAdmin.gastos.length > 0 && dAdmin.facturas.length > 0);

console.log('\n== Finanzas cerradas a comerciales y captadores ==');
const fNando = despachar_({accion: 'finanzas', token: sesiones.nando.token});
comprobar('un comercial no puede abrir finanzas', fNando.ok === false, fNando.error);
const fSandra = despachar_({accion: 'finanzas', token: sesiones.sandra.token});
comprobar('un captador no puede abrir finanzas', fSandra.ok === false);
const fAdmin = despachar_({accion: 'finanzas', token: sesiones.fernando.token});
comprobar('el administrador sí', fAdmin.ok === true, fAdmin.error);
comprobar('salen indicadores de salud', fAdmin.salud && fAdmin.salud.length >= 8, (fAdmin.salud||[]).length);
comprobar('salen consejos', fAdmin.consejos && fAdmin.consejos.length > 0);
comprobar('la tesorería tiene tres tramos', fAdmin.tesoreria.length === 3);
comprobar('el margen se calcula', typeof fAdmin.resumen.margen_pct === 'number', fAdmin.resumen.margen_pct);
comprobar('cuadra ingresos - costes = margen bruto',
  Math.abs((fAdmin.resumen.ingresos - fAdmin.resumen.costes) - fAdmin.resumen.margen_bruto) < 0.02,
  [fAdmin.resumen.ingresos, fAdmin.resumen.costes, fAdmin.resumen.margen_bruto]);

console.log('\n== Mapa solo para dirección ==');
comprobar('un comercial no abre el mapa', despachar_({accion: 'mapa', token: sesiones.nando.token}).ok === false);
const mapa = despachar_({accion: 'mapa', token: sesiones.ruben.token});
comprobar('dirección sí abre el mapa', mapa.ok === true, mapa.error);
comprobar('hay puntos con coordenadas', mapa.puntos.length === 16, mapa.puntos.length);
comprobar('los puntos traen el gasto anual', mapa.puntos.every(p => p.gasto_anual > 0));
comprobar('hay resumen por municipio', mapa.municipios.length > 0);

console.log('\n== Alta y edición de cliente ==');
const alta = despachar_({accion: 'guardarCliente', token: sesiones.nando.token,
  cliente: {nombre: 'Cliente de prueba', direccion: 'Calle Falsa 1', municipio: 'Madrid',
            telefono: '600000000', gasto_luz_mes: 95}});
comprobar('el comercial da de alta un cliente', alta.ok === true, alta.error);
comprobar('el cliente queda a su nombre', alta.cliente.comercial_id === sesiones.nando.usuario.id);
const robaCliente = despachar_({accion: 'guardarCliente', token: sesiones.rober.token,
  cliente: {id: alta.cliente.id, nombre: 'Robado'}});
comprobar('otro comercial no puede tocarlo', robaCliente.ok === false, robaCliente.error);

console.log('\n== Operación y cobros automáticos ==');
const op = despachar_({accion: 'guardarOperacion', token: sesiones.nando.token,
  operacion: {cliente_id: alta.cliente.id, tipo: 'fv_aero', importe_fv: 10990, importe_aero: 16990,
              forma_pago: 'contado', estado: 'firmada', fecha_firma: hoyISO_(), iva_pct: 21}});
comprobar('se crea la operación', op.ok === true, op.error);
comprobar('el total suma los importes', op.operacion.total === 27980, op.operacion.total);
comprobar('la base descuenta el IVA', Math.abs(op.operacion.base - 27980 / 1.21) < 0.02, op.operacion.base);
comprobar('se generan los tres cobros 50/25/25', op.cobros.length === 3, op.cobros.length);
comprobar('los cobros suman el total',
  Math.abs(op.cobros.reduce((a, c) => a + num_(c.importe), 0) - 27980) < 0.05);
const cliTrasFirma = leer_('CLIENTES').filter(c => c.id === alta.cliente.id)[0];
comprobar('al firmar, el cliente pasa a ganado', cliTrasFirma.estado === 'ganado', cliTrasFirma.estado);

console.log('\n== Parte diario y lectura del resumen ==');
const noGanados = dNando.clientes.filter(c => c.estado !== 'ganado' && c.estado !== 'perdido');
const nombreCli = noGanados[0].nombre;
const otroCli = noGanados[1].nombre;
const texto = 'He estado con ' + nombreCli + ' y firmamos el contrato. ' +
              otroCli + ' se lo piensa, le vuelvo a llamar el lunes. ' +
              'Cliente de prueba: propuesta enviada, llamar para cerrar el 12/12.';
const parte = despachar_({accion: 'guardarParte', token: sesiones.nando.token,
  parte: {fecha: hoyISO_(), sentadas_detalle: [{cliente_id: noGanados[0].id, resultado: 'venta'}],
          ventas: 1, importe_vendido: 27980, resumen: texto}});
comprobar('se guarda el parte', parte.ok === true, parte.error);
comprobar('el análisis reconoce clientes', parte.analisis.propuestas.length >= 2,
  parte.analisis.propuestas.map(p => p.cliente + '->' + p.estado));
const propFirma = parte.analisis.propuestas.filter(p => p.cliente === nombreCli)[0];
comprobar('detecta la firma',
  propFirma && (propFirma.estado === 'ganado' || propFirma.estado_actual === 'ganado'), propFirma);
const propPiensa = parte.analisis.propuestas.filter(p => p.cliente === otroCli)[0];
comprobar('detecta que se lo piensa',
  propPiensa && (propPiensa.estado === 'negociando' || propPiensa.estado_actual === 'negociando'), propPiensa);
comprobar('detecta la fecha del lunes', propPiensa && /^\d{4}-\d{2}-\d{2}$/.test(propPiensa.proxima_fecha),
  propPiensa && propPiensa.proxima_fecha);
const propPrueba = parte.analisis.propuestas.filter(p => p.cliente === 'Cliente de prueba')[0];
comprobar('detecta la fecha 12/12', propPrueba && propPrueba.proxima_fecha.slice(5) === '12-12',
  propPrueba && propPrueba.proxima_fecha);

const aplicado = despachar_({accion: 'aplicarParte', token: sesiones.nando.token, id: parte.parte.id,
  cambios: parte.analisis.propuestas});
comprobar('se aplican los cambios confirmados', aplicado.ok && aplicado.aplicados.length >= 2, aplicado);
const cliDespues = leer_('CLIENTES').filter(c => c.nombre === otroCli)[0];
comprobar('el cliente queda con próximo paso', !!cliDespues.proxima_accion, cliDespues.proxima_accion);

console.log('\n== Resúmenes personales ==');
const rNando = despachar_({accion: 'resumen', token: sesiones.nando.token});
comprobar('el comercial ve su resumen', rNando.ok === true, rNando.error);
comprobar('cuenta sus ventas', rNando.resumen.ventas >= 1, rNando.resumen.ventas);
comprobar('calcula comisiones', rNando.resumen.comisiones.total > 0, rNando.resumen.comisiones.total);
const espia = despachar_({accion: 'resumen', token: sesiones.nando.token, usuario_id: sesiones.rober.usuario.id});
comprobar('no puede ver el resumen de otro', espia.ok === false, espia.error);
const rSandra = despachar_({accion: 'resumen', token: sesiones.sandra.token});
comprobar('la captadora ve sus captaciones', rSandra.ok === true && rSandra.resumen.fichas >= 0);

console.log('\n== Comisiones ==');
/* Las tarifas que pidió la casa: Nando sénior 700, Rober júnior 400 con
   ajustada de 200, captación 400 para quien abra la puerta y 400 de equipo
   para el responsable por lo que cierra su júnior. */
const uNando = leer_('USUARIOS').filter(x => x.usuario === 'nando')[0];
const uRober = leer_('USUARIOS').filter(x => x.usuario === 'rober')[0];
const uSandra = leer_('USUARIOS').filter(x => x.usuario === 'sandra')[0];
comprobar('el sénior cobra 700 por venta', num_(uNando.comision_fv) === 700 && num_(uNando.comision_aero) === 700,
  uNando.comision_fv + '/' + uNando.comision_aero);
comprobar('el júnior cobra 400 por venta', num_(uRober.comision_fv) === 400 && num_(uRober.comision_aero) === 400);
comprobar('el júnior ajustado cobra 200', num_(uRober.comision_fv_ajustada) === 200);
comprobar('Rober tiene a Nando de responsable', String(uRober.responsable_id) === String(uNando.id));
comprobar('el sénior tiene comisión de equipo de 400', num_(uNando.comision_equipo_fv) === 400);
comprobar('un captador no cobra comisión de venta', num_(uSandra.comision_fv) === 0);
comprobar('todos cobran 400 por captar', num_(uSandra.comision_captacion_fv) === 400 &&
  num_(uNando.comision_captacion_fv) === 400);

const cVenta = comisionesDe_(uNando, [{id: 'X', referencia: 'R1', tipo: 'fv_aero', fecha_firma: hoyISO_()}], [], []);
comprobar('una doble del sénior son 1400', cVenta.total === 1400, cVenta.total);
const cAjus = comisionesDe_(uRober,
  [{id: 'X', referencia: 'R2', tipo: 'fv_aero', precio_ajustado: 'si', fecha_firma: hoyISO_()}], [], []);
comprobar('una doble ajustada del júnior son 400', cAjus.total === 400, cAjus.total);
const cCap = comisionesDe_(uSandra, [], [{id: 'CA-1', tecnologia: 'aero', fecha: hoyISO_()}], []);
comprobar('captar una aerotermia vendida son 400', cCap.total === 400, cCap.total);
const cEq = comisionesDe_(uNando, [], [],
  [{id: 'Y', referencia: 'R3', tipo: 'fv', fecha_firma: hoyISO_(), _de: 'Rober'}]);
comprobar('el sénior cobra 400 por la venta de su júnior', cEq.total === 400, cEq.total);
comprobar('la línea de equipo dice de quién es', cEq.detalle[0].concepto === 'venta de su equipo' &&
  cEq.detalle[0].de === 'Rober', JSON.stringify(cEq.detalle[0]));
const cTodo = comisionesDe_(uNando,
  [{id: 'X', referencia: 'R1', tipo: 'fv', fecha_firma: hoyISO_()}],
  [{id: 'CA-2', tecnologia: 'fv', fecha: hoyISO_()}],
  [{id: 'Y', referencia: 'R3', tipo: 'fv', fecha_firma: hoyISO_(), _de: 'Rober'}]);
comprobar('vender, captar y llevar equipo se suman', cTodo.total === 1500, cTodo.total);
const eq = despachar_({accion: 'equipo', token: sesiones.fernando.token});
comprobar('dirección ve el equipo entero', eq.ok === true && eq.equipo.length === 7, eq.error || eq.equipo.length);
comprobar('hay ranking de comerciales', eq.ranking_comerciales.length === 2);

console.log('\n== Nóminas ==');
const nomGen = despachar_({accion: 'generarNomina', token: sesiones.fernando.token,
  usuario_id: sesiones.nando.usuario.id, periodo: hoyISO_().slice(0, 7)});
comprobar('dirección genera la nómina', nomGen.ok === true, nomGen.error);
comprobar('el neto es menor que el bruto total', num_(nomGen.nomina.neto) < num_(nomGen.nomina.bruto_total));
const nomNando = despachar_({accion: 'nominas', token: sesiones.nando.token});
comprobar('el comercial ve su nómina', nomNando.ok === true && nomNando.nominas.length === 1);
const nomAjena = despachar_({accion: 'nominas', token: sesiones.nando.token, usuario_id: sesiones.rober.usuario.id});
comprobar('no ve la de otro', nomAjena.ok === false);
const dias = despachar_({accion: 'nominaDias', token: sesiones.nando.token,
  desde: hoyISO_().slice(0, 8) + '01', hasta: hoyISO_()});
comprobar('hay desglose por días', dias.ok === true && dias.dias.length > 0, dias.error);
comprobar('los días laborables devengan', dias.dias.some(d => d.devengo > 0));
comprobar('los fines de semana no devengan',
  dias.dias.filter(d => d.tipo === 'libre').every(d => d.devengo === 0));
comprobar('el total del periodo cuadra con la suma de los días',
  Math.abs(dias.totales.devengo - dias.dias.reduce((a, d) => a + d.devengo, 0)) < 0.02);
const generaOtro = despachar_({accion: 'generarNomina', token: sesiones.nando.token,
  usuario_id: sesiones.rober.usuario.id, periodo: '2026-09'});
comprobar('un comercial no genera nóminas', generaOtro.ok === false);

console.log('\n== Administración de usuarios ==');
const altaUsr = despachar_({accion: 'guardarUsuario', token: sesiones.superadmin.token,
  usuario: {nombre: 'Prueba', usuario: 'prueba', rol: 'comercial'}});
comprobar('el superadmin da de alta usuarios', altaUsr.ok === true, altaUsr.error);
comprobar('la clave nueva es de 10 caracteres', /^[A-Za-z0-9]{10}$/.test(altaUsr.clave || ''), altaUsr.clave);
const altaPorAdmin = despachar_({accion: 'guardarUsuario', token: sesiones.fernando.token,
  usuario: {nombre: 'Otro', usuario: 'otro', rol: 'comercial'}});
comprobar('un administrador no da de alta usuarios', altaPorAdmin.ok === false, altaPorAdmin.error);
const reset = despachar_({accion: 'resetClave', token: sesiones.superadmin.token, id: altaUsr.usuario.id});
comprobar('se puede regenerar una clave', reset.ok === true && /^[A-Za-z0-9]{10}$/.test(reset.clave));
const cambio = despachar_({accion: 'cambiarClave', token: sesiones.nando.token,
  actual: claves.nando, nueva: 'nuevaclave2026'});
comprobar('cada uno cambia su clave', cambio.ok === true, cambio.error);
comprobar('la clave vieja ya no vale',
  despachar_({accion: 'login', usuario: 'nando', clave: claves.nando}).ok === false);
comprobar('la nueva sí',
  despachar_({accion: 'login', usuario: 'nando', clave: 'nuevaclave2026'}).ok === true);

console.log('\n== Alertas y analítica ==');
const al = despachar_({accion: 'alertas', token: sesiones.fernando.token});
comprobar('hay alertas para dirección', al.ok === true && al.alertas.length > 0, (al.alertas||[]).length);
comprobar('dirección ve cobros vencidos', al.alertas.some(a => a.tipo === 'cobro_vencido'));
const alRober = despachar_({accion: 'alertas', token: sesiones.rober.token});
comprobar('un comercial no ve alertas de cobro', !alRober.alertas.some(a => a.tipo === 'cobro_vencido'));
const an = despachar_({accion: 'analitica', token: sesiones.fernando.token});
comprobar('la analítica trae el embudo', an.ok === true && an.embudo.length === 5, an.error);
comprobar('la analítica trae municipios', an.municipios.length > 0);

console.log('\n== Sesión ==');
comprobar('sin token no se entra', despachar_({accion: 'datos'}).ok === false);
comprobar('token inventado rechazado', despachar_({accion: 'datos', token: 'xxx'}).ok === false);

console.log('\n== Nómina en PDF ==');
const pdfFalso = Buffer.from('%PDF-1.4 nomina de prueba').toString('base64');
const subida = despachar_({accion: 'subirNomina', token: sesiones.fernando.token,
  usuario_id: sesiones.nando.usuario.id, periodo: '2026-09', tipo: 'application/pdf',
  datos: pdfFalso, neto: 1899.55, estado: 'pagada', fecha_pago: hoyISO_()});
comprobar('dirección sube el PDF de la nómina', subida.ok === true, subida.error);
comprobar('la nómina guarda el archivo', !!subida.nomina.archivo_id);
const subeOtro = despachar_({accion: 'subirNomina', token: sesiones.nando.token,
  usuario_id: sesiones.rober.usuario.id, periodo: '2026-09', datos: pdfFalso});
comprobar('un comercial no puede subir nóminas', subeOtro.ok === false);
const baja = despachar_({accion: 'descargarNomina', token: sesiones.nando.token, id: subida.nomina.id});
comprobar('cada uno se descarga la suya', baja.ok === true && baja.datos === pdfFalso, baja.error);
const bajaAjena = despachar_({accion: 'descargarNomina', token: sesiones.rober.token, id: subida.nomina.id});
comprobar('nadie se descarga la de otro', bajaAjena.ok === false);
const bajaDireccion = despachar_({accion: 'descargarNomina', token: sesiones.ruben.token, id: subida.nomina.id});
comprobar('dirección sí puede', bajaDireccion.ok === true);
const listaNom = despachar_({accion: 'nominas', token: sesiones.nando.token});
comprobar('la nómina aparece en su lista',
  listaNom.nominas.some(n => n.periodo === '2026-09' && String(n.neto) !== ''), listaNom.nominas.length);
const borrada = despachar_({accion: 'borrarNomina', token: sesiones.nando.token, id: subida.nomina.id});
comprobar('un comercial no borra nóminas', borrada.ok === false);

console.log('\n== Vacaciones ==');
const anio = hoyISO_().slice(0, 4);
const pide = despachar_({accion: 'solicitarVacaciones', token: sesiones.nando.token,
  desde: anio + '-08-03', hasta: anio + '-08-14', nota: 'Vacaciones de verano'});
comprobar('un comercial pide sus días', pide.ok === true, pide.error);
comprobar('cuenta solo días laborables', num_(pide.vacaciones.dias) === 10, pide.vacaciones.dias);
comprobar('queda pendiente de aprobar', pide.vacaciones.estado === 'solicitada');

const pisa = despachar_({accion: 'solicitarVacaciones', token: sesiones.nando.token,
  desde: anio + '-08-10', hasta: anio + '-08-12'});
comprobar('no deja pisar fechas ya pedidas', pisa.ok === false, pisa.error);

const pasado = despachar_({accion: 'solicitarVacaciones', token: sesiones.nando.token,
  desde: anio + '-01-07', hasta: anio + '-03-31'});
comprobar('no deja pasarse de los 22 días', pasado.ok === false, pasado.error);

const vistaNando = despachar_({accion: 'vacaciones', token: sesiones.nando.token, anio: anio});
comprobar('ve su saldo', vistaNando.saldos.length === 1 && vistaNando.saldos[0].pendientes === 10,
  JSON.stringify(vistaNando.saldos));
comprobar('un comercial no ve las de los demás',
  vistaNando.vacaciones.every(v => String(v.usuario_id) === String(sesiones.nando.usuario.id)));

const apruebaSolo = despachar_({accion: 'resolverVacaciones', token: sesiones.nando.token,
  id: pide.vacaciones.id, estado: 'aprobada'});
comprobar('nadie se aprueba sus propias vacaciones', apruebaSolo.ok === false);

const aprueba = despachar_({accion: 'resolverVacaciones', token: sesiones.fernando.token,
  id: pide.vacaciones.id, estado: 'aprobada', respuesta: 'Adelante'});
comprobar('dirección aprueba', aprueba.ok === true && aprueba.vacaciones.estado === 'aprobada', aprueba.error);
const jornadasVac = leer_('JORNADAS').filter(j => j.tipo === 'vacaciones' &&
  String(j.usuario_id) === String(sesiones.nando.usuario.id));
comprobar('los días aprobados se marcan en el calendario de nómina', jornadasVac.length === 10,
  jornadasVac.length);

const diasNomina = despachar_({accion: 'nominaDias', token: sesiones.nando.token,
  desde: anio + '-08-01', hasta: anio + '-08-31'});
const enVacaciones = diasNomina.dias.filter(x => x.tipo === 'vacaciones');
comprobar('la nómina ve esos días como vacaciones', enVacaciones.length === 10, enVacaciones.length);
comprobar('los días de vacaciones no devengan sueldo diario',
  enVacaciones.every(x => x.devengo === 0));

const vistaDireccion = despachar_({accion: 'vacaciones', token: sesiones.ruben.token, anio: anio});
comprobar('dirección ve las de todo el equipo', vistaDireccion.saldos.length >= 6,
  vistaDireccion.saldos.length);
comprobar('dirección puede aprobar', vistaDireccion.puede_aprobar === true);

const retira = despachar_({accion: 'cancelarVacaciones', token: sesiones.nando.token,
  id: pide.vacaciones.id});
comprobar('la persona puede retirar sus días', retira.ok === true);
comprobar('al retirar se limpian las jornadas',
  leer_('JORNADAS').filter(j => j.tipo === 'vacaciones' &&
    String(j.usuario_id) === String(sesiones.nando.usuario.id)).length === 0);

console.log('\n== Sincronización de cobros ==');
const opSync = despachar_({accion: 'guardarOperacion', token: sesiones.nando.token,
  operacion: {cliente_id: alta.cliente.id, tipo: 'fv', importe_fv: 9990, forma_pago: 'contado',
              estado: 'firmada', fecha_firma: hoyISO_(), iva_pct: 21}});
comprobar('se crea la operación de prueba', opSync.ok === true);
const subida2 = despachar_({accion: 'guardarOperacion', token: sesiones.nando.token,
  operacion: {id: opSync.operacion.id, cliente_id: alta.cliente.id, tipo: 'fv',
              importe_fv: 12990, forma_pago: 'contado', iva_pct: 21}});
comprobar('al subir el importe se rehacen los cobros',
  Math.abs(subida2.cobros.reduce((a, c) => a + num_(c.importe), 0) - 12990) < 0.05,
  subida2.cobros.map(c => c.importe));

console.log('\n== Copia de seguridad ==');
const copia = copiaSeguridad();
comprobar('la copia genera archivos', copia.archivos.length >= 1, JSON.stringify(copia.archivos));
comprobar('la copia incluye el volcado JSON', copia.archivos.some(a => a.tipo === 'json'));
const copias = despachar_({accion: 'copias', token: sesiones.fernando.token});
comprobar('dirección ve las copias guardadas', copias.ok === true && copias.copias.length >= 1,
  copias.error);
const copiasComercial = despachar_({accion: 'copias', token: sesiones.nando.token});
comprobar('un comercial no ve las copias', copiasComercial.ok === false);
const bajaCopia = despachar_({accion: 'descargarCopia', token: sesiones.fernando.token});
comprobar('se puede descargar la última copia', bajaCopia.ok === true && !!bajaCopia.datos, bajaCopia.error);
comprobar('el disparador semanal se instala', instalarDisparadores() === true);

console.log('\n== Importación del histórico ==');
const historico = {
  clientes: [{ref: 'ZWI-20260101-XX', nombre: 'Cliente histórico', direccion: 'Calle Vieja 1',
              municipio: 'Alcorcón', estado: 'ganado', comercial: 'nando', creado: '2026-01-10'}],
  operaciones: [{referencia: 'ZWI-20260101-XX', ref_cliente: 'ZWI-20260101-XX', tipo: 'fv_aero',
                 estado: 'legalizada', comercial: 'nando', fecha_firma: '2026-01-12',
                 base: 20000, total: 24200, paneles_num: 20, aero_kw: 16}],
  facturas: [{numero: 'FZW2026-999', ref_operacion: 'ZWI-20260101-XX', fecha: '2026-01-15',
              base: 10000, iva: 2100, total: 12100, estado: 'cobrada', concepto: '50%'}],
  cobros: [{ref_operacion: 'ZWI-20260101-XX', concepto: 'firma', importe: 12100,
            fecha_prevista: '2026-01-15', fecha_cobro: '2026-01-20'},
           {ref_operacion: 'ZWI-20260101-XX', concepto: 'final', importe: 12100, fecha_prevista: '2026-03-15'}],
  gastos: [{categoria: 'material_fv', proveedor: 'SumSol', concepto: 'Paneles', importe: 6000,
            fecha: '2026-01-18', ref_operacion: 'ZWI-20260101-XX'}],
  nominas: [{usuario: 'abraham', periodo: '2026-02', bruto: 1250, irpf: 67.24, ss: 117.40,
             neto: 2570.24, fecha_pago: '2026-02-28'}]
};
const imp = despachar_({accion: 'importar', token: sesiones.fernando.token, ...historico});
comprobar('se importa el histórico', imp.ok === true, JSON.stringify(imp));
comprobar('entra un cliente, una obra y una factura',
  imp.resumen.clientes === 1 && imp.resumen.operaciones === 1 && imp.resumen.facturas === 1,
  JSON.stringify(imp.resumen));
const impDos = despachar_({accion: 'importar', token: sesiones.fernando.token, ...historico});
comprobar('repetir la importación no duplica nada',
  impDos.resumen.clientes === 0 && impDos.resumen.operaciones === 0 && impDos.resumen.facturas === 0 &&
  impDos.resumen.cobros === 0 && impDos.resumen.gastos === 0 && impDos.resumen.nominas === 0,
  JSON.stringify(impDos.resumen));
const opHist = leer_('OPERACIONES').filter(o => o.referencia === 'ZWI-20260101-XX')[0];
comprobar('la obra queda con su cliente y su importe',
  !!opHist && num_(opHist.total) === 24200, opHist && opHist.total);
const gastoHist = leer_('GASTOS').filter(g => g.proveedor === 'SumSol')[0];
comprobar('el gasto queda colgado de la obra', gastoHist && gastoHist.operacion_id === opHist.id);
const nomHist = leer_('NOMINAS').filter(n => n.periodo === '2026-02' &&
  String(n.usuario_id) === String(sesiones.abraham.usuario.id))[0];
comprobar('la nómina histórica queda guardada', !!nomHist && num_(nomHist.neto) === 2570.24,
  nomHist && nomHist.neto);
/* Rectificar: el apunte del banco pasa a ser la factura de la obra, sin IVA,
   y no se crea una fila nueva. */
const antesRect = leer_('GASTOS').length;
const rect = despachar_({accion: 'importar', token: sesiones.fernando.token, gastos: [
  {anterior: {proveedor: 'SumSol', fecha: '2026-01-18', importe: 6000},
   categoria: 'material_fv', proveedor: 'SumSol', concepto: 'FACTURA SUMSOL 2026-FV-1',
   importe: 4958.68, fecha: '2026-01-17', ref_operacion: 'ZWI-20260101-XX',
   factura_proveedor: '2026-FV-1'}]});
comprobar('rectificar un gasto no crea otra fila',
  rect.ok === true && leer_('GASTOS').length === antesRect, JSON.stringify(rect));
const gastoRect = leer_('GASTOS').filter(g => g.factura_proveedor === '2026-FV-1')[0];
comprobar('el gasto queda con el importe de la factura y su obra',
  !!gastoRect && num_(gastoRect.importe) === 4958.68 && gastoRect.operacion_id === opHist.id,
  gastoRect && gastoRect.importe);
const rectDos = despachar_({accion: 'importar', token: sesiones.fernando.token, gastos: [
  {anterior: {proveedor: 'SumSol', fecha: '2026-01-18', importe: 6000},
   categoria: 'material_fv', proveedor: 'SumSol', concepto: 'FACTURA SUMSOL 2026-FV-1',
   importe: 4958.68, fecha: '2026-01-17', ref_operacion: 'ZWI-20260101-XX',
   factura_proveedor: '2026-FV-1'}]});
comprobar('rectificar dos veces tampoco duplica',
  rectDos.resumen.gastos === 0 && leer_('GASTOS').length === antesRect,
  JSON.stringify(rectDos.resumen));

const impComercial = despachar_({accion: 'importar', token: sesiones.nando.token, clientes: []});
comprobar('un comercial no puede importar', impComercial.ok === false, impComercial.error);

console.log('\n== Banco ==');
const movimientos = [
  {fecha: '2026-09-21', concepto: 'TRANSFERENCIA', importe: 14990, saldo: 20553.4},
  {fecha: '2026-09-21', concepto: 'PAGO FACTURA 2601', importe: -1149.5, saldo: 13400.35},
  {fecha: '2026-08-31', concepto: 'TGSS.COTIZACION 0', importe: -1746.02, saldo: 6225.75},
  {fecha: '2026-08-28', concepto: 'PAGO NOMINA AGOSTO', importe: -774.97, saldo: 8713.77},
  {fecha: '2026-08-28', concepto: 'PAGO NOMINA AGOSTO', importe: -774.97, saldo: 7938.80},
  {fecha: '2026-09-17', concepto: 'WWW.JIBBLE.IO', importe: -7.07, saldo: 12664.06},
  {fecha: '2026-09-15', concepto: 'DIGI SPAIN TELEC.', importe: -35.9, saldo: 12600},
  /* Un cargo, su devolución y el mismo cargo otra vez: el saldo vuelve al
     mismo sitio las dos veces y aun así son tres movimientos de verdad. */
  {fecha: '2026-07-10', concepto: 'TRASPASO PARA IMP', importe: -10000, saldo: 15250.7},
  {fecha: '2026-07-10', concepto: 'TRASPASO PARA IMP', importe: 10000, saldo: 25250.7},
  {fecha: '2026-07-10', concepto: 'TRASPASO PARA IMP', importe: -10000, saldo: 15250.7}
];
const imp1 = despachar_({accion: 'importarBanco', token: sesiones.fernando.token, movimientos});
comprobar('se importan los movimientos', imp1.ok === true && imp1.nuevos === 10, JSON.stringify(imp1));
const imp2 = despachar_({accion: 'importarBanco', token: sesiones.fernando.token, movimientos});
comprobar('no se duplican al reimportar', imp2.nuevos === 0 && imp2.repetidos === 10, JSON.stringify(imp2));
const conRepetido = movimientos.concat([
  {fecha: '2026-07-10', concepto: 'TRASPASO PARA IMP', importe: -10000, saldo: 15250.7}]);
const imp3 = despachar_({accion: 'importarBanco', token: sesiones.fernando.token,
  movimientos: conRepetido});
comprobar('una repetición de más sí entra', imp3.nuevos === 1 && imp3.repetidos === 10,
  JSON.stringify(imp3));
const banco = despachar_({accion: 'banco', token: sesiones.fernando.token});
const porConcepto = {};
banco.movimientos.forEach(m => { porConcepto[m.concepto] = m.categoria; });
comprobar('reconoce las nóminas', porConcepto['PAGO NOMINA AGOSTO'] === 'nominas', porConcepto);
comprobar('reconoce la Seguridad Social', porConcepto['TGSS.COTIZACION 0'] === 'seguridad_social');
comprobar('reconoce a los proveedores', porConcepto['PAGO FACTURA 2601'] === 'proveedor');
comprobar('reconoce el software', porConcepto['WWW.JIBBLE.IO'] === 'servicios');
comprobar('reconoce la telefonía', porConcepto['DIGI SPAIN TELEC.'] === 'telefonia');
comprobar('reconoce los cobros de cliente', porConcepto['TRANSFERENCIA'] === 'cobro_cliente');

/* Los conceptos del banco llegan cortados a media palabra; las reglas tienen
   que reconocerlos igual, porque lo que no se clasifica no cuenta como coste
   de estructura y el punto de equilibrio sale barato. */
const recortados = [
  {fecha: '2026-05-25', concepto: 'PAGO PEDIDO POLAR', importe: -8072.48, saldo: 100, espera: 'proveedor'},
  {fecha: '2026-03-31', concepto: 'SEGUNDO PAGO SUMS', importe: -2843.5, saldo: 101, espera: 'proveedor'},
  {fecha: '2026-02-11', concepto: 'PAGO SUMSOL PROFO', importe: -264.17, saldo: 102, espera: 'proveedor'},
  {fecha: '2026-03-16', concepto: 'DIETAS VIAJE FERNANDO', importe: -982.14, saldo: 103, espera: 'dietas'},
  {fecha: '2026-02-17', concepto: 'Vistaprint', importe: -231.79, saldo: 104, espera: 'marketing'},
  {fecha: '2026-03-16', concepto: 'GASTOS CONSTITUCI', importe: -57.85, saldo: 105, espera: 'administracion'},
  {fecha: '2026-02-20', concepto: 'retribucion auton', importe: -387.72, saldo: 106, espera: 'nominas'},
  {fecha: '2026-04-28', concepto: '812600046271805', importe: -803.43, saldo: 107, espera: 'financiacion'}
];
despachar_({accion: 'importarBanco', token: sesiones.fernando.token,
  movimientos: recortados.map(m => ({fecha: m.fecha, concepto: m.concepto,
    importe: m.importe, saldo: m.saldo}))});
const tras = despachar_({accion: 'banco', token: sesiones.fernando.token});
const porCorte = {};
tras.movimientos.forEach(m => { porCorte[m.concepto] = m.categoria; });
recortados.forEach(m => comprobar('clasifica «' + m.concepto + '»',
  porCorte[m.concepto] === m.espera, porCorte[m.concepto]));
comprobar('no queda nada sin clasificar',
  tras.movimientos.every(m => txt_(m.categoria) !== 'otros_gastos'),
  tras.movimientos.filter(m => txt_(m.categoria) === 'otros_gastos').map(m => m.concepto).join(', '));
comprobar('guarda dos apuntes iguales del mismo día', 
  banco.movimientos.filter(m => m.concepto === 'PAGO NOMINA AGOSTO').length === 2);
comprobar('guarda un cargo repetido que deja el mismo saldo',
  banco.movimientos.filter(m => m.concepto === 'TRASPASO PARA IMP' && num_(m.importe) === -10000)
    .length === 3);
comprobar('el traspaso entre cuentas propias no es ni gasto ni impuesto',
  porConcepto['TRASPASO PARA IMP'] === 'traspaso', porConcepto['TRASPASO PARA IMP']);
comprobar('el saldo es el del último movimiento', num_(banco.saldo) === 20553.4, banco.saldo);

/* Segunda cuenta: la de los impuestos. Los apuntes conviven con los de la
   principal y cada cuenta aporta su propio saldo. */
const impSab = despachar_({accion: 'importarBanco', token: sesiones.fernando.token,
  cuenta: 'Sabadell', movimientos: [
    {fecha: '2026-07-10', concepto: 'TRANSFERENCIA ZERO WATTIOS INGENIERIA SL', importe: 10000, saldo: 26670.4},
    {fecha: '2026-07-20', concepto: 'IMPUESTOS - IVA DECLARACIÓN MENSUAL/TRIMESTRAL', importe: -14876.35, saldo: 1449.7},
    {fecha: '2026-09-21', concepto: 'ABONO TRANSFERENCIA DE ZERO WATTIOS', importe: 2000, saldo: 9949.7}]});
comprobar('entra la segunda cuenta', impSab.ok === true && impSab.nuevos === 3 &&
  impSab.cuenta === 'Sabadell', JSON.stringify(impSab));
/* Las claves de la cuenta principal no cambian al aparecer una segunda: su
   extracto se puede volver a importar sin duplicar nada. */
const reimp = despachar_({accion: 'importarBanco', token: sesiones.fernando.token, movimientos});
comprobar('la cuenta principal sigue sin duplicarse', reimp.nuevos === 0, JSON.stringify(reimp));
const banco2 = despachar_({accion: 'banco', token: sesiones.fernando.token});
comprobar('el mismo importe en dos cuentas no se toma por repetido',
  banco2.movimientos.filter(m => num_(m.importe) === 10000).length === 2);
comprobar('cada cuenta trae su saldo', banco2.cuentas.length === 2 &&
  banco2.cuentas.some(c => c.cuenta === 'Sabadell' && num_(c.saldo) === 9949.7),
  JSON.stringify(banco2.cuentas));
comprobar('la tesorería suma las dos cuentas', num_(banco2.saldo) === redondear_(20553.4 + 9949.7, 2),
  banco2.saldo);
/* Un abono que viene de la propia empresa es un traspaso, no un cobro de
   cliente: si cuenta como cobro, los ingresos salen inflados. */
const abonoPropio = banco2.movimientos.filter(m => /ABONO TRANSFERENCIA DE ZERO/.test(m.concepto))[0];
comprobar('un abono de la propia empresa no es un cobro de cliente',
  abonoPropio && abonoPropio.categoria === 'traspaso', abonoPropio && abonoPropio.categoria);
const ivaSab = banco2.movimientos.filter(m => /IVA DECLARACI/.test(m.concepto))[0];
comprobar('el IVA pagado se reconoce como impuesto', ivaSab && ivaSab.categoria === 'impuestos',
  ivaSab && ivaSab.categoria);
comprobar('el coste de estructura deja fuera material e impuestos',
  banco.estructura_real > 0, banco.estructura_real);
const bancoComercial = despachar_({accion: 'banco', token: sesiones.nando.token});
comprobar('un comercial no ve el banco', bancoComercial.ok === false);

const movBanco = banco.movimientos.filter(m => m.concepto === 'PAGO FACTURA 2601')[0];
const gastoBanco = despachar_({accion: 'gastoDesdeBanco', token: sesiones.fernando.token,
  id: movBanco.id, operacion_id: op.operacion.id, categoria: 'material_fv', proveedor: 'Proveedor'});
comprobar('una salida se convierte en gasto de la instalación', gastoBanco.ok === true, gastoBanco.error);
comprobar('el gasto nace pagado', gastoBanco.gasto.estado_pago === 'pagado');

console.log('\n== Adjudicar captaciones al comercial ==');
const capNueva = despachar_({accion: 'guardarCaptacion', token: sesiones.sandra.token,
  captacion: {fecha: hoyISO_(), hora_cita: '18:00', estado_cita: 'confirmada',
    tecnologia: 'AEROTERMIA', interes: 8,
    cliente: {nombre: 'Familia Sin Adjudicar', telefono: '600999888',
              direccion: 'Calle de Prueba 7', municipio: 'Getafe', gasto_luz_mes: 90}}});
comprobar('la captadora crea la ficha sin comercial', capNueva.ok === true, capNueva.error);
const idCliNuevo = capNueva.captacion.cliente_id;
const veNandoAntes = despachar_({accion: 'datos', token: sesiones.nando.token})
  .clientes.some(c => String(c.id) === String(idCliNuevo));
comprobar('sin adjudicar, ningún comercial la ve', veNandoAntes === false);
const veRoberAntes = despachar_({accion: 'datos', token: sesiones.rober.token})
  .clientes.some(c => String(c.id) === String(idCliNuevo));
comprobar('tampoco el otro comercial', veRoberAntes === false);
comprobar('la captadora sí la ve',
  despachar_({accion: 'datos', token: sesiones.sandra.token})
    .clientes.some(c => String(c.id) === String(idCliNuevo)));

const adjudica = despachar_({accion: 'guardarCaptacion', token: sesiones.sandra.token,
  captacion: {id: capNueva.captacion.id, cliente_id: idCliNuevo,
    comercial_id: sesiones.nando.usuario.id, fecha: sumarDias_(hoyISO_(), 2)}});
comprobar('la captadora la adjudica al comercial que quiere', adjudica.ok === true, adjudica.error);
comprobar('el comercial adjudicado ya la ve',
  despachar_({accion: 'datos', token: sesiones.nando.token})
    .clientes.some(c => String(c.id) === String(idCliNuevo)));
comprobar('el otro comercial sigue sin verla',
  despachar_({accion: 'datos', token: sesiones.rober.token})
    .clientes.every(c => String(c.id) !== String(idCliNuevo)));
const cliAdjudicado = leer_('CLIENTES').filter(c => String(c.id) === String(idCliNuevo))[0];
comprobar('la visita queda como próxima acción del cliente',
  txt_(cliAdjudicado.proxima_fecha) === sumarDias_(hoyISO_(), 2), cliAdjudicado.proxima_fecha);

const reasigna = despachar_({accion: 'guardarCaptacion', token: sesiones.sandra.token,
  captacion: {id: capNueva.captacion.id, cliente_id: idCliNuevo,
    comercial_id: sesiones.rober.usuario.id}});
comprobar('se puede cambiar de comercial', reasigna.ok === true);
comprobar('el nuevo comercial la ve',
  despachar_({accion: 'datos', token: sesiones.rober.token})
    .clientes.some(c => String(c.id) === String(idCliNuevo)));
comprobar('el anterior deja de verla',
  despachar_({accion: 'datos', token: sesiones.nando.token})
    .clientes.every(c => String(c.id) !== String(idCliNuevo)));
const adjudicaComercial = despachar_({accion: 'guardarCaptacion', token: sesiones.nando.token,
  captacion: {id: capNueva.captacion.id, cliente_id: idCliNuevo,
    comercial_id: sesiones.nando.usuario.id}});
comprobar('un comercial no se adjudica captaciones ajenas', adjudicaComercial.ok === false,
  adjudicaComercial.error);

console.log('\n== Resumen semanal por correo ==');
/* De fábrica «resumen_a» lleva todo a una sola dirección, para rodar el
   envío sin molestar al equipo. Primero se comprueba eso. */
const envioUnico = resumenSemanal();
const correosUnicos = correosEnviados();
comprobar('con «resumen_a» puesto, todo va a esa dirección',
  correosUnicos.length === 7 && correosUnicos.every(c => c.to === 'fernandogarcia@zerowattios.com'),
  correosUnicos.map(c => c.to).join(','));
comprobar('el asunto dice de quién es cada resumen',
  correosUnicos.every(c => /· \w/.test(c.subject)), correosUnicos[0].subject);

/* Y ahora, con el campo vacío, cada uno recibe el suyo. */
despachar_({accion: 'guardarConfig', token: sesiones.fernando.token, config: {resumen_a: ''}});
vaciarCorreos();
const envio = resumenSemanal();
comprobar('se envía a todo el equipo', envio.enviados === 7, JSON.stringify(envio));
const correos = correosEnviados();
comprobar('cada correo va a su dirección',
  correos.every(c => /@/.test(c.to)), correos.map(c => c.to).join(','));
comprobar('los correos llevan el asunto de la semana',
  correos.every(c => /Tu semana en ZERO WATTIOS/.test(c.subject)), correos[0].subject);
const correoRober = correos.find(c => c.to === 'robertopaulino@zerowattios.com');
comprobar('el correo del comercial habla de sus ventas y su objetivo',
  /Ventas/.test(correoRober.htmlBody) && /Objetivo del periodo/.test(correoRober.htmlBody));
comprobar('el comercial no recibe las cuentas de la empresa',
  !/Margen del año|Beneficio neto/.test(correoRober.htmlBody));
const correoSandra = correos.find(c => c.to === 'sandrabono@zerowattios.com');
comprobar('el de la captadora habla de fichas y puertas',
  /Fichas/.test(correoSandra.htmlBody) && /Puertas/.test(correoSandra.htmlBody));
comprobar('el de la captadora avisa de fichas sin adjudicar',
  /adjudicar/i.test(correoSandra.htmlBody));
const correoRuben = correos.find(c => c.to === 'rubenleon@zerowattios.com');
comprobar('el de dirección trae las cuentas de la casa',
  /Margen del año/.test(correoRuben.htmlBody) && /Pendiente de cobro/.test(correoRuben.htmlBody));
comprobar('el de dirección resume a cada persona',
  /Cómo ha ido cada uno/.test(correoRuben.htmlBody));
comprobar('todos terminan con una frase',
  correos.every(c => /b4fa1e;border-radius:10px/.test(c.htmlBody)));
comprobar('la frase no es la misma para todos',
  new Set(correos.map(c => (c.htmlBody.match(/font-style:italic">([^<]+)</) || [])[1])).size > 1);
comprobar('los correos iniciales son los de la empresa',
  leer_('USUARIOS').filter(u => u.usuario === 'rober')[0].email === 'robertopaulino@zerowattios.com');

/* ---------------------------------------------------------------------------
   Las sesiones no pueden nacer caducadas
   ------------------------------------------------------------------------ */

console.log('\n== Sesiones ==');

const conHora = new Date(2026, 8, 22, 13, 58, 24);
comprobar('una fecha con hora conserva la hora al leerla de la hoja',
  fechaHoja_(conHora) === '2026-09-22 13:58:24', fechaHoja_(conHora));
comprobar('una fecha a secas se queda en el día',
  fechaHoja_(new Date(2026, 8, 22)) === '2026-09-22', fechaHoja_(new Date(2026, 8, 22)));

const dentroDeUnaHora = Utilities.formatDate(new Date(Date.now() + 3600000), zonaHoraria_(), 'yyyy-MM-dd HH:mm:ss');
const haceUnaHora = Utilities.formatDate(new Date(Date.now() - 3600000), zonaHoraria_(), 'yyyy-MM-dd HH:mm:ss');
comprobar('lo que caduca dentro de una hora todavía vale', caducada_(dentroDeUnaHora) === false);
comprobar('lo que caducó hace una hora ya no vale', caducada_(haceUnaHora) === true);
comprobar('sin fecha de caducidad no caduca', caducada_('') === false);
comprobar('si la hoja solo devuelve el día, vale hasta el final del día',
  caducada_(hoyISO_()) === false, hoyISO_());
comprobar('un día anterior sí está caducado',
  caducada_('2020-01-01') === true);

const antes = leer_('SESIONES').length;
const entrada = accLogin_({usuario: 'fernando', clave: claves.fernando, agente: 'prueba'});
comprobar('se puede entrar', entrada.ok === true, JSON.stringify(entrada.error || ''));
comprobar('entrar deja una sesión escrita', leer_('SESIONES').length === antes + 1);
comprobar('la sesión recién creada sirve para la siguiente petición',
  !!sesion_(entrada.token), 'token no reconocido');

console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + pruebas : 'Todo correcto: ' + pruebas + ' comprobaciones'));
process.exit(fallos ? 1 : 0);
