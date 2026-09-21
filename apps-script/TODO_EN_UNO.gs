/**
 * CRM · ZERO WATTIOS — TODO EN UNO
 *
 * Este archivo es exactamente lo mismo que los dieciséis .gs de la carpeta
 * apps-script, pegados uno detrás de otro en orden. Sirve para montar el
 * backend de una sentada: se crea el proyecto en script.google.com, se
 * borra lo que trae Código.gs y se pega todo esto dentro.
 *
 * Para trabajar en el código conviene el reparto en archivos; para
 * instalar, este atajo. Si cambias algo, cámbialo en los archivos sueltos
 * y vuelve a generar este con: node pruebas/unir.js
 */

/* ==========================================================================
   00_Config.gs
   ========================================================================== */

/**
 * CRM · ZERO WATTIOS
 * 00_Config.gs — Constantes, esquema de la base de datos y catálogo comercial.
 *
 * Toda la base de datos vive en una sola hoja de cálculo de Google.
 * Cada tabla es una pestaña; la primera fila son los nombres de columna
 * y son los mismos nombres que viajan al navegador. Si aquí se añade una
 * columna, basta con volver a ejecutar instalar() para que aparezca.
 */

/* Versión del backend. Sube cuando cambie el esquema. */
const VERSION = '1.0.0';

/* Nombre del documento que se crea la primera vez. */
const NOMBRE_BASE = 'CRM · ZERO WATTIOS — Base de datos';

/* Duración de la sesión iniciada desde el navegador. */
const HORAS_SESION = 12;

/* Longitud de las claves que genera el sistema. */
const LARGO_CLAVE = 10;

/* Roles. El orden importa: de más a menos permisos. */
const ROLES = ['superadmin', 'admin', 'comercial', 'captador'];

/* Qué puede hacer cada rol. Esto se comprueba SIEMPRE en el servidor:
   el navegador solo esconde botones, quien manda es esta tabla. */
const PERMISOS = {
  superadmin: {
    alcance: 'todo',        // ve los clientes de todo el mundo
    finanzas: true,         // contabilidad, facturas, gastos, márgenes
    costes: true,           // coste y beneficio de cada instalación
    usuarios: true,         // alta, baja y claves de usuarios
    nominasAjenas: true,    // ve las nóminas de los demás
    partesAjenos: true,     // ve los partes diarios de los demás
    editarTodo: true,
    config: true
  },
  admin: {
    alcance: 'todo',
    finanzas: true,
    costes: true,
    usuarios: false,
    nominasAjenas: true,
    partesAjenos: true,
    editarTodo: true,
    config: true
  },
  comercial: {
    alcance: 'comercial',   // solo los clientes donde figura como comercial
    finanzas: false,
    costes: false,
    usuarios: false,
    nominasAjenas: false,
    partesAjenos: false,
    editarTodo: false,
    config: false
  },
  captador: {
    alcance: 'captador',    // solo los clientes que ha captado él
    finanzas: false,
    costes: false,
    usuarios: false,
    nominasAjenas: false,
    partesAjenos: false,
    editarTodo: false,
    config: false
  }
};

/* Esquema de la base de datos. Orden de columnas = orden en la pestaña. */
const ESQUEMA = {

  USUARIOS: ['id','nombre','usuario','email','telefono','rol','activo',
    'hash','salt','creado','ultimo_acceso','debe_cambiar_clave',
    'salario_bruto','dietas_mes','irpf_pct','ss_pct',
    'comision_fv','comision_aero','comision_fv_ajustada','comision_aero_ajustada',
    'comision_captacion_fv','comision_captacion_aero',
    'responsable_id','comision_equipo_fv','comision_equipo_aero',
    'objetivo_mes','jornada_horas','fecha_alta','color','notas'],

  CLIENTES: ['id','creado','creado_por','comercial_id','captador_id',
    'nombre','dni','cotitular','telefono','email',
    'direccion','municipio','cp','coordenadas',
    'tipo_vivienda','regimen','m2','personas','anyo',
    'calefaccion','gasto_combustible','periodo_combustible','gasto_luz_mes',
    'comercializadora','cups','potencia_contratada','ya_fv',
    'interes','perfil','otros','origen',
    'estado','fecha_estado','proxima_accion','proxima_fecha',
    'etiquetas','modificado','modificado_por'],

  OPERACIONES: ['id','cliente_id','comercial_id','captador_id','creado','creado_por',
    'referencia','tipo','estado',
    'fecha_propuesta','fecha_contrato','fecha_firma',
    'fecha_prevista_instalacion','fecha_instalacion','fecha_legalizacion',
    'forma_pago','financiera','plazo_meses','cuota','reserva',
    'importe_fv','importe_aero','importe_bateria','importe_cargador','importe_extras',
    'base','iva_pct','total','ayudas_estimadas','cae_estimado',
    'paneles_num','panel_modelo','panel_wp','inversor_modelo','inversor_kw',
    'bateria_kwh','bateria_modelo','cargador_modelo',
    'aero_kw','aero_modelo','deposito_acs','deposito_inercia','suelo_radiante','tejado',
    'precio_ajustado','beneficio_no_economico','observaciones','motivo_perdida',
    'modificado','modificado_por'],

  COBROS: ['id','operacion_id','concepto','importe','fecha_prevista','fecha_cobro',
    'estado','metodo','factura_id','notas','creado','creado_por'],

  FACTURAS: ['id','numero','operacion_id','cliente_id','fecha_emision','concepto',
    'base','iva_pct','iva','total','estado','fecha_vencimiento','fecha_cobro',
    'url','emitida_por','notas'],

  GASTOS: ['id','operacion_id','categoria','proveedor','concepto','importe','iva_pct',
    'fecha','estado_pago','fecha_pago','factura_proveedor','creado','creado_por','notas'],

  SEGUIMIENTO: ['id','cliente_id','operacion_id','usuario_id','fecha','canal',
    'nota','proximo_paso','proxima_fecha','estado_resultante','origen','creado'],

  CAPTACIONES: ['id','cliente_id','captador_id','fecha','hora_cita','estado_cita',
    'tecnologia','comercial_id','resultado','fecha_resultado','operacion_id',
    'interes','notas','creado'],

  PARTES: ['id','fecha','usuario_id','rol','visitas','puertas','fichas',
    'sentadas','sentadas_detalle','ventas','importe_vendido',
    'resumen','analisis','propuestas_aplicadas','estado','creado','modificado'],

  NOMINAS: ['id','usuario_id','periodo','bruto','dietas','comisiones','otros',
    'bruto_total','irpf_pct','irpf','ss_pct','ss','neto',
    'estado','fecha_pago','url','archivo_id','archivo_nombre','subida_por','subida_fecha',
    'detalle','notas','creado'],

  JORNADAS: ['id','usuario_id','fecha','tipo','horas','dietas','comisiones',
    'concepto','notas'],

  BANCO: ['id','cuenta','fecha','concepto','importe','saldo','tipo','categoria','manual','operacion_id',
    'cobro_id','gasto_id','conciliado','notas','clave','creado'],

  VACACIONES: ['id','usuario_id','anio','desde','hasta','dias','tipo','estado','nota',
    'solicitada','resuelta_por','resuelta_fecha','respuesta'],

  CONFIG: ['clave','valor','descripcion'],

  SESIONES: ['token','usuario_id','creado','expira','agente'],

  LOG: ['fecha','usuario_id','usuario','accion','entidad','entidad_id','detalle']
};

/* Estados con los que trabaja la casa. Se envían al navegador para que
   los desplegables digan siempre lo mismo que la base de datos. */
const CATALOGO = {

  estadosCliente: [
    ['nuevo','Nuevo'],
    ['captado','Captado'],
    ['cita','Cita concertada'],
    ['sentada','Sentada realizada'],
    ['propuesta','Propuesta enviada'],
    ['negociando','Negociando'],
    ['ganado','GANADO'],
    ['perdido','Perdido'],
    ['frio','En frío']
  ],

  estadosOperacion: [
    ['propuesta','Propuesta'],
    ['firmada','Firmada'],
    ['financiacion','Financiación en estudio'],
    ['tramite','En trámite / licencia'],
    ['material','Material pedido'],
    ['instalacion','En instalación'],
    ['instalada','Instalada'],
    ['legalizada','Legalizada'],
    ['cerrada','Cerrada'],
    ['cancelada','Cancelada']
  ],

  tiposOperacion: [
    ['fv','Fotovoltaica'],
    ['aero','Aerotermia'],
    ['fv_aero','Fotovoltaica + Aerotermia'],
    ['bateria','Ampliación de baterías'],
    ['cargador','Cargador de vehículo'],
    ['otro','Otro']
  ],

  estadosCobro: [
    ['previsto','Previsto'],
    ['emitido','Facturado'],
    ['parcial','Cobrado en parte'],
    ['cobrado','Cobrado'],
    ['vencido','Vencido'],
    ['incobrable','Incobrable']
  ],

  conceptosCobro: [
    ['firma','50% a la firma'],
    ['material','25% al depósito de material'],
    ['final','25% a la finalización'],
    ['financiacion','Liquidación de la financiera'],
    ['ayuda','Ayuda / subvención'],
    ['cae','CAE'],
    ['otro','Otro']
  ],

  estadosFactura: [
    ['emitida','Emitida'],
    ['enviada','Enviada al cliente'],
    ['cobrada','Cobrada'],
    ['vencida','Vencida'],
    ['rectificada','Rectificada']
  ],

  categoriasGasto: [
    ['material_fv','Material fotovoltaica'],
    ['material_aero','Material aerotermia'],
    ['bateria','Baterías'],
    ['montaje','Montaje / subcontrata'],
    ['mano_obra','Mano de obra propia'],
    ['legalizacion','Legalización y tasas'],
    ['gestion','Gestión de ayudas'],
    ['comision','Comisión comercial'],
    ['captacion','Comisión de captación'],
    ['transporte','Transporte y dietas'],
    ['estructura','Gastos de estructura'],
    ['otro','Otro']
  ],

  canales: [
    ['llamada','Llamada'],['whatsapp','WhatsApp'],['email','Email'],
    ['visita','Visita'],['puerta','Puerta fría'],['otro','Otro']
  ],

  estadosCita: [
    ['confirmada','Confirmada'],['pendiente','Pendiente'],
    ['recontactar','A recontactar'],['no_interesa','No interesa']
  ],

  resultadosCaptacion: [
    ['pendiente','Pendiente'],['sentada','Convertida en sentada'],
    ['venta','Acabó en venta'],['cancelada','Cancelada'],
    ['no_sentada','No llegó a sentada'],['potencial','Queda como potencial']
  ],

  origenes: [
    ['captacion','Captación a puerta'],['referido','Referido'],
    ['web','Web'],['llamada','Llamada entrante'],['feria','Feria / evento'],
    ['campana','Campaña'],['otro','Otro']
  ],

  tiposJornada: [
    ['trabajado','Trabajado'],['vacaciones','Vacaciones'],
    ['festivo','Festivo'],['baja','Baja'],['libre','Libre']
  ],

  estadosVacaciones: [
    ['solicitada','Pendiente de aprobar'],
    ['aprobada','Aprobada'],
    ['denegada','Denegada'],
    ['cancelada','Cancelada']
  ],

  categoriasBanco: [
    ['cobro_cliente','Cobro de cliente'],
    ['otros_ingresos','Otros ingresos'],
    ['proveedor','Proveedores y material'],
    ['montaje','Montaje y subcontrata'],
    ['nominas','Nóminas'],
    ['seguridad_social','Seguridad Social'],
    ['impuestos','Impuestos'],
    ['servicios','Software y servicios'],
    ['seguros','Seguros'],
    ['banco','Comisiones y gastos bancarios'],
    ['financiacion','Préstamos y financiación'],
    ['transporte','Combustible y transporte'],
    ['telefonia','Teléfono e internet'],
    ['ropa_epi','Ropa de trabajo y EPI'],
    ['obra','Licencias y tasas de obra'],
    ['dietas','Dietas y representación'],
    ['otros_gastos','Otros gastos']
  ],

  tiposAusencia: [
    ['vacaciones','Vacaciones'],
    ['asuntos','Asuntos propios'],
    ['sin_sueldo','Permiso sin sueldo']
  ]
};

/* Tarifas y parámetros de la casa. Se guardan en la pestaña CONFIG y se
   pueden cambiar desde el CRM sin tocar el código. */
const CONFIG_INICIAL = [
  ['empresa_nombre','ZERO WATTIOS INGENIERÍA, S.L.','Razón social'],
  ['empresa_cif','B25935073','CIF'],
  ['empresa_direccion','Ronda de Poniente 15, Tres Cantos, Madrid','Domicilio'],
  ['empresa_email','fernandogarcia@zerowattios.com','Correo de contacto'],
  ['empresa_telefono','614 883 551','Teléfono de contacto'],
  ['iva_pct','21','IVA por defecto (%)'],
  ['comision_fv','400','Comisión por fotovoltaica vendida (€)'],
  ['comision_aero','400','Comisión por aerotermia vendida (€)'],
  ['comision_fv_ajustada','200','Comisión por fotovoltaica con precio ajustado (€)'],
  ['comision_aero_ajustada','200','Comisión por aerotermia con precio ajustado (€)'],
  ['comision_captacion_fv','400','Comisión por captar una fotovoltaica que acaba en venta (€)'],
  ['comision_captacion_aero','400','Comisión por captar una aerotermia que acaba en venta (€)'],
  ['comision_equipo_fv','400','Comisión del responsable por cada fotovoltaica que vende su equipo (€)'],
  ['comision_equipo_aero','400','Comisión del responsable por cada aerotermia que vende su equipo (€)'],
  ['objetivo_comercial','6','Ventas sencillas al mes por comercial'],
  ['objetivo_captador','60','Fichas de captación al mes por captador'],
  ['objetivo_visitas_dia','40','Puertas al día por captador'],
  ['coste_estructura_mes','12000','Coste fijo mensual de la empresa (€)'],
  ['dias_vacaciones','22','Días laborables de vacaciones al año por persona'],
  ['resumen_semanal','si','Enviar el resumen semanal por correo los viernes (si/no)'],
  ['resumen_a','fernandogarcia@zerowattios.com','Mientras tenga un correo, TODOS los resúmenes van ahí y no a cada persona'],
  ['copia_resumen','','Correo que recibe copia de todos los resúmenes (opcional)'],
  ['festivos','','Festivos del año, separados por comas (aaaa-mm-dd)'],
  ['margen_objetivo_pct','32','Margen bruto objetivo (%)'],
  ['dias_cobro_objetivo','45','Días medios de cobro objetivo'],
  ['precio_fv_10_12','9990','FV 10-12 paneles (€)'],
  ['precio_fv_14_16','10990','FV 14-16 paneles (€)'],
  ['precio_fv_18_20','11990','FV 18-20 paneles (€)'],
  ['precio_fv_22_24','12990','FV 22-24 paneles (€)'],
  ['precio_aero_12','15990','Aerotermia 12 kW (€)'],
  ['precio_aero_16','16990','Aerotermia 16 kW (€)'],
  ['precio_aero_19','17990','Aerotermia 19 kW (€)'],
  ['precio_aero_22','18990','Aerotermia 22 kW (€)'],
  ['precio_bateria_modulo','2570','Módulo de batería 5,3 kWh (€)'],
  ['precio_cargador','1870','Cargador de vehículo (€)'],
  ['ficha_dimensionado','https://zerowattiosingenieria-bit.github.io/ficha/','Ficha de visita'],
  ['ficha_captacion','https://zerowattiosingenieria-bit.github.io/ficha/captacion/','Ficha de captación']
];

/* Los seis usuarios del arranque. Las claves se generan al instalar. */
/**
 * El equipo, con lo que cobra cada uno. 'nivel' solo sirve para leerlo de un
 * vistazo; quien manda es la tarifa. 'responsable' es el usuario que cobra
 * comisión de equipo por lo que cierra esta persona.
 *
 * Todo el mundo cobra por captar (400 + 400), venda quien venda después.
 */
const USUARIOS_INICIALES = [
  {nombre:'Superadmin', usuario:'superadmin', rol:'superadmin', email:'fernandogarciasantos87@gmail.com'},
  {nombre:'Rubén',      usuario:'ruben',      rol:'admin',      email:'rubenleon@zerowattios.com'},
  {nombre:'Fernando',   usuario:'fernando',   rol:'admin',      email:'fernandogarcia@zerowattios.com'},
  {nombre:'Nando',      usuario:'nando',      rol:'comercial',  email:'fernandogarcia@zerowattios.com',
   nivel:'sénior', venta:700, equipo:400},
  {nombre:'Rober',      usuario:'rober',      rol:'comercial',  email:'robertopaulino@zerowattios.com',
   nivel:'júnior', venta:400, responsable:'nando'},
  {nombre:'Sandra',     usuario:'sandra',     rol:'captador',   email:'sandrabono@zerowattios.com'},
  {nombre:'Abraham',    usuario:'abraham',    rol:'captador',   email:'abrahamali@zerowattios.com'}
];


/* ==========================================================================
   01_Base.gs
   ========================================================================== */

/**
 * 01_Base.gs — Acceso a la hoja de cálculo y utilidades comunes.
 *
 * Todas las tablas se leen y escriben por aquí. Nadie toca la hoja
 * directamente: así el día que haya que cambiar de almacén, se cambia
 * en un solo sitio.
 */

const PROPS = PropertiesService.getScriptProperties();

/* ---------- documento ---------- */

function libro_() {
  const id = PROPS.getProperty('ID_BASE');
  if (!id) throw new Error('El CRM no está instalado. Ejecuta instalar() una vez desde el editor.');
  return SpreadsheetApp.openById(id);
}

function hoja_(nombre) {
  const h = libro_().getSheetByName(nombre);
  if (!h) throw new Error('Falta la pestaña ' + nombre + '. Vuelve a ejecutar instalar().');
  return h;
}

/* ---------- lectura ---------- */

/** Devuelve la tabla entera como lista de objetos {columna: valor}. */
function leer_(nombre) {
  const h = hoja_(nombre);
  const n = h.getLastRow();
  if (n < 2) return [];
  const ancho = h.getLastColumn();
  const datos = h.getRange(1, 1, n, ancho).getDisplayValues();
  const crudos = h.getRange(1, 1, n, ancho).getValues();
  const cab = datos[0];
  const fuera = [];
  for (let i = 1; i < datos.length; i++) {
    const o = {_fila: i + 1};
    for (let c = 0; c < cab.length; c++) {
      if (!cab[c]) continue;
      const v = crudos[i][c];
      o[cab[c]] = (v instanceof Date) ? Utilities.formatDate(v, zonaHoraria_(), 'yyyy-MM-dd') : v;
    }
    let vacia = true;
    for (let c = 0; c < cab.length; c++) { if (cab[c] && String(crudos[i][c]).length) { vacia = false; break; } }
    if (!vacia) fuera.push(o);
  }
  return fuera;
}

/** Lee una tabla y la devuelve indexada por id. */
function indexar_(lista, campo) {
  const m = {};
  (lista || []).forEach(function (x) { m[String(x[campo || 'id'])] = x; });
  return m;
}

function cabeceras_(nombre) {
  const h = hoja_(nombre);
  return h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].filter(String);
}

/* ---------- escritura ---------- */

/** Añade una fila a partir de un objeto. Devuelve el objeto con su id. */
function insertar_(nombre, obj) {
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  if (cab.indexOf('id') >= 0 && !obj.id) obj.id = nuevoId_(nombre);
  const fila = cab.map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : obj[c]; });
  h.appendRow(fila);
  return obj;
}

/** Actualiza por id solo los campos que vengan en el objeto. */
function actualizar_(nombre, id, cambios) {
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  const col = cab.indexOf('id') + 1;
  if (!col) throw new Error('La tabla ' + nombre + ' no tiene columna id.');
  const n = h.getLastRow();
  if (n < 2) return null;
  const ids = h.getRange(2, col, n - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      const fila = i + 2;
      const actual = h.getRange(fila, 1, 1, cab.length).getValues()[0];
      cab.forEach(function (c, j) {
        if (Object.prototype.hasOwnProperty.call(cambios, c)) actual[j] = cambios[c];
      });
      h.getRange(fila, 1, 1, cab.length).setValues([actual]);
      const o = {};
      cab.forEach(function (c, j) { o[c] = actual[j]; });
      return o;
    }
  }
  return null;
}

function borrar_(nombre, id) {
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  const col = cab.indexOf('id') + 1;
  const n = h.getLastRow();
  if (n < 2) return false;
  const ids = h.getRange(2, col, n - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) { h.deleteRow(i + 2); return true; }
  }
  return false;
}

/* Escribe muchas filas de golpe. Para el volcado inicial y los procesos. */
function insertarLote_(nombre, objetos) {
  if (!objetos || !objetos.length) return 0;
  const h = hoja_(nombre);
  const cab = cabeceras_(nombre);
  /* Los identificadores se piden de golpe: un solo candado para todo el lote,
     no uno por fila. Con extractos de cientos de apuntes la diferencia es de
     minutos a segundos. */
  let sueltos = [];
  if (cab.indexOf('id') >= 0) {
    const faltan = objetos.filter(function (o) { return !o.id; }).length;
    sueltos = faltan ? nuevosIds_(nombre, faltan) : [];
  }
  let siguiente = 0;
  const filas = objetos.map(function (obj) {
    if (cab.indexOf('id') >= 0 && !obj.id) obj.id = sueltos[siguiente++];
    return cab.map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : obj[c]; });
  });
  h.getRange(h.getLastRow() + 1, 1, filas.length, cab.length).setValues(filas);
  return filas.length;
}

/* ---------- identificadores ---------- */

const PREFIJO = {
  USUARIOS:'U', CLIENTES:'C', OPERACIONES:'OP', COBROS:'CO', FACTURAS:'F',
  GASTOS:'G', SEGUIMIENTO:'S', CAPTACIONES:'CA', PARTES:'P', NOMINAS:'N', JORNADAS:'J',
  BANCO:'B', VACACIONES:'V', SESIONES:'SE', LOG:'L'
};

/** Identificador corto, legible y único: C-000412. */
function nuevoId_(nombre) { return nuevosIds_(nombre, 1)[0]; }

/** Reserva n identificadores seguidos con un unico candado. */
function nuevosIds_(nombre, n) {
  const cuantos = Math.max(1, Number(n) || 1);
  const clave = 'SEQ_' + nombre;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let desde;
  try {
    desde = Number(PROPS.getProperty(clave) || 0) + 1;
    PROPS.setProperty(clave, String(desde + cuantos - 1));
  } finally { lock.releaseLock(); }
  const pref = (PREFIJO[nombre] || 'X') + '-';
  const ids = [];
  for (let i = 0; i < cuantos; i++) ids.push(pref + String(desde + i).padStart(6, '0'));
  return ids;
}

/* ---------- fechas y números ---------- */

function zonaHoraria_() { return 'Europe/Madrid'; }

function hoyISO_() { return Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyy-MM-dd'); }

function ahora_() { return Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyy-MM-dd HH:mm:ss'); }

function mesDe_(iso) { return String(iso || '').slice(0, 7); }

function fecha_(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function diasEntre_(isoA, isoB) {
  const a = fecha_(isoA), b = fecha_(isoB);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

function sumarDias_(iso, dias) {
  const d = fecha_(iso);
  if (!d) return '';
  d.setDate(d.getDate() + Number(dias || 0));
  return Utilities.formatDate(d, zonaHoraria_(), 'yyyy-MM-dd');
}

/** Convierte a número lo que venga: "12.345,67 €" -> 12345.67 */
function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v == null ? '' : v).replace(/[^\d,.\-]/g, '').trim();
  if (!s) return 0;
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.')
                                                : s.replace(/,/g, '');
  } else if (s.indexOf(',') >= 0) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function txt_(v) { return String(v == null ? '' : v).trim(); }

function normal_(v) {
  return txt_(v).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function redondear_(n, d) {
  const f = Math.pow(10, d === undefined ? 2 : d);
  return Math.round(Number(n || 0) * f) / f;
}

function pct_(parte, total) {
  const t = Number(total || 0);
  return t ? redondear_(Number(parte || 0) * 100 / t, 1) : 0;
}

/* ---------- claves y sesiones ---------- */

const ALFABETO = 'abcdefghijkmnopqrstuvwxyz23456789ACDEFGHJKLMNPQRSTUVWXYZ';

/** Clave de 10 caracteres, números y letras, sin los que se confunden. */
function claveAleatoria_(largo) {
  const n = largo || LARGO_CLAVE;
  let s = '';
  const bytes = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (let i = 0; i < n; i++) {
    const r = Math.floor(Math.random() * ALFABETO.length + parseInt(bytes.charAt(i), 16)) % ALFABETO.length;
    s += ALFABETO.charAt(r);
  }
  /* Garantiza al menos un número y una letra. */
  if (!/\d/.test(s)) s = '2' + s.slice(1);
  if (!/[a-zA-Z]/.test(s)) s = s.slice(0, -1) + 'k';
  return s;
}

function sal_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }

function hash_(clave, sal) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, 'zw|' + sal + '|' + clave, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b & 0xff) + 0x100).toString(16).slice(1); }).join('');
}

function token_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

/* ---------- registro de actividad ---------- */

function registrar_(usuario, accion, entidad, entidadId, detalle) {
  try {
    hoja_('LOG').appendRow([ahora_(),
      usuario ? usuario.id : '', usuario ? usuario.usuario : '',
      accion, entidad || '', entidadId || '',
      typeof detalle === 'string' ? detalle : JSON.stringify(detalle || '')]);
  } catch (e) { /* el registro nunca puede tumbar una operación */ }
}

/* ---------- configuración ---------- */

function config_() {
  const c = {};
  leer_('CONFIG').forEach(function (r) { c[r.clave] = r.valor; });
  return c;
}

function configNum_(clave, porDefecto) {
  const c = config_();
  return c[clave] === undefined || c[clave] === '' ? Number(porDefecto || 0) : num_(c[clave]);
}


/* ==========================================================================
   02_Instalar.gs
   ========================================================================== */

/**
 * 02_Instalar.gs — Puesta en marcha y mantenimiento del esquema.
 *
 * Se ejecuta UNA vez desde el editor de Apps Script: crea la hoja de
 * cálculo con todas las pestañas, la configuración de la casa y los seis
 * usuarios con sus claves. Las claves aparecen en la pestaña
 * CLAVES_INICIALES y en el registro de ejecución.
 */

function instalar() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let id = PROPS.getProperty('ID_BASE');
    let ss;
    if (id) {
      ss = SpreadsheetApp.openById(id);
    } else {
      ss = SpreadsheetApp.create(NOMBRE_BASE);
      id = ss.getId();
      PROPS.setProperty('ID_BASE', id);
      const primera = ss.getSheets()[0];
      primera.setName('_LEEME');
      primera.getRange('A1').setValue('Base de datos del CRM de ZERO WATTIOS. No edites las pestañas a mano salvo que sepas lo que haces.');
      primera.getRange('A1').setFontWeight('bold');
    }

    /* Pestañas y columnas: crea lo que falte, respeta lo que ya está. */
    Object.keys(ESQUEMA).forEach(function (nombre) {
      let h = ss.getSheetByName(nombre);
      if (!h) h = ss.insertSheet(nombre);
      const cols = ESQUEMA[nombre];
      const anchoActual = Math.max(h.getLastColumn(), 1);
      const cabActual = h.getRange(1, 1, 1, anchoActual).getValues()[0].filter(String);
      if (!cabActual.length) {
        h.getRange(1, 1, 1, cols.length).setValues([cols]);
      } else {
        const faltan = cols.filter(function (c) { return cabActual.indexOf(c) < 0; });
        if (faltan.length) {
          h.getRange(1, cabActual.length + 1, 1, faltan.length).setValues([faltan]);
        }
      }
      const ancho = Math.max(h.getLastColumn(), cols.length);
      h.getRange(1, 1, 1, ancho)
        .setFontWeight('bold').setBackground('#242422').setFontColor('#B4FA1E');
      h.setFrozenRows(1);
    });

    /* Configuración de la casa. */
    const yaConfig = {};
    leer_('CONFIG').forEach(function (r) { yaConfig[r.clave] = true; });
    const nuevas = CONFIG_INICIAL.filter(function (f) { return !yaConfig[f[0]]; });
    if (nuevas.length) {
      const h = hoja_('CONFIG');
      h.getRange(h.getLastRow() + 1, 1, nuevas.length, 3).setValues(nuevas);
    }

    /* Usuarios y claves. */
    const existentes = {};
    leer_('USUARIOS').forEach(function (u) { existentes[normal_(u.usuario)] = true; });
    const claves = [];
    const cfg = config_();
    USUARIOS_INICIALES.forEach(function (u) {
      if (existentes[normal_(u.usuario)]) return;
      const clave = claveAleatoria_(LARGO_CLAVE);
      const salt = sal_();
      insertar_('USUARIOS', {
        nombre: u.nombre, usuario: u.usuario, email: u.email, telefono: '',
        rol: u.rol, activo: 'si', hash: hash_(clave, salt), salt: salt,
        creado: ahora_(), ultimo_acceso: '', debe_cambiar_clave: 'si',
        salario_bruto: u.rol === 'comercial' ? 1500 : (u.rol === 'captador' ? 1300 : 2000),
        dietas_mes: 150, irpf_pct: 15, ss_pct: 6.35,
        /* Un captador no cierra ventas: su comisión de venta va a cero y
           cobra por captar, como todo el mundo. */
        comision_fv: u.rol === 'captador' ? 0 : num_(u.venta || cfg.comision_fv || 400),
        comision_aero: u.rol === 'captador' ? 0 : num_(u.venta || cfg.comision_aero || 400),
        comision_fv_ajustada: u.rol === 'captador' ? 0 : num_(cfg.comision_fv_ajustada || 200),
        comision_aero_ajustada: u.rol === 'captador' ? 0 : num_(cfg.comision_aero_ajustada || 200),
        comision_captacion_fv: num_(cfg.comision_captacion_fv || 400),
        comision_captacion_aero: num_(cfg.comision_captacion_aero || 400),
        comision_equipo_fv: num_(u.equipo || 0),
        comision_equipo_aero: num_(u.equipo || 0),
        responsable_id: '',
        objetivo_mes: u.rol === 'captador' ? num_(cfg.objetivo_captador || 60) : num_(cfg.objetivo_comercial || 6),
        jornada_horas: 7.5, fecha_alta: hoyISO_(), color: '',
        notas: u.nivel ? 'Comercial ' + u.nivel : ''
      });
      claves.push([u.nombre, u.usuario, u.rol, clave]);
    });

    /* Los responsables se enlazan al final, cuando ya existen todos. */
    const porUsuario = {};
    leer_('USUARIOS').forEach(function (x) { porUsuario[normal_(x.usuario)] = x; });
    USUARIOS_INICIALES.forEach(function (u) {
      if (!u.responsable) return;
      const yo = porUsuario[normal_(u.usuario)], jefe = porUsuario[normal_(u.responsable)];
      if (yo && jefe && !txt_(yo.responsable_id)) {
        actualizar_('USUARIOS', yo.id, {responsable_id: jefe.id});
      }
    });

    if (claves.length) {
      let hc = ss.getSheetByName('CLAVES_INICIALES');
      if (!hc) hc = ss.insertSheet('CLAVES_INICIALES');
      if (hc.getLastRow() < 1) {
        hc.getRange(1, 1, 1, 4).setValues([['Nombre', 'Usuario', 'Rol', 'Clave inicial']])
          .setFontWeight('bold').setBackground('#242422').setFontColor('#B4FA1E');
      }
      hc.getRange(hc.getLastRow() + 1, 1, claves.length, 4).setValues(claves);
      hc.autoResizeColumns(1, 4);
      Logger.log('CLAVES INICIALES\n' + claves.map(function (c) {
        return c[0] + ' (' + c[1] + ', ' + c[2] + '): ' + c[3];
      }).join('\n'));
    }

    Logger.log('Instalación correcta. Hoja de cálculo: ' + ss.getUrl());
    return ss.getUrl();
  } finally { lock.releaseLock(); }
}

/** Vuelve a generar la clave de un usuario. Devuelve la nueva en el registro. */
function regenerarClave(usuario) {
  const u = leer_('USUARIOS').filter(function (x) { return normal_(x.usuario) === normal_(usuario); })[0];
  if (!u) { Logger.log('No existe el usuario ' + usuario); return ''; }
  const clave = claveAleatoria_(LARGO_CLAVE);
  const salt = sal_();
  actualizar_('USUARIOS', u.id, {hash: hash_(clave, salt), salt: salt, debe_cambiar_clave: 'si'});
  Logger.log('Nueva clave de ' + u.usuario + ': ' + clave);
  return clave;
}

/** Dirección de la hoja de cálculo, por comodidad. */
function abrirBase() {
  Logger.log(libro_().getUrl());
  return libro_().getUrl();
}

/**
 * Datos de ejemplo para probar el CRM antes de meter clientes reales.
 * Ejecutar solo en pruebas: crea clientes, operaciones, cobros y gastos
 * ficticios. borrarDemo() los quita todos.
 */
function cargarDemo() {
  const us = indexar_(leer_('USUARIOS').map(function (u) { return u; }), 'usuario');
  const nando = (leer_('USUARIOS').filter(function (u) { return u.usuario === 'nando'; })[0] || {}).id;
  const rober = (leer_('USUARIOS').filter(function (u) { return u.usuario === 'rober'; })[0] || {}).id;
  const sandra = (leer_('USUARIOS').filter(function (u) { return u.usuario === 'sandra'; })[0] || {}).id;
  const abraham = (leer_('USUARIOS').filter(function (u) { return u.usuario === 'abraham'; })[0] || {}).id;

  const municipios = [
    ['Tres Cantos', 40.6006, -3.7106], ['Galapagar', 40.5761, -4.0000],
    ['Alcorcón', 40.3459, -3.8248], ['Pinto', 40.2419, -3.6997],
    ['Las Rozas', 40.4923, -3.8740], ['Colmenar Viejo', 40.6588, -3.7658],
    ['Villamanrique de Tajo', 40.0894, -3.2372], ['Boadilla del Monte', 40.4058, -3.8776]
  ];
  const nombres = ['Adrián Ruiz','Marta Sanz','Javier Nieto','Lucía Pardo','Óscar Ibáñez',
    'Elena Vidal','Rafael Cano','Nuria Gil','Tomás Bravo','Sara Moreno',
    'Pedro Alonso','Ana Lara','Víctor Rey','Carmen Soto','Luis Ferrer','Pilar Duque'];

  const hoy = new Date();
  const creados = [];
  nombres.forEach(function (n, i) {
    const m = municipios[i % municipios.length];
    const dias = 120 - i * 7;
    const f = new Date(hoy.getTime() - dias * 86400000);
    const fISO = Utilities.formatDate(f, zonaHoraria_(), 'yyyy-MM-dd');
    const comercial = i % 2 ? rober : nando;
    const captador = i % 3 === 0 ? sandra : (i % 3 === 1 ? abraham : '');
    const estados = ['ganado','ganado','propuesta','sentada','negociando','perdido','cita','ganado'];
    const estado = estados[i % estados.length];
    const c = insertar_('CLIENTES', {
      creado: fISO, creado_por: captador || comercial,
      comercial_id: comercial, captador_id: captador,
      nombre: n, dni: '', cotitular: '', telefono: '6' + (10000000 + i * 137).toString().slice(0, 8),
      email: normal_(n).replace(/ /g, '.') + '@ejemplo.com',
      direccion: 'Calle Ejemplo ' + (i + 3), municipio: m[0], cp: '28' + (100 + i),
      coordenadas: redondear_(m[1] + (i % 5) * 0.004, 6) + ',' + redondear_(m[2] + (i % 4) * 0.005, 6),
      tipo_vivienda: 'Chalet', regimen: 'Propietario', m2: 140 + i * 8, personas: 3 + (i % 3),
      anyo: '1980-2007', calefaccion: i % 2 ? 'Gasóleo' : 'Gas natural',
      gasto_combustible: 1400 + i * 90, periodo_combustible: 'al año',
      gasto_luz_mes: 80 + i * 6, comercializadora: 'Iberdrola', cups: '',
      potencia_contratada: 5.75, ya_fv: 'No', interes: 5 + (i % 6),
      perfil: 'Cliente de ejemplo para pruebas.', otros: '', origen: captador ? 'captacion' : 'referido',
      estado: estado, fecha_estado: fISO, proxima_accion: estado === 'propuesta' ? 'Llamar para cerrar' : '',
      proxima_fecha: estado === 'propuesta' ? hoyISO_() : '',
      etiquetas: '', modificado: fISO, modificado_por: comercial
    });
    creados.push({c: c, estado: estado, fISO: fISO, comercial: comercial, captador: captador, i: i});
  });

  creados.forEach(function (x) {
    if (['ganado','propuesta','negociando','perdido'].indexOf(x.estado) < 0) return;
    const tipo = x.i % 3 === 0 ? 'fv_aero' : (x.i % 3 === 1 ? 'fv' : 'aero');
    const impFV = tipo === 'aero' ? 0 : (9990 + (x.i % 4) * 1000);
    const impAero = tipo === 'fv' ? 0 : (15990 + (x.i % 4) * 1000);
    const total = impFV + impAero;
    const base = redondear_(total / 1.21, 2);
    const estadoOp = x.estado === 'ganado'
      ? ['instalada','legalizada','material','instalacion'][x.i % 4]
      : (x.estado === 'perdido' ? 'cancelada' : 'propuesta');
    const op = insertar_('OPERACIONES', {
      cliente_id: x.c.id, comercial_id: x.comercial, captador_id: x.captador,
      creado: x.fISO, creado_por: x.comercial, referencia: 'ZW-' + x.fISO.slice(0, 4) + '-' + (100 + x.i),
      tipo: tipo, estado: estadoOp,
      fecha_propuesta: x.fISO, fecha_contrato: x.estado === 'ganado' ? sumarDias_(x.fISO, 3) : '',
      fecha_firma: x.estado === 'ganado' ? sumarDias_(x.fISO, 5) : '',
      fecha_prevista_instalacion: x.estado === 'ganado' ? sumarDias_(x.fISO, 35) : '',
      fecha_instalacion: ['instalada','legalizada'].indexOf(estadoOp) >= 0 ? sumarDias_(x.fISO, 40) : '',
      fecha_legalizacion: estadoOp === 'legalizada' ? sumarDias_(x.fISO, 70) : '',
      forma_pago: x.i % 2 ? 'financiado' : 'contado', financiera: x.i % 2 ? 'Cetelem' : '',
      plazo_meses: x.i % 2 ? 120 : '', cuota: x.i % 2 ? redondear_(total * 0.01234902, 2) : '',
      reserva: x.i % 2 ? 0 : '',
      importe_fv: impFV, importe_aero: impAero, importe_bateria: x.i % 4 === 0 ? 2570 : 0,
      importe_cargador: 0, importe_extras: 0,
      base: base, iva_pct: 21, total: total,
      ayudas_estimadas: tipo === 'fv' ? 3000 : 6000, cae_estimado: tipo === 'fv' ? 0 : 1200,
      paneles_num: impFV ? 12 + (x.i % 5) * 2 : 0, panel_modelo: impFV ? 'Hanersun 630W' : '',
      panel_wp: impFV ? 630 : '', inversor_modelo: impFV ? 'SolaX X1 Hybrid' : '', inversor_kw: impFV ? 6 : '',
      bateria_kwh: x.i % 4 === 0 ? 5.3 : 0, bateria_modelo: x.i % 4 === 0 ? 'SolaX T-BAT 5.3' : '',
      cargador_modelo: '', aero_kw: impAero ? [12, 16, 19, 22][x.i % 4] : '',
      aero_modelo: impAero ? 'Fusion' : '', deposito_acs: impAero ? 200 : '',
      deposito_inercia: impAero ? 100 : '', suelo_radiante: 'no', tejado: 'teja',
      beneficio_no_economico: x.estado === 'ganado' ? 'Cliente prescriptor en la urbanización' : '',
      observaciones: 'Operación de ejemplo.', motivo_perdida: x.estado === 'perdido' ? 'Precio' : '',
      modificado: hoyISO_(), modificado_por: x.comercial
    });

    if (x.estado === 'ganado') {
      const tramos = [['firma', 0.5, 5], ['material', 0.25, 30], ['final', 0.25, 45]];
      tramos.forEach(function (t, k) {
        const prev = sumarDias_(x.fISO, t[2]);
        const cobrado = diasEntre_(prev, hoyISO_()) > 0 && (x.i + k) % 4 !== 0;
        insertar_('COBROS', {
          operacion_id: op.id, concepto: t[0], importe: redondear_(total * t[1], 2),
          fecha_prevista: prev, fecha_cobro: cobrado ? sumarDias_(prev, (x.i % 12)) : '',
          estado: cobrado ? 'cobrado' : (diasEntre_(prev, hoyISO_()) > 0 ? 'vencido' : 'previsto'),
          metodo: 'transferencia', factura_id: '', notas: '', creado: x.fISO, creado_por: x.comercial
        });
      });
      const costeMat = redondear_(total * (0.42 + (x.i % 5) * 0.01), 2);
      insertar_('GASTOS', {operacion_id: op.id, categoria: impFV ? 'material_fv' : 'material_aero',
        proveedor: 'Proveedor Demo', concepto: 'Material de la instalación', importe: costeMat,
        iva_pct: 21, fecha: sumarDias_(x.fISO, 20), estado_pago: 'pagado',
        fecha_pago: sumarDias_(x.fISO, 50), factura_proveedor: '', creado: x.fISO,
        creado_por: 'demo', notas: ''});
      insertar_('GASTOS', {operacion_id: op.id, categoria: 'montaje', proveedor: 'Greenfield Solar',
        concepto: 'Montaje', importe: redondear_(total * 0.12, 2), iva_pct: 21,
        fecha: sumarDias_(x.fISO, 40), estado_pago: (x.i % 3 ? 'pagado' : 'pendiente'),
        fecha_pago: (x.i % 3 ? sumarDias_(x.fISO, 60) : ''), factura_proveedor: '',
        creado: x.fISO, creado_por: 'demo', notas: ''});
      insertar_('GASTOS', {operacion_id: op.id, categoria: 'comision', proveedor: '',
        concepto: 'Comisión comercial', importe: tipo === 'fv_aero' ? 800 : 400, iva_pct: 0,
        fecha: sumarDias_(x.fISO, 30), estado_pago: 'pagado', fecha_pago: sumarDias_(x.fISO, 30),
        factura_proveedor: '', creado: x.fISO, creado_por: 'demo', notas: ''});
      insertar_('FACTURAS', {numero: 'ZW/' + x.fISO.slice(0, 4) + '/' + (100 + x.i),
        operacion_id: op.id, cliente_id: x.c.id, fecha_emision: sumarDias_(x.fISO, 5),
        concepto: 'Instalación ' + tipo.toUpperCase(), base: base, iva_pct: 21,
        iva: redondear_(total - base, 2), total: total,
        estado: x.i % 4 ? 'cobrada' : 'enviada', fecha_vencimiento: sumarDias_(x.fISO, 35),
        fecha_cobro: x.i % 4 ? sumarDias_(x.fISO, 30) : '', url: '', emitida_por: 'demo', notas: ''});
    }

    insertar_('SEGUIMIENTO', {cliente_id: x.c.id, operacion_id: op.id, usuario_id: x.comercial,
      fecha: sumarDias_(x.fISO, 2), canal: 'llamada', nota: 'Repaso de la propuesta con el cliente.',
      proximo_paso: 'Confirmar financiación', proxima_fecha: sumarDias_(x.fISO, 9),
      estado_resultante: x.estado, origen: 'demo', creado: ahora_()});
  });

  creados.filter(function (x) { return x.captador; }).forEach(function (x) {
    insertar_('CAPTACIONES', {cliente_id: x.c.id, captador_id: x.captador, fecha: x.fISO,
      hora_cita: '17:00', estado_cita: 'confirmada',
      tecnologia: x.i % 3 === 0 ? 'AEROTERMIA + FOTOVOLTAICA' : 'AEROTERMIA',
      comercial_id: x.comercial,
      resultado: x.estado === 'ganado' ? 'venta' : (x.estado === 'perdido' ? 'no_sentada' : 'sentada'),
      fecha_resultado: sumarDias_(x.fISO, 6), operacion_id: '', interes: 5 + (x.i % 6),
      notas: 'Captación de ejemplo.', creado: ahora_()});
  });

  Logger.log('Datos de ejemplo cargados: ' + creados.length + ' clientes.');
  return creados.length;
}

/** Borra todo lo que haya creado cargarDemo (y cualquier dato de las tablas operativas). */
function borrarDemo() {
  ['CLIENTES','OPERACIONES','COBROS','FACTURAS','GASTOS','SEGUIMIENTO','CAPTACIONES','PARTES','NOMINAS','JORNADAS']
    .forEach(function (t) {
      const h = hoja_(t);
      if (h.getLastRow() > 1) h.deleteRows(2, h.getLastRow() - 1);
    });
  Logger.log('Tablas operativas vaciadas.');
}


/* ==========================================================================
   03_Auth.gs
   ========================================================================== */

/**
 * 03_Auth.gs — Identidad, sesiones y permisos.
 *
 * Regla de oro: el navegador no decide nada. Cada petición llega con un
 * token, aquí se convierte en un usuario con un rol, y a partir de ahí
 * el servidor filtra lo que esa persona puede ver y hacer.
 */

/* ---------- entrada ---------- */

function accLogin_(p) {
  const usuario = normal_(p.usuario);
  const clave = txt_(p.clave);
  if (!usuario || !clave) return {ok: false, error: 'Falta el usuario o la clave.'};

  const u = leer_('USUARIOS').filter(function (x) { return normal_(x.usuario) === usuario; })[0];
  if (!u || hash_(clave, u.salt) !== txt_(u.hash)) {
    Utilities.sleep(700);                       // frena la prueba de claves a lo bruto
    registrar_(null, 'login_fallido', 'USUARIOS', usuario, '');
    return {ok: false, error: 'Usuario o clave incorrectos.'};
  }
  if (normal_(u.activo) !== 'si') return {ok: false, error: 'Este usuario está desactivado.'};

  const tk = token_();
  insertar_('SESIONES', {
    token: tk, usuario_id: u.id, creado: ahora_(),
    expira: Utilities.formatDate(new Date(Date.now() + HORAS_SESION * 3600000), zonaHoraria_(), 'yyyy-MM-dd HH:mm:ss'),
    agente: txt_(p.agente).slice(0, 120)
  });
  actualizar_('USUARIOS', u.id, {ultimo_acceso: ahora_()});
  limpiarSesiones_();
  registrar_(u, 'login', 'USUARIOS', u.id, '');

  return {ok: true, token: tk, usuario: publico_(u), permisos: PERMISOS[u.rol] || PERMISOS.captador,
          catalogo: CATALOGO, config: configVisible_(u), version: VERSION};
}

function accSalir_(u, p) {
  const h = hoja_('SESIONES');                // la tabla SESIONES se indexa por token
  const n = h.getLastRow();
  if (n > 1) {
    const tk = h.getRange(2, 1, n - 1, 1).getDisplayValues();
    for (let i = 0; i < tk.length; i++) {
      if (tk[i][0] === p.token) { h.deleteRow(i + 2); break; }
    }
  }
  registrar_(u, 'salir', 'USUARIOS', u.id, '');
  return {ok: true};
}

/** Devuelve el usuario de una petición o null si el token no vale. */
function sesion_(token) {
  const tk = txt_(token);
  if (!tk) return null;
  const s = leer_('SESIONES').filter(function (x) { return txt_(x.token) === tk; })[0];
  if (!s) return null;
  if (txt_(s.expira) && txt_(s.expira) < ahora_()) return null;
  const u = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(s.usuario_id); })[0];
  if (!u || normal_(u.activo) !== 'si') return null;
  return u;
}

function limpiarSesiones_() {
  const h = hoja_('SESIONES');
  const n = h.getLastRow();
  if (n < 3) return;
  const datos = h.getRange(2, 1, n - 1, 4).getDisplayValues();
  const ahora = ahora_();
  for (let i = datos.length - 1; i >= 0; i--) {
    if (datos[i][3] && datos[i][3] < ahora) h.deleteRow(i + 2);
  }
}

/** Datos del usuario que sí pueden salir del servidor (nunca el hash). */
function publico_(u) {
  return {
    id: u.id, nombre: u.nombre, usuario: u.usuario, email: u.email, telefono: u.telefono,
    rol: u.rol, activo: u.activo, ultimo_acceso: u.ultimo_acceso,
    debe_cambiar_clave: u.debe_cambiar_clave, fecha_alta: u.fecha_alta,
    objetivo_mes: num_(u.objetivo_mes), jornada_horas: num_(u.jornada_horas) || 7.5,
    color: u.color
  };
}

/** Además de lo público, lo que solo ve quien puede ver nóminas. */
function publicoConNomina_(u) {
  const o = publico_(u);
  o.salario_bruto = num_(u.salario_bruto);
  o.dietas_mes = num_(u.dietas_mes);
  o.irpf_pct = num_(u.irpf_pct);
  o.ss_pct = num_(u.ss_pct);
  o.comision_fv = num_(u.comision_fv);
  o.comision_aero = num_(u.comision_aero);
  o.comision_fv_ajustada = num_(u.comision_fv_ajustada);
  o.comision_aero_ajustada = num_(u.comision_aero_ajustada);
  o.comision_captacion_fv = num_(u.comision_captacion_fv);
  o.comision_captacion_aero = num_(u.comision_captacion_aero);
  o.comision_equipo_fv = num_(u.comision_equipo_fv);
  o.comision_equipo_aero = num_(u.comision_equipo_aero);
  o.responsable_id = txt_(u.responsable_id);
  o.notas = u.notas;
  return o;
}

function permisos_(u) { return PERMISOS[u.rol] || PERMISOS.captador; }

function exigir_(u, permiso) {
  if (!permisos_(u)[permiso]) throw new Error('Tu usuario no tiene acceso a esta parte del CRM.');
}

/** Configuración que se le manda al navegador según el rol. */
function configVisible_(u) {
  const c = config_();
  if (permisos_(u).finanzas) return c;
  const fuera = ['coste_estructura_mes', 'margen_objetivo_pct'];
  const o = {};
  Object.keys(c).forEach(function (k) { if (fuera.indexOf(k) < 0) o[k] = c[k]; });
  return o;
}

/* ---------- alcance: qué clientes ve cada uno ---------- */

/** ¿Puede este usuario ver este cliente? */
function veCliente_(u, cli) {
  const p = permisos_(u);
  if (p.alcance === 'todo') return true;
  if (p.alcance === 'comercial') return String(cli.comercial_id) === String(u.id);
  if (p.alcance === 'captador') return String(cli.captador_id) === String(u.id);
  return false;
}

function veOperacion_(u, op) {
  const p = permisos_(u);
  if (p.alcance === 'todo') return true;
  if (p.alcance === 'comercial') return String(op.comercial_id) === String(u.id);
  if (p.alcance === 'captador') return String(op.captador_id) === String(u.id);
  return false;
}

/** Lista de clientes ya filtrada. */
function misClientes_(u) {
  return leer_('CLIENTES').filter(function (c) { return veCliente_(u, c); });
}

function misOperaciones_(u) {
  return leer_('OPERACIONES').filter(function (op) { return veOperacion_(u, op); });
}

/* ---------- cambio de clave y gestión de usuarios ---------- */

function accCambiarClave_(u, p) {
  const actual = txt_(p.actual), nueva = txt_(p.nueva);
  if (nueva.length < 8) return {ok: false, error: 'La clave nueva debe tener al menos 8 caracteres.'};
  const fila = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(u.id); })[0];
  if (hash_(actual, fila.salt) !== txt_(fila.hash)) return {ok: false, error: 'La clave actual no es correcta.'};
  const salt = sal_();
  actualizar_('USUARIOS', u.id, {hash: hash_(nueva, salt), salt: salt, debe_cambiar_clave: 'no'});
  registrar_(u, 'cambio_clave', 'USUARIOS', u.id, '');
  return {ok: true};
}

function accUsuarios_(u, p) {
  const todos = leer_('USUARIOS');
  const per = permisos_(u);
  if (per.nominasAjenas) {
    return {ok: true, usuarios: todos.map(publicoConNomina_)};
  }
  /* Comerciales y captadores solo ven la lista de nombres del equipo y su
     propia ficha completa, para poder asignar y para ver su nómina. */
  return {ok: true, usuarios: todos.map(function (x) {
    return String(x.id) === String(u.id) ? publicoConNomina_(x) : publico_(x);
  })};
}

function accGuardarUsuario_(u, p) {
  exigir_(u, 'usuarios');
  const d = p.usuario || {};
  const campos = ['nombre','usuario','email','telefono','rol','activo','salario_bruto','dietas_mes',
    'irpf_pct','ss_pct','comision_fv','comision_aero','comision_fv_ajustada','comision_aero_ajustada',
    'comision_captacion_fv','comision_captacion_aero',
    'responsable_id','comision_equipo_fv','comision_equipo_aero',
    'objetivo_mes','jornada_horas','fecha_alta','color','notas'];
  const cambios = {};
  campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
  if (cambios.rol && ROLES.indexOf(cambios.rol) < 0) return {ok: false, error: 'Rol desconocido.'};

  if (d.id) {
    const r = actualizar_('USUARIOS', d.id, cambios);
    registrar_(u, 'editar_usuario', 'USUARIOS', d.id, cambios);
    return {ok: true, usuario: publicoConNomina_(r)};
  }
  if (!txt_(d.usuario)) return {ok: false, error: 'Falta el nombre de usuario.'};
  const repetido = leer_('USUARIOS').some(function (x) { return normal_(x.usuario) === normal_(d.usuario); });
  if (repetido) return {ok: false, error: 'Ya existe un usuario con ese nombre.'};
  const clave = claveAleatoria_(LARGO_CLAVE);
  const salt = sal_();
  cambios.hash = hash_(clave, salt);
  cambios.salt = salt;
  cambios.creado = ahora_();
  cambios.debe_cambiar_clave = 'si';
  cambios.activo = cambios.activo || 'si';
  const nuevo = insertar_('USUARIOS', cambios);
  registrar_(u, 'alta_usuario', 'USUARIOS', nuevo.id, {usuario: d.usuario, rol: d.rol});
  return {ok: true, usuario: publicoConNomina_(nuevo), clave: clave};
}

function accResetClave_(u, p) {
  exigir_(u, 'usuarios');
  const clave = claveAleatoria_(LARGO_CLAVE);
  const salt = sal_();
  const r = actualizar_('USUARIOS', p.id, {hash: hash_(clave, salt), salt: salt, debe_cambiar_clave: 'si'});
  if (!r) return {ok: false, error: 'No existe ese usuario.'};
  registrar_(u, 'reset_clave', 'USUARIOS', p.id, '');
  return {ok: true, clave: clave};
}


/* ==========================================================================
   04_Clientes.gs
   ========================================================================== */

/**
 * 04_Clientes.gs — Clientes, operaciones, seguimiento y captaciones.
 *
 * El navegador pide una foto completa de lo que esa persona puede ver
 * (accDatos_) y a partir de ahí trabaja en local. Cada guardado vuelve
 * al servidor, que es quien comprueba de nuevo si puede tocar esa ficha.
 */

/* ---------- foto de datos ---------- */

function accDatos_(u, p) {
  const per = permisos_(u);
  const clientes = misClientes_(u);
  const visibles = {};
  clientes.forEach(function (c) { visibles[String(c.id)] = true; });

  const operaciones = leer_('OPERACIONES').filter(function (op) {
    return veOperacion_(u, op) || visibles[String(op.cliente_id)];
  });
  const opVisibles = {};
  operaciones.forEach(function (op) { opVisibles[String(op.id)] = true; });

  const seguimiento = leer_('SEGUIMIENTO').filter(function (s) { return visibles[String(s.cliente_id)]; });
  const captaciones = leer_('CAPTACIONES').filter(function (c) { return visibles[String(c.cliente_id)]; });

  const salida = {
    ok: true,
    usuario: publico_(u),
    permisos: per,
    catalogo: CATALOGO,
    config: configVisible_(u),
    usuarios: leer_('USUARIOS').map(publico_),
    clientes: clientes,
    operaciones: operaciones,
    seguimiento: seguimiento,
    captaciones: captaciones,
    servidor: ahora_(),
    version: VERSION
  };

  /* La parte financiera solo viaja si el rol la tiene abierta. */
  if (per.finanzas) {
    salida.cobros = leer_('COBROS');
    salida.facturas = leer_('FACTURAS');
    salida.gastos = leer_('GASTOS');
  } else {
    /* Un comercial sí ve el calendario de cobro de SUS operaciones,
       porque necesita saber si el cliente ha pagado la entrada. */
    salida.cobros = leer_('COBROS').filter(function (c) { return opVisibles[String(c.operacion_id)]; })
      .map(function (c) {
        return {id: c.id, operacion_id: c.operacion_id, concepto: c.concepto, importe: c.importe,
                fecha_prevista: c.fecha_prevista, fecha_cobro: c.fecha_cobro, estado: c.estado};
      });
    salida.facturas = [];
    salida.gastos = [];
  }
  return salida;
}

/* El coste y el margen de una instalación no viven en la operación, sino en
   la tabla GASTOS, que solo viaja a quien tiene las finanzas abiertas. Por eso
   la operación se envía entera: lo que enseña son importes de venta, que el
   comercial necesita. */

/* ---------- clientes ---------- */

function accGuardarCliente_(u, p) {
  const d = p.cliente || {};
  const per = permisos_(u);
  const campos = ESQUEMA.CLIENTES.filter(function (c) {
    return ['id','creado','creado_por','modificado','modificado_por'].indexOf(c) < 0;
  });

  if (d.id) {
    const actual = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(d.id); })[0];
    if (!actual) return {ok: false, error: 'Ese cliente ya no existe.'};
    if (!veCliente_(u, actual)) return {ok: false, error: 'Ese cliente no es tuyo.'};
    const cambios = {modificado: ahora_(), modificado_por: u.id};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    /* Nadie que no sea jefe puede regalarse o quitarse un cliente. */
    if (!per.editarTodo) { delete cambios.comercial_id; delete cambios.captador_id; }
    if (cambios.estado && cambios.estado !== actual.estado) cambios.fecha_estado = hoyISO_();
    const r = actualizar_('CLIENTES', d.id, cambios);
    registrar_(u, 'editar_cliente', 'CLIENTES', d.id, cambios.estado || '');
    return {ok: true, cliente: r};
  }

  const nuevo = {creado: hoyISO_(), creado_por: u.id, modificado: ahora_(), modificado_por: u.id};
  campos.forEach(function (c) { if (d[c] !== undefined) nuevo[c] = d[c]; });
  if (!txt_(nuevo.nombre)) return {ok: false, error: 'El cliente necesita un nombre.'};
  /* Quien da de alta se queda el cliente, salvo que un jefe diga otra cosa. */
  if (u.rol === 'comercial') nuevo.comercial_id = u.id;
  if (u.rol === 'captador') { nuevo.captador_id = u.id; nuevo.origen = nuevo.origen || 'captacion'; }
  nuevo.estado = nuevo.estado || (u.rol === 'captador' ? 'captado' : 'nuevo');
  nuevo.fecha_estado = hoyISO_();
  const r = insertar_('CLIENTES', nuevo);
  registrar_(u, 'alta_cliente', 'CLIENTES', r.id, r.nombre);
  return {ok: true, cliente: r};
}

function accBorrarCliente_(u, p) {
  exigir_(u, 'editarTodo');
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(p.id); })[0];
  if (!cli) return {ok: false, error: 'No existe.'};
  borrar_('CLIENTES', p.id);
  registrar_(u, 'borrar_cliente', 'CLIENTES', p.id, cli.nombre);
  return {ok: true};
}

/* ---------- operaciones ---------- */

function accGuardarOperacion_(u, p) {
  const d = p.operacion || {};
  const per = permisos_(u);
  const campos = ESQUEMA.OPERACIONES.filter(function (c) {
    return ['id','creado','creado_por','modificado','modificado_por'].indexOf(c) < 0;
  });

  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(d.cliente_id); })[0];
  if (!cli) return {ok: false, error: 'La operación necesita un cliente.'};
  if (!veCliente_(u, cli)) return {ok: false, error: 'Ese cliente no es tuyo.'};

  const calc = totalesOperacion_(d);

  if (d.id) {
    const actual = leer_('OPERACIONES').filter(function (o) { return String(o.id) === String(d.id); })[0];
    if (!actual) return {ok: false, error: 'Esa operación ya no existe.'};
    if (!veOperacion_(u, actual) && !veCliente_(u, cli)) return {ok: false, error: 'Esa operación no es tuya.'};
    const cambios = {modificado: ahora_(), modificado_por: u.id};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    if (!per.editarTodo) { delete cambios.comercial_id; delete cambios.captador_id; }
    cambios.base = calc.base; cambios.total = calc.total;
    const r = actualizar_('OPERACIONES', d.id, cambios);
    sincronizarEstadoCliente_(u, r);
    /* Si cambia el importe y todavía no se ha cobrado nada, el calendario
       de cobros se rehace para que no quede descuadrado. */
    if (Math.abs(num_(actual.total) - calc.total) > 0.01) recalcularCobros_(u, r);
    registrar_(u, 'editar_operacion', 'OPERACIONES', d.id, cambios.estado || '');
    return {ok: true, operacion: r, cobros: cobrosDe_(u, d.id)};
  }

  const nueva = {creado: hoyISO_(), creado_por: u.id, modificado: ahora_(), modificado_por: u.id};
  campos.forEach(function (c) { if (d[c] !== undefined) nueva[c] = d[c]; });
  nueva.comercial_id = per.editarTodo && d.comercial_id ? d.comercial_id : (cli.comercial_id || u.id);
  nueva.captador_id = cli.captador_id || '';
  nueva.base = calc.base; nueva.total = calc.total;
  nueva.estado = nueva.estado || 'propuesta';
  nueva.referencia = nueva.referencia || ('ZW-' + hoyISO_().slice(0, 4) + '-' + Utilities.getUuid().slice(0, 4).toUpperCase());
  const r = insertar_('OPERACIONES', nueva);
  /* Al firmar en contado, el calendario de cobro 50/25/25 se crea solo. */
  if (normal_(r.forma_pago) === 'contado' && num_(r.total) > 0) crearCobrosEstandar_(u, r);
  sincronizarEstadoCliente_(u, r);
  registrar_(u, 'alta_operacion', 'OPERACIONES', r.id, cli.nombre);
  return {ok: true, operacion: r, cobros: cobrosDe_(u, r.id)};
}

/** Suma los importes de la operación y reparte base e IVA. */
function totalesOperacion_(d) {
  const total = num_(d.importe_fv) + num_(d.importe_aero) + num_(d.importe_bateria)
              + num_(d.importe_cargador) + num_(d.importe_extras);
  const iva = num_(d.iva_pct) || 21;
  return {total: redondear_(total, 2), base: redondear_(total / (1 + iva / 100), 2)};
}

/** Cuando una operación se firma o se cae, el cliente cambia de estado. */
function sincronizarEstadoCliente_(u, op) {
  if (!op) return;
  const mapa = {
    propuesta: 'propuesta', firmada: 'ganado', financiacion: 'negociando', tramite: 'ganado',
    material: 'ganado', instalacion: 'ganado', instalada: 'ganado', legalizada: 'ganado',
    cerrada: 'ganado', cancelada: 'perdido'
  };
  const nuevo = mapa[normal_(op.estado)];
  if (!nuevo) return;
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(op.cliente_id); })[0];
  if (cli && normal_(cli.estado) !== nuevo) {
    actualizar_('CLIENTES', cli.id, {estado: nuevo, fecha_estado: hoyISO_(),
      modificado: ahora_(), modificado_por: u.id});
  }
  /* Si venía de una captación, se marca cómo acabó. */
  const cap = leer_('CAPTACIONES').filter(function (c) { return String(c.cliente_id) === String(op.cliente_id); })[0];
  if (cap) {
    const res = nuevo === 'ganado' ? 'venta' : (nuevo === 'perdido' ? 'no_sentada' : 'sentada');
    if (normal_(cap.resultado) !== res) {
      actualizar_('CAPTACIONES', cap.id, {resultado: res, fecha_resultado: hoyISO_(), operacion_id: op.id});
    }
  }
}

function crearCobrosEstandar_(u, op) {
  const total = num_(op.total);
  const firma = txt_(op.fecha_firma) || hoyISO_();
  const tramos = [['firma', 0.5, 0], ['material', 0.25, 25], ['final', 0.25, 45]];
  tramos.forEach(function (t) {
    insertar_('COBROS', {
      operacion_id: op.id, concepto: t[0], importe: redondear_(total * t[1], 2),
      fecha_prevista: sumarDias_(firma, t[2]), fecha_cobro: '', estado: 'previsto',
      metodo: 'transferencia', factura_id: '', notas: 'Generado automáticamente al crear la operación.',
      creado: ahora_(), creado_por: u.id
    });
  });
}

/**
 * Rehace el calendario de cobros de una operación cuando cambia su importe.
 * Solo toca los cobros que aún no se han cobrado: si ya ha entrado dinero,
 * se deja como está y se avisa en el registro.
 */
function recalcularCobros_(u, op) {
  const cobros = leer_('COBROS').filter(function (c) {
    return String(c.operacion_id) === String(op.id); });
  if (!cobros.length) {
    if (normal_(op.forma_pago) === 'contado' && num_(op.total) > 0) crearCobrosEstandar_(u, op);
    return;
  }
  const cobrado = cobros.filter(function (c) { return txt_(c.fecha_cobro); });
  if (cobrado.length) {
    registrar_(u, 'importe_cambiado_con_cobros', 'OPERACIONES', op.id,
      'Revisar a mano el calendario de cobros: ya había dinero cobrado.');
    return;
  }
  cobros.forEach(function (c) { borrar_('COBROS', c.id); });
  if (num_(op.total) > 0) crearCobrosEstandar_(u, op);
}

function cobrosDe_(u, operacionId) {
  return leer_('COBROS').filter(function (c) { return String(c.operacion_id) === String(operacionId); });
}

function accBorrarOperacion_(u, p) {
  exigir_(u, 'editarTodo');
  borrar_('OPERACIONES', p.id);
  registrar_(u, 'borrar_operacion', 'OPERACIONES', p.id, '');
  return {ok: true};
}

/* ---------- seguimiento ---------- */

function accGuardarSeguimiento_(u, p) {
  const d = p.seguimiento || {};
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(d.cliente_id); })[0];
  if (!cli) return {ok: false, error: 'Falta el cliente.'};
  if (!veCliente_(u, cli)) return {ok: false, error: 'Ese cliente no es tuyo.'};

  if (d.id) {
    const cambios = {};
    ['fecha','canal','nota','proximo_paso','proxima_fecha','estado_resultante','operacion_id']
      .forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    const r = actualizar_('SEGUIMIENTO', d.id, cambios);
    return {ok: true, seguimiento: r};
  }

  const nuevo = {
    cliente_id: d.cliente_id, operacion_id: d.operacion_id || '', usuario_id: u.id,
    fecha: d.fecha || hoyISO_(), canal: d.canal || 'llamada', nota: txt_(d.nota),
    proximo_paso: txt_(d.proximo_paso), proxima_fecha: d.proxima_fecha || '',
    estado_resultante: d.estado_resultante || '', origen: d.origen || 'manual', creado: ahora_()
  };
  const r = insertar_('SEGUIMIENTO', nuevo);

  const cambiosCliente = {modificado: ahora_(), modificado_por: u.id};
  if (nuevo.proximo_paso) cambiosCliente.proxima_accion = nuevo.proximo_paso;
  if (nuevo.proxima_fecha) cambiosCliente.proxima_fecha = nuevo.proxima_fecha;
  if (nuevo.estado_resultante) {
    cambiosCliente.estado = nuevo.estado_resultante;
    cambiosCliente.fecha_estado = hoyISO_();
  }
  const clienteActualizado = actualizar_('CLIENTES', cli.id, cambiosCliente);
  registrar_(u, 'seguimiento', 'CLIENTES', cli.id, nuevo.canal);
  return {ok: true, seguimiento: r, cliente: clienteActualizado};
}

/* ---------- captaciones ---------- */

function accGuardarCaptacion_(u, p) {
  const d = p.captacion || {};
  let clienteId = d.cliente_id;

  /* Un captador puede crear cliente y captación de una vez. */
  if (!clienteId && d.cliente) {
    const res = accGuardarCliente_(u, {cliente: d.cliente});
    if (!res.ok) return res;
    clienteId = res.cliente.id;
  }
  const cli = leer_('CLIENTES').filter(function (c) { return String(c.id) === String(clienteId); })[0];
  if (!cli) return {ok: false, error: 'Falta el cliente de la captación.'};
  if (!veCliente_(u, cli)) return {ok: false, error: 'Ese cliente no es tuyo.'};

  const campos = ['fecha','hora_cita','estado_cita','tecnologia','comercial_id','resultado',
                  'fecha_resultado','operacion_id','interes','notas'];
  if (d.id) {
    const anterior = leer_('CAPTACIONES').filter(function (x) { return String(x.id) === String(d.id); })[0];
    const cambios = {};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    const r = actualizar_('CAPTACIONES', d.id, cambios);

    /* Adjudicar la captación a un comercial es lo que hace que ese comercial
       la vea: el cliente pasa a ser suyo. Si se quita, deja de verla. */
    if (d.comercial_id !== undefined &&
        txt_(d.comercial_id) !== txt_(anterior ? anterior.comercial_id : '')) {
      actualizar_('CLIENTES', cli.id, {comercial_id: txt_(d.comercial_id),
        modificado: ahora_(), modificado_por: u.id});
      registrar_(u, 'adjudicar_captacion', 'CAPTACIONES', d.id,
        txt_(d.comercial_id) ? 'a ' + txt_(d.comercial_id) : 'sin comercial');
    }
    /* Si cambia el día de la cita, la ficha del cliente lo refleja. */
    if (txt_(cambios.fecha) && normal_(r.resultado) === 'pendiente') {
      actualizar_('CLIENTES', cli.id, {proxima_accion: 'Sentada concertada',
        proxima_fecha: txt_(cambios.fecha), modificado: ahora_(), modificado_por: u.id});
    }
    return {ok: true, captacion: r};
  }
  const nueva = {cliente_id: clienteId, captador_id: u.rol === 'captador' ? u.id : (d.captador_id || ''),
                 creado: ahora_()};
  campos.forEach(function (c) { nueva[c] = d[c] === undefined ? '' : d[c]; });
  nueva.fecha = nueva.fecha || hoyISO_();
  nueva.resultado = nueva.resultado || 'pendiente';
  const r = insertar_('CAPTACIONES', nueva);

  const cambiosCliente = {estado: 'cita', fecha_estado: hoyISO_(), modificado: ahora_(), modificado_por: u.id};
  if (nueva.comercial_id) cambiosCliente.comercial_id = nueva.comercial_id;
  if (nueva.fecha) { cambiosCliente.proxima_accion = 'Sentada concertada'; cambiosCliente.proxima_fecha = nueva.fecha; }
  actualizar_('CLIENTES', cli.id, cambiosCliente);
  registrar_(u, 'alta_captacion', 'CAPTACIONES', r.id, cli.nombre);
  return {ok: true, captacion: r};
}

/* ---------- búsqueda rápida ---------- */

function accBuscar_(u, p) {
  const q = normal_(p.q);
  if (q.length < 2) return {ok: true, resultados: []};
  const clientes = misClientes_(u);
  const res = clientes.filter(function (c) {
    return normal_(c.nombre).indexOf(q) >= 0 || normal_(c.direccion).indexOf(q) >= 0
        || normal_(c.municipio).indexOf(q) >= 0 || normal_(c.telefono).indexOf(q) >= 0
        || normal_(c.email).indexOf(q) >= 0 || normal_(c.id).indexOf(q) >= 0;
  }).slice(0, 40);
  return {ok: true, resultados: res};
}


/* ==========================================================================
   05_Finanzas.gs
   ========================================================================== */

/**
 * 05_Finanzas.gs — Contabilidad, tesorería y salud financiera.
 *
 * Solo entran aquí superadmin y administradores: la comprobación se hace
 * en cada acción, no en el menú del navegador.
 */

/* ---------- cobros ---------- */

function accGuardarCobro_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.cobro || {};
  const campos = ['operacion_id','concepto','importe','fecha_prevista','fecha_cobro','estado',
                  'metodo','factura_id','notas'];
  if (d.id) {
    const cambios = {};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    if (txt_(cambios.fecha_cobro)) cambios.estado = 'cobrado';
    const r = actualizar_('COBROS', d.id, cambios);
    registrar_(u, 'editar_cobro', 'COBROS', d.id, cambios.estado || '');
    return {ok: true, cobro: r};
  }
  const nuevo = {creado: ahora_(), creado_por: u.id};
  campos.forEach(function (c) { nuevo[c] = d[c] === undefined ? '' : d[c]; });
  nuevo.estado = nuevo.estado || (txt_(nuevo.fecha_cobro) ? 'cobrado' : 'previsto');
  const r = insertar_('COBROS', nuevo);
  registrar_(u, 'alta_cobro', 'COBROS', r.id, r.importe);
  return {ok: true, cobro: r};
}

function accBorrarCobro_(u, p) {
  exigir_(u, 'finanzas');
  borrar_('COBROS', p.id);
  return {ok: true};
}

/* ---------- facturas ---------- */

function accGuardarFactura_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.factura || {};
  const campos = ['numero','operacion_id','cliente_id','fecha_emision','concepto','base','iva_pct',
                  'iva','total','estado','fecha_vencimiento','fecha_cobro','url','notas'];
  const base = num_(d.base), ivaPct = num_(d.iva_pct) || configNum_('iva_pct', 21);
  const iva = redondear_(base * ivaPct / 100, 2);
  if (d.id) {
    const cambios = {};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    if (d.base !== undefined) { cambios.iva = iva; cambios.total = redondear_(base + iva, 2); }
    if (txt_(cambios.fecha_cobro)) cambios.estado = 'cobrada';
    const r = actualizar_('FACTURAS', d.id, cambios);
    registrar_(u, 'editar_factura', 'FACTURAS', d.id, cambios.estado || '');
    return {ok: true, factura: r};
  }
  const nueva = {emitida_por: u.id};
  campos.forEach(function (c) { nueva[c] = d[c] === undefined ? '' : d[c]; });
  nueva.numero = txt_(nueva.numero) || siguienteNumeroFactura_();
  nueva.fecha_emision = nueva.fecha_emision || hoyISO_();
  nueva.iva_pct = ivaPct; nueva.iva = iva; nueva.total = redondear_(base + iva, 2);
  nueva.estado = nueva.estado || 'emitida';
  nueva.fecha_vencimiento = nueva.fecha_vencimiento || sumarDias_(nueva.fecha_emision, 30);
  const r = insertar_('FACTURAS', nueva);
  registrar_(u, 'alta_factura', 'FACTURAS', r.id, r.numero);
  return {ok: true, factura: r};
}

function siguienteNumeroFactura_() {
  const anio = hoyISO_().slice(0, 4);
  const n = leer_('FACTURAS').filter(function (f) { return String(f.numero).indexOf('ZW/' + anio) === 0; }).length;
  return 'ZW/' + anio + '/' + String(n + 1).padStart(4, '0');
}

function accBorrarFactura_(u, p) {
  exigir_(u, 'finanzas');
  borrar_('FACTURAS', p.id);
  return {ok: true};
}

/* ---------- gastos ---------- */

function accGuardarGasto_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.gasto || {};
  const campos = ['operacion_id','categoria','proveedor','concepto','importe','iva_pct','fecha',
                  'estado_pago','fecha_pago','factura_proveedor','notas'];
  if (d.id) {
    const cambios = {};
    campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
    if (txt_(cambios.fecha_pago)) cambios.estado_pago = 'pagado';
    const r = actualizar_('GASTOS', d.id, cambios);
    registrar_(u, 'editar_gasto', 'GASTOS', d.id, '');
    return {ok: true, gasto: r};
  }
  const nuevo = {creado: ahora_(), creado_por: u.id};
  campos.forEach(function (c) { nuevo[c] = d[c] === undefined ? '' : d[c]; });
  nuevo.fecha = nuevo.fecha || hoyISO_();
  nuevo.estado_pago = nuevo.estado_pago || (txt_(nuevo.fecha_pago) ? 'pagado' : 'pendiente');
  const r = insertar_('GASTOS', nuevo);
  registrar_(u, 'alta_gasto', 'GASTOS', r.id, r.importe);
  return {ok: true, gasto: r};
}

function accBorrarGasto_(u, p) {
  exigir_(u, 'finanzas');
  borrar_('GASTOS', p.id);
  return {ok: true};
}

/* ---------- cuadro de mando contable ---------- */

/**
 * Devuelve las cuentas de la casa en un periodo, la cuenta de cada
 * instalación y la tabla de salud financiera con sus consejos.
 * p.desde y p.hasta en formato yyyy-mm-dd (por defecto, los últimos 12 meses).
 */
function accFinanzas_(u, p) {
  exigir_(u, 'finanzas');
  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -365);

  const operaciones = leer_('OPERACIONES');
  const clientes = indexar_(leer_('CLIENTES'));
  const cobros = leer_('COBROS');
  const gastos = leer_('GASTOS');
  const facturas = leer_('FACTURAS');
  const usuarios = indexar_(leer_('USUARIOS'));
  const cfg = config_();
  const estructuraMes = num_(cfg.coste_estructura_mes);
  const hoy = hoyISO_();

  const cobrosPorOp = {}, gastosPorOp = {};
  cobros.forEach(function (c) { (cobrosPorOp[String(c.operacion_id)] = cobrosPorOp[String(c.operacion_id)] || []).push(c); });
  gastos.forEach(function (g) { (gastosPorOp[String(g.operacion_id)] = gastosPorOp[String(g.operacion_id)] || []).push(g); });

  const vendidas = operaciones.filter(function (op) {
    return ['cancelada', 'propuesta', 'financiacion'].indexOf(normal_(op.estado)) < 0;
  });

  /* --- cuenta de cada instalación --- */
  const porOperacion = vendidas.map(function (op) {
    const cs = cobrosPorOp[String(op.id)] || [];
    const gs = gastosPorOp[String(op.id)] || [];
    const ingreso = num_(op.total);
    const base = num_(op.base) || redondear_(ingreso / (1 + (num_(op.iva_pct) || 21) / 100), 2);
    const cobrado = cs.filter(function (c) { return txt_(c.fecha_cobro); })
                      .reduce(function (a, c) { return a + num_(c.importe); }, 0);
    const pendiente = redondear_(ingreso - cobrado, 2);
    const vencido = cs.filter(function (c) {
      return !txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < hoy;
    }).reduce(function (a, c) { return a + num_(c.importe); }, 0);
    const coste = gs.reduce(function (a, g) { return a + num_(g.importe); }, 0);
    const costePendiente = gs.filter(function (g) { return normal_(g.estado_pago) !== 'pagado'; })
                             .reduce(function (a, g) { return a + num_(g.importe); }, 0);
    const margen = redondear_(base - coste, 2);
    const cli = clientes[String(op.cliente_id)] || {};
    return {
      id: op.id, referencia: op.referencia, cliente_id: op.cliente_id,
      cliente: cli.nombre || '—', municipio: cli.municipio || '',
      comercial: (usuarios[String(op.comercial_id)] || {}).nombre || '—',
      captador: (usuarios[String(op.captador_id)] || {}).nombre || '',
      tipo: op.tipo, estado: op.estado,
      fecha: txt_(op.fecha_firma) || txt_(op.fecha_propuesta) || txt_(op.creado),
      ingreso: redondear_(ingreso, 2), base: base, cobrado: redondear_(cobrado, 2),
      pendiente: pendiente, vencido: redondear_(vencido, 2),
      coste: redondear_(coste, 2), coste_pendiente: redondear_(costePendiente, 2),
      margen: margen, margen_pct: pct_(margen, base),
      ayudas: num_(op.ayudas_estimadas), cae: num_(op.cae_estimado),
      beneficio_no_economico: txt_(op.beneficio_no_economico),
      cobros: cs.length, gastos: gs.length
    };
  });

  const enRango = porOperacion.filter(function (o) { return o.fecha >= desde && o.fecha <= hasta; });

  /* --- totales del periodo --- */
  const ingresos = enRango.reduce(function (a, o) { return a + o.base; }, 0);
  const costes = enRango.reduce(function (a, o) { return a + o.coste; }, 0);
  const margenBruto = redondear_(ingresos - costes, 2);
  const meses = Math.max(1, Math.round((diasEntre_(desde, hasta) || 365) / 30.4));
  const estructura = redondear_(estructuraMes * meses, 2);
  const beneficioNeto = redondear_(margenBruto - estructura, 2);

  const cobradoPeriodo = cobros.filter(function (c) {
    return txt_(c.fecha_cobro) >= desde && txt_(c.fecha_cobro) <= hasta;
  }).reduce(function (a, c) { return a + num_(c.importe); }, 0);

  const pagadoPeriodo = gastos.filter(function (g) {
    return txt_(g.fecha_pago) >= desde && txt_(g.fecha_pago) <= hasta;
  }).reduce(function (a, g) { return a + num_(g.importe); }, 0);

  const pendienteCobro = cobros.filter(function (c) { return !txt_(c.fecha_cobro); })
                               .reduce(function (a, c) { return a + num_(c.importe); }, 0);
  const vencidoCobro = cobros.filter(function (c) {
    return !txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < hoy;
  }).reduce(function (a, c) { return a + num_(c.importe); }, 0);
  const pendientePago = gastos.filter(function (g) { return normal_(g.estado_pago) !== 'pagado'; })
                              .reduce(function (a, g) { return a + num_(g.importe); }, 0);

  /* --- gastos por categoría --- */
  const porCategoria = {};
  gastos.filter(function (g) { return txt_(g.fecha) >= desde && txt_(g.fecha) <= hasta; })
    .forEach(function (g) {
      const k = txt_(g.categoria) || 'otro';
      porCategoria[k] = redondear_((porCategoria[k] || 0) + num_(g.importe), 2);
    });

  /* --- evolución mes a mes --- */
  const porMes = {};
  function mes_(k) {
    if (!porMes[k]) porMes[k] = {mes: k, ingresos: 0, costes: 0, cobrado: 0, pagado: 0, ventas: 0};
    return porMes[k];
  }
  enRango.forEach(function (o) {
    const m = mes_(mesDe_(o.fecha));
    m.ingresos = redondear_(m.ingresos + o.base, 2);
    m.costes = redondear_(m.costes + o.coste, 2);
    m.ventas += 1;
  });
  cobros.forEach(function (c) {
    const f = txt_(c.fecha_cobro);
    if (f >= desde && f <= hasta) { const m = mes_(mesDe_(f)); m.cobrado = redondear_(m.cobrado + num_(c.importe), 2); }
  });
  gastos.forEach(function (g) {
    const f = txt_(g.fecha_pago);
    if (f >= desde && f <= hasta) { const m = mes_(mesDe_(f)); m.pagado = redondear_(m.pagado + num_(g.importe), 2); }
  });
  const evolucion = Object.keys(porMes).sort().map(function (k) {
    const m = porMes[k];
    m.margen = redondear_(m.ingresos - m.costes, 2);
    m.caja = redondear_(m.cobrado - m.pagado, 2);
    return m;
  });

  /* --- tesorería a 30 / 60 / 90 días --- */
  const tramos = [30, 60, 90].map(function (d) {
    const limite = sumarDias_(hoy, d);
    const entra = cobros.filter(function (c) {
      return !txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) <= limite;
    }).reduce(function (a, c) { return a + num_(c.importe); }, 0);
    const sale = gastos.filter(function (g) {
      return normal_(g.estado_pago) !== 'pagado' && txt_(g.fecha) && sumarDias_(txt_(g.fecha), 30) <= limite;
    }).reduce(function (a, g) { return a + num_(g.importe); }, 0);
    const fijos = redondear_(estructuraMes * (d / 30), 2);
    return {dias: d, entra: redondear_(entra, 2), sale: redondear_(sale, 2), estructura: fijos,
            neto: redondear_(entra - sale - fijos, 2)};
  });

  /* --- días medios de cobro --- */
  const cobrosConFecha = cobros.filter(function (c) { return txt_(c.fecha_cobro) && txt_(c.fecha_prevista); });
  const dso = cobrosConFecha.length
    ? redondear_(cobrosConFecha.reduce(function (a, c) {
        return a + (diasEntre_(c.fecha_prevista, c.fecha_cobro) || 0); }, 0) / cobrosConFecha.length, 1)
    : 0;

  /* --- facturación --- */
  const facturasPeriodo = facturas.filter(function (f) {
    return txt_(f.fecha_emision) >= desde && txt_(f.fecha_emision) <= hasta;
  });
  const facturado = facturasPeriodo.reduce(function (a, f) { return a + num_(f.base); }, 0);
  const facturasVencidas = facturas.filter(function (f) {
    return !txt_(f.fecha_cobro) && txt_(f.fecha_vencimiento) && txt_(f.fecha_vencimiento) < hoy;
  });

  const resumen = {
    desde: desde, hasta: hasta, meses: meses,
    ingresos: redondear_(ingresos, 2), costes: redondear_(costes, 2),
    margen_bruto: margenBruto, margen_pct: pct_(margenBruto, ingresos),
    estructura: estructura, beneficio_neto: beneficioNeto,
    beneficio_pct: pct_(beneficioNeto, ingresos),
    cobrado: redondear_(cobradoPeriodo, 2), pagado: redondear_(pagadoPeriodo, 2),
    caja_periodo: redondear_(cobradoPeriodo - pagadoPeriodo, 2),
    pendiente_cobro: redondear_(pendienteCobro, 2), vencido_cobro: redondear_(vencidoCobro, 2),
    pendiente_pago: redondear_(pendientePago, 2),
    operaciones: enRango.length, ticket_medio: enRango.length ? redondear_(ingresos / enRango.length, 2) : 0,
    facturado: redondear_(facturado, 2), facturas_emitidas: facturasPeriodo.length,
    facturas_vencidas: facturasVencidas.length,
    importe_facturas_vencidas: redondear_(facturasVencidas.reduce(function (a, f) { return a + num_(f.total); }, 0), 2),
    dso: dso, estructura_mes: estructuraMes
  };

  const salud = saludFinanciera_(resumen, enRango, tramos, cfg, operaciones);

  return {ok: true, resumen: resumen, operaciones: porOperacion, evolucion: evolucion,
          categorias: porCategoria, tesoreria: tramos, salud: salud.indicadores,
          consejos: salud.consejos, nota: salud.nota,
          facturas: facturas, cobros: cobros, gastos: gastos};
}

/**
 * Tabla de salud financiera: cada línea es un indicador con su valor,
 * su objetivo, un semáforo y qué hacer si está en rojo.
 */
function saludFinanciera_(r, operaciones, tesoreria, cfg, todasOperaciones) {
  const objetivoMargen = num_(cfg.margen_objetivo_pct) || 32;
  const objetivoDso = num_(cfg.dias_cobro_objetivo) || 45;
  const ind = [];
  const consejos = [];

  function linea(nombre, valor, formato, objetivo, estado, lectura) {
    ind.push({indicador: nombre, valor: valor, formato: formato, objetivo: objetivo,
              estado: estado, lectura: lectura});
  }
  function semaforo(v, bien, regular, alReves) {
    if (alReves) return v <= bien ? 'bien' : (v <= regular ? 'aviso' : 'mal');
    return v >= bien ? 'bien' : (v >= regular ? 'aviso' : 'mal');
  }

  /* 1. Margen bruto */
  const est1 = semaforo(r.margen_pct, objetivoMargen, objetivoMargen - 8);
  linea('Margen bruto', r.margen_pct, 'pct', objetivoMargen + ' %', est1,
    'De cada 100 € facturados quedan ' + redondear_(r.margen_pct, 1) + ' € antes de gastos de estructura.');
  if (est1 !== 'bien') consejos.push({
    titulo: 'El margen está por debajo del objetivo',
    accion: 'Revisa las tres instalaciones con peor margen de la tabla inferior. Si el desvío viene del material, renegocia precio por volumen con el proveedor; si viene del montaje, revisa el precio cerrado con la subcontrata antes de firmar más obras.',
    urgencia: est1 === 'mal' ? 'alta' : 'media'
  });

  /* 2. Beneficio neto */
  const est2 = r.beneficio_neto > 0 ? (r.beneficio_pct >= 10 ? 'bien' : 'aviso') : 'mal';
  linea('Beneficio neto del periodo', r.beneficio_neto, 'eur', '> 0 €', est2,
    'Margen bruto menos ' + redondear_(r.estructura, 0) + ' € de estructura (' + r.meses + ' meses).');
  if (est2 === 'mal') consejos.push({
    titulo: 'La estructura se come el margen',
    accion: 'Con ' + redondear_(r.estructura_mes, 0) + ' € de coste fijo al mes y un margen medio de ' +
            redondear_(r.margen_pct, 1) + ' %, hacen falta ' + puntoEquilibrio_(r) +
            ' instalaciones al mes solo para cubrir gastos. O suben las ventas o baja el fijo: no hay tercera vía.',
    urgencia: 'alta'
  });

  /* 3. Tesorería a 30 días */
  const t30 = (tesoreria[0] || {}).neto || 0;
  const est3 = t30 > 0 ? 'bien' : (t30 > -r.estructura_mes ? 'aviso' : 'mal');
  linea('Caja prevista a 30 días', t30, 'eur', '> 0 €', est3,
    'Cobros previstos menos pagos comprometidos y estructura del próximo mes.');
  if (est3 !== 'bien') consejos.push({
    titulo: 'El mes que viene entra menos de lo que sale',
    accion: 'Adelanta la facturación del 25 % de material de las obras ya firmadas y pide a la financiera la liquidación de las operaciones instaladas. Si aun así no cuadra, negocia con el proveedor de material pago a 60 días en lugar de 30.',
    urgencia: est3 === 'mal' ? 'alta' : 'media'
  });

  /* 4. Cobros vencidos */
  const pctVencido = pct_(r.vencido_cobro, r.pendiente_cobro);
  const est4 = semaforo(pctVencido, 5, 15, true);
  linea('Cobros vencidos sobre el pendiente', pctVencido, 'pct', '< 5 %', est4,
    redondear_(r.vencido_cobro, 0) + ' € pasados de fecha de un total pendiente de ' + redondear_(r.pendiente_cobro, 0) + ' €.');
  if (est4 !== 'bien') consejos.push({
    titulo: 'Hay dinero vencido sin reclamar',
    accion: 'Llama hoy a los clientes con cobros vencidos (los tienes marcados en rojo en la tabla de cobros). Un recordatorio a los 3 días del vencimiento recupera la mayoría sin tensar la relación.',
    urgencia: est4 === 'mal' ? 'alta' : 'media'
  });

  /* 5. Días medios de cobro */
  const est5 = semaforo(r.dso, 0, objetivoDso, true);
  linea('Desvío medio de cobro', r.dso, 'dias', '≤ 0 días sobre lo previsto', est5,
    r.dso > 0 ? 'Se cobra de media ' + r.dso + ' días más tarde de lo pactado.' : 'Se está cobrando en fecha.');
  if (est5 === 'mal') consejos.push({
    titulo: 'Se cobra tarde de forma sistemática',
    accion: 'Cambia el calendario de pagos del contrato: 50 % a la firma y 25 % contra entrega de material en obra, con la factura emitida el mismo día del hito. Emitir tarde es cobrar tarde.',
    urgencia: 'media'
  });

  /* 6. Fondo de maniobra operativo */
  const cobertura = r.pendiente_pago ? redondear_(r.pendiente_cobro / r.pendiente_pago, 2) : 99;
  const est6 = semaforo(cobertura, 1.5, 1);
  linea('Pendiente de cobro / pendiente de pago', cobertura, 'ratio', '≥ 1,5', est6,
    'Por cada euro que debemos, hay ' + cobertura + ' € por cobrar.');
  if (est6 !== 'bien') consejos.push({
    titulo: 'Debemos más de lo que vamos a cobrar a corto',
    accion: 'Frena los pedidos de material que no estén asociados a una obra firmada y con entrada cobrada. Encargar material a cuenta de ventas que aún no están firmadas es la forma más rápida de quedarse sin caja.',
    urgencia: 'alta'
  });

  /* 7. Concentración de clientes */
  const porCliente = {};
  operaciones.forEach(function (o) { porCliente[o.cliente] = (porCliente[o.cliente] || 0) + o.base; });
  const mayor = Object.keys(porCliente).sort(function (a, b) { return porCliente[b] - porCliente[a]; })[0];
  const pctMayor = mayor ? pct_(porCliente[mayor], r.ingresos) : 0;
  const est7 = semaforo(pctMayor, 20, 35, true);
  linea('Peso del mayor cliente', pctMayor, 'pct', '< 20 %', est7,
    mayor ? mayor + ' supone el ' + pctMayor + ' % de la facturación del periodo.' : 'Sin datos suficientes.');
  if (est7 === 'mal') consejos.push({
    titulo: 'Demasiada facturación en un solo cliente',
    accion: 'Mantén la captación a puerta activa aunque entren obras grandes. Un cliente que pesa más de un tercio de la facturación convierte cualquier retraso suyo en un problema de nóminas.',
    urgencia: 'media'
  });

  /* 8. Ticket medio */
  linea('Ticket medio por instalación', r.ticket_medio, 'eur', '—', 'info',
    r.operaciones + ' operaciones cerradas en el periodo.');

  /* 9. Punto de equilibrio */
  linea('Instalaciones al mes para cubrir gastos', puntoEquilibrio_(r), 'num', '—', 'info',
    'Con el margen y el ticket medio actuales.');

  /* 10. Conversión de propuestas */
  const propuestas = todasOperaciones.length;
  const ganadas = todasOperaciones.filter(function (o) {
    return ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada'].indexOf(normal_(o.estado)) >= 0;
  }).length;
  const conv = pct_(ganadas, propuestas);
  const est10 = semaforo(conv, 35, 20);
  linea('Propuestas que acaban en venta', conv, 'pct', '≥ 35 %', est10,
    ganadas + ' cerradas de ' + propuestas + ' propuestas emitidas.');
  if (est10 !== 'bien') consejos.push({
    titulo: 'Se emiten muchas propuestas que no cierran',
    accion: 'Repasa con cada comercial las propuestas de más de 15 días sin respuesta: o se cierran con una llamada de decisión, o se marcan como perdidas para dejar de contarlas como cartera. Una cartera inflada esconde el problema real.',
    urgencia: 'media'
  });

  /* Nota de cabecera */
  const malos = ind.filter(function (i) { return i.estado === 'mal'; }).length;
  const avisos = ind.filter(function (i) { return i.estado === 'aviso'; }).length;
  const nota = malos === 0 && avisos === 0
    ? {nivel: 'bien', texto: 'La empresa está sana: margen, cobro y caja dentro de objetivo.'}
    : (malos === 0
      ? {nivel: 'aviso', texto: 'Nada grave, pero hay ' + avisos + ' indicador(es) fuera de objetivo. Merece media hora esta semana.'}
      : {nivel: 'mal', texto: 'Hay ' + malos + ' indicador(es) en rojo. Empieza por los consejos marcados como urgencia alta.'});

  if (!consejos.length) consejos.push({
    titulo: 'Todo en verde: toca consolidar',
    accion: 'Aprovecha para adelantar la compra de material de las obras firmadas si el proveedor mejora precio por volumen, y deja en caja al menos dos meses de estructura antes de ampliar equipo.',
    urgencia: 'baja'
  });

  return {indicadores: ind, consejos: consejos, nota: nota};
}

function puntoEquilibrio_(r) {
  const margenUnidad = r.ticket_medio * (r.margen_pct / 100);
  if (margenUnidad <= 0) return 0;
  return Math.ceil(r.estructura_mes / margenUnidad);
}


/* ==========================================================================
   06_Partes.gs
   ========================================================================== */

/**
 * 06_Partes.gs — Parte diario del equipo y lectura automática del resumen.
 *
 * Al final del día, el captador dice cuántas puertas y cuántas fichas ha
 * hecho; el comercial dice cuántas sentadas ha tenido y con quién, y
 * escribe un resumen en lenguaje normal. El servidor lee ese resumen,
 * reconoce a los clientes y propone cambios de estado, próximos pasos y
 * fechas. Nada se aplica sin que la persona lo confirme.
 */

function accGuardarParte_(u, p) {
  const d = p.parte || {};
  const fecha = txt_(d.fecha) || hoyISO_();
  const existente = leer_('PARTES').filter(function (x) {
    return String(x.usuario_id) === String(u.id) && txt_(x.fecha) === fecha;
  })[0];

  /* Las fichas de captación del día se cuentan solas. */
  const fichasHoy = leer_('CAPTACIONES').filter(function (c) {
    return String(c.captador_id) === String(u.id) && txt_(c.fecha) === fecha;
  }).length;

  const sentadas = Array.isArray(d.sentadas_detalle) ? d.sentadas_detalle : [];
  const analisis = analizarResumen_(u, txt_(d.resumen), fecha);

  const datos = {
    fecha: fecha, usuario_id: u.id, rol: u.rol,
    visitas: num_(d.visitas), puertas: num_(d.puertas), fichas: fichasHoy,
    sentadas: sentadas.length || num_(d.sentadas),
    sentadas_detalle: JSON.stringify(sentadas),
    ventas: num_(d.ventas), importe_vendido: num_(d.importe_vendido),
    resumen: txt_(d.resumen), analisis: JSON.stringify(analisis),
    estado: 'enviado', modificado: ahora_()
  };

  let r;
  if (existente) {
    datos.propuestas_aplicadas = existente.propuestas_aplicadas;
    r = actualizar_('PARTES', existente.id, datos);
  } else {
    datos.creado = ahora_();
    datos.propuestas_aplicadas = '';
    r = insertar_('PARTES', datos);
  }
  registrar_(u, 'parte_diario', 'PARTES', r.id, fecha);
  return {ok: true, parte: r, analisis: analisis};
}

/** Aplica las propuestas que la persona ha confirmado. */
function accAplicarParte_(u, p) {
  const parte = leer_('PARTES').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!parte) return {ok: false, error: 'No existe ese parte.'};
  if (String(parte.usuario_id) !== String(u.id) && !permisos_(u).editarTodo) {
    return {ok: false, error: 'Ese parte no es tuyo.'};
  }
  const cambios = p.cambios || [];
  const aplicados = [];
  cambios.forEach(function (c) {
    const cli = leer_('CLIENTES').filter(function (x) { return String(x.id) === String(c.cliente_id); })[0];
    if (!cli || !veCliente_(u, cli)) return;
    const upd = {modificado: ahora_(), modificado_por: u.id};
    if (c.estado) { upd.estado = c.estado; upd.fecha_estado = txt_(parte.fecha); }
    if (c.proximo_paso) upd.proxima_accion = c.proximo_paso;
    if (c.proxima_fecha) upd.proxima_fecha = c.proxima_fecha;
    actualizar_('CLIENTES', cli.id, upd);
    insertar_('SEGUIMIENTO', {
      cliente_id: cli.id, operacion_id: c.operacion_id || '', usuario_id: u.id,
      fecha: txt_(parte.fecha), canal: c.canal || 'visita',
      nota: txt_(c.nota) || 'Anotado en el parte diario.',
      proximo_paso: txt_(c.proximo_paso), proxima_fecha: txt_(c.proxima_fecha),
      estado_resultante: txt_(c.estado), origen: 'parte', creado: ahora_()
    });
    aplicados.push(cli.id);
  });
  actualizar_('PARTES', parte.id, {propuestas_aplicadas: JSON.stringify(aplicados), estado: 'aplicado'});
  registrar_(u, 'aplicar_parte', 'PARTES', parte.id, aplicados.join(','));
  return {ok: true, aplicados: aplicados};
}

function accPartes_(u, p) {
  const per = permisos_(u);
  const desde = txt_(p.desde) || sumarDias_(hoyISO_(), -30);
  const hasta = txt_(p.hasta) || hoyISO_();
  let partes = leer_('PARTES').filter(function (x) {
    return txt_(x.fecha) >= desde && txt_(x.fecha) <= hasta;
  });
  if (!per.partesAjenos) {
    partes = partes.filter(function (x) { return String(x.usuario_id) === String(u.id); });
  } else if (p.usuario_id) {
    partes = partes.filter(function (x) { return String(x.usuario_id) === String(p.usuario_id); });
  }
  partes.sort(function (a, b) { return txt_(b.fecha).localeCompare(txt_(a.fecha)); });
  return {ok: true, partes: partes};
}

/* ================= lectura del resumen escrito ================= */

/* Lo que dice el comercial -> lo que significa para la ficha del cliente. */
const REGLAS_ESTADO = [
  {estado: 'ganado', claves: ['firmado','firmamos','firma el contrato','cerrado','cerramos','vendido',
      'vendida','acepta la propuesta','acepta el presupuesto','me da el si','me da el sí','adelante con la obra',
      'contrato firmado','se lo queda']},
  {estado: 'perdido', claves: ['no interesa','no le interesa','descartado','descartamos','se cae',
      'se ha caido','se ha caído','no sigue adelante','ha dicho que no','nos dice que no','perdido',
      'se va con otra','ha contratado a otra','lo deja','no quiere']},
  {estado: 'negociando', claves: ['se lo piensa','lo va a pensar','pide descuento','esta negociando',
      'está negociando','quiere rebaja','compara presupuestos','duda','pendiente de decidir',
      'le tengo que ajustar','pide mejorar precio','consultarlo con']},
  {estado: 'propuesta', claves: ['le mando la propuesta','propuesta enviada','presupuesto enviado',
      'le envio el presupuesto','le envío el presupuesto','mandada la oferta','oferta enviada',
      'le paso la propuesta','enviada la propuesta']},
  {estado: 'sentada', claves: ['sentada','he estado en casa de','visita realizada','estuve con',
      'he visitado','hemos visitado','visita hecha']},
  {estado: 'cita', claves: ['cita concertada','quedamos el','concertada la visita','me recibe el',
      'visita el']},
  {estado: 'frio', claves: ['en frio','en frío','lo dejamos aparcado','para mas adelante',
      'para más adelante','ahora no','el año que viene','despues del verano','después del verano']}
];

/* Pistas de que hay que volver a llamar. */
const REGLAS_PASO = [
  {paso: 'Llamar para cerrar', claves: ['llamar para cerrar','cerrar por telefono','cerrar por teléfono','llamada de cierre']},
  {paso: 'Volver a llamar', claves: ['volver a llamar','le llamo','llamarle','rellamada','le vuelvo a llamar','llamar']},
  {paso: 'Enviar propuesta', claves: ['mandar propuesta','enviar propuesta','preparar presupuesto','pasar presupuesto','hacer la oferta']},
  {paso: 'Segunda visita', claves: ['segunda visita','volver a casa','volver a la vivienda','ir otra vez']},
  {paso: 'Pendiente de financiación', claves: ['financiacion','financiación','banco','cetelem','estudio de financiera','scoring']},
  {paso: 'Pendiente de documentación', claves: ['falta el dni','manda el dni','falta la factura de la luz','cups','documentacion','documentación']},
  {paso: 'Visita técnica', claves: ['visita tecnica','visita técnica','medir','replanteo','ver el tejado']}
];

const DIAS_SEMANA = [['domingo',0],['lunes',1],['martes',2],['miercoles',3],['miércoles',3],
  ['jueves',4],['viernes',5],['sabado',6],['sábado',6]];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
  'septiembre','octubre','noviembre','diciembre'];

/**
 * Lee el resumen, localiza a los clientes de esa persona por su nombre y
 * propone cambios. Devuelve propuestas, nunca cambios hechos.
 */
function analizarResumen_(u, texto, fechaParte) {
  const limpio = normal_(texto);
  if (!limpio) return {frases: [], propuestas: [], avisos: []};

  const clientes = misClientes_(u);
  const operaciones = misOperaciones_(u);
  const opPorCliente = {};
  operaciones.forEach(function (o) { opPorCliente[String(o.cliente_id)] = o; });

  /* Se parte por frases: cada una suele hablar de un cliente. */
  const frases = String(texto).split(/(?:\.|;|\n|\r|•|·)+/)
    .map(function (f) { return f.trim(); })
    .filter(function (f) { return f.length > 3; });

  const propuestas = [];
  const avisos = [];

  let ultimos = [];   // de quién se venía hablando en la frase anterior
  frases.forEach(function (frase) {
    const f = normal_(frase);
    let encontrados = clientes.filter(function (c) { return mencionado_(f, c); });
    const estado = estadoDe_(f);
    const paso = pasoDe_(f);
    const fecha = fechaDe_(f, fechaParte);
    let heredado = false;

    if (!encontrados.length) {
      /* "Le llamo el lunes" suele seguir hablando del cliente anterior. */
      if (ultimos.length && (estado || paso || fecha)) {
        encontrados = ultimos;
        heredado = true;
      } else {
        if (/(firm|cerr|vend|no interesa|propuesta|presupuesto)/.test(f)) {
          avisos.push('No he reconocido a ningún cliente tuyo en: "' + frase.trim() + '"');
        }
        return;
      }
    } else {
      ultimos = encontrados;
    }

    encontrados.forEach(function (c) {
      if (!estado && !paso && !fecha) return;
      const op = opPorCliente[String(c.id)];
      propuestas.push({
        cliente_id: c.id, cliente: c.nombre, operacion_id: op ? op.id : '',
        estado_actual: c.estado, estado: estado && estado !== c.estado ? estado : '',
        proximo_paso: paso || '', proxima_fecha: fecha || '',
        nota: frase.trim(), canal: /llama|telefono|teléfono/.test(f) ? 'llamada'
              : (/whatsapp|wasap/.test(f) ? 'whatsapp' : (/correo|email|mail/.test(f) ? 'email' : 'visita')),
        confianza: (estado ? 2 : 0) + (paso ? 1 : 0) + (fecha ? 1 : 0) - (heredado ? 1 : 0)
      });
    });
  });

  /* Si dos frases hablan del mismo cliente, manda la de más confianza. */
  const porCliente = {};
  propuestas.forEach(function (p) {
    const k = String(p.cliente_id);
    if (!porCliente[k] || porCliente[k].confianza < p.confianza) porCliente[k] = p;
    else {
      if (!porCliente[k].estado && p.estado) porCliente[k].estado = p.estado;
      if (!porCliente[k].proximo_paso && p.proximo_paso) porCliente[k].proximo_paso = p.proximo_paso;
      if (!porCliente[k].proxima_fecha && p.proxima_fecha) porCliente[k].proxima_fecha = p.proxima_fecha;
    }
  });

  const lista = Object.keys(porCliente).map(function (k) { return porCliente[k]; })
    .filter(function (p) { return p.estado || p.proximo_paso || p.proxima_fecha; })
    .sort(function (a, b) { return b.confianza - a.confianza; });

  return {frases: frases, propuestas: lista, avisos: avisos};
}

/** ¿Se está hablando de este cliente? Por nombre, apellido o dirección. */
function mencionado_(fraseNormal, cliente) {
  const nombre = normal_(cliente.nombre);
  if (!nombre) return false;
  if (fraseNormal.indexOf(nombre) >= 0) return true;
  const partes = nombre.split(' ').filter(function (x) { return x.length >= 4; });
  /* Con el nombre de pila basta si es razonablemente distintivo. */
  const aciertos = partes.filter(function (x) {
    return new RegExp('(^|[^a-z0-9])' + x + '([^a-z0-9]|$)').test(fraseNormal);
  }).length;
  if (aciertos >= 1 && partes.length === 1) return true;
  if (aciertos >= 1 && fraseNormal.indexOf(partes[0]) >= 0) return true;
  const dir = normal_(cliente.direccion);
  if (dir.length > 8 && fraseNormal.indexOf(dir) >= 0) return true;
  return false;
}

function estadoDe_(f) {
  for (let i = 0; i < REGLAS_ESTADO.length; i++) {
    const r = REGLAS_ESTADO[i];
    for (let j = 0; j < r.claves.length; j++) {
      if (f.indexOf(r.claves[j]) >= 0) return r.estado;
    }
  }
  return '';
}

function pasoDe_(f) {
  for (let i = 0; i < REGLAS_PASO.length; i++) {
    const r = REGLAS_PASO[i];
    for (let j = 0; j < r.claves.length; j++) {
      if (f.indexOf(r.claves[j]) >= 0) return r.paso;
    }
  }
  return '';
}

/** Saca una fecha de expresiones normales: mañana, el lunes, el 3 de octubre, 12/10. */
function fechaDe_(f, referenciaISO) {
  const ref = referenciaISO || hoyISO_();

  if (/\bhoy\b/.test(f)) return ref;
  if (/\bmanana\b|\bmañana\b/.test(f)) return sumarDias_(ref, 1);
  if (/pasado manana|pasado mañana/.test(f)) return sumarDias_(ref, 2);
  if (/semana que viene|proxima semana|próxima semana/.test(f)) return sumarDias_(ref, 7);
  if (/en quince dias|en 15 dias|dos semanas/.test(f)) return sumarDias_(ref, 14);
  if (/mes que viene|proximo mes|próximo mes/.test(f)) return sumarDias_(ref, 30);

  let m = f.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    const d = Number(m[1]), mes = Number(m[2]);
    let anio = m[3] ? Number(m[3]) : Number(ref.slice(0, 4));
    if (anio < 100) anio += 2000;
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) {
      const iso = anio + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      return iso < ref && !m[3] ? (anio + 1) + iso.slice(4) : iso;
    }
  }

  m = f.match(/\b(\d{1,2})\s+de\s+([a-z]+)/);
  if (m) {
    const d = Number(m[1]);
    const mes = MESES.indexOf(m[2]);
    if (mes >= 0 && d >= 1 && d <= 31) {
      const anio = Number(ref.slice(0, 4));
      const iso = anio + '-' + String(mes + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      return iso < ref ? (anio + 1) + iso.slice(4) : iso;
    }
  }

  for (let i = 0; i < DIAS_SEMANA.length; i++) {
    if (new RegExp('\\b' + DIAS_SEMANA[i][0] + '\\b').test(f)) {
      const objetivo = DIAS_SEMANA[i][1];
      const base = fecha_(ref) || new Date();
      let dias = (objetivo - base.getDay() + 7) % 7;
      if (dias === 0) dias = 7;
      return sumarDias_(ref, dias);
    }
  }
  return '';
}

/** Relee un parte ya guardado (por si se ha corregido el texto). */
function accReanalizar_(u, p) {
  const parte = leer_('PARTES').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!parte) return {ok: false, error: 'No existe ese parte.'};
  if (String(parte.usuario_id) !== String(u.id) && !permisos_(u).partesAjenos) {
    return {ok: false, error: 'Ese parte no es tuyo.'};
  }
  const analisis = analizarResumen_(u, txt_(p.resumen) || txt_(parte.resumen), txt_(parte.fecha));
  actualizar_('PARTES', parte.id, {analisis: JSON.stringify(analisis),
    resumen: txt_(p.resumen) || txt_(parte.resumen), modificado: ahora_()});
  return {ok: true, analisis: analisis};
}


/* ==========================================================================
   07_Resumen.gs
   ========================================================================== */

/**
 * 07_Resumen.gs — Cómo va cada persona y cómo va la casa.
 *
 * Un comercial solo puede pedir su propio resumen; los administradores
 * pueden pedir el de cualquiera y el del equipo entero.
 */

/* Los objetivos de venta se computan del 16 al 15 del mes siguiente. */
function periodoObjetivos_(refISO) {
  const ref = refISO || hoyISO_();
  const d = fecha_(ref);
  const inicio = new Date(d.getFullYear(), d.getMonth(), 16);
  if (d.getDate() < 16) inicio.setMonth(inicio.getMonth() - 1);
  const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 15);
  return {
    desde: Utilities.formatDate(inicio, zonaHoraria_(), 'yyyy-MM-dd'),
    hasta: Utilities.formatDate(fin, zonaHoraria_(), 'yyyy-MM-dd')
  };
}

function accResumen_(u, p) {
  const per = permisos_(u);
  const objetivoId = txt_(p.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !per.partesAjenos) {
    return {ok: false, error: 'Solo puedes consultar tu propio resumen.'};
  }
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -180);
  return {ok: true, resumen: resumenPersona_(persona, desde, hasta, permisos_(u).costes)};
}

function resumenPersona_(persona, desde, hasta, conImportes) {
  const esComercial = persona.rol === 'comercial' || persona.rol === 'admin' || persona.rol === 'superadmin';
  const clientes = leer_('CLIENTES');
  const operaciones = leer_('OPERACIONES');
  const captaciones = leer_('CAPTACIONES');
  const partes = leer_('PARTES').filter(function (x) {
    return String(x.usuario_id) === String(persona.id) && txt_(x.fecha) >= desde && txt_(x.fecha) <= hasta;
  });
  const seguimiento = leer_('SEGUIMIENTO').filter(function (s) { return String(s.usuario_id) === String(persona.id); });
  const hoy = hoyISO_();
  const obj = periodoObjetivos_(hasta);

  const misClientes = clientes.filter(function (c) {
    return persona.rol === 'captador' ? String(c.captador_id) === String(persona.id)
                                      : String(c.comercial_id) === String(persona.id);
  });
  const misOps = operaciones.filter(function (o) {
    return persona.rol === 'captador' ? String(o.captador_id) === String(persona.id)
                                      : String(o.comercial_id) === String(persona.id);
  });
  const enRango = function (f) { return txt_(f) >= desde && txt_(f) <= hasta; };
  const ganadas = misOps.filter(function (o) { return esGanada_(o); });
  const ganadasRango = ganadas.filter(function (o) { return enRango(txt_(o.fecha_firma) || txt_(o.creado)); });
  const perdidas = misOps.filter(function (o) { return normal_(o.estado) === 'cancelada'; });
  const abiertas = misOps.filter(function (o) {
    return ['propuesta', 'financiacion'].indexOf(normal_(o.estado)) >= 0;
  });

  const sentadas = partes.reduce(function (a, x) { return a + num_(x.sentadas); }, 0);
  const puertas = partes.reduce(function (a, x) { return a + num_(x.puertas); }, 0);
  const visitas = partes.reduce(function (a, x) { return a + num_(x.visitas); }, 0);
  const fichas = captaciones.filter(function (c) {
    return String(c.captador_id) === String(persona.id) && enRango(c.fecha);
  });
  const citasConfirmadas = fichas.filter(function (c) { return normal_(c.estado_cita) === 'confirmada'; });
  /* Se cuentan sobre las fichas del periodo, para que las conversiones
     comparen siempre lo mismo y no pasen del 100 %. */
  const captacionesVenta = fichas.filter(function (c) { return normal_(c.resultado) === 'venta'; });
  const captacionesSentada = fichas.filter(function (c) {
    return ['sentada', 'venta'].indexOf(normal_(c.resultado)) >= 0;
  });
  const captacionesVentaTodas = captaciones.filter(function (c) {
    return String(c.captador_id) === String(persona.id) && normal_(c.resultado) === 'venta';
  });

  const importeVendido = ganadasRango.reduce(function (a, o) { return a + num_(o.total); }, 0);
  /* Las captaciones que acaban en venta se pagan a quien abrió la puerta,
     sea captador o comercial, así que se miran por captador_id siempre. */
  const misCaptacionesVendidas = captaciones.filter(function (c) {
    return String(c.captador_id) === String(persona.id) && normal_(c.resultado) === 'venta' &&
           enRango(txt_(c.fecha_resultado) || txt_(c.fecha));
  });
  const comisiones = comisionesDe_(persona, ganadasRango, misCaptacionesVendidas,
    ventasDeSuEquipo_(persona, desde, hasta));

  /* Objetivo del periodo 16-15: una operación doble cuenta por dos. */
  const delPeriodo = misOps.filter(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    return esGanada_(o) && f >= obj.desde && f <= obj.hasta;
  });
  const sencillasPeriodo = delPeriodo.reduce(function (a, o) {
    return a + (normal_(o.tipo) === 'fv_aero' ? 2 : 1);
  }, 0);
  const objetivoMes = num_(persona.objetivo_mes) || (persona.rol === 'captador' ? 60 : 6);
  const logradoObjetivo = persona.rol === 'captador'
    ? fichas.filter(function (c) { return txt_(c.fecha) >= obj.desde && txt_(c.fecha) <= obj.hasta; }).length
    : sencillasPeriodo;

  /* Evolución mes a mes */
  const meses = {};
  function m_(k) {
    if (!meses[k]) meses[k] = {mes: k, ventas: 0, importe: 0, sentadas: 0, fichas: 0, propuestas: 0};
    return meses[k];
  }
  ganadas.forEach(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    if (enRango(f)) { const x = m_(mesDe_(f)); x.ventas += 1; x.importe = redondear_(x.importe + num_(o.total), 2); }
  });
  misOps.forEach(function (o) {
    const f = txt_(o.fecha_propuesta) || txt_(o.creado);
    if (enRango(f)) m_(mesDe_(f)).propuestas += 1;
  });
  partes.forEach(function (x) { m_(mesDe_(txt_(x.fecha))).sentadas += num_(x.sentadas); });
  fichas.forEach(function (c) { m_(mesDe_(txt_(c.fecha))).fichas += 1; });
  const evolucion = Object.keys(meses).sort().map(function (k) { return meses[k]; });

  /* Cartera y avisos */
  const ultimoContacto = {};
  seguimiento.forEach(function (s) {
    const k = String(s.cliente_id);
    if (!ultimoContacto[k] || ultimoContacto[k] < txt_(s.fecha)) ultimoContacto[k] = txt_(s.fecha);
  });
  const frios = misClientes.filter(function (c) {
    if (['ganado', 'perdido'].indexOf(normal_(c.estado)) >= 0) return false;
    const ult = ultimoContacto[String(c.id)] || txt_(c.fecha_estado) || txt_(c.creado);
    return (diasEntre_(ult, hoy) || 0) > 15;
  }).map(function (c) {
    return {id: c.id, nombre: c.nombre, municipio: c.municipio, estado: c.estado,
            dias: diasEntre_(ultimoContacto[String(c.id)] || txt_(c.fecha_estado) || txt_(c.creado), hoy)};
  }).sort(function (a, b) { return b.dias - a.dias; }).slice(0, 25);

  const proximas = misClientes.filter(function (c) { return txt_(c.proxima_fecha); })
    .map(function (c) {
      return {id: c.id, nombre: c.nombre, accion: c.proxima_accion, fecha: txt_(c.proxima_fecha),
              vencida: txt_(c.proxima_fecha) < hoy, estado: c.estado};
    }).sort(function (a, b) { return a.fecha.localeCompare(b.fecha); }).slice(0, 30);

  const tasa = function (a, b) { return pct_(a, b); };

  const r = {
    persona: publico_(persona),
    desde: desde, hasta: hasta,
    periodo_objetivos: obj,
    clientes: misClientes.length,
    clientes_activos: misClientes.filter(function (c) {
      return ['ganado', 'perdido'].indexOf(normal_(c.estado)) < 0; }).length,
    propuestas: misOps.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length,
    ventas: ganadasRango.length,
    perdidas: perdidas.filter(function (o) { return enRango(txt_(o.modificado) || txt_(o.creado)); }).length,
    sentadas: sentadas, puertas: puertas, visitas: visitas,
    fichas: fichas.length, citas_confirmadas: citasConfirmadas.length,
    captaciones_sentada: captacionesSentada.length, captaciones_venta: captacionesVenta.length,
    conversion_sentada_venta: tasa(ganadasRango.length, sentadas),
    conversion_propuesta_venta: tasa(ganadasRango.length,
      misOps.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length),
    conversion_ficha_sentada: tasa(captacionesSentada.length, fichas.length),
    conversion_ficha_venta: tasa(captacionesVenta.length, fichas.length),
    conversion_puerta_ficha: tasa(fichas.length, puertas),
    objetivo_mes: objetivoMes, logrado_objetivo: logradoObjetivo,
    objetivo_pct: pct_(logradoObjetivo, objetivoMes),
    cartera_abierta: abiertas.length,
    evolucion: evolucion,
    frios: frios, proximas: proximas,
    partes_enviados: partes.length,
    dias_sin_parte: diasSinParte_(persona, partes),
    comisiones: comisiones
  };

  if (conImportes || persona.rol !== 'captador') {
    r.importe_vendido = redondear_(importeVendido, 2);
    r.ticket_medio = ganadasRango.length ? redondear_(importeVendido / ganadasRango.length, 2) : 0;
    r.cartera_importe = redondear_(abiertas.reduce(function (a, o) { return a + num_(o.total); }, 0), 2);
    /* Cartera ponderada: lo que razonablemente va a entrar. */
    r.cartera_ponderada = redondear_(abiertas.reduce(function (a, o) {
      const peso = normal_(o.estado) === 'financiacion' ? 0.6 : 0.35;
      return a + num_(o.total) * peso;
    }, 0), 2);
  }
  return r;
}

function esGanada_(o) {
  return ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada']
    .indexOf(normal_(o.estado)) >= 0;
}

/**
 * Lo que cobra una persona por su trabajo comercial. Hay cuatro formas de
 * comisionar y no se excluyen entre sí:
 *
 *   venta      · la instalación que ha cerrado, a su tarifa
 *   ajustada   · la misma venta cuando se ha bajado el precio estándar
 *   captación  · haber abierto la puerta de algo que acabó vendiéndose,
 *                aunque la venta la cerrara otro
 *   equipo     · cada venta de alguien que tiene a esta persona de
 *                responsable; es lo que cobra un sénior por lo que cierra
 *                su júnior
 *
 * Las tarifas son las de la persona; si no las tiene puestas, las de Ajustes.
 */
function comisionesDe_(persona, ganadas, captacionesVenta, ventasEquipo) {
  const cfg = config_();
  const tarifa = function (campo, porDefecto) {
    const propia = num_(persona[campo]);
    return propia || num_(cfg[porDefecto || campo]);
  };
  const cFV = tarifa('comision_fv');
  const cAero = tarifa('comision_aero');
  const cFVaj = tarifa('comision_fv_ajustada');
  const cAeroaj = tarifa('comision_aero_ajustada');
  const cCapFV = tarifa('comision_captacion_fv');
  const cCapAero = tarifa('comision_captacion_aero');
  const cEqFV = tarifa('comision_equipo_fv');
  const cEqAero = tarifa('comision_equipo_aero');

  let total = 0;
  const detalle = [];
  const apuntar = function (importe, concepto, o, extra) {
    if (!importe) return;
    total += importe;
    detalle.push(Object.assign({
      operacion_id: o && o.id ? o.id : '', referencia: (o && o.referencia) || '',
      tipo: o ? o.tipo : '', concepto: concepto, importe: redondear_(importe, 2),
      fecha: o ? (txt_(o.fecha_firma) || txt_(o.creado)) : ''
    }, extra || {}));
  };
  const porTipo = function (o, fv, aero) {
    const t = normal_(o.tipo);
    return (t === 'fv' || t === 'fv_aero' ? fv : 0) + (t === 'aero' || t === 'fv_aero' ? aero : 0);
  };

  ganadas.forEach(function (o) {
    const ajustada = normal_(o.precio_ajustado) === 'si';
    apuntar(porTipo(o, ajustada ? cFVaj : cFV, ajustada ? cAeroaj : cAero),
            ajustada ? 'venta con precio ajustado' : 'venta', o);
  });

  (captacionesVenta || []).forEach(function (c) {
    const tipo = normal_(c.tecnologia) || 'fv';
    const importe = (tipo === 'fv' || tipo === 'fv_aero' ? cCapFV : 0) +
                    (tipo === 'aero' || tipo === 'fv_aero' ? cCapAero : 0);
    apuntar(importe, 'captación vendida', null,
      {operacion_id: c.operacion_id || '', referencia: 'Captación ' + c.id, tipo: tipo,
       fecha: txt_(c.fecha_resultado) || txt_(c.fecha)});
  });

  (ventasEquipo || []).forEach(function (o) {
    apuntar(porTipo(o, cEqFV, cEqAero), 'venta de su equipo', o, {de: o._de || ''});
  });

  return {total: redondear_(total, 2), detalle: detalle};
}

/** Las ventas cerradas por la gente que tiene a esta persona de responsable. */
function ventasDeSuEquipo_(persona, desde, hasta) {
  const suyos = leer_('USUARIOS').filter(function (x) {
    return String(x.responsable_id || '') === String(persona.id) && String(x.id) !== String(persona.id);
  });
  if (!suyos.length) return [];
  const nombre = {};
  suyos.forEach(function (x) { nombre[String(x.id)] = txt_(x.nombre); });
  return leer_('OPERACIONES').filter(function (o) {
    if (!nombre[String(o.comercial_id)] || !esGanada_(o)) return false;
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    return f >= desde && f <= hasta;
  }).map(function (o) {
    const copia = Object.assign({}, o);
    copia._de = nombre[String(o.comercial_id)];
    return copia;
  });
}

function diasSinParte_(persona, partes) {
  if (!partes.length) return null;
  const ultimo = partes.map(function (x) { return txt_(x.fecha); }).sort().pop();
  return diasEntre_(ultimo, hoyISO_());
}

/* ---------- el equipo al completo ---------- */

function accEquipo_(u, p) {
  exigir_(u, 'partesAjenos');
  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -90);
  const gente = leer_('USUARIOS').filter(function (x) { return normal_(x.activo) === 'si'; });
  const resumenes = gente.map(function (g) { return resumenPersona_(g, desde, hasta, true); });

  const comerciales = resumenes.filter(function (r) { return r.persona.rol === 'comercial'; })
    .sort(function (a, b) { return (b.importe_vendido || 0) - (a.importe_vendido || 0); });
  const captadores = resumenes.filter(function (r) { return r.persona.rol === 'captador'; })
    .sort(function (a, b) { return b.fichas - a.fichas; });

  return {ok: true, desde: desde, hasta: hasta, equipo: resumenes,
          ranking_comerciales: comerciales, ranking_captadores: captadores};
}

/* ---------- analítica de la casa ---------- */

function accAnalitica_(u, p) {
  exigir_(u, 'partesAjenos');
  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || sumarDias_(hasta, -365);
  const clientes = leer_('CLIENTES');
  const operaciones = leer_('OPERACIONES');
  const captaciones = leer_('CAPTACIONES');
  const partes = leer_('PARTES').filter(function (x) { return txt_(x.fecha) >= desde && txt_(x.fecha) <= hasta; });
  const usuarios = indexar_(leer_('USUARIOS'));
  const enRango = function (f) { return txt_(f) >= desde && txt_(f) <= hasta; };

  /* Embudo: puerta -> ficha -> sentada -> propuesta -> venta */
  const puertas = partes.reduce(function (a, x) { return a + num_(x.puertas); }, 0);
  const fichas = captaciones.filter(function (c) { return enRango(c.fecha); }).length;
  const sentadas = partes.reduce(function (a, x) { return a + num_(x.sentadas); }, 0);
  const propuestas = operaciones.filter(function (o) { return enRango(txt_(o.fecha_propuesta) || txt_(o.creado)); }).length;
  const ventas = operaciones.filter(function (o) {
    return esGanada_(o) && enRango(txt_(o.fecha_firma) || txt_(o.creado)); }).length;

  const embudo = [
    {fase: 'Puertas', valor: puertas},
    {fase: 'Fichas de captación', valor: fichas, conversion: pct_(fichas, puertas)},
    {fase: 'Sentadas', valor: sentadas, conversion: pct_(sentadas, fichas)},
    {fase: 'Propuestas', valor: propuestas, conversion: pct_(propuestas, sentadas)},
    {fase: 'Ventas', valor: ventas, conversion: pct_(ventas, propuestas)}
  ];

  /* Por municipio */
  const mun = {};
  clientes.forEach(function (c) {
    const k = txt_(c.municipio) || 'Sin municipio';
    if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, interes: 0, n: 0};
    mun[k].clientes += 1;
    if (num_(c.interes)) { mun[k].interes += num_(c.interes); mun[k].n += 1; }
  });
  operaciones.filter(esGanada_).forEach(function (o) {
    const c = clientes.filter(function (x) { return String(x.id) === String(o.cliente_id); })[0];
    const k = c ? (txt_(c.municipio) || 'Sin municipio') : 'Sin municipio';
    if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, interes: 0, n: 0};
    mun[k].ventas += 1;
    mun[k].importe = redondear_(mun[k].importe + num_(o.total), 2);
  });
  const municipios = Object.keys(mun).map(function (k) {
    const m = mun[k];
    m.conversion = pct_(m.ventas, m.clientes);
    m.interes_medio = m.n ? redondear_(m.interes / m.n, 1) : 0;
    return m;
  }).sort(function (a, b) { return b.importe - a.importe; });

  /* Tiempos medios por fase */
  const tiempos = {propuesta_firma: [], firma_instalacion: [], instalacion_legalizacion: []};
  operaciones.forEach(function (o) {
    const a = diasEntre_(txt_(o.fecha_propuesta), txt_(o.fecha_firma));
    if (a !== null && a >= 0) tiempos.propuesta_firma.push(a);
    const b = diasEntre_(txt_(o.fecha_firma), txt_(o.fecha_instalacion));
    if (b !== null && b >= 0) tiempos.firma_instalacion.push(b);
    const c = diasEntre_(txt_(o.fecha_instalacion), txt_(o.fecha_legalizacion));
    if (c !== null && c >= 0) tiempos.instalacion_legalizacion.push(c);
  });
  const media = function (l) { return l.length ? redondear_(l.reduce(function (a, b) { return a + b; }, 0) / l.length, 1) : 0; };

  /* Motivos de pérdida */
  const motivos = {};
  operaciones.filter(function (o) { return normal_(o.estado) === 'cancelada'; }).forEach(function (o) {
    const k = txt_(o.motivo_perdida) || 'Sin indicar';
    motivos[k] = (motivos[k] || 0) + 1;
  });

  /* Mezcla de producto */
  const tipos = {};
  operaciones.filter(esGanada_).forEach(function (o) {
    const k = txt_(o.tipo) || 'otro';
    if (!tipos[k]) tipos[k] = {tipo: k, ventas: 0, importe: 0};
    tipos[k].ventas += 1;
    tipos[k].importe = redondear_(tipos[k].importe + num_(o.total), 2);
  });

  /* Previsión: cartera abierta ponderada por estado */
  const abiertas = operaciones.filter(function (o) {
    return ['propuesta', 'financiacion'].indexOf(normal_(o.estado)) >= 0; });
  const prevision = redondear_(abiertas.reduce(function (a, o) {
    return a + num_(o.total) * (normal_(o.estado) === 'financiacion' ? 0.6 : 0.35); }, 0), 2);

  return {ok: true, desde: desde, hasta: hasta,
    embudo: embudo, municipios: municipios,
    tiempos: {propuesta_firma: media(tiempos.propuesta_firma),
              firma_instalacion: media(tiempos.firma_instalacion),
              instalacion_legalizacion: media(tiempos.instalacion_legalizacion)},
    motivos: Object.keys(motivos).map(function (k) { return {motivo: k, n: motivos[k]}; })
      .sort(function (a, b) { return b.n - a.n; }),
    producto: Object.keys(tipos).map(function (k) { return tipos[k]; }),
    cartera_abierta: abiertas.length, prevision_ponderada: prevision
  };
}

/* ---------- avisos ---------- */

function accAlertas_(u, p) {
  const per = permisos_(u);
  const hoy = hoyISO_();
  const clientes = misClientes_(u);
  const operaciones = misOperaciones_(u);
  const avisos = [];

  clientes.forEach(function (c) {
    if (txt_(c.proxima_fecha) && txt_(c.proxima_fecha) < hoy &&
        ['ganado', 'perdido'].indexOf(normal_(c.estado)) < 0) {
      avisos.push({tipo: 'accion_vencida', nivel: 'alto', cliente_id: c.id,
        texto: c.nombre + ': "' + (txt_(c.proxima_accion) || 'seguimiento') + '" venció el ' + txt_(c.proxima_fecha) + '.'});
    }
  });

  operaciones.forEach(function (o) {
    const f = txt_(o.fecha_propuesta);
    if (normal_(o.estado) === 'propuesta' && f && (diasEntre_(f, hoy) || 0) > 15) {
      avisos.push({tipo: 'propuesta_dormida', nivel: 'medio', operacion_id: o.id, cliente_id: o.cliente_id,
        texto: 'Propuesta de ' + diasEntre_(f, hoy) + ' días sin cerrar (' + (o.referencia || o.id) + ').'});
    }
    if (['material','instalacion'].indexOf(normal_(o.estado)) >= 0 && !txt_(o.fecha_prevista_instalacion)) {
      avisos.push({tipo: 'sin_fecha', nivel: 'medio', operacion_id: o.id, cliente_id: o.cliente_id,
        texto: 'Obra en marcha sin fecha prevista de instalación (' + (o.referencia || o.id) + ').'});
    }
  });

  if (per.finanzas) {
    const opIds = {};
    leer_('OPERACIONES').forEach(function (o) { opIds[String(o.id)] = o; });
    leer_('COBROS').forEach(function (c) {
      if (!txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < hoy) {
        const op = opIds[String(c.operacion_id)] || {};
        avisos.push({tipo: 'cobro_vencido', nivel: 'alto', operacion_id: c.operacion_id,
          texto: 'Cobro vencido de ' + redondear_(num_(c.importe), 0) + ' € (' + (op.referencia || c.operacion_id) + ') desde el ' + txt_(c.fecha_prevista) + '.'});
      }
    });
    leer_('FACTURAS').forEach(function (f) {
      if (!txt_(f.fecha_cobro) && txt_(f.fecha_vencimiento) && txt_(f.fecha_vencimiento) < hoy) {
        avisos.push({tipo: 'factura_vencida', nivel: 'alto', texto:
          'Factura ' + f.numero + ' vencida el ' + txt_(f.fecha_vencimiento) + ' (' + redondear_(num_(f.total), 0) + ' €).'});
      }
    });
  }

  /* ¿Falta el parte de hoy? */
  if (u.rol === 'comercial' || u.rol === 'captador') {
    const hayParte = leer_('PARTES').some(function (x) {
      return String(x.usuario_id) === String(u.id) && txt_(x.fecha) === hoy; });
    if (!hayParte) avisos.push({tipo: 'parte_pendiente', nivel: 'bajo',
      texto: 'Todavía no has enviado el parte de hoy.'});
  }

  const orden = {alto: 0, medio: 1, bajo: 2};
  avisos.sort(function (a, b) { return orden[a.nivel] - orden[b.nivel]; });
  return {ok: true, alertas: avisos.slice(0, 80)};
}


/* ==========================================================================
   08_Nominas.gs
   ========================================================================== */

/**
 * 08_Nominas.gs — Nómina de cada persona, con desglose por días y fechas.
 *
 * Cada uno ve la suya; superadmin y administradores ven las de todos.
 * La nómina se compone de sueldo bruto, dietas y comisiones devengadas
 * en el periodo (del 16 al 15, que es como se computan los objetivos),
 * y se abona a final de mes.
 */

function accNominas_(u, p) {
  const per = permisos_(u);
  const objetivoId = txt_(p.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !per.nominasAjenas) {
    return {ok: false, error: 'Solo puedes ver tu propia nómina.'};
  }
  const nominas = leer_('NOMINAS').filter(function (n) { return String(n.usuario_id) === String(objetivoId); })
    .sort(function (a, b) { return txt_(b.periodo).localeCompare(txt_(a.periodo)); });
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  return {ok: true, nominas: nominas, persona: persona ? publicoConNomina_(persona) : null};
}

/**
 * Desglose día a día entre dos fechas: qué se devenga cada jornada,
 * qué dietas corresponden, qué comisiones han caído y qué hizo ese día.
 */
function accNominaDias_(u, p) {
  const per = permisos_(u);
  const objetivoId = txt_(p.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !per.nominasAjenas) {
    return {ok: false, error: 'Solo puedes ver tu propio desglose.'};
  }
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  const hasta = txt_(p.hasta) || hoyISO_();
  const desde = txt_(p.desde) || (hasta.slice(0, 8) + '01');

  const bruto = num_(persona.salario_bruto);
  const dietasMes = num_(persona.dietas_mes);
  const jornadaH = num_(persona.jornada_horas) || 7.5;

  const jornadas = indexar_(leer_('JORNADAS').filter(function (j) {
    return String(j.usuario_id) === String(objetivoId); }), 'fecha');

  const partes = indexar_(leer_('PARTES').filter(function (x) {
    return String(x.usuario_id) === String(objetivoId); }), 'fecha');

  const operaciones = leer_('OPERACIONES').filter(function (o) {
    return String(o.comercial_id) === String(objetivoId) && esGanada_(o); });
  const captaciones = leer_('CAPTACIONES').filter(function (c) {
    return String(c.captador_id) === String(objetivoId) && normal_(c.resultado) === 'venta'; });

  const cfg = config_();
  const cFV = num_(persona.comision_fv) || num_(cfg.comision_fv);
  const cAero = num_(persona.comision_aero) || num_(cfg.comision_aero);
  const cCap = num_(cfg.comision_captacion);

  const comisionDia = {};
  operaciones.forEach(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    const t = normal_(o.tipo);
    let c = 0;
    if (t === 'fv' || t === 'fv_aero') c += cFV;
    if (t === 'aero' || t === 'fv_aero') c += cAero;
    if (!c) return;
    if (!comisionDia[f]) comisionDia[f] = {importe: 0, conceptos: []};
    comisionDia[f].importe += c;
    comisionDia[f].conceptos.push((o.referencia || o.id) + ' · ' + c + ' €');
  });
  captaciones.forEach(function (c) {
    const f = txt_(c.fecha_resultado) || txt_(c.fecha);
    if (!comisionDia[f]) comisionDia[f] = {importe: 0, conceptos: []};
    comisionDia[f].importe += cCap;
    comisionDia[f].conceptos.push('Captación ' + c.id + ' · ' + cCap + ' €');
  });

  /* Días laborables del mes de referencia, para prorratear. */
  const dias = [];
  let cursor = desde;
  let guardia = 0;
  const totales = {devengo: 0, dietas: 0, comisiones: 0, horas: 0, laborables: 0,
                   sentadas: 0, puertas: 0, fichas: 0, ventas: 0};

  while (cursor <= hasta && guardia++ < 400) {
    const d = fecha_(cursor);
    const finde = d.getDay() === 0 || d.getDay() === 6;
    const j = jornadas[cursor];
    const tipo = j ? txt_(j.tipo) : (finde ? 'libre' : 'trabajado');
    const laborable = tipo === 'trabajado';
    const labMes = diasLaborables_(cursor.slice(0, 7));
    const devengo = laborable ? redondear_(bruto / labMes, 2) : 0;
    const dieta = laborable ? redondear_(dietasMes / labMes, 2) : 0;
    const com = comisionDia[cursor] ? redondear_(comisionDia[cursor].importe, 2) : 0;
    const parte = partes[cursor];

    dias.push({
      fecha: cursor,
      dia_semana: ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d.getDay()],
      tipo: tipo, horas: laborable ? (j ? num_(j.horas) || jornadaH : jornadaH) : 0,
      devengo: devengo, dietas: dieta, comisiones: com,
      concepto_comision: comisionDia[cursor] ? comisionDia[cursor].conceptos.join(' · ') : '',
      total_dia: redondear_(devengo + dieta + com, 2),
      sentadas: parte ? num_(parte.sentadas) : 0,
      puertas: parte ? num_(parte.puertas) : 0,
      fichas: parte ? num_(parte.fichas) : 0,
      ventas: parte ? num_(parte.ventas) : 0,
      parte: parte ? txt_(parte.resumen).slice(0, 180) : '',
      notas: j ? txt_(j.notas) : ''
    });

    totales.devengo += devengo; totales.dietas += dieta; totales.comisiones += com;
    totales.horas += laborable ? jornadaH : 0;
    totales.laborables += laborable ? 1 : 0;
    if (parte) {
      totales.sentadas += num_(parte.sentadas);
      totales.puertas += num_(parte.puertas);
      totales.fichas += num_(parte.fichas);
      totales.ventas += num_(parte.ventas);
    }
    cursor = sumarDias_(cursor, 1);
  }

  Object.keys(totales).forEach(function (k) { totales[k] = redondear_(totales[k], 2); });
  totales.bruto_periodo = redondear_(totales.devengo + totales.dietas + totales.comisiones, 2);
  const irpf = redondear_(totales.bruto_periodo * num_(persona.irpf_pct) / 100, 2);
  const ss = redondear_((totales.devengo) * num_(persona.ss_pct) / 100, 2);
  totales.irpf = irpf; totales.ss = ss;
  totales.neto_periodo = redondear_(totales.bruto_periodo - irpf - ss, 2);

  return {ok: true, persona: publicoConNomina_(persona), desde: desde, hasta: hasta,
          dias: dias, totales: totales};
}

function diasLaborables_(mesISO) {
  const anio = Number(mesISO.slice(0, 4)), mes = Number(mesISO.slice(5, 7));
  const ultimo = new Date(anio, mes, 0).getDate();
  let n = 0;
  for (let d = 1; d <= ultimo; d++) {
    const dia = new Date(anio, mes - 1, d).getDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return n || 21;
}

/** Genera (o rehace) la nómina de un periodo. Solo administradores. */
function accGenerarNomina_(u, p) {
  exigir_(u, 'nominasAjenas');
  const objetivoId = txt_(p.usuario_id);
  const periodo = txt_(p.periodo) || mesDe_(hoyISO_());
  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  /* Comisiones del 16 del mes anterior al 15 del mes de la nómina. */
  const anio = Number(periodo.slice(0, 4)), mes = Number(periodo.slice(5, 7));
  const iniC = new Date(anio, mes - 2, 16);
  const finC = new Date(anio, mes - 1, 15);
  const desdeC = Utilities.formatDate(iniC, zonaHoraria_(), 'yyyy-MM-dd');
  const hastaC = Utilities.formatDate(finC, zonaHoraria_(), 'yyyy-MM-dd');

  const ganadas = leer_('OPERACIONES').filter(function (o) {
    const f = txt_(o.fecha_firma) || txt_(o.creado);
    return String(o.comercial_id) === String(objetivoId) && esGanada_(o) && f >= desdeC && f <= hastaC;
  });
  const capVenta = leer_('CAPTACIONES').filter(function (c) {
    const f = txt_(c.fecha_resultado) || txt_(c.fecha);
    return String(c.captador_id) === String(objetivoId) && normal_(c.resultado) === 'venta' &&
           f >= desdeC && f <= hastaC;
  });
  const com = comisionesDe_(persona, ganadas, capVenta,
    ventasDeSuEquipo_(persona, desdeC, hastaC));

  const bruto = num_(persona.salario_bruto);
  const dietas = num_(persona.dietas_mes);
  const otros = num_(p.otros);
  const brutoTotal = redondear_(bruto + dietas + com.total + otros, 2);
  const irpfPct = num_(persona.irpf_pct), ssPct = num_(persona.ss_pct);
  const irpf = redondear_(brutoTotal * irpfPct / 100, 2);
  const ss = redondear_(bruto * ssPct / 100, 2);
  const neto = redondear_(brutoTotal - irpf - ss, 2);

  const detalle = {comisiones: com.detalle, periodo_comisiones: {desde: desdeC, hasta: hastaC}};
  const existente = leer_('NOMINAS').filter(function (n) {
    return String(n.usuario_id) === String(objetivoId) && txt_(n.periodo) === periodo; })[0];

  const datos = {usuario_id: objetivoId, periodo: periodo, bruto: bruto, dietas: dietas,
    comisiones: com.total, otros: otros, bruto_total: brutoTotal, irpf_pct: irpfPct, irpf: irpf,
    ss_pct: ssPct, ss: ss, neto: neto, estado: existente ? existente.estado : 'pendiente',
    fecha_pago: existente ? existente.fecha_pago : '', url: existente ? existente.url : '',
    detalle: JSON.stringify(detalle), notas: txt_(p.notas)};

  const r = existente ? actualizar_('NOMINAS', existente.id, datos)
                      : insertar_('NOMINAS', Object.assign({creado: ahora_()}, datos));
  registrar_(u, 'nomina', 'NOMINAS', r.id, persona.usuario + ' ' + periodo);
  return {ok: true, nomina: r};
}

function accGuardarNomina_(u, p) {
  exigir_(u, 'nominasAjenas');
  const d = p.nomina || {};
  const campos = ['estado','fecha_pago','url','notas','otros','bruto','dietas','comisiones',
                  'irpf_pct','ss_pct'];
  const cambios = {};
  campos.forEach(function (c) { if (d[c] !== undefined) cambios[c] = d[c]; });
  if (cambios.bruto !== undefined || cambios.otros !== undefined || cambios.comisiones !== undefined) {
    const actual = leer_('NOMINAS').filter(function (n) { return String(n.id) === String(d.id); })[0] || {};
    const bruto = num_(cambios.bruto !== undefined ? cambios.bruto : actual.bruto);
    const dietas = num_(cambios.dietas !== undefined ? cambios.dietas : actual.dietas);
    const com = num_(cambios.comisiones !== undefined ? cambios.comisiones : actual.comisiones);
    const otros = num_(cambios.otros !== undefined ? cambios.otros : actual.otros);
    const bt = redondear_(bruto + dietas + com + otros, 2);
    const irpf = redondear_(bt * num_(cambios.irpf_pct !== undefined ? cambios.irpf_pct : actual.irpf_pct) / 100, 2);
    const ss = redondear_(bruto * num_(cambios.ss_pct !== undefined ? cambios.ss_pct : actual.ss_pct) / 100, 2);
    cambios.bruto_total = bt; cambios.irpf = irpf; cambios.ss = ss;
    cambios.neto = redondear_(bt - irpf - ss, 2);
  }
  const r = actualizar_('NOMINAS', d.id, cambios);
  registrar_(u, 'editar_nomina', 'NOMINAS', d.id, cambios.estado || '');
  return {ok: true, nomina: r};
}

/** Vacaciones, bajas y festivos: quien los apunta es quien manda. */
function accGuardarJornada_(u, p) {
  const d = p.jornada || {};
  const objetivoId = txt_(d.usuario_id) || u.id;
  if (String(objetivoId) !== String(u.id) && !permisos_(u).nominasAjenas) {
    return {ok: false, error: 'No puedes tocar el calendario de otra persona.'};
  }
  const existente = leer_('JORNADAS').filter(function (j) {
    return String(j.usuario_id) === String(objetivoId) && txt_(j.fecha) === txt_(d.fecha); })[0];
  const datos = {usuario_id: objetivoId, fecha: txt_(d.fecha), tipo: txt_(d.tipo) || 'trabajado',
    horas: num_(d.horas), dietas: num_(d.dietas), comisiones: num_(d.comisiones),
    concepto: txt_(d.concepto), notas: txt_(d.notas)};
  const r = existente ? actualizar_('JORNADAS', existente.id, datos) : insertar_('JORNADAS', datos);
  return {ok: true, jornada: r};
}

/* ================= la nómina en PDF ================= */
/*
 * Rubén y Fernando suben cada mes el PDF de la nómina de cada persona.
 * El archivo se guarda en una carpeta del Drive de la empresa y NO se
 * comparte con nadie: para verlo hay que pedirlo por aquí, y el servidor
 * solo lo entrega a su dueño o a dirección.
 */

function carpetaNominas_() {
  const id = PROPS.getProperty('ID_CARPETA_NOMINAS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  const nombre = 'NÓMINAS · CRM ZERO WATTIOS';
  const busca = DriveApp.getFoldersByName(nombre);
  const carpeta = busca.hasNext() ? busca.next() : DriveApp.createFolder(nombre);
  PROPS.setProperty('ID_CARPETA_NOMINAS', carpeta.getId());
  return carpeta;
}

/** Sube (o reemplaza) el PDF de la nómina de una persona en un mes. */
function accSubirNomina_(u, p) {
  exigir_(u, 'nominasAjenas');
  const objetivoId = txt_(p.usuario_id);
  const periodo = txt_(p.periodo);
  const datos = txt_(p.datos);
  if (!objetivoId || !/^\d{4}-\d{2}$/.test(periodo)) {
    return {ok: false, error: 'Falta la persona o el periodo (aaaa-mm).'};
  }
  if (!datos) return {ok: false, error: 'No ha llegado el archivo.'};

  const persona = leer_('USUARIOS').filter(function (x) { return String(x.id) === String(objetivoId); })[0];
  if (!persona) return {ok: false, error: 'No existe esa persona.'};

  const tipo = txt_(p.tipo) || 'application/pdf';
  const nombre = 'Nomina_' + normal_(persona.usuario).replace(/\s+/g, '_') + '_' + periodo + '.pdf';
  const blob = Utilities.newBlob(Utilities.base64Decode(datos), tipo, nombre);
  const archivo = carpetaNominas_().createFile(blob);

  const existente = leer_('NOMINAS').filter(function (n) {
    return String(n.usuario_id) === String(objetivoId) && txt_(n.periodo) === periodo; })[0];

  /* Si ya había un PDF para ese mes, el viejo se manda a la papelera. */
  if (existente && txt_(existente.archivo_id)) {
    try { DriveApp.getFileById(txt_(existente.archivo_id)).setTrashed(true); } catch (e) {}
  }

  const datosFila = {
    usuario_id: objetivoId, periodo: periodo,
    archivo_id: archivo.getId(), archivo_nombre: nombre,
    subida_por: u.id, subida_fecha: ahora_(),
    estado: txt_(p.estado) || (existente ? txt_(existente.estado) : 'pagada'),
    fecha_pago: txt_(p.fecha_pago) || (existente ? txt_(existente.fecha_pago) : ''),
    neto: p.neto !== undefined && txt_(p.neto) !== '' ? num_(p.neto) : (existente ? num_(existente.neto) : ''),
    notas: txt_(p.notas) || (existente ? txt_(existente.notas) : '')
  };

  const r = existente ? actualizar_('NOMINAS', existente.id, datosFila)
                      : insertar_('NOMINAS', Object.assign({creado: ahora_()}, datosFila));
  registrar_(u, 'subir_nomina', 'NOMINAS', r.id, persona.usuario + ' ' + periodo);
  return {ok: true, nomina: r};
}

/** Devuelve el PDF en base64, solo a su dueño o a dirección. */
function accDescargarNomina_(u, p) {
  const n = leer_('NOMINAS').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!n) return {ok: false, error: 'No existe esa nómina.'};
  if (String(n.usuario_id) !== String(u.id) && !permisos_(u).nominasAjenas) {
    return {ok: false, error: 'Esa nómina no es tuya.'};
  }
  if (!txt_(n.archivo_id)) return {ok: false, error: 'Esa nómina todavía no tiene PDF subido.'};
  let archivo;
  try { archivo = DriveApp.getFileById(txt_(n.archivo_id)); }
  catch (e) { return {ok: false, error: 'El archivo ya no está en el Drive de la empresa.'}; }
  registrar_(u, 'ver_nomina', 'NOMINAS', n.id, txt_(n.periodo));
  return {ok: true, nombre: txt_(n.archivo_nombre) || archivo.getName(),
          tipo: archivo.getMimeType(),
          datos: Utilities.base64Encode(archivo.getBlob().getBytes())};
}

/** Quita la nómina de un mes (y su PDF). Solo dirección. */
function accBorrarNomina_(u, p) {
  exigir_(u, 'nominasAjenas');
  const n = leer_('NOMINAS').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!n) return {ok: false, error: 'No existe esa nómina.'};
  if (txt_(n.archivo_id)) {
    try { DriveApp.getFileById(txt_(n.archivo_id)).setTrashed(true); } catch (e) {}
  }
  borrar_('NOMINAS', p.id);
  registrar_(u, 'borrar_nomina', 'NOMINAS', p.id, txt_(n.periodo));
  return {ok: true};
}


/* ==========================================================================
   09_Mapa.gs
   ========================================================================== */

/**
 * 09_Mapa.gs — Mapa de clientes visitados. Solo dirección.
 *
 * Devuelve un punto por cliente con todo lo que hace falta para
 * decidir dónde merece la pena volver: estado, tecnología, gasto
 * energético, interés, quién lo lleva y qué se vendió.
 */

function soloDireccion_(u) {
  if (permisos_(u).alcance !== 'todo') {
    throw new Error('El mapa de clientes es solo para dirección.');
  }
}

function accMapa_(u, p) {
  soloDireccion_(u);
  const clientes = leer_('CLIENTES');
  const operaciones = leer_('OPERACIONES');
  const captaciones = leer_('CAPTACIONES');
  const usuarios = indexar_(leer_('USUARIOS'));
  const seguimiento = leer_('SEGUIMIENTO');

  const opPorCliente = {};
  operaciones.forEach(function (o) {
    const k = String(o.cliente_id);
    if (!opPorCliente[k] || esGanada_(o)) opPorCliente[k] = o;
  });
  const capPorCliente = indexar_(captaciones, 'cliente_id');
  const ultimoContacto = {};
  seguimiento.forEach(function (s) {
    const k = String(s.cliente_id);
    if (!ultimoContacto[k] || ultimoContacto[k] < txt_(s.fecha)) ultimoContacto[k] = txt_(s.fecha);
  });

  const puntos = [];
  let sinCoordenadas = 0;

  clientes.forEach(function (c) {
    const co = coordenadas_(c.coordenadas);
    if (!co) { sinCoordenadas++; return; }
    const op = opPorCliente[String(c.id)];
    const cap = capPorCliente[String(c.id)];
    puntos.push({
      id: c.id, nombre: c.nombre, lat: co[0], lng: co[1],
      direccion: c.direccion, municipio: c.municipio, cp: c.cp,
      telefono: c.telefono, email: c.email,
      estado: c.estado, fecha_estado: c.fecha_estado, origen: c.origen,
      comercial: (usuarios[String(c.comercial_id)] || {}).nombre || '',
      comercial_id: c.comercial_id,
      captador: (usuarios[String(c.captador_id)] || {}).nombre || '',
      captador_id: c.captador_id,
      interes: num_(c.interes), m2: num_(c.m2), personas: num_(c.personas),
      tipo_vivienda: c.tipo_vivienda, calefaccion: c.calefaccion,
      gasto_luz_mes: num_(c.gasto_luz_mes),
      gasto_combustible: num_(c.gasto_combustible),
      periodo_combustible: c.periodo_combustible,
      gasto_anual: gastoAnual_(c),
      creado: c.creado, ultimo_contacto: ultimoContacto[String(c.id)] || '',
      proxima_accion: c.proxima_accion, proxima_fecha: c.proxima_fecha,
      perfil: c.perfil,
      tecnologia: cap ? cap.tecnologia : (op ? op.tipo : ''),
      operacion: op ? {id: op.id, referencia: op.referencia, tipo: op.tipo, estado: op.estado,
        total: num_(op.total), fecha_firma: op.fecha_firma, fecha_instalacion: op.fecha_instalacion,
        paneles: num_(op.paneles_num), aero_kw: num_(op.aero_kw), bateria_kwh: num_(op.bateria_kwh)} : null
    });
  });

  /* Resumen por municipio, para las zonas calientes. */
  const mun = {};
  puntos.forEach(function (x) {
    const k = txt_(x.municipio) || 'Sin municipio';
    if (!mun[k]) mun[k] = {municipio: k, clientes: 0, ventas: 0, importe: 0, gasto: 0, lat: 0, lng: 0};
    const m = mun[k];
    m.clientes += 1; m.gasto += x.gasto_anual; m.lat += x.lat; m.lng += x.lng;
    if (x.operacion && ['firmada','tramite','material','instalacion','instalada','legalizada','cerrada']
        .indexOf(normal_(x.operacion.estado)) >= 0) {
      m.ventas += 1; m.importe += x.operacion.total;
    }
  });
  const municipios = Object.keys(mun).map(function (k) {
    const m = mun[k];
    return {municipio: k, clientes: m.clientes, ventas: m.ventas,
            importe: redondear_(m.importe, 2), conversion: pct_(m.ventas, m.clientes),
            gasto_medio: redondear_(m.gasto / m.clientes, 0),
            lat: redondear_(m.lat / m.clientes, 6), lng: redondear_(m.lng / m.clientes, 6)};
  }).sort(function (a, b) { return b.clientes - a.clientes; });

  return {ok: true, puntos: puntos, municipios: municipios,
          sin_coordenadas: sinCoordenadas, total: clientes.length};
}

function gastoAnual_(c) {
  const luz = num_(c.gasto_luz_mes) * 12;
  const comb = num_(c.gasto_combustible);
  const per = normal_(c.periodo_combustible);
  const combAnual = per === 'al mes' ? comb * 12 : (per === 'por deposito' || per === 'por depósito' ? comb * 2 : comb);
  return redondear_(luz + combAnual, 0);
}

function coordenadas_(v) {
  const s = txt_(v).replace(/\s/g, '');
  if (!s) return null;
  const p = s.split(',');
  if (p.length !== 2) return null;
  const lat = parseFloat(p[0]), lng = parseFloat(p[1]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [redondear_(lat, 6), redondear_(lng, 6)];
}

/**
 * Busca las coordenadas de los clientes que no las tienen, a partir de
 * su dirección. Va de 20 en 20 para no agotar el tiempo de ejecución.
 */
function accGeocodificar_(u, p) {
  soloDireccion_(u);
  const limite = Math.min(num_(p.limite) || 20, 40);
  const pendientes = leer_('CLIENTES').filter(function (c) {
    return !coordenadas_(c.coordenadas) && txt_(c.direccion);
  }).slice(0, limite);

  let hechos = 0, fallos = 0;
  const geo = Maps.newGeocoder().setRegion('es');
  pendientes.forEach(function (c) {
    const dir = [txt_(c.direccion), txt_(c.municipio), txt_(c.cp), 'España']
      .filter(String).join(', ');
    try {
      const r = geo.geocode(dir);
      if (r.status === 'OK' && r.results && r.results.length) {
        const loc = r.results[0].geometry.location;
        actualizar_('CLIENTES', c.id, {coordenadas: redondear_(loc.lat, 6) + ',' + redondear_(loc.lng, 6)});
        hechos++;
      } else { fallos++; }
    } catch (e) { fallos++; }
    Utilities.sleep(120);
  });
  registrar_(u, 'geocodificar', 'CLIENTES', '', hechos + ' de ' + pendientes.length);
  const quedan = leer_('CLIENTES').filter(function (c) {
    return !coordenadas_(c.coordenadas) && txt_(c.direccion); }).length;
  return {ok: true, hechos: hechos, fallos: fallos, pendientes: quedan};
}


/* ==========================================================================
   10_Api.gs
   ========================================================================== */

/**
 * 10_Api.gs — Puerta de entrada del CRM.
 *
 * El navegador envía una única petición POST con un JSON en el cuerpo y
 * el tipo text/plain (así el navegador no hace petición previa de CORS).
 * Aquí se comprueba la sesión y se reparte el trabajo.
 */

/* El mapa se construye al recibir la petición, no al cargar el archivo: así
   da igual en qué orden evalúe Apps Script los archivos del proyecto. */
function acciones_() {
  return {
    /* sesión */
    salir: accSalir_,
    cambiarClave: accCambiarClave_,

    /* datos */
    datos: accDatos_,
    buscar: accBuscar_,
    guardarCliente: accGuardarCliente_,
    borrarCliente: accBorrarCliente_,
    guardarOperacion: accGuardarOperacion_,
    borrarOperacion: accBorrarOperacion_,
    guardarSeguimiento: accGuardarSeguimiento_,
    guardarCaptacion: accGuardarCaptacion_,

    /* finanzas */
    finanzas: accFinanzas_,
    guardarCobro: accGuardarCobro_,
    borrarCobro: accBorrarCobro_,
    guardarFactura: accGuardarFactura_,
    borrarFactura: accBorrarFactura_,
    guardarGasto: accGuardarGasto_,
    borrarGasto: accBorrarGasto_,

    /* parte diario */
    guardarParte: accGuardarParte_,
    aplicarParte: accAplicarParte_,
    reanalizar: accReanalizar_,
    partes: accPartes_,

    /* resúmenes y analítica */
    resumen: accResumen_,
    equipo: accEquipo_,
    analitica: accAnalitica_,
    alertas: accAlertas_,

    /* nóminas */
    nominas: accNominas_,
    nominaDias: accNominaDias_,
    generarNomina: accGenerarNomina_,
    guardarNomina: accGuardarNomina_,
    subirNomina: accSubirNomina_,
    descargarNomina: accDescargarNomina_,
    borrarNomina: accBorrarNomina_,
    guardarJornada: accGuardarJornada_,

    /* vacaciones */
    vacaciones: accVacaciones_,
    solicitarVacaciones: accSolicitarVacaciones_,
    resolverVacaciones: accResolverVacaciones_,
    cancelarVacaciones: accCancelarVacaciones_,

    /* mapa */
    mapa: accMapa_,
    geocodificar: accGeocodificar_,

    /* administración */
    usuarios: accUsuarios_,
    importar: accImportar_,
    guardarUsuario: accGuardarUsuario_,
    resetClave: accResetClave_,
    guardarConfig: accGuardarConfig_,
    registro: accRegistro_,

    /* banco */
    banco: accBanco_,
    importarBanco: accImportarBanco_,
    guardarMovimiento: accGuardarMovimiento_,
    gastoDesdeBanco: accGastoDesdeBanco_,
    reclasificarBanco: accReclasificarBanco_,
    ajustarEstructura: accAjustarEstructura_,

    /* copias de seguridad */
    copias: accCopias_,
    copiaAhora: accCopiaAhora_,
    descargarCopia: accDescargarCopia_,

    /* resumen semanal por correo */
    resumenSemanalAhora: accResumenSemanalAhora_,
    probarResumen: accProbarResumen_
  };
}

function doPost(e) {
  let p = {};
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ok: false, error: 'La petición no es un JSON válido.'});
  }
  return json_(despachar_(p));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.accion === 'ping') return json_({ok: true, version: VERSION, servidor: ahora_()});
  return json_(despachar_(p));
}

function despachar_(p) {
  const accion = txt_(p.accion);
  try {
    if (accion === 'ping') return {ok: true, version: VERSION, servidor: ahora_()};
    if (accion === 'login') return accLogin_(p);
    const fn = acciones_()[accion];
    if (!fn) return {ok: false, error: 'Acción desconocida: ' + accion};

    const u = sesion_(p.token);
    if (!u) return {ok: false, error: 'Sesión caducada. Vuelve a entrar.', sesion: false};
    return fn(u, p) || {ok: true};
  } catch (err) {
    return {ok: false, error: String(err && err.message ? err.message : err)};
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- configuración y registro ---------- */

function accGuardarConfig_(u, p) {
  exigir_(u, 'config');
  const cambios = p.config || {};
  const h = hoja_('CONFIG');
  const filas = leer_('CONFIG');
  Object.keys(cambios).forEach(function (k) {
    const f = filas.filter(function (x) { return x.clave === k; })[0];
    if (f) h.getRange(f._fila, 2).setValue(cambios[k]);
    else h.appendRow([k, cambios[k], '']);
  });
  registrar_(u, 'config', 'CONFIG', '', Object.keys(cambios).join(','));
  return {ok: true, config: config_()};
}

function accRegistro_(u, p) {
  exigir_(u, 'config');
  const n = Math.min(num_(p.limite) || 200, 500);
  const todo = leer_('LOG');
  return {ok: true, registro: todo.slice(Math.max(0, todo.length - n)).reverse()};
}


/* ==========================================================================
   11_Vacaciones.gs
   ========================================================================== */

/**
 * 11_Vacaciones.gs — Calendario de vacaciones.
 *
 * Cada persona pide sus días; solo dirección (Rubén y Fernando, o el
 * superadmin) los aprueba o los deniega. Hasta que no están aprobados, no
 * cuentan como disfrutados. Al aprobarse, esos días quedan marcados como
 * vacaciones en el calendario de nóminas.
 */

function diasVacacionesAnio_() { return configNum_('dias_vacaciones', 22); }

function festivos_() {
  const c = config_();
  return String(c.festivos || '').split(/[,\s;]+/)
    .map(function (x) { return txt_(x); })
    .filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); });
}

/** Días laborables entre dos fechas, quitando fines de semana y festivos. */
function laborablesEntre_(desde, hasta) {
  const fiestas = festivos_();
  let dias = 0, cursor = txt_(desde), guardia = 0;
  const lista = [];
  while (cursor <= txt_(hasta) && guardia++ < 400) {
    const d = fecha_(cursor);
    const finde = d.getDay() === 0 || d.getDay() === 6;
    if (!finde && fiestas.indexOf(cursor) < 0) { dias++; lista.push(cursor); }
    cursor = sumarDias_(cursor, 1);
  }
  return {dias: dias, fechas: lista};
}

/** Lo que ve cada uno: sus vacaciones; dirección, las de todo el equipo. */
function accVacaciones_(u, p) {
  const per = permisos_(u);
  const anio = txt_(p.anio) || hoyISO_().slice(0, 4);
  let todas = leer_('VACACIONES').filter(function (v) { return txt_(v.anio) === anio; });
  if (!per.nominasAjenas) {
    todas = todas.filter(function (v) { return String(v.usuario_id) === String(u.id); });
  } else if (txt_(p.usuario_id)) {
    todas = todas.filter(function (v) { return String(v.usuario_id) === String(p.usuario_id); });
  }
  todas.sort(function (a, b) { return txt_(a.desde).localeCompare(txt_(b.desde)); });

  /* Saldo de cada persona visible. */
  const gente = per.nominasAjenas
    ? leer_('USUARIOS').filter(function (x) { return normal_(x.activo) === 'si'; })
    : [u];
  const saldos = gente.map(function (g) {
    const suyas = leer_('VACACIONES').filter(function (v) {
      return String(v.usuario_id) === String(g.id) && txt_(v.anio) === anio; });
    const aprobadas = suyas.filter(function (v) { return normal_(v.estado) === 'aprobada'; });
    const pendientes = suyas.filter(function (v) { return normal_(v.estado) === 'solicitada'; });
    const disfrutados = aprobadas.filter(function (v) { return txt_(v.hasta) < hoyISO_(); })
      .reduce(function (a, v) { return a + num_(v.dias); }, 0);
    const aprobados = aprobadas.reduce(function (a, v) { return a + num_(v.dias); }, 0);
    return {
      usuario_id: g.id, nombre: g.nombre, rol: g.rol,
      derecho: diasVacacionesAnio_(),
      aprobados: aprobados,
      disfrutados: disfrutados,
      pendientes: pendientes.reduce(function (a, v) { return a + num_(v.dias); }, 0),
      restantes: diasVacacionesAnio_() - aprobados
    };
  });

  return {ok: true, anio: anio, vacaciones: todas, saldos: saldos,
          festivos: festivos_(), derecho: diasVacacionesAnio_(),
          puede_aprobar: !!per.nominasAjenas};
}

/** Pedir días. Cualquiera puede pedir los suyos. */
function accSolicitarVacaciones_(u, p) {
  const desde = txt_(p.desde), hasta = txt_(p.hasta) || txt_(p.desde);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return {ok: false, error: 'Faltan las fechas.'};
  }
  if (hasta < desde) return {ok: false, error: 'La fecha de vuelta es anterior a la de salida.'};

  /* Dirección puede pedir en nombre de alguien; el resto, solo para sí. */
  const objetivoId = (permisos_(u).nominasAjenas && txt_(p.usuario_id)) ? txt_(p.usuario_id) : u.id;
  const anio = desde.slice(0, 4);
  const cuenta = laborablesEntre_(desde, hasta);
  if (!cuenta.dias) return {ok: false, error: 'Ese periodo no tiene ningún día laborable.'};

  /* Que no se pisen dos peticiones de la misma persona. */
  const suyas = leer_('VACACIONES').filter(function (v) {
    return String(v.usuario_id) === String(objetivoId) &&
           ['solicitada', 'aprobada'].indexOf(normal_(v.estado)) >= 0;
  });
  const pisa = suyas.some(function (v) { return !(txt_(v.hasta) < desde || txt_(v.desde) > hasta); });
  if (pisa) return {ok: false, error: 'Ya tienes días pedidos o aprobados en esas fechas.'};

  /* Que no se pasen del derecho anual. */
  const gastados = suyas.filter(function (v) { return txt_(v.anio) === anio; })
    .reduce(function (a, v) { return a + num_(v.dias); }, 0);
  const derecho = diasVacacionesAnio_();
  if (gastados + cuenta.dias > derecho) {
    return {ok: false, error: 'Te quedan ' + (derecho - gastados) + ' día(s) de los ' + derecho +
      ' del año y estás pidiendo ' + cuenta.dias + '.'};
  }

  const r = insertar_('VACACIONES', {
    usuario_id: objetivoId, anio: anio, desde: desde, hasta: hasta, dias: cuenta.dias,
    tipo: txt_(p.tipo) || 'vacaciones', estado: 'solicitada', nota: txt_(p.nota),
    solicitada: ahora_(), resuelta_por: '', resuelta_fecha: '', respuesta: ''
  });
  registrar_(u, 'solicitar_vacaciones', 'VACACIONES', r.id, desde + ' a ' + hasta);
  return {ok: true, vacaciones: r};
}

/** Aprobar o denegar. Solo dirección. */
function accResolverVacaciones_(u, p) {
  exigir_(u, 'nominasAjenas');
  const estado = normal_(p.estado);
  if (['aprobada', 'denegada'].indexOf(estado) < 0) return {ok: false, error: 'Estado no válido.'};
  const v = leer_('VACACIONES').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!v) return {ok: false, error: 'Esa solicitud ya no existe.'};

  const r = actualizar_('VACACIONES', v.id, {
    estado: estado, resuelta_por: u.id, resuelta_fecha: ahora_(), respuesta: txt_(p.respuesta)
  });

  /* Al aprobar, los días quedan marcados en el calendario de la persona. */
  if (estado === 'aprobada') marcarJornadas_(v, 'vacaciones');
  else limpiarJornadas_(v);

  registrar_(u, estado === 'aprobada' ? 'aprobar_vacaciones' : 'denegar_vacaciones',
    'VACACIONES', v.id, txt_(v.desde) + ' a ' + txt_(v.hasta));
  return {ok: true, vacaciones: r};
}

/** Cancelar: la persona puede retirar lo suyo; dirección, cualquier cosa. */
function accCancelarVacaciones_(u, p) {
  const v = leer_('VACACIONES').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!v) return {ok: false, error: 'Esa solicitud ya no existe.'};
  if (String(v.usuario_id) !== String(u.id) && !permisos_(u).nominasAjenas) {
    return {ok: false, error: 'Esa solicitud no es tuya.'};
  }
  const r = actualizar_('VACACIONES', v.id, {estado: 'cancelada', resuelta_por: u.id,
    resuelta_fecha: ahora_()});
  limpiarJornadas_(v);
  registrar_(u, 'cancelar_vacaciones', 'VACACIONES', v.id, txt_(v.desde));
  return {ok: true, vacaciones: r};
}

function marcarJornadas_(v, tipo) {
  const dias = laborablesEntre_(txt_(v.desde), txt_(v.hasta)).fechas;
  const ya = leer_('JORNADAS').filter(function (j) { return String(j.usuario_id) === String(v.usuario_id); });
  dias.forEach(function (f) {
    const existente = ya.filter(function (j) { return txt_(j.fecha) === f; })[0];
    const datos = {usuario_id: v.usuario_id, fecha: f, tipo: tipo, horas: 0, dietas: 0,
      comisiones: 0, concepto: 'Vacaciones aprobadas', notas: txt_(v.id)};
    if (existente) actualizar_('JORNADAS', existente.id, datos);
    else insertar_('JORNADAS', datos);
  });
}

function limpiarJornadas_(v) {
  const dias = laborablesEntre_(txt_(v.desde), txt_(v.hasta)).fechas;
  leer_('JORNADAS').filter(function (j) {
    return String(j.usuario_id) === String(v.usuario_id) && dias.indexOf(txt_(j.fecha)) >= 0 &&
           txt_(j.notas) === txt_(v.id);
  }).forEach(function (j) { borrar_('JORNADAS', j.id); });
}


/* ==========================================================================
   12_Backup.gs
   ========================================================================== */

/**
 * 12_Backup.gs — Copia de seguridad semanal.
 *
 * Todos los viernes a las 19:15 se guarda una copia completa de la base
 * de datos en una carpeta del Drive de la empresa, en dos formatos: el
 * Excel de la hoja y un JSON con todas las tablas. Las copias de más de
 * tres meses se borran solas.
 */

const CARPETA_BACKUP = 'BACKUP CRM ZERO WATTIOS';
const MESES_BACKUP = 3;

/* La carpeta cuelga de "ZERO WATTIOS" en el Drive de la empresa cuando esa
   carpeta existe: así las copias aparecen solas en el ordenador de la
   oficina a través de Google Drive, sin tener que bajarlas a mano. */
function carpetaBackup_() {
  const id = PROPS.getProperty('ID_CARPETA_BACKUP');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }

  let padre = null;
  const empresa = DriveApp.getFoldersByName('ZERO WATTIOS');
  if (empresa.hasNext()) padre = empresa.next();

  let carpeta = null;
  const busca = padre ? padre.getFoldersByName(CARPETA_BACKUP) : DriveApp.getFoldersByName(CARPETA_BACKUP);
  if (busca.hasNext()) carpeta = busca.next();
  else carpeta = padre ? padre.createFolder(CARPETA_BACKUP) : DriveApp.createFolder(CARPETA_BACKUP);

  PROPS.setProperty('ID_CARPETA_BACKUP', carpeta.getId());
  return carpeta;
}

/**
 * Hace la copia. La ejecuta el disparador de los viernes, y también se
 * puede lanzar a mano desde el editor o desde el CRM.
 */
function copiaSeguridad() {
  const carpeta = carpetaBackup_();
  const sello = Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyy-MM-dd_HH-mm');
  const base = libro_();
  const salida = {fecha: ahora_(), version: VERSION, archivos: []};

  /* 1. El libro entero en Excel, que es lo que abre cualquiera. */
  try {
    const url = 'https://docs.google.com/spreadsheets/d/' + base.getId() + '/export?format=xlsx';
    const respuesta = UrlFetchApp.fetch(url, {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true});
    if (respuesta.getResponseCode() === 200) {
      const blob = respuesta.getBlob().setName('CRM_ZERO_WATTIOS_' + sello + '.xlsx');
      const archivo = carpeta.createFile(blob);
      salida.archivos.push({nombre: archivo.getName(), id: archivo.getId(), tipo: 'xlsx'});
    }
  } catch (e) { salida.error_xlsx = String(e); }

  /* 2. Un JSON con todas las tablas, por si algún día hay que mudarse. */
  const volcado = {generado: ahora_(), version: VERSION, tablas: {}};
  Object.keys(ESQUEMA).forEach(function (t) {
    if (t === 'SESIONES') return;                    // las sesiones no se guardan
    try { volcado.tablas[t] = leer_(t); } catch (e) { volcado.tablas[t] = []; }
  });
  const json = carpeta.createFile(
    Utilities.newBlob(JSON.stringify(volcado), 'application/json',
      'CRM_ZERO_WATTIOS_' + sello + '.json'));
  salida.archivos.push({nombre: json.getName(), id: json.getId(), tipo: 'json'});

  /* 3. Fuera lo que pase de tres meses. */
  const limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_BACKUP);
  let borrados = 0;
  const viejos = carpeta.getFiles();
  while (viejos.hasNext()) {
    const f = viejos.next();
    if (f.getDateCreated() < limite) { f.setTrashed(true); borrados++; }
  }
  salida.borrados = borrados;

  registrar_(null, 'copia_seguridad', 'BACKUP', sello,
    salida.archivos.length + ' archivo(s), ' + borrados + ' copia(s) antigua(s) borrada(s)');
  Logger.log(JSON.stringify(salida));
  return salida;
}

/**
 * Deja listos los dos disparadores de los viernes: el resumen semanal por
 * correo a las 18:00 y la copia de seguridad a las 19:15.
 */
function instalarDisparadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['copiaSeguridad', 'resumenSemanal'].indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('resumenSemanal')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(18).nearMinute(0)
    .create();
  ScriptApp.newTrigger('copiaSeguridad')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(19).nearMinute(15)
    .create();
  Logger.log('Disparadores creados: resumen semanal los viernes sobre las 18:00 y ' +
    'copia de seguridad sobre las 19:15 (zona horaria del proyecto).');
  return true;
}

/** Lo que hay guardado ahora mismo, para verlo desde el CRM. */
function accCopias_(u, p) {
  exigir_(u, 'config');
  const carpeta = carpetaBackup_();
  const lista = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    lista.push({id: f.getId(), nombre: f.getName(), url: f.getUrl(),
      creado: Utilities.formatDate(f.getDateCreated(), zonaHoraria_(), 'yyyy-MM-dd HH:mm'),
      tamano: f.getSize()});
  }
  lista.sort(function (a, b) { return String(b.creado).localeCompare(String(a.creado)); });
  return {ok: true, carpeta: carpeta.getUrl(), copias: lista, meses: MESES_BACKUP};
}

/** Lanza una copia a mano desde el CRM. */
function accCopiaAhora_(u, p) {
  exigir_(u, 'config');
  const r = copiaSeguridad();
  return {ok: true, resultado: r};
}

/**
 * Devuelve la última copia en base64 para que se pueda guardar fuera de
 * Google (por ejemplo, en el ordenador de la oficina).
 */
function accDescargarCopia_(u, p) {
  exigir_(u, 'config');
  const carpeta = carpetaBackup_();
  let mejor = null;
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (txt_(p.id) ? f.getId() === txt_(p.id)
                   : (!mejor || f.getDateCreated() > mejor.getDateCreated())) mejor = f;
  }
  if (!mejor) return {ok: false, error: 'Todavía no hay ninguna copia guardada.'};
  const bytes = mejor.getBlob().getBytes();
  if (bytes.length > 25 * 1024 * 1024) {
    return {ok: false, error: 'La copia pesa demasiado para enviarla por aquí: ' + mejor.getUrl()};
  }
  return {ok: true, nombre: mejor.getName(), tipo: mejor.getMimeType(),
          creado: Utilities.formatDate(mejor.getDateCreated(), zonaHoraria_(), 'yyyy-MM-dd HH:mm'),
          datos: Utilities.base64Encode(bytes)};
}


/* ==========================================================================
   13_Banco.gs
   ========================================================================== */

/**
 * 13_Banco.gs — Movimientos del banco.
 *
 * Se importa el extracto que baja el banco (CaixaBank y compañía) y el
 * CRM lo clasifica solo. Sirve para dos cosas: ver de verdad qué entra y
 * qué sale cada mes, y casar los cobros de los clientes con el dinero
 * que ha llegado a la cuenta.
 */

/* Palabras que aparecen en los conceptos del banco y qué significan. */
const REGLAS_BANCO = [
  /* Primero los movimientos entre cuentas propias: el dinero no sale de la
     empresa, solo cambia de sitio, y si cuenta como gasto la estructura y los
     impuestos salen inflados. */
  {categoria: 'traspaso',         claves: ['traspaso para imp', 'traspaso entre cuentas',
                                           'traspaso a impuestos',
                                           'zero wattios', 'zero watios']},
  {categoria: 'nominas',          claves: ['nomina', 'nóminas', 'nominas']},
  {categoria: 'seguridad_social', claves: ['tgss', 'cotizacion', 'seg social', 'seguridad social']},
  {categoria: 'impuestos',        claves: ['aeat', 'hacienda', 'tributaria', 'iva ', 'irpf', 'modelo 3',
                                           'impuesto', 'tributos', 'ayto', 'ayuntamiento']},
  {categoria: 'telefonia',        claves: ['digi', 'movistar', 'vodafone', 'orange', 'jazztel', 'telefonica',
                                           'yoigo', 'pepephone', 'telec']},
  {categoria: 'ropa_epi',         claves: ['uniforme', 'ropa corpora', 'ropa de tra', 'bordados', 'decathlon',
                                           'workwear', 'epi']},
  {categoria: 'montaje',          claves: ['greenfield', 'montaje', 'instalacion subcontrat']},
  {categoria: 'proveedor',        claves: ['pago factura', 'pago oferta', 'facturas abonadas', 'proveedor',
                                           'pago presupuesto', 'pago proforma', 'pago fianza', 'pago 40',
                                           'pago 50', 'pago 60', 'pago 25', 'pago 75', 'domusat', 'obramat',
                                           'leroy', 'bricomart', 'saltoki', 'escoda', 'suministros',
                                           'sun', 'solar', 'hanersun', 'solax', 'almacen']},
  {categoria: 'servicios',        claves: ['jibble', 'google', 'microsoft', 'adobe', 'zoom', 'openai',
                                           'anthropic', 'canva', 'dominio', 'hosting', 'www.', 'suscripcion']},
  {categoria: 'seguros',          claves: ['seguro', 'mapfre', 'allianz', 'axa', 'generali', 'legalitas',
                                           'asist.', 'mutua']},
  {categoria: 'banco',            claves: ['comision', 'mantenimiento cuenta', 'intereses', 'v.negocios',
                                           'cuota t.', 'tarjeta cuota', 'p.serv', 'trf. ajena']},
  {categoria: 'financiacion',     claves: ['prestamo', 'leasing', 'renting', 'cuota prestamo', 'amortizacion']},
  {categoria: 'transporte',       claves: ['repsol', 'cepsa', 'galp', 'shell', 'bp ', 'gasolinera', 'peaje',
                                           'parking', 'autopista', 'renfe', 'iberia', 'combustible']},
  {categoria: 'dietas',           claves: ['restaurante', 'cafeteria', 'bar ', 'hotel', 'menu', 'obm ']}
];

function categoriaBanco_(concepto, importe) {
  const c = normal_(concepto);
  for (let i = 0; i < REGLAS_BANCO.length; i++) {
    const r = REGLAS_BANCO[i];
    for (let j = 0; j < r.claves.length; j++) {
      if (c.indexOf(r.claves[j]) >= 0) return r.categoria;
    }
  }
  if (num_(importe) > 0) {
    return /(transferencia|transf|traspaso|ingreso|abono|su favor)/.test(c)
      ? 'cobro_cliente' : 'otros_ingresos';
  }
  return 'otros_gastos';
}

/* Coste fijo de tener la empresa abierta: lo que se paga haya o no obra.
   El material y el montaje NO entran aquí, porque son coste de la
   instalación, ni tampoco lo que todavía está sin clasificar. */
const CATEGORIAS_ESTRUCTURA = ['nominas', 'seguridad_social', 'servicios', 'seguros',
                               'banco', 'financiacion', 'transporte', 'dietas', 'telefonia',
                               'ropa_epi'];
/* Los impuestos salen aparte: el IVA no es un coste, es dinero que pasa por
   la cuenta, y meterlo en el coste fijo desvirtúa el punto de equilibrio. */
const CATEGORIAS_IMPUESTOS = ['impuestos'];

/* Cuando el extracto no dice de qué cuenta viene, se supone la principal. */
const CUENTA_POR_DEFECTO = 'CaixaBank';

/** Importa movimientos ya troceados por el navegador. */
function accImportarBanco_(u, p) {
  exigir_(u, 'finanzas');
  const filas = p.movimientos || [];
  if (!filas.length) return {ok: false, error: 'No ha llegado ningún movimiento.'};
  const cuenta = txt_(p.cuenta) || CUENTA_POR_DEFECTO;
  const pref = normal_(cuenta) === normal_(CUENTA_POR_DEFECTO) ? '' : normal_(cuenta) + '|';

  /* El saldo entra en la clave: dos apuntes iguales el mismo día son dos
     movimientos distintos y el saldo suele separarlos. Pero un cargo, su
     devolución y el mismo cargo otra vez dejan el saldo igual las dos veces,
     y los dos son de verdad. Por eso se cuentan las repeticiones: se compara
     cuántas veces aparece cada apunte en el extracto contra cuántas hay ya
     guardadas, y solo entra lo que sobra. Reimportar el mismo archivo sigue
     sin duplicar nada. */
  const guardadas = {};
  leer_('BANCO').forEach(function (m) {
    const base = txt_(m.clave).replace(/#\d+$/, '');
    guardadas[base] = (guardadas[base] || 0) + 1;
  });

  const nuevos = [];
  const entrantes = {};
  let repetidos = 0;
  filas.forEach(function (f) {
    const fecha = txt_(f.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    const importe = num_(f.importe);
    const concepto = txt_(f.concepto);
    /* La cuenta principal no lleva prefijo, para que las claves guardadas
       antes de que existieran varias cuentas sigan valiendo y reimportar su
       extracto no duplique nada. */
    const base = pref + fecha + '|' + normal_(concepto) + '|' +
                 redondear_(importe, 2) + '|' + redondear_(num_(f.saldo), 2);
    const vez = (entrantes[base] || 0) + 1;
    entrantes[base] = vez;
    if (vez <= (guardadas[base] || 0)) { repetidos++; return; }
    const clave = vez > 1 ? base + '#' + vez : base;
    nuevos.push({
      cuenta: cuenta,
      fecha: fecha, concepto: concepto, importe: redondear_(importe, 2),
      saldo: redondear_(num_(f.saldo), 2),
      tipo: importe >= 0 ? 'ingreso' : 'gasto',
      categoria: categoriaBanco_(concepto, importe), manual: 'no',
      operacion_id: '', cobro_id: '', gasto_id: '', conciliado: 'no',
      notas: '', clave: clave, creado: ahora_()
    });
  });

  if (nuevos.length) insertarLote_('BANCO', nuevos);
  registrar_(u, 'importar_banco', 'BANCO', '', cuenta + ': ' + nuevos.length + ' nuevos, ' +
             repetidos + ' repetidos');
  return {ok: true, cuenta: cuenta, nuevos: nuevos.length, repetidos: repetidos,
          total: leer_('BANCO').length};
}

/** Los movimientos y las cuentas que salen de ellos. */
function accBanco_(u, p) {
  exigir_(u, 'finanzas');
  const todos = leer_('BANCO').sort(function (a, b) {
    return txt_(b.fecha).localeCompare(txt_(a.fecha)); });
  const desde = txt_(p.desde) || '';
  const hasta = txt_(p.hasta) || '';
  const lista = todos.filter(function (m) {
    return (!desde || txt_(m.fecha) >= desde) && (!hasta || txt_(m.fecha) <= hasta);
  });

  const porMes = {};
  const porCategoria = {};
  lista.forEach(function (m) {
    const mes = mesDe_(txt_(m.fecha));
    if (!porMes[mes]) porMes[mes] = {mes: mes, ingresos: 0, gastos: 0, estructura: 0,
                                     impuestos: 0, neto: 0};
    const imp = num_(m.importe);
    if (imp >= 0) porMes[mes].ingresos = redondear_(porMes[mes].ingresos + imp, 2);
    else {
      porMes[mes].gastos = redondear_(porMes[mes].gastos - imp, 2);
      if (CATEGORIAS_ESTRUCTURA.indexOf(txt_(m.categoria)) >= 0) {
        porMes[mes].estructura = redondear_(porMes[mes].estructura - imp, 2);
      }
      if (CATEGORIAS_IMPUESTOS.indexOf(txt_(m.categoria)) >= 0) {
        porMes[mes].impuestos = redondear_(porMes[mes].impuestos - imp, 2);
      }
    }
    porMes[mes].neto = redondear_(porMes[mes].ingresos - porMes[mes].gastos, 2);

    const k = txt_(m.categoria) || 'otros_gastos';
    if (!porCategoria[k]) porCategoria[k] = {categoria: k, importe: 0, movimientos: 0};
    porCategoria[k].importe = redondear_(porCategoria[k].importe + Math.abs(imp), 2);
    porCategoria[k].movimientos += 1;
  });

  const meses = Object.keys(porMes).sort().map(function (k) { return porMes[k]; });
  /* Los meses cerrados dicen cuánto cuesta de verdad tener la empresa abierta. */
  const cerrados = meses.filter(function (m) { return m.mes < mesDe_(hoyISO_()); }).slice(-6);
  const estructuraReal = cerrados.length
    ? redondear_(cerrados.reduce(function (a, m) { return a + m.estructura; }, 0) / cerrados.length, 2)
    : 0;

  /* El saldo es el del último apunte de CADA cuenta; sumar el último de todos
     daría el de una sola y la tesorería saldría corta. */
  const porCuenta = {};
  todos.forEach(function (m) {
    const c = txt_(m.cuenta) || CUENTA_POR_DEFECTO;
    if (!porCuenta[c]) porCuenta[c] = {cuenta: c, saldo: num_(m.saldo), fecha: txt_(m.fecha),
                                       movimientos: 0};
    porCuenta[c].movimientos += 1;
  });
  const cuentas = Object.keys(porCuenta).map(function (k) { return porCuenta[k]; })
    .sort(function (a, b) { return b.saldo - a.saldo; });
  const saldoTotal = cuentas.reduce(function (a, c) { return a + c.saldo; }, 0);

  const ultimo = todos[0] || {};
  const sinConciliar = lista.filter(function (m) {
    return num_(m.importe) > 0 && normal_(m.conciliado) !== 'si'; });

  return {ok: true,
    movimientos: lista,
    meses: meses,
    categorias: Object.keys(porCategoria).map(function (k) { return porCategoria[k]; })
      .sort(function (a, b) { return b.importe - a.importe; }),
    cuentas: cuentas,
    saldo: redondear_(saldoTotal, 2), fecha_saldo: txt_(ultimo.fecha),
    estructura_real: estructuraReal,
    estructura_config: configNum_('coste_estructura_mes', 0),
    ingresos_sin_casar: sinConciliar.length,
    total: todos.length};
}

/** Cambia la categoría de un movimiento o lo casa con un cobro. */
function accGuardarMovimiento_(u, p) {
  exigir_(u, 'finanzas');
  const d = p.movimiento || {};
  const cambios = {};
  ['categoria', 'notas', 'operacion_id', 'conciliado'].forEach(function (c) {
    if (d[c] !== undefined) cambios[c] = d[c];
  });
  /* Si alguien cambia la categoría a mano, mandan sus manos. */
  if (d.categoria !== undefined) cambios.manual = 'si';

  /* Casar con un cobro deja el cobro marcado con la fecha del banco. */
  if (txt_(d.cobro_id)) {
    const m = leer_('BANCO').filter(function (x) { return String(x.id) === String(d.id); })[0];
    const cobro = leer_('COBROS').filter(function (c) { return String(c.id) === String(d.cobro_id); })[0];
    if (m && cobro) {
      actualizar_('COBROS', cobro.id, {fecha_cobro: txt_(m.fecha), estado: 'cobrado',
        notas: txt_(cobro.notas) + ' · casado con el banco'});
      cambios.cobro_id = cobro.id;
      cambios.operacion_id = cobro.operacion_id;
      cambios.conciliado = 'si';
      cambios.categoria = 'cobro_cliente';
    }
  }

  const r = actualizar_('BANCO', d.id, cambios);
  registrar_(u, 'editar_movimiento', 'BANCO', d.id, txt_(cambios.categoria));
  return {ok: true, movimiento: r};
}

/** Crea el gasto de la instalación a partir de un movimiento del banco. */
function accGastoDesdeBanco_(u, p) {
  exigir_(u, 'finanzas');
  const m = leer_('BANCO').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!m) return {ok: false, error: 'Ese movimiento ya no está.'};
  if (num_(m.importe) >= 0) return {ok: false, error: 'Ese movimiento es un ingreso, no un gasto.'};

  const gasto = insertar_('GASTOS', {
    operacion_id: txt_(p.operacion_id), categoria: txt_(p.categoria) || 'otro',
    proveedor: txt_(p.proveedor) || txt_(m.concepto),
    concepto: txt_(p.concepto) || txt_(m.concepto),
    importe: Math.abs(num_(m.importe)), iva_pct: num_(p.iva_pct) || 21,
    fecha: txt_(m.fecha), estado_pago: 'pagado', fecha_pago: txt_(m.fecha),
    factura_proveedor: '', creado: ahora_(), creado_por: u.id,
    notas: 'Creado desde el movimiento bancario ' + m.id
  });
  actualizar_('BANCO', m.id, {gasto_id: gasto.id, conciliado: 'si',
    operacion_id: txt_(p.operacion_id)});
  registrar_(u, 'gasto_desde_banco', 'GASTOS', gasto.id, m.concepto);
  return {ok: true, gasto: gasto};
}

/**
 * Vuelve a pasar las reglas por los movimientos que nadie ha tocado a mano.
 * Sirve cuando se afinan las reglas y ya hay extractos importados.
 */
function accReclasificarBanco_(u, p) {
  exigir_(u, 'finanzas');
  let cambiados = 0;
  leer_('BANCO').forEach(function (m) {
    if (normal_(m.manual) === 'si') return;
    const nueva = categoriaBanco_(txt_(m.concepto), num_(m.importe));
    if (nueva !== txt_(m.categoria)) { actualizar_('BANCO', m.id, {categoria: nueva}); cambiados++; }
  });
  registrar_(u, 'reclasificar_banco', 'BANCO', '', cambiados + ' movimientos');
  return {ok: true, cambiados: cambiados};
}

/** Pone como coste de estructura lo que dice el banco. */
function accAjustarEstructura_(u, p) {
  exigir_(u, 'config');
  const valor = redondear_(num_(p.valor), 2);
  accGuardarConfig_(u, {config: {coste_estructura_mes: valor}});
  return {ok: true, valor: valor};
}


/* ==========================================================================
   14_ResumenSemanal.gs
   ========================================================================== */

/**
 * 14_ResumenSemanal.gs — El correo de los viernes.
 *
 * Cada viernes por la tarde, cada persona recibe en su correo cómo le ha
 * ido la semana: lo que ha hecho, cómo va contra su objetivo, qué tiene
 * pendiente para la semana que viene y una frase para cerrar. Dirección
 * recibe además cómo va la casa.
 */

/* Frases para terminar. Rotan por semana, así que no se repite la misma
   dos viernes seguidos ni a todos les toca la misma. */
const FRASES = [
  'Las puertas que no se llaman son ventas que no existen.',
  'Una visita bien hecha vale más que diez propuestas enviadas a ciegas.',
  'El cliente no compra paneles: compra dejar de pagar de más.',
  'Lo que se apunta se sigue; lo que no, se pierde.',
  'La venta que se enfría casi siempre es la que nadie volvió a llamar.',
  'Mejor un no rápido que un quizá eterno.',
  'Cada instalación bien rematada trae la siguiente sin llamar a ninguna puerta.',
  'El mejor momento para llamar al que se lo está pensando fue ayer; el segundo mejor es el lunes.',
  'Se cierra explicando, no insistiendo.',
  'Quien enseña el ahorro con números no necesita bajar el precio.',
  'La constancia gana a la suerte, y encima repite.',
  'Un buen seguimiento es media venta hecha.',
  'El sol sale todos los días: el trabajo es estar delante de la casa correcta.',
  'No hace falta ser el más barato si eres el que mejor lo explica.',
  'Lo difícil no es que te digan que sí: es que te vuelvan a abrir la puerta.',
  'Cada ficha que subes es una oportunidad que antes no existía.',
  'La semana que viene empieza con lo que dejes preparado hoy.',
  'Un equipo que comparte lo que le funciona vende el doble.',
  'El que llama, cierra. El que espera, justifica.',
  'Hacer bien lo pequeño es lo que hace grande a una empresa.'
];

function fraseDeLaSemana_(semilla) {
  const s = Math.abs(Number(semilla) || 0);
  return FRASES[s % FRASES.length];
}

function numeroSemana_(fechaISO) {
  const d = fecha_(fechaISO) || new Date();
  const inicio = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - inicio) / 86400000 + inicio.getDay() + 1) / 7);
}

/* ---------- el correo ---------- */

const LOGO_CORREO = 'https://zerowattiosingenieria-bit.github.io/crm/assets/img/logo-h96.png';
const WEB_CRM = 'https://zerowattiosingenieria-bit.github.io/crm/';

function cajaHtml_(titulo, valor, pie) {
  return '<td style="padding:6px">' +
    '<div style="border:1px solid #e3e7e0;border-radius:10px;padding:12px 14px;background:#fff">' +
    '<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#5b6159;' +
    'font-weight:700">' + titulo + '</div>' +
    '<div style="font-size:23px;font-weight:750;color:#17191c;margin-top:4px">' + valor + '</div>' +
    (pie ? '<div style="font-size:12px;color:#8b918a;margin-top:2px">' + pie + '</div>' : '') +
    '</div></td>';
}

function listaHtml_(titulo, lineas) {
  if (!lineas.length) return '';
  return '<h3 style="font-size:15px;margin:22px 0 8px;color:#17191c">' + titulo + '</h3>' +
    '<ul style="margin:0;padding-left:18px;font-size:14px;color:#17191c;line-height:1.6">' +
    lineas.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>';
}

function correoHtml_(persona, cuerpo, frase) {
  return '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f3;padding:24px">' +
    '<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e3e7e0;' +
    'border-radius:14px;overflow:hidden">' +
      '<div style="background:#242422;padding:18px 22px">' +
        '<img src="' + LOGO_CORREO + '" alt="ZERO WATTIOS" style="height:26px">' +
        '<div style="color:#b4fa1e;font-size:11px;letter-spacing:.14em;text-transform:uppercase;' +
        'margin-top:6px">Resumen de la semana</div>' +
      '</div>' +
      '<div style="padding:22px">' +
        '<h2 style="margin:0 0 4px;font-size:19px;color:#17191c">' + txt_(persona.nombre) + '</h2>' +
        '<p style="margin:0 0 16px;color:#5b6159;font-size:13.5px">Así ha ido del lunes al viernes.</p>' +
        cuerpo +
        '<div style="margin-top:24px;padding:14px 16px;background:#b4fa1e;border-radius:10px;' +
        'color:#242422;font-size:14.5px;font-weight:600;font-style:italic">' + frase + '</div>' +
        '<p style="margin:20px 0 0;font-size:13px">' +
        '<a href="' + WEB_CRM + '" style="color:#17191c;font-weight:600">Abrir el CRM</a></p>' +
      '</div>' +
      '<div style="padding:14px 22px;border-top:1px solid #e3e7e0;color:#8b918a;font-size:11.5px">' +
      'ZERO WATTIOS INGENIERÍA, S.L. · Correo automático del CRM, no hace falta contestar.' +
      '</div>' +
    '</div></div>';
}

/* ---------- qué cuenta cada correo ---------- */

function cuerpoComercial_(r, lunes, viernes) {
  const objetivo = r.objetivo_mes ? Math.round(r.logrado_objetivo * 100 / r.objetivo_mes) : 0;
  const filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' +
      cajaHtml_('Ventas', milesTxt_(r.ventas), eurTxt_(r.importe_vendido || 0)) +
      cajaHtml_('Sentadas', milesTxt_(r.sentadas), 'esta semana') +
      cajaHtml_('Propuestas', milesTxt_(r.propuestas), pctTxt_(r.conversion_propuesta_venta) + ' cierran') +
    '</tr><tr>' +
      cajaHtml_('Objetivo del periodo', r.logrado_objetivo + ' / ' + r.objetivo_mes, objetivo + ' %') +
      cajaHtml_('Cartera viva', eurTxt_(r.cartera_importe || 0), r.cartera_abierta + ' propuestas') +
      cajaHtml_('Comisiones', eurTxt_(r.comisiones.total), 'devengadas') +
    '</tr></table>';

  const proximas = (r.proximas || []).filter(function (p) { return txt_(p.fecha) >= viernes; })
    .slice(0, 8).map(function (p) {
      return '<b>' + p.nombre + '</b> · ' + (txt_(p.accion) || 'seguimiento') +
             ' · ' + selloFecha_(p.fecha);
    });
  const vencidas = (r.proximas || []).filter(function (p) { return p.vencida; })
    .slice(0, 8).map(function (p) {
      return '<b>' + p.nombre + '</b> · ' + (txt_(p.accion) || 'seguimiento') +
             ' · vencía el ' + selloFecha_(p.fecha);
    });
  const frios = (r.frios || []).slice(0, 6).map(function (c) {
    return '<b>' + c.nombre + '</b> · ' + txt_(c.municipio) + ' · ' + c.dias + ' días sin contacto';
  });

  return filas +
    listaHtml_('Se te ha pasado la fecha en', vencidas) +
    listaHtml_('Lo que tienes por delante', proximas) +
    listaHtml_('Clientes que se enfrían', frios);
}

function cuerpoCaptador_(r, lunes, viernes) {
  const objetivo = r.objetivo_mes ? Math.round(r.logrado_objetivo * 100 / r.objetivo_mes) : 0;
  const filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' +
      cajaHtml_('Fichas', milesTxt_(r.fichas), 'esta semana') +
      cajaHtml_('Puertas', milesTxt_(r.puertas), 'según tus partes') +
      cajaHtml_('Citas confirmadas', milesTxt_(r.citas_confirmadas), '') +
    '</tr><tr>' +
      cajaHtml_('Llegan a sentada', pctTxt_(r.conversion_ficha_sentada), milesTxt_(r.captaciones_sentada) + ' sentadas') +
      cajaHtml_('Acaban en venta', pctTxt_(r.conversion_ficha_venta), milesTxt_(r.captaciones_venta) + ' ventas') +
      cajaHtml_('Objetivo del mes', r.logrado_objetivo + ' / ' + r.objetivo_mes, objetivo + ' %') +
    '</tr></table>';

  const sinAdjudicar = leer_('CAPTACIONES').filter(function (c) {
    return String(c.captador_id) === String(r.persona.id) && !txt_(c.comercial_id) &&
           normal_(c.resultado) === 'pendiente';
  }).slice(0, 8).map(function (c) {
    const cli = leer_('CLIENTES').filter(function (x) { return String(x.id) === String(c.cliente_id); })[0];
    return '<b>' + (cli ? cli.nombre : c.cliente_id) + '</b> · visita del ' + selloFecha_(c.fecha) +
           ' · <i>sin comercial adjudicado</i>';
  });

  const proximas = (r.proximas || []).slice(0, 8).map(function (p) {
    return '<b>' + p.nombre + '</b> · ' + (txt_(p.accion) || 'visita') + ' · ' + selloFecha_(p.fecha);
  });

  return filas +
    listaHtml_('Fichas pendientes de adjudicar a un comercial', sinAdjudicar) +
    listaHtml_('Citas por delante', proximas);
}

function cuerpoDireccion_(r, lunes, viernes) {
  const fin = accFinanzas_({id: r.persona.id, rol: 'admin'}, {desde: sumarDias_(viernes, -365), hasta: viernes});
  const equipo = leer_('USUARIOS').filter(function (u) {
    return normal_(u.activo) === 'si' && ['comercial', 'captador'].indexOf(u.rol) >= 0;
  }).map(function (u) { return resumenPersona_(u, lunes, viernes, true); });

  const ventasSemana = equipo.reduce(function (a, x) { return a + num_(x.ventas); }, 0);
  const importeSemana = equipo.reduce(function (a, x) { return a + num_(x.importe_vendido || 0); }, 0);
  const fichasSemana = equipo.reduce(function (a, x) { return a + num_(x.fichas); }, 0);

  const filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' +
      cajaHtml_('Ventas de la semana', milesTxt_(ventasSemana), eurTxt_(importeSemana)) +
      cajaHtml_('Fichas captadas', milesTxt_(fichasSemana), 'esta semana') +
      cajaHtml_('Margen del año', pctTxt_(fin.resumen.margen_pct), eurTxt_(fin.resumen.margen_bruto)) +
    '</tr><tr>' +
      cajaHtml_('Pendiente de cobro', eurTxt_(fin.resumen.pendiente_cobro),
        fin.resumen.vencido_cobro ? eurTxt_(fin.resumen.vencido_cobro) + ' vencido' : 'todo en fecha') +
      cajaHtml_('Beneficio neto', eurTxt_(fin.resumen.beneficio_neto), 'del año') +
      cajaHtml_('Cobros vencidos', milesTxt_(leer_('COBROS').filter(function (c) {
        return !txt_(c.fecha_cobro) && txt_(c.fecha_prevista) && txt_(c.fecha_prevista) < viernes;
      }).length), 'por reclamar') +
    '</tr></table>';

  const porPersona = equipo.map(function (x) {
    return '<b>' + x.persona.nombre + '</b> · ' +
      (x.persona.rol === 'captador'
        ? x.fichas + ' fichas, ' + x.captaciones_sentada + ' sentadas'
        : x.ventas + ' ventas (' + eurTxt_(x.importe_vendido || 0) + '), ' + x.sentadas + ' sentadas') +
      ' · objetivo ' + x.logrado_objetivo + '/' + x.objetivo_mes;
  });

  const consejos = (fin.consejos || []).slice(0, 3).map(function (c) {
    return '<b>' + c.titulo + '</b> · ' + c.accion;
  });

  const sinParte = leer_('USUARIOS').filter(function (u) {
    if (normal_(u.activo) !== 'si' || ['comercial', 'captador'].indexOf(u.rol) < 0) return false;
    return !leer_('PARTES').some(function (p) {
      return String(p.usuario_id) === String(u.id) && txt_(p.fecha) >= lunes && txt_(p.fecha) <= viernes;
    });
  }).map(function (u) { return '<b>' + u.nombre + '</b> no ha enviado ningún parte esta semana'; });

  return filas +
    listaHtml_('Cómo ha ido cada uno', porPersona) +
    listaHtml_('Sin partes esta semana', sinParte) +
    listaHtml_('Qué conviene mirar', consejos);
}

/* ---------- utilidades de formato para el correo ---------- */
function milesTxt_(n) { return String(Math.round(num_(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function eurTxt_(n) { return milesTxt_(n) + ' €'; }
function pctTxt_(n) { return String(redondear_(num_(n), 1)).replace('.', ',') + ' %'; }
function selloFecha_(iso) {
  const s = txt_(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const p = s.split('-');
  return p[2] + '/' + p[1];
}

/* ---------- el envío ---------- */

/**
 * Manda el resumen de la semana a cada persona. Lo llama el disparador de
 * los viernes; también se puede lanzar a mano desde el CRM o el editor.
 */
function resumenSemanal(soloA) {
  const cfg = config_();
  if (normal_(cfg.resumen_semanal) === 'no' && !soloA) {
    Logger.log('El resumen semanal está desactivado en Ajustes.');
    return {ok: true, enviados: 0, motivo: 'desactivado'};
  }

  const hoy = hoyISO_();
  const d = fecha_(hoy);
  const desdeLunes = (d.getDay() + 6) % 7;             // 0 = lunes
  const lunes = sumarDias_(hoy, -desdeLunes);
  const viernes = sumarDias_(lunes, 4);
  const semana = numeroSemana_(hoy);

  const gente = leer_('USUARIOS').filter(function (u) {
    if (normal_(u.activo) !== 'si' || !txt_(u.email)) return false;
    return soloA ? String(u.id) === String(soloA) || normal_(u.usuario) === normal_(soloA) : true;
  });

  let enviados = 0;
  const fallos = [];
  gente.forEach(function (u, i) {
    try {
      const r = resumenPersona_(u, lunes, viernes, true);
      const cuerpo = (u.rol === 'captador') ? cuerpoCaptador_(r, lunes, viernes)
                   : (['admin', 'superadmin'].indexOf(u.rol) >= 0
                        ? cuerpoDireccion_(r, lunes, viernes)
                        : cuerpoComercial_(r, lunes, viernes));
      const frase = fraseDeLaSemana_(semana + i);
      const html = correoHtml_(u, cuerpo, frase);
      const asunto = 'Tu semana en ZERO WATTIOS · ' + selloFecha_(lunes) + ' a ' + selloFecha_(viernes);

      /* Mientras «resumen_a» tenga un correo, todo va ahí y no a cada uno.
         Sirve para rodar el envío sin molestar al equipo; se vacía el campo
         en Ajustes y cada persona vuelve a recibir el suyo. */
      const unico = txt_(cfg.resumen_a);
      MailApp.sendEmail({to: unico || txt_(u.email),
        subject: asunto + (unico ? ' · ' + txt_(u.nombre) : ''),
        htmlBody: html, name: 'CRM ZERO WATTIOS'});
      enviados++;
    } catch (e) { fallos.push(txt_(u.usuario) + ': ' + String(e)); }
  });

  /* Copia para quien lleve el control, si se ha puesto en Ajustes. */
  if (txt_(cfg.copia_resumen) && !soloA && !txt_(cfg.resumen_a)) {
    try {
      MailApp.sendEmail({to: txt_(cfg.copia_resumen),
        subject: 'Resúmenes semanales enviados · semana ' + semana,
        htmlBody: '<p>Se han enviado ' + enviados + ' resúmenes' +
          (fallos.length ? '. No han salido: ' + fallos.join(', ') : '.') + '</p>',
        name: 'CRM ZERO WATTIOS'});
    } catch (e) { /* la copia no puede tumbar el envío */ }
  }

  registrar_(null, 'resumen_semanal', 'USUARIOS', '', enviados + ' enviados' +
    (fallos.length ? ', fallos: ' + fallos.join(' | ') : ''));
  Logger.log('Resúmenes enviados: ' + enviados + (fallos.length ? ' · fallos: ' + fallos.join(' | ') : ''));
  return {ok: true, enviados: enviados, fallos: fallos, lunes: lunes, viernes: viernes};
}

/** Lanza el resumen a mano desde el CRM (dirección). */
function accResumenSemanalAhora_(u, p) {
  exigir_(u, 'config');
  const r = resumenSemanal(txt_(p.usuario_id) || null);
  return {ok: true, resultado: r};
}

/** Me lo mando solo a mí para ver cómo queda. */
function accProbarResumen_(u, p) {
  if (!txt_(u.email)) return {ok: false, error: 'Tu usuario no tiene correo puesto.'};
  const r = resumenSemanal(u.id);
  return {ok: true, resultado: r};
}

/**
 * Pone al día los correos de los usuarios ya creados con los de
 * 00_Config.gs. Útil si el CRM ya estaba instalado.
 */
function actualizarCorreos() {
  let cambiados = 0;
  USUARIOS_INICIALES.forEach(function (ini) {
    const u = leer_('USUARIOS').filter(function (x) { return normal_(x.usuario) === normal_(ini.usuario); })[0];
    if (u && txt_(ini.email) && txt_(u.email) !== txt_(ini.email)) {
      actualizar_('USUARIOS', u.id, {email: ini.email});
      cambiados++;
    }
  });
  Logger.log('Correos actualizados: ' + cambiados);
  return cambiados;
}


/* ==========================================================================
   15_Importar.gs
   ========================================================================== */

/**
 * CRM · ZERO WATTIOS
 * 15_Importar.gs — Meter de golpe el histórico de la empresa.
 *
 * Sirve para arrancar el CRM con lo que ya pasó: los clientes de la carpeta
 * de Drive, las facturas emitidas, sus cobros, los gastos y las nóminas.
 * Se puede lanzar las veces que haga falta: cada cosa tiene una clave natural
 * (la referencia del cliente, la de la operación, el número de factura…) y lo
 * que ya está se actualiza en lugar de duplicarse.
 */

/** Los usuarios por su nombre de entrada, para resolver comercial y captador. */
function usuariosPorNombre_() {
  const m = {};
  leer_('USUARIOS').forEach(function (u) {
    m[normal_(u.usuario)] = u.id;
    m[normal_(u.nombre)] = u.id;
  });
  return m;
}

/** Busca un registro por el valor de una columna, ya normalizado. */
function porClave_(tabla, columna) {
  const m = {};
  leer_(tabla).forEach(function (r) {
    const k = normal_(r[columna]);
    if (k) m[k] = r;
  });
  return m;
}

/**
 * El paquete puede venir en la llamada o, si es grande, en un archivo JSON
 * dejado en el Drive de la empresa. Así no hay que empujar megas por HTTP.
 */
function paqueteDeDrive_(nombre) {
  const it = DriveApp.getFilesByName(nombre);
  if (!it.hasNext()) throw new Error('No encuentro el archivo ' + nombre + ' en el Drive.');
  const f = it.next();
  return JSON.parse(f.getBlob().getDataAsString('UTF-8'));
}

function accImportar_(u, p) {
  exigir_(u, 'editarTodo');
  if (txt_(p.archivo)) {
    const paquete = paqueteDeDrive_(txt_(p.archivo));
    ['clientes', 'operaciones', 'facturas', 'cobros', 'gastos', 'nominas'].forEach(function (k) {
      if (paquete[k]) p[k] = paquete[k];
    });
  }
  const gente = usuariosPorNombre_();
  const quien = function (nombre) { return gente[normal_(nombre)] || ''; };
  const cuenta = {clientes: 0, operaciones: 0, facturas: 0, cobros: 0, gastos: 0,
                  actualizados: 0};

  /* ---------- clientes, por referencia ---------- */
  const clientesPorRef = porClave_('CLIENTES', 'etiquetas');
  const clientesPorNombre = porClave_('CLIENTES', 'nombre');
  const refACliente = {};
  (p.clientes || []).forEach(function (c) {
    const ref = txt_(c.ref);
    const existente = clientesPorRef[normal_(ref)] || clientesPorNombre[normal_(c.nombre)];
    const datos = {
      nombre: txt_(c.nombre), telefono: txt_(c.telefono), email: txt_(c.email),
      direccion: txt_(c.direccion), municipio: txt_(c.municipio), cp: txt_(c.cp),
      comercial_id: quien(c.comercial), captador_id: quien(c.captador),
      interes: txt_(c.interes), origen: txt_(c.origen) || 'historico',
      estado: txt_(c.estado) || 'nuevo', fecha_estado: txt_(c.fecha_estado),
      etiquetas: ref, otros: txt_(c.notas),
      modificado: ahora_(), modificado_por: u.id
    };
    if (existente) {
      actualizar_('CLIENTES', existente.id, datos);
      refACliente[ref] = existente.id;
      cuenta.actualizados++;
    } else {
      datos.creado = txt_(c.creado) || ahora_();
      datos.creado_por = u.id;
      refACliente[ref] = insertar_('CLIENTES', datos).id;
      cuenta.clientes++;
    }
  });

  /* ---------- operaciones, por referencia ---------- */
  const opsPorRef = porClave_('OPERACIONES', 'referencia');
  /* Las obras que ya están cuentan desde el principio: así un paquete que
     solo traiga gastos puede colgarlos de su instalación. */
  const refAOperacion = {};
  leer_('OPERACIONES').forEach(function (o) {
    if (txt_(o.referencia)) refAOperacion[txt_(o.referencia)] = o.id;
  });
  (p.operaciones || []).forEach(function (o) {
    const ref = txt_(o.referencia);
    const cliente = refACliente[txt_(o.ref_cliente)] ||
                    (clientesPorNombre[normal_(o.cliente)] || {}).id || '';
    if (!cliente) return;
    const datos = {
      cliente_id: cliente, comercial_id: quien(o.comercial), captador_id: quien(o.captador),
      referencia: ref, tipo: txt_(o.tipo), estado: txt_(o.estado) || 'instalada',
      fecha_propuesta: txt_(o.fecha_propuesta), fecha_contrato: txt_(o.fecha_contrato),
      fecha_firma: txt_(o.fecha_firma), fecha_instalacion: txt_(o.fecha_instalacion),
      forma_pago: txt_(o.forma_pago), financiera: txt_(o.financiera),
      importe_fv: num_(o.importe_fv), importe_aero: num_(o.importe_aero),
      importe_bateria: num_(o.importe_bateria), importe_cargador: num_(o.importe_cargador),
      importe_extras: num_(o.importe_extras),
      iva_pct: o.iva_pct === undefined ? configNum_('iva_pct', 21) : num_(o.iva_pct),
      paneles_num: num_(o.paneles_num), panel_modelo: txt_(o.panel_modelo),
      inversor_modelo: txt_(o.inversor_modelo), inversor_kw: num_(o.inversor_kw),
      bateria_kwh: num_(o.bateria_kwh), bateria_modelo: txt_(o.bateria_modelo),
      cargador_modelo: txt_(o.cargador_modelo),
      aero_kw: num_(o.aero_kw), aero_modelo: txt_(o.aero_modelo),
      precio_ajustado: txt_(o.precio_ajustado) || 'no',
      observaciones: txt_(o.observaciones)
    };
    /* El total lo manda el histórico si viene; si no, se suma por partidas. */
    const base = num_(o.base) || (datos.importe_fv + datos.importe_aero +
      datos.importe_bateria + datos.importe_cargador + datos.importe_extras);
    datos.base = redondear_(base, 2);
    datos.total = num_(o.total) || redondear_(base * (1 + datos.iva_pct / 100), 2);

    const existente = opsPorRef[normal_(ref)];
    if (existente) {
      actualizar_('OPERACIONES', existente.id, datos);
      refAOperacion[ref] = existente.id;
      cuenta.actualizados++;
    } else {
      datos.creado = txt_(o.creado) || txt_(o.fecha_firma) || ahora_();
      datos.creado_por = u.id;
      refAOperacion[ref] = insertar_('OPERACIONES', datos).id;
      cuenta.operaciones++;
    }
    sincronizarEstadoCliente_(cliente);
  });

  /* ---------- facturas, por número ---------- */
  const factPorNumero = porClave_('FACTURAS', 'numero');
  (p.facturas || []).forEach(function (f) {
    const opId = refAOperacion[txt_(f.ref_operacion)] || '';
    const cliId = refACliente[txt_(f.ref_cliente)] ||
      (opId ? txt_((leer_('OPERACIONES').filter(function (x) { return x.id === opId; })[0] || {}).cliente_id) : '');
    const datos = {
      numero: txt_(f.numero), operacion_id: opId, cliente_id: cliId,
      fecha_emision: txt_(f.fecha), concepto: txt_(f.concepto),
      base: num_(f.base), iva_pct: num_(f.iva_pct) || 21, iva: num_(f.iva),
      total: num_(f.total), estado: txt_(f.estado) || 'cobrada',
      fecha_vencimiento: txt_(f.fecha_vencimiento), fecha_cobro: txt_(f.fecha_cobro),
      emitida_por: u.id, notas: txt_(f.notas)
    };
    const existente = factPorNumero[normal_(f.numero)];
    if (existente) { actualizar_('FACTURAS', existente.id, datos); cuenta.actualizados++; }
    else { insertar_('FACTURAS', datos); cuenta.facturas++; }
  });

  /* ---------- cobros: la clave es la operación más el concepto ---------- */
  const cobrosPorClave = {};
  leer_('COBROS').forEach(function (c) {
    cobrosPorClave[txt_(c.operacion_id) + '|' + normal_(c.concepto) + '|' + redondear_(num_(c.importe), 2)] = c;
  });
  (p.cobros || []).forEach(function (c) {
    const opId = refAOperacion[txt_(c.ref_operacion)] || '';
    if (!opId) return;
    const clave = opId + '|' + normal_(c.concepto) + '|' + redondear_(num_(c.importe), 2);
    const datos = {
      operacion_id: opId, concepto: txt_(c.concepto), importe: redondear_(num_(c.importe), 2),
      fecha_prevista: txt_(c.fecha_prevista), fecha_cobro: txt_(c.fecha_cobro),
      estado: txt_(c.fecha_cobro) ? 'cobrado' : 'pendiente',
      metodo: txt_(c.metodo) || 'transferencia', notas: txt_(c.notas)
    };
    const existente = cobrosPorClave[clave];
    if (existente) { actualizar_('COBROS', existente.id, datos); cuenta.actualizados++; }
    else { datos.creado = ahora_(); datos.creado_por = u.id; insertar_('COBROS', datos); cuenta.cobros++; }
  });

  /* ---------- gastos: proveedor, fecha e importe ---------- */
  const gastosPorClave = {};
  leer_('GASTOS').forEach(function (g) {
    gastosPorClave[normal_(g.proveedor) + '|' + txt_(g.fecha) + '|' +
                   redondear_(num_(g.importe), 2)] = g;
  });
  const claveGasto = function (prov, fecha, importe) {
    return normal_(prov) + '|' + txt_(fecha) + '|' + redondear_(num_(importe), 2);
  };
  (p.gastos || []).forEach(function (g) {
    /* «anterior» señala un gasto que ya está, para corregirlo en su sitio:
       así el apunte del banco pasa a ser la factura de la obra, con su
       importe sin IVA y la instalación a la que pertenece, sin duplicarse. */
    const propia = claveGasto(g.proveedor, g.fecha, g.importe);
    const ant = g.anterior;
    const antigua = ant ? claveGasto(ant.proveedor, ant.fecha, ant.importe) : '';
    /* Si ya se corrigió en una pasada anterior, la clave vieja ya no está y
       vale la nueva; por eso se busca primero una y luego la otra. */
    const clave = (antigua && gastosPorClave[antigua]) ? antigua : propia;
    const datos = {
      operacion_id: refAOperacion[txt_(g.ref_operacion)] || '',
      categoria: txt_(g.categoria) || 'otros', proveedor: txt_(g.proveedor),
      concepto: txt_(g.concepto), importe: redondear_(num_(g.importe), 2),
      iva_pct: num_(g.iva_pct) || 21, fecha: txt_(g.fecha),
      estado_pago: txt_(g.estado_pago) || 'pagado', fecha_pago: txt_(g.fecha_pago) || txt_(g.fecha),
      factura_proveedor: txt_(g.factura_proveedor), notas: txt_(g.notas)
    };
    const existente = gastosPorClave[clave];
    if (existente) {
      actualizar_('GASTOS', existente.id, datos);
      delete gastosPorClave[clave];
      gastosPorClave[propia] = existente;
      cuenta.actualizados++;
    } else {
      datos.creado = ahora_(); datos.creado_por = u.id;
      insertar_('GASTOS', datos);
      gastosPorClave[propia] = datos;
      cuenta.gastos++;
    }
  });

  /* ---------- nóminas: una por persona y mes ---------- */
  const nomPorClave = {};
  leer_('NOMINAS').forEach(function (n) {
    nomPorClave[txt_(n.usuario_id) + '|' + txt_(n.periodo)] = n;
  });
  cuenta.nominas = 0;
  (p.nominas || []).forEach(function (n) {
    const uid = quien(n.usuario);
    if (!uid) return;
    const bruto = num_(n.bruto), dietas = num_(n.dietas), comisiones = num_(n.comisiones);
    const brutoTotal = num_(n.bruto_total) || redondear_(bruto + dietas + comisiones, 2);
    const irpf = num_(n.irpf), ss = num_(n.ss);
    const datos = {
      usuario_id: uid, periodo: txt_(n.periodo),
      bruto: bruto, dietas: dietas, comisiones: comisiones, otros: num_(n.otros),
      bruto_total: brutoTotal,
      irpf_pct: num_(n.irpf_pct) || pct_(irpf, brutoTotal), irpf: irpf,
      ss_pct: num_(n.ss_pct) || pct_(ss, brutoTotal), ss: ss,
      neto: num_(n.neto) || redondear_(brutoTotal - irpf - ss, 2),
      estado: txt_(n.estado) || 'pagada', fecha_pago: txt_(n.fecha_pago),
      detalle: txt_(n.detalle), notas: txt_(n.notas)
    };
    const clave = uid + '|' + datos.periodo;
    const existente = nomPorClave[clave];
    if (existente) { actualizar_('NOMINAS', existente.id, datos); cuenta.actualizados++; }
    else { datos.creado = ahora_(); insertar_('NOMINAS', datos); cuenta.nominas++; }
  });

  registrar_(u, 'importar_historico', 'CRM', '', JSON.stringify(cuenta));
  return {ok: true, resumen: cuenta};
}
