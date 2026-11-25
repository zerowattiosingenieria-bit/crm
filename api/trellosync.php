<?php
/**
 * trellosync.php — Lo que se hace en el Tablero de fichas también va a Trello (25/11/2026, Nando).
 *
 * «Si yo meto algo o cambio algo en el tablero de fichas, que también se sincronice en Trello.»
 *
 * El servidor del CRM no tiene acceso a Trello, así que cada cambio hecho desde el tablero
 * (mover una cita, cambiar datos, etiquetas, comentarios o una ficha nueva) se apunta en
 * TRELLO_COLA. Una tarea programada abre Trello en el ordenador de Nando, aplica los pendientes
 * en el tablero de visitas (whf4hb8Y) y los marca como hechos (o con el motivo si no pudo).
 * Solo lectura/escritura de la cola: Nando, Fernando y el superadmin (permiso controlsub).
 */

function trelloEncolar_($u, string $accion, array $p, $r): void {
  try {
    if (!is_array($u) || !is_array($r) || empty($r['ok'])) return;
    $d = null; $tipo = '';
    if ($accion === 'guardarCaptacion') { $d = is_array($p['captacion'] ?? null) ? $p['captacion'] : []; $tipo = 'cita'; }
    elseif ($accion === 'guardarCliente') { $d = is_array($p['cliente'] ?? null) ? $p['cliente'] : []; $tipo = 'cliente'; }
    elseif ($accion === 'guardarSeguimiento') { $d = is_array($p['seguimiento'] ?? null) ? $p['seguimiento'] : []; $tipo = 'comentario'; }
    else return;
    if (normal_($d['_origen'] ?? $d['origen'] ?? $p['origen'] ?? '') !== 'tablero') return;

    $cap = $tipo === 'cita' ? ($r['captacion'] ?? null) : null;
    $cliId = txt_($cap['cliente_id'] ?? ($r['cliente']['id'] ?? ($d['cliente_id'] ?? ($d['id'] ?? ''))));
    if ($tipo === 'comentario') $cliId = txt_($d['cliente_id'] ?? '');
    $cli = $cliId !== '' ? buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $cliId)) : null;
    if (!$cli) return;
    if (!$cap && $tipo !== 'cita') {
      $caps = array_filter(leer_('CAPTACIONES'), fn($x) => mismo_($x['cliente_id'], $cliId));
      usort($caps, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
      $cap = $caps ? reset($caps) : null;
    }
    $nueva = $tipo === 'cita' && txt_($d['id'] ?? '') === '';
    $nombres = [];
    if ($cap && txt_($cap['etiquetas'] ?? '') !== '') {
      $idx = []; foreach (etiquetasTablero_() as $e) $idx[$e['id']] = $e['nombre'];
      foreach (explode(',', txt_($cap['etiquetas'])) as $id) if (isset($idx[$id])) $nombres[] = $idx[$id];
    }
    $persona = fn($id) => txt_((buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $id)) ?? [])['nombre'] ?? '');
    $det = [
      'que' => $nueva ? 'nueva ficha' : ($tipo === 'cita' ? 'cambio de la cita' : ($tipo === 'cliente' ? 'datos del cliente' : 'comentario')),
      'cambiado' => is_array($d['_cambiado'] ?? null) ? array_values(array_map('strval', $d['_cambiado'])) : array_values(array_diff(array_keys($d), ['id', 'cliente', '_origen', '_cambiado', 'origen', 'pedir_autorizacion', '_fila', 'creado'])),
      'direccion' => txt_($cli['direccion']), 'municipio' => txt_($cli['municipio']), 'nombre' => txt_($cli['nombre']), 'telefono' => txt_($cli['telefono']),
      'gasto_luz_mes' => txt_($cli['gasto_luz_mes']), 'calefaccion' => txt_($cli['calefaccion']), 'gasto_combustible' => txt_($cli['gasto_combustible']),
      'fecha' => txt_($cap['fecha'] ?? ''), 'hora' => txt_($cap['hora_cita'] ?? ''), 'estado_cita' => txt_($cap['estado_cita'] ?? ''), 'resultado' => txt_($cap['resultado'] ?? ''),
      'tecnologia' => txt_($cap['tecnologia'] ?? ''), 'comercial' => $persona($cap['comercial_id'] ?? ''), 'captador' => $persona($cap['captador_id'] ?? ''),
      'etiquetas' => $nombres, 'notas' => mb_substr(txt_($cap['notas'] ?? ''), 0, 600),
      'comentario' => $tipo === 'comentario' ? mb_substr(txt_($d['nota'] ?? ''), 0, 1000) : '',
    ];
    insertar_('TRELLO_COLA', ['fecha' => ahora_(), 'usuario' => txt_($u['id']), 'captacion_id' => txt_($cap['id'] ?? ''), 'cliente_id' => $cliId,
      'tipo' => $nueva ? 'nueva' : $tipo, 'detalle' => aJson_($det), 'estado' => 'pendiente', 'resultado' => '', 'hecho' => '']);
  } catch (Throwable $e) { /* nunca rompe la petición */ }
}

function exigirColaTrello_(array $u): void {
  if (empty(permisos_($u)['controlsub'])) throw new Exception('Solo para Nando, Fernando y el superadmin.');
}

/** Pendientes de pasar a Trello, del más antiguo al más nuevo (p.todos=1 incluye los hechos de los últimos 7 días). */
function accTrelloPendientes_(array $u, array $p): array {
  exigirColaTrello_($u);
  $desde = date('Y-m-d H:i:s', time() - 7 * 86400);
  $l = array_values(array_filter(leer_('TRELLO_COLA'), fn($x) => txt_($x['estado']) === 'pendiente' || (!empty($p['todos']) && strcmp(txt_($x['fecha']), $desde) >= 0)));
  usort($l, fn($a, $b) => strcmp(txt_($a['fecha']), txt_($b['fecha'])));
  return ['ok' => true, 'cola' => array_map(fn($x) => ['id' => $x['id'], 'fecha' => txt_($x['fecha']), 'usuario' => txt_($x['usuario']), 'tipo' => txt_($x['tipo']),
    'captacion_id' => txt_($x['captacion_id']), 'cliente_id' => txt_($x['cliente_id']), 'estado' => txt_($x['estado']), 'resultado' => txt_($x['resultado']),
    'detalle' => json_decode(txt_($x['detalle']), true) ?: []], $l)];
}

/** p.id, p.estado ('hecho' | 'error'), p.resultado (una línea: qué se hizo en Trello o por qué no). */
function accTrelloMarcar_(array $u, array $p): array {
  exigirColaTrello_($u);
  $x = buscar1_('TRELLO_COLA', fn($y) => mismo_($y['id'], $p['id'] ?? ''));
  if (!$x) return ['ok' => false, 'error' => 'No está en la cola.'];
  $est = normal_($p['estado'] ?? '') === 'error' ? 'error' : 'hecho';
  actualizar_('TRELLO_COLA', $x['id'], ['estado' => $est, 'resultado' => mb_substr(txt_($p['resultado'] ?? ''), 0, 300), 'hecho' => ahora_()]);
  return ['ok' => true];
}
