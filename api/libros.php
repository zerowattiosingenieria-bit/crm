<?php
/**
 * libros.php — Libro Diario, Libro Mayor y Pérdidas y Ganancias (25/11/2026, Nando).
 *
 * «Solo a nivel de superadmin me gustaría poder ver un diario mayor, libro contable y PyG.»
 *
 * Se genera al vuelo (no se guarda nada) con lo que ya hay en el CRM, siguiendo el PGC de pymes:
 *  - facturas recibidas: 6xx (según su concepto de gasto) + 472 IVA soportado a 400 Proveedores (− 4751 IRPF);
 *  - facturas emitidas: 430 Clientes a 700 Ventas + 477 IVA repercutido (+ 473 si nos retienen);
 *  - casados: 400 a 572 Bancos (pago) / 572 a 430 (cobro); tarjeta → 572 Tarjeta, efectivo → 570 Caja;
 *  - movimientos sin factura: nóminas 640, Seguridad Social 642, impuestos 4750, comisiones 626,
 *    préstamos 520, traspasos 5729 (cuenta puente), otros 629/759;
 *  - lo que aún está sin casar en el banco va a 555 Partidas pendientes de aplicación.
 * Es orientativo para dirección: la contabilidad oficial la lleva la gestoría.
 */

const LIBROS_CUENTAS = [
  '100' => 'Capital / saldo de apertura', '400' => 'Proveedores', '430' => 'Clientes',
  '472' => 'H.P. IVA soportado', '473' => 'H.P. retenciones y pagos a cuenta', '477' => 'H.P. IVA repercutido',
  '4750' => 'H.P. acreedora por impuestos', '4751' => 'H.P. acreedora por retenciones practicadas',
  '520' => 'Deudas a corto plazo (préstamos)', '555' => 'Partidas pendientes de aplicación', '570' => 'Caja',
  '5729' => 'Traspasos entre cuentas (puente)',
  '600' => 'Compras de material', '607' => 'Trabajos realizados por otras empresas', '623' => 'Servicios de profesionales independientes',
  '624' => 'Transportes', '626' => 'Servicios bancarios', '627' => 'Publicidad y propaganda', '629' => 'Otros servicios',
  '640' => 'Sueldos y salarios', '642' => 'Seguridad Social a cargo de la empresa',
  '700' => 'Ventas e instalaciones', '759' => 'Otros ingresos',
];
const LIBROS_GASTO = ['material_fv' => '600', 'material_aero' => '600', 'bateria' => '600', 'estructura' => '600',
  'montaje' => '607', 'mano_obra' => '607', 'legalizacion' => '623', 'gestion' => '623', 'comision' => '623', 'captacion' => '623',
  'transporte' => '624', 'marketing' => '627', 'administracion' => '629', 'otro' => '629'];

function exigirLibros_(array $u): void {
  if (empty(permisos_($u)['libros'])) throw new Exception('Los libros contables solo los ve el superadmin.');
}

function librosBanco_(array $m): array {
  $c = txt_($m['cuenta']) ?: 'Banco';
  return ['572' . (stripos($c, 'sabadell') !== false ? '2' : (stripos($c, 'caixa') !== false ? '1' : '0')), 'Bancos · ' . $c];
}

/** Todos los asientos (sin filtrar por fecha), ordenados. */
function librosAsientos_(): array {
  if (function_exists('asegurarCasados_')) asegurarCasados_();
  $nom = LIBROS_CUENTAS; $as = [];
  $add = function (string $fecha, string $concepto, array $lineas, string $doc) use (&$as) {
    $l = array_values(array_filter($lineas, fn($x) => abs($x[2]) > 0.004 || abs($x[3]) > 0.004));
    if ($l) $as[] = ['fecha' => $fecha, 'concepto' => $concepto, 'doc' => $doc, 'lineas' => $l];
  };
  $r2 = fn($x) => round((float)$x, 2);
  $facturas = indexar_(leer_('FACTURAS_DOC'));
  $banco = indexar_(leer_('BANCO'));
  $casados = leer_('CASADOS');

  /* 1) facturas */
  foreach ($facturas as $f) {
    $fe = txt_($f['fecha']); if ($fe === '' || num_($f['total']) == 0) continue;
    $tot = $r2(num_($f['total'])); $base = $r2(num_($f['base'])); $iva = $r2(num_($f['iva'])); $irpf = $r2(num_($f['irpf']));
    if ($base == 0 && $iva == 0) $base = $tot;
    $extra = $r2($tot - ($base + $iva - $irpf));   /* tasas o suplidos sin IVA (p. ej. CITE) */
    $quien = txt_($f['tipo']) === 'emitida' ? txt_($f['receptor']) : txt_($f['emisor']);
    $txt = 'Factura ' . (txt_($f['numero']) ?: $f['id']) . ' · ' . ($quien ?: '—');
    if (txt_($f['tipo']) === 'emitida') {
      $add($fe, $txt, [['430', 'Clientes · ' . $quien, $tot, 0], ['473', $nom['473'], $irpf, 0], ['700', $nom['700'], 0, $base + max(0, $extra)],
        ['477', $nom['477'], 0, $iva], ['555', $nom['555'], max(0, -$extra), 0]], $f['id']);
    } else {
      $cta = LIBROS_GASTO[txt_($f['categoria'])] ?? '629';
      $add($fe, $txt, [[$cta, $nom[$cta], $base + max(0, $extra), 0], ['472', $nom['472'], $iva, 0], ['400', 'Proveedores · ' . $quien, 0, $tot],
        ['4751', $nom['4751'], 0, $irpf], ['555', $nom['555'], 0, max(0, -$extra)]], $f['id']);
    }
  }
  /* 2) cobros y pagos casados */
  $usadoMov = [];
  foreach ($casados as $c) {
    $f = $facturas[txt_($c['factura_doc_id'])] ?? null; if (!$f) continue;
    $m = $banco[txt_($c['banco_id'])] ?? null; $imp = $r2(num_($c['importe'])); if ($imp == 0) continue;
    $medio = normal_($c['medio']) ?: ($m ? 'banco' : 'otro');
    if ($m) { $usadoMov[$m['id']] = ($usadoMov[$m['id']] ?? 0) + $imp; [$cb, $nb] = librosBanco_($m); }
    elseif ($medio === 'efectivo') { $cb = '570'; $nb = $nom['570']; }
    elseif ($medio === 'tarjeta') { $cb = '5723'; $nb = 'Bancos · Tarjeta'; }
    else { $cb = '555'; $nb = $nom['555']; }
    $fe = $m ? txt_($m['fecha']) : (txt_($c['fecha']) ?: txt_($f['fecha']));
    $quien = txt_($f['tipo']) === 'emitida' ? txt_($f['receptor']) : txt_($f['emisor']);
    if (txt_($f['tipo']) === 'emitida') $add($fe, 'Cobro factura ' . (txt_($f['numero']) ?: $f['id']) . ' · ' . $quien, [[$cb, $nb, $imp, 0], ['430', 'Clientes · ' . $quien, 0, $imp]], $c['id']);
    else $add($fe, 'Pago factura ' . (txt_($f['numero']) ?: $f['id']) . ' · ' . $quien, [['400', 'Proveedores · ' . $quien, $imp, 0], [$cb, $nb, 0, $imp]], $c['id']);
  }
  /* 3) movimientos del banco: lo que no está casado con factura */
  $primero = [];
  foreach ($banco as $m) {
    $fe = txt_($m['fecha']); if ($fe === '') continue;
    [$cb, $nb] = librosBanco_($m);
    if (!isset($primero[$cb]) || strcmp($fe, $primero[$cb]['fecha']) < 0 || ($fe === $primero[$cb]['fecha'] && strcmp(txt_($m['id']), $primero[$cb]['id']) < 0)) $primero[$cb] = ['fecha' => $fe, 'id' => txt_($m['id']), 'm' => $m, 'n' => $nb];
    $imp = $r2(num_($m['importe'])); $resto = $r2(abs($imp) - ($usadoMov[$m['id']] ?? 0));
    if ($resto <= 0.004) continue;
    $c = conceptoSinFactura_($m); $ent = $imp > 0;
    $map = ['nominas' => '640', 'seguridad_social' => '642', 'impuestos' => '4750', 'traspaso' => '5729', 'financiacion' => '520', 'banco' => '626', 'otro' => $ent ? '759' : '629'];
    $cta = $c !== '' ? $map[$c] : '555';
    $txt = trozo_(txt_($m['concepto']), 0, 60) . ($c === '' ? ' (sin casar)' : '');
    $add($fe, $txt, $ent ? [[$cb, $nb, $resto, 0], [$cta, $nom[$cta], 0, $resto]] : [[$cta, $nom[$cta], $resto, 0], [$cb, $nb, 0, $resto]], $m['id']);
  }
  /* 4) apertura: saldo de cada cuenta antes de su primer movimiento */
  foreach ($primero as $cb => $x) {
    $sal = $r2(num_($x['m']['saldo']) - num_($x['m']['importe']));
    if (txt_($x['m']['saldo']) === '' || abs($sal) < 0.005) continue;
    array_unshift($as, ['fecha' => $x['fecha'], 'concepto' => 'Saldo de apertura · ' . $x['n'], 'doc' => 'apertura', 'apertura' => true,
      'lineas' => $sal > 0 ? [[$cb, $x['n'], $sal, 0], ['100', $nom['100'], 0, $sal]] : [['100', $nom['100'], -$sal, 0], [$cb, $x['n'], 0, -$sal]]]);
  }
  usort($as, fn($a, $b) => strcmp($a['fecha'], $b['fecha']) ?: ((int)!empty($b['apertura']) - (int)!empty($a['apertura'])));
  foreach ($as as $i => &$a) $a['n'] = $i + 1; unset($a);
  return $as;
}

/** p.desde, p.hasta (AAAA-MM-DD). Devuelve diario, mayor y PyG del periodo. */
function accLibrosContables_(array $u, array $p): array {
  exigirLibros_($u);
  $d = txt_($p['desde'] ?? ''); $h = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $todos = librosAsientos_();
  $diario = array_values(array_filter($todos, fn($a) => ($d === '' || strcmp($a['fecha'], $d) >= 0) && strcmp($a['fecha'], $h) <= 0));
  /* mayor: saldo anterior (asientos previos) + movimientos del periodo */
  $cuentas = [];
  foreach ($todos as $a) {
    $antes = $d !== '' && strcmp($a['fecha'], $d) < 0; $dentro = !$antes && strcmp($a['fecha'], $h) <= 0;
    if (!$antes && !$dentro) continue;
    foreach ($a['lineas'] as [$c, $n, $de, $ha]) {
      $k = $c; if (!isset($cuentas[$k])) $cuentas[$k] = ['cuenta' => $c, 'nombre' => LIBROS_CUENTAS[$c] ?? $n, 'anterior' => 0.0, 'debe' => 0.0, 'haber' => 0.0, 'movs' => []];
      if ($antes) { $cuentas[$k]['anterior'] += $de - $ha; continue; }
      $cuentas[$k]['debe'] += $de; $cuentas[$k]['haber'] += $ha;
      $cuentas[$k]['movs'][] = ['n' => $a['n'], 'fecha' => $a['fecha'], 'concepto' => $a['concepto'] . ($n !== ($cuentas[$k]['nombre']) ? ' · ' . $n : ''), 'debe' => $de, 'haber' => $ha];
    }
  }
  ksort($cuentas, SORT_STRING);
  foreach ($cuentas as &$c) { $c['anterior'] = round($c['anterior'], 2); $c['debe'] = round($c['debe'], 2); $c['haber'] = round($c['haber'], 2); $c['saldo'] = round($c['anterior'] + $c['debe'] - $c['haber'], 2); } unset($c);
  /* PyG del periodo (PGC pymes, abreviado) */
  $g = fn($pref) => array_sum(array_map(fn($c) => strpos($c['cuenta'], $pref) === 0 ? $c['debe'] - $c['haber'] : 0, $cuentas));
  $ventas = round(-$g('70'), 2); $otrosIng = round(-$g('759'), 2);
  $aprov = round($g('600') + $g('607'), 2); $personal = round($g('640') + $g('642'), 2);
  $otrosGastos = round($g('62'), 2);
  $explot = round($ventas + $otrosIng - $aprov - $personal - $otrosGastos, 2);
  $pyg = [
    ['1. Importe neto de la cifra de negocios', $ventas, '700'],
    ['4. Aprovisionamientos (material y subcontratas)', -$aprov, '600 · 607'],
    ['5. Otros ingresos de explotación', $otrosIng, '759'],
    ['6. Gastos de personal', -$personal, '640 · 642'],
    ['7. Otros gastos de explotación', -$otrosGastos, '623 · 624 · 626 · 627 · 629'],
    ['A) RESULTADO DE EXPLOTACIÓN', $explot, '', true],
    ['B) RESULTADO FINANCIERO', 0.0, '(sin intereses registrados)'],
    ['C) RESULTADO ANTES DE IMPUESTOS', $explot, '', true],
  ];
  $detalle = [];
  foreach ($cuentas as $c) if (preg_match('/^[67]/', $c['cuenta'])) $detalle[] = ['cuenta' => $c['cuenta'], 'nombre' => $c['nombre'], 'importe' => round($c['cuenta'][0] === '7' ? $c['haber'] - $c['debe'] : $c['debe'] - $c['haber'], 2)];
  $tD = round(array_sum(array_map(fn($a) => array_sum(array_column($a['lineas'], 2)), $diario)), 2);
  $tH = round(array_sum(array_map(fn($a) => array_sum(array_column($a['lineas'], 3)), $diario)), 2);
  registrar_($u, 'ver_libros', 'LIBROS', '', ($d ?: 'inicio') . ' → ' . $h);
  return ['ok' => true, 'desde' => $d, 'hasta' => $h, 'diario' => $diario, 'mayor' => array_values($cuentas), 'pyg' => $pyg, 'pyg_detalle' => $detalle,
    'totales' => ['debe' => $tD, 'haber' => $tH, 'asientos' => count($diario)],
    'pendiente_555' => round(($cuentas['555']['saldo'] ?? 0), 2)];
}
