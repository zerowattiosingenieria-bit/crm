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
