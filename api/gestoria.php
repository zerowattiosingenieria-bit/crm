<?php
/**
 * gestoria.php — Acceso de la gestoría (Cygnus) a la contabilidad (25/11/2026, Nando).
 *
 * «Un usuario específico para la gestoría donde vea todas las facturas, se las
 *  pueda descargar por fecha, las vea contabilizadas en un Excel, vea y pueda
 *  casar los importes del banco contra factura, gasto, etc. Interfaz muy
 *  sencilla y muy gráfica.» Entra por contratas.zerowattios.com con su cuenta.
 *
 * Es una cuenta del portal (PORTAL_CUENTAS.tipo = 'gestoria'), nunca un usuario
 * del CRM: solo puede llamar a las acciones portalGestoria*, que a su vez usan
 * las funciones de contabilidad.php con un usuario «gestoría» que solo tiene
 * el permiso de finanzas (auth.php). Puede:
 *   · ver el resumen (IVA, ingresos/gastos por mes, banco casado);
 *   · ver y descargar todas las facturas (una a una o en ZIP por fechas) y el Excel;
 *   · ver el banco y casar / descasar movimientos con facturas;
 *   · marcar movimientos «no lleva factura» y dejar notas;
 *   · subir facturas que le lleguen.
 * No ve nóminas, márgenes, clientes ni nada más del CRM.
 *
 * Todo lo que ve y hace queda en GESTORIA_ACTIVIDAD, y al terminar cada visita
 * (30 min sin actividad) se manda a Nando un correo con el informe.
 */

const GESTORIA_INACTIVA_MIN = 30;
const GESTORIA_EVENTOS_LIBRES = ['excel' => 'Descargó el Excel de contabilidad', 'zip' => 'Descargó el ZIP de facturas',
  'pdf_iva' => 'Descargó el resumen de IVA', 'banco_excel' => 'Descargó los movimientos del banco en Excel', 'banco_pdf' => 'Descargó los movimientos del banco en PDF', 'pestana' => 'Abrió la pestaña'];

/** El usuario con el que la gestoría usa las funciones de contabilidad. */
function gestoriaU_(array $c): array {
  return ['id' => txt_($c['id']), 'usuario' => 'portal:' . txt_($c['usuario']), 'nombre' => (txt_($c['empresa']) ?: txt_($c['nombre']) ?: 'Gestoría') . ' (gestoría)', 'rol' => 'gestoria'];
}

function esGestoria_(array $c): bool { return normal_($c['tipo'] ?? '') === 'gestoria'; }

/** Apunta lo que ha visto o hecho (para el informe a Nando). */
function gestoriaApuntar_(array $c, string $accion, string $detalle, string $ref = ''): void {
  if (!empty($c['_vista_previa']) || !empty($c['_interno'])) return;   // el superadmin mirando «como» o Nando desde el CRM no cuentan
  try {
    insertar_('GESTORIA_ACTIVIDAD', ['fecha' => ahora_(), 'cuenta_id' => txt_($c['id']), 'usuario' => txt_($c['usuario']),
      'accion' => $accion, 'detalle' => trozo_($detalle, 0, 600), 'ref' => trozo_($ref, 0, 190), 'reportado' => '']);
    registrar_(portalQuien_($c), 'gestoria_' . $accion, 'GESTORIA', $ref, trozo_($detalle, 0, 300));
  } catch (Throwable $e) { /* el informe nunca puede tumbar lo que hace la gestoría */ }
}

function gestoriaRango_(array $p): array {
  $d = txt_($p['desde'] ?? ''); $h = txt_($p['hasta'] ?? '');
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) $d = '';
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $h)) $h = hoyISO_();
  return [$d, $h];
}

function gestoriaTextoRango_(string $d, string $h): string {
  $f = fn($x) => $x === '' ? 'el principio' : substr($x, 8, 2) . '/' . substr($x, 5, 2) . '/' . substr($x, 0, 4);
  return 'del ' . $f($d) . ' al ' . $f($h);
}

function gestoriaEur_($n): string { return number_format((float)$n, 2, ',', '.') . ' €'; }

/* ======================================================================
   Entrada: atenderPortal_ manda aquí las acciones portalGestoria*.
   ====================================================================== */

const GESTORIA_ACCIONES = [
  'portalGestoriaResumen' => 'gestoriaResumen_', 'portalGestoriaFacturas' => 'gestoriaFacturas_',
  'portalGestoriaArchivo' => 'gestoriaArchivo_', 'portalGestoriaBanco' => 'gestoriaBanco_',
  'portalGestoriaCandidatos' => 'gestoriaCandidatos_', 'portalGestoriaFacturasMov' => 'gestoriaFacturasMov_',
  'portalGestoriaCasados' => 'gestoriaCasados_', 'portalGestoriaCasar' => 'gestoriaCasar_',
  'portalGestoriaDescasar' => 'gestoriaDescasar_', 'portalGestoriaSinFactura' => 'gestoriaSinFactura_',
  'portalGestoriaNota' => 'gestoriaNota_', 'portalGestoriaSubir' => 'gestoriaSubir_', 'portalGestoriaAnotar' => 'gestoriaAnotar_'
];
const GESTORIA_ESCRIBEN = ['portalGestoriaCasar', 'portalGestoriaDescasar', 'portalGestoriaSinFactura', 'portalGestoriaNota', 'portalGestoriaSubir'];

function atenderGestoria_(array $c, array $p, string $accion): array {
  if (!esGestoria_($c)) return ['ok' => false, 'error' => 'Acción desconocida.'];
  $fn = GESTORIA_ACCIONES[$accion] ?? null;
  if (!$fn) return ['ok' => false, 'error' => 'Acción desconocida.'];
  if (!empty($c['_vista_previa']) && in_array($accion, GESTORIA_ESCRIBEN, true)) return ['ok' => false, 'error' => 'Vista previa: aquí no se puede cambiar nada.'];
  try { return $fn($c, $p); }
  catch (Throwable $e) { return ['ok' => false, 'error' => $e->getMessage()]; }
}

/** Lo que devuelve portalInicio para la gestoría. */
function portalInicioGestoria_(array $c): array {
  $anios = [];
  foreach (leer_('FACTURAS_DOC') as $f) { $y = substr(txt_($f['fecha']), 0, 4); if (preg_match('/^20\d{2}$/', $y)) $anios[$y] = 1; }
  foreach (leer_('BANCO') as $m) { $y = substr(txt_($m['fecha']), 0, 4); if (preg_match('/^20\d{2}$/', $y)) $anios[$y] = 1; }
  krsort($anios);
  $cfg = config_();
  return ['gestoria' => true, 'anios' => array_keys($anios) ?: [substr(hoyISO_(), 0, 4)],
    'categorias' => array_map(fn($k, $v) => [$k, $v], array_keys(CATEGORIAS_DOC_NOMBRE), array_values(CATEGORIAS_DOC_NOMBRE)),
    'conceptos_sin_factura' => CONCEPTOS_SIN_FACTURA, 'empresa' => ['nombre' => 'Zero Wattios Ingeniería, S.L.', 'nif' => txt_($cfg['empresa_cif'] ?? 'B25935073')]];
}

/* ---------- resumen ---------- */

function gestoriaResumen_(array $c, array $p): array {
  [$d, $h] = gestoriaRango_($p);
  $u = gestoriaU_($c);
  $cuadre = accCuadreContable_($u, ['desde' => $d, 'hasta' => $h]);
  $en = fn($fe) => ($d === '' || strcmp($fe, $d) >= 0) && strcmp($fe, $h) <= 0;
  $meses = []; $cats = []; $prov = []; $clis = [];
  $mes = function ($fe) use (&$meses) {
    $k = substr($fe, 0, 7);
    if (!isset($meses[$k])) $meses[$k] = ['mes' => $k, 'ingresos' => 0.0, 'gastos' => 0.0, 'iva_rep' => 0.0, 'iva_sop' => 0.0, 'entradas' => 0.0, 'salidas' => 0.0, 'n_emi' => 0, 'n_rec' => 0];
    return $k;
  };
  $tot = ['emi_base' => 0.0, 'emi_iva' => 0.0, 'emi_total' => 0.0, 'rec_base' => 0.0, 'rec_iva' => 0.0, 'rec_total' => 0.0, 'rec_irpf' => 0.0, 'emi_irpf' => 0.0];
  $nombres = [];
  foreach (leer_('FACTURAS_DOC') as $f) {
    $fe = txt_($f['fecha']); if ($fe === '' || !$en($fe)) continue;
    $k = $mes($fe);
    if (txt_($f['tipo']) === 'emitida') {
      $meses[$k]['ingresos'] += num_($f['base']); $meses[$k]['iva_rep'] += num_($f['iva']); $meses[$k]['n_emi']++;
      $tot['emi_base'] += num_($f['base']); $tot['emi_iva'] += num_($f['iva']); $tot['emi_total'] += num_($f['total']); $tot['emi_irpf'] += num_($f['irpf']);
      $q = txt_($f['receptor']) ?: 'Sin nombre'; $clis[$q] = ($clis[$q] ?? 0) + num_($f['total']);
    } else {
      $meses[$k]['gastos'] += num_($f['base']); $meses[$k]['iva_sop'] += num_($f['iva']); $meses[$k]['n_rec']++;
      $tot['rec_base'] += num_($f['base']); $tot['rec_iva'] += num_($f['iva']); $tot['rec_total'] += num_($f['total']); $tot['rec_irpf'] += num_($f['irpf']);
      $cat = txt_($f['categoria']) ?: 'otro'; $cn = CATEGORIAS_DOC_NOMBRE[$cat] ?? ($nombres[$cat] ?? $cat);
      $cats[$cn] = ($cats[$cn] ?? 0) + num_($f['base']);
      $q = txt_($f['emisor']) ?: 'Sin nombre'; $prov[$q] = ($prov[$q] ?? 0) + num_($f['total']);
    }
  }
  foreach (leer_('BANCO') as $m) {
    $fe = txt_($m['fecha']); if ($fe === '' || !$en($fe)) continue;
    $k = $mes($fe); $imp = num_($m['importe']);
    if ($imp > 0) $meses[$k]['entradas'] += $imp; else $meses[$k]['salidas'] += -$imp;
  }
  ksort($meses);
  foreach ($meses as &$x) foreach ($x as $kk => $v) if (is_float($v)) $x[$kk] = redondear_($v, 2);
  unset($x);
  arsort($cats); arsort($prov); arsort($clis);
  $top = fn($a) => array_map(fn($k, $v) => ['nombre' => $k, 'importe' => redondear_($v, 2)], array_keys(array_slice($a, 0, 8, true)), array_values(array_slice($a, 0, 8, true)));
  foreach ($tot as $kk => $v) $tot[$kk] = redondear_($v, 2);
  if (empty($p['silencio'])) gestoriaApuntar_($c, 'resumen', 'Vio el resumen ' . gestoriaTextoRango_($d, $h));
  return ['ok' => true, 'desde' => $d, 'hasta' => $h, 'cuadre' => $cuadre, 'meses' => array_values($meses), 'totales' => $tot,
          'categorias' => $top($cats), 'proveedores' => $top($prov), 'clientes' => $top($clis)];
}

const CATEGORIAS_DOC_NOMBRE = ['material_fv' => 'Material fotovoltaica', 'material_aero' => 'Material aerotermia', 'bateria' => 'Baterías',
  'montaje' => 'Montaje / subcontrata', 'mano_obra' => 'Mano de obra', 'legalizacion' => 'Legalización y tasas', 'gestion' => 'Gestión de ayudas',
  'comision' => 'Comisiones comerciales', 'captacion' => 'Comisiones de captación', 'transporte' => 'Transporte y dietas', 'marketing' => 'Marketing',
  'administracion' => 'Gestoría y administración', 'estructura' => 'Gastos de estructura', 'otro' => 'Otros'];

/* ---------- facturas ---------- */

function gestoriaFacturaLista_(array $f, array $usado): array {
  $tot = num_($f['total']);
  $hecho = $usado[txt_($f['id'])] ?? 0.0;
  $resto = txt_($f['casada']) === 'si' ? 0.0 : max(0, redondear_(abs($tot) - $hecho, 2));
  return ['id' => $f['id'], 'tipo' => txt_($f['tipo']) === 'emitida' ? 'emitida' : 'recibida', 'numero' => txt_($f['numero']), 'fecha' => txt_($f['fecha']),
    'vencimiento' => txt_($f['vencimiento']), 'emisor' => txt_($f['emisor']), 'emisor_nif' => txt_($f['emisor_nif']),
    'receptor' => txt_($f['receptor']), 'receptor_nif' => txt_($f['receptor_nif']), 'concepto' => txt_($f['concepto']),
    'categoria' => txt_($f['categoria']), 'categoria_nombre' => CATEGORIAS_DOC_NOMBRE[txt_($f['categoria'])] ?? '',
    'base' => num_($f['base']), 'iva_pct' => num_($f['iva_pct']), 'iva' => num_($f['iva']), 'irpf_pct' => num_($f['irpf_pct']), 'irpf' => num_($f['irpf']),
    'total' => $tot, 'casada' => txt_($f['casada']) ?: 'no', 'pendiente' => $resto, 'fecha_pago' => txt_($f['fecha_pago']),
    'medio_pago' => txt_($f['medio_pago']), 'revisar' => txt_($f['revisar']), 'notas' => txt_($f['notas']),
    'tiene_archivo' => txt_($f['archivo_id']) !== '', 'archivo_nombre' => txt_($f['archivo_nombre']), 'mime' => txt_($f['mime'])];
}

function gestoriaFacturas_(array $c, array $p): array {
  [$d, $h] = gestoriaRango_($p);
  if (function_exists('asegurarCasados_')) asegurarCasados_();
  $usado = [];
  foreach (leer_('CASADOS') as $x) { $k = txt_($x['factura_doc_id']); $usado[$k] = ($usado[$k] ?? 0) + num_($x['importe']); }
  $lista = [];
  foreach (leer_('FACTURAS_DOC') as $f) {
    $fe = txt_($f['fecha']);
    if ($d !== '' && strcmp($fe, $d) < 0) continue;
    if (strcmp($fe, $h) > 0) continue;
    $lista[] = gestoriaFacturaLista_($f, $usado);
  }
  usort($lista, fn($a, $b) => strcmp($b['fecha'], $a['fecha']));
  if (empty($p['silencio'])) gestoriaApuntar_($c, 'facturas', 'Vio la lista de facturas ' . gestoriaTextoRango_($d, $h) . ' (' . count($lista) . ')');
  return ['ok' => true, 'desde' => $d, 'hasta' => $h, 'facturas' => $lista];
}

function gestoriaArchivo_(array $c, array $p): array {
  $r = accArchivoFacturaDoc_(gestoriaU_($c), ['id' => txt_($p['id'] ?? '')]);
  if (!empty($r['ok'])) {
    $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
    $que = empty($p['zip']) ? (empty($p['ver']) ? 'Descargó la factura ' : 'Abrió la factura ') : '';
    if ($que !== '' && $f) gestoriaApuntar_($c, empty($p['ver']) ? 'descarga' : 'ver', $que . gestoriaDescFactura_($f), $f['id']);
  }
  return $r;
}

function gestoriaDescFactura_(array $f): string {
  $quien = txt_($f['tipo']) === 'emitida' ? txt_($f['receptor']) : txt_($f['emisor']);
  return (txt_($f['tipo']) === 'emitida' ? 'emitida' : 'recibida') . ' ' . (txt_($f['numero']) ?: $f['id']) . ' · ' . ($quien ?: 'sin nombre') . ' · ' . gestoriaEur_(num_($f['total']));
}

/* ---------- banco ---------- */

function gestoriaBanco_(array $c, array $p): array {
  [$d, $h] = gestoriaRango_($p);
  if (function_exists('asegurarCasados_')) asegurarCasados_();
  $usado = []; $conFacturas = [];
  $docs = indexar_(leer_('FACTURAS_DOC'));
  foreach (leer_('CASADOS') as $x) {
    $b = txt_($x['banco_id']); if ($b === '') continue;
    $usado[$b] = ($usado[$b] ?? 0) + num_($x['importe']);
    $f = $docs[txt_($x['factura_doc_id'])] ?? null;
    if ($f) $conFacturas[$b][] = ['id' => $f['id'], 'numero' => txt_($f['numero']), 'quien' => txt_($f['tipo']) === 'emitida' ? txt_($f['receptor']) : txt_($f['emisor']),
      'importe' => num_($x['importe']), 'casado_id' => txt_($x['id'])];
  }
  $lista = [];
  foreach (leer_('BANCO') as $m) {
    $fe = txt_($m['fecha']);
    if ($d !== '' && strcmp($fe, $d) < 0) continue;
    if (strcmp($fe, $h) > 0) continue;
    $imp = num_($m['importe']);
    $resto = redondear_(abs($imp) - ($usado[txt_($m['id'])] ?? 0), 2);
    $sf = conceptoSinFactura_($m);
    $estado = $resto <= TOLERANCIA_CASAR ? 'casado' : ($sf !== '' ? 'no_lleva' : (($usado[txt_($m['id'])] ?? 0) > 0 ? 'parcial' : 'pendiente'));
    $lista[] = ['id' => $m['id'], 'cuenta' => txt_($m['cuenta']), 'fecha' => $fe, 'concepto' => txt_($m['concepto']), 'importe' => $imp,
      'saldo' => txt_($m['saldo']) === '' ? null : num_($m['saldo']), 'resto' => max(0, $resto), 'estado' => $estado,
      'sin_factura' => $sf, 'sin_factura_nombre' => $sf !== '' ? (CONCEPTOS_SIN_FACTURA[$sf] ?? $sf) : '',
      'nota' => txt_($m['nota_factura'] ?? ''), 'notas' => txt_($m['notas'] ?? ''), 'facturas' => $conFacturas[txt_($m['id'])] ?? []];
  }
  usort($lista, fn($a, $b) => strcmp($b['fecha'], $a['fecha']) ?: strcmp(txt_($b['id']), txt_($a['id'])));
  if (empty($p['silencio'])) gestoriaApuntar_($c, 'banco', 'Vio los movimientos del banco ' . gestoriaTextoRango_($d, $h) . ' (' . count($lista) . ')');
  return ['ok' => true, 'desde' => $d, 'hasta' => $h, 'movimientos' => $lista, 'conceptos' => CONCEPTOS_SIN_FACTURA];
}

function gestoriaCandidatos_(array $c, array $p): array { return accCandidatosBancoFacturaDoc_(gestoriaU_($c), ['id' => txt_($p['id'] ?? '')]); }
function gestoriaFacturasMov_(array $c, array $p): array { return accFacturasParaMovimiento_(gestoriaU_($c), ['id' => txt_($p['id'] ?? '')]); }
function gestoriaCasados_(array $c, array $p): array { return accCasadosFacturaDoc_(gestoriaU_($c), ['id' => txt_($p['id'] ?? '')]); }

function gestoriaCasar_(array $c, array $p): array {
  $id = txt_($p['id'] ?? ''); $bancoId = txt_($p['banco_id'] ?? '');
  $r = accCasarFacturaDoc_(gestoriaU_($c), ['id' => $id, 'medio' => txt_($p['medio'] ?? '') ?: 'banco', 'banco_id' => $bancoId,
    'importe' => num_($p['importe'] ?? 0), 'fecha' => txt_($p['fecha'] ?? ''), 'nota' => trim('Gestoría · ' . txt_($p['nota'] ?? ''), ' ·')]);
  if (!empty($r['ok'])) {
    $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $id));
    $m = $bancoId !== '' ? buscar1_('BANCO', fn($x) => mismo_($x['id'], $bancoId)) : null;
    gestoriaApuntar_($c, 'casar', 'Casó la factura ' . ($f ? gestoriaDescFactura_($f) : $id) . ' con ' .
      ($m ? 'el movimiento del ' . substr(txt_($m['fecha']), 8, 2) . '/' . substr(txt_($m['fecha']), 5, 2) . ' «' . trozo_(txt_($m['concepto']), 0, 60) . '» (' . gestoriaEur_(num_($m['importe'])) . ')' : 'pago por ' . txt_($p['medio'] ?? '')), $id);
  }
  return $r;
}

function gestoriaDescasar_(array $c, array $p): array {
  $id = txt_($p['id'] ?? '');
  $r = accDescasarFacturaDoc_(gestoriaU_($c), ['id' => $id, 'casado_id' => txt_($p['casado_id'] ?? '')]);
  if (!empty($r['ok'])) {
    $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $id));
    gestoriaApuntar_($c, 'descasar', 'Deshizo el casado de la factura ' . ($f ? gestoriaDescFactura_($f) : $id), $id);
  }
  return $r;
}

function gestoriaSinFactura_(array $c, array $p): array {
  $id = txt_($p['id'] ?? ''); $concepto = txt_($p['concepto'] ?? '');
  $nota = trozo_(txt_($p['nota'] ?? ''), 0, 280);
  $r = accMarcarMovimientoSinFactura_(gestoriaU_($c), ['id' => $id, 'concepto' => $concepto, 'nota' => $nota !== '' ? 'Gestoría: ' . $nota : ($concepto === 'otro' ? '' : '')]);
  if (!empty($r['ok'])) {
    $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $id));
    gestoriaApuntar_($c, 'sin_factura', ($concepto === 'lleva' ? 'Marcó que SÍ lleva factura' : 'Marcó «no lleva factura» (' . (CONCEPTOS_SIN_FACTURA[$concepto] ?? $concepto) . ')') .
      ' el movimiento ' . ($m ? substr(txt_($m['fecha']), 8, 2) . '/' . substr(txt_($m['fecha']), 5, 2) . ' «' . trozo_(txt_($m['concepto']), 0, 60) . '» ' . gestoriaEur_(num_($m['importe'])) : $id) .
      ($nota !== '' ? ' · nota: ' . $nota : ''), $id);
  }
  return $r;
}

/** Nota de la gestoría en una factura o en un movimiento del banco. */
function gestoriaNota_(array $c, array $p): array {
  $texto = trim(trozo_(txt_($p['texto'] ?? ''), 0, 500));
  if ($texto === '') return ['ok' => false, 'error' => 'Escribe la nota.'];
  $id = txt_($p['id'] ?? '');
  $sello = '[Gestoría ' . ahoraDT_()->format('d/m H:i') . '] ' . $texto;
  if (normal_($p['de'] ?? '') === 'movimiento') {
    $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $id));
    if (!$m) return ['ok' => false, 'error' => 'Ese movimiento ya no está.'];
    actualizar_('BANCO', $m['id'], ['notas' => trim(txt_($m['notas']) . "\n" . $sello)]);
    gestoriaApuntar_($c, 'nota', 'Dejó una nota en el movimiento ' . substr(txt_($m['fecha']), 8, 2) . '/' . substr(txt_($m['fecha']), 5, 2) . ' «' . trozo_(txt_($m['concepto']), 0, 60) . '» ' . gestoriaEur_(num_($m['importe'])) . ': «' . $texto . '»', $id);
  } else {
    $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $id));
    if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
    actualizar_('FACTURAS_DOC', $f['id'], ['notas' => trim(txt_($f['notas']) . "\n" . $sello), 'modificado' => ahora_(), 'modificado_por' => $c['id']]);
    gestoriaApuntar_($c, 'nota', 'Dejó una nota en la factura ' . gestoriaDescFactura_($f) . ': «' . $texto . '»', $id);
  }
  return ['ok' => true];
}

/** Factura que sube la gestoría: queda contabilizada como cualquier factura escaneada. */
function gestoriaSubir_(array $c, array $p): array {
  $d = is_array($p['factura'] ?? null) ? $p['factura'] : [];
  $f = [];
  foreach (['tipo', 'numero', 'fecha', 'emisor', 'emisor_nif', 'receptor', 'receptor_nif', 'concepto', 'base', 'iva_pct', 'iva', 'irpf_pct', 'irpf', 'total', 'categoria', 'estado_pago', 'fecha_pago'] as $k)
    if (array_key_exists($k, $d)) $f[$k] = $d[$k];
  if (txt_($f['fecha'] ?? '') === '') return ['ok' => false, 'error' => 'Pon la fecha de la factura.'];
  if (num_($f['total'] ?? 0) == 0) return ['ok' => false, 'error' => 'Pon el total de la factura.'];
  $f['notas'] = trim('Subida por la gestoría el ' . ahoraDT_()->format('d/m/Y H:i') . '. ' . trozo_(txt_($d['notas'] ?? ''), 0, 300));
  $r = accGuardarFacturaDoc_(gestoriaU_($c), ['factura' => $f, 'datos' => txt_($p['datos'] ?? ''), 'nombre' => txt_($p['nombre'] ?? ''),
    'mime' => txt_($p['mime'] ?? ''), 'forzar' => !empty($p['forzar'])]);
  if (!empty($r['ok'])) {
    $nueva = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $r['factura']['id'] ?? ''));
    gestoriaApuntar_($c, 'subir', 'Subió la factura ' . ($nueva ? gestoriaDescFactura_($nueva) : ''), $r['factura']['id'] ?? '');
    unset($r['factura']['miniatura'], $r['factura']['texto'], $r['factura']['lineas']);
  }
  return $r;
}

/** Lo que pasa solo en el navegador (descargar el Excel o el ZIP, cambiar de pestaña). */
function gestoriaAnotar_(array $c, array $p): array {
  $e = txt_($p['evento'] ?? '');
  if (!isset(GESTORIA_EVENTOS_LIBRES[$e])) return ['ok' => false];
  gestoriaApuntar_($c, $e, GESTORIA_EVENTOS_LIBRES[$e] . (txt_($p['detalle'] ?? '') !== '' ? ' ' . trozo_(txt_($p['detalle']), 0, 200) : ''));
  return ['ok' => true];
}

/* ======================================================================
   El informe para Nando: al terminar cada visita de la gestoría.
   ====================================================================== */

/** Lo llama el reloj (cron.php) en cada tic. Un correo por cuenta (gestoría o subcontrata) al terminar su visita. */
function gestoriaInformeCron_(): array {
  $pend = array_values(array_filter(leer_('GESTORIA_ACTIVIDAD'), fn($a) => txt_($a['reportado']) === ''));
  if (!$pend) return [];
  usort($pend, fn($a, $b) => strcmp(txt_($a['fecha']), txt_($b['fecha'])));
  $porCuenta = [];
  foreach ($pend as $a) $porCuenta[txt_($a['cuenta_id'])][] = $a;
  $cuentas = indexar_(leer_('PORTAL_CUENTAS'));
  $hecho = [];
  foreach ($porCuenta as $cid => $acts) {
    $ultima = txt_(end($acts)['fecha']);
    if (minutosDesde_($ultima) < GESTORIA_INACTIVA_MIN) continue;
    $cta = $cuentas[$cid] ?? ['tipo' => 'gestoria', 'usuario' => $acts[0]['usuario']];
    $esGest = normal_($cta['tipo'] ?? '') !== 'contrata';
    $nombre = txt_($cta['empresa'] ?? '') ?: txt_($acts[0]['usuario']);
    $destino = txt_(config_()[$esGest ? 'gestoria_informe_a' : 'contratas_informe_a'] ?? '') ?: 'fernandogarcia@zerowattios.com';
    $fecha = substr(txt_($acts[0]['fecha']), 8, 2) . '/' . substr(txt_($acts[0]['fecha']), 5, 2);
    correo_(['to' => $destino, 'subject' => ($esGest ? 'Gestoría · ' : 'Subcontrata · ') . $nombre . ' ha entrado el ' . $fecha . ' (' . count($acts) . ' acciones)',
      'htmlBody' => gestoriaInformeHtml_($acts, $esGest, $nombre), 'name' => 'CRM Zero Wattios']);
    foreach ($acts as $a) actualizar_('GESTORIA_ACTIVIDAD', $a['id'], ['reportado' => ahora_()]);
    $hecho[] = ['cuenta' => $nombre, 'acciones' => count($acts)];
  }
  return $hecho ? ['informes' => $hecho] : [];
}

function gestoriaInformeHtml_(array $acts, bool $esGest = true, string $nombre = ''): string {
  $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
  $grupos = ['hizo' => 'Lo que ha cambiado', 'bajo' => 'Lo que se ha descargado', 'vio' => 'Lo que ha consultado', 'entrada' => 'Entradas'];
  $de = fn($acc) => $acc === 'entrada' ? 'entrada' : (in_array($acc, ['descarga', 'excel', 'zip', 'pdf_iva', 'banco_excel', 'banco_pdf', 'c_descargar'], true) ? 'bajo'
    : (in_array($acc, ['casar', 'descasar', 'sin_factura', 'nota', 'subir'], true) || (strpos($acc, 'c_') === 0 && !in_array($acc, ['c_inicio', 'c_obra', 'c_docs'], true)) ? 'hizo' : 'vio'));
  $por = [];
  foreach ($acts as $a) $por[$de(txt_($a['accion']))][] = $a;
  $ini = txt_($acts[0]['fecha']); $fin = txt_(end($acts)['fecha']);
  $min = max(1, (int)round((strtotime($fin) - strtotime($ini)) / 60));
  $cambios = count($por['hizo'] ?? []);
  $cuerpo = '<p style="margin:0 0 6px;font-size:15px">' . ($esGest ? 'La gestoría <b>' . $e($nombre ?: $acts[0]['usuario']) . '</b> ha entrado en la contabilidad.' : 'La subcontrata <b>' . $e($nombre ?: $acts[0]['usuario']) . '</b> ha entrado en su app de obras.') . '</p>' .
    '<p style="margin:0 0 16px;color:#555">Desde las ' . substr($ini, 11, 5) . ' del ' . substr($ini, 8, 2) . '/' . substr($ini, 5, 2) .
    ' hasta las ' . substr($fin, 11, 5) . ' · unos ' . $min . ' min · ' . count($acts) . ' acciones · ' .
    ($cambios ? '<b style="color:#5E8C00">' . $cambios . ' cambios</b>' : 'sin cambios') . '</p>';
  foreach ($grupos as $k => $tit) {
    if (empty($por[$k])) continue;
    $cuerpo .= '<h3 style="margin:18px 0 6px;font-size:14px;border-left:4px solid #B4FA1E;padding-left:8px">' . $tit . ' (' . count($por[$k]) . ')</h3><table style="border-collapse:collapse;width:100%;font-size:13px">';
    /* lo consultado y las entradas, sin repetir: la primera hora y cuántas veces */
    if ($k === 'vio' || $k === 'entrada') {
      $u = [];
      foreach ($por[$k] as $a) { $d = txt_($a['detalle']); if (isset($u[$d])) $u[$d]['n']++; else $u[$d] = $a + ['n' => 1]; }
      $por[$k] = array_map(fn($a) => $a['n'] > 1 ? array_merge($a, ['detalle' => txt_($a['detalle']) . ' (' . $a['n'] . ' veces)']) : $a, array_values($u));
    }
    foreach ($por[$k] as $a) $cuerpo .= '<tr><td style="padding:4px 8px;color:#888;white-space:nowrap;vertical-align:top">' . substr(txt_($a['fecha']), 11, 5) . '</td><td style="padding:4px 8px;border-bottom:1px solid #eee">' . $e($a['detalle']) . '</td></tr>';
    $cuerpo .= '</table>';
  }
  $cuerpo .= '<p style="margin:18px 0 0;color:#888;font-size:12px">' . ($esGest ? 'Los cambios quedan en el CRM con «Gestoría» en la nota. Puedes ver todo en CRM › Subcontratas › Cuentas › Gestoría.' : 'Míralo de un vistazo en CRM › Control de subcontratas.') . '</p>';
  return '<div style="font-family:Arial,sans-serif;max-width:680px;color:#242422"><div style="background:#242422;color:#B4FA1E;padding:12px 16px;font-weight:bold">ZERO WATTIOS · ' . ($esGest ? 'Informe de la gestoría' : 'Informe de la subcontrata') . '</div><div style="padding:16px;border:1px solid #eee">' . $cuerpo . '</div></div>';
}

/** Para el CRM (superadmin o dirección): lo último que ha hecho la gestoría. */
function accActividadGestoria_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $l = leer_('GESTORIA_ACTIVIDAD');
  usort($l, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
  return ['ok' => true, 'actividad' => array_map(fn($a) => ['fecha' => $a['fecha'], 'usuario' => $a['usuario'], 'accion' => $a['accion'], 'detalle' => $a['detalle']], array_slice($l, 0, 200))];
}

/**
 * La misma pantalla de la gestoría dentro del CRM (25/11/2026, Nando: «exactamente lo mismo que
 * ven ellas»). Solo Nando, Fernando y el superadmin. p.sub = la acción portal* de la gestoría.
 * Lo que se hace desde aquí no sale en el informe de la gestoría.
 */
function accVistaGestoria_(array $u, array $p): array {
  if (empty(permisos_($u)['vistagestoria'])) throw new Exception('Esta vista es solo para Nando, Fernando y el superadmin.');
  $sub = txt_($p['sub'] ?? '');
  $c = ['id' => txt_($u['id']), 'usuario' => txt_($u['usuario']), 'nombre' => txt_($u['nombre']), 'empresa' => 'Zero Wattios', 'tipo' => 'gestoria', '_interno' => true];
  if ($sub === 'portalInicio') return ['ok' => true, 'cuenta' => ['nombre' => txt_($u['nombre']), 'empresa' => 'la gestoría (vista de Zero Wattios)', 'usuario' => txt_($u['usuario'])]] + portalInicioGestoria_($c);
  if (!isset(GESTORIA_ACCIONES[$sub])) return ['ok' => false, 'error' => 'Acción desconocida.'];
  unset($p['sub'], $p['accion'], $p['token']);
  $r = atenderGestoria_($c, $p, $sub);
  if ($sub === 'portalGestoriaCasar' || $sub === 'portalGestoriaDescasar' || $sub === 'portalGestoriaSinFactura' || $sub === 'portalGestoriaSubir') {
    registrar_($u, 'vista_gestoria_' . substr($sub, 14), 'GESTORIA', txt_($p['id'] ?? ''), '');
  }
  return $r;
}

/* ---------- lo que hace cada subcontrata (25/11/2026: «el mismo informe de la gestoría, de las subcontratas») ---------- */

function contrataObraTexto_(string $obraId): string {
  if ($obraId === '') return '';
  $o = buscar1_('OBRAS', fn($x) => mismo_($x['id'], $obraId));
  if (!$o) return '';
  $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $o['cliente_id']));
  return trim(txt_($cli['direccion'] ?? '') . ' · ' . txt_($cli['nombre'] ?? ''), ' ·') . ' (' . (PORTAL_ESPECIALIDADES[normal_($o['especialidad'])] ?? '') . ')';
}

function contrataFase_(string $k): string {
  foreach (PORTAL_FASES as $l) foreach ($l as $f) if ($f[0] === $k) return $f[1];
  return $k;
}

function contrataApuntar_(array $c, string $accion, array $p, array $r): void {
  if (!empty($c['_vista_previa'])) return;
  $obra = contrataObraTexto_(txt_($p['obra_id'] ?? ($p['id'] ?? '')));
  $en = $obra !== '' ? ' en ' . $obra : '';
  switch ($accion) {
    case 'portalInicio': gestoriaApuntar_($c, 'c_inicio', 'Consultó sus obras y avisos'); break;
    case 'portalObra': gestoriaApuntar_($c, 'c_obra', 'Abrió la ficha de la obra ' . ($obra ?: txt_($p['id'] ?? ''))); break;
    case 'portalLlegada': gestoriaApuntar_($c, 'c_llegada', (normal_($p['tipo'] ?? '') === 'salida' ? 'Marcó la salida' : 'Marcó la llegada') . $en); break;
    case 'portalFase': gestoriaApuntar_($c, 'c_fase', (empty($p['hecho']) && isset($p['hecho']) ? 'Desmarcó la fase «' : 'Marcó hecha la fase «') . contrataFase_(txt_($p['clave'] ?? '')) . '»' . $en); break;
    case 'portalAviso': gestoriaApuntar_($c, 'c_aviso', 'Marcó un aviso como hecho' . $en); break;
    case 'portalTerminar': gestoriaApuntar_($c, 'c_terminar', 'Dio por TERMINADA la obra' . ($obra !== '' ? ' ' . $obra : '')); break;
    case 'portalNota': gestoriaApuntar_($c, 'c_nota', 'Dejó una nota' . $en . ': «' . trozo_(txt_($p['texto'] ?? ''), 0, 200) . '»'); break;
    case 'portalSubir': gestoriaApuntar_($c, 'c_subir', 'Subió ' . (strpos(txt_($p['mime'] ?? ''), 'image') === 0 ? 'una foto' : 'un documento') . $en . (txt_($p['fase'] ?? '') !== '' ? ' (fase ' . txt_($p['fase']) . ')' : '')); break;
    case 'portalTicket': gestoriaApuntar_($c, 'c_ticket', 'Abrió una incidencia' . $en . ': «' . trozo_(txt_($p['titulo'] ?? '') ?: txt_($p['detalle'] ?? ''), 0, 160) . '» (' . (txt_($p['prioridad'] ?? '') ?: 'media') . ')'); break;
    case 'portalMensaje':
      $t = buscar1_('TICKETS', fn($x) => mismo_($x['id'], $p['ticket_id'] ?? ''));
      gestoriaApuntar_($c, 'c_mensaje', 'Escribió en «' . txt_($t['titulo'] ?? '') . '»: «' . trozo_(txt_($p['texto'] ?? ''), 0, 200) . '»'); break;
    case 'portalVisitaHecha': gestoriaApuntar_($c, 'c_visita', 'Marcó una visita como hecha'); break;
    case 'portalDescargar': gestoriaApuntar_($c, 'c_descargar', 'Descargó un documento' . ($obra !== '' ? ' de ' . $obra : '')); break;
    case 'portalDocsContrata': gestoriaApuntar_($c, 'c_docs', 'Consultó su documentación de empresa'); break;
    case 'portalSubirDocContrata': gestoriaApuntar_($c, 'c_doc_empresa', 'Subió un documento de empresa (' . txt_($p['tipo'] ?? '') . ')'); break;
    case 'portalMaterial': gestoriaApuntar_($c, 'c_material', 'Actualizó el material' . $en); break;
    case 'portalSubirFactura': gestoriaApuntar_($c, 'c_factura', 'Subió una factura' . $en); break;
    case 'portalCambiarClave': gestoriaApuntar_($c, 'c_clave', 'Cambió su clave'); break;
  }
}
