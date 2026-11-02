<?php
/**
 * instalar.php (= 02_Instalar.gs) — Puesta en marcha y mantenimiento del esquema.
 *
 * Se ejecuta UNA vez (tools/instalar_local.php o desde la consola): crea las
 * tablas en MySQL, la configuración de la casa y los usuarios iniciales con
 * sus claves. Las claves se devuelven como resultado y quedan en el registro
 * de errores de PHP (error_log).
 *
 * Se puede volver a ejecutar las veces que haga falta: añade lo que falte y
 * respeta lo que ya está.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/esquema.php';

/**
 * @param string $googleUrl   URL del Apps Script que queda como servicio (Drive y correo). Opcional.
 * @param string $googleLlave Llave secreta de ese servicio. Opcional.
 * @return array ['claves' => [[nombre, usuario, rol, clave], ...], 'esquema' => [...], 'instalado' => marca]
 */
function instalar(string $googleUrl = '', string $googleLlave = ''): array {
  return conCandado_(function () use ($googleUrl, $googleLlave) {
    /* Tablas y columnas: crea lo que falte, respeta lo que ya está. */
    $esquema = instalarEsquema_();
    olvidarTodo_();
    if (!prop_('INSTALADO')) setProp_('INSTALADO', ahora_());
    if ($googleUrl !== '') setProp_('GOOGLE_URL', $googleUrl);
    if ($googleLlave !== '') setProp_('GOOGLE_LLAVE', $googleLlave);

    /* Configuración de la casa. */
    $yaConfig = [];
    foreach (leer_('CONFIG') as $r) $yaConfig[(string)$r['clave']] = true;
    $nuevas = array_values(array_filter(CONFIG_INICIAL, fn($f) => empty($yaConfig[$f[0]])));
    if ($nuevas) {
      insertarLote_('CONFIG', array_map(fn($f) => ['clave' => $f[0], 'valor' => $f[1], 'descripcion' => $f[2]], $nuevas));
      olvidarConfig_();
    }

    /* Usuarios y claves. */
    $existentes = [];
    foreach (leer_('USUARIOS') as $x) $existentes[normal_($x['usuario'])] = true;
    $claves = [];
    $cfg = config_();
    foreach (USUARIOS_INICIALES as $u) {
      if (!empty($existentes[normal_($u['usuario'])])) continue;
      $clave = claveAleatoria_(LARGO_CLAVE);
      $salt = sal_();
      $esCaptador = $u['rol'] === 'captador';
      insertar_('USUARIOS', [
        'nombre' => $u['nombre'], 'usuario' => $u['usuario'], 'email' => $u['email'], 'telefono' => '',
        'rol' => $u['rol'], 'activo' => 'si', 'hash' => hash_($clave, $salt, VUELTAS_CLAVE), 'salt' => $salt,
        'vueltas' => VUELTAS_CLAVE, 'intentos' => 0, 'bloqueado_hasta' => '', 'bloqueos' => 0,
        'creado' => ahora_(), 'ultimo_acceso' => '', 'debe_cambiar_clave' => 'si',
        'salario_bruto' => $u['rol'] === 'comercial' ? 1500 : ($esCaptador ? 1300 : 2000),
        'dietas_mes' => 150, 'irpf_pct' => 15, 'ss_pct' => 6.35,
        /* Un captador no cierra ventas: su comisión de venta va a cero y
           cobra por captar, como todo el mundo. */
        'comision_fv' => $esCaptador ? 0 : num_(($u['venta'] ?? 0) ?: (txt_($cfg['comision_fv'] ?? '') ?: 400)),
        'comision_aero' => $esCaptador ? 0 : num_(($u['venta'] ?? 0) ?: (txt_($cfg['comision_aero'] ?? '') ?: 400)),
        'comision_fv_ajustada' => $esCaptador ? 0 : num_(txt_($cfg['comision_fv_ajustada'] ?? '') ?: 200),
        'comision_aero_ajustada' => $esCaptador ? 0 : num_(txt_($cfg['comision_aero_ajustada'] ?? '') ?: 200),
        'comision_captacion_fv' => num_(txt_($cfg['comision_captacion_fv'] ?? '') ?: 400),
        'comision_captacion_aero' => num_(txt_($cfg['comision_captacion_aero'] ?? '') ?: 400),
        'comision_equipo_fv' => num_($u['equipo'] ?? 0),
        'comision_equipo_aero' => num_($u['equipo'] ?? 0),
        'responsable_id' => '',
        'objetivo_mes' => $esCaptador ? num_(txt_($cfg['objetivo_captador'] ?? '') ?: 60) : num_(txt_($cfg['objetivo_comercial'] ?? '') ?: 6),
        'jornada_horas' => 7.5, 'fecha_alta' => hoyISO_(), 'color' => '',
        'notas' => !empty($u['nivel']) ? 'Comercial ' . $u['nivel'] : ''
      ]);
      $claves[] = [$u['nombre'], $u['usuario'], $u['rol'], $clave];
    }

    /* Los responsables se enlazan al final, cuando ya existen todos. */
    $porUsuario = [];
    foreach (leer_('USUARIOS') as $x) $porUsuario[normal_($x['usuario'])] = $x;
    foreach (USUARIOS_INICIALES as $u) {
      if (empty($u['responsable'])) continue;
      $yo = $porUsuario[normal_($u['usuario'])] ?? null; $jefe = $porUsuario[normal_($u['responsable'])] ?? null;
      if ($yo && $jefe && txt_($yo['responsable_id']) === '') {
        actualizar_('USUARIOS', $yo['id'], ['responsable_id' => $jefe['id']]);
      }
    }

    if ($claves) {
      /* NOTA PORT: en la hoja iban a la pestaña CLAVES_INICIALES; aquí se devuelven y se apuntan en el log. */
      error_log('CLAVES INICIALES' . "\n" . implode("\n", array_map(
        fn($c) => $c[0] . ' (' . $c[1] . ', ' . $c[2] . '): ' . $c[3], $claves)));
    }

    error_log('Instalación correcta. Base de datos MySQL lista (' . count($esquema) . ' cambio(s) de esquema).');
    return ['claves' => $claves, 'esquema' => $esquema, 'instalado' => prop_('INSTALADO')];
  });
}

/** Vuelve a generar la clave de un usuario. Devuelve la nueva (y la apunta en el registro). */
function regenerarClave(string $usuario): string {
  $u = buscar1_('USUARIOS', fn($x) => normal_($x['usuario']) === normal_($usuario));
  if (!$u) { error_log('No existe el usuario ' . $usuario); return ''; }
  $clave = claveAleatoria_(LARGO_CLAVE);
  $salt = sal_();
  actualizar_('USUARIOS', $u['id'], ['hash' => hash_($clave, $salt, VUELTAS_CLAVE), 'salt' => $salt,
    'vueltas' => VUELTAS_CLAVE, 'debe_cambiar_clave' => 'si', 'intentos' => 0, 'bloqueado_hasta' => '', 'bloqueos' => 0]);
  cerrarSesionesDe_($u['id'], '');
  error_log('Nueva clave de ' . $u['usuario'] . ': ' . $clave);
  return $clave;
}

/** Dirección de la hoja de cálculo, por comodidad. */
function abrirBase(): string {
  // NOTA PORT: ya no hay hoja de cálculo; los datos viven en MySQL.
  $c = $GLOBALS['ZW_DB_CFG'] ?? null;
  $donde = is_array($c) ? ('MySQL · ' . ($c['dsn'] ?? '')) : 'MySQL';
  error_log($donde);
  return $donde;
}

/**
 * Datos de ejemplo para probar el CRM antes de meter clientes reales.
 * Ejecutar solo en pruebas: crea clientes, operaciones, cobros y gastos
 * ficticios. borrarDemo() los quita todos.
 */
function cargarDemo(): int {
  $us = indexar_(leer_('USUARIOS'), 'usuario');
  $nando = (buscar1_('USUARIOS', fn($u) => $u['usuario'] === 'nando') ?? [])['id'] ?? '';
  $rober = (buscar1_('USUARIOS', fn($u) => $u['usuario'] === 'rober') ?? [])['id'] ?? '';
  $sandra = (buscar1_('USUARIOS', fn($u) => $u['usuario'] === 'sandra') ?? [])['id'] ?? '';
  $abraham = (buscar1_('USUARIOS', fn($u) => $u['usuario'] === 'abraham') ?? [])['id'] ?? '';

  $municipios = [
    ['Tres Cantos', 40.6006, -3.7106], ['Galapagar', 40.5761, -4.0000],
    ['Alcorcón', 40.3459, -3.8248], ['Pinto', 40.2419, -3.6997],
    ['Las Rozas', 40.4923, -3.8740], ['Colmenar Viejo', 40.6588, -3.7658],
    ['Villamanrique de Tajo', 40.0894, -3.2372], ['Boadilla del Monte', 40.4058, -3.8776]
  ];
  $nombres = ['Adrián Ruiz','Marta Sanz','Javier Nieto','Lucía Pardo','Óscar Ibáñez',
    'Elena Vidal','Rafael Cano','Nuria Gil','Tomás Bravo','Sara Moreno',
    'Pedro Alonso','Ana Lara','Víctor Rey','Carmen Soto','Luis Ferrer','Pilar Duque'];

  $hoy = ahoraDT_();
  $creados = [];
  foreach ($nombres as $i => $n) {
    $m = $municipios[$i % count($municipios)];
    $dias = 120 - $i * 7;
    $f = (clone $hoy)->modify(($dias >= 0 ? '-' : '+') . abs($dias) . ' days');
    $fISO = formatearFecha_($f, 'yyyy-MM-dd');
    $comercial = $i % 2 ? $rober : $nando;
    $captador = $i % 3 === 0 ? $sandra : ($i % 3 === 1 ? $abraham : '');
    $estados = ['ganado','ganado','propuesta','sentada','negociando','perdido','cita','ganado'];
    $estado = $estados[$i % count($estados)];
    $c = insertar_('CLIENTES', [
      'creado' => $fISO, 'creado_por' => txt_($captador) !== '' ? $captador : $comercial,
      'comercial_id' => $comercial, 'captador_id' => $captador,
      'nombre' => $n, 'dni' => '', 'cotitular' => '', 'telefono' => '6' . substr((string)(10000000 + $i * 137), 0, 8),
      'email' => str_replace(' ', '.', normal_($n)) . '@ejemplo.com',
      'direccion' => 'Calle Ejemplo ' . ($i + 3), 'municipio' => $m[0], 'cp' => '28' . (100 + $i),
      'coordenadas' => redondear_($m[1] + ($i % 5) * 0.004, 6) . ',' . redondear_($m[2] + ($i % 4) * 0.005, 6),
      'tipo_vivienda' => 'Chalet', 'regimen' => 'Propietario', 'm2' => 140 + $i * 8, 'personas' => 3 + ($i % 3),
      'anyo' => '1980-2007', 'calefaccion' => $i % 2 ? 'Gasóleo' : 'Gas natural',
      'gasto_combustible' => 1400 + $i * 90, 'periodo_combustible' => 'al año',
      'gasto_luz_mes' => 80 + $i * 6, 'comercializadora' => 'Iberdrola', 'cups' => '',
      'potencia_contratada' => 5.75, 'ya_fv' => 'No', 'interes' => 5 + ($i % 6),
      'perfil' => 'Cliente de ejemplo para pruebas.', 'otros' => '', 'origen' => txt_($captador) !== '' ? 'captacion' : 'referido',
      'estado' => $estado, 'fecha_estado' => $fISO, 'proxima_accion' => $estado === 'propuesta' ? 'Llamar para cerrar' : '',
      'proxima_fecha' => $estado === 'propuesta' ? hoyISO_() : '',
      'etiquetas' => '', 'modificado' => $fISO, 'modificado_por' => $comercial
    ]);
    $creados[] = ['c' => $c, 'estado' => $estado, 'fISO' => $fISO, 'comercial' => $comercial, 'captador' => $captador, 'i' => $i];
  }

  foreach ($creados as $x) {
    if (!in_array($x['estado'], ['ganado','propuesta','negociando','perdido'], true)) continue;
    $i = $x['i'];
    $tipo = $i % 3 === 0 ? 'fv_aero' : ($i % 3 === 1 ? 'fv' : 'aero');
    $impFV = $tipo === 'aero' ? 0 : (9990 + ($i % 4) * 1000);
    $impAero = $tipo === 'fv' ? 0 : (15990 + ($i % 4) * 1000);
    $total = $impFV + $impAero;
    $base = redondear_($total / 1.21, 2);
    $estadoOp = $x['estado'] === 'ganado'
      ? ['instalada','legalizada','material','instalacion'][$i % 4]
      : ($x['estado'] === 'perdido' ? 'cancelada' : 'propuesta');
    $op = insertar_('OPERACIONES', [
      'cliente_id' => $x['c']['id'], 'comercial_id' => $x['comercial'], 'captador_id' => $x['captador'],
      'creado' => $x['fISO'], 'creado_por' => $x['comercial'], 'referencia' => 'ZW-' . substr($x['fISO'], 0, 4) . '-' . (100 + $i),
      'tipo' => $tipo, 'estado' => $estadoOp,
      'fecha_propuesta' => $x['fISO'], 'fecha_contrato' => $x['estado'] === 'ganado' ? sumarDias_($x['fISO'], 3) : '',
      'fecha_firma' => $x['estado'] === 'ganado' ? sumarDias_($x['fISO'], 5) : '',
      'fecha_prevista_instalacion' => $x['estado'] === 'ganado' ? sumarDias_($x['fISO'], 35) : '',
      'fecha_instalacion' => in_array($estadoOp, ['instalada','legalizada'], true) ? sumarDias_($x['fISO'], 40) : '',
      'fecha_legalizacion' => $estadoOp === 'legalizada' ? sumarDias_($x['fISO'], 70) : '',
      'forma_pago' => $i % 2 ? 'financiado' : 'contado', 'financiera' => $i % 2 ? 'Cetelem' : '',
      'plazo_meses' => $i % 2 ? 120 : '', 'cuota' => $i % 2 ? redondear_($total * 0.01234902, 2) : '',
      'reserva' => $i % 2 ? 0 : '',
      'importe_fv' => $impFV, 'importe_aero' => $impAero, 'importe_bateria' => $i % 4 === 0 ? 2570 : 0,
      'importe_cargador' => 0, 'importe_extras' => 0,
      'base' => $base, 'iva_pct' => 21, 'total' => $total,
      'ayudas_estimadas' => $tipo === 'fv' ? 3000 : 6000, 'cae_estimado' => $tipo === 'fv' ? 0 : 1200,
      'paneles_num' => $impFV ? 12 + ($i % 5) * 2 : 0, 'panel_modelo' => $impFV ? 'Hanersun 630W' : '',
      'panel_wp' => $impFV ? 630 : '', 'inversor_modelo' => $impFV ? 'SolaX X1 Hybrid' : '', 'inversor_kw' => $impFV ? 6 : '',
      'bateria_kwh' => $i % 4 === 0 ? 5.3 : 0, 'bateria_modelo' => $i % 4 === 0 ? 'SolaX T-BAT 5.3' : '',
      'cargador_modelo' => '', 'aero_kw' => $impAero ? [12, 16, 19, 22][$i % 4] : '',
      'aero_modelo' => $impAero ? 'Fusion' : '', 'deposito_acs' => $impAero ? 200 : '',
      'deposito_inercia' => $impAero ? 100 : '', 'suelo_radiante' => 'no', 'tejado' => 'teja',
      'beneficio_no_economico' => $x['estado'] === 'ganado' ? 'Cliente prescriptor en la urbanización' : '',
      'observaciones' => 'Operación de ejemplo.', 'motivo_perdida' => $x['estado'] === 'perdido' ? 'Precio' : '',
      'modificado' => hoyISO_(), 'modificado_por' => $x['comercial']
    ]);

    if ($x['estado'] === 'ganado') {
      $tramos = [['firma', 0.5, 5], ['material', 0.25, 30], ['final', 0.25, 45]];
      foreach ($tramos as $k => $t) {
        $prev = sumarDias_($x['fISO'], $t[2]);
        $cobrado = diasEntre_($prev, hoyISO_()) > 0 && ($i + $k) % 4 !== 0;
        insertar_('COBROS', [
          'operacion_id' => $op['id'], 'concepto' => $t[0], 'importe' => redondear_($total * $t[1], 2),
          'fecha_prevista' => $prev, 'fecha_cobro' => $cobrado ? sumarDias_($prev, ($i % 12)) : '',
          'estado' => $cobrado ? 'cobrado' : (diasEntre_($prev, hoyISO_()) > 0 ? 'vencido' : 'previsto'),
          'metodo' => 'transferencia', 'factura_id' => '', 'notas' => '', 'creado' => $x['fISO'], 'creado_por' => $x['comercial']
        ]);
      }
      $costeMat = redondear_($total * (0.42 + ($i % 5) * 0.01), 2);
      insertar_('GASTOS', ['operacion_id' => $op['id'], 'categoria' => $impFV ? 'material_fv' : 'material_aero',
        'proveedor' => 'Proveedor Demo', 'concepto' => 'Material de la instalación', 'importe' => $costeMat,
        'iva_pct' => 21, 'fecha' => sumarDias_($x['fISO'], 20), 'estado_pago' => 'pagado',
        'fecha_pago' => sumarDias_($x['fISO'], 50), 'factura_proveedor' => '', 'creado' => $x['fISO'],
        'creado_por' => 'demo', 'notas' => '']);
      insertar_('GASTOS', ['operacion_id' => $op['id'], 'categoria' => 'montaje', 'proveedor' => 'Greenfield Solar',
        'concepto' => 'Montaje', 'importe' => redondear_($total * 0.12, 2), 'iva_pct' => 21,
        'fecha' => sumarDias_($x['fISO'], 40), 'estado_pago' => ($i % 3 ? 'pagado' : 'pendiente'),
        'fecha_pago' => ($i % 3 ? sumarDias_($x['fISO'], 60) : ''), 'factura_proveedor' => '',
        'creado' => $x['fISO'], 'creado_por' => 'demo', 'notas' => '']);
      insertar_('GASTOS', ['operacion_id' => $op['id'], 'categoria' => 'comision', 'proveedor' => '',
        'concepto' => 'Comisión comercial', 'importe' => $tipo === 'fv_aero' ? 800 : 400, 'iva_pct' => 0,
        'fecha' => sumarDias_($x['fISO'], 30), 'estado_pago' => 'pagado', 'fecha_pago' => sumarDias_($x['fISO'], 30),
        'factura_proveedor' => '', 'creado' => $x['fISO'], 'creado_por' => 'demo', 'notas' => '']);
      insertar_('FACTURAS', ['numero' => 'ZW/' . substr($x['fISO'], 0, 4) . '/' . (100 + $i),
        'operacion_id' => $op['id'], 'cliente_id' => $x['c']['id'], 'fecha_emision' => sumarDias_($x['fISO'], 5),
        'concepto' => 'Instalación ' . strtoupper($tipo), 'base' => $base, 'iva_pct' => 21,
        'iva' => redondear_($total - $base, 2), 'total' => $total,
        'estado' => $i % 4 ? 'cobrada' : 'enviada', 'fecha_vencimiento' => sumarDias_($x['fISO'], 35),
        'fecha_cobro' => $i % 4 ? sumarDias_($x['fISO'], 30) : '', 'url' => '', 'emitida_por' => 'demo', 'notas' => '']);
    }

    insertar_('SEGUIMIENTO', ['cliente_id' => $x['c']['id'], 'operacion_id' => $op['id'], 'usuario_id' => $x['comercial'],
      'fecha' => sumarDias_($x['fISO'], 2), 'canal' => 'llamada', 'nota' => 'Repaso de la propuesta con el cliente.',
      'proximo_paso' => 'Confirmar financiación', 'proxima_fecha' => sumarDias_($x['fISO'], 9),
      'estado_resultante' => $x['estado'], 'origen' => 'demo', 'creado' => ahora_()]);
  }

  foreach (array_filter($creados, fn($x) => txt_($x['captador']) !== '') as $x) {
    $i = $x['i'];
    insertar_('CAPTACIONES', ['cliente_id' => $x['c']['id'], 'captador_id' => $x['captador'], 'fecha' => $x['fISO'],
      'hora_cita' => '17:00', 'estado_cita' => 'confirmada',
      'tecnologia' => $i % 3 === 0 ? 'AEROTERMIA + FOTOVOLTAICA' : 'AEROTERMIA',
      'comercial_id' => $x['comercial'],
      'resultado' => $x['estado'] === 'ganado' ? 'venta' : ($x['estado'] === 'perdido' ? 'no_sentada' : 'sentada'),
      'fecha_resultado' => sumarDias_($x['fISO'], 6), 'operacion_id' => '', 'interes' => 5 + ($i % 6),
      'notas' => 'Captación de ejemplo.', 'creado' => ahora_()]);
  }

  error_log('Datos de ejemplo cargados: ' . count($creados) . ' clientes.');
  return count($creados);
}

/** Borra todo lo que haya creado cargarDemo (y cualquier dato de las tablas operativas). */
function borrarDemo(): void {
  foreach (['CLIENTES','OPERACIONES','COBROS','FACTURAS','GASTOS','SEGUIMIENTO','CAPTACIONES','PARTES','NOMINAS','JORNADAS'] as $t) {
    vaciar_($t);
  }
  error_log('Tablas operativas vaciadas.');
}
