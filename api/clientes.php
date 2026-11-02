<?php
/**
 * clientes.php — Clientes, operaciones, seguimiento y captaciones.
 * (Traducción de 04_Clientes.gs)
 *
 * El navegador pide una foto completa de lo que esa persona puede ver
 * (accDatos_) y a partir de ahí trabaja en local. Cada guardado vuelve
 * al servidor, que es quien comprueba de nuevo si puede tocar esa ficha.
 */

require_once __DIR__ . '/base.php';

/* ---------- foto de datos ---------- */

function accDatos_(array $u, array $p): array {
  $per = permisos_($u);
  $clientes = misClientes_($u);
  $visibles = [];
  foreach ($clientes as $c) $visibles[txt_($c['id'])] = true;

  $operaciones = array_values(array_filter(leer_('OPERACIONES'), function ($op) use ($u, $visibles) {
    return veOperacion_($u, $op) || !empty($visibles[txt_($op['cliente_id'])]);
  }));
  $opVisibles = [];
  foreach ($operaciones as $op) $opVisibles[txt_($op['id'])] = true;

  $seguimiento = array_values(array_filter(leer_('SEGUIMIENTO'), fn($s) => !empty($visibles[txt_($s['cliente_id'])])));
  $captaciones = array_values(array_filter(leer_('CAPTACIONES'), fn($c) => !empty($visibles[txt_($c['cliente_id'])])));

  $salida = [
    'ok' => true,
    'usuario' => publico_($u),
    'permisos' => $per,
    'catalogo' => CATALOGO,
    'config' => configVisible_($u),
    'usuarios' => array_map(fn($x) => publico_($x), leer_('USUARIOS')),
    'clientes' => array_map(fn($c) => clienteParaVer_($u, $c), $clientes),
    'operaciones' => $operaciones,
    'seguimiento' => $seguimiento,
    'captaciones' => $captaciones,
    'servidor' => ahora_(),
    'version' => VERSION
  ];

  /* La parte financiera solo viaja si el rol la tiene abierta. */
  if (!empty($per['finanzas'])) {
    $salida['cobros'] = leer_('COBROS');
    $salida['facturas'] = leer_('FACTURAS');
    $salida['gastos'] = leer_('GASTOS');
  } else {
    /* Lo financiero y contable (cobros, facturas, gastos, banco) solo lo ve
       dirección; comerciales y captadores no reciben nada (30/10/2026). */
    $salida['cobros'] = [];
    $salida['facturas'] = [];
    $salida['gastos'] = [];
  }
  return $salida;
}

/* El coste y el margen de una instalación no viven en la operación, sino en
   la tabla GASTOS, que solo viaja a quien tiene las finanzas abiertas. Por eso
   la operación se envía entera: lo que enseña son importes de venta, que el
   comercial necesita. */

/* ---------- clientes ---------- */

function accGuardarCliente_(array $u, array $p): array {
  $d = is_array($p['cliente'] ?? null) ? $p['cliente'] : [];
  $per = permisos_($u);
  $campos = array_values(array_filter(ESQUEMA['CLIENTES'], function ($c) {
    return !in_array($c, ['id', 'creado', 'creado_por', 'modificado', 'modificado_por'], true);
  }));

  if (txt_($d['id'] ?? '') !== '') {
    $actual = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $d['id']));
    if (!$actual) return ['ok' => false, 'error' => 'Ese cliente ya no existe.'];
    if (!veCliente_($u, $actual)) return ['ok' => false, 'error' => 'Ese cliente no es tuyo.'];
    $cambios = ['modificado' => ahora_(), 'modificado_por' => $u['id']];
    foreach ($campos as $c) if (array_key_exists($c, $d)) $cambios[$c] = $d[$c];
    /* Nadie que no sea jefe puede regalarse o quitarse un cliente. */
    if (empty($per['editarTodo'])) { unset($cambios['comercial_id'], $cambios['captador_id']); }
    /* Lo que llega todavía tapado con asteriscos no pisa el DNI ni el email buenos. */
    foreach (['dni', 'email', 'cotitular'] as $k) {
      if (array_key_exists($k, $cambios) && esTapado_($cambios[$k])) unset($cambios[$k]);
    }
    if (txt_($cambios['estado'] ?? '') !== '' && !mismo_($cambios['estado'], $actual['estado'])) $cambios['fecha_estado'] = hoyISO_();
    $r = actualizar_('CLIENTES', $d['id'], $cambios);
    apuntarHistorial_($u, 'CLIENTES', $d['id'], $d['id'], $actual, $cambios);
    registrar_($u, 'editar_cliente', 'CLIENTES', $d['id'], txt_($cambios['estado'] ?? '') !== '' ? $cambios['estado'] : '');
    /* Si al corregir el teléfono o la calle resulta que es otro cliente que ya
       estaba, se avisa (no se bloquea: dirección decide si se fusionan). */
    $avisoDup = null;
    if (array_key_exists('telefono', $cambios) || array_key_exists('direccion', $cambios)) {
      $dup = buscarDuplicado_($r, $r['id']);
      if ($dup) $avisoDup = etiquetaDuplicado_($u, $dup);
    }
    return ['ok' => true, 'cliente' => clienteParaVer_($u, $r), 'duplicado' => $avisoDup];
  }

  $nuevo = ['creado' => hoyISO_(), 'creado_por' => $u['id'], 'modificado' => ahora_(), 'modificado_por' => $u['id']];
  foreach ($campos as $c) if (array_key_exists($c, $d)) $nuevo[$c] = $d[$c];
  if (txt_($nuevo['nombre'] ?? '') === '') return ['ok' => false, 'error' => 'El cliente necesita un nombre.'];
  /* Un cliente, una ficha: si ya está por teléfono o dirección, no se crea
     otro. Solo dirección puede forzarlo (dos viviendas del mismo dueño). */
  $dup = buscarDuplicado_($nuevo);
  if ($dup && !(!empty($d['forzar']) && !empty($per['editarTodo']))) {
    $info = etiquetaDuplicado_($u, $dup);
    return ['ok' => false, 'duplicado' => $info,
            'error' => 'Ya existe un cliente con ese ' . $dup['por'] . ': ' . $info['etiqueta'] . ' (' . $info['id'] . ')' .
                   ($info['visible'] ? '. Ábrelo y apunta ahí lo nuevo.' : ', que lleva ' . (txt_($info['comercial']) !== '' ? $info['comercial'] : 'otra persona') .
                   '. Pide a dirección que te lo pase.')];
  }
  /* Quien da de alta se queda el cliente, salvo que un jefe diga otra cosa. */
  if ($u['rol'] === 'comercial') $nuevo['comercial_id'] = $u['id'];
  if ($u['rol'] === 'captador') { $nuevo['captador_id'] = $u['id']; $nuevo['origen'] = txt_($nuevo['origen'] ?? '') !== '' ? $nuevo['origen'] : 'captacion'; }
  $nuevo['estado'] = txt_($nuevo['estado'] ?? '') !== '' ? $nuevo['estado'] : ($u['rol'] === 'captador' ? 'captado' : 'nuevo');
  $nuevo['fecha_estado'] = hoyISO_();
  $r = insertar_('CLIENTES', $nuevo);
  apuntarHistorial_($u, 'CLIENTES', $r['id'], $r['id'], null, null, 'Ficha creada');
  registrar_($u, 'alta_cliente', 'CLIENTES', $r['id'], $r['nombre'] ?? '');
  return ['ok' => true, 'cliente' => clienteParaVer_($u, $r)];
}

function accBorrarCliente_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $p['id'] ?? ''));
  if (!$cli) return ['ok' => false, 'error' => 'No existe.'];
  /* Borrar una ficha con cosas colgando dejaba apuntes y proyectos sueltos. */
  $enl = enlazadosDe_($p['id'] ?? '');
  $n = 0;
  foreach ($enl as $k => $v) $n += $v;
  if ($n) {
    $partes = [];
    foreach ($enl as $k => $v) $partes[] = $v . ' ' . mb_strtolower((string)$k);
    return ['ok' => false, 'enlazados' => $enl,
      'error' => 'Tiene ' . $n . ' cosas enlazadas (' . implode(', ', $partes) .
             '). Si es un duplicado, fusiónalo con la ficha buena en vez de borrarlo.'];
  }
  borrar_('CLIENTES', $p['id']);
  registrar_($u, 'borrar_cliente', 'CLIENTES', $p['id'], $cli['nombre']);
  return ['ok' => true];
}

/* ---------- operaciones ---------- */

function accGuardarOperacion_(array $u, array $p): array {
  $d = is_array($p['operacion'] ?? null) ? $p['operacion'] : [];
  $per = permisos_($u);
  $campos = array_values(array_filter(ESQUEMA['OPERACIONES'], function ($c) {
    return !in_array($c, ['id', 'creado', 'creado_por', 'modificado', 'modificado_por'], true);
  }));

  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $d['cliente_id'] ?? ''));
  if (!$cli) return ['ok' => false, 'error' => 'La operación necesita un cliente.'];
  if (!veCliente_($u, $cli)) return ['ok' => false, 'error' => 'Ese cliente no es tuyo.'];

  $calc = totalesOperacion_($d);

  if (txt_($d['id'] ?? '') !== '') {
    $actual = buscar1_('OPERACIONES', fn($o) => mismo_($o['id'], $d['id']));
    if (!$actual) return ['ok' => false, 'error' => 'Esa operación ya no existe.'];
    if (!veOperacion_($u, $actual) && !veCliente_($u, $cli)) return ['ok' => false, 'error' => 'Esa operación no es tuya.'];
    $cambios = ['modificado' => ahora_(), 'modificado_por' => $u['id']];
    foreach ($campos as $c) if (array_key_exists($c, $d)) $cambios[$c] = $d[$c];
    if (empty($per['editarTodo'])) { unset($cambios['comercial_id'], $cambios['captador_id']); }
    $cambios['base'] = $calc['base']; $cambios['total'] = $calc['total'];
    $r = actualizar_('OPERACIONES', $d['id'], $cambios);
    sincronizarEstadoCliente_($u, $r);
    /* Si cambia el importe y todavía no se ha cobrado nada, el calendario
       de cobros se rehace para que no quede descuadrado. */
    if (abs(num_($actual['total']) - $calc['total']) > 0.01) recalcularCobros_($u, $r);
    registrar_($u, 'editar_operacion', 'OPERACIONES', $d['id'], txt_($cambios['estado'] ?? '') !== '' ? $cambios['estado'] : '');
    return ['ok' => true, 'operacion' => $r, 'cobros' => cobrosDe_($u, $d['id'])];
  }

  $nueva = ['creado' => hoyISO_(), 'creado_por' => $u['id'], 'modificado' => ahora_(), 'modificado_por' => $u['id']];
  foreach ($campos as $c) if (array_key_exists($c, $d)) $nueva[$c] = $d[$c];
  $nueva['comercial_id'] = (!empty($per['editarTodo']) && txt_($d['comercial_id'] ?? '') !== '')
    ? $d['comercial_id']
    : (txt_($cli['comercial_id']) !== '' ? $cli['comercial_id'] : $u['id']);
  $nueva['captador_id'] = txt_($cli['captador_id']) !== '' ? $cli['captador_id'] : '';
  $nueva['base'] = $calc['base']; $nueva['total'] = $calc['total'];
  $nueva['estado'] = txt_($nueva['estado'] ?? '') !== '' ? $nueva['estado'] : 'propuesta';
  $nueva['referencia'] = txt_($nueva['referencia'] ?? '') !== '' ? $nueva['referencia']
    : ('ZW-' . substr(hoyISO_(), 0, 4) . '-' . strtoupper(substr(uuidHex_(), 0, 4)));
  $r = insertar_('OPERACIONES', $nueva);
  /* Al firmar en contado, el calendario de cobro 50/25/25 se crea solo. */
  if (normal_($r['forma_pago'] ?? '') === 'contado' && num_($r['total']) > 0) crearCobrosEstandar_($u, $r);
  sincronizarEstadoCliente_($u, $r);
  registrar_($u, 'alta_operacion', 'OPERACIONES', $r['id'], $cli['nombre']);
  return ['ok' => true, 'operacion' => $r, 'cobros' => cobrosDe_($u, $r['id'])];
}

/** Suma los importes de la operación y reparte base e IVA. */
function totalesOperacion_(array $d): array {
  $total = num_($d['importe_fv'] ?? '') + num_($d['importe_aero'] ?? '') + num_($d['importe_bateria'] ?? '')
         + num_($d['importe_cargador'] ?? '') + num_($d['importe_extras'] ?? '');
  $iva = num_($d['iva_pct'] ?? '') ?: 21;
  return ['total' => redondear_($total, 2), 'base' => redondear_($total / (1 + $iva / 100), 2)];
}

/** Cuando una operación se firma o se cae, el cliente cambia de estado. */
function sincronizarEstadoCliente_(array $u, ?array $op): void {
  if (!$op) return;
  $mapa = [
    'propuesta' => 'propuesta', 'firmada' => 'ganado', 'financiacion' => 'negociando', 'tramite' => 'ganado',
    'material' => 'ganado', 'instalacion' => 'ganado', 'instalada' => 'ganado', 'legalizada' => 'ganado',
    'cerrada' => 'ganado', 'cancelada' => 'perdido'
  ];
  $nuevo = $mapa[normal_($op['estado'] ?? '')] ?? null;
  if (!$nuevo) return;
  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $op['cliente_id'] ?? ''));
  if ($cli && normal_($cli['estado']) !== $nuevo) {
    actualizar_('CLIENTES', $cli['id'], ['estado' => $nuevo, 'fecha_estado' => hoyISO_(),
      'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  }
  /* Si venía de una captación, se marca cómo acabó. */
  $cap = captacionActual_($op['cliente_id'] ?? '', $op['id'] ?? '');
  if ($cap) {
    $res = $nuevo === 'ganado' ? 'venta' : ($nuevo === 'perdido' ? 'no_sentada' : 'sentada');
    if (normal_($cap['resultado']) !== $res) {
      $nuevaCap = actualizar_('CAPTACIONES', $cap['id'], ['resultado' => $res, 'fecha_resultado' => hoyISO_(), 'operacion_id' => $op['id']]);
      avisarCaptador_($nuevaCap, $cli);
    }
  }
}

function crearCobrosEstandar_(array $u, array $op): void {
  $total = num_($op['total'] ?? '');
  $firma = txt_($op['fecha_firma'] ?? '') !== '' ? txt_($op['fecha_firma']) : hoyISO_();
  $tramos = [['firma', 0.5, 0], ['material', 0.25, 25], ['final', 0.25, 45]];
  foreach ($tramos as $t) {
    insertar_('COBROS', [
      'operacion_id' => $op['id'], 'concepto' => $t[0], 'importe' => redondear_($total * $t[1], 2),
      'fecha_prevista' => sumarDias_($firma, $t[2]), 'fecha_cobro' => '', 'estado' => 'previsto',
      'metodo' => 'transferencia', 'factura_id' => '', 'notas' => 'Generado automáticamente al crear la operación.',
      'creado' => ahora_(), 'creado_por' => $u['id']
    ]);
  }
}

/**
 * Rehace el calendario de cobros de una operación cuando cambia su importe.
 * Solo toca los cobros que aún no se han cobrado: si ya ha entrado dinero,
 * se deja como está y se avisa en el registro.
 */
function recalcularCobros_(array $u, array $op): void {
  $cobros = filtrar_('COBROS', fn($c) => mismo_($c['operacion_id'], $op['id']));
  if (!count($cobros)) {
    if (normal_($op['forma_pago'] ?? '') === 'contado' && num_($op['total']) > 0) crearCobrosEstandar_($u, $op);
    return;
  }
  $cobrado = array_values(array_filter($cobros, fn($c) => txt_($c['fecha_cobro']) !== ''));
  /* 02/11/2026: los cobros metidos a mano (hitos de Finlight, acuerdos con
     el cliente) no se tocan nunca. Solo se rehacen los que creó el CRM. */
  $aMano = array_values(array_filter($cobros, fn($c) => !str_starts_with(txt_($c['notas']), 'Generado automáticamente')));
  if (count($aMano)) {
    registrar_($u, 'importe_cambiado_con_cobros', 'OPERACIONES', $op['id'],
      'Cobros puestos a mano: no se rehacen solos; revisar el calendario si hace falta.');
    return;
  }
  if (count($cobrado)) {
    registrar_($u, 'importe_cambiado_con_cobros', 'OPERACIONES', $op['id'],
      'Revisar a mano el calendario de cobros: ya había dinero cobrado.');
    return;
  }
  foreach ($cobros as $c) borrar_('COBROS', $c['id']);
  if (num_($op['total']) > 0) crearCobrosEstandar_($u, $op);
}

function cobrosDe_(array $u, $operacionId): array {
  /* Cobros = contabilidad: solo dirección (30/10/2026). */
  if (empty(permisos_($u)['finanzas'])) return [];
  return filtrar_('COBROS', fn($c) => mismo_($c['operacion_id'], $operacionId));
}

function accBorrarOperacion_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  borrar_('OPERACIONES', $p['id'] ?? '');
  registrar_($u, 'borrar_operacion', 'OPERACIONES', $p['id'] ?? '', '');
  return ['ok' => true];
}

/* ---------- seguimiento ---------- */

function accGuardarSeguimiento_(array $u, array $p): array {
  $d = is_array($p['seguimiento'] ?? null) ? $p['seguimiento'] : [];
  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $d['cliente_id'] ?? ''));
  if (!$cli) return ['ok' => false, 'error' => 'Falta el cliente.'];
  if (!veCliente_($u, $cli)) return ['ok' => false, 'error' => 'Ese cliente no es tuyo.'];

  if (txt_($d['id'] ?? '') !== '') {
    $cambios = [];
    foreach (['fecha', 'canal', 'nota', 'proximo_paso', 'proxima_fecha', 'estado_resultante', 'operacion_id'] as $c) {
      if (array_key_exists($c, $d)) $cambios[$c] = $d[$c];
    }
    $r = actualizar_('SEGUIMIENTO', $d['id'], $cambios);
    return ['ok' => true, 'seguimiento' => $r];
  }

  $nuevo = [
    'cliente_id' => $d['cliente_id'], 'operacion_id' => txt_($d['operacion_id'] ?? '') !== '' ? $d['operacion_id'] : '', 'usuario_id' => $u['id'],
    'fecha' => txt_($d['fecha'] ?? '') !== '' ? $d['fecha'] : hoyISO_(), 'canal' => txt_($d['canal'] ?? '') !== '' ? $d['canal'] : 'llamada', 'nota' => txt_($d['nota'] ?? ''),
    'proximo_paso' => txt_($d['proximo_paso'] ?? ''), 'proxima_fecha' => txt_($d['proxima_fecha'] ?? '') !== '' ? $d['proxima_fecha'] : '',
    'estado_resultante' => txt_($d['estado_resultante'] ?? '') !== '' ? $d['estado_resultante'] : '', 'origen' => txt_($d['origen'] ?? '') !== '' ? $d['origen'] : 'manual', 'creado' => ahora_()
  ];
  $r = insertar_('SEGUIMIENTO', $nuevo);

  $cambiosCliente = ['modificado' => ahora_(), 'modificado_por' => $u['id']];
  if ($nuevo['proximo_paso'] !== '') $cambiosCliente['proxima_accion'] = $nuevo['proximo_paso'];
  if (txt_($nuevo['proxima_fecha']) !== '') $cambiosCliente['proxima_fecha'] = $nuevo['proxima_fecha'];
  if (txt_($nuevo['estado_resultante']) !== '') {
    $cambiosCliente['estado'] = $nuevo['estado_resultante'];
    $cambiosCliente['fecha_estado'] = hoyISO_();
  }
  $clienteActualizado = actualizar_('CLIENTES', $cli['id'], $cambiosCliente);
  registrar_($u, 'seguimiento', 'CLIENTES', $cli['id'], $nuevo['canal']);
  return ['ok' => true, 'seguimiento' => $r, 'cliente' => $clienteActualizado];
}

/* ---------- captaciones ---------- */

/**
 * Reglas fijas de la agenda de cada comercial (Nando, 02/11/2026: como mucho
 * 3 visitas al día, los viernes no y nunca después de las 17:30, salvo que
 * él lo autorice). Son regla para los captadores: si la cita no las cumple,
 * no se le adjudica; se puede guardar sin adjudicar y le llega un correo
 * para que la acepte él (adjudicándosela).
 */
function accGuardarCaptacion_(array $u, array $p): array {
  $d = is_array($p['captacion'] ?? null) ? $p['captacion'] : [];
  $pendiente = null;
  if (($u['rol'] ?? '') === 'captador') {
    $ant = txt_($d['id'] ?? '') !== '' ? buscar1_('CAPTACIONES', fn($x) => mismo_($x['id'], $d['id'])) : null;
    $val = fn($k, $def) => array_key_exists($k, $d) ? txt_($d[$k]) : ($ant ? txt_($ant[$k] ?? '') : $def);
    $toca = !$ant;
    if ($ant) foreach (['fecha', 'hora_cita', 'comercial_id'] as $k) if (array_key_exists($k, $d) && txt_($d[$k]) !== txt_($ant[$k] ?? '')) $toca = true;
    $com = $val('comercial_id', '');
    $fe = $val('fecha', '') ?: ($ant ? '' : hoyISO_());
    $ho = $val('hora_cita', '');
    $res = normal_($val('resultado', 'pendiente'));
    if ($toca && $com !== '' && $fe !== '' && !in_array($res, ['cancelada', 'no_sentada', 'venta', 'sentada'], true)) {
      $fallos = reglasAgenda_($com, $fe, $ho, $d['id'] ?? '');
      if ($fallos) {
        $quien = txt_((buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $com)) ?? [])['nombre'] ?? '') ?: 'ese comercial';
        if (empty($p['pedir_autorizacion']) && empty($d['pedir_autorizacion'])) {
          return ['ok' => false, 'requiere_autorizacion' => true, 'comercial' => $quien, 'motivos' => $fallos,
                  'error' => 'A ' . $quien . ' no se le puede dar esa cita sin su autorización: ' . implode('; ', $fallos) . '.'];
        }
        /* Queda sin adjudicar hasta que él la acepte. */
        $notas = $val('notas', '');
        $d['comercial_id'] = '';
        $d['notas'] = ($notas !== '' ? $notas . "\n" : '') . 'Pendiente de que ' . $quien . ' autorice la visita del ' .
          fechaLarga_($fe, $ho) . ' (' . implode('; ', $fallos) . ').';
        $pendiente = ['comercial_id' => $com, 'nombre' => $quien, 'fallos' => $fallos, 'fecha' => $fe, 'hora' => $ho];
      }
    }
  }
  $p['captacion'] = $d;
  $r = guardarCaptacionSinReglas_($u, $p);
  if ($pendiente && !empty($r['ok']) && !empty($r['captacion'])) {
    /* El cliente sí pasa a su cartera, para que lo vea y pueda aceptar la cita. */
    actualizar_('CLIENTES', $r['captacion']['cliente_id'], ['comercial_id' => $pendiente['comercial_id'], 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
    pedirAutorizacionCita_($u, $r['captacion'], $pendiente);
    $r['pendiente_autorizacion'] = 'Guardada sin adjudicar: le ha llegado un correo a ' . $pendiente['nombre'] . ' para que la autorice.';
  }
  return $r;
}

function guardarCaptacionSinReglas_(array $u, array $p): array {
  $d = is_array($p['captacion'] ?? null) ? $p['captacion'] : [];
  $clienteId = $d['cliente_id'] ?? '';

  /* Un captador puede crear cliente y captación de una vez. */
  $avisoDup = null;
  $yaExistia = false;
  if (txt_($clienteId) === '' && isset($d['cliente']) && is_array($d['cliente'])) {
    $res = accGuardarCliente_($u, ['cliente' => $d['cliente']]);
    if (empty($res['ok']) && !empty($res['duplicado'])) {
      /* Ya estaba: la cita se apunta en su ficha, no en una nueva. */
      $clienteId = $res['duplicado']['id'];
      $avisoDup = $res['duplicado'];
      $yaExistia = true;
    } elseif (empty($res['ok'])) {
      return $res;
    } else {
      $clienteId = $res['cliente']['id'];
    }
  }
  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $clienteId));
  if (!$cli) return ['ok' => false, 'error' => 'Falta el cliente de la captación.'];
  if (!$yaExistia && !veCliente_($u, $cli)) return ['ok' => false, 'error' => 'Ese cliente no es tuyo.'];
  if ($yaExistia && txt_($d['id'] ?? '') !== '') return ['ok' => false, 'error' => 'Ese cliente no es tuyo.'];
  /* Lo que trae la ficha nueva y la vieja no tenía (m², gastos…) se aprovecha;
     lo que ya estaba no se pisa. */
  if ($yaExistia) {
    $relleno = [];
    foreach (array_keys($d['cliente']) as $k) {
      if (in_array($k, ['id', 'nombre', 'comercial_id', 'captador_id', 'estado', 'origen'], true)) continue;
      if (in_array($k, ESQUEMA['CLIENTES'], true) && txt_($cli[$k]) === '' && txt_($d['cliente'][$k]) !== '') $relleno[$k] = $d['cliente'][$k];
    }
    if (count($relleno)) {
      actualizar_('CLIENTES', $cli['id'], $relleno);
      apuntarHistorial_($u, 'CLIENTES', $cli['id'], $cli['id'], $cli, $relleno);
    }
  }

  $campos = ['fecha', 'hora_cita', 'estado_cita', 'tecnologia', 'comercial_id', 'resultado',
             'fecha_resultado', 'operacion_id', 'interes', 'notas'];
  if (txt_($d['id'] ?? '') !== '') {
    $anterior = buscar1_('CAPTACIONES', fn($x) => mismo_($x['id'], $d['id']));
    $cambios = [];
    foreach ($campos as $c) if (array_key_exists($c, $d)) $cambios[$c] = $d[$c];
    /* Cambio de día o cancelación por cualquier camino: cuenta para las estadísticas. */
    if (empty($d['_cambio_apuntado'])) apuntarCambiosDeCaptacion_($u, $anterior, $anterior ? array_merge($anterior, $cambios) : null);
    $r = actualizar_('CAPTACIONES', $d['id'], $cambios);
    if ($anterior) apuntarHistorial_($u, 'CAPTACIONES', $d['id'], $cli['id'], $anterior, $cambios);
    if ($anterior && txt_($cambios['resultado'] ?? '') !== '' && normal_($cambios['resultado']) !== normal_($anterior['resultado'])) {
      avisarCaptador_($r, $cli);
    }
    sincronizarCaptacionCliente_($u, $r, buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $cli['id'])));

    /* Adjudicar la captación a un comercial es lo que hace que ese comercial
       la vea: el cliente pasa a ser suyo. Si se quita, deja de verla. */
    if (array_key_exists('comercial_id', $d) &&
        txt_($d['comercial_id']) !== txt_($anterior ? $anterior['comercial_id'] : '')) {
      actualizar_('CLIENTES', $cli['id'], ['comercial_id' => txt_($d['comercial_id']),
        'modificado' => ahora_(), 'modificado_por' => $u['id']]);
      registrar_($u, 'adjudicar_captacion', 'CAPTACIONES', $d['id'],
        txt_($d['comercial_id']) !== '' ? 'a ' . txt_($d['comercial_id']) : 'sin comercial');
    }
    /* Si cambia el día de la cita, la ficha del cliente lo refleja. */
    if (txt_($cambios['fecha'] ?? '') !== '' && normal_($r['resultado'] ?? '') === 'pendiente') {
      actualizar_('CLIENTES', $cli['id'], ['proxima_accion' => 'Sentada concertada',
        'proxima_fecha' => txt_($cambios['fecha']), 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
    }
    $tocaAgenda = txt_($cambios['fecha'] ?? '') !== '' || txt_($cambios['hora_cita'] ?? '') !== '' || txt_($cambios['comercial_id'] ?? '') !== '';
    return ['ok' => true, 'captacion' => $r,
            'aviso_agenda' => $tocaAgenda ? choqueAgenda_($r) : ''];
  }
  $nueva = ['cliente_id' => $clienteId,
            'captador_id' => $u['rol'] === 'captador' ? $u['id']
              : (txt_($d['captador_id'] ?? '') !== '' ? $d['captador_id'] : (txt_($cli['captador_id']) !== '' ? $cli['captador_id'] : '')),
            'creado' => ahora_()];
  foreach ($campos as $c) $nueva[$c] = array_key_exists($c, $d) ? $d[$c] : '';
  /* El comercial que da una cita a un cliente suyo se la queda él. */
  if (txt_($nueva['comercial_id']) === '' && $u['rol'] === 'comercial') $nueva['comercial_id'] = $u['id'];
  $nueva['fecha'] = txt_($nueva['fecha']) !== '' ? $nueva['fecha'] : hoyISO_();
  $nueva['resultado'] = txt_($nueva['resultado']) !== '' ? $nueva['resultado'] : 'pendiente';
  $r = insertar_('CAPTACIONES', $nueva);
  $comNombre = txt_($r['comercial_id']) !== '' ? txt_((buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $r['comercial_id'])) ?? [])['nombre'] ?? '') : '';
  apuntarHistorial_($u, 'CAPTACIONES', $r['id'], $cli['id'], null, null, 'Cita nueva para el ' . fechaLarga_($r['fecha'], $r['hora_cita']) .
    ($comNombre !== '' ? ' con ' . $comNombre : ''));

  $cambiosCliente = ['modificado' => ahora_(), 'modificado_por' => $u['id']];
  /* Una cita nueva no hace retroceder a un cliente que ya va por delante. */
  if (!in_array(normal_($cli['estado']), ['ganado', 'propuesta', 'negociando', 'sentada'], true)) {
    $cambiosCliente['estado'] = 'cita';
    $cambiosCliente['fecha_estado'] = hoyISO_();
  }
  if (txt_($nueva['interes']) !== '') $cambiosCliente['interes'] = $nueva['interes'];
  if (txt_($nueva['comercial_id']) !== '') $cambiosCliente['comercial_id'] = $nueva['comercial_id'];
  if (txt_($nueva['fecha']) !== '') { $cambiosCliente['proxima_accion'] = 'Sentada concertada'; $cambiosCliente['proxima_fecha'] = $nueva['fecha']; }
  actualizar_('CLIENTES', $cli['id'], $cambiosCliente);
  registrar_($u, 'alta_captacion', 'CAPTACIONES', $r['id'], $cli['nombre']);
  /* Dos captadores en la misma zona (menos de 200 m): correo a los dos y a dirección. */
  $avisoZona = avisoZonaCaptacion_($r);
  return ['ok' => true, 'captacion' => $r, 'aviso_agenda' => choqueAgenda_($r), 'duplicado' => $avisoDup, 'aviso_zona' => $avisoZona,
          'aviso_duplicado' => $avisoDup ? 'Este cliente ya estaba en el CRM (' . $avisoDup['etiqueta'] . ', ' . $avisoDup['id'] .
            '): la cita se ha apuntado en su ficha, sin crear otra.' : ''];
}

/**
 * Borra captaciones. Hasta hoy se podian borrar clientes, operaciones,
 * facturas, cobros y gastos, pero las captaciones solo se podian cancelar,
 * asi que los duplicados se quedaban en la hoja estorbando.
 * Acepta una sola (p.id) o varias de golpe (p.ids).
 */
function accBorrarCaptacion_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  $base = (!empty($p['ids']) && is_array($p['ids']) && count($p['ids'])) ? $p['ids'] : (txt_($p['id'] ?? '') !== '' ? [$p['id']] : []);
  $pedidos = array_values(array_filter(array_map(fn($x) => txt_($x), $base), fn($x) => $x !== ''));
  if (!count($pedidos)) return ['ok' => false, 'error' => 'No has dicho que captacion borrar.'];

  $todas = leer_('CAPTACIONES');
  $suyas = array_values(array_filter($todas, fn($c) => in_array(txt_($c['id']), $pedidos, true)));
  if (!count($suyas)) return ['ok' => false, 'error' => 'No existe.'];

  /* Si alguna estaba enganchada a una operacion, esa operacion se queda sin
     captacion. No se impide, pero queda dicho en el registro para que el
     rastro no se pierda. */
  $conOperacion = array_map(fn($c) => $c['id'] . '>' . $c['operacion_id'],
    array_values(array_filter($suyas, fn($c) => txt_($c['operacion_id']) !== '')));

  $ids = array_map(fn($c) => $c['id'], $suyas);
  $borradas = borrarVarios_('CAPTACIONES', $ids);
  registrar_($u, 'borrar_captacion', 'CAPTACIONES',
    implode(' ', $ids),
    $borradas . ' captaciones' .
    (count($conOperacion) ? ' - tenian operacion: ' . implode(', ', $conOperacion) : ''));
  return ['ok' => true, 'borradas' => $borradas];
}

/* ---------- búsqueda rápida ---------- */

function accBuscar_(array $u, array $p): array {
  $q = normal_($p['q'] ?? '');
  if (mb_strlen($q) < 2) return ['ok' => true, 'resultados' => []];
  $clientes = misClientes_($u);
  $res = array_slice(array_values(array_filter($clientes, function ($c) use ($q) {
    return str_contains(normal_($c['nombre']), $q) || str_contains(normal_($c['direccion']), $q)
        || str_contains(normal_($c['municipio']), $q) || str_contains(normal_($c['telefono']), $q)
        || str_contains(normal_($c['email']), $q) || str_contains(normal_($c['id']), $q);
  })), 0, 40);
  return ['ok' => true, 'resultados' => $res];
}
