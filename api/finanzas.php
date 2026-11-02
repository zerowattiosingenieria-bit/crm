<?php
/**
 * finanzas.php — Contabilidad, tesorería y salud financiera.
 * (Traducción de 05_Finanzas.gs)
 *
 * Solo entran aquí superadmin y administradores: la comprobación se hace
 * en cada acción, no en el menú del navegador.
 */

require_once __DIR__ . '/base.php';

/* ---------- cobros ---------- */

function accGuardarCobro_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $d = is_array($p['cobro'] ?? null) ? $p['cobro'] : [];
  $campos = ['operacion_id', 'concepto', 'importe', 'fecha_prevista', 'fecha_cobro', 'estado',
             'metodo', 'factura_id', 'notas'];
  if (txt_($d['id'] ?? '') !== '') {
    $cambios = [];
    foreach ($campos as $c) if (array_key_exists($c, $d)) $cambios[$c] = $d[$c];
    if (txt_($cambios['fecha_cobro'] ?? '') !== '') $cambios['estado'] = 'cobrado';
    $r = actualizar_('COBROS', $d['id'], $cambios);
    registrar_($u, 'editar_cobro', 'COBROS', $d['id'], txt_($cambios['estado'] ?? '') !== '' ? $cambios['estado'] : '');
    return ['ok' => true, 'cobro' => $r];
  }
  $nuevo = ['creado' => ahora_(), 'creado_por' => $u['id']];
  foreach ($campos as $c) $nuevo[$c] = array_key_exists($c, $d) ? $d[$c] : '';
  $nuevo['estado'] = txt_($nuevo['estado']) !== '' ? $nuevo['estado'] : (txt_($nuevo['fecha_cobro']) !== '' ? 'cobrado' : 'previsto');
  $r = insertar_('COBROS', $nuevo);
  registrar_($u, 'alta_cobro', 'COBROS', $r['id'], $r['importe']);
  return ['ok' => true, 'cobro' => $r];
}

function accBorrarCobro_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  borrar_('COBROS', $p['id'] ?? '');
  return ['ok' => true];
}

/* ---------- facturas ---------- */

function accGuardarFactura_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $d = is_array($p['factura'] ?? null) ? $p['factura'] : [];
  $campos = ['numero', 'operacion_id', 'cliente_id', 'fecha_emision', 'concepto', 'base', 'iva_pct',
             'iva', 'total', 'estado', 'fecha_vencimiento', 'fecha_cobro', 'url', 'notas'];
  $base = num_($d['base'] ?? ''); $ivaPct = num_($d['iva_pct'] ?? '') ?: configNum_('iva_pct', 21);
  $iva = redondear_($base * $ivaPct / 100, 2);
  if (txt_($d['id'] ?? '') !== '') {
    $cambios = [];
    foreach ($campos as $c) if (array_key_exists($c, $d)) $cambios[$c] = $d[$c];
    if (array_key_exists('base', $d)) { $cambios['iva'] = $iva; $cambios['total'] = redondear_($base + $iva, 2); }
    if (txt_($cambios['fecha_cobro'] ?? '') !== '') $cambios['estado'] = 'cobrada';
    $r = actualizar_('FACTURAS', $d['id'], $cambios);
    registrar_($u, 'editar_factura', 'FACTURAS', $d['id'], txt_($cambios['estado'] ?? '') !== '' ? $cambios['estado'] : '');
    return ['ok' => true, 'factura' => $r];
  }
  $nueva = ['emitida_por' => $u['id']];
  foreach ($campos as $c) $nueva[$c] = array_key_exists($c, $d) ? $d[$c] : '';
  $nueva['numero'] = txt_($nueva['numero']) !== '' ? txt_($nueva['numero']) : siguienteNumeroFactura_();
  $nueva['fecha_emision'] = txt_($nueva['fecha_emision']) !== '' ? $nueva['fecha_emision'] : hoyISO_();
  $nueva['iva_pct'] = $ivaPct; $nueva['iva'] = $iva; $nueva['total'] = redondear_($base + $iva, 2);
  $nueva['estado'] = txt_($nueva['estado']) !== '' ? $nueva['estado'] : 'emitida';
  $nueva['fecha_vencimiento'] = txt_($nueva['fecha_vencimiento']) !== '' ? $nueva['fecha_vencimiento'] : sumarDias_($nueva['fecha_emision'], 30);
  $r = insertar_('FACTURAS', $nueva);
  registrar_($u, 'alta_factura', 'FACTURAS', $r['id'], $r['numero']);
  return ['ok' => true, 'factura' => $r];
}

function siguienteNumeroFactura_(): string {
  $anio = substr(hoyISO_(), 0, 4);
  $n = count(array_filter(leer_('FACTURAS'), fn($f) => str_starts_with(txt_($f['numero']), 'ZW/' . $anio)));
  return 'ZW/' . $anio . '/' . str_pad((string)($n + 1), 4, '0', STR_PAD_LEFT);
}

function accBorrarFactura_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  borrar_('FACTURAS', $p['id'] ?? '');
  return ['ok' => true];
}

/* ---------- gastos ---------- */

function accGuardarGasto_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $d = is_array($p['gasto'] ?? null) ? $p['gasto'] : [];
  $campos = ['operacion_id', 'categoria', 'proveedor', 'concepto', 'importe', 'iva_pct', 'fecha',
             'estado_pago', 'fecha_pago', 'factura_proveedor', 'notas'];
  if (txt_($d['id'] ?? '') !== '') {
    $cambios = [];
    foreach ($campos as $c) if (array_key_exists($c, $d)) $cambios[$c] = $d[$c];
    if (txt_($cambios['fecha_pago'] ?? '') !== '') $cambios['estado_pago'] = 'pagado';
    $r = actualizar_('GASTOS', $d['id'], $cambios);
    registrar_($u, 'editar_gasto', 'GASTOS', $d['id'], '');
    return ['ok' => true, 'gasto' => $r];
  }
  $nuevo = ['creado' => ahora_(), 'creado_por' => $u['id']];
  foreach ($campos as $c) $nuevo[$c] = array_key_exists($c, $d) ? $d[$c] : '';
  $nuevo['fecha'] = txt_($nuevo['fecha']) !== '' ? $nuevo['fecha'] : hoyISO_();
  $nuevo['estado_pago'] = txt_($nuevo['estado_pago']) !== '' ? $nuevo['estado_pago'] : (txt_($nuevo['fecha_pago']) !== '' ? 'pagado' : 'pendiente');
  $r = insertar_('GASTOS', $nuevo);
  registrar_($u, 'alta_gasto', 'GASTOS', $r['id'], $r['importe']);
  return ['ok' => true, 'gasto' => $r];
}

function accBorrarGasto_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  borrar_('GASTOS', $p['id'] ?? '');
  return ['ok' => true];
}

/* ---------- cuadro de mando contable ---------- */

/**
 * Devuelve las cuentas de la casa en un periodo, la cuenta de cada
 * instalación y la tabla de salud financiera con sus consejos.
 * p.desde y p.hasta en formato yyyy-mm-dd (por defecto, los últimos 12 meses).
 */
function accFinanzas_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $hasta = txt_($p['hasta'] ?? '') !== '' ? txt_($p['hasta']) : hoyISO_();
  $desde = txt_($p['desde'] ?? '') !== '' ? txt_($p['desde']) : sumarDias_($hasta, -365);

  $operaciones = leer_('OPERACIONES');
  $clientes = indexar_(leer_('CLIENTES'));
  $cobros = leer_('COBROS');
  $gastos = leer_('GASTOS');
  $facturas = leer_('FACTURAS');
  $usuarios = indexar_(leer_('USUARIOS'));
  $cfg = config_();
  $estructuraMes = num_($cfg['coste_estructura_mes'] ?? '');
  $hoy = hoyISO_();

  $cobrosPorOp = []; $gastosPorOp = [];
  foreach ($cobros as $c) $cobrosPorOp[txt_($c['operacion_id'])][] = $c;
  foreach ($gastos as $g) $gastosPorOp[txt_($g['operacion_id'])][] = $g;

  $vendidas = array_values(array_filter($operaciones, function ($op) {
    return !in_array(normal_($op['estado']), ['cancelada', 'propuesta', 'financiacion'], true);
  }));

  /* --- cuenta de cada instalación --- */
  $porOperacion = array_map(function ($op) use ($cobrosPorOp, $gastosPorOp, $clientes, $usuarios, $hoy) {
    $cs = $cobrosPorOp[txt_($op['id'])] ?? [];
    $gs = $gastosPorOp[txt_($op['id'])] ?? [];
    $ingreso = num_($op['total']);
    $base = num_($op['base']) ?: redondear_($ingreso / (1 + (num_($op['iva_pct']) ?: 21) / 100), 2);
    $cobrado = 0;
    foreach ($cs as $c) if (txt_($c['fecha_cobro']) !== '') $cobrado += num_($c['importe']);
    $pendiente = redondear_($ingreso - $cobrado, 2);
    $vencido = 0;
    foreach ($cs as $c) {
      if (txt_($c['fecha_cobro']) === '' && txt_($c['fecha_prevista']) !== '' && strcmp(txt_($c['fecha_prevista']), $hoy) < 0) $vencido += num_($c['importe']);
    }
    $coste = 0;
    foreach ($gs as $g) $coste += num_($g['importe']);
    $costePendiente = 0;
    foreach ($gs as $g) if (normal_($g['estado_pago']) !== 'pagado') $costePendiente += num_($g['importe']);
    $margen = redondear_($base - $coste, 2);
    $cli = $clientes[txt_($op['cliente_id'])] ?? [];
    $com = $usuarios[txt_($op['comercial_id'])] ?? [];
    $cap = $usuarios[txt_($op['captador_id'])] ?? [];
    return [
      'id' => $op['id'], 'referencia' => $op['referencia'], 'cliente_id' => $op['cliente_id'],
      'cliente' => txt_($cli['nombre'] ?? '') !== '' ? $cli['nombre'] : '—', 'municipio' => txt_($cli['municipio'] ?? '') !== '' ? $cli['municipio'] : '',
      'comercial' => txt_($com['nombre'] ?? '') !== '' ? $com['nombre'] : '—',
      'captador' => txt_($cap['nombre'] ?? '') !== '' ? $cap['nombre'] : '',
      'tipo' => $op['tipo'], 'estado' => $op['estado'],
      'fecha' => txt_($op['fecha_firma']) !== '' ? txt_($op['fecha_firma']) : (txt_($op['fecha_propuesta']) !== '' ? txt_($op['fecha_propuesta']) : txt_($op['creado'])),
      'ingreso' => redondear_($ingreso, 2), 'base' => $base, 'cobrado' => redondear_($cobrado, 2),
      'pendiente' => $pendiente, 'vencido' => redondear_($vencido, 2),
      'coste' => redondear_($coste, 2), 'coste_pendiente' => redondear_($costePendiente, 2),
      'margen' => $margen, 'margen_pct' => pct_($margen, $base),
      'ayudas' => num_($op['ayudas_estimadas']), 'cae' => num_($op['cae_estimado']),
      'beneficio_no_economico' => txt_($op['beneficio_no_economico']),
      'cobros' => count($cs), 'gastos' => count($gs)
    ];
  }, $vendidas);

  $enRango = array_values(array_filter($porOperacion, fn($o) => strcmp($o['fecha'], $desde) >= 0 && strcmp($o['fecha'], $hasta) <= 0));

  /* --- totales del periodo --- */
  $ingresos = 0; $costes = 0;
  foreach ($enRango as $o) { $ingresos += $o['base']; $costes += $o['coste']; }
  $margenBruto = redondear_($ingresos - $costes, 2);
  $meses = max(1, (int)round((diasEntre_($desde, $hasta) ?: 365) / 30.4));
  $estructura = redondear_($estructuraMes * $meses, 2);
  $beneficioNeto = redondear_($margenBruto - $estructura, 2);

  $cobradoPeriodo = 0;
  foreach ($cobros as $c) {
    $f = txt_($c['fecha_cobro']);
    if (strcmp($f, $desde) >= 0 && strcmp($f, $hasta) <= 0) $cobradoPeriodo += num_($c['importe']);
  }

  $pagadoPeriodo = 0;
  foreach ($gastos as $g) {
    $f = txt_($g['fecha_pago']);
    if (strcmp($f, $desde) >= 0 && strcmp($f, $hasta) <= 0) $pagadoPeriodo += num_($g['importe']);
  }

  $pendienteCobro = 0; $vencidoCobro = 0;
  foreach ($cobros as $c) {
    if (txt_($c['fecha_cobro']) === '') {
      $pendienteCobro += num_($c['importe']);
      if (txt_($c['fecha_prevista']) !== '' && strcmp(txt_($c['fecha_prevista']), $hoy) < 0) $vencidoCobro += num_($c['importe']);
    }
  }
  $pendientePago = 0;
  foreach ($gastos as $g) if (normal_($g['estado_pago']) !== 'pagado') $pendientePago += num_($g['importe']);

  /* --- gastos por categoría --- */
  $porCategoria = [];
  foreach ($gastos as $g) {
    $f = txt_($g['fecha']);
    if (!(strcmp($f, $desde) >= 0 && strcmp($f, $hasta) <= 0)) continue;
    $k = txt_($g['categoria']) !== '' ? txt_($g['categoria']) : 'otro';
    $porCategoria[$k] = redondear_(($porCategoria[$k] ?? 0) + num_($g['importe']), 2);
  }

  /* --- evolución mes a mes --- */
  $porMes = [];
  $mesDe = function ($k) use (&$porMes) {
    if (!isset($porMes[$k])) $porMes[$k] = ['mes' => $k, 'ingresos' => 0, 'costes' => 0, 'cobrado' => 0, 'pagado' => 0, 'ventas' => 0];
    return $k;
  };
  foreach ($enRango as $o) {
    $k = $mesDe(mesDe_($o['fecha']));
    $porMes[$k]['ingresos'] = redondear_($porMes[$k]['ingresos'] + $o['base'], 2);
    $porMes[$k]['costes'] = redondear_($porMes[$k]['costes'] + $o['coste'], 2);
    $porMes[$k]['ventas'] += 1;
  }
  foreach ($cobros as $c) {
    $f = txt_($c['fecha_cobro']);
    if (strcmp($f, $desde) >= 0 && strcmp($f, $hasta) <= 0) { $k = $mesDe(mesDe_($f)); $porMes[$k]['cobrado'] = redondear_($porMes[$k]['cobrado'] + num_($c['importe']), 2); }
  }
  foreach ($gastos as $g) {
    $f = txt_($g['fecha_pago']);
    if (strcmp($f, $desde) >= 0 && strcmp($f, $hasta) <= 0) { $k = $mesDe(mesDe_($f)); $porMes[$k]['pagado'] = redondear_($porMes[$k]['pagado'] + num_($g['importe']), 2); }
  }
  $clavesMes = array_map('strval', array_keys($porMes));
  sort($clavesMes, SORT_STRING);
  $evolucion = array_map(function ($k) use ($porMes) {
    $m = $porMes[$k];
    $m['margen'] = redondear_($m['ingresos'] - $m['costes'], 2);
    $m['caja'] = redondear_($m['cobrado'] - $m['pagado'], 2);
    return $m;
  }, $clavesMes);

  /* --- tesorería a 30 / 60 / 90 días --- */
  $tramos = array_map(function ($d) use ($cobros, $gastos, $hoy, $estructuraMes) {
    $limite = sumarDias_($hoy, $d);
    $entra = 0;
    foreach ($cobros as $c) {
      if (txt_($c['fecha_cobro']) === '' && txt_($c['fecha_prevista']) !== '' && strcmp(txt_($c['fecha_prevista']), $limite) <= 0) $entra += num_($c['importe']);
    }
    $sale = 0;
    foreach ($gastos as $g) {
      if (normal_($g['estado_pago']) !== 'pagado' && txt_($g['fecha']) !== '' && strcmp(sumarDias_(txt_($g['fecha']), 30), $limite) <= 0) $sale += num_($g['importe']);
    }
    $fijos = redondear_($estructuraMes * ($d / 30), 2);
    return ['dias' => $d, 'entra' => redondear_($entra, 2), 'sale' => redondear_($sale, 2), 'estructura' => $fijos,
            'neto' => redondear_($entra - $sale - $fijos, 2)];
  }, [30, 60, 90]);

  /* --- días medios de cobro --- */
  $cobrosConFecha = array_values(array_filter($cobros, fn($c) => txt_($c['fecha_cobro']) !== '' && txt_($c['fecha_prevista']) !== ''));
  $dso = 0;
  if (count($cobrosConFecha)) {
    $suma = 0;
    foreach ($cobrosConFecha as $c) $suma += (diasEntre_($c['fecha_prevista'], $c['fecha_cobro']) ?: 0);
    $dso = redondear_($suma / count($cobrosConFecha), 1);
  }

  /* --- facturación --- */
  $facturasPeriodo = array_values(array_filter($facturas, function ($f) use ($desde, $hasta) {
    return strcmp(txt_($f['fecha_emision']), $desde) >= 0 && strcmp(txt_($f['fecha_emision']), $hasta) <= 0;
  }));
  $facturado = 0;
  foreach ($facturasPeriodo as $f) $facturado += num_($f['base']);
  $facturasVencidas = array_values(array_filter($facturas, function ($f) use ($hoy) {
    return txt_($f['fecha_cobro']) === '' && txt_($f['fecha_vencimiento']) !== '' && strcmp(txt_($f['fecha_vencimiento']), $hoy) < 0;
  }));
  $importeVencidas = 0;
  foreach ($facturasVencidas as $f) $importeVencidas += num_($f['total']);

  $resumen = [
    'desde' => $desde, 'hasta' => $hasta, 'meses' => $meses,
    'ingresos' => redondear_($ingresos, 2), 'costes' => redondear_($costes, 2),
    'margen_bruto' => $margenBruto, 'margen_pct' => pct_($margenBruto, $ingresos),
    'estructura' => $estructura, 'beneficio_neto' => $beneficioNeto,
    'beneficio_pct' => pct_($beneficioNeto, $ingresos),
    'cobrado' => redondear_($cobradoPeriodo, 2), 'pagado' => redondear_($pagadoPeriodo, 2),
    'caja_periodo' => redondear_($cobradoPeriodo - $pagadoPeriodo, 2),
    'pendiente_cobro' => redondear_($pendienteCobro, 2), 'vencido_cobro' => redondear_($vencidoCobro, 2),
    'pendiente_pago' => redondear_($pendientePago, 2),
    'operaciones' => count($enRango), 'ticket_medio' => count($enRango) ? redondear_($ingresos / count($enRango), 2) : 0,
    'facturado' => redondear_($facturado, 2), 'facturas_emitidas' => count($facturasPeriodo),
    'facturas_vencidas' => count($facturasVencidas),
    'importe_facturas_vencidas' => redondear_($importeVencidas, 2),
    'dso' => $dso, 'estructura_mes' => $estructuraMes
  ];

  $salud = saludFinanciera_($resumen, $enRango, $tramos, $cfg, $operaciones);

  return ['ok' => true, 'resumen' => $resumen, 'operaciones' => $porOperacion, 'evolucion' => $evolucion,
          'categorias' => $porCategoria ?: new stdClass(), 'tesoreria' => $tramos, 'salud' => $salud['indicadores'],
          'consejos' => $salud['consejos'], 'nota' => $salud['nota'],
          'facturas' => $facturas, 'cobros' => $cobros, 'gastos' => $gastos];
}

/**
 * Tabla de salud financiera: cada línea es un indicador con su valor,
 * su objetivo, un semáforo y qué hacer si está en rojo.
 */
function saludFinanciera_(array $r, array $operaciones, array $tesoreria, array $cfg, array $todasOperaciones): array {
  $objetivoMargen = num_($cfg['margen_objetivo_pct'] ?? '') ?: 32;
  $objetivoDso = num_($cfg['dias_cobro_objetivo'] ?? '') ?: 45;
  $ind = [];
  $consejos = [];

  $linea = function ($nombre, $valor, $formato, $objetivo, $estado, $lectura) use (&$ind) {
    $ind[] = ['indicador' => $nombre, 'valor' => $valor, 'formato' => $formato, 'objetivo' => $objetivo,
              'estado' => $estado, 'lectura' => $lectura];
  };
  $semaforo = function ($v, $bien, $regular, $alReves = false) {
    if ($alReves) return $v <= $bien ? 'bien' : ($v <= $regular ? 'aviso' : 'mal');
    return $v >= $bien ? 'bien' : ($v >= $regular ? 'aviso' : 'mal');
  };

  /* 1. Margen bruto */
  $est1 = $semaforo($r['margen_pct'], $objetivoMargen, $objetivoMargen - 8);
  $linea('Margen bruto', $r['margen_pct'], 'pct', $objetivoMargen . ' %', $est1,
    'De cada 100 € facturados quedan ' . redondear_($r['margen_pct'], 1) . ' € antes de gastos de estructura.');
  if ($est1 !== 'bien') $consejos[] = [
    'titulo' => 'El margen está por debajo del objetivo',
    'accion' => 'Revisa las tres instalaciones con peor margen de la tabla inferior. Si el desvío viene del material, renegocia precio por volumen con el proveedor; si viene del montaje, revisa el precio cerrado con la subcontrata antes de firmar más obras.',
    'urgencia' => $est1 === 'mal' ? 'alta' : 'media'
  ];

  /* 2. Beneficio neto */
  $est2 = $r['beneficio_neto'] > 0 ? ($r['beneficio_pct'] >= 10 ? 'bien' : 'aviso') : 'mal';
  $linea('Beneficio neto del periodo', $r['beneficio_neto'], 'eur', '> 0 €', $est2,
    'Margen bruto menos ' . redondear_($r['estructura'], 0) . ' € de estructura (' . $r['meses'] . ' meses).');
  if ($est2 === 'mal') $consejos[] = [
    'titulo' => 'La estructura se come el margen',
    'accion' => 'Con ' . redondear_($r['estructura_mes'], 0) . ' € de coste fijo al mes y un margen medio de ' .
            redondear_($r['margen_pct'], 1) . ' %, hacen falta ' . puntoEquilibrio_($r) .
            ' instalaciones al mes solo para cubrir gastos. O suben las ventas o baja el fijo: no hay tercera vía.',
    'urgencia' => 'alta'
  ];

  /* 3. Tesorería a 30 días */
  $t30 = ($tesoreria[0] ?? [])['neto'] ?? 0;
  $t30 = $t30 ?: 0;
  $est3 = $t30 > 0 ? 'bien' : ($t30 > -$r['estructura_mes'] ? 'aviso' : 'mal');
  $linea('Caja prevista a 30 días', $t30, 'eur', '> 0 €', $est3,
    'Cobros previstos menos pagos comprometidos y estructura del próximo mes.');
  if ($est3 !== 'bien') $consejos[] = [
    'titulo' => 'El mes que viene entra menos de lo que sale',
    'accion' => 'Adelanta la facturación del 25 % de material de las obras ya firmadas y pide a la financiera la liquidación de las operaciones instaladas. Si aun así no cuadra, negocia con el proveedor de material pago a 60 días en lugar de 30.',
    'urgencia' => $est3 === 'mal' ? 'alta' : 'media'
  ];

  /* 4. Cobros vencidos */
  $pctVencido = pct_($r['vencido_cobro'], $r['pendiente_cobro']);
  $est4 = $semaforo($pctVencido, 5, 15, true);
  $linea('Cobros vencidos sobre el pendiente', $pctVencido, 'pct', '< 5 %', $est4,
    redondear_($r['vencido_cobro'], 0) . ' € pasados de fecha de un total pendiente de ' . redondear_($r['pendiente_cobro'], 0) . ' €.');
  if ($est4 !== 'bien') $consejos[] = [
    'titulo' => 'Hay dinero vencido sin reclamar',
    'accion' => 'Llama hoy a los clientes con cobros vencidos (los tienes marcados en rojo en la tabla de cobros). Un recordatorio a los 3 días del vencimiento recupera la mayoría sin tensar la relación.',
    'urgencia' => $est4 === 'mal' ? 'alta' : 'media'
  ];

  /* 5. Días medios de cobro */
  $est5 = $semaforo($r['dso'], 0, $objetivoDso, true);
  $linea('Desvío medio de cobro', $r['dso'], 'dias', '≤ 0 días sobre lo previsto', $est5,
    $r['dso'] > 0 ? 'Se cobra de media ' . $r['dso'] . ' días más tarde de lo pactado.' : 'Se está cobrando en fecha.');
  if ($est5 === 'mal') $consejos[] = [
    'titulo' => 'Se cobra tarde de forma sistemática',
    'accion' => 'Cambia el calendario de pagos del contrato: 50 % a la firma y 25 % contra entrega de material en obra, con la factura emitida el mismo día del hito. Emitir tarde es cobrar tarde.',
    'urgencia' => 'media'
  ];

  /* 6. Fondo de maniobra operativo */
  $cobertura = $r['pendiente_pago'] ? redondear_($r['pendiente_cobro'] / $r['pendiente_pago'], 2) : 99;
  $est6 = $semaforo($cobertura, 1.5, 1);
  $linea('Pendiente de cobro / pendiente de pago', $cobertura, 'ratio', '≥ 1,5', $est6,
    'Por cada euro que debemos, hay ' . $cobertura . ' € por cobrar.');
  if ($est6 !== 'bien') $consejos[] = [
    'titulo' => 'Debemos más de lo que vamos a cobrar a corto',
    'accion' => 'Frena los pedidos de material que no estén asociados a una obra firmada y con entrada cobrada. Encargar material a cuenta de ventas que aún no están firmadas es la forma más rápida de quedarse sin caja.',
    'urgencia' => 'alta'
  ];

  /* 7. Concentración de clientes */
  $porCliente = [];
  foreach ($operaciones as $o) { $k = (string)$o['cliente']; $porCliente[$k] = ($porCliente[$k] ?? 0) + $o['base']; }
  $claves = array_map('strval', array_keys($porCliente));
  $claves = ordenar_($claves, fn($a, $b) => $porCliente[$b] <=> $porCliente[$a]);
  $mayor = $claves[0] ?? null;
  $pctMayor = $mayor !== null ? pct_($porCliente[$mayor], $r['ingresos']) : 0;
  $est7 = $semaforo($pctMayor, 20, 35, true);
  $linea('Peso del mayor cliente', $pctMayor, 'pct', '< 20 %', $est7,
    $mayor !== null ? $mayor . ' supone el ' . $pctMayor . ' % de la facturación del periodo.' : 'Sin datos suficientes.');
  if ($est7 === 'mal') $consejos[] = [
    'titulo' => 'Demasiada facturación en un solo cliente',
    'accion' => 'Mantén la captación a puerta activa aunque entren obras grandes. Un cliente que pesa más de un tercio de la facturación convierte cualquier retraso suyo en un problema de nóminas.',
    'urgencia' => 'media'
  ];

  /* 8. Ticket medio */
  $linea('Ticket medio por instalación', $r['ticket_medio'], 'eur', '—', 'info',
    $r['operaciones'] . ' operaciones cerradas en el periodo.');

  /* 9. Punto de equilibrio */
  $linea('Instalaciones al mes para cubrir gastos', puntoEquilibrio_($r), 'num', '—', 'info',
    'Con el margen y el ticket medio actuales.');

  /* 10. Conversión de propuestas */
  $propuestas = count($todasOperaciones);
  $ganadas = count(array_filter($todasOperaciones, function ($o) {
    return in_array(normal_($o['estado']), ['firmada', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'], true);
  }));
  $conv = pct_($ganadas, $propuestas);
  $est10 = $semaforo($conv, 35, 20);
  $linea('Propuestas que acaban en venta', $conv, 'pct', '≥ 35 %', $est10,
    $ganadas . ' cerradas de ' . $propuestas . ' propuestas emitidas.');
  if ($est10 !== 'bien') $consejos[] = [
    'titulo' => 'Se emiten muchas propuestas que no cierran',
    'accion' => 'Repasa con cada comercial las propuestas de más de 15 días sin respuesta: o se cierran con una llamada de decisión, o se marcan como perdidas para dejar de contarlas como cartera. Una cartera inflada esconde el problema real.',
    'urgencia' => 'media'
  ];

  /* Nota de cabecera */
  $malos = count(array_filter($ind, fn($i) => $i['estado'] === 'mal'));
  $avisos = count(array_filter($ind, fn($i) => $i['estado'] === 'aviso'));
  $nota = ($malos === 0 && $avisos === 0)
    ? ['nivel' => 'bien', 'texto' => 'La empresa está sana: margen, cobro y caja dentro de objetivo.']
    : ($malos === 0
      ? ['nivel' => 'aviso', 'texto' => 'Nada grave, pero hay ' . $avisos . ' indicador(es) fuera de objetivo. Merece media hora esta semana.']
      : ['nivel' => 'mal', 'texto' => 'Hay ' . $malos . ' indicador(es) en rojo. Empieza por los consejos marcados como urgencia alta.']);

  if (!count($consejos)) $consejos[] = [
    'titulo' => 'Todo en verde: toca consolidar',
    'accion' => 'Aprovecha para adelantar la compra de material de las obras firmadas si el proveedor mejora precio por volumen, y deja en caja al menos dos meses de estructura antes de ampliar equipo.',
    'urgencia' => 'baja'
  ];

  return ['indicadores' => $ind, 'consejos' => $consejos, 'nota' => $nota];
}

function puntoEquilibrio_(array $r): float|int {
  $margenUnidad = $r['ticket_medio'] * ($r['margen_pct'] / 100);
  if ($margenUnidad <= 0) return 0;
  return (int)ceil($r['estructura_mes'] / $margenUnidad);
}
