<?php
/**
 * ko.php — Clientes en KO (23/11/2026, Nando).
 *
 * «Quiero que en el CRM se pueda poner por el comercial o dirección KO para un cliente, ya que
 * ese cliente no demuestra interés; también una pestaña para poner el motivo del KO; estos que
 * se pongan en KO se guardarán en un listado al que se podrá acceder.»
 *
 *  - Lo ponen el comercial (en sus clientes) o dirección. El captador no lo pone, pero ve en el
 *    listado los KO de sus clientes.
 *  - Siempre con motivo (de una lista) y, si se quiere, una explicación.
 *  - El cliente pasa a estado «ko»: deja de salir en agendas, avisos y próximos pasos.
 *    Opcionalmente se cancelan sus citas pendientes (con el motivo).
 *  - Se puede quitar el KO: vuelve al estado que tenía.
 */

const KO_MOTIVOS = [
  ['sin_interes', 'No muestra interés'],
  ['no_contesta', 'No contesta / ilocalizable'],
  ['precio', 'Le parece caro'],
  ['no_financia', 'No quiere o no le aprueban la financiación'],
  ['otra_empresa', 'Lo ha hecho con otra empresa'],
  ['no_apta', 'La vivienda no es apta'],
  ['sin_fecha', 'Lo pospone sin fecha'],
  ['no_decide', 'No decide quien tiene que decidir'],
  ['otro', 'Otro motivo'],
];

function koMotivoEt_(string $k): string {
  foreach (KO_MOTIVOS as $m) if ($m[0] === $k) return $m[1];
  return $k !== '' ? $k : 'Sin motivo';
}

function puedeKO_(array $u): bool {
  return (permisos_($u)['alcance'] ?? '') === 'todo' || normal_($u['rol'] ?? '') === 'comercial';
}

/** p.cliente_id, p.motivo (clave), p.detalle, p.cancelar_citas (bool). */
function accMarcarKO_(array $u, array $p): array {
  if (!puedeKO_($u)) return ['ok' => false, 'error' => 'El KO lo ponen el comercial o dirección.'];
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $cli = $v['cliente'];
  $motivo = normal_($p['motivo'] ?? '');
  if (!in_array($motivo, array_column(KO_MOTIVOS, 0), true)) return ['ok' => false, 'error' => 'Elige el motivo del KO.'];
  $detalle = mb_substr(txt_($p['detalle'] ?? ''), 0, 600);
  if ($motivo === 'otro' && $detalle === '') return ['ok' => false, 'error' => 'Cuenta brevemente el motivo.'];
  if (normal_($cli['estado']) === 'ganado') return ['ok' => false, 'error' => 'Este cliente ya ha comprado: no se puede poner en KO. Si se ha caído la operación, cancélala.'];
  $previo = normal_($cli['estado']) === 'ko' ? txt_($cli['ko_estado_previo'] ?? '') : txt_($cli['estado']);
  actualizar_('CLIENTES', $cli['id'], ['estado' => 'ko', 'fecha_estado' => hoyISO_(), 'ko_motivo' => $motivo, 'ko_detalle' => $detalle,
    'ko_fecha' => ahora_(), 'ko_por' => $u['id'], 'ko_estado_previo' => $previo, 'proxima_accion' => '', 'proxima_fecha' => '',
    'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  $texto = 'KO: ' . koMotivoEt_($motivo) . ($detalle !== '' ? ' · ' . $detalle : '');
  insertar_('SEGUIMIENTO', ['cliente_id' => $cli['id'], 'fecha' => hoyISO_(), 'canal' => 'otro', 'usuario_id' => $u['id'], 'origen' => 'ko', 'nota' => $texto]);
  /* citas pendientes */
  $canceladas = 0;
  if (!empty($p['cancelar_citas'])) {
    foreach (filtrar_('CAPTACIONES', fn($k) => mismo_($k['cliente_id'], $cli['id']) && !in_array(normal_($k['resultado'] ?? ''), ['venta', 'sentada', 'cancelada', 'no_sentada', 'potencial'], true)) as $k) {
      try { $r = accCancelarCita_($u, ['id' => $k['id'], 'motivo' => 'no_interesa', 'detalle' => 'Cliente en KO (' . koMotivoEt_($motivo) . ')']); if (!empty($r['ok'])) $canceladas++; }
      catch (Throwable $e) { /* si no se puede cancelar una, sigue con el resto */ }
    }
  }
  registrar_($u, 'cliente_ko', 'CLIENTES', $cli['id'], $texto);
  return ['ok' => true, 'citas_canceladas' => $canceladas];
}

function accQuitarKO_(array $u, array $p): array {
  if (!puedeKO_($u)) return ['ok' => false, 'error' => 'El KO lo quitan el comercial o dirección.'];
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $cli = $v['cliente'];
  if (normal_($cli['estado']) !== 'ko') return ['ok' => false, 'error' => 'Este cliente no está en KO.'];
  $vuelve = txt_($cli['ko_estado_previo'] ?? '');
  if ($vuelve === '' || in_array($vuelve, ['ko', 'ganado'], true)) $vuelve = 'negociando';
  actualizar_('CLIENTES', $cli['id'], ['estado' => $vuelve, 'fecha_estado' => hoyISO_(), 'ko_motivo' => '', 'ko_detalle' => '', 'ko_fecha' => '', 'ko_por' => '', 'ko_estado_previo' => '',
    'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  $nota = 'Se quita el KO' . (txt_($p['nota'] ?? '') !== '' ? ': ' . mb_substr(txt_($p['nota']), 0, 300) : '') . ' (antes: ' . koMotivoEt_(txt_($cli['ko_motivo'] ?? '')) . ').';
  insertar_('SEGUIMIENTO', ['cliente_id' => $cli['id'], 'fecha' => hoyISO_(), 'canal' => 'otro', 'usuario_id' => $u['id'], 'origen' => 'ko', 'nota' => $nota]);
  registrar_($u, 'cliente_quitar_ko', 'CLIENTES', $cli['id'], $nota);
  return ['ok' => true, 'estado' => $vuelve];
}

/** Listado de clientes en KO que ve cada uno (dirección: todos; comercial y captador: los suyos). */
function accClientesKO_(array $u, array $p): array {
  $usuarios = leer_('USUARIOS');
  $l = [];
  foreach (leer_('CLIENTES') as $c) {
    if (normal_($c['estado']) !== 'ko' || !veCliente_($u, $c)) continue;
    $l[] = ['id' => $c['id'], 'nombre' => txt_($c['nombre']), 'direccion' => txt_($c['direccion']), 'municipio' => txt_($c['municipio']), 'telefono' => txt_($c['telefono']),
      'motivo' => txt_($c['ko_motivo'] ?? ''), 'motivo_et' => koMotivoEt_(txt_($c['ko_motivo'] ?? '')), 'detalle' => txt_($c['ko_detalle'] ?? ''),
      'fecha' => txt_($c['ko_fecha'] ?? '') ?: txt_($c['fecha_estado']), 'por' => nombreUsuario_(txt_($c['ko_por'] ?? ''), $usuarios),
      'comercial_id' => txt_($c['comercial_id']), 'comercial' => nombreUsuario_(txt_($c['comercial_id']), $usuarios),
      'captador_id' => txt_($c['captador_id']), 'captador' => nombreUsuario_(txt_($c['captador_id']), $usuarios), 'origen' => txt_($c['origen'])];
  }
  usort($l, fn($a, $b) => strcmp($b['fecha'], $a['fecha']));
  return ['ok' => true, 'clientes' => $l, 'motivos' => KO_MOTIVOS, 'puede' => puedeKO_($u)];
}

/**
 * 23/11/2026, Nando: mientras el cliente de un captador no tiene la visita hecha (nuevo, captado,
 * cita), las llamadas para agendar o reagendar son del captador. Al comercial solo le sale cuando
 * la cita ya tiene fecha (por la agenda de citas), no como «próximo paso».
 */
function pasoDelCaptador_(array $c): bool {
  return txt_($c['captador_id'] ?? '') !== '' && (in_array(normal_($c['estado'] ?? ''), ['nuevo', 'captado', 'cita'], true)
    || normal_($c['proxima_accion'] ?? '') === 'llamar para dar cita');
}
