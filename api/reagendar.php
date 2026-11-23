<?php
/**
 * reagendar.php — Citas por reagendar (23/11/2026, Nando).
 *
 * «Las que se tengan que reagendar que se haga lo mismo que con los KO; estas solo le saldrán
 * a los captadores de sus clientes.»
 *
 *  - Desde la ficha, el comercial, el captador o dirección pulsan «↻ Reagendar» con un motivo.
 *  - La cita se queda sin fecha («Pendiente de reagendar») y pasa al captador del cliente:
 *    le sale en Inicio y en su listado «Por reagendar». Al comercial deja de salirle hasta que
 *    el captador le pone fecha nueva; entonces vuelve a su agenda.
 *  - Dirección ve el listado de todos.
 */

const REAGENDAR_MOTIVOS = [
  ['no_puede', 'Aún no puede dar fecha'],
  ['anula', 'Anula la visita y la quiere otro día'],
  ['no_contesta', 'No contesta para confirmar'],
  ['fuera', 'Está fuera o de viaje'],
  ['comercial', 'El comercial no puede ese día'],
  ['falta_decisor', 'Falta quien decide'],
  ['otro', 'Otro motivo'],
];

function reagMotivoEt_(string $k): string {
  foreach (REAGENDAR_MOTIVOS as $m) if ($m[0] === $k) return $m[1];
  return $k;
}

/** La cita viva de un cliente (sin resultado), la más reciente. */
function citaVivaDe_(string $clienteId): ?array {
  $l = array_values(array_filter(leer_('CAPTACIONES'), fn($k) => mismo_($k['cliente_id'], $clienteId)
    && !in_array(normal_($k['resultado'] ?? ''), ['venta', 'sentada', 'cancelada', 'no_sentada', 'potencial'], true)));
  usort($l, fn($a, $b) => strcmp(txt_($b['creado']), txt_($a['creado'])));
  return $l[0] ?? null;
}

/** p.cliente_id, p.motivo, p.detalle, p.volver_llamar */
function accMarcarReagendar_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $cli = $v['cliente'];
  if (in_array(normal_($cli['estado']), ['ganado', 'ko', 'perdido'], true)) return ['ok' => false, 'error' => 'Este cliente ya no tiene citas que reagendar.'];
  $capCli = captadorDeCliente_($cli);
  if ($capCli === '') return ['ok' => false, 'error' => 'Este cliente no tiene captador. Pon tú la nueva fecha desde la pestaña Citas (↻ Reagendar).'];
  $motivo = normal_($p['motivo'] ?? '');
  if (!in_array($motivo, array_column(REAGENDAR_MOTIVOS, 0), true)) return ['ok' => false, 'error' => 'Elige el motivo.'];
  $detalle = mb_substr(txt_($p['detalle'] ?? ''), 0, 500);
  if ($motivo === 'otro' && $detalle === '') return ['ok' => false, 'error' => 'Cuenta brevemente el motivo.'];
  $volver = trozo_($p['volver_llamar'] ?? '', 0, 10);
  if ($volver !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $volver)) $volver = '';
  $texto = reagMotivoEt_($motivo) . ($detalle !== '' ? ' · ' . $detalle : '');

  $cap = citaVivaDe_($cli['id']);
  if ($cap) {
    $r = dejarSinFecha_($u, ['id' => $cap['id'], 'volver_llamar' => $volver, 'motivo' => $texto]);
    if (empty($r['ok'])) return $r;
    $capId = $cap['id'];
  } else {
    $ant = array_values(array_filter(leer_('CAPTACIONES'), fn($k) => mismo_($k['cliente_id'], $cli['id'])));
    usort($ant, fn($a, $b) => strcmp(txt_($b['creado']), txt_($a['creado'])));
    $nueva = insertar_('CAPTACIONES', ['cliente_id' => $cli['id'], 'captador_id' => $capCli, 'comercial_id' => txt_($cli['comercial_id']),
      'fecha' => '', 'hora_cita' => '', 'estado_cita' => 'recontactar', 'resultado' => 'pendiente', 'volver_llamar' => $volver,
      'tecnologia' => txt_($ant[0]['tecnologia'] ?? ''), 'interes' => txt_($ant[0]['interes'] ?? $cli['interes'] ?? ''), 'creado' => ahora_(),
      'notas' => 'Pendiente de reagendar: ' . $texto . '.']);
    actualizar_('CLIENTES', $cli['id'], ['proxima_accion' => 'Llamar para dar cita', 'proxima_fecha' => $volver, 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
    $capId = $nueva['id'];
  }
  actualizar_('CAPTACIONES', $capId, ['reag_motivo' => $motivo, 'reag_detalle' => $detalle, 'reag_por' => $u['id'], 'reag_fecha' => ahora_()]);
  insertar_('SEGUIMIENTO', ['cliente_id' => $cli['id'], 'fecha' => hoyISO_(), 'canal' => 'otro', 'usuario_id' => $u['id'], 'origen' => 'reagendar',
    'nota' => 'Por reagendar (lo lleva el captador): ' . $texto . ($volver !== '' ? ' · volver a llamar el ' . fechaLarga_($volver) : '') . '.']);
  registrar_($u, 'marcar_reagendar', 'CAPTACIONES', $capId, $texto);
  return ['ok' => true, 'captador' => nombreUsuario_($capCli)];
}

/** Listado «Por reagendar»: dirección todos; captador los suyos; el comercial no lo ve. */
function accPorReagendar_(array $u, array $p): array {
  $dir = (permisos_($u)['alcance'] ?? '') === 'todo';
  if (!$dir && normal_($u['rol'] ?? '') !== 'captador') return ['ok' => false, 'error' => 'Las citas por reagendar las llevan los captadores.'];
  $usuarios = leer_('USUARIOS');
  $clientes = indexar_(leer_('CLIENTES'));
  $l = []; $vistos = [];
  foreach (leer_('CAPTACIONES') as $k) {
    if (normal_($k['estado_cita'] ?? '') !== 'recontactar' || txt_($k['fecha']) !== '' || normal_($k['resultado'] ?: 'pendiente') !== 'pendiente') continue;
    $c = $clientes[txt_($k['cliente_id'])] ?? null;
    if (!$c || in_array(normal_($c['estado']), ['ganado', 'ko', 'perdido'], true)) continue;
    $capId = txt_($k['captador_id']) ?: captadorDeCliente_($c);
    if (!$dir && $capId !== txt_($u['id'])) continue;
    $vistos[txt_($c['id'])] = 1;
    $l[] = reagFila_($c, $k, $capId, $usuarios);
  }
  /* Clientes con «llamar y agendar» pendiente y sin cita viva (lo que venía de Trello). */
  foreach ($clientes as $c) {
    if (isset($vistos[txt_($c['id'])]) || captadorDeCliente_($c) === '' || in_array(normal_($c['estado']), ['ganado', 'ko', 'perdido'], true)) continue;
    if (!function_exists('esLlamadaDeAgendar_') || !esLlamadaDeAgendar_($c['proxima_accion'] ?? '')) continue;
    if (!$dir && captadorDeCliente_($c) !== txt_($u['id'])) continue;
    if (citaVivaDe_($c['id']) && txt_(citaVivaDe_($c['id'])['fecha']) !== '') continue;   /* ya tiene fecha */
    $l[] = reagFila_($c, null, captadorDeCliente_($c), $usuarios);
  }
  usort($l, fn($a, $b) => strcmp($a['volver_llamar'] ?: '9999', $b['volver_llamar'] ?: '9999') ?: strcmp($a['desde'], $b['desde']));
  return ['ok' => true, 'citas' => $l, 'motivos' => REAGENDAR_MOTIVOS];
}

function reagFila_(array $c, ?array $k, string $capId, array $usuarios): array {
  $motivo = txt_($k['reag_motivo'] ?? '');
  $detalle = txt_($k['reag_detalle'] ?? '');
  if ($motivo === '' && $k && preg_match('/Pendiente de reagendar[^:]*:\s*([^\n]+)/u', txt_($k['notas']), $mm)) $detalle = $detalle ?: rtrim($mm[1], '.');
  if (!$k) $detalle = txt_($c['proxima_accion']);
  return ['captacion_id' => $k['id'] ?? '', 'cliente_id' => $c['id'], 'direccion' => txt_($c['direccion']), 'nombre' => txt_($c['nombre']),
    'municipio' => txt_($c['municipio']), 'telefono' => txt_($c['telefono']),
    'motivo' => $motivo, 'motivo_et' => $motivo !== '' ? reagMotivoEt_($motivo) : 'Pendiente de reagendar', 'detalle' => $detalle,
    'volver_llamar' => txt_($k['volver_llamar'] ?? '') ?: txt_($c['proxima_fecha']),
    'desde' => substr(txt_($k['reag_fecha'] ?? '') ?: txt_($c['fecha_estado'] ?? '') ?: txt_($k['creado'] ?? ''), 0, 10),
    'por' => nombreUsuario_(txt_($k['reag_por'] ?? ''), $usuarios),
    'captador_id' => $capId, 'captador' => nombreUsuario_($capId, $usuarios),
    'comercial_id' => txt_($c['comercial_id']), 'comercial' => nombreUsuario_(txt_($c['comercial_id']), $usuarios)];
}
