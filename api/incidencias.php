<?php
/**
 * CRM · ZERO WATTIOS
 * incidencias.php (= 26_Incidencias.gs) — Incidencias para Rubén y dirección (03/11/2026).
 *
 * Orden de Nando: «a Rubén y a la dirección les tiene que saltar en el CRM un
 * listado de incidencias, y un apartado para darle a resueltas cuando se
 * solucionan. Irán ordenadas por urgencia y/o fecha. Un campo al lado para
 * anotar su actualización, o cómo se ha solucionado».
 *
 * - Solo las ve y las toca dirección (alcance «todo»: Rubén, Fernando y el
 *   superadmin). Se filtra en el servidor.
 * - Cada actualización se queda apuntada (quién, cuándo y qué) en «bitacora»;
 *   «actualizacion» guarda la última para verla de un vistazo.
 * - Resolverla pide escribir cómo se ha solucionado. Se puede reabrir.
 * - El agente del Centro de Mando puede volcarlas con origen + origen_id sin
 *   duplicar.
 */

require_once __DIR__ . '/base.php';

const URGENCIAS_INC = ['alta', 'media', 'baja'];
const ESTADOS_INC = ['abierta', 'resuelta'];
const LARGO_BITACORA = 60;

function esDireccionInc_(array $u): bool {
  return (permisos_($u)['alcance'] ?? '') === 'todo';
}

function exigirDireccionInc_(array $u): void {
  if (!esDireccionInc_($u)) throw new Exception('Las incidencias solo las ve dirección.');
}

function bitacoraInc_($v): array {
  if (is_array($v)) return $v;
  $s = txt_($v);
  if ($s === '') return [];
  $j = json_decode($s, true);
  return is_array($j) ? $j : [];
}

function incidenciaPublica_(array $i, array $clientes, array $usuarios): array {
  $cli = $clientes[(string)($i['cliente_id'] ?? '')] ?? [];
  $nom = fn($id) => txt_($usuarios[txt_($id)]['nombre'] ?? '');
  $bit = array_map(fn($b) => [
    'fecha' => txt_($b['fecha'] ?? ''), 'usuario_id' => txt_($b['usuario_id'] ?? ''),
    'quien' => $nom($b['usuario_id'] ?? '') ?: 'Sistema', 'texto' => txt_($b['texto'] ?? ''), 'tipo' => txt_($b['tipo'] ?? 'nota')
  ], bitacoraInc_($i['bitacora'] ?? ''));
  $estado = normal_($i['estado'] ?? '') ?: 'abierta';
  $creado = txt_($i['creado'] ?? '');
  $fin = $estado === 'resuelta' && txt_($i['resuelta'] ?? '') !== '' ? substr(txt_($i['resuelta']), 0, 10) : hoyISO_();
  $desde = substr(txt_($i['fecha'] ?? '') ?: $creado, 0, 10);
  $dias = $desde !== '' ? max(0, (int)floor((strtotime($fin) - strtotime($desde)) / 86400)) : 0;
  return [
    'id' => txt_($i['id'] ?? ''), 'creado' => $creado, 'creado_por' => $nom($i['creado_por'] ?? ''),
    'fecha' => txt_($i['fecha'] ?? '') ?: substr($creado, 0, 10),
    'titulo' => txt_($i['titulo'] ?? ''), 'detalle' => txt_($i['detalle'] ?? ''),
    'cliente_id' => txt_($i['cliente_id'] ?? ''), 'cliente' => txt_($cli['nombre'] ?? ''), 'direccion' => txt_($cli['direccion'] ?? ''),
    'urgencia' => in_array(normal_($i['urgencia'] ?? ''), URGENCIAS_INC, true) ? normal_($i['urgencia']) : 'media',
    'estado' => $estado, 'responsable_id' => txt_($i['responsable_id'] ?? ''), 'responsable' => $nom($i['responsable_id'] ?? ''),
    'actualizacion' => txt_($i['actualizacion'] ?? ''), 'actualizado' => txt_($i['modificado'] ?? ''),
    'solucion' => txt_($i['solucion'] ?? ''), 'resuelta' => txt_($i['resuelta'] ?? ''), 'resuelta_por' => $nom($i['resuelta_por'] ?? ''),
    'origen' => txt_($i['origen'] ?? ''), 'origen_id' => txt_($i['origen_id'] ?? ''),
    'dias' => $dias, 'bitacora' => array_reverse($bit)
  ];
}

/** Abiertas primero; dentro, lo más urgente y, a igual urgencia, lo más antiguo. */
function ordenarIncidencias_(array $lista, string $orden = 'urgencia'): array {
  $peso = ['alta' => 0, 'media' => 1, 'baja' => 2];
  return ordenar_($lista, function ($a, $b) use ($peso, $orden) {
    if ($a['estado'] !== $b['estado']) return $a['estado'] === 'abierta' ? -1 : 1;
    if ($a['estado'] === 'resuelta') return strcmp($b['resuelta'], $a['resuelta']);
    $fa = $a['fecha'] . ' ' . $a['creado']; $fb = $b['fecha'] . ' ' . $b['creado'];
    if ($orden === 'recientes') return strcmp($fb, $fa);
    if ($orden === 'antiguas') return strcmp($fa, $fb);
    $u = ($peso[$a['urgencia']] ?? 1) - ($peso[$b['urgencia']] ?? 1);
    return $u !== 0 ? $u : strcmp($fa, $fb);
  });
}

function accIncidencias_(array $u, array $p): array {
  exigirDireccionInc_($u);
  asegurarHoja_('INCIDENCIAS');
  $clientes = indexar_(leer_('CLIENTES'));
  $usuarios = indexar_(leer_('USUARIOS'));
  $ver = normal_($p['ver'] ?? '') ?: 'abiertas';
  $todas = array_map(fn($i) => incidenciaPublica_($i, $clientes, $usuarios), leer_('INCIDENCIAS'));
  $abiertas = array_values(array_filter($todas, fn($i) => $i['estado'] === 'abierta'));
  $lista = $ver === 'todas' ? $todas : array_values(array_filter($todas, fn($i) => $i['estado'] === ($ver === 'resueltas' ? 'resuelta' : 'abierta')));
  $mes = substr(hoyISO_(), 0, 7);
  return ['ok' => true, 'incidencias' => ordenarIncidencias_($lista, normal_($p['orden'] ?? '') ?: 'urgencia'),
    'cuentas' => [
      'abiertas' => count($abiertas),
      'alta' => count(array_filter($abiertas, fn($i) => $i['urgencia'] === 'alta')),
      'viejas' => count(array_filter($abiertas, fn($i) => $i['dias'] > 7)),
      'resueltas_mes' => count(array_filter($todas, fn($i) => $i['estado'] === 'resuelta' && substr($i['resuelta'], 0, 7) === $mes))
    ],
    'responsables' => array_values(array_map(fn($x) => ['id' => $x['id'], 'nombre' => $x['nombre']],
      array_filter(leer_('USUARIOS'), fn($x) => normal_($x['activo'] ?? 'si') !== 'no' && in_array($x['rol'] ?? '', ['admin', 'superadmin', 'comercial'], true) && txt_($x['nombre'] ?? '') !== 'Superadmin')))];
}

/**
 * Crea o cambia una incidencia. Lo que llega en «nota» se apunta en la
 * bitácora y pasa a ser la última actualización. Con estado «resuelta» hace
 * falta «solucion» (o una nota que la explique).
 */
function accGuardarIncidencia_(array $u, array $p): array {
  exigirDireccionInc_($u);
  asegurarHoja_('INCIDENCIAS');
  $d = is_array($p['incidencia'] ?? null) ? $p['incidencia'] : [];
  $todas = leer_('INCIDENCIAS');
  $actual = null;
  if (txt_($d['id'] ?? '') !== '') {
    foreach ($todas as $i) if (txt_($i['id']) === txt_($d['id'])) { $actual = $i; break; }
    if (!$actual) return ['ok' => false, 'error' => 'Esa incidencia ya no existe.'];
  } elseif (txt_($d['origen'] ?? '') !== '' && txt_($d['origen_id'] ?? '') !== '') {
    foreach ($todas as $i) {
      if (normal_($i['origen'] ?? '') === normal_($d['origen']) && txt_($i['origen_id'] ?? '') === txt_($d['origen_id'])) { $actual = $i; break; }
    }
  }

  $cambios = [];
  foreach (['titulo', 'detalle', 'cliente_id', 'urgencia', 'responsable_id', 'fecha', 'origen', 'origen_id'] as $c) {
    if (array_key_exists($c, $d)) $cambios[$c] = txt_($d[$c]);
  }
  if (isset($cambios['urgencia'])) {
    $cambios['urgencia'] = normal_($cambios['urgencia']);
    if (!in_array($cambios['urgencia'], URGENCIAS_INC, true)) return ['ok' => false, 'error' => 'La urgencia es alta, media o baja.'];
  }
  if (($cambios['cliente_id'] ?? '') !== '' && !buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $cambios['cliente_id']))) {
    return ['ok' => false, 'error' => 'Ese cliente no existe.'];
  }

  $bit = bitacoraInc_($actual['bitacora'] ?? '');
  $nota = trim(txt_($d['nota'] ?? ''));
  $estadoAntes = $actual ? (normal_($actual['estado'] ?? '') ?: 'abierta') : '';
  $estado = array_key_exists('estado', $d) ? normal_($d['estado']) : ($estadoAntes ?: 'abierta');
  if (!in_array($estado, ESTADOS_INC, true)) return ['ok' => false, 'error' => 'El estado es abierta o resuelta.'];

  if ($estado === 'resuelta' && $estadoAntes !== 'resuelta') {
    $sol = trim(txt_($d['solucion'] ?? '')) ?: $nota;
    if ($sol === '') return ['ok' => false, 'error' => 'Escribe cómo se ha solucionado antes de darla por resuelta.'];
    $cambios['estado'] = 'resuelta';
    $cambios['solucion'] = trozo_($sol, 0, 1000);
    $cambios['resuelta'] = ahora_();
    $cambios['resuelta_por'] = $u['id'] ?? '';
    $cambios['actualizacion'] = trozo_('Resuelta: ' . $sol, 0, 1000);
    $bit[] = ['fecha' => ahora_(), 'usuario_id' => $u['id'] ?? '', 'texto' => trozo_($sol, 0, 1000), 'tipo' => 'resuelta'];
  } elseif ($estado === 'abierta' && $estadoAntes === 'resuelta') {
    $cambios['estado'] = 'abierta';
    $cambios['resuelta'] = ''; $cambios['resuelta_por'] = ''; $cambios['solucion'] = '';
    $txt = $nota !== '' ? $nota : 'Reabierta';
    $cambios['actualizacion'] = trozo_($txt, 0, 1000);
    $bit[] = ['fecha' => ahora_(), 'usuario_id' => $u['id'] ?? '', 'texto' => trozo_($txt, 0, 1000), 'tipo' => 'reabierta'];
  } elseif ($nota !== '') {
    $cambios['actualizacion'] = trozo_($nota, 0, 1000);
    $bit[] = ['fecha' => ahora_(), 'usuario_id' => $u['id'] ?? '', 'texto' => trozo_($nota, 0, 1000), 'tipo' => 'nota'];
  }
  if (count($bit) > LARGO_BITACORA) $bit = array_slice($bit, -LARGO_BITACORA);
  $cambios['bitacora'] = json_encode($bit, JSON_UNESCAPED_UNICODE);
  $cambios['modificado'] = ahora_();
  $cambios['modificado_por'] = $u['id'] ?? '';

  if ($actual) {
    $r = actualizar_('INCIDENCIAS', $actual['id'], $cambios);
    registrar_($u, ($cambios['estado'] ?? '') === 'resuelta' ? 'resolver_incidencia' : 'editar_incidencia', 'INCIDENCIAS', $actual['id'],
      trozo_($nota ?: ($cambios['solucion'] ?? ''), 0, 200));
    return ['ok' => true, 'incidencia' => incidenciaPublica_($r ?? array_merge($actual, $cambios), indexar_(leer_('CLIENTES')), indexar_(leer_('USUARIOS')))];
  }

  if (txt_($cambios['titulo'] ?? '') === '') return ['ok' => false, 'error' => 'La incidencia necesita un título.'];
  $cambios['urgencia'] = $cambios['urgencia'] ?? 'media';
  $cambios['estado'] = $cambios['estado'] ?? 'abierta';
  $cambios['fecha'] = ($cambios['fecha'] ?? '') !== '' ? substr($cambios['fecha'], 0, 10) : hoyISO_();
  $cambios['creado'] = ahora_();
  $cambios['creado_por'] = $u['id'] ?? '';
  $nueva = insertar_('INCIDENCIAS', $cambios);
  registrar_($u, 'alta_incidencia', 'INCIDENCIAS', $nueva['id'], trozo_($cambios['titulo'], 0, 200));
  return ['ok' => true, 'incidencia' => incidenciaPublica_($nueva, indexar_(leer_('CLIENTES')), indexar_(leer_('USUARIOS')))];
}

/** Darla por resuelta: id + cómo se ha solucionado. */
function accResolverIncidencia_(array $u, array $p): array {
  return accGuardarIncidencia_($u, ['incidencia' => ['id' => txt_($p['id'] ?? ''), 'estado' => 'resuelta', 'solucion' => txt_($p['solucion'] ?? '')]]);
}
