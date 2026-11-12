<?php
/**
 * nominas.php (= 08_Nominas.gs) — Nómina de cada persona, con desglose por días y fechas.
 *
 * Cada uno ve la suya; superadmin y administradores ven las de todos.
 * La nómina se compone de sueldo bruto, dietas y comisiones devengadas
 * en el periodo (del 16 al 15, que es como se computan los objetivos),
 * y se abona a final de mes.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

/* La hoja convertía «2026-04» en una fecha (1/4/2026). Aquí el mes vuelve
   siempre a «aaaa-mm», venga como venga. */
function periodoNomina_($v): string {
  if ($v instanceof DateTimeInterface) return formatearFecha_($v, 'yyyy-MM');
  $t = txt_($v);
  return preg_match('/^(\d{4})-(\d{2})/', $t, $m) ? $m[1] . '-' . $m[2] : $t;
}

/**
 * Hasta qué día están ya pagadas las comisiones (12/11/2026, Nando: «todo lo
 * anterior a este periodo indicar que ya está comisionado», para captadores,
 * comerciales y cualquier miembro). Solo es una marca: no cambia importes ni
 * reglas de comisión. Se mueve en configuración: comisiones_pagadas_hasta.
 */
function comisionesPagadasHasta_(): string {
  $f = txt_(config_()['comisiones_pagadas_hasta'] ?? '');
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $f) ? $f : '2026-10-15';
}

function accNominas_(array $u, array $p): array {
  $per = permisos_($u);
  $objetivoId = txt_($p['usuario_id'] ?? '') ?: $u['id'];
  if (!mismo_($objetivoId, $u['id']) && empty($per['nominasAjenas'])) {
    return ['ok' => false, 'error' => 'Solo puedes ver tu propia nómina.'];
  }
  $nominas = array_values(array_filter(leer_('NOMINAS'), fn($n) => mismo_($n['usuario_id'], $objetivoId)));
  $hastaPag = comisionesPagadasHasta_();
  /* La nómina de un mes lleva las comisiones del 16 del anterior al 15 de ese mes. */
  $nominas = array_map(function ($n) use ($hastaPag) { $n['periodo'] = periodoNomina_($n['periodo']);
    $n['comisionado'] = preg_match('/^\d{4}-\d{2}$/', $n['periodo']) && strcmp($n['periodo'] . '-15', $hastaPag) <= 0; return $n; }, $nominas);
  $nominas = ordenar_($nominas, fn($a, $b) => comparar_($b['periodo'], $a['periodo']));
  $persona = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $objetivoId));
  return ['ok' => true, 'nominas' => $nominas, 'persona' => $persona ? publicoConNomina_($persona) : null, 'comisionado_hasta' => $hastaPag];
}

/**
 * Desglose día a día entre dos fechas: qué se devenga cada jornada,
 * qué dietas corresponden, qué comisiones han caído y qué hizo ese día.
 */
function accNominaDias_(array $u, array $p): array {
  $per = permisos_($u);
  $objetivoId = txt_($p['usuario_id'] ?? '') ?: $u['id'];
  if (!mismo_($objetivoId, $u['id']) && empty($per['nominasAjenas'])) {
    return ['ok' => false, 'error' => 'Solo puedes ver tu propio desglose.'];
  }
  $persona = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $objetivoId));
  if (!$persona) return ['ok' => false, 'error' => 'No existe esa persona.'];

  $hasta = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $desde = txt_($p['desde'] ?? '') ?: (trozo_($hasta, 0, 8) . '01');

  $bruto = num_($persona['salario_bruto']);
  $dietasMes = num_($persona['dietas_mes']);
  $jornadaH = num_($persona['jornada_horas']) ?: 7.5;

  $jornadas = indexar_(filtrar_('JORNADAS', fn($j) => mismo_($j['usuario_id'], $objetivoId)), 'fecha');

  $partes = indexar_(filtrar_('PARTES', fn($x) => mismo_($x['usuario_id'], $objetivoId)), 'fecha');

  $operaciones = filtrar_('OPERACIONES', fn($o) => mismo_($o['comercial_id'], $objetivoId) && esGanada_($o));
  $captaciones = filtrar_('CAPTACIONES', fn($c) => mismo_($c['captador_id'], $objetivoId) && normal_($c['resultado']) === 'venta');

  $cfg = config_();
  $cFV = num_($persona['comision_fv']) ?: num_($cfg['comision_fv'] ?? '');
  $cAero = num_($persona['comision_aero']) ?: num_($cfg['comision_aero'] ?? '');
  $cCap = num_($cfg['comision_captacion'] ?? '');

  $comisionDia = [];
  foreach ($operaciones as $o) {
    $f = txt_($o['fecha_firma']) ?: txt_($o['creado']);
    $t = normal_($o['tipo']);
    $c = 0;
    if ($t === 'fv' || $t === 'fv_aero') $c += $cFV;
    if ($t === 'aero' || $t === 'fv_aero') $c += $cAero;
    if (!$c) continue;
    if (!isset($comisionDia[$f])) $comisionDia[$f] = ['importe' => 0, 'conceptos' => []];
    $comisionDia[$f]['importe'] += $c;
    $comisionDia[$f]['conceptos'][] = (txt_($o['referencia']) !== '' ? $o['referencia'] : $o['id']) . ' · ' . $c . ' €';
  }
  foreach ($captaciones as $c) {
    $f = txt_($c['fecha_resultado']) ?: txt_($c['fecha']);
    if (!isset($comisionDia[$f])) $comisionDia[$f] = ['importe' => 0, 'conceptos' => []];
    $comisionDia[$f]['importe'] += $cCap;
    $comisionDia[$f]['conceptos'][] = 'Captación ' . $c['id'] . ' · ' . $cCap . ' €';
  }

  /* Días laborables del mes de referencia, para prorratear. */
  $dias = [];
  $cursor = $desde;
  $guardia = 0;
  $totales = ['devengo' => 0, 'dietas' => 0, 'comisiones' => 0, 'horas' => 0, 'laborables' => 0,
              'sentadas' => 0, 'puertas' => 0, 'fichas' => 0, 'ventas' => 0];
  $nombresDia = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  while (strcmp($cursor, $hasta) <= 0 && $guardia++ < 400) {
    $d = fecha_($cursor);
    if (!$d) break; // NOTA PORT: con una fecha ilegible el original fallaba; aquí se corta el bucle.
    $diaSem = (int)$d->format('w');
    $finde = $diaSem === 0 || $diaSem === 6;
    $j = $jornadas[$cursor] ?? null;
    $tipo = $j ? txt_($j['tipo']) : ($finde ? 'libre' : 'trabajado');
    $laborable = $tipo === 'trabajado';
    $labMes = diasLaborables_(trozo_($cursor, 0, 7));
    $devengo = $laborable ? redondear_($bruto / $labMes, 2) : 0;
    $dieta = $laborable ? redondear_($dietasMes / $labMes, 2) : 0;
    $com = isset($comisionDia[$cursor]) ? redondear_($comisionDia[$cursor]['importe'], 2) : 0;
    $parte = $partes[$cursor] ?? null;

    $dias[] = [
      'fecha' => $cursor,
      'dia_semana' => $nombresDia[$diaSem],
      'tipo' => $tipo, 'horas' => $laborable ? ($j ? (num_($j['horas']) ?: $jornadaH) : $jornadaH) : 0,
      'devengo' => $devengo, 'dietas' => $dieta, 'comisiones' => $com,
      'concepto_comision' => isset($comisionDia[$cursor]) ? implode(' · ', $comisionDia[$cursor]['conceptos']) : '',
      'comisionado' => $com > 0 && strcmp($cursor, comisionesPagadasHasta_()) <= 0,
      'total_dia' => redondear_($devengo + $dieta + $com, 2),
      'sentadas' => $parte ? num_($parte['sentadas']) : 0,
      'puertas' => $parte ? num_($parte['puertas']) : 0,
      'fichas' => $parte ? num_($parte['fichas']) : 0,
      'ventas' => $parte ? num_($parte['ventas']) : 0,
      'parte' => $parte ? trozo_($parte['resumen'], 0, 180) : '',
      'notas' => $j ? txt_($j['notas']) : ''
    ];

    $totales['devengo'] += $devengo; $totales['dietas'] += $dieta; $totales['comisiones'] += $com;
    $totales['horas'] += $laborable ? $jornadaH : 0;
    $totales['laborables'] += $laborable ? 1 : 0;
    if ($parte) {
      $totales['sentadas'] += num_($parte['sentadas']);
      $totales['puertas'] += num_($parte['puertas']);
      $totales['fichas'] += num_($parte['fichas']);
      $totales['ventas'] += num_($parte['ventas']);
    }
    $cursor = sumarDias_($cursor, 1);
  }

  foreach (array_keys($totales) as $k) $totales[$k] = redondear_($totales[$k], 2);
  $totales['comisiones_comisionadas'] = redondear_(array_sum(array_map(fn($d) => !empty($d['comisionado']) ? $d['comisiones'] : 0, $dias)), 2);
  $totales['comisiones_pendientes'] = redondear_($totales['comisiones'] - $totales['comisiones_comisionadas'], 2);
  $totales['bruto_periodo'] = redondear_($totales['devengo'] + $totales['dietas'] + $totales['comisiones'], 2);
  $irpf = redondear_($totales['bruto_periodo'] * num_($persona['irpf_pct']) / 100, 2);
  $ss = redondear_($totales['devengo'] * num_($persona['ss_pct']) / 100, 2);
  $totales['irpf'] = $irpf; $totales['ss'] = $ss;
  $totales['neto_periodo'] = redondear_($totales['bruto_periodo'] - $irpf - $ss, 2);

  return ['ok' => true, 'persona' => publicoConNomina_($persona), 'desde' => $desde, 'hasta' => $hasta,
          'dias' => $dias, 'totales' => $totales, 'comisionado_hasta' => comisionesPagadasHasta_()];
}

function diasLaborables_($mesISO): int {
  $anio = (int)substr((string)$mesISO, 0, 4); $mes = (int)substr((string)$mesISO, 5, 2);
  $primero = (new DateTime('now', tz_()))->setDate($anio, $mes, 1)->setTime(0, 0, 0);
  $ultimo = (int)$primero->format('t');
  $n = 0;
  for ($d = 1; $d <= $ultimo; $d++) {
    $dia = (int)(clone $primero)->setDate($anio, $mes, $d)->format('w');
    if ($dia !== 0 && $dia !== 6) $n++;
  }
  return $n ?: 21;
}

/** Genera (o rehace) la nómina de un periodo. Solo administradores. */
function accGenerarNomina_(array $u, array $p): array {
  exigir_($u, 'nominasAjenas');
  $objetivoId = txt_($p['usuario_id'] ?? '');
  $periodo = txt_($p['periodo'] ?? '') ?: mesDe_(hoyISO_());
  $persona = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $objetivoId));
  if (!$persona) return ['ok' => false, 'error' => 'No existe esa persona.'];

  /* Comisiones del 16 del mes anterior al 15 del mes de la nómina. */
  $anio = (int)substr($periodo, 0, 4); $mes = (int)substr($periodo, 5, 2);
  /* new Date(anio, mes-2, 16) y new Date(anio, mes-1, 15): setDate normaliza el mes 0 a diciembre del año anterior. */
  $iniC = (new DateTime('now', tz_()))->setDate($anio, $mes - 1, 16)->setTime(0, 0, 0);
  $finC = (new DateTime('now', tz_()))->setDate($anio, $mes, 15)->setTime(0, 0, 0);
  $desdeC = formatearFecha_($iniC, 'yyyy-MM-dd');
  $hastaC = formatearFecha_($finC, 'yyyy-MM-dd');

  /* Las mismas reglas que el resumen: ventas, captaciones y equipo. */
  $com = comisionesPeriodo_($persona, $desdeC, $hastaC);

  $bruto = num_($persona['salario_bruto']);
  $dietas = num_($persona['dietas_mes']);
  $otros = num_($p['otros'] ?? '');
  $brutoTotal = redondear_($bruto + $dietas + num_($com['total'] ?? 0) + $otros, 2);
  $irpfPct = num_($persona['irpf_pct']); $ssPct = num_($persona['ss_pct']);
  $irpf = redondear_($brutoTotal * $irpfPct / 100, 2);
  $ss = redondear_($bruto * $ssPct / 100, 2);
  $neto = redondear_($brutoTotal - $irpf - $ss, 2);

  $detalle = ['comisiones' => $com['detalle'] ?? [], 'periodo_comisiones' => ['desde' => $desdeC, 'hasta' => $hastaC]];
  $existente = buscar1_('NOMINAS', fn($n) => mismo_($n['usuario_id'], $objetivoId) && txt_($n['periodo']) === $periodo);

  $datos = ['usuario_id' => $objetivoId, 'periodo' => $periodo, 'bruto' => $bruto, 'dietas' => $dietas,
    'comisiones' => $com['total'] ?? 0, 'otros' => $otros, 'bruto_total' => $brutoTotal, 'irpf_pct' => $irpfPct, 'irpf' => $irpf,
    'ss_pct' => $ssPct, 'ss' => $ss, 'neto' => $neto, 'estado' => $existente ? $existente['estado'] : 'pendiente',
    'fecha_pago' => $existente ? $existente['fecha_pago'] : '', 'url' => $existente ? $existente['url'] : '',
    'detalle' => aJson_($detalle), 'notas' => txt_($p['notas'] ?? '')];

  $r = $existente ? actualizar_('NOMINAS', $existente['id'], $datos)
                  : insertar_('NOMINAS', unir_(['creado' => ahora_()], $datos));
  registrar_($u, 'nomina', 'NOMINAS', $r['id'] ?? '', $persona['usuario'] . ' ' . $periodo);
  return ['ok' => true, 'nomina' => $r];
}

function accGuardarNomina_(array $u, array $p): array {
  exigir_($u, 'nominasAjenas');
  $d = is_array($p['nomina'] ?? null) ? $p['nomina'] : [];
  if (!empty($d['exacto'])) return guardarNominaExacta_($u, $d);
  $campos = ['estado', 'fecha_pago', 'url', 'notas', 'otros', 'bruto', 'dietas', 'comisiones',
             'irpf_pct', 'ss_pct'];
  $cambios = [];
  foreach ($campos as $c) if (array_key_exists($c, $d)) $cambios[$c] = $d[$c];
  if (array_key_exists('bruto', $cambios) || array_key_exists('otros', $cambios) || array_key_exists('comisiones', $cambios)) {
    $actual = buscar1_('NOMINAS', fn($n) => mismo_($n['id'], $d['id'] ?? '')) ?? [];
    $bruto = num_(array_key_exists('bruto', $cambios) ? $cambios['bruto'] : ($actual['bruto'] ?? ''));
    $dietas = num_(array_key_exists('dietas', $cambios) ? $cambios['dietas'] : ($actual['dietas'] ?? ''));
    $com = num_(array_key_exists('comisiones', $cambios) ? $cambios['comisiones'] : ($actual['comisiones'] ?? ''));
    $otros = num_(array_key_exists('otros', $cambios) ? $cambios['otros'] : ($actual['otros'] ?? ''));
    $bt = redondear_($bruto + $dietas + $com + $otros, 2);
    $irpf = redondear_($bt * num_(array_key_exists('irpf_pct', $cambios) ? $cambios['irpf_pct'] : ($actual['irpf_pct'] ?? '')) / 100, 2);
    $ss = redondear_($bruto * num_(array_key_exists('ss_pct', $cambios) ? $cambios['ss_pct'] : ($actual['ss_pct'] ?? '')) / 100, 2);
    $cambios['bruto_total'] = $bt; $cambios['irpf'] = $irpf; $cambios['ss'] = $ss;
    $cambios['neto'] = redondear_($bt - $irpf - $ss, 2);
  }
  $r = actualizar_('NOMINAS', $d['id'] ?? '', $cambios);
  registrar_($u, 'editar_nomina', 'NOMINAS', $d['id'] ?? '', (txt_($cambios['estado'] ?? '') !== '' ? $cambios['estado'] : ''));
  return ['ok' => true, 'nomina' => $r];
}

/*
 * Las cifras tal cual vienen en la nómina de la gestoría: no se recalcula
 * nada. «detalle» guarda en JSON lo que no tiene columna propia (días,
 * base de IRPF, especie, embargo, Seguridad Social de la empresa y coste
 * para la empresa).
 */
function guardarNominaExacta_(array $u, array $d): array {
  $n = buscar1_('NOMINAS', fn($x) => mismo_($x['id'], $d['id'] ?? ''));
  if (!$n) return ['ok' => false, 'error' => 'No existe esa nómina.'];
  $cambios = [];
  foreach (['bruto', 'dietas', 'comisiones', 'otros', 'bruto_total', 'irpf_pct', 'irpf', 'ss_pct', 'ss', 'neto'] as $c) {
    if (array_key_exists($c, $d) && txt_($d[$c]) !== '') $cambios[$c] = redondear_(num_($d[$c]), 2);
  }
  foreach (['estado', 'fecha_pago', 'notas'] as $c) if (array_key_exists($c, $d)) $cambios[$c] = trozo_($d[$c], 0, 300);
  if (array_key_exists('detalle', $d)) {
    $cambios['detalle'] = trozo_(is_string($d['detalle']) ? $d['detalle'] : aJson_($d['detalle']), 0, 3000);
  }
  $r = actualizar_('NOMINAS', $n['id'], $cambios);
  registrar_($u, 'editar_nomina', 'NOMINAS', $n['id'], 'cifras de la nómina ' . periodoNomina_($n['periodo']));
  if ($r) $r['periodo'] = periodoNomina_($r['periodo']);
  return ['ok' => true, 'nomina' => $r];
}

/** Vacaciones, bajas y festivos: quien los apunta es quien manda. */
function accGuardarJornada_(array $u, array $p): array {
  $d = is_array($p['jornada'] ?? null) ? $p['jornada'] : [];
  $objetivoId = txt_($d['usuario_id'] ?? '') ?: $u['id'];
  if (!mismo_($objetivoId, $u['id']) && empty(permisos_($u)['nominasAjenas'])) {
    return ['ok' => false, 'error' => 'No puedes tocar el calendario de otra persona.'];
  }
  $existente = buscar1_('JORNADAS', fn($j) => mismo_($j['usuario_id'], $objetivoId) && txt_($j['fecha']) === txt_($d['fecha'] ?? ''));
  $datos = ['usuario_id' => $objetivoId, 'fecha' => txt_($d['fecha'] ?? ''), 'tipo' => txt_($d['tipo'] ?? '') ?: 'trabajado',
    'horas' => num_($d['horas'] ?? ''), 'dietas' => num_($d['dietas'] ?? ''), 'comisiones' => num_($d['comisiones'] ?? ''),
    'concepto' => txt_($d['concepto'] ?? ''), 'notas' => txt_($d['notas'] ?? '')];
  $r = $existente ? actualizar_('JORNADAS', $existente['id'], $datos) : insertar_('JORNADAS', $datos);
  return ['ok' => true, 'jornada' => $r];
}

/* ================= la nómina en PDF ================= */
/*
 * Rubén y Fernando suben cada mes el PDF de la nómina de cada persona.
 * El archivo se guarda en una carpeta del Drive de la empresa y NO se
 * comparte con nadie: para verlo hay que pedirlo por aquí, y el servidor
 * solo lo entrega a su dueño o a dirección.
 */

/** Id de la carpeta de nóminas en Drive (se busca por propiedad, por nombre, o se crea). */
function carpetaNominas_(): string {
  return carpetaDeLaCasa_('ID_CARPETA_NOMINAS', 'NÓMINAS · CRM ZERO WATTIOS');
}

/** Sube (o reemplaza) el PDF de la nómina de una persona en un mes. */
function accSubirNomina_(array $u, array $p): array {
  exigir_($u, 'nominasAjenas');
  $objetivoId = txt_($p['usuario_id'] ?? '');
  $periodo = txt_($p['periodo'] ?? '');
  $datos = txt_($p['datos'] ?? '');
  if ($objetivoId === '' || !preg_match('/^\d{4}-\d{2}$/', $periodo)) {
    return ['ok' => false, 'error' => 'Falta la persona o el periodo (aaaa-mm).'];
  }
  if ($datos === '') return ['ok' => false, 'error' => 'No ha llegado el archivo.'];

  $persona = buscar1_('USUARIOS', fn($x) => mismo_($x['id'], $objetivoId));
  if (!$persona) return ['ok' => false, 'error' => 'No existe esa persona.'];

  $tipo = txt_($p['tipo'] ?? '') ?: 'application/pdf';
  $nombre = 'Nomina_' . preg_replace('/\s+/u', '_', normal_($persona['usuario'])) . '_' . $periodo . '.pdf';
  $archivo = driveSubir_(carpetaNominas_(), $nombre, $datos, $tipo);

  $existente = buscar1_('NOMINAS', fn($n) => mismo_($n['usuario_id'], $objetivoId) && periodoNomina_($n['periodo']) === $periodo);

  /* Si ya había un PDF para ese mes, el viejo se manda a la papelera. */
  if ($existente && txt_($existente['archivo_id']) !== '') {
    driveBorrar_(txt_($existente['archivo_id']));
  }

  $datosFila = [
    'usuario_id' => $objetivoId, 'periodo' => $periodo,
    'archivo_id' => $archivo['id'] ?? '', 'archivo_nombre' => $nombre,
    'subida_por' => $u['id'], 'subida_fecha' => ahora_(),
    'estado' => txt_($p['estado'] ?? '') ?: ($existente ? txt_($existente['estado']) : 'pagada'),
    'fecha_pago' => txt_($p['fecha_pago'] ?? '') ?: ($existente ? txt_($existente['fecha_pago']) : ''),
    'neto' => (array_key_exists('neto', $p) && txt_($p['neto']) !== '') ? num_($p['neto']) : ($existente ? num_($existente['neto']) : ''),
    'notas' => txt_($p['notas'] ?? '') ?: ($existente ? txt_($existente['notas']) : '')
  ];

  $r = $existente ? actualizar_('NOMINAS', $existente['id'], $datosFila)
                  : insertar_('NOMINAS', unir_(['creado' => ahora_()], $datosFila));
  registrar_($u, 'subir_nomina', 'NOMINAS', $r['id'] ?? '', $persona['usuario'] . ' ' . $periodo);
  return ['ok' => true, 'nomina' => $r];
}

/** Devuelve el PDF en base64, solo a su dueño o a dirección. */
function accDescargarNomina_(array $u, array $p): array {
  $n = buscar1_('NOMINAS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$n) return ['ok' => false, 'error' => 'No existe esa nómina.'];
  if (!mismo_($n['usuario_id'], $u['id']) && empty(permisos_($u)['nominasAjenas'])) {
    return ['ok' => false, 'error' => 'Esa nómina no es tuya.'];
  }
  if (txt_($n['archivo_id']) === '') return ['ok' => false, 'error' => 'Esa nómina todavía no tiene PDF subido.'];
  try { $archivo = driveDescargar_(txt_($n['archivo_id'])); }
  catch (Throwable $e) { return ['ok' => false, 'error' => 'El archivo ya no está en el Drive de la empresa.']; }
  registrar_($u, 'ver_nomina', 'NOMINAS', $n['id'], txt_($n['periodo']));
  return ['ok' => true, 'nombre' => txt_($n['archivo_nombre']) ?: ($archivo['nombre'] ?? ''),
          'tipo' => $archivo['mime'] ?? '',
          'datos' => $archivo['base64'] ?? ''];
}

/** Quita la nómina de un mes (y su PDF). Solo dirección. */
function accBorrarNomina_(array $u, array $p): array {
  exigir_($u, 'nominasAjenas');
  $n = buscar1_('NOMINAS', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$n) return ['ok' => false, 'error' => 'No existe esa nómina.'];
  if (txt_($n['archivo_id']) !== '') {
    driveBorrar_(txt_($n['archivo_id']));
  }
  borrar_('NOMINAS', $p['id'] ?? '');
  registrar_($u, 'borrar_nomina', 'NOMINAS', $p['id'] ?? '', txt_($n['periodo']));
  return ['ok' => true];
}
