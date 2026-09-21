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

console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + pruebas : 'Todo correcto: ' + pruebas + ' comprobaciones'));
process.exit(fallos ? 1 : 0);
