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
        comision_fv: num_(cfg.comision_fv || 400),
        comision_aero: num_(cfg.comision_aero || 400),
        comision_fv_ajustada: num_(cfg.comision_fv_ajustada || 200),
        comision_aero_ajustada: num_(cfg.comision_aero_ajustada || 200),
        objetivo_mes: u.rol === 'captador' ? num_(cfg.objetivo_captador || 60) : num_(cfg.objetivo_comercial || 6),
        jornada_horas: 7.5, fecha_alta: hoyISO_(), color: '', notas: ''
      });
      claves.push([u.nombre, u.usuario, u.rol, clave]);
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
