/* Prueba de humo del backend: instala, carga datos, entra con cada rol y
   comprueba que cada uno ve exactamente lo que le toca. */
const MOCK = require('./mock.js');
function PROPIEDADES_LOG_BORRAR() { delete MOCK.PROPIEDADES.LOG_CABECERA; global._cabLog = null; }

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
/* Entrar son dos pasos desde un equipo nuevo: usuario y clave, y después
   el código que llega al correo. Cada usuario de la prueba usa siempre la
   misma huella de equipo, así que solo pasa por el código la primera vez. */
const equipos = {};
function entrar(usuario) {
  const equipo = equipos[usuario] || (equipos[usuario] = 'equipo-de-' + usuario);
  let r = despachar_({accion: 'login', usuario: usuario, clave: claves[usuario],
                      equipo: equipo, agente: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130'});
  if (!r.ok && r.requiere_codigo) {
    const correo = correosEnviados().slice(-1)[0] || {};
    const codigo = (String(correo.subject || '').match(/(\d{6})/) || [])[1];
    if (!codigo) throw new Error('No ha llegado el código de ' + usuario);
    r = despachar_({accion: 'loginCodigo', pendiente: r.pendiente, codigo: codigo, equipo: equipo});
  }
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
/* Nando abre una segunda sesión (otro equipo) antes de cambiar la clave,
   para ver que al cambiarla se cierra esa y sobrevive desde la que cambia. */
const otraDeNando = accLogin_({usuario: 'nando', clave: claves.nando,
  equipo: equipos.nando, agente: 'prueba'}).token;
const cambio = despachar_({accion: 'cambiarClave', token: sesiones.nando.token,
  actual: claves.nando, nueva: 'nuevaclave2026'});
comprobar('cada uno cambia su clave', cambio.ok === true, cambio.error);
comprobar('la clave vieja ya no vale',
  despachar_({accion: 'login', usuario: 'nando', clave: claves.nando,
              equipo: equipos.nando}).ok === false);
comprobar('la nueva sí, y desde su equipo de siempre sin pedir código',
  despachar_({accion: 'login', usuario: 'nando', clave: 'nuevaclave2026',
              equipo: equipos.nando}).ok === true);
/* Cambiar la clave echa fuera a quien estuviera dentro con la anterior,
   menos a quien la está cambiando, que si no se quedaría en la calle. */
comprobar('cambiar la clave cierra las otras sesiones',
  sesion_(otraDeNando) === null, 'la otra sesión de nando sigue viva');
comprobar('pero no la de quien la cambia',
  !!sesion_(sesiones.nando.token), 'ha echado fuera a quien cambiaba la clave');
comprobar('y lo deja apuntado', cambio.sesiones_cerradas === 1, cambio.sesiones_cerradas);
claves.nando = 'nuevaclave2026';

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
const exacta = despachar_({accion: 'guardarNomina', token: sesiones.fernando.token, nomina: {
  id: subida.nomina.id, exacto: true, bruto: 1641.67, dietas: 250, comisiones: 0, bruto_total: 1891.67,
  irpf_pct: 1.22, irpf: 20.03, ss: 106.71, neto: 1764.93,
  detalle: {ss_empresa: 517.94, coste_empresa: 2409.61, especie: 0, embargo: 0}}});
comprobar('las cifras de la gestoría se guardan tal cual', exacta.ok === true &&
  Number(exacta.nomina.neto) === 1764.93 && Number(exacta.nomina.irpf) === 20.03 &&
  Number(exacta.nomina.bruto_total) === 1891.67, exacta.error || exacta.nomina);
comprobar('el detalle guarda el coste para la empresa',
  JSON.parse(exacta.nomina.detalle).coste_empresa === 2409.61);
const exactaComercial = despachar_({accion: 'guardarNomina', token: sesiones.nando.token,
  nomina: {id: subida.nomina.id, exacto: true, neto: 1}});
comprobar('un comercial no toca las cifras', exactaComercial.ok === false);
/* La hoja de verdad convierte «2026-09» en fecha: el mes sale siempre aaaa-mm. */
comprobar('el mes se normaliza aunque la hoja lo guarde como fecha',
  periodoNomina_(new Date(2026, 3, 1, 12)) === '2026-04' && periodoNomina_('2026-04-01') === '2026-04');

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
vaciarCorreos();                 // los códigos de entrada no son resúmenes
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
const entrada = accLogin_({usuario: 'fernando', clave: claves.fernando, agente: 'prueba',
                           equipo: equipos.fernando});
comprobar('se puede entrar', entrada.ok === true, JSON.stringify(entrada.error || ''));
comprobar('entrar deja una sesión escrita', leer_('SESIONES').length === antes + 1);
comprobar('la sesión recién creada sirve para la siguiente petición',
  !!sesion_(entrada.token), 'token no reconocido');

/* ---------- seguridad de la entrada ---------- */

/* El hash lleva miles de vueltas, y las claves guardadas a la antigua se
   reescriben solas la primera vez que su dueño entra. */
comprobar('una clave nueva se guarda con muchas vueltas',
  num_(leer_('USUARIOS').filter(x => x.usuario === 'nando')[0].vueltas) === VUELTAS_CLAVE);
comprobar('el mismo texto con más vueltas da otro hash',
  hash_('abc', 'sal', 1) !== hash_('abc', 'sal', 50));
comprobar('y con las mismas vueltas, siempre el mismo',
  hash_('abc', 'sal', 50) === hash_('abc', 'sal', 50));

/* Se simula una clave vieja, de una sola pasada, y se mira que al entrar
   se convierta sola sin que su dueño tenga que hacer nada. */
const vieja = leer_('USUARIOS').filter(x => x.usuario === 'sandra')[0];
const salVieja = sal_();
actualizar_('USUARIOS', vieja.id, {salt: salVieja, hash: hash_('clavevieja1', salVieja, 1), vueltas: ''});
const entraVieja = accLogin_({usuario: 'sandra', clave: 'clavevieja1', equipo: equipos.sandra});
comprobar('con la clave guardada a la antigua se entra igual', entraVieja.ok === true, entraVieja.error);
const trasEntrar = leer_('USUARIOS').filter(x => x.usuario === 'sandra')[0];
comprobar('y al entrar se reescribe reforzada',
  num_(trasEntrar.vueltas) === VUELTAS_CLAVE && txt_(trasEntrar.hash) !== hash_('clavevieja1', salVieja, 1));
comprobar('la clave sigue siendo la misma para su dueño',
  accLogin_({usuario: 'sandra', clave: 'clavevieja1', equipo: equipos.sandra}).ok === true);
claves.sandra = 'clavevieja1';

/* Cinco fallos seguidos cierran la puerta un rato. */
const fallar = () => accLogin_({accion: 'login', usuario: 'abraham', clave: 'noesesa', equipo: equipos.abraham});
for (let i = 0; i < FALLOS_PARA_BLOQUEO - 1; i++) fallar();
comprobar('antes del tope todavía se puede intentar',
  /incorrectos/.test(fallar().error) === true);
const bloqueado = accLogin_({usuario: 'abraham', clave: claves.abraham, equipo: equipos.abraham});
comprobar('al llegar al tope se bloquea aunque la clave sea buena',
  bloqueado.ok === false && /Demasiados intentos/.test(bloqueado.error), bloqueado.error);
comprobar('y queda apuntado en el registro',
  leer_('LOG').some(l => txt_(l.accion) === 'usuario_bloqueado'));
/* Se le quita el bloqueo a mano para seguir con las pruebas. */
const abr = leer_('USUARIOS').filter(x => x.usuario === 'abraham')[0];
actualizar_('USUARIOS', abr.id, {bloqueado_hasta: '', intentos: 0, bloqueos: 0});
comprobar('quitado el bloqueo, vuelve a entrar',
  accLogin_({usuario: 'abraham', clave: claves.abraham, equipo: equipos.abraham}).ok === true);

/* Una sesión parada demasiado tiempo deja de valer. */
const dormida = accLogin_({usuario: 'rober', clave: claves.rober, equipo: equipos.rober}).token;
comprobar('recién abierta, la sesión vale', !!sesion_(dormida));
const filaDormida = filaDeSesion_(dormida);
filaDormida.hoja.getRange(filaDormida.fila, cabeceras_('SESIONES').indexOf('ultimo_uso') + 1)
  .setValue(dentroDe_(-(MINUTOS_INACTIVIDAD + 5)));
comprobar('parada más de la cuenta, ya no', sesion_(dormida) === null);
comprobar('y se borra sola de la tabla', filaDeSesion_(dormida) === null);

/* El código del segundo paso: caduca, se equivoca y se agota. */
vaciarCorreos();
const nuevoEquipo = accLogin_({usuario: 'ruben', clave: claves.ruben, equipo: 'portatil-de-casa',
                               agente: 'Mozilla/5.0 (Macintosh; Mac OS X) Safari/605'});
comprobar('desde un equipo nuevo se pide código',
  nuevoEquipo.ok === false && nuevoEquipo.requiere_codigo === true, nuevoEquipo.error);
comprobar('el código llega al correo de esa persona',
  (correosEnviados()[0] || {}).to === 'rubenleon@zerowattios.com', (correosEnviados()[0] || {}).to);
comprobar('y el correo se enseña tapado',
  /^r•••n@zerowattios\.com$/.test(nuevoEquipo.correo), nuevoEquipo.correo);
const codigoBueno = (String((correosEnviados()[0] || {}).subject || '').match(/(\d{6})/) || [])[1];
comprobar('un código equivocado no entra',
  despachar_({accion: 'loginCodigo', pendiente: nuevoEquipo.pendiente, codigo: '000000'}).ok === false);
comprobar('sin el pendiente correcto tampoco',
  despachar_({accion: 'loginCodigo', pendiente: 'inventado', codigo: codigoBueno}).ok === false);
const conCodigo = despachar_({accion: 'loginCodigo', pendiente: nuevoEquipo.pendiente, codigo: codigoBueno});
comprobar('con el código bueno se entra', conCodigo.ok === true, conCodigo.error);
comprobar('y el equipo queda de confianza',
  accLogin_({usuario: 'ruben', clave: claves.ruben, equipo: 'portatil-de-casa'}).ok === true);
comprobar('el mismo código no sirve dos veces',
  despachar_({accion: 'loginCodigo', pendiente: nuevoEquipo.pendiente, codigo: codigoBueno}).ok === false);

/* El equipo se puede quitar desde Mi perfil, y entonces vuelve a pedir código. */
const mios = despachar_({accion: 'misEquipos', token: conCodigo.token, equipo: 'portatil-de-casa'});
comprobar('los equipos de confianza se listan', mios.ok === true && mios.equipos.length >= 1);
comprobar('y se reconoce desde cuál se está mirando',
  mios.equipos.some(e => e.este === true));
comprobar('con el navegador en cristiano',
  mios.equipos.some(e => /Safari en Mac/.test(e.agente)), mios.equipos.map(e => e.agente).join(' | '));
comprobar('un equipo ajeno no se puede quitar',
  despachar_({accion: 'olvidarEquipo', token: sesiones.rober.token,
              id: mios.equipos[0].id}).ok === false);
comprobar('el propio sí',
  despachar_({accion: 'olvidarEquipo', token: conCodigo.token, id: mios.equipos[0].id}).ok === true);
comprobar('y al quitarlo vuelve a pedir código',
  accLogin_({usuario: 'ruben', clave: claves.ruben, equipo: 'portatil-de-casa'}).requiere_codigo === true);

/* Resetear la clave de alguien le cierra todo y le olvida los equipos. */
const victima = leer_('USUARIOS').filter(x => x.usuario === 'rober')[0];
const suSesion = accLogin_({usuario: 'rober', clave: claves.rober, equipo: equipos.rober}).token;
const reseteo = despachar_({accion: 'resetClave', token: sesiones.superadmin.token, id: victima.id});
comprobar('resetear la clave cierra sus sesiones',
  reseteo.ok === true && sesion_(suSesion) === null);
comprobar('y le olvida los equipos de confianza',
  !leer_('EQUIPOS').some(e => String(e.usuario_id) === String(victima.id)));
claves.rober = reseteo.clave;
delete equipos.rober;
sesiones.rober = entrar('rober');

/* La válvula de escape: con «dos_pasos» en no, se entra sin código. */
despachar_({accion: 'guardarConfig', token: sesiones.superadmin.token, config: {dos_pasos: 'no'}});
comprobar('apagando el doble factor se entra desde cualquier equipo',
  accLogin_({usuario: 'ruben', clave: claves.ruben, equipo: 'un-equipo-cualquiera'}).ok === true);
despachar_({accion: 'guardarConfig', token: sesiones.superadmin.token, config: {dos_pasos: 'si'}});
comprobar('y volviéndolo a encender, otra vez pide código',
  accLogin_({usuario: 'ruben', clave: claves.ruben, equipo: 'otro-equipo-mas'}).requiere_codigo === true);

/* ---------------------------------------------------------------------------
   El directorio histórico y las puertas
   ------------------------------------------------------------------------ */

console.log('\n== Carpeta del cliente y proyecto ==');
{   /* en su propio bloque: los nombres no chocan con el resto del fichero */
  const clipro = despachar_({accion: 'guardarCliente', token: sesiones.nando.token,
    cliente: {nombre: 'Cliente con proyecto', direccion: 'Calle del Proyecto 3',
              municipio: 'Las Rozas de Madrid', telefono: '600111222'}}).cliente;

  const sinNada = despachar_({accion: 'proyecto', token: sesiones.nando.token, cliente_id: clipro.id});
  comprobar('la ficha de proyecto nace en blanco',
    sinNada.ok === true && sinNada.proyecto.estado === 'borrador' && sinNada.archivos.length === 0,
    sinNada.error || sinNada.proyecto);

  const ajenoPro = despachar_({accion: 'proyecto', token: sesiones.rober.token, cliente_id: clipro.id});
  comprobar('otro comercial no ve esa carpeta', ajenoPro.ok === false, ajenoPro.error);

  const descPro = despachar_({accion: 'guardarProyecto', token: sesiones.nando.token,
    cliente_id: clipro.id,
    descripcion: 'Chalet de 220 m2, caldera de gasoleo, cubierta a dos aguas orientada al sur.'});
  comprobar('se guarda la descripcion', descPro.ok === true, descPro.error);
  comprobar('sin fotos todavia no se pide', descPro.proyecto.estado === 'borrador', descPro.proyecto.estado);

  const fotoPro = despachar_({accion: 'subirArchivo', token: sesiones.nando.token,
    cliente_id: clipro.id, clase: 'foto', nombre: 'fachada.jpg', mime: 'image/jpeg',
    datos: Utilities.base64Encode([10, 20, 30, 40]), miniatura: 'data:image/jpeg;base64,AAAA'});
  comprobar('el comercial sube una foto', fotoPro.ok === true, fotoPro.error);
  comprobar('con descripcion y foto el proyecto se pide solo',
    fotoPro.proyecto.estado === 'pedido', fotoPro.proyecto.estado);
  comprobar('queda apuntado quien lo pide', txt_(fotoPro.proyecto.pedido_por) === sesiones.nando.usuario.id);

  const pdfPro = despachar_({accion: 'subirArchivo', token: sesiones.nando.token,
    cliente_id: clipro.id, clase: 'documento', nombre: 'factura-luz.pdf', mime: 'application/pdf',
    datos: Utilities.base64Encode([1, 2, 3])});
  comprobar('tambien sube documentos', pdfPro.ok === true, pdfPro.error);

  const bajaFoto = despachar_({accion: 'descargarArchivo', token: sesiones.nando.token, id: fotoPro.archivo.id});
  comprobar('se descarga lo que subio', bajaFoto.ok === true && bajaFoto.nombre === 'fachada.jpg', bajaFoto.error);
  const bajaAjena = despachar_({accion: 'descargarArchivo', token: sesiones.rober.token, id: fotoPro.archivo.id});
  comprobar('y nadie de fuera se lo descarga', bajaAjena.ok === false, bajaAjena.error);

  const entregaComercial = despachar_({accion: 'entregarProyecto', token: sesiones.nando.token,
    cliente_id: clipro.id, datos: Utilities.base64Encode([9, 9]), nombre: 'falso.pdf'});
  comprobar('un comercial no puede entregar el proyecto', entregaComercial.ok === false,
    entregaComercial.error);

  const colaPro = despachar_({accion: 'proyectosPendientes', token: sesiones.fernando.token});
  comprobar('la direccion ve la cola', colaPro.ok === true && colaPro.proyectos.length >= 1, colaPro.error);
  const enCola = (colaPro.proyectos || []).filter(x => x.cliente_id === clipro.id)[0];
  comprobar('la cola trae el recuento de archivos',
    !!enCola && enCola.fotos === 1 && enCola.documentos === 1, enCola);
  comprobar('la cola dice de quien es el cliente',
    !!enCola && enCola.comercial === sesiones.nando.usuario.nombre, enCola && enCola.comercial);
  const colaComercial = despachar_({accion: 'proyectosPendientes', token: sesiones.nando.token});
  comprobar('el comercial ve su cola', colaComercial.ok === true &&
    colaComercial.proyectos.some(x => x.cliente_id === clipro.id), colaComercial.error);
  comprobar('y en su cola no hay clientes de otro comercial',
    colaComercial.proyectos.every(x => x.comercial === sesiones.nando.usuario.nombre),
    colaComercial.proyectos.map(x => x.comercial));
  const colaRober = despachar_({accion: 'proyectosPendientes', token: sesiones.rober.token});
  comprobar('otro comercial no ve ese proyecto',
    colaRober.ok === true && !colaRober.proyectos.some(x => x.cliente_id === clipro.id));
  const colaCaptador = despachar_({accion: 'proyectosPendientes', token: sesiones.sandra.token});
  comprobar('un captador no ve ninguna cola',
    colaCaptador.ok === true && colaCaptador.proyectos.length === 0, colaCaptador.proyectos);

  const entregaPro = despachar_({accion: 'entregarProyecto', token: sesiones.fernando.token,
    cliente_id: clipro.id, datos: Utilities.base64Encode([5, 5, 5]),
    nombre: 'Proyecto_Cliente_con_proyecto.pdf', mime: 'application/pdf'});
  comprobar('la direccion entrega el PDF', entregaPro.ok === true, entregaPro.error);
  comprobar('el proyecto queda entregado', entregaPro.proyecto.estado === 'entregado',
    entregaPro.proyecto.estado);

  const listos = despachar_({accion: 'proyectosPendientes', token: sesiones.nando.token, estado: 'entregado'});
  const esteListo = (listos.proyectos || []).filter(x => x.cliente_id === clipro.id)[0];
  comprobar('el proyecto entregado sale en los listos para enviar', !!esteListo, listos.error);
  comprobar('y trae el PDF para descargar',
    !!esteListo && !!esteListo.archivo_id && /\.pdf$/i.test(esteListo.archivo_nombre || ''),
    esteListo && esteListo.archivo_nombre);
  comprobar('se descarga el PDF desde esa lista',
    despachar_({accion: 'descargarArchivo', token: sesiones.nando.token,
                id: esteListo ? esteListo.archivo_id : ''}).ok === true);

  const verFinal = despachar_({accion: 'proyecto', token: sesiones.nando.token, cliente_id: clipro.id});
  const elProyecto = verFinal.archivos.filter(a => a.clase === 'proyecto');
  comprobar('el comercial ve el PDF del proyecto en su ficha', elProyecto.length === 1, verFinal.archivos);
  comprobar('y se lo puede descargar',
    despachar_({accion: 'descargarArchivo', token: sesiones.nando.token, id: elProyecto[0].id}).ok === true);
  comprobar('los archivos no viajan con el contenido dentro',
    verFinal.archivos.every(a => a.datos === undefined));

  /* --- cuando al ingeniero le falta algo para poder sacarlo --- */
  vaciarCorreos();
  const sinQue = despachar_({accion: 'estadoProyecto', token: sesiones.fernando.token,
    cliente_id: clipro.id, estado: 'faltan_datos'});
  comprobar('no se puede parar un proyecto sin decir qué falta', sinQue.ok === false, sinQue.error);

  const parado = despachar_({accion: 'estadoProyecto', token: sesiones.fernando.token,
    cliente_id: clipro.id, estado: 'faltan_datos',
    faltan: ['Foto del cuadro eléctrico más clara', 'Factura de la luz del último año']});
  comprobar('la dirección lo para diciendo qué falta', parado.ok === true &&
    parado.proyecto.estado === 'faltan_datos' &&
    /cuadro eléctrico.*Factura/.test(parado.proyecto.faltan), parado);
  comprobar('y le llega un aviso al comercial del cliente',
    (correosEnviados()[0] || {}).to.indexOf('nandosalamanca@zerowattios.com') >= 0 ||
    /nando/i.test((correosEnviados()[0] || {}).to || ''), (correosEnviados()[0] || {}).to);

  const esperando = despachar_({accion: 'proyectosPendientes', token: sesiones.nando.token,
    estado: 'faltan_datos'});
  const esteEspera = (esperando.proyectos || []).filter(x => x.cliente_id === clipro.id)[0];
  comprobar('el comercial lo ve en su panel con lo que falta',
    !!esteEspera && /Foto del cuadro/.test(esteEspera.faltan), esperando.proyectos);
  comprobar('y sabe desde cuándo está parado', !!esteEspera && !!esteEspera.modificado);
  comprobar('la dirección lo ve también',
    (despachar_({accion: 'proyectosPendientes', token: sesiones.fernando.token,
                 estado: 'faltan_datos'}).proyectos || [])
      .some(x => x.cliente_id === clipro.id));
  comprobar('otro comercial no lo ve',
    (despachar_({accion: 'proyectosPendientes', token: sesiones.rober.token,
                 estado: 'faltan_datos'}).proyectos || []).length === 0);
  comprobar('un captador tampoco',
    (despachar_({accion: 'proyectosPendientes', token: sesiones.sandra.token,
                 estado: 'faltan_datos'}).proyectos || []).length === 0);
  comprobar('mientras está parado no estorba en la cola del ingeniero',
    !(despachar_({accion: 'proyectosPendientes', token: sesiones.fernando.token}).proyectos || [])
      .some(x => x.cliente_id === clipro.id));

  /* En cuanto el comercial sube lo que falta, vuelve solo a la cola. */
  vaciarCorreos();
  const alSubir = despachar_({accion: 'subirArchivo', token: sesiones.nando.token,
    cliente_id: clipro.id, clase: 'foto', nombre: 'cuadro-bien.jpg', mime: 'image/jpeg',
    datos: Utilities.base64Encode([7, 7, 7])});
  comprobar('el comercial sube lo que faltaba', alSubir.ok === true, alSubir.error);
  const yaPedido = despachar_({accion: 'proyecto', token: sesiones.nando.token, cliente_id: clipro.id});
  comprobar('y el proyecto vuelve solo a la cola',
    yaPedido.proyecto.estado === 'pedido', yaPedido.proyecto.estado);
  comprobar('y se borra la lista de lo que faltaba',
    txt_(yaPedido.proyecto.faltan) === '', yaPedido.proyecto.faltan);
  comprobar('ya no aparece entre los que esperan datos',
    (despachar_({accion: 'proyectosPendientes', token: sesiones.nando.token,
                 estado: 'faltan_datos'}).proyectos || []).length === 0);

  comprobar('un comercial no puede parar un proyecto él solo',
    despachar_({accion: 'estadoProyecto', token: sesiones.nando.token, cliente_id: clipro.id,
      estado: 'faltan_datos', faltan: 'lo que sea'}).ok === false);
  comprobar('ni inventarse un estado',
    despachar_({accion: 'estadoProyecto', token: sesiones.fernando.token, cliente_id: clipro.id,
      estado: 'a medio hacer'}).ok === false);

  /* Se vuelve a dejar entregado, que es como estaba. */
  despachar_({accion: 'estadoProyecto', token: sesiones.fernando.token,
    cliente_id: clipro.id, estado: 'entregado'});

  const borraAjeno = despachar_({accion: 'borrarArchivo', token: sesiones.rober.token, id: pdfPro.archivo.id});
  comprobar('otro comercial no borra archivos ajenos', borraAjeno.ok === false, borraAjeno.error);
  const borraSuyo = despachar_({accion: 'borrarArchivo', token: sesiones.nando.token, id: pdfPro.archivo.id});
  comprobar('quien lo subio si lo borra', borraSuyo.ok === true, borraSuyo.error);
  comprobar('el proyecto no se puede quitar desde el comercial',
    despachar_({accion: 'borrarArchivo', token: sesiones.nando.token, id: elProyecto[0].id}).ok === false);
}

console.log('\n== Directorio y puertas ==');

comprobar('se crean las tres pestañas nuevas',
  ['DIRECTORIO', 'DIR_VISITAS', 'PUERTAS'].every(h =>
    !!SpreadsheetApp.openById().getSheetByName(h)));

const tkDir = sesiones.fernando.token;
comprobar('fernando entra al directorio',
  despachar_({accion: 'directorio', token: tkDir}).ok === true);
comprobar('nando también',
  despachar_({accion: 'directorio', token: sesiones.nando.token}).ok === true);
comprobar('el superadmin también',
  despachar_({accion: 'directorio', token: sesiones.superadmin.token}).ok === true);
comprobar('rober no entra',
  despachar_({accion: 'directorio', token: sesiones.rober.token}).ok === false);
comprobar('sandra tampoco',
  despachar_({accion: 'puertas', token: sesiones.sandra.token}).ok === false);
comprobar('a rober no le llega ni la lista de quién puede entrar',
  !JSON.stringify(despachar_({accion: 'datos', token: sesiones.rober.token}).config || {})
    .includes('directorio_usuarios'));
comprobar('el permiso viaja con los demás al entrar',
  sesiones.fernando.permisos.directorio === true && sesiones.rober.permisos.directorio === false);

const impDir = despachar_({accion: 'importarDirectorio', token: tkDir, clientes: [
  {ref: 'CL-9001', empresa: 'Aurus', nombre: 'Prueba Uno', municipio: 'Las Rozas',
   direccion: 'Calle Falsa 1', lat: 40.49, lon: -3.87, precision: 'exacta', ultima_visita: '2026-05-02'},
  {ref: 'CL-9002', empresa: 'Zero Wattios', nombre: 'Prueba Dos', municipio: 'Pozuelo',
   direccion: 'Calle Falsa 2', ultima_visita: '2026-06-02'}]});
comprobar('entran dos fichas al directorio', impDir.altas === 2, JSON.stringify(impDir));
const reDir = despachar_({accion: 'importarDirectorio', token: tkDir, clientes: [
  {ref: 'CL-9001', empresa: 'Aurus', nombre: 'Prueba Uno Corregido', municipio: 'Las Rozas'}]});
comprobar('volver a cargar el mismo no duplica, actualiza',
  reDir.altas === 0 && reDir.actualizados === 1, JSON.stringify(reDir));

const dirLista = despachar_({accion: 'directorio', token: tkDir});
comprobar('el directorio los devuelve', dirLista.total === 2, dirLista.total);
comprobar('la corrección se ve',
  dirLista.clientes.some(c => c.nombre === 'Prueba Uno Corregido'));
comprobar('el que tiene coordenada sale para el mapa', dirLista.puntos.length === 1, dirLista.puntos.length);
comprobar('se buscan por texto',
  despachar_({accion: 'directorio', token: tkDir, buscar: 'pozuelo'}).encontrados === 1);
comprobar('se filtran por empresa',
  despachar_({accion: 'directorio', token: tkDir, empresa: 'Aurus'}).encontrados === 1);

/* Un cliente con la coordenada de un viaje entra igual, pero sin punto: la
   ficha vale, el mapa no se va a la otra punta del mundo. */
despachar_({accion: 'importarDirectorio', token: tkDir, clientes: [
  {ref: 'CL-9003', empresa: 'Aurus', nombre: 'Prueba Tres', municipio: 'Shanghai',
   direccion: 'Jin Men Lu 20', lat: 31.2293, lon: 121.4867, precision: 'exacta'}]});
const dirConRaro = despachar_({accion: 'directorio', token: tkDir});
comprobar('el cliente con coordenada de fuera entra igual', dirConRaro.total === 3, dirConRaro.total);
comprobar('pero no se pinta en el mapa', dirConRaro.puntos.length === 1, dirConRaro.puntos.length);
comprobar('y se le ha quitado la coordenada',
  dirConRaro.clientes.filter(c => c.ref === 'CL-9003')
    .every(c => txt_(c.lat) === '' && txt_(c.lon) === ''));
borrar_('DIRECTORIO', leer_('DIRECTORIO').filter(c => txt_(c.ref) === 'CL-9003')[0].id);

despachar_({accion: 'importarDirVisitas', token: tkDir, visitas: [
  {ref: 'CL-9001', cliente: 'Prueba Uno', fecha: '2026-05-02', hora: '10:00', comercial: 'Rober'}]});
const fichaDir = despachar_({accion: 'directorioFicha', token: tkDir, ref: 'CL-9001'});
comprobar('la ficha trae sus visitas', fichaDir.ok === true && fichaDir.visitas.length === 1);

const hoyP = hoyISO_();
const pu = despachar_({accion: 'importarPuertas', token: tkDir, puertas: [
  {nombre: 'Puerta vieja', direccion: 'Calle Vieja 1', zona: 'Las Rozas',
   fecha: '2026-02-10', hora: '11:00', lat: 40.492345, lon: -3.873456, lista: 'Saved places'},
  {nombre: 'Puerta de hoy', direccion: 'Calle Nueva 2', zona: 'Pozuelo',
   fecha: hoyP, hora: '09:30', lat: 40.435678, lon: -3.812345, lista: 'Favoritos'}]});
comprobar('entran las dos puertas', pu.nuevas === 2, JSON.stringify(pu));
const pu2 = despachar_({accion: 'importarPuertas', token: tkDir, puertas: [
  {nombre: 'Puerta vieja', direccion: 'Calle Vieja 1', zona: 'Las Rozas',
   fecha: '2026-02-10', hora: '11:00', lat: 40.492345, lon: -3.873456, lista: 'Saved places'},
  {nombre: 'Puerta de mañana', direccion: 'Calle Nueva 3', zona: 'Pozuelo',
   fecha: hoyP, hora: '12:00', lat: 40.436789, lon: -3.813456, lista: 'Favoritos'}]});
comprobar('la repetida no entra dos veces',
  pu2.nuevas === 1 && pu2.repetidas === 1, JSON.stringify(pu2));

const pts = despachar_({accion: 'puertas', token: tkDir});
comprobar('hay tres puertas en total', pts.total === 3, pts.total);
comprobar('cuenta bien las nuevas de esta semana', pts.semana.nuevas === 2, JSON.stringify(pts.semana));
comprobar('marca cuáles son las nuevas',
  pts.puertas.filter(x => x.nueva === 'si').length === 2);
comprobar('la vieja no se cuela como nueva',
  pts.puertas.filter(x => x.nombre === 'Puerta vieja')[0].nueva === 'no');
comprobar('agrupa por zonas', pts.zonas.length === 2, JSON.stringify(pts.zonas));

/* Una puerta sin fecha se carga igual, pero no se cuenta como tocada esta
   semana solo porque el Excel haya entrado hoy. */
despachar_({accion: 'importarPuertas', token: tkDir, puertas: [
  {nombre: 'Puerta sin fecha', direccion: 'Calle X 9', zona: 'Las Rozas',
   fecha: '', hora: '', lat: 40.4999, lon: -3.8999, lista: 'Saved places'}]});
const pts2 = despachar_({accion: 'puertas', token: tkDir});
comprobar('la puerta sin fecha entra', pts2.total === 4, pts2.total);
comprobar('pero no cuenta como nueva de la semana',
  pts2.semana.nuevas === 2, JSON.stringify(pts2.semana));
comprobar('y se avisa de cuántas no tienen fecha',
  pts2.semana.sin_fecha === 1, JSON.stringify(pts2.semana));
comprobar('reparte por semanas', pts.semanas.length >= 2);
comprobar('se filtran por zona',
  despachar_({accion: 'puertas', token: tkDir, zona: 'Pozuelo'}).encontradas === 2);
comprobar('todas las puertas llevan coordenada',
  pts.puertas.every(x => x.lat && x.lon));

/* Solo se trabaja en España: lo que viene de un viaje guardado en el móvil
   no entra, y si ya estaba cargado se puede sacar. */
const china = despachar_({accion: 'importarPuertas', token: tkDir, puertas: [
  {nombre: 'Pagoda Leifeng', direccion: 'Hangzhou', zona: 'Otra zona',
   fecha: '2026-03-08', hora: '12:00', lat: 30.231384, lon: 120.149706},
  {nombre: 'Puerta de Boadilla', direccion: 'Calle Z 1', zona: 'Boadilla',
   fecha: '2026-03-08', hora: '12:30', lat: 40.405, lon: -3.878}]});
comprobar('la de China no entra y la de Boadilla sí',
  china.nuevas === 1 && china.fuera_de_espana === 1, JSON.stringify(china));
comprobar('Canarias sí es España',
  despachar_({accion: 'importarPuertas', token: tkDir, puertas: [
    {nombre: 'Casa en Teguise', direccion: 'Teguise', zona: 'Teguise',
     fecha: '2026-09-13', hora: '10:00', lat: 29.0525, lon: -13.5607}]}).nuevas === 1);

/* Y si alguna se coló antes de poner la regla, se saca a mano. */
añadirFilas_('PUERTAS', [{lista: 'Quiero ir', nombre: 'Shanghai', direccion: '',
  zona: 'Otra zona', fecha: '2026-03-20', hora: '', lat: 31.2443, lon: 121.4661,
  alta_crm: hoyISO_()}]);
const antesLimpiar = leer_('PUERTAS').length;
const limpia = despachar_({accion: 'limpiarPuertasFuera', token: tkDir});
comprobar('saca la que se había colado', limpia.borradas === 1, JSON.stringify(limpia.detalle));
comprobar('y no se lleva por delante a las demás',
  leer_('PUERTAS').length === antesLimpiar - 1);
comprobar('ni toca Canarias',
  leer_('PUERTAS').some(x => txt_(x.nombre) === 'Casa en Teguise'));

/* ---------- que la facturación cuadre ---------- */

/* Esto salió de un lío real: primero se facturó el 50% y luego otra
   factura por el total en vez de por la mitad que faltaba. */
const cliCuadre = despachar_({accion: 'guardarCliente', token: sesiones.fernando.token,
  cliente: {nombre: 'Cliente del cuadre', direccion: 'Calle del Cuadre 1', municipio: 'Madrid'}}).cliente;
const opCuadre = despachar_({accion: 'guardarOperacion', token: sesiones.fernando.token, operacion: {
  cliente_id: cliCuadre.id, tipo: 'aero', estado: 'instalada', forma_pago: 'financiado',
  importe_aero: 10000, iva_pct: 21}}).operacion;
despachar_({accion: 'guardarFactura', token: sesiones.fernando.token, factura: {
  numero: 'FPRU2026-001', operacion_id: opCuadre.id, base: 4132.23, fecha_emision: hoyISO_()}});
const sinAviso = despachar_({accion: 'alertas', token: sesiones.fernando.token}).alertas;
comprobar('con una sola factura del 50% no salta nada',
  !sinAviso.some(a => a.tipo === 'sobrefacturado'));

despachar_({accion: 'guardarFactura', token: sesiones.fernando.token, factura: {
  numero: 'FPRU2026-002', operacion_id: opCuadre.id, base: 8264.46, fecha_emision: hoyISO_()}});
const conAviso = despachar_({accion: 'alertas', token: sesiones.fernando.token}).alertas;
const sobre = conAviso.filter(a => a.tipo === 'sobrefacturado' && a.operacion_id === opCuadre.id);
comprobar('pero si la segunda va por el total, salta el aviso', sobre.length === 1,
  JSON.stringify(conAviso.filter(a => a.tipo === 'sobrefacturado')).slice(0, 160));
comprobar('y dice cuánto sobra', /Sobran 5000 €/.test(sobre[0].texto), sobre[0] && sobre[0].texto);

/* Cobrar más de lo facturado también canta. */
despachar_({accion: 'guardarCobro', token: sesiones.fernando.token, cobro: {
  operacion_id: opCuadre.id, concepto: 'firma', importe: 20000, fecha_cobro: hoyISO_()}});
comprobar('cobrar por encima de lo facturado salta',
  despachar_({accion: 'alertas', token: sesiones.fernando.token}).alertas
    .some(a => a.tipo === 'cobrado_sin_factura' && a.operacion_id === opCuadre.id));

/* Un hueco en la numeración quiere decir que falta meter una factura. */
despachar_({accion: 'guardarFactura', token: sesiones.fernando.token, factura: {
  numero: 'FPRU2026-005', operacion_id: opCuadre.id, base: 100, fecha_emision: hoyISO_()}});
const huecos = despachar_({accion: 'alertas', token: sesiones.fernando.token}).alertas
  .filter(a => a.tipo === 'hueco_facturas');
comprobar('el hueco de numeración se avisa', huecos.length >= 1, JSON.stringify(huecos).slice(0, 160));
comprobar('y dice cuáles faltan',
  huecos.some(a => /FPRU2026-003/.test(a.texto) && /FPRU2026-004/.test(a.texto)),
  huecos.map(a => a.texto).join(' | ').slice(0, 200));
comprobar('el cuadre no se le enseña a quien no ve las finanzas',
  !despachar_({accion: 'alertas', token: sesiones.rober.token}).alertas
    .some(a => ['sobrefacturado','cobrado_sin_factura','hueco_facturas'].indexOf(a.tipo) >= 0));

/* Siempre lo más reciente primero, y ordenado en el servidor: el listado
   solo pinta las 600 primeras, así que si se cortara antes de ordenar
   saldrían las más viejas de la hoja. */
despachar_({accion: 'importarPuertas', token: tkDir, puertas: [
  {nombre: 'Puerta de 2024', direccion: 'Calle Vieja 9', zona: 'Las Rozas',
   fecha: '2024-01-05', hora: '09:00', lat: 40.4925, lon: -3.8735},
  {nombre: 'Puerta de ayer tarde', direccion: 'Calle Nueva 9', zona: 'Pozuelo',
   fecha: '2026-09-30', hora: '18:30', lat: 40.4357, lon: -3.8125},
  {nombre: 'Puerta de ayer mañana', direccion: 'Calle Nueva 10', zona: 'Pozuelo',
   fecha: '2026-09-30', hora: '09:15', lat: 40.4358, lon: -3.8126}]});
const porFecha = despachar_({accion: 'puertas', token: tkDir}).puertas;
const conFechaPu = porFecha.filter(x => txt_(x.fecha));
comprobar('las puertas llegan de la más nueva a la más vieja',
  conFechaPu.every((x, i) => i === 0 || txt_(conFechaPu[i - 1].fecha) >= txt_(x.fecha)),
  conFechaPu.slice(0, 4).map(x => x.fecha).join(' '));
comprobar('y dentro del mismo día manda la hora',
  porFecha.filter(x => txt_(x.fecha) === '2026-09-30').map(x => txt_(x.hora)).join(',') === '18:30,09:15',
  porFecha.filter(x => txt_(x.fecha) === '2026-09-30').map(x => txt_(x.hora)).join(','));
comprobar('la de 2024 no se cuela por delante',
  txt_(porFecha[porFecha.length - 1].fecha) === '' ||
  txt_(porFecha[conFechaPu.length - 1].fecha) === '2024-01-05',
  txt_(porFecha[conFechaPu.length - 1].fecha));
comprobar('y las que no tienen día se quedan al final',
  porFecha.slice(conFechaPu.length).every(x => !txt_(x.fecha)));

/* En el directorio manda la última visita, y entre los que no tienen
   ninguna, el que se acaba de dar de alta va por delante. */
const dirOrden = despachar_({accion: 'directorio', token: tkDir}).clientes;
const conVisita = dirOrden.filter(c => txt_(c.ultima_visita));
comprobar('el directorio sale por la última visita, de la más reciente',
  conVisita.every((c, i) => i === 0 || txt_(conVisita[i - 1].ultima_visita) >= txt_(c.ultima_visita)),
  conVisita.map(c => c.ultima_visita).join(' '));
comprobar('y los que no tienen visita van detrás',
  dirOrden.slice(conVisita.length).every(c => !txt_(c.ultima_visita)));

/* Una celda que solo lleva la hora la guarda Google como una fecha de 1899.
   Sale como hora, que es lo que es. */
comprobar('una celda de solo hora sale como hora',
  fechaHoja_(new Date(1899, 11, 30, 9, 22, 0)) === '09:22',
  fechaHoja_(new Date(1899, 11, 30, 9, 22, 0)));
comprobar('y una fecha de verdad sigue saliendo como fecha',
  fechaHoja_(new Date(2026, 9, 5)) === '2026-10-05',
  fechaHoja_(new Date(2026, 9, 5)));

/* ---------- tocar el directorio y las puertas a mano ---------- */

/* Dar de alta una ficha desde el CRM, sin esperar al Excel del lunes. */
const dirAlta = despachar_({accion: 'guardarDirectorio', token: tkDir, cliente: {
  nombre: 'Alta a mano', empresa: 'Zero Wattios', municipio: 'Boadilla del Monte',
  direccion: 'Calle Nueva 7', telefono: '600112233', lat: 40.405, lon: -3.878}});
comprobar('se da de alta una ficha a mano', alta.ok === true && !!dirAlta.cliente.id,
  JSON.stringify(alta).slice(0, 120));
comprobar('y se le pone referencia sola', /^D-\d{6}$/.test(txt_(dirAlta.cliente.ref)), dirAlta.cliente.ref);
comprobar('con la fecha de alta puesta', txt_(dirAlta.cliente.alta_crm) === hoyISO_());

comprobar('sin nombre ni dirección no entra',
  despachar_({accion: 'guardarDirectorio', token: tkDir,
    cliente: {municipio: 'Pozuelo'}}).ok === false);
comprobar('ni repitiendo una referencia que ya está',
  despachar_({accion: 'guardarDirectorio', token: tkDir,
    cliente: {nombre: 'Otro', ref: 'CL-9001'}}).ok === false);

/* La coordenada de fuera no se guarda, pero la ficha sí. */
const dirAltaRara = despachar_({accion: 'guardarDirectorio', token: tkDir, cliente: {
  nombre: 'Con coordenada de viaje', lat: 30.2314, lon: 120.1497}});
comprobar('la ficha con coordenada de fuera entra sin coordenada',
  dirAltaRara.ok === true && dirAltaRara.coordenada_fuera === true &&
  txt_(dirAltaRara.cliente.lat) === '', JSON.stringify(dirAltaRara).slice(0, 140));

/* Corregir una ficha. */
const dirCorregida = despachar_({accion: 'guardarDirectorio', token: tkDir,
  cliente: {id: dirAlta.cliente.id, nombre: 'Alta a mano dirCorregida', ref: 'ME-LA-INVENTO'}});
comprobar('se corrige la ficha', dirCorregida.ok === true &&
  txt_(dirCorregida.cliente.nombre) === 'Alta a mano dirCorregida');
comprobar('pero la referencia no se puede cambiar',
  txt_(dirCorregida.cliente.ref) === txt_(dirAlta.cliente.ref), dirCorregida.cliente.ref);

/* Borrar se lleva por delante las visitas de esa ficha, no las de otras. */
despachar_({accion: 'importarDirVisitas', token: tkDir, visitas: [
  {ref: txt_(dirAlta.cliente.ref), cliente: 'Alta a mano', fecha: '2026-06-01', hora: '09:00'},
  {ref: txt_(dirAlta.cliente.ref), cliente: 'Alta a mano', fecha: '2026-06-08', hora: '09:00'}]});
const dirVisitasAntes = leer_('DIR_VISITAS').length;
const dirFuera = despachar_({accion: 'borrarDirectorio', token: tkDir,
  ids: [dirAlta.cliente.id, dirAltaRara.cliente.id]});
comprobar('se borran dos fichas de una vez',
  dirFuera.ok === true && dirFuera.borradas === 2, JSON.stringify(dirFuera));
comprobar('y se van con ellas sus visitas',
  dirFuera.visitas_borradas === 2 && leer_('DIR_VISITAS').length === dirVisitasAntes - 2);
comprobar('las visitas de los demás siguen ahí',
  leer_('DIR_VISITAS').some(v => txt_(v.ref) === 'CL-9001'));
comprobar('sin marcar nada no borra nada',
  despachar_({accion: 'borrarDirectorio', token: tkDir, ids: []}).ok === false);

/* Lo mismo con las puertas. */
const puNueva = despachar_({accion: 'guardarPuerta', token: tkDir, puerta: {
  nombre: 'Puerta a mano', direccion: 'Calle Mano 1', zona: 'Boadilla',
  fecha: '2026-04-02', hora: '18:00', lat: 40.4051, lon: -3.8781}});
comprobar('se apunta una puerta a mano', puNueva.ok === true && !!puNueva.puerta.id);
comprobar('la misma puerta el mismo día no se apunta dos veces',
  despachar_({accion: 'guardarPuerta', token: tkDir, puerta: {
    nombre: 'Puerta a mano', zona: 'Boadilla', fecha: '2026-04-02',
    lat: 40.4051, lon: -3.8781}}).ok === false);
comprobar('una puerta de fuera de España no se apunta',
  despachar_({accion: 'guardarPuerta', token: tkDir, puerta: {
    nombre: 'Shanghai', zona: 'Otra', fecha: '2026-04-03',
    lat: 31.2293, lon: 121.4867}}).ok === false);
comprobar('una puerta sin coordenada tampoco',
  despachar_({accion: 'guardarPuerta', token: tkDir, puerta: {
    nombre: 'Sin sitio', zona: 'Boadilla', fecha: '2026-04-04'}}).ok === false);

const puCorregida = despachar_({accion: 'guardarPuerta', token: tkDir,
  puerta: {id: puNueva.puerta.id, nota: 'No estaban en casa'}});
comprobar('se corrige una puerta', puCorregida.ok === true &&
  txt_(puCorregida.puerta.nota) === 'No estaban en casa');

const puAntes = leer_('PUERTAS').length;
const puFuera = despachar_({accion: 'borrarPuertas', token: tkDir,
  ids: [puNueva.puerta.id]});
comprobar('se borra una puerta marcada',
  puFuera.ok === true && puFuera.borradas === 1 &&
  leer_('PUERTAS').length === puAntes - 1);
comprobar('sin marcar nada no borra ninguna puerta',
  despachar_({accion: 'borrarPuertas', token: tkDir, ids: []}).ok === false);

/* Nada de esto lo puede tocar quien no tiene el directorio abierto. */
comprobar('un comercial no puede dar de alta en el directorio',
  despachar_({accion: 'guardarDirectorio', token: sesiones.rober.token,
    cliente: {nombre: 'Por la puerta de atrás'}}).ok === false);
comprobar('ni borrar puertas',
  despachar_({accion: 'borrarPuertas', token: sesiones.rober.token, ids: ['x']}).ok === false);

/* Para exportar hace falta la lista filtrada entera, no la página. */
const dirParaExportar = despachar_({accion: 'directorio', token: tkDir, todo: true});
comprobar('el directorio se puede pedir entero para exportar',
  dirParaExportar.clientes.length === dirParaExportar.encontrados,
  dirParaExportar.clientes.length + ' de ' + dirParaExportar.encontrados);

vaciarCorreos();
const aviso2 = despachar_({accion: 'avisoPuertas', token: tkDir, desde: lunesDe_(hoyISO_())});
comprobar('el aviso semanal se manda', aviso2.ok === true && correosEnviados().length === 1,
  JSON.stringify(aviso2).slice(0, 120));
comprobar('y cuenta las puertas nuevas',
  /2 puertas nuevas/.test((correosEnviados()[0] || {}).htmlBody || ''));
/* Fernando y Nando comparten correo, así que salen dos direcciones y no tres. */
comprobar('va solo a quien puede ver el directorio, sin repetir direcciones',
  ((correosEnviados()[0] || {}).to || '').split(',').sort().join(',') ===
  'fernandogarcia@zerowattios.com,fernandogarciasantos87@gmail.com',
  (correosEnviados()[0] || {}).to);
comprobar('y no a los comerciales ni captadores',
  !/robertopaulino|sandrabono|abrahamali/.test((correosEnviados()[0] || {}).to || ''));

/* El aviso automático del lunes habla de la semana que acaba de cerrar, de
   lunes a domingo, no de la que empieza hoy. */
vaciarCorreos();
const avisoLunes = avisoPuertasSemana(
  Utilities.formatDate(new Date(fecha_(lunesDe_(hoyISO_())).getTime() - 7 * 86400000),
                       zonaHoraria_(), 'yyyy-MM-dd'));
comprobar('el aviso de una semana concreta sale', avisoLunes.ok === true);
comprobar('y la acota de lunes a lunes',
  /Semana del|Desde el lunes/.test((correosEnviados()[0] || {}).htmlBody || ''));


console.log('\n== Mi tablero: puestos, cifras y tareas ==');
{
/* El puesto decide qué ve cada uno en su pestaña. Por defecto va por el
   rol; Rubén es la excepción, que lleva contabilidad. */
const puestos = ponerPuestos();
const porNombre = {};
leer_('USUARIOS').forEach(x => { porNombre[normal_(x.nombre)] = txt_(x.area); });
comprobar('a Rubén le toca contabilidad', porNombre['ruben'] === 'contabilidad', porNombre);
comprobar('a Fernando, dirección', porNombre['fernando'] === 'direccion', porNombre);
comprobar('a Nando, comercial', porNombre['nando'] === 'comercial', porNombre);
comprobar('a Sandra, captación', porNombre['sandra'] === 'captacion', porNombre);
comprobar('pasarlo dos veces no cambia nada', ponerPuestos().length === 0, puestos.length);

/* --- las cifras del Centro de Mando --- */
const tkRuben = sesiones.ruben.token;
comprobar('un comercial no ve las cifras de la casa',
  despachar_({accion: 'cifras', token: sesiones.rober.token}).ok === false);

const sinVolcar = despachar_({accion: 'cifras', token: tkDir});
comprobar('dirección sí las ve', sinVolcar.ok === true && Array.isArray(sinVolcar.cifras));
comprobar('y mientras el panel no vuelque nada, no hay descuadres',
  sinVolcar.descuadres === 0, sinVolcar.descuadres);
comprobar('pero el CRM ya calcula las suyas',
  sinVolcar.cifras.some(c => c.crm !== null && c.panel === null));

const cobradoCrm = sinVolcar.cifras.filter(c => c.clave === 'cobrado')[0].crm;
const volcado = despachar_({accion: 'guardarCifras', token: tkDir, cifras: [
  {clave: 'cobrado', valor: cobradoCrm + 1000, meta: 1000000, fecha: '2026-10-20',
   nota: 'Extracto de banco'},
  {clave: 'operaciones', valor: 35, meta: 50},
  {clave: 'vendido_pendiente_cobro', valor: 58157}
]});
comprobar('el panel vuelca sus cifras', volcado.ok === true && volcado.nuevas === 3, volcado);

const conCifras = despachar_({accion: 'cifras', token: tkDir});
const cobrado = conCifras.cifras.filter(c => c.clave === 'cobrado')[0];
comprobar('se ve la del panel y la del CRM una al lado de la otra',
  cobrado.panel === cobradoCrm + 1000 && cobrado.crm === cobradoCrm, cobrado);
comprobar('y la diferencia salta como descuadre',
  cobrado.descuadre === true && cobrado.diferencia === 1000, cobrado);
comprobar('se cuentan los descuadres', conCifras.descuadres >= 1, conCifras.descuadres);
comprobar('una cifra que el CRM no sabe calcular se enseña igual',
  conCifras.cifras.some(c => c.clave === 'vendido_pendiente_cobro' && c.panel === 58157));

const cuadrada = despachar_({accion: 'guardarCifras', token: tkDir,
  cifras: [{clave: 'cobrado', valor: cobradoCrm}]});
comprobar('volver a volcar actualiza, no duplica',
  cuadrada.ok === true && cuadrada.cambiadas === 1 && cuadrada.nuevas === 0, cuadrada);
comprobar('y entonces ya cuadra',
  despachar_({accion: 'cifras', token: tkDir}).cifras
    .filter(c => c.clave === 'cobrado')[0].descuadre === false);
comprobar('un comercial tampoco puede volcar cifras',
  despachar_({accion: 'guardarCifras', token: sesiones.nando.token,
    cifras: [{clave: 'cobrado', valor: 1}]}).ok === false);

/* --- las tareas de cada uno --- */
const tContable = despachar_({accion: 'guardarTarea', token: tkDir, tarea: {
  titulo: 'Pasar la FZW2026-151 a 01 INGRESOS', area: 'contabilidad',
  vence: '2026-10-22', prioridad: 'alta', origen: 'panel', origen_id: 'inf-2026-10-21-1'}});
comprobar('dirección crea una tarea de contabilidad', tContable.ok === true &&
  tContable.tarea.area === 'contabilidad' && tContable.tarea.estado === 'pendiente', tContable);

const tDireccion = despachar_({accion: 'guardarTarea', token: tkDir, tarea: {
  titulo: 'Aprobar el precio de Olivo 605', area: 'direccion', importe: 39000}});
comprobar('y otra para dirección', tDireccion.ok === true);

const tNando = despachar_({accion: 'guardarTarea', token: tkDir, tarea: {
  titulo: 'Llamar a Elena López Gunn', usuario_id: 'U-000004'}});
comprobar('una tarea con nombre y apellidos coge el área de su dueño',
  tNando.ok === true && tNando.tarea.area === 'comercial', tNando.tarea);

const deRuben = despachar_({accion: 'tareas', token: tkRuben});
comprobar('Rubén ve la suya', deRuben.ok === true && deRuben.tareas.length === 1 &&
  deRuben.tareas[0].id === tContable.tarea.id, deRuben.tareas);
comprobar('y el servidor le dice de qué área es', deRuben.area === 'contabilidad');
comprobar('dirección ve la suya y no la de contabilidad',
  despachar_({accion: 'tareas', token: tkDir}).tareas
    .every(t => t.area === 'direccion' || t.usuario_id === 'U-000003'));
comprobar('y pidiéndolas todas las ve todas',
  despachar_({accion: 'tareas', token: tkDir, todas: true}).tareas.length === 3);
comprobar('Nando ve solo la que lleva su nombre',
  despachar_({accion: 'tareas', token: sesiones.nando.token}).tareas.length === 1);
comprobar('Rober no ve ninguna',
  despachar_({accion: 'tareas', token: sesiones.rober.token}).tareas.length === 0);

comprobar('un comercial no puede inventarse tareas',
  despachar_({accion: 'guardarTarea', token: sesiones.nando.token,
    tarea: {titulo: 'Darme el día libre', area: 'comercial'}}).ok === false);
comprobar('ni tocar la de otro',
  despachar_({accion: 'estadoTarea', token: sesiones.nando.token,
    id: tContable.tarea.id, estado: 'hecha'}).ok === false);

const hecha = despachar_({accion: 'estadoTarea', token: sesiones.nando.token,
  id: tNando.tarea.id, estado: 'hecha'});
comprobar('pero sí dar por hecha la suya', hecha.ok === true &&
  hecha.tarea.estado === 'hecha' && txt_(hecha.tarea.hecho) !== '', hecha.tarea);
comprobar('y entonces desaparece de su lista',
  despachar_({accion: 'tareas', token: sesiones.nando.token}).tareas.length === 0);
comprobar('salvo que la pida con las cerradas',
  despachar_({accion: 'tareas', token: sesiones.nando.token, cerradas: true}).tareas.length === 1);

/* El agente del panel repite el volcado cada pocas horas: no debe duplicar. */
const otraVez = despachar_({accion: 'guardarTarea', token: tkDir, tarea: {
  titulo: 'Pasar la FZW2026-151 a 01 INGRESOS (y avisar)', origen: 'panel',
  origen_id: 'inf-2026-10-21-1'}});
comprobar('repetir el volcado del panel actualiza en vez de duplicar',
  otraVez.ok === true && otraVez.tarea.id === tContable.tarea.id &&
  leer_('TAREAS').length === 3, leer_('TAREAS').length);

comprobar('un estado que no existe no cuela',
  despachar_({accion: 'guardarTarea', token: tkDir,
    tarea: {id: tDireccion.tarea.id, estado: 'a medias'}}).ok === false);
comprobar('ni un área inventada',
  despachar_({accion: 'guardarTarea', token: tkDir,
    tarea: {titulo: 'x', area: 'marketing'}}).ok === false);
comprobar('una tarea sin título tampoco',
  despachar_({accion: 'guardarTarea', token: tkDir, tarea: {area: 'direccion'}}).ok === false);

comprobar('un comercial no borra tareas',
  despachar_({accion: 'borrarTarea', token: sesiones.nando.token,
    id: tDireccion.tarea.id}).ok === false);
comprobar('dirección sí',
  despachar_({accion: 'borrarTarea', token: tkDir, id: tDireccion.tarea.id}).ok === true &&
  leer_('TAREAS').length === 2);
}

{   /* el registro de conexiones, en su propio bloque */
console.log('\n== Registro de conexiones y actividad ==');
const tkSuper = sesiones.superadmin.token;
const conexion = {equipo: 'equipo-de-nando', ip: '83.45.120.7', lugar: 'Tres Cantos, Madrid, España'};
const logAhora = () => leer_('LOG');
const ultimaDe = (filtro) => logAhora().filter(filtro).slice(-1)[0];

/* Una consulta: no la apunta ninguna acción, así que sale la genérica. */
let antes = logAhora().length;
despachar_({accion: 'datos', token: sesiones.nando.token, conexion});
let nuevas = logAhora().slice(antes);
comprobar('una consulta deja una fila y solo una', nuevas.length === 1, nuevas.length);
comprobar('con quién, qué y tipo consulta',
  nuevas[0].usuario === 'nando' && nuevas[0].accion === 'datos' && nuevas[0].tipo === 'consulta', nuevas[0]);
comprobar('con la IP y el lugar que manda el navegador',
  nuevas[0].ip === '83.45.120.7' && /Tres Cantos/.test(nuevas[0].lugar), nuevas[0]);
comprobar('y el equipo legible sacado de la sesión',
  /Windows · Chrome · #equipo/.test(nuevas[0].equipo) && /Mozilla/.test(nuevas[0].agente), nuevas[0].equipo);

/* Una modificación que ya se apunta sola: no se duplica. */
antes = logAhora().length;
const altaLog = despachar_({accion: 'guardarCliente', token: sesiones.nando.token, conexion,
  cliente: {nombre: 'Cliente del registro', direccion: 'Calle Log 1', municipio: 'Madrid'}});
nuevas = logAhora().slice(antes);
comprobar('un cambio deja una sola fila, la que cuenta más', altaLog.ok && nuevas.length === 1 &&
  nuevas[0].accion === 'alta_cliente' && nuevas[0].entidad_id === altaLog.cliente.id, nuevas);
comprobar('y va como modificación con su IP', nuevas[0].tipo === 'modificacion' &&
  nuevas[0].ip === '83.45.120.7', nuevas[0]);

/* Una modificación que no se apunta sola sale con sus parámetros. */
antes = logAhora().length;
despachar_({accion: 'reanalizar', token: sesiones.nando.token, id: 'P-999999', conexion});
nuevas = logAhora().slice(antes);
comprobar('una acción que falla queda apuntada con el error', nuevas.length === 1 &&
  nuevas[0].tipo === 'modificacion' && /error: No existe ese parte/.test(nuevas[0].detalle), nuevas);

/* Lo que no debe salir nunca en el detalle. */
antes = logAhora().length;
despachar_({accion: 'subirArchivo', token: sesiones.nando.token, conexion,
  cliente_id: altaLog.cliente.id, nombre: 'foto.jpg', mime: 'image/jpeg',
  datos: 'QUJD'.repeat(500), clave: 'secreto123', codigo: '123456',
  extra: {nueva: 'otraclave', nombre: 'x', password: 'zzz'}});
despachar_({accion: 'buscar', token: sesiones.nando.token, q: 'x'.repeat(900), conexion});
nuevas = logAhora().slice(antes);
const textoNuevas = JSON.stringify(nuevas);
comprobar('ni token, ni claves, ni códigos, ni el archivo en base64',
  !textoNuevas.includes(sesiones.nando.token) && !textoNuevas.includes('secreto123') &&
  !textoNuevas.includes('123456') && !textoNuevas.includes('QUJDQUJD') &&
  !textoNuevas.includes('otraclave') && !textoNuevas.includes('zzz'), textoNuevas.slice(0, 400));
comprobar('y el detalle nunca pasa de 300 caracteres',
  logAhora().every(l => txt_(l.detalle).length <= 300));
comprobar('lo largo se cuenta en vez de copiarse',
  nuevas.some(l => /q=\(900 caracteres\)/.test(l.detalle)), nuevas.map(l => l.detalle));

/* Texto de fuera que podría pasar por fórmula en la hoja. */
antes = logAhora().length;
despachar_({accion: 'datos', token: sesiones.nando.token,
  conexion: {ip: '=IMPORTXML("http://malo")', lugar: '+34<script>'}});
const formula = logAhora().slice(antes)[0];
comprobar('lo que llega del navegador no entra como fórmula',
  /^'=/.test(formula.ip) && /^'\+/.test(formula.lugar), formula);

/* Entradas, buenas y malas. */
antes = logAhora().length;
despachar_({accion: 'login', usuario: 'rober', clave: 'malamala1', equipo: equipos.rober,
  agente: 'Mozilla/5.0 (Linux; Android 14) Mobile Chrome/130', conexion});
despachar_({accion: 'login', usuario: 'nadie', clave: 'loquesea', conexion});
const entraRober = despachar_({accion: 'login', usuario: 'rober', clave: claves.rober,
  equipo: equipos.rober, agente: 'Mozilla/5.0 (Linux; Android 14) Mobile Chrome/130', conexion});
nuevas = logAhora().slice(antes);
const fallida = nuevas.filter(l => l.accion === 'login_fallido');
comprobar('los intentos fallidos se apuntan con el usuario que se tecleó',
  fallida.length === 2 && fallida[0].usuario === 'rober' && fallida[1].usuario === 'nadie' &&
  fallida.every(l => l.tipo === 'conexion'), fallida);
comprobar('sin rastro de la clave probada', !JSON.stringify(nuevas).includes('malamala1') &&
  !JSON.stringify(nuevas).includes('loquesea'));
const entrada = nuevas.filter(l => l.accion === 'login')[0];
comprobar('la entrada buena también, con equipo, IP y lugar', entraRober.ok && entrada &&
  entrada.tipo === 'conexion' && /Android · móvil · Chrome/.test(entrada.equipo) &&
  entrada.ip === '83.45.120.7', entrada);
sesiones.rober = entraRober;

/* Salir y que la sesión se caiga por no usarla. */
const otraRober = despachar_({accion: 'login', usuario: 'rober', clave: claves.rober, equipo: equipos.rober});
antes = logAhora().length;
despachar_({accion: 'salir', token: otraRober.token});
nuevas = logAhora().slice(antes);
comprobar('salir deja una fila de conexión', nuevas.length === 1 && nuevas[0].accion === 'salir' &&
  nuevas[0].tipo === 'conexion', nuevas);
const hSes = SpreadsheetApp.openById().getSheetByName('SESIONES');
const cabSes = hSes.datos[0];
const filaSes = hSes.datos.findIndex(f => f[0] === entraRober.token);
hSes.datos[filaSes][cabSes.indexOf('ultimo_uso')] = dentroDe_(-(MINUTOS_INACTIVIDAD + 5));
antes = logAhora().length;
const caida = despachar_({accion: 'datos', token: entraRober.token, conexion});
despachar_({accion: 'datos', token: entraRober.token, conexion});
nuevas = logAhora().slice(antes);
comprobar('una sesión caducada se apunta una vez, a nombre de quien era',
  caida.sesion === false && nuevas.length === 1 && nuevas[0].accion === 'sesion_caducada' &&
  nuevas[0].usuario === 'rober' && nuevas[0].tipo === 'conexion', nuevas);
sesiones.rober = entrar('rober');

/* El ping no ensucia. */
antes = logAhora().length;
despachar_({accion: 'ping'});
comprobar('el ping no se apunta', logAhora().length === antes);

/* Cada acción tiene su tipo: si mañana aparece una nueva que lee, hay que
   decidir aquí qué es. */
const lecturas = ['misEquipos','datos','buscar','proyecto','descargarArchivo','proyectosPendientes',
  'cifras','tareas','finanzas','partes','resumen','equipo','analitica','alertas','nominas','nominaDias',
  'descargarNomina','vacaciones','mapa','usuarios','registro','directorio','directorioFicha','puertas',
  'banco','copias','descargarCopia'];
const malClasificadas = Object.keys(acciones_()).filter(a => a !== 'salir' &&
  (tipoDePeticion_(a) === 'consulta') !== lecturas.includes(a));
comprobar('cada acción está clasificada como consulta o modificación', malClasificadas.length === 0,
  malClasificadas);
comprobar('y salir cuenta como conexión', tipoDePeticion_('salir') === 'conexion');

/* Solo el superadmin. */
comprobar('un administrador no ve el registro',
  despachar_({accion: 'registro', token: sesiones.fernando.token}).ok === false);
comprobar('un comercial tampoco',
  despachar_({accion: 'registro', token: sesiones.nando.token}).ok === false);
comprobar('ni un captador',
  despachar_({accion: 'registro', token: sesiones.sandra.token}).ok === false);
const todoLog = despachar_({accion: 'registro', token: tkSuper});
comprobar('el superadmin sí', todoLog.ok === true && todoLog.registro.length > 0, todoLog.error);
comprobar('y lo más nuevo sale primero',
  todoLog.registro.every((r, i, a) => !i || a[i - 1].fecha >= r.fecha));

/* Filas de otros días, metidas por delante como si fueran antiguas, y una
   del formato viejo (siete columnas, sin tipo). */
const hLog = SpreadsheetApp.openById().getSheetByName('LOG');
const cabLog = hLog.datos[0];
const fila = o => cabLog.map(c => o[c] === undefined ? '' : o[c]);
hLog.datos.splice(1, 0,
  ['2026-01-10 07:59:59', sesiones.nando.usuario.id, 'nando', 'editar_cliente', 'CLIENTES', 'C-1', 'vieja'],
  fila({fecha: '2026-01-10 08:15:00', usuario_id: sesiones.nando.usuario.id, usuario: 'nando',
        accion: 'datos', tipo: 'consulta', ip: '1.1.1.1'}),
  fila({fecha: '2026-01-10 12:30:00', usuario_id: sesiones.rober.usuario.id, usuario: 'rober',
        accion: 'guardarCliente', tipo: 'modificacion', detalle: 'cliente={nombre:Pozuelo}'}),
  fila({fecha: '2026-01-10 14:00:00', usuario_id: '', usuario: 'rober',
        accion: 'login_fallido', tipo: 'conexion'}),
  fila({fecha: '2026-01-11 09:00:00', usuario_id: sesiones.nando.usuario.id, usuario: 'nando',
        accion: 'login', tipo: 'conexion'}));
const reg = o => despachar_(Object.assign({accion: 'registro', token: tkSuper}, o));
const tramo = reg({desde: '2026-01-10 08:00', hasta: '2026-01-10 13:00'});
comprobar('filtrar de tal hora a tal hora', tramo.ok &&
  tramo.registro.map(r => r.fecha).join('|') === '2026-01-10 12:30:00|2026-01-10 08:15:00',
  tramo.registro.map(r => r.fecha));
const diaEntero = reg({desde: '2026-01-10', hasta: '2026-01-10'});
comprobar('con solo el día, el día entero', diaEntero.registro.length === 4, diaEntero.registro.length);
comprobar('las filas viejas sin tipo salen clasificadas',
  diaEntero.registro.some(r => r.accion === 'editar_cliente' && r.tipo === 'modificacion'));
const hastaHora = reg({hasta: '2026-01-10 12:30'});
comprobar('el «hasta» con hora incluye ese minuto', hastaHora.registro.length === 3 &&
  hastaHora.registro[0].fecha === '2026-01-10 12:30:00', hastaHora.registro.map(r => r.fecha));
const deRober = reg({desde: '2026-01-10', hasta: '2026-01-11', usuario: sesiones.rober.usuario.id});
comprobar('por persona, incluidos sus intentos fallidos (que no llevan id)',
  deRober.registro.length === 2 && deRober.registro.every(r => r.usuario === 'rober'), deRober.registro);
const conexiones = reg({desde: '2026-01-10', hasta: '2026-01-11', tipo: 'conexion'});
comprobar('por tipo', conexiones.registro.length === 2 &&
  conexiones.registro.every(r => r.tipo === 'conexion'), conexiones.registro);
const porTexto = reg({desde: '2026-01-10', hasta: '2026-01-11', texto: 'pozuelo'});
comprobar('por texto, sin mirar acentos ni mayúsculas', porTexto.registro.length === 1, porTexto.registro);
const corto = reg({desde: '2026-01-10', hasta: '2026-01-11', limite: 2});
comprobar('con tope, avisa de que hay más', corto.registro.length === 2 && corto.truncado === true);
comprobar('sin tope alcanzado, no avisa', diaEntero.truncado === false);
comprobar('un rango vacío no rompe', reg({desde: '2020-01-01 10:00', hasta: '2020-01-01 11:00'})
  .registro.length === 0);

/* Una hoja LOG de antes, con sus siete columnas: la primera petición que
   escribe le añade las que faltan, sin tocar las filas. */
const filasAntes = hLog.datos.length;
hLog.datos[0] = ['fecha','usuario_id','usuario','accion','entidad','entidad_id','detalle'];
PROPIEDADES_LOG_BORRAR();
despachar_({accion: 'datos', token: sesiones.nando.token, conexion});
comprobar('una hoja LOG vieja recibe sola las columnas nuevas',
  hLog.datos[0].join(',') === ESQUEMA.LOG.join(','), hLog.datos[0]);
const ultimaFila = hLog.datos[hLog.datos.length - 1];
comprobar('y la fila nueva cae en su sitio', hLog.datos.length === filasAntes + 1 &&
  ultimaFila[hLog.datos[0].indexOf('ip')] === '83.45.120.7' &&
  ultimaFila[hLog.datos[0].indexOf('tipo')] === 'consulta', ultimaFila);
}

{   /* «Enviado al cliente», en su propio bloque */
console.log('\n== Proyecto enviado al cliente ==');
const tkAdm = sesiones.fernando.token;
const idNando = sesiones.nando.usuario.id;
const idSandra = sesiones.sandra.usuario.id;
/* Un cliente de Nando captado por Sandra, para probar a los tres. */
const cli = leer_('CLIENTES').filter(c => String(c.comercial_id) === String(idNando) &&
  String(c.captador_id) === String(idSandra))[0];
comprobar('hay un cliente de Nando captado por Sandra', !!cli);
actualizar_('CLIENTES', cli.id, {proxima_accion: '', proxima_fecha: ''});
const enviar = (tk, extra) => despachar_(Object.assign({accion: 'enviadoProyecto', token: tk,
  cliente_id: cli.id}, extra || {}));

comprobar('sin proyecto hecho no se puede marcar', enviar(sesiones.nando.token).ok === false);
despachar_({accion: 'guardarProyecto', token: sesiones.nando.token, cliente_id: cli.id,
  descripcion: 'Chalet para probar el enviado'});
const entrega = despachar_({accion: 'entregarProyecto', token: tkAdm, cliente_id: cli.id,
  nombre: 'Proyecto_enviado.pdf', mime: 'application/pdf', datos: Utilities.base64Encode([37, 80, 68, 70])});
comprobar('el proyecto queda entregado', entrega.ok && entrega.proyecto.estado === 'entregado', entrega.error);
const listos = tk => despachar_({accion: 'proyectosPendientes', token: tk, estado: 'entregado'}).proyectos;
comprobar('y sale en los listos para enviar de Nando', listos(sesiones.nando.token).some(x => x.cliente_id === cli.id));

const deRober = enviar(sesiones.rober.token);
comprobar('otro comercial no puede marcarlo', deRober.ok === false, deRober);
const deSandra = enviar(sesiones.sandra.token);
comprobar('la captadora tampoco, aunque vea al cliente', deSandra.ok === false &&
  /comercial del cliente/.test(deSandra.error), deSandra);

const antes = leer_('LOG').length;
const deNando = enviar(sesiones.nando.token);
comprobar('su comercial sí', deNando.ok === true && deNando.proyecto.estado === 'enviado', deNando.error);
const proy = leer_('PROYECTOS').filter(x => x.cliente_id === cli.id)[0];
comprobar('con fecha y quién', /^\d{4}-\d{2}-\d{2} /.test(txt_(proy.enviado)) &&
  String(proy.enviado_por) === String(idNando), proy);
const fila = leer_('LOG').slice(antes).filter(l => l.accion === 'proyecto_enviado')[0];
comprobar('queda en el registro como modificación, con «dirección · nombre»', fila &&
  fila.tipo === 'modificacion' && fila.detalle === [cli.direccion, cli.nombre].join(' · '), fila);
comprobar('y ya no está en los listos para enviar',
  !listos(sesiones.nando.token).some(x => x.cliente_id === cli.id) &&
  !listos(tkAdm).some(x => x.cliente_id === cli.id));
const enviados = despachar_({accion: 'proyectosPendientes', token: tkAdm, estado: 'enviado', dias: 14});
comprobar('la dirección lo ve en los enviados de los últimos 14 días', enviados.proyectos.some(x =>
  x.cliente_id === cli.id && x.enviado_por === 'Nando' && x.comercial === 'Nando'), enviados.proyectos);
const cliTras = leer_('CLIENTES').filter(c => c.id === cli.id)[0];
comprobar('y se apunta llamarle a la semana', cliTras.proxima_accion === 'Llamar: seguimiento de la propuesta' &&
  cliTras.proxima_fecha === sumarDias_(hoyISO_(), 7) && deNando.llamada === sumarDias_(hoyISO_(), 7), cliTras);
comprobar('con su seguimiento', leer_('SEGUIMIENTO').some(x => x.cliente_id === cli.id &&
  x.origen === 'proyecto_enviado' && x.proxima_fecha === sumarDias_(hoyISO_(), 7)));
comprobar('marcarlo otra vez no hace nada', enviar(sesiones.nando.token).ya === true);

comprobar('el comercial no puede deshacerlo', enviar(sesiones.nando.token, {deshacer: true}).ok === false);
const deshecho = enviar(tkAdm, {deshacer: true});
comprobar('la dirección sí: vuelve a entregado', deshecho.ok && deshecho.proyecto.estado === 'entregado' &&
  !txt_(deshecho.proyecto.enviado), deshecho);
comprobar('y vuelve a los listos para enviar', listos(sesiones.nando.token).some(x => x.cliente_id === cli.id));

/* Si ya tiene un próximo paso antes de la semana, se respeta. */
actualizar_('CLIENTES', cli.id, {proxima_accion: 'Visita técnica', proxima_fecha: sumarDias_(hoyISO_(), 2)});
const otraVez = enviar(tkAdm);
const cliRespeta = leer_('CLIENTES').filter(c => c.id === cli.id)[0];
comprobar('la dirección también puede marcarlo', otraVez.ok === true);
comprobar('y un próximo paso anterior no se pisa', cliRespeta.proxima_accion === 'Visita técnica' &&
  !otraVez.llamada && otraVez.proximo_ya === sumarDias_(hoyISO_(), 2), cliRespeta);

/* Una hoja PROYECTOS de antes, sin las columnas nuevas: se añaden solas. */
const hP = SpreadsheetApp.openById().getSheetByName('PROYECTOS');
hP.datos[0] = hP.datos[0].slice(0, hP.datos[0].indexOf('enviado'));
hP.datos.forEach((f, i) => { if (i) f.length = Math.min(f.length, hP.datos[0].length); });
asegurarProyectos_();
comprobar('una hoja PROYECTOS vieja recibe enviado y enviado_por',
  hP.datos[0].slice(-2).join(',') === 'enviado,enviado_por', hP.datos[0].slice(-3));
}

console.log('\n' + (fallos ? 'FALLAN ' + fallos + ' de ' + pruebas : 'Todo correcto: ' + pruebas + ' comprobaciones'));
process.exit(fallos ? 1 : 0);
