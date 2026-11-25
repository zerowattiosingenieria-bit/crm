<?php
/**
 * impuestos.php — Impuestos y modelos (26/11/2026, Nando).
 *
 * «Te paso los costes, las nóminas, el libro de facturas expedidas y los modelos 303, 111, 115 y 130
 *  para que los tengas en cuenta en el CRM. A todo esto podemos acceder Rubén, superadmin, Fernando y Nando.»
 *
 * Guarda cada modelo presentado por Zero Wattios (los personales de los socios no entran) con sus casillas clave y el PDF
 * (en la carpeta «IMPUESTOS · CRM ZERO WATTIOS» del Drive) y lo cuadra contra lo que hay en el CRM:
 *   · 303: IVA devengado frente a las facturas emitidas del trimestre y soportado frente a las recibidas.
 *   · 111: rendimientos del trabajo y retenciones frente a las nóminas del trimestre.
 * Mismo permiso que la vista de la gestoría (vistagestoria).
 */

function carpetaImpuestos_(): string {
  return carpetaDeLaCasa_('ID_CARPETA_IMPUESTOS', 'IMPUESTOS · CRM ZERO WATTIOS');
}

/** 1T..4T → [desde, hasta]. */
function trimestreFechas_(int $anio, string $periodo): array {
  $t = (int)preg_replace('/\D/', '', $periodo) ?: 1;
  $ini = sprintf('%04d-%02d-01', $anio, ($t - 1) * 3 + 1);
  $fin = (new DateTime($ini))->modify('+3 months -1 day')->format('Y-m-d');
  return [$ini, $fin];
}

/** Cuadre de un modelo contra el CRM: lista de [concepto, modelo, crm, ok, nota]. */
function cuadreModelo_(array $m): array {
  $cas = json_decode(txt_($m['casillas']), true) ?: [];
  $anio = (int)$m['ejercicio'];
  [$desde, $hasta] = trimestreFechas_($anio, txt_($m['periodo']));
  $o = [];
  $fila = function ($concepto, $mod, $crm, $nota = '') use (&$o) {
    $mod = redondear_(num_($mod), 2); $crm = redondear_(num_($crm), 2);
    $o[] = ['concepto' => $concepto, 'modelo' => $mod, 'crm' => $crm, 'ok' => abs($mod - $crm) <= 1, 'nota' => $nota];
  };
  if (txt_($m['titular']) !== 'empresa') return $o;
  $enTrim = fn($f) => ($d = substr(txt_($f['fecha']), 0, 10)) >= $desde && $d <= $hasta;
  if (txt_($m['modelo']) === '303') {
    $docs = array_filter(leer_('FACTURAS_DOC'), $enTrim);
    $em = array_filter($docs, fn($f) => normal_($f['tipo']) === 'emitida');
    $re = array_filter($docs, fn($f) => normal_($f['tipo']) === 'recibida');
    $s = fn($l, $c) => array_sum(array_map(fn($f) => num_($f[$c]), $l));
    $fila('Base imponible devengada (facturas emitidas)', $cas['07'] ?? 0, $s($em, 'base'), count($em) . ' facturas emitidas en el CRM');
    $fila('IVA devengado (21 %)', $cas['09'] ?? 0, $s($em, 'iva'));
    $fila('Base de IVA soportado (facturas recibidas)', num_($cas['28'] ?? 0) + num_($cas['36'] ?? 0), $s($re, 'base'), count($re) . ' facturas recibidas en el CRM');
    $fila('IVA soportado deducible', num_($cas['29'] ?? 0) + num_($cas['37'] ?? 0), $s($re, 'iva'));
  }
  if (txt_($m['modelo']) === '111') {
    $per = substr($desde, 0, 7); $perFin = substr($hasta, 0, 7);
    $noms = array_filter(leer_('NOMINAS'), function ($n) use ($per, $perFin) { $p = periodoNomina_($n['periodo']); return $p >= $per && $p <= $perFin; });
    $din = 0; $esp = 0; $ret = 0;
    foreach ($noms as $n) {
      $d = json_decode(txt_($n['detalle']), true) ?: [];
      $e = num_($d['especie'] ?? 0);
      $din += num_($n['bruto_total']) - $e - num_($n['dietas']); $esp += $e; $ret += num_($n['irpf']);
    }
    $fila('Rendimientos dinerarios del trabajo (sin dietas exentas)', $cas['02'] ?? 0, $din, count($noms) . ' nóminas en el CRM');
    $fila('Rendimientos en especie', $cas['05'] ?? 0, $esp);
    $fila('Retenciones totales', $cas['28'] ?? 0, $ret);
  }
  return $o;
}

/** Facturas recibidas del trimestre con el IVA que no cuadra (base e IVA cambiados, tipo raro o sin importes). */
function revisarIvaTrimestre_(int $anio, string $periodo): array {
  [$desde, $hasta] = trimestreFechas_($anio, $periodo);
  $o = [];
  foreach (leer_('FACTURAS_DOC') as $f) {
    $d = substr(txt_($f['fecha']), 0, 10);
    if ($d < $desde || $d > $hasta || normal_($f['tipo']) !== 'recibida') continue;
    $b = num_($f['base']); $i = num_($f['iva']); $t = num_($f['total']);
    $motivo = '';
    if (!$b && !$t) $motivo = 'Sin importes';
    elseif ($b > 0 && $i > $b) $motivo = 'IVA mayor que la base: parecen cambiados';
    elseif ($b > 0 && $i > 0 && !in_array((int)round($i / $b * 100), [4, 5, 10, 21], true)) $motivo = 'IVA del ' . round($i / $b * 100, 1) . ' %';
    if ($motivo) $o[] = ['id' => txt_($f['id']), 'fecha' => $d, 'emisor' => txt_($f['emisor']), 'base' => $b, 'iva' => $i, 'total' => $t, 'motivo' => $motivo, 'archivo' => txt_($f['archivo_nombre'])];
  }
  return $o;
}

function accImpuestos_(array $u, array $p): array {
  exigir_($u, 'vistagestoria');
  $l = array_values(array_filter(leer_('MODELOS_FISCALES'), fn($m) => txt_($m['titular']) === 'empresa'));
  usort($l, fn($a, $b) => strcmp(txt_($b['ejercicio']) . txt_($b['periodo']), txt_($a['ejercicio']) . txt_($a['periodo'])) ?: strcmp(txt_($a['titular']) . txt_($a['modelo']), txt_($b['titular']) . txt_($b['modelo'])));
  $trims = [];
  $o = array_map(function ($m) use (&$trims) {
    if (txt_($m['titular']) === 'empresa') $trims[txt_($m['ejercicio']) . '|' . txt_($m['periodo'])] = 1;
    return ['id' => txt_($m['id']), 'titular' => txt_($m['titular']), 'modelo' => txt_($m['modelo']), 'ejercicio' => txt_($m['ejercicio']),
      'periodo' => txt_($m['periodo']), 'resultado' => num_($m['resultado']), 'tipo_resultado' => txt_($m['tipo_resultado']),
      'fecha_presentacion' => substr(txt_($m['fecha_presentacion']), 0, 10), 'casillas' => json_decode(txt_($m['casillas']), true) ?: [],
      'archivo' => txt_($m['archivo_id']) !== '', 'archivo_nombre' => txt_($m['archivo_nombre']), 'notas' => txt_($m['notas']), 'cuadre' => cuadreModelo_($m)];
  }, $l);
  $revisar = [];
  foreach (array_keys($trims) as $k) { [$a, $per] = explode('|', $k); $revisar[$k] = revisarIvaTrimestre_((int)$a, $per); }
  return ['ok' => true, 'modelos' => $o, 'revisar_iva' => $revisar];
}

function accGuardarModeloFiscal_(array $u, array $p): array {
  exigir_($u, 'vistagestoria');
  $d = is_array($p['modelo'] ?? null) ? $p['modelo'] : [];
  /* Solo modelos de la empresa: los personales de los socios no entran en el CRM (26/11/2026, Nando). */
  if (txt_($d['titular'] ?? 'empresa') !== 'empresa') return ['ok' => false, 'error' => 'En el CRM solo van los modelos de Zero Wattios.'];
  $titular = 'empresa';
  $modelo = preg_replace('/\D/', '', txt_($d['modelo'] ?? ''));
  $ej = (int)($d['ejercicio'] ?? 0); $per = strtoupper(txt_($d['periodo'] ?? ''));
  if (!$modelo || $ej < 2020 || !preg_match('/^([1-4]T|0A|\d{2})$/', $per)) return ['ok' => false, 'error' => 'Falta el modelo, el ejercicio o el periodo (1T…4T).'];
  $datos = ['titular' => $titular, 'modelo' => $modelo, 'ejercicio' => $ej, 'periodo' => $per,
    'resultado' => redondear_(num_($d['resultado'] ?? 0), 2), 'tipo_resultado' => trozo_(txt_($d['tipo_resultado'] ?? ''), 0, 40),
    'fecha_presentacion' => substr(txt_($d['fecha_presentacion'] ?? ''), 0, 10),
    'casillas' => aJson_(is_array($d['casillas'] ?? null) ? $d['casillas'] : []), 'notas' => trozo_(txt_($d['notas'] ?? ''), 0, 300)];
  $driveId = txt_($d['drive_id'] ?? '');
  if ($driveId !== '') {
    $en = array_values(array_filter(driveListar_(carpetaImpuestos_()), fn($a) => txt_($a['id'] ?? '') === $driveId));
    if (!$en) return ['ok' => false, 'error' => 'Ese PDF no está en la carpeta de impuestos del Drive.'];
    $datos['archivo_id'] = $driveId; $datos['archivo_nombre'] = txt_($en[0]['nombre'] ?? '');
  }
  $ex = buscar1_('MODELOS_FISCALES', fn($m) => txt_($m['titular']) === $titular && txt_($m['modelo']) === $modelo && (int)$m['ejercicio'] === $ej && txt_($m['periodo']) === $per);
  $r = $ex ? actualizar_('MODELOS_FISCALES', $ex['id'], $datos) : insertar_('MODELOS_FISCALES', unir_(['creado' => ahora_(), 'creado_por' => $u['id']], $datos));
  registrar_($u, 'modelo_fiscal', 'MODELOS_FISCALES', $r['id'] ?? '', $titular . ' ' . $modelo . ' ' . $per . ' ' . $ej);
  return ['ok' => true, 'modelo' => $r];
}

function accBorrarModeloFiscal_(array $u, array $p): array {
  exigir_($u, 'vistagestoria');
  $m = buscar1_('MODELOS_FISCALES', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$m) return ['ok' => false, 'error' => 'No existe ese modelo.'];
  borrar_('MODELOS_FISCALES', $m['id']);
  registrar_($u, 'borrar_modelo_fiscal', 'MODELOS_FISCALES', $m['id'], txt_($m['titular']) . ' ' . txt_($m['modelo']) . ' ' . txt_($m['periodo']));
  return ['ok' => true];
}

function accArchivoModeloFiscal_(array $u, array $p): array {
  exigir_($u, 'vistagestoria');
  $m = buscar1_('MODELOS_FISCALES', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$m || txt_($m['archivo_id']) === '') return ['ok' => false, 'error' => 'Ese modelo no tiene PDF.'];
  try { $a = driveDescargar_(txt_($m['archivo_id'])); } catch (Throwable $e) { return ['ok' => false, 'error' => 'El PDF ya no está en el Drive.']; }
  registrar_($u, 'ver_modelo_fiscal', 'MODELOS_FISCALES', $m['id'], txt_($m['modelo']) . ' ' . txt_($m['periodo']));
  return ['ok' => true, 'nombre' => txt_($m['archivo_nombre']) ?: ($a['nombre'] ?? 'modelo.pdf'), 'tipo' => $a['mime'] ?? 'application/pdf', 'datos' => $a['base64'] ?? ''];
}
