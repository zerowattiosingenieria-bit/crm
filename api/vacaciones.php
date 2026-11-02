<?php
/**
 * vacaciones.php (= 11_Vacaciones.gs) — Calendario de vacaciones.
 *
 * Cada persona pide sus días; solo dirección (Rubén y Fernando, o el
 * superadmin) los aprueba o los deniega. Hasta que no están aprobados, no
 * cuentan como disfrutados. Al aprobarse, esos días quedan marcados como
 * vacaciones en el calendario de nóminas.
 */

require_once __DIR__ . '/base.php';

function diasVacacionesAnio_() { return configNum_('dias_vacaciones', 22); }

function festivos_(): array {
  $c = config_();
  $partes = preg_split('/[,\s;]+/u', txt_($c['festivos'] ?? ''));
  $partes = array_map(fn($x) => txt_($x), $partes);
  return array_values(array_filter($partes, fn($x) => preg_match('/^\d{4}-\d{2}-\d{2}$/', $x) === 1));
}

/** Días laborables entre dos fechas, quitando fines de semana y festivos. */
function laborablesEntre_($desde, $hasta): array {
  $fiestas = festivos_();
  $dias = 0; $cursor = txt_($desde); $guardia = 0;
  $hasta = txt_($hasta);
  $lista = [];
  while (strcmp($cursor, $hasta) <= 0 && $guardia++ < 400) {
    $d = fecha_($cursor);
    if (!$d) break; // NOTA PORT: con una fecha ilegible el original fallaba; aquí se corta el bucle.
    $diaSem = (int)$d->format('w');
    $finde = $diaSem === 0 || $diaSem === 6;
    if (!$finde && !in_array($cursor, $fiestas, true)) { $dias++; $lista[] = $cursor; }
    $cursor = sumarDias_($cursor, 1);
  }
  return ['dias' => $dias, 'fechas' => $lista];
}

/** Lo que ve cada uno: sus vacaciones; dirección, las de todo el equipo. */
function accVacaciones_(array $u, array $p): array {
  $per = permisos_($u);
  $anio = txt_($p['anio'] ?? '') ?: substr(hoyISO_(), 0, 4);
  $todas = filtrar_('VACACIONES', fn($v) => txt_($v['anio']) === $anio);
  if (empty($per['nominasAjenas'])) {
    $todas = array_values(array_filter($todas, fn($v) => mismo_($v['usuario_id'], $u['id'])));
  } elseif (txt_($p['usuario_id'] ?? '') !== '') {
    $todas = array_values(array_filter($todas, fn($v) => mismo_($v['usuario_id'], $p['usuario_id'])));
  }
  $todas = ordenar_($todas, fn($a, $b) => comparar_($a['desde'], $b['desde']));

  /* Saldo de cada persona visible. */
  $gente = !empty($per['nominasAjenas'])
    ? filtrar_('USUARIOS', fn($x) => normal_($x['activo']) === 'si')
    : [$u];
  $hoy = hoyISO_();
  $saldos = array_map(function ($g) use ($anio, $hoy) {
    $suyas = filtrar_('VACACIONES', fn($v) => mismo_($v['usuario_id'], $g['id']) && txt_($v['anio']) === $anio);
    $aprobadas = array_values(array_filter($suyas, fn($v) => normal_($v['estado']) === 'aprobada'));
    $pendientes = array_values(array_filter($suyas, fn($v) => normal_($v['estado']) === 'solicitada'));
    $disfrutados = 0;
    foreach ($aprobadas as $v) if (strcmp(txt_($v['hasta']), $hoy) < 0) $disfrutados += num_($v['dias']);
    $aprobados = 0;
    foreach ($aprobadas as $v) $aprobados += num_($v['dias']);
    $pend = 0;
    foreach ($pendientes as $v) $pend += num_($v['dias']);
    return [
      'usuario_id' => $g['id'], 'nombre' => $g['nombre'] ?? '', 'rol' => $g['rol'] ?? '',
      'derecho' => diasVacacionesAnio_(),
      'aprobados' => $aprobados,
      'disfrutados' => $disfrutados,
      'pendientes' => $pend,
      'restantes' => diasVacacionesAnio_() - $aprobados
    ];
  }, $gente);

  return ['ok' => true, 'anio' => $anio, 'vacaciones' => $todas, 'saldos' => array_values($saldos),
          'festivos' => festivos_(), 'derecho' => diasVacacionesAnio_(),
          'puede_aprobar' => !empty($per['nominasAjenas'])];
}

/** Pedir días. Cualquiera puede pedir los suyos. */
function accSolicitarVacaciones_(array $u, array $p): array {
  $desde = txt_($p['desde'] ?? ''); $hasta = txt_($p['hasta'] ?? '') ?: txt_($p['desde'] ?? '');
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $hasta)) {
    return ['ok' => false, 'error' => 'Faltan las fechas.'];
  }
  if (strcmp($hasta, $desde) < 0) return ['ok' => false, 'error' => 'La fecha de vuelta es anterior a la de salida.'];

  /* Dirección puede pedir en nombre de alguien; el resto, solo para sí. */
  $objetivoId = (!empty(permisos_($u)['nominasAjenas']) && txt_($p['usuario_id'] ?? '') !== '') ? txt_($p['usuario_id']) : $u['id'];
  $anio = substr($desde, 0, 4);
  $cuenta = laborablesEntre_($desde, $hasta);
  if (!$cuenta['dias']) return ['ok' => false, 'error' => 'Ese periodo no tiene ningún día laborable.'];

  /* Que no se pisen dos peticiones de la misma persona. */
  $suyas = filtrar_('VACACIONES', fn($v) => mismo_($v['usuario_id'], $objetivoId) &&
           in_array(normal_($v['estado']), ['solicitada', 'aprobada'], true));
  $pisa = false;
  foreach ($suyas as $v) {
    if (!(strcmp(txt_($v['hasta']), $desde) < 0 || strcmp(txt_($v['desde']), $hasta) > 0)) { $pisa = true; break; }
  }
  if ($pisa) return ['ok' => false, 'error' => 'Ya tienes días pedidos o aprobados en esas fechas.'];

  /* Que no se pasen del derecho anual. */
  $gastados = 0;
  foreach ($suyas as $v) if (txt_($v['anio']) === $anio) $gastados += num_($v['dias']);
  $derecho = diasVacacionesAnio_();
  if ($gastados + $cuenta['dias'] > $derecho) {
    return ['ok' => false, 'error' => 'Te quedan ' . ($derecho - $gastados) . ' día(s) de los ' . $derecho .
      ' del año y estás pidiendo ' . $cuenta['dias'] . '.'];
  }

  $r = insertar_('VACACIONES', [
    'usuario_id' => $objetivoId, 'anio' => $anio, 'desde' => $desde, 'hasta' => $hasta, 'dias' => $cuenta['dias'],
    'tipo' => txt_($p['tipo'] ?? '') ?: 'vacaciones', 'estado' => 'solicitada', 'nota' => txt_($p['nota'] ?? ''),
    'solicitada' => ahora_(), 'resuelta_por' => '', 'resuelta_fecha' => '', 'respuesta' => ''
  ]);
  registrar_($u, 'solicitar_vacaciones', 'VACACIONES', $r['id'], $desde . ' a ' . $hasta);
  return ['ok' => true, 'vacaciones' => $r];
}

/** Aprobar o denegar. Solo dirección. */
function accResolverVacaciones_(array $u, array $p): array {
  exigir_($u, 'nominasAjenas');
  $estado = normal_($p['estado'] ?? '');
  if (!in_array($estado, ['aprobada', 'denegada'], true)) return ['ok' => false, 'error' => 'Estado no válido.'];
  $v = buscar1_('VACACIONES', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$v) return ['ok' => false, 'error' => 'Esa solicitud ya no existe.'];

  $r = actualizar_('VACACIONES', $v['id'], [
    'estado' => $estado, 'resuelta_por' => $u['id'], 'resuelta_fecha' => ahora_(), 'respuesta' => txt_($p['respuesta'] ?? '')
  ]);

  /* Al aprobar, los días quedan marcados en el calendario de la persona. */
  if ($estado === 'aprobada') marcarJornadas_($v, 'vacaciones');
  else limpiarJornadas_($v);

  registrar_($u, $estado === 'aprobada' ? 'aprobar_vacaciones' : 'denegar_vacaciones',
    'VACACIONES', $v['id'], txt_($v['desde']) . ' a ' . txt_($v['hasta']));
  return ['ok' => true, 'vacaciones' => $r];
}

/** Cancelar: la persona puede retirar lo suyo; dirección, cualquier cosa. */
function accCancelarVacaciones_(array $u, array $p): array {
  $v = buscar1_('VACACIONES', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$v) return ['ok' => false, 'error' => 'Esa solicitud ya no existe.'];
  if (!mismo_($v['usuario_id'], $u['id']) && empty(permisos_($u)['nominasAjenas'])) {
    return ['ok' => false, 'error' => 'Esa solicitud no es tuya.'];
  }
  $r = actualizar_('VACACIONES', $v['id'], ['estado' => 'cancelada', 'resuelta_por' => $u['id'],
    'resuelta_fecha' => ahora_()]);
  limpiarJornadas_($v);
  registrar_($u, 'cancelar_vacaciones', 'VACACIONES', $v['id'], txt_($v['desde']));
  return ['ok' => true, 'vacaciones' => $r];
}

function marcarJornadas_(array $v, string $tipo): void {
  $dias = laborablesEntre_(txt_($v['desde']), txt_($v['hasta']))['fechas'];
  $ya = filtrar_('JORNADAS', fn($j) => mismo_($j['usuario_id'], $v['usuario_id']));
  foreach ($dias as $f) {
    $existente = null;
    foreach ($ya as $j) if (txt_($j['fecha']) === $f) { $existente = $j; break; }
    $datos = ['usuario_id' => $v['usuario_id'], 'fecha' => $f, 'tipo' => $tipo, 'horas' => 0, 'dietas' => 0,
      'comisiones' => 0, 'concepto' => 'Vacaciones aprobadas', 'notas' => txt_($v['id'])];
    if ($existente) actualizar_('JORNADAS', $existente['id'], $datos);
    else insertar_('JORNADAS', $datos);
  }
}

function limpiarJornadas_(array $v): void {
  $dias = laborablesEntre_(txt_($v['desde']), txt_($v['hasta']))['fechas'];
  $quitar = filtrar_('JORNADAS', fn($j) => mismo_($j['usuario_id'], $v['usuario_id']) && in_array(txt_($j['fecha']), $dias, true) &&
           txt_($j['notas']) === txt_($v['id']));
  foreach ($quitar as $j) borrar_('JORNADAS', $j['id']);
}
