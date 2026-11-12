<?php
/**
 * visitas.php — «Mis visitas» (12/11/2026, petición de Nando).
 *
 * Una pestaña muy visual para los comerciales: las visitas que tenían en las
 * últimos 30 días, de la más nueva a la más antigua, y en cada una se ve y
 * se marca si hubo sentada, si el proyecto está hecho y si se envió; y se
 * apunta qué ha dicho el cliente (con fecha), cuál es la siguiente acción y
 * el estado de la operación.
 *
 * - La sentada es el resultado de la cita (CAPTACIONES.resultado).
 * - «Proyecto hecho» y «proyecto enviado» salen solos del proyecto del CRM
 *   (entregado / enviado). Si el proyecto se hizo fuera, el comercial lo marca
 *   a mano y queda en la cita (proyecto_creado / proyecto_enviado).
 * - Lo que dice el cliente se guarda como un contacto normal del historial
 *   (SEGUIMIENTO), así sale también en la ficha y mueve la próxima acción.
 * - El estado se guarda en la operación del cliente (sin tocar importes).
 */

/** ¿Puede este usuario ver y tocar esta visita? */
function veVisita_(array $u, array $cap): bool {
  $p = permisos_($u);
  if (($p['alcance'] ?? '') === 'todo') return true;
  if (($u['rol'] ?? '') === 'comercial') return mismo_($cap['comercial_id'] ?? '', $u['id']);
  return false;
}

function visitaDe_(array $u, $id): array {
  $cap = buscar1_('CAPTACIONES', fn($c) => mismo_($c['id'], $id));
  if (!$cap) return ['error' => 'Esa visita ya no existe.'];
  if (!veVisita_($u, $cap)) return ['error' => 'Esa visita no es tuya.'];
  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $cap['cliente_id']));
  if (!$cli) return ['error' => 'La visita no tiene cliente.'];
  return ['cap' => $cap, 'cli' => $cli];
}

/** La operación que manda para un cliente: la última que no esté cancelada. */
function operacionVisita_($clienteId): ?array {
  $ops = filtrar_('OPERACIONES', fn($o) => mismo_($o['cliente_id'], $clienteId));
  if (!$ops) return null;
  usort($ops, fn($a, $b) => strcmp((string)($b['creado'] ?? ''), (string)($a['creado'] ?? '')) ?: strcmp((string)$b['id'], (string)$a['id']));
  foreach ($ops as $o) if (normal_($o['estado'] ?? '') !== 'cancelada') return $o;
  return $ops[0];
}

/** Lo del proyecto que necesita la tarjeta: el PDF vigente, la descripción y las fotos. */
function proyectoVisita_(?array $proy, array $archs): array {
  $pdfs = array_values(array_filter($archs, fn($a) => normal_($a['clase'] ?? '') === 'proyecto'));
  usort($pdfs, fn($a, $b) => strcmp(txt_($b['subido'] ?? ''), txt_($a['subido'] ?? '')));
  $fotos = count(array_filter($archs, fn($a) => normal_($a['clase'] ?? '') === 'foto'));
  return [
    'pdf' => $pdfs ? ['id' => $pdfs[0]['id'], 'nombre' => txt_($pdfs[0]['nombre']), 'subido' => txt_($pdfs[0]['subido'])] : null,
    'descripcion' => $proy ? txt_($proy['descripcion'] ?? '') : '',
    'faltan' => $proy ? txt_($proy['faltan'] ?? '') : '',
    'pedido' => $proy ? txt_($proy['pedido'] ?? '') : '',
    'fotos' => $fotos,
  ];
}

function filaVisita_(array $cap, array $cli, array $proys, array $segs, array $archs = []): array {
  $proy = $proys[(string)$cli['id']] ?? null;
  $estP = $proy ? normal_($proy['estado'] ?? '') : '';
  $res = normal_($cap['resultado'] ?? '');
  $op = operacionVisita_($cli['id']);
  $ult = $segs[(string)$cli['id']] ?? null;
  return [
    'id' => $cap['id'], 'fecha' => txt_($cap['fecha']), 'hora' => txt_($cap['hora_cita']),
    'tecnologia' => txt_($cap['tecnologia']), 'estado_cita' => txt_($cap['estado_cita']),
    'resultado' => $res, 'comercial_id' => txt_($cap['comercial_id']), 'captador_id' => txt_($cap['captador_id']),
    'cliente' => ['id' => $cli['id'], 'nombre' => txt_($cli['nombre']), 'direccion' => txt_($cli['direccion']),
                  'municipio' => txt_($cli['municipio']), 'telefono' => txt_($cli['telefono']), 'estado' => txt_($cli['estado'])],
    /* sentada: true / false (no llegó) / null (sin marcar) */
    'sentada' => in_array($res, ['sentada', 'venta', 'potencial'], true) ? true : (in_array($res, ['no_sentada', 'cancelada'], true) ? false : null),
    'proyecto_estado' => $estP,
    'proyecto_auto' => in_array($estP, ['entregado', 'enviado'], true),
    'proyecto' => in_array($estP, ['entregado', 'enviado'], true) || txt_($cap['proyecto_creado'] ?? '') !== '',
    'enviado_auto' => $estP === 'enviado',
    'proy' => proyectoVisita_($proy, $archs[(string)$cli['id']] ?? []),
    'enviado' => $estP === 'enviado' || txt_($cap['proyecto_enviado'] ?? '') !== '',
    /* venta: marcada a mano en la cita, o la operación ya pasó de firmada/financiación (aprobada o pagando) */
    'venta_auto' => $op !== null && in_array(normal_($op['estado'] ?? ''), ['tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'], true),
    'venta' => txt_($cap['venta_marcada'] ?? '') !== ''
      || ($op !== null && in_array(normal_($op['estado'] ?? ''), ['tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'], true)),
    'operacion' => $op ? ['id' => $op['id'], 'estado' => txt_($op['estado'])] : null,
    'ultimo' => $ult ? ['fecha' => txt_($ult['fecha']), 'nota' => txt_($ult['nota']), 'proximo_paso' => txt_($ult['proximo_paso']),
                        'proxima_fecha' => txt_($ult['proxima_fecha']), 'quien' => txt_($ult['usuario_id'])] : null,
  ];
}

/** Las visitas de los últimos `dias` (30 por defecto), la más nueva primero. */
function accVisitasRecientes_(array $u, array $p): array {
  $per = permisos_($u);
  $direccion = ($per['alcance'] ?? '') === 'todo';
  if (!$direccion && ($u['rol'] ?? '') !== 'comercial') return ['ok' => false, 'error' => 'Esta pestaña es de los comerciales.'];
  $dias = max(1, min(60, (int)($p['dias'] ?? 30)));
  $hoy = hoyISO_();
  $desde = (new DateTime($hoy))->modify('-' . $dias . ' days')->format('Y-m-d');
  $quien = $direccion ? txt_($p['comercial_id'] ?? '') : (string)$u['id'];

  $caps = filtrar_('CAPTACIONES', function ($c) use ($desde, $hoy, $quien) {
    $f = substr(txt_($c['fecha'] ?? ''), 0, 10);
    if ($f === '' || $f < $desde || $f > $hoy) return false;
    if (txt_($c['comercial_id'] ?? '') === '') return false;
    if (normal_($c['estado_cita'] ?? '') === 'recontactar') return false;
    return $quien === '' || mismo_($c['comercial_id'], $quien);
  });
  $caps = array_values(array_filter($caps, fn($c) => veVisita_($u, $c)));
  usort($caps, fn($a, $b) => strcmp(substr(txt_($b['fecha']), 0, 10) . ' ' . txt_($b['hora_cita']), substr(txt_($a['fecha']), 0, 10) . ' ' . txt_($a['hora_cita'])));

  $ids = array_flip(array_map(fn($c) => (string)$c['cliente_id'], $caps));
  $clis = [];
  foreach (filtrar_('CLIENTES', fn($c) => isset($ids[(string)$c['id']])) as $c) $clis[(string)$c['id']] = $c;
  $proys = [];
  foreach (filtrar_('PROYECTOS', fn($x) => isset($ids[(string)$x['cliente_id']])) as $x) $proys[(string)$x['cliente_id']] = $x;
  $archs = [];
  foreach (filtrar_('ARCHIVOS', fn($a) => isset($ids[(string)$a['cliente_id']])) as $a) {
    if (function_exists('veArchivo_') && !veArchivo_($u, $a)) continue;
    $archs[(string)$a['cliente_id']][] = $a;
  }
  $segs = [];
  foreach (filtrar_('SEGUIMIENTO', fn($s) => isset($ids[(string)$s['cliente_id']])) as $s) {
    $k = (string)$s['cliente_id'];
    $clave = txt_($s['fecha']) . ' ' . txt_($s['creado']);
    if (!isset($segs[$k]) || $clave > (txt_($segs[$k]['fecha']) . ' ' . txt_($segs[$k]['creado']))) $segs[$k] = $s;
  }

  $out = [];
  foreach ($caps as $c) {
    $cli = $clis[(string)$c['cliente_id']] ?? null;
    if ($cli) $out[] = filaVisita_($c, $cli, $proys, $segs, $archs);
  }
  return ['ok' => true, 'desde' => $desde, 'hasta' => $hoy, 'visitas' => $out];
}

/** Marca o desmarca sentada / proyecto hecho / proyecto enviado. */
function accVisitaMarcar_(array $u, array $p): array {
  $v = visitaDe_($u, $p['id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $cap = $v['cap']; $cli = $v['cli'];
  $campo = txt_($p['campo'] ?? '');
  $valor = $p['valor'] ?? null;   // true / false / null (sin marcar, solo sentada)

  if ($campo === 'sentada') {
    $res = $valor === true ? 'sentada' : ($valor === false ? 'no_sentada' : 'pendiente');
    actualizar_('CAPTACIONES', $cap['id'], ['resultado' => $res, 'fecha_resultado' => $valor === null ? '' : hoyISO_()]);
    if ($valor === true && in_array(normal_($cli['estado'] ?? ''), ['', 'nuevo', 'captado', 'cita'], true)) {
      actualizar_('CLIENTES', $cli['id'], ['estado' => 'sentada', 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
    }
    registrar_($u, 'visita_sentada', 'CAPTACIONES', $cap['id'], $res);
  } elseif ($campo === 'venta') {
    /* La venta solo cuenta cuando la financiera la aprueba o el cliente paga: va en su propia marca. */
    actualizar_('CAPTACIONES', $cap['id'], ['venta_marcada' => $valor ? ahora_() : '',
      'resultado' => $valor ? 'venta' : (normal_($cap['resultado'] ?? '') === 'venta' ? 'sentada' : txt_($cap['resultado'] ?? '')), 'fecha_resultado' => hoyISO_()]);
    if ($valor && in_array(normal_($cli['estado'] ?? ''), ['', 'nuevo', 'captado', 'cita', 'sentada', 'propuesta'], true)) {
      actualizar_('CLIENTES', $cli['id'], ['estado' => 'ganado', 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
    }
    registrar_($u, 'visita_venta', 'CAPTACIONES', $cap['id'], $valor ? 'venta' : 'no');
  } elseif ($campo === 'proyecto') {
    actualizar_('CAPTACIONES', $cap['id'], ['proyecto_creado' => $valor ? ahora_() : '']);
    registrar_($u, 'visita_proyecto', 'CAPTACIONES', $cap['id'], $valor ? 'hecho' : 'no');
  } elseif ($campo === 'enviado') {
    $proy = buscar1_('PROYECTOS', fn($x) => mismo_($x['cliente_id'], $cli['id']));
    $estP = $proy ? normal_($proy['estado'] ?? '') : '';
    if ($valor && $estP === 'entregado' && function_exists('accEnviadoProyecto_')) {
      /* El proyecto lo hizo el CRM: se marca allí como enviado (y se agenda la llamada de la semana). */
      $r = accEnviadoProyecto_($u, ['cliente_id' => $cli['id']]);
      if (empty($r['ok'])) return $r;
    }
    if (!$valor && $estP === 'enviado' && !empty(permisos_($u)['editarTodo']) && function_exists('accEnviadoProyecto_')) {
      accEnviadoProyecto_($u, ['cliente_id' => $cli['id'], 'deshacer' => true]);
    }
    $cambios = ['proyecto_enviado' => $valor ? ahora_() : ''];
    if ($valor && txt_($cap['proyecto_creado'] ?? '') === '' && !in_array($estP, ['entregado', 'enviado'], true)) $cambios['proyecto_creado'] = ahora_();
    actualizar_('CAPTACIONES', $cap['id'], $cambios);
    if ($valor && in_array(normal_($cli['estado'] ?? ''), ['', 'nuevo', 'captado', 'cita', 'sentada'], true)) {
      actualizar_('CLIENTES', $cli['id'], ['estado' => 'propuesta', 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
    }
    registrar_($u, 'visita_enviado', 'CAPTACIONES', $cap['id'], $valor ? 'enviado' : 'no');
  } else {
    return ['ok' => false, 'error' => 'No sé qué marcar.'];
  }
  return visitaFresca_($u, $cap['id']);
}

/** Lo que ha dicho el cliente, la siguiente acción y el estado de la operación. */
function accVisitaApunte_(array $u, array $p): array {
  $v = visitaDe_($u, $p['id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $cap = $v['cap']; $cli = $v['cli'];
  $nota = trozo_(txt_($p['nota'] ?? ''), 0, 1000);
  $accion = trozo_(txt_($p['siguiente'] ?? ''), 0, 300);
  $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', txt_($p['fecha'] ?? '')) ? txt_($p['fecha']) : hoyISO_();
    $fAcc = preg_match('/^\d{4}-\d{2}-\d{2}$/', txt_($p['siguiente_fecha'] ?? '')) ? txt_($p['siguiente_fecha']) : '';
  $estado = normal_($p['estado'] ?? '');

  if ($nota !== '' || $accion !== '') {
    $r = accGuardarSeguimiento_($u, ['seguimiento' => ['cliente_id' => $cli['id'], 'fecha' => $fecha,
      'canal' => txt_($p['canal'] ?? '') !== '' ? txt_($p['canal']) : 'llamada', 'nota' => $nota,
      'proximo_paso' => $accion, 'proxima_fecha' => $fAcc, 'origen' => 'visitas']]);
    if (empty($r['ok'])) return $r;
  }

  if ($estado !== '') {
    $validos = array_map(fn($x) => $x[0], CATALOGO['estadosOperacion'] ?? []);
    if ($validos && !in_array($estado, $validos, true)) return ['ok' => false, 'error' => 'Ese estado no existe.'];
    $op = operacionVisita_($cli['id']);
    if ($op) {
      if (normal_($op['estado'] ?? '') !== $estado) {
        /* Solo el estado: los importes no se tocan. */
        $r = actualizar_('OPERACIONES', $op['id'], ['estado' => $estado, 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
        if (function_exists('sincronizarEstadoCliente_')) sincronizarEstadoCliente_($u, $r);
        registrar_($u, 'editar_operacion', 'OPERACIONES', $op['id'], $estado);
      }
    } else {
      $tec = normal_($cap['tecnologia'] ?? '');
      $tipo = strpos($tec, 'aero') !== false && strpos($tec, 'foto') !== false ? 'fv_aero' : (strpos($tec, 'aero') !== false ? 'aero' : (strpos($tec, 'foto') !== false ? 'fv' : ''));
      $r = accGuardarOperacion_($u, ['operacion' => ['cliente_id' => $cli['id'], 'estado' => $estado, 'tipo' => $tipo]]);
      if (empty($r['ok'])) return $r;
      if (txt_($cap['operacion_id'] ?? '') === '') actualizar_('CAPTACIONES', $cap['id'], ['operacion_id' => $r['operacion']['id']]);
    }
  }
  return visitaFresca_($u, $cap['id']);
}

/**
 * Pedir el proyecto al ingeniero desde la visita: se guarda la descripción
 * en la carpeta del cliente y, con al menos una foto (la regla de la casa),
 * el proyecto entra solo en la cola y le llega el aviso al ingeniero.
 * Las fotos se suben antes con subirArchivo, como en la ficha.
 */
function accVisitaProyecto_(array $u, array $p): array {
  $v = visitaDe_($u, $p['id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $desc = trozo_(txt_($p['descripcion'] ?? ''), 0, 4000);
  if ($desc === '') return ['ok' => false, 'error' => 'Describe el proyecto para que el ingeniero sepa qué hacer.'];
  $r = accGuardarProyecto_($u, ['cliente_id' => $v['cli']['id'], 'descripcion' => $desc]);
  if (empty($r['ok'])) return $r;
  $f = visitaFresca_($u, $v['cap']['id']);
  $f['pedido'] = in_array(normal_($r['proyecto']['estado'] ?? ''), ['pedido', 'en_curso', 'entregado', 'enviado'], true);
  return $f;
}

function visitaFresca_(array $u, $id): array {
  $v = visitaDe_($u, $id);
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $proys = []; $segs = [];
  $pr = buscar1_('PROYECTOS', fn($x) => mismo_($x['cliente_id'], $v['cli']['id']));
  if ($pr) $proys[(string)$v['cli']['id']] = $pr;
  $ss = filtrar_('SEGUIMIENTO', fn($s) => mismo_($s['cliente_id'], $v['cli']['id']));
  usort($ss, fn($a, $b) => strcmp(txt_($b['fecha']) . ' ' . txt_($b['creado']), txt_($a['fecha']) . ' ' . txt_($a['creado'])));
  if ($ss) $segs[(string)$v['cli']['id']] = $ss[0];
  $archs = [(string)$v['cli']['id'] => array_values(array_filter(filtrar_('ARCHIVOS', fn($a) => mismo_($a['cliente_id'], $v['cli']['id'])),
    fn($a) => !function_exists('veArchivo_') || veArchivo_($u, $a)))];
  return ['ok' => true, 'visita' => filaVisita_($v['cap'], $v['cli'], $proys, $segs, $archs)];
}
