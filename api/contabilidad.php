<?php
/**
 * contabilidad.php — Facturas escaneadas (20/11/2026, orden de Nando).
 *
 * Se sube una factura en PDF o en imagen (o se le hace una foto con el móvil),
 * el navegador la lee entera (texto del PDF u OCR de la imagen), propone los
 * datos y, al guardarla, queda contabilizada:
 *   · el archivo va al Drive de la empresa (FACTURAS ESCANEADAS · CRM / año-mes);
 *   · los datos y el texto completo quedan en FACTURAS_DOC;
 *   · una factura recibida crea o actualiza su GASTO (así cuenta en la
 *     contabilidad, el margen de la obra y el paquete de la gestoría);
 *   · una factura emitida crea o actualiza su FACTURA.
 * Se puede asociar a un cliente, a un concepto de gasto o a ambos.
 * Solo la dirección (permiso «finanzas»).
 */

const CATEGORIAS_DOC = ['material_fv', 'material_aero', 'bateria', 'montaje', 'mano_obra', 'legalizacion', 'gestion',
  'comision', 'captacion', 'transporte', 'marketing', 'administracion', 'estructura', 'otro'];

/** Carpeta del Drive para las facturas escaneadas de un mes (2026-11). */
function carpetaFacturasDoc_(string $fecha): string {
  $raiz = carpetaDeLaCasa_('ID_CARPETA_FACTURAS_DOC', 'FACTURAS ESCANEADAS · CRM ZERO WATTIOS');
  $mes = preg_match('/^\d{4}-\d{2}/', $fecha) ? substr($fecha, 0, 7) : substr(hoyISO_(), 0, 7);
  return driveCarpeta_($mes, $raiz, true);
}

/** Lo que viaja en las listas: sin el texto completo ni la miniatura grande. */
function facturaDocLigera_(array $f): array {
  unset($f['texto'], $f['lineas'], $f['_fila']);
  return $f;
}

/** Lista de facturas escaneadas (más recientes primero). p.desde / p.hasta opcionales. */
function accFacturasDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $desde = txt_($p['desde'] ?? ''); $hasta = txt_($p['hasta'] ?? '');
  /* búsqueda: en todas las fechas, por número, emisor, cliente, NIF, concepto, archivo, importe o cualquier texto de la factura */
  $q = trim(txt_($p['q'] ?? ''));
  if ($q !== '') {
    $importeQ = preg_match('/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/', $q) ? num_(strpos($q, ',') !== false ? str_replace(['.', ','], ['', '.'], $q) : $q) : null;
    $toks = array_filter(explode(' ', preg_replace('/[^a-z0-9ñ ]/u', ' ', normal_($q))));
    $clientes = []; foreach (leer_('CLIENTES') as $c) $clientes[txt_($c['id'])] = txt_($c['nombre']) . ' ' . txt_($c['direccion']);
    $lista = array_values(array_filter(leer_('FACTURAS_DOC'), function ($f) use ($toks, $importeQ, $clientes) {
      if ($importeQ !== null && $importeQ > 0) foreach (['total', 'base'] as $c) if (abs(num_($f[$c]) - $importeQ) < 0.011) return true;
      $hay = ' ' . preg_replace('/[^a-z0-9ñ ]/u', ' ', normal_(implode(' ', [$f['id'], $f['numero'], $f['emisor'], $f['emisor_nif'], $f['receptor'], $f['receptor_nif'],
        $f['concepto'], $f['archivo_nombre'], $f['notas'], $f['revisar'], $clientes[txt_($f['cliente_id'])] ?? '', $f['texto']]))) . ' ';
      $hayJunto = str_replace(' ', '', $hay);
      foreach ($toks as $t) if (strpos($hay, $t) === false && strpos($hayJunto, $t) === false) return false;
      return (bool)$toks;
    }));
    $lista = ordenar_($lista, fn($a, $b) => comparar_(txt_($b['fecha']), txt_($a['fecha'])));
    return ['ok' => true, 'facturas' => array_map('facturaDocLigera_', array_slice($lista, 0, 200)), 'busqueda' => $q];
  }
  $lista = array_values(array_filter(leer_('FACTURAS_DOC'), function ($f) use ($desde, $hasta) {
    $fe = txt_($f['fecha']);
    if ($desde !== '' && strcmp($fe, $desde) < 0) return false;
    if ($hasta !== '' && strcmp($fe, $hasta) > 0) return false;
    return true;
  }));
  $lista = ordenar_($lista, fn($a, $b) => comparar_(txt_($b['fecha']) . txt_($b['creado']), txt_($a['fecha']) . txt_($a['creado'])));
  return ['ok' => true, 'facturas' => array_map('facturaDocLigera_', $lista)];
}

/** Una factura con su texto completo y sus líneas. */
function accFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  unset($f['_fila']);
  return ['ok' => true, 'factura' => $f];
}

/** El archivo original (PDF o imagen) en base64. */
function accArchivoFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f || txt_($f['archivo_id']) === '') return ['ok' => false, 'error' => 'Esa factura no tiene archivo.'];
  try { $a = driveDescargar_(txt_($f['archivo_id'])); }
  catch (Throwable $e) { return ['ok' => false, 'error' => 'El archivo ya no está en el Drive de la empresa.']; }
  return ['ok' => true, 'nombre' => txt_($f['archivo_nombre']), 'mime' => txt_($f['mime']) ?: ($a['mime'] ?? ''),
          'datos' => $a['base64'] ?? ''];
}

/**
 * Guarda una factura escaneada. p.factura con los datos; p.datos (base64),
 * p.nombre y p.mime solo la primera vez, con el archivo.
 */
function accGuardarFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $d = is_array($p['factura'] ?? null) ? $p['factura'] : [];
  $campos = ['tipo', 'numero', 'fecha', 'vencimiento', 'emisor', 'emisor_nif', 'receptor', 'receptor_nif',
             'concepto', 'base', 'iva_pct', 'iva', 'irpf_pct', 'irpf', 'total', 'cliente_id', 'operacion_id',
             'categoria', 'estado_pago', 'fecha_pago', 'texto', 'lineas', 'notas', 'miniatura'];
  $f = [];
  /* factura subida desde la ficha de un gasto que ya existe: se enlaza a ese gasto sin crear otro */
  $d0 = $p['factura'] ?? [];
  if (txt_($d0['gasto_id'] ?? '') !== '' && txt_($d0['id'] ?? '') === '' && buscar1_('GASTOS', fn($g) => mismo_($g['id'], $d0['gasto_id']))) {
    $f['gasto_id'] = txt_($d0['gasto_id']); $f['origen'] = 'adjunto';
  }
  foreach ($campos as $c) if (array_key_exists($c, $d)) $f[$c] = is_array($d[$c]) ? json_encode($d[$c], JSON_UNESCAPED_UNICODE) : $d[$c];

  /* comprobaciones */
  /* Al editar una factura sin mandar el tipo se conserva el que tiene (antes se volvía «recibida»). */
  if (txt_($d['id'] ?? '') === '' || array_key_exists('tipo', $f)) {
    $tipo = normal_($f['tipo'] ?? 'recibida') === 'emitida' ? 'emitida' : 'recibida';
    $f['tipo'] = $tipo;
  }
  if (isset($f['categoria']) && txt_($f['categoria']) !== '' && !in_array(txt_($f['categoria']), CATEGORIAS_DOC, true)) $f['categoria'] = 'otro';
  if (txt_($f['cliente_id'] ?? '') !== '' && !buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $f['cliente_id']))) {
    return ['ok' => false, 'error' => 'Ese cliente no existe.'];
  }
  /* Si no viene la instalación pero sí el cliente, se coge su operación viva más reciente. */
  if (txt_($f['cliente_id'] ?? '') !== '' && txt_($f['operacion_id'] ?? '') === '') {
    $ops = array_values(array_filter(leer_('OPERACIONES'), fn($o) => mismo_($o['cliente_id'], $f['cliente_id']) && normal_($o['estado']) !== 'cancelada'));
    if ($ops) $f['operacion_id'] = txt_(end($ops)['id']);
  }
  foreach (['base', 'iva_pct', 'iva', 'irpf_pct', 'irpf', 'total'] as $c) if (array_key_exists($c, $f)) $f[$c] = $f[$c] === '' ? '' : redondear_(num_($f[$c]), 2);
  if (txt_($f['fecha'] ?? '') === '' && txt_($d['id'] ?? '') === '') $f['fecha'] = hoyISO_();
  if (array_key_exists('miniatura', $f)) $f['miniatura'] = trozo_(txt_($f['miniatura']), 0, 60000);
  if (array_key_exists('texto', $f)) $f['texto'] = trozo_(txt_($f['texto']), 0, 200000);
  if (txt_($f['fecha_pago'] ?? '') !== '') $f['estado_pago'] = 'pagado';

  $id = txt_($d['id'] ?? '');
  if ($id !== '') {
    $actual = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $id));
    if (!$actual) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
    $f['modificado'] = ahora_(); $f['modificado_por'] = $u['id'];
    $r = actualizar_('FACTURAS_DOC', $id, $f);
  } else {
    /* duplicada: mismo NIF, mismo número y mismo total */
    $nif = normal_($f['emisor_nif'] ?? ''); $numero = normal_($f['numero'] ?? '');
    if ($numero !== '' && empty($p['forzar'])) {
      $dup = buscar1_('FACTURAS_DOC', fn($x) => normal_($x['numero']) === $numero && normal_($x['emisor_nif']) === $nif
        && abs(num_($x['total']) - num_($f['total'] ?? 0)) < 0.01);
      if ($dup) return ['ok' => false, 'duplicada' => $dup['id'], 'error' => 'Esa factura ya está guardada (' . $dup['id'] . ', ' . txt_($dup['emisor']) . ' nº ' . txt_($dup['numero']) . ').'];
    }
    /* Factura que ya está en el Drive (01-FACTURACION): se enlaza tal cual, sin volver a subirla. */
    $driveId = txt_($p['archivo_drive_id'] ?? '');
    if ($driveId !== '') {
      $ya = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['archivo_id'], $driveId));
      if ($ya) return ['ok' => false, 'duplicada' => $ya['id'], 'error' => 'Ese archivo del Drive ya está importado (' . $ya['id'] . ').'];
      $f += ['origen' => 'drive', 'archivo_id' => $driveId, 'archivo_nombre' => txt_($p['nombre'] ?? ''), 'mime' => txt_($p['mime'] ?? ''),
             'creado' => ahora_(), 'creado_por' => $u['id']];
      $r = insertar_('FACTURAS_DOC', $f);
      $r = contabilizarFacturaDoc_($u, $r);
      registrar_($u, 'importar_factura_drive', 'FACTURAS_DOC', $r['id'], trozo_(txt_($r['emisor']) . ' · ' . txt_($r['numero']), 0, 160));
      return ['ok' => true, 'factura' => facturaDocLigera_($r)];
    }
    $datos = txt_($p['datos'] ?? '');
    if ($datos === '') return ['ok' => false, 'error' => 'No ha llegado el archivo de la factura.'];
    if (strlen($datos) > 16 * 1024 * 1024) return ['ok' => false, 'error' => 'El archivo pasa de 12 MB.'];
    $mime = txt_($p['mime'] ?? '') ?: 'application/octet-stream';
    $ext = $mime === 'application/pdf' ? 'pdf' : (strpos($mime, 'png') !== false ? 'png' : 'jpg');
    $limpio = fn($s) => trim(preg_replace('/[^\p{L}\p{N} ._-]+/u', ' ', $s));
    $nombre = trim(($f['fecha'] ?? hoyISO_()) . ' ' . $limpio(txt_($f['emisor'] ?? '') ?: 'factura') .
      (txt_($f['numero'] ?? '') !== '' ? ' nº ' . $limpio(txt_($f['numero'])) : '')) . '.' . $ext;
    $archivo = driveSubir_(carpetaFacturasDoc_(txt_($f['fecha'] ?? '')), $nombre, $datos, $mime);
    $f += ['archivo_id' => $archivo['id'] ?? '', 'archivo_nombre' => $nombre, 'mime' => $mime,
           'creado' => ahora_(), 'creado_por' => $u['id']];
    $r = insertar_('FACTURAS_DOC', $f);
  }

  $r = contabilizarFacturaDoc_($u, $r);
  registrar_($u, $id !== '' ? 'editar_factura_doc' : 'alta_factura_doc', 'FACTURAS_DOC', $r['id'],
    trozo_(txt_($r['emisor']) . ' · ' . txt_($r['numero']) . ' · ' . txt_($r['total']), 0, 160));
  return ['ok' => true, 'factura' => facturaDocLigera_($r)];
}

/** Crea o actualiza el gasto (recibida) o la factura (emitida) que le corresponde. */
function contabilizarFacturaDoc_(array $u, array $f): array {
  /* Las del Drive son facturas que ya existían: solo se enlazan con lo que ya hay en el CRM, nunca se crean ni se tocan. */
  if (txt_($f['origen'] ?? '') === 'drive') return enlazarFacturaDrive_($f);
  /* adjuntada a un gasto que ya existía: solo se apunta el nº de factura en el gasto si no lo tenía */
  if (txt_($f['origen'] ?? '') === 'adjunto') {
    $g = txt_($f['gasto_id']) !== '' ? buscar1_('GASTOS', fn($x) => mismo_($x['id'], $f['gasto_id'])) : null;
    if ($g && txt_($g['factura_proveedor']) === '' && txt_($f['numero']) !== '') actualizar_('GASTOS', $g['id'], ['factura_proveedor' => txt_($f['numero'])]);
    return $f;
  }
  $concepto = txt_($f['concepto']) !== '' ? txt_($f['concepto']) : ('Factura ' . txt_($f['numero']));
  if (txt_($f['tipo']) === 'emitida') {
    $datos = ['numero' => txt_($f['numero']), 'operacion_id' => txt_($f['operacion_id']), 'cliente_id' => txt_($f['cliente_id']),
      'fecha_emision' => txt_($f['fecha']), 'concepto' => $concepto, 'base' => num_($f['base']),
      'iva_pct' => num_($f['iva_pct']) ?: 21, 'iva' => num_($f['iva']), 'total' => num_($f['total']),
      'fecha_vencimiento' => txt_($f['vencimiento']), 'fecha_cobro' => txt_($f['fecha_pago']),
      'url' => txt_($f['archivo_id']) !== '' ? 'https://drive.google.com/file/d/' . txt_($f['archivo_id']) . '/view' : '',
      'notas' => 'Escaneada ' . txt_($f['id'])];
    if (txt_($datos['fecha_cobro']) !== '') $datos['estado'] = 'cobrada';
    $ya = txt_($f['factura_id']) !== '' ? buscar1_('FACTURAS', fn($x) => mismo_($x['id'], $f['factura_id'])) : null;
    if ($ya) actualizar_('FACTURAS', $ya['id'], $datos);
    else {
      $datos += ['estado' => 'emitida', 'emitida_por' => $u['id']];
      $nueva = insertar_('FACTURAS', $datos);
      $f = actualizar_('FACTURAS_DOC', $f['id'], ['factura_id' => $nueva['id']]);
    }
    return $f;
  }
  $datos = ['operacion_id' => txt_($f['operacion_id']), 'categoria' => txt_($f['categoria']) ?: 'otro',
    'proveedor' => txt_($f['emisor']), 'concepto' => $concepto, 'importe' => num_($f['total']),
    'iva_pct' => num_($f['iva_pct']), 'fecha' => txt_($f['fecha']),
    'estado_pago' => txt_($f['estado_pago']) ?: 'pendiente', 'fecha_pago' => txt_($f['fecha_pago']),
    'factura_proveedor' => txt_($f['numero']), 'notas' => 'Factura escaneada ' . txt_($f['id'])];
  $ya = txt_($f['gasto_id']) !== '' ? buscar1_('GASTOS', fn($x) => mismo_($x['id'], $f['gasto_id'])) : null;
  if ($ya) actualizar_('GASTOS', $ya['id'], $datos);
  else {
    $nuevo = insertar_('GASTOS', $datos + ['creado' => ahora_(), 'creado_por' => $u['id']]);
    $f = actualizar_('FACTURAS_DOC', $f['id'], ['gasto_id' => $nuevo['id']]);
  }
  return $f;
}

/** Borra la factura escaneada, su archivo y el gasto o la factura que creó. */
function accBorrarFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  soltarCasados_(txt_($f['id']));
  $delDrive = txt_($f['origen'] ?? '') === 'drive';   /* del Drive: el archivo y el gasto/factura no son nuestros, se quedan */
  $adjunto = txt_($f['origen'] ?? '') === 'adjunto';   /* adjuntada a un gasto que ya existía: el gasto se queda */
  if (!$delDrive && !$adjunto && txt_($f['gasto_id']) !== '') borrar_('GASTOS', $f['gasto_id']);
  if (!$delDrive && txt_($f['factura_id']) !== '') borrar_('FACTURAS', $f['factura_id']);
  if (!$delDrive && txt_($f['archivo_id']) !== '') { try { driveBorrar_(txt_($f['archivo_id'])); } catch (Throwable $e) {} }
  borrar_('FACTURAS_DOC', $f['id']);
  registrar_($u, 'borrar_factura_doc', 'FACTURAS_DOC', $f['id'], txt_($f['emisor']) . ' · ' . txt_($f['numero']));
  return ['ok' => true];
}

/* ---------- casar cada factura con su cobro o pago (20/11/2026) ----------
   «Hay que casar cada factura de ingreso o banco contra caja, cash o
   tarjeta» (Nando). Cada factura escaneada se casa con:
     · un movimiento del banco (transferencia, recibo… o el cargo de la tarjeta), o
     · tarjeta sin movimiento todavía en el banco, o
     · efectivo (caja).
   Y al revés: los movimientos del banco que no tienen factura casada se listan
   para buscarla. */

/* 20/11/2026 (2.ª parte): «intenta casar todo, y lo que no case déjalo indicado en el CRM
   para poder casarlo manualmente o indicarlo manualmente». Una factura puede casarse con
   varios movimientos (pagos parciales) y un movimiento con varias facturas (transferencia
   que paga varias). Cada trozo es una fila de CASADOS. Lo que no casa queda con su motivo
   en FACTURAS_DOC.revisar, y los movimientos se pueden marcar «no lleva factura». */

const MEDIOS_PAGO = ['banco', 'tarjeta', 'efectivo', 'otro'];
const TOLERANCIA_CASAR = 0.05;

/* Movimientos que no llevan factura, cada uno en su concepto (20/11/2026, Nando: «que salgan por
   separado nóminas, Seguridad Social, impuestos y traspasos, y que pueda meter estos conceptos»).
   El concepto es la categoría del banco; si no la tiene, se deduce del texto. «otro» = marcado a mano. */
const CONCEPTOS_SIN_FACTURA = ['nominas' => 'Nóminas', 'seguridad_social' => 'Seguridad Social', 'impuestos' => 'Impuestos',
  'traspaso' => 'Traspasos entre cuentas', 'financiacion' => 'Préstamos y financiación', 'banco' => 'Comisiones del banco', 'otro' => 'Otros sin factura'];
function conceptoSinFactura_(array $m): string {
  $marca = txt_($m['sin_factura'] ?? '');
  if ($marca === 'lleva') return '';
  $cat = txt_($m['categoria']);
  if ($cat !== 'otro' && isset(CONCEPTOS_SIN_FACTURA[$cat])) return $cat;
  if ($marca === 'si') return 'otro';
  $t = txt_($m['concepto']);
  if (preg_match('/n[oó]mina|salario|haberes/i', $t)) return 'nominas';
  if (preg_match('/tgss|seg\.?\s*social|cotizaci[oó]n|seguridad social/i', $t)) return 'seguridad_social';
  if (preg_match('/aeat|agencia tributaria|hacienda|impuesto|modelo\s?\d{3}|autoliquidaci/i', $t)) return 'impuestos';
  if (preg_match('/traspaso/i', $t)) return 'traspaso';
  if (preg_match('/pr[eé]stamo|amortizaci[oó]n|liquidaci[oó]n intereses/i', $t)) return 'financiacion';
  if (preg_match('/comisi[oó]n|mantenimiento cuenta/i', $t)) return 'banco';
  return '';
}

function casadosDe_(string $campo, string $id): array {
  return array_values(array_filter(leer_('CASADOS'), fn($c) => mismo_($c[$campo], $id)));
}
/** Lo que queda del movimiento sin casar (en positivo). */
function restoMovimiento_(array $m, ?array $todos = null): float {
  $usado = 0.0;
  foreach ($todos ?? leer_('CASADOS') as $c) if (mismo_($c['banco_id'], $m['id'])) $usado += num_($c['importe']);
  return redondear_(abs(num_($m['importe'])) - $usado, 2);
}
/** Lo que queda de la factura sin casar (en positivo). Una línea «otro» (indicada a mano) la da por cerrada. */
function restoFactura_(array $f, ?array $todos = null): float {
  $usado = 0.0;
  foreach ($todos ?? leer_('CASADOS') as $c) if (mismo_($c['factura_doc_id'], $f['id'])) {
    if (txt_($c['medio']) === 'otro' && num_($c['importe']) == 0) return 0.0;
    $usado += num_($c['importe']);
  }
  return redondear_(abs(num_($f['total'])) - $usado, 2);
}

/** Recalcula el estado de la factura a partir de sus casados. */
function recalcularCasada_(array $u, string $id): array {
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $id));
  if (!$f) return [];
  $cs = casadosDe_('factura_doc_id', $id);
  $resto = restoFactura_($f, $cs);
  $usado = redondear_(array_sum(array_map(fn($c) => num_($c['importe']), $cs)), 2);
  $medios = array_values(array_unique(array_map(fn($c) => txt_($c['medio']), $cs)));
  $estado = !$cs ? 'no' : (abs($resto) <= TOLERANCIA_CASAR || ($resto < 0 && count($cs) === 1) ? 'si' : ($resto < 0 ? 'si' : 'parcial'));
  if (num_($f['total']) == 0 && $cs) $estado = 'si';
  $fechas = array_filter(array_map(fn($c) => txt_($c['fecha']), $cs));
  $cambios = ['casada' => $estado, 'importe_casado' => $usado,
    'banco_id' => implode(',', array_filter(array_map(fn($c) => txt_($c['banco_id']), $cs))),
    'medio_pago' => count($medios) > 1 ? 'varios' : ($medios[0] ?? ''),
    'fecha_pago' => $fechas ? max($fechas) : '', 'fecha_casada' => $cs ? ahora_() : '',
    'estado_pago' => $estado === 'si' ? 'pagado' : ($estado === 'parcial' ? 'parcial' : 'pendiente')];
  if ($estado === 'si') $cambios['revisar'] = '';
  elseif ($estado === 'parcial') $cambios['revisar'] = 'Casada en parte: faltan ' . number_format($resto, 2, ',', '.') . ' €';
  $r = actualizar_('FACTURAS_DOC', $id, $cambios);
  return contabilizarFacturaDoc_($u, $r);
}

/** Marca el movimiento como conciliado (o no) según sus casados. */
function recalcularMovimiento_(string $bancoId): void {
  $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $bancoId));
  if (!$m) return;
  $cs = casadosDe_('banco_id', $bancoId);
  $ids = array_values(array_unique(array_map(fn($c) => txt_($c['factura_doc_id']), $cs)));
  $notas = trim(preg_replace('/\s*·?\s*Facturas?:[^·]*/u', '', txt_($m['notas'])), ' ·');
  if ($ids) $notas = trim($notas . ' · Facturas: ' . implode(', ', $ids), ' ·');
  $cambios = ['notas' => $notas];
  if ($ids) $cambios['conciliado'] = 'si';
  elseif (txt_($m['gasto_id']) === '' && txt_($m['cobro_id']) === '') $cambios['conciliado'] = 'no';
  actualizar_('BANCO', $m['id'], $cambios);
}

/** Palabras con las que se reconoce a la otra parte en el concepto del banco (que viene cortado). */
function claveContraparte_(array $f): array {
  $quien = txt_($f['tipo']) === 'emitida' ? txt_($f['receptor']) : txt_($f['emisor']);
  $s = preg_replace('/[^a-z0-9 ]/', ' ', normal_(preg_replace('/\b(s\.?l\.?u?|s\.?a\.?u?|s\.?coop)\b\.?/i', '', $quien)));
  $pal = array_values(array_filter(explode(' ', $s), fn($w) => strlen($w) >= 3 && !in_array($w, ['del', 'los', 'las', 'grupo', 'factura'], true)));
  return ['compacto' => str_replace(' ', '', $s), 'palabras' => $pal, 'numero' => preg_replace('/[^a-z0-9]/', '', normal_($f['numero']))];
}
const PALABRAS_BANCO_VACIAS = ['pago', 'oferta', 'factura', 'transfer', 'transf', 'transferencia', 'inmediata', 'favor', 'recibo', 'compra', 'tarj', 'tarjeta', 'www', 'com', 'ref', 'adeudo', 'abono', 'para', 'por', 'emitida', 'su'];
/** ¿El concepto del banco nombra a la otra parte de la factura? */
function nombraContraparte_(string $concepto, array $clave): bool {
  $toks = array_filter(explode(' ', preg_replace('/[^a-z0-9 ]/', ' ', normal_($concepto))), fn($w) => strlen($w) >= 3 && !in_array($w, PALABRAS_BANCO_VACIAS, true));
  $num = preg_replace('/[^a-z0-9]/', '', normal_($concepto));
  foreach ($toks as $w) {
    if (strlen($w) >= 4 && $clave['compacto'] !== '' && strpos($clave['compacto'], $w) !== false) return true;
    foreach ($clave['palabras'] as $p) if (strlen($w) >= 3 && strpos($p, $w) === 0) return true;
  }
  if (strlen($clave['numero']) >= 4) foreach ($toks as $w) if (strlen($w) >= 3 && strpos($clave['numero'], $w) === 0 && preg_match('/\d|-/', $concepto)) return true;
  return false;
}

/** Movimientos del banco que pueden ser el pago o el cobro de una factura (también los parciales de la misma contraparte). */
function accCandidatosBancoFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  $todos = leer_('CASADOS');
  $pend = restoFactura_($f, $todos);
  $signo = txt_($f['tipo']) === 'emitida' ? 1 : -1;
  $fecha = txt_($f['fecha']) ?: hoyISO_();
  $clave = claveContraparte_($f);
  $lista = [];
  foreach (leer_('BANCO') as $m) {
    $imp = num_($m['importe']);
    if ($imp * $signo <= 0) continue;
    $resto = restoMovimiento_($m, $todos);
    if ($resto <= TOLERANCIA_CASAR) continue;
    $dias = (int)round((strtotime(txt_($m['fecha'])) - strtotime($fecha)) / 86400);
    if ($dias < -120 || $dias > 180) continue;
    $nombra = nombraContraparte_(txt_($m['concepto']), $clave);
    $dif = abs($resto - $pend);
    $exacto = $dif <= max(TOLERANCIA_CASAR, $pend * 0.01);
    if (!$exacto && !$nombra) continue;
    $puntos = ($exacto ? 100 - $dif * 20 : 40) - abs($dias) * 0.4 + ($nombra ? 25 : 0) + ($dias >= 0 ? 5 : 0);
    $lista[] = ['id' => $m['id'], 'cuenta' => txt_($m['cuenta']), 'fecha' => txt_($m['fecha']), 'concepto' => txt_($m['concepto']),
      'importe' => $imp, 'resto' => $resto, 'dias' => $dias, 'exacto' => $exacto, 'nombra' => $nombra, 'puntos' => round($puntos, 1),
      'tarjeta' => (bool)preg_match('/tarj|card|compra\s|visa|mastercard|www\.|amazon|pccomponentes/i', txt_($m['concepto']))];
  }
  usort($lista, fn($a, $b) => $b['puntos'] <=> $a['puntos']);
  return ['ok' => true, 'pendiente' => $pend, 'candidatos' => array_slice($lista, 0, 15)];
}

/** Guarda un trozo de casado (sin recalcular). Devuelve error o ''. */
function casarTrozo_(array $u, array $f, string $medio, string $bancoId, float $importe, string $fecha, string $nota): string {
  if ($bancoId !== '') {
    $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $bancoId));
    if (!$m) return 'Ese movimiento del banco ya no está.';
    $signo = txt_($f['tipo']) === 'emitida' ? 1 : -1;
    if (num_($m['importe']) * $signo <= 0) return txt_($f['tipo']) === 'emitida' ? 'Una factura emitida se casa con un ingreso.' : 'Una factura recibida se casa con un pago.';
    if (buscar1_('CASADOS', fn($c) => mismo_($c['banco_id'], $bancoId) && mismo_($c['factura_doc_id'], $f['id']))) return 'Ese movimiento ya está casado con esta factura.';
    $resto = restoMovimiento_($m);
    if ($resto <= TOLERANCIA_CASAR) return 'Ese movimiento ya está casado entero con otras facturas.';
    if ($importe <= 0) $importe = min($resto, max(restoFactura_($f), 0) ?: $resto);
    if ($importe > $resto + TOLERANCIA_CASAR) $importe = $resto;
    $fecha = txt_($m['fecha']);
  } else {
    if ($medio === 'banco') return 'Elige el movimiento del banco.';
    if ($medio === 'otro' && $nota === '') return 'Indica el motivo.';
    if ($importe <= 0 && $medio !== 'otro') $importe = max(restoFactura_($f), 0);
    $fecha = $fecha ?: hoyISO_();
  }
  insertar_('CASADOS', ['factura_doc_id' => $f['id'], 'banco_id' => $bancoId, 'importe' => redondear_($importe, 2), 'medio' => $medio,
    'fecha' => $fecha, 'notas' => $nota, 'creado' => ahora_(), 'creado_por' => $u['id']]);
  if ($bancoId !== '') recalcularMovimiento_($bancoId);
  return '';
}

/**
 * Casa la factura con un pago o cobro (se puede repetir para pagos parciales).
 * p.id, p.medio (banco | tarjeta | efectivo | otro), p.banco_id, p.importe (opcional:
 * lo que quede), p.fecha (sin movimiento), p.nota (obligatoria con «otro»; «otro» sin importe la da por cerrada).
 */
function accCasarFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  $medio = normal_($p['medio'] ?? '');
  if (!in_array($medio, MEDIOS_PAGO, true)) return ['ok' => false, 'error' => 'Elige banco, tarjeta, efectivo u otro.'];
  $bancoId = txt_($p['banco_id'] ?? '');
  if ($bancoId !== '' && $medio === 'efectivo') $medio = 'banco';
  $err = casarTrozo_($u, $f, $medio, $bancoId, num_($p['importe'] ?? 0), txt_($p['fecha'] ?? ''), trozo_(txt_($p['nota'] ?? ''), 0, 300));
  if ($err !== '') return ['ok' => false, 'error' => $err];
  $r = recalcularCasada_($u, $f['id']);
  registrar_($u, 'casar_factura_doc', 'FACTURAS_DOC', $f['id'], $medio . ($bancoId !== '' ? ' ' . $bancoId : ''));
  $resto = restoFactura_($r);
  return ['ok' => true, 'factura' => facturaDocLigera_($r), 'aviso' => $r['casada'] === 'parcial' ? 'Faltan ' . number_format($resto, 2, ',', '.') . ' € por casar.' : ''];
}

/**
 * Casa a la vez varias facturas con varios movimientos (una transferencia que paga varias
 * facturas, o una factura pagada en varios pagos). p.facturas = [ids], p.movimientos = [ids].
 * Reparte por orden de fecha.
 */
function accCasarLote_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $fs = []; foreach ((array)($p['facturas'] ?? []) as $id) { $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $id)); if ($f) $fs[] = $f; }
  $ms = []; foreach ((array)($p['movimientos'] ?? []) as $id) { $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $id)); if ($m) $ms[] = $m; }
  if (!$fs || !$ms) return ['ok' => false, 'error' => 'Elige al menos una factura y un movimiento.'];
  $r = repartirCasado_($u, $fs, $ms, 'banco', trozo_(txt_($p['nota'] ?? ''), 0, 300));
  registrar_($u, 'casar_lote', 'FACTURAS_DOC', implode(',', array_map(fn($f) => $f['id'], $fs)), implode(',', array_map(fn($m) => $m['id'], $ms)));
  return ['ok' => true] + $r;
}

/** Reparte el dinero de los movimientos entre las facturas, por fechas. */
function repartirCasado_(array $u, array $fs, array $ms, string $medio, string $nota): array {
  usort($fs, fn($a, $b) => strcmp(txt_($a['fecha']), txt_($b['fecha'])));
  usort($ms, fn($a, $b) => strcmp(txt_($a['fecha']), txt_($b['fecha'])));
  $todos = leer_('CASADOS');
  $restoM = []; foreach ($ms as $m) $restoM[$m['id']] = restoMovimiento_($m, $todos);
  $trozos = 0;
  foreach ($fs as $f) {
    $falta = restoFactura_($f, $todos);
    foreach ($ms as $m) {
      if ($falta <= TOLERANCIA_CASAR) break;
      if ($restoM[$m['id']] <= TOLERANCIA_CASAR) continue;
      $imp = min($falta, $restoM[$m['id']]);
      $err = casarTrozo_($u, $f, $medio, $m['id'], $imp, '', $nota);
      if ($err !== '') continue;
      $restoM[$m['id']] = redondear_($restoM[$m['id']] - $imp, 2); $falta = redondear_($falta - $imp, 2); $trozos++;
    }
  }
  $out = [];
  foreach ($fs as $f) $out[] = facturaDocLigera_(recalcularCasada_($u, $f['id']));
  return ['trozos' => $trozos, 'facturas' => $out];
}

/** Deshace los casados de la factura (todos, o solo p.casado_id). */
function accDescasarFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  soltarCasados_($f['id'], txt_($p['casado_id'] ?? ''));
  $r = recalcularCasada_($u, $f['id']);
  registrar_($u, 'descasar_factura_doc', 'FACTURAS_DOC', $f['id'], txt_($p['casado_id'] ?? 'todo'));
  return ['ok' => true, 'factura' => facturaDocLigera_($r)];
}

function soltarCasados_(string $facturaId, string $soloCasado = ''): void {
  foreach (casadosDe_('factura_doc_id', $facturaId) as $c) {
    if ($soloCasado !== '' && !mismo_($c['id'], $soloCasado)) continue;
    borrar_('CASADOS', $c['id']);
    if (txt_($c['banco_id']) !== '') recalcularMovimiento_(txt_($c['banco_id']));
  }
}
/* compatibilidad con el borrado de facturas */
function soltarMovimiento_(array $f): void { soltarCasados_(txt_($f['id'])); }

/** Casados de una factura, con el concepto del movimiento (para la ventana). */
function accCasadosFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $out = [];
  foreach (casadosDe_('factura_doc_id', txt_($p['id'] ?? '')) as $c) {
    $m = txt_($c['banco_id']) !== '' ? buscar1_('BANCO', fn($x) => mismo_($x['id'], $c['banco_id'])) : null;
    unset($c['_fila']);
    $out[] = $c + ['concepto' => $m ? txt_($m['concepto']) : '', 'cuenta' => $m ? txt_($m['cuenta']) : '', 'importe_mov' => $m ? num_($m['importe']) : 0];
  }
  return ['ok' => true, 'casados' => $out];
}

/** Las casadas antiguas (un solo banco_id en la factura) pasan a CASADOS. Una vez. */
function asegurarCasados_(): void {
  static $hecho = false;
  if ($hecho) return; $hecho = true;
  if (prop_('casados_migrados') === 'si') return;
  $ya = [];
  foreach (leer_('CASADOS') as $c) $ya[txt_($c['factura_doc_id'])] = 1;
  foreach (leer_('FACTURAS_DOC') as $f) {
    if (txt_($f['casada']) !== 'si' || isset($ya[txt_($f['id'])])) continue;
    $b = txt_($f['banco_id']);
    insertar_('CASADOS', ['factura_doc_id' => $f['id'], 'banco_id' => $b, 'importe' => abs(num_($f['total'])),
      'medio' => txt_($f['medio_pago']) ?: ($b !== '' ? 'banco' : 'efectivo'), 'fecha' => txt_($f['fecha_pago']),
      'notas' => '', 'creado' => ahora_(), 'creado_por' => 'migracion']);
    actualizar_('FACTURAS_DOC', $f['id'], ['importe_casado' => abs(num_($f['total']))]);
  }
  setProp_('casados_migrados', 'si');
}

/* ---------- casado automático de todo lo pendiente ---------- */

/** Subconjuntos de $items (cada uno [id, importe]) que suman $objetivo. Para en 2 soluciones (para saber si es única). */
function subconjuntosQueSuman_(array $items, float $objetivo, int $max = 6): array {
  usort($items, fn($a, $b) => $b[1] <=> $a[1]);
  $items = array_slice($items, 0, 26);
  $sol = []; $n = count($items); $pasos = 0;
  $suf = array_fill(0, $n + 1, 0.0);
  for ($i = $n - 1; $i >= 0; $i--) $suf[$i] = $suf[$i + 1] + $items[$i][1];
  $rec = function ($i, $suma, $elegidos) use (&$rec, &$sol, &$pasos, $items, $n, $objetivo, $max, $suf) {
    if (count($sol) >= 2 || ++$pasos > 200000) return;
    if (abs($suma - $objetivo) <= TOLERANCIA_CASAR && $elegidos) { $sol[] = $elegidos; return; }
    if ($i >= $n || count($elegidos) >= $max || $suma > $objetivo + TOLERANCIA_CASAR || $suma + $suf[$i] < $objetivo - TOLERANCIA_CASAR) return;
    $rec($i + 1, $suma + $items[$i][1], array_merge($elegidos, [$items[$i][0]]));
    $rec($i + 1, $suma, $elegidos);
  };
  $rec(0, 0.0, []);
  return $sol;
}

/** Si las soluciones solo se diferencian en qué factura de igual importe entra, se queda con las más antiguas. */
function solucionSinAmbiguedad_(array $sol, array $cand, array $fs): array {
  if (count($sol) < 2) return $sol;
  $imp = []; foreach ($cand as [$id, $v]) $imp[$id] = number_format($v, 2, '.', '');
  $firma = function ($s) use ($imp) { $a = array_map(fn($id) => $imp[$id] ?? '?', $s); sort($a); return implode('+', $a); };
  if ($firma($sol[0]) !== $firma($sol[1])) return $sol;
  $fecha = []; foreach ($fs as $f) $fecha[$f['id']] = txt_($f['fecha']);
  $porImp = [];
  foreach ($cand as [$id, $v]) $porImp[$imp[$id]][] = $id;
  foreach ($porImp as &$l) usort($l, fn($a, $b) => strcmp($fecha[$a] ?? '', $fecha[$b] ?? '')); unset($l);
  $cuenta = array_count_values(array_map(fn($id) => $imp[$id], $sol[0]));
  $elegidas = [];
  foreach ($cuenta as $v => $n) $elegidas = array_merge($elegidas, array_slice($porImp[$v], 0, $n));
  return [$elegidas];
}

function fechaCortaTxt_($f): string { $f = txt_($f); return strlen($f) >= 10 ? substr($f, 8, 2) . '/' . substr($f, 5, 2) . '/' . substr($f, 0, 4) : $f; }

/** Aplica la sugerencia de casado de una factura (lo pulsa una persona de dirección). */
function accAplicarSugerenciaCasado_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  $s = json_decode(txt_($f['sugerencia'] ?? ''), true);
  if (!is_array($s) || empty($s['banco_id'])) return ['ok' => false, 'error' => 'Esta factura ya no tiene sugerencia.'];
  $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $s['banco_id']));
  if (!$m || restoMovimiento_($m) <= TOLERANCIA_CASAR) return ['ok' => false, 'error' => 'Ese movimiento ya está casado con otra cosa.'];
  if (($s['tipo'] ?? '') === 'suplido') {
    $nota = trim(txt_($f['notas']) . ' · Total corregido ' . date('d/m') . ': el PDF suma ' . number_format(num_($s['diferencia']), 2, ',', '.') . ' € de tasas o suplidos sin IVA (' .
      number_format(num_($f['total']), 2, ',', '.') . ' → ' . number_format(num_($s['total']), 2, ',', '.') . ' €)', ' ·');
    $f = actualizar_('FACTURAS_DOC', $f['id'], ['total' => redondear_(num_($s['total']), 2), 'notas' => $nota, 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  }
  $err = casarTrozo_($u, $f, 'banco', $m['id'], 0, '', 'Sugerencia aceptada (' . ($s['tipo'] ?? '') . ')');
  if ($err !== '') return ['ok' => false, 'error' => $err];
  actualizar_('FACTURAS_DOC', $f['id'], ['sugerencia' => '', 'revisar' => '']);
  $r = recalcularCasada_($u, $f['id']);
  registrar_($u, 'aplicar_sugerencia_casado', 'FACTURAS_DOC', $f['id'], ($s['tipo'] ?? '') . ' ' . $m['id']);
  return ['ok' => true, 'factura' => facturaDocLigera_($r)];
}

/**
 * Intenta casar todo lo pendiente:
 *  1) factura ↔ movimiento con el mismo importe (si es único o el más cercano en fecha);
 *  2) un movimiento que paga varias facturas de la misma contraparte (suma exacta y única);
 *  3) una factura pagada en varios movimientos de la misma contraparte (suma exacta y única).
 * Lo que queda se marca con su motivo en FACTURAS_DOC.revisar.
 */
function accAutoCasar_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $res = ['exactas' => 0, 'agrupadas' => 0, 'fraccionadas' => 0];
  $banco = leer_('BANCO');
  $ignorar = '/traspaso|n[oó]mina|seg\.?\s*social|tgss|aeat|agencia tributaria|hacienda|impuesto|pr[eé]stamo|liquidaci[oó]n/i';
  $pendientes = function () { $t = leer_('CASADOS'); return array_values(array_filter(leer_('FACTURAS_DOC'), fn($f) => num_($f['total']) != 0 && restoFactura_($f, $t) > TOLERANCIA_CASAR)); };
  $libres = function () use ($ignorar) { $t = leer_('CASADOS'); $o = [];
    foreach (leer_('BANCO') as $m) { if (conceptoSinFactura_($m) !== '') continue;
      $r = restoMovimiento_($m, $t); if ($r > TOLERANCIA_CASAR) $o[] = $m + ['_resto' => $r]; } return $o; };
  $dias = fn($a, $b) => (int)round((strtotime($b) - strtotime($a)) / 86400);
  $signoOk = fn($f, $m) => num_($m['importe']) * (txt_($f['tipo']) === 'emitida' ? 1 : -1) > 0;

  $res['devoluciones'] = 0; $res['unicas'] = 0; $res['sugerencias'] = 0;
  /* 0) 25/11/2026 (Nando: «esfuérzate más en casar facturas»): un cargo y su devolución (mismo importe, signo
     contrario, mismo concepto, pocos días) se anulan entre sí: no llevan factura. */
  $ms0 = $libres();
  foreach ($ms0 as $i => $a) {
    if (num_($a['importe']) >= 0 || abs($a['_resto'] - abs(num_($a['importe']))) > TOLERANCIA_CASAR) continue;
    foreach ($ms0 as $j => $b) {
      if ($i === $j || num_($b['importe']) <= 0 || abs(abs(num_($b['importe'])) - abs(num_($a['importe']))) > TOLERANCIA_CASAR) continue;
      if (abs($b['_resto'] - abs(num_($b['importe']))) > TOLERANCIA_CASAR) continue;
      if (abs($dias(txt_($a['fecha']), txt_($b['fecha']))) > 7) continue;
      $ka = substr(preg_replace('/[^a-z0-9]/', '', normal_($a['concepto'])), 0, 12); $kb = substr(preg_replace('/[^a-z0-9]/', '', normal_($b['concepto'])), 0, 12);
      if ($ka === '' || $ka !== $kb) continue;
      $ya = buscar1_('BANCO', fn($x) => mismo_($x['id'], $a['id'])); $yb = buscar1_('BANCO', fn($x) => mismo_($x['id'], $b['id']));
      if (!$ya || !$yb || txt_($ya['sin_factura'] ?? '') !== '' || txt_($yb['sin_factura'] ?? '') !== '') continue;
      actualizar_('BANCO', $a['id'], ['sin_factura' => 'si', 'nota_factura' => 'Devuelto: se anula con ' . $b['id'] . ' (' . txt_($b['fecha']) . ')']);
      actualizar_('BANCO', $b['id'], ['sin_factura' => 'si', 'nota_factura' => 'Devolución de ' . $a['id'] . ' (' . txt_($a['fecha']) . ')']);
      $ms0[$i]['_resto'] = 0; $ms0[$j]['_resto'] = 0; $res['devoluciones'] += 2;
      break;
    }
  }

  /* 1) mismo importe: emparejar por cercanía de fecha, nombre primero */
  $fs = $pendientes(); $ms = $libres(); $pares = [];
  $t = leer_('CASADOS');
  foreach ($fs as $f) {
    $pend = restoFactura_($f, $t); $clave = claveContraparte_($f); $fe = txt_($f['fecha']) ?: hoyISO_();
    foreach ($ms as $m) {
      if (!$signoOk($f, $m) || abs($m['_resto'] - $pend) > TOLERANCIA_CASAR) continue;
      $d = $dias($fe, txt_($m['fecha']));
      $nom = nombraContraparte_(txt_($m['concepto']), $clave);
      /* los proveedores cobran a veces por adelantado («PAGO OFERTA…»): con el nombre, el pago puede ir hasta 100 días antes */
      if ($d > 120 || $d < ($nom ? -100 : -20)) continue;
      $pares[] = ['f' => $f, 'm' => $m, 'peso' => ($nom ? 0 : 1000) + ($d < 0 ? 3 * -$d + 10 : $d)];
    }
  }
  usort($pares, fn($a, $b) => $a['peso'] <=> $b['peso']);
  $uf = []; $um = [];
  foreach ($pares as $x) {
    if (isset($uf[$x['f']['id']]) || isset($um[$x['m']['id']])) continue;
    if ($x['peso'] >= 1000 && $x['peso'] - 1000 > 60) continue;   /* sin nombre y lejos en fecha: no */
    if (casarTrozo_($u, $x['f'], preg_match('/www\.|amazon|pccomponentes|compra|tarj/i', txt_($x['m']['concepto'])) ? 'tarjeta' : 'banco', $x['m']['id'], 0, '', 'Casado automático') === '') {
      $uf[$x['f']['id']] = 1; $um[$x['m']['id']] = 1; recalcularCasada_($u, $x['f']['id']); $res['exactas']++;
    }
  }

  /* 1b) mismo importe sin el nombre en el banco (p. ej. «PAGO PRESUPUESTO» que adelanta una factura posterior):
     solo si ese movimiento es el único con ese importe para esa factura y esa factura la única para ese movimiento. */
  $fs = $pendientes(); $ms = $libres(); $t = leer_('CASADOS');
  $porF = []; $porM = [];
  foreach ($fs as $f) {
    $pend = restoFactura_($f, $t); $fe = txt_($f['fecha']) ?: hoyISO_();
    foreach ($ms as $m) {
      if (!$signoOk($f, $m) || abs($m['_resto'] - $pend) > TOLERANCIA_CASAR) continue;
      $d = $dias($fe, txt_($m['fecha'])); if ($d < -100 || $d > 150) continue;
      $porF[$f['id']][] = $m; $porM[$m['id']][] = $f;
    }
  }
  foreach ($porF as $fid => $lm) {
    if (count($lm) !== 1 || count($porM[$lm[0]['id']] ?? []) !== 1) continue;
    $f = $porM[$lm[0]['id']][0];
    if (casarTrozo_($u, $f, 'banco', $lm[0]['id'], 0, '', 'Casado automático: mismo importe, único posible') === '') { recalcularCasada_($u, $f['id']); $res['unicas']++; }
  }

  /* 2) un movimiento → varias facturas de la misma contraparte */
  $fs = $pendientes(); $t = leer_('CASADOS');
  foreach ($libres() as $m) {
    $cand = [];
    foreach ($fs as $f) {
      if (!$signoOk($f, $m) || txt_($f['casada']) === 'si') continue;
      $d = $dias(txt_($f['fecha']) ?: hoyISO_(), txt_($m['fecha'])); if ($d < -100 || $d > 150) continue;
      if (!nombraContraparte_(txt_($m['concepto']), claveContraparte_($f))) continue;
      $cand[] = [$f['id'], restoFactura_($f, $t)];
    }
    if (count($cand) < 2) continue;
    $sol = subconjuntosQueSuman_($cand, $m['_resto']);
    $sol = solucionSinAmbiguedad_($sol, $cand, $fs);
    if (count($sol) !== 1 || count($sol[0]) < 2) continue;
    $elegidas = array_values(array_filter($fs, fn($f) => in_array($f['id'], $sol[0], true)));
    repartirCasado_($u, $elegidas, [$m], 'banco', 'Casado automático: una transferencia para ' . count($elegidas) . ' facturas');
    $res['agrupadas'] += count($elegidas);
    $fs = $pendientes(); $t = leer_('CASADOS');
  }

  /* 3) una factura → varios movimientos de la misma contraparte */
  foreach ($pendientes() as $f) {
    $t = leer_('CASADOS'); $pend = restoFactura_($f, $t); $clave = claveContraparte_($f); $fe = txt_($f['fecha']) ?: hoyISO_();
    $cand = []; $porId = [];
    foreach ($libres() as $m) {
      if (!$signoOk($f, $m)) continue;
      $d = $dias($fe, txt_($m['fecha'])); if ($d < -120 || $d > 180) continue;
      if (!nombraContraparte_(txt_($m['concepto']), $clave)) continue;
      $cand[] = [$m['id'], $m['_resto']]; $porId[$m['id']] = $m;
    }
    if (count($cand) < 2) continue;
    $sol = subconjuntosQueSuman_($cand, $pend, 4);
    if (count($sol) !== 1 || count($sol[0]) < 2) continue;
    repartirCasado_($u, [$f], array_map(fn($id) => $porId[$id], $sol[0]), 'banco', 'Casado automático: pagada en ' . count($sol[0]) . ' veces');
    $res['fraccionadas']++;
  }

  /* facturas del Drive aún sin su gasto o su factura del CRM: se vuelven a intentar enlazar */
  foreach (leer_('FACTURAS_DOC') as $f) {
    if (txt_($f['origen'] ?? '') !== 'drive') continue;
    if ((txt_($f['tipo']) === 'emitida' && txt_($f['factura_id']) === '') || (txt_($f['tipo']) !== 'emitida' && txt_($f['gasto_id']) === '')) enlazarFacturaDrive_($f);
  }

  /* 4) sugerencias para confirmar con un clic (no se cambia nada solo):
     - «suplido»: el PDF suma además tasas o suplidos sin IVA que no entraron en el total leído (CITE: 306,88 + 183,12
       de tasas de Industria = 490,00); el PDF contiene el importe del pago y la diferencia.
     - «mismo importe lejos»: un único movimiento con el mismo importe, pero a más de 100–150 días. */
  $t = leer_('CASADOS'); $libresS = $libres(); $usadosS = [];
  $fmt = fn($x) => [number_format($x, 2, ',', '.'), number_format($x, 2, ',', ''), number_format($x, 2, '.', '')];
  $pendS = $pendientes();
  /* primero todas las parejas posibles «suplido», y se reparten por cercanía de fecha (cada pago, una factura) */
  $parejas = [];
  foreach ($pendS as $f) {
    $resto = restoFactura_($f, $t); $fe = txt_($f['fecha']) ?: hoyISO_();
    $texto = ' ' . preg_replace('/\s+/', ' ', txt_($f['texto'])) . ' ';
    if (trim($texto) === '') continue;
    $clave = claveContraparte_($f);
    $pref = preg_match('/^([a-z]{3,})/', normal_(txt_($f['numero'])), $mm) ? $mm[1] : '';
    $esta = fn($x) => (bool)array_filter($fmt($x), fn($s) => strpos($texto, $s) !== false);
    foreach ($libresS as $m) {
      if (!$signoOk($f, $m)) continue;
      $imp = $m['_resto']; $dif = redondear_($imp - $resto, 2);
      if ($dif <= 1) continue;
      $d = $dias($fe, txt_($m['fecha'])); if ($d < -60 || $d > 90) continue;
      $nombra = nombraContraparte_(txt_($m['concepto']), $clave) || ($pref !== '' && strpos(normal_($m['concepto']), $pref) !== false);
      if ($nombra && $esta($imp) && $esta($dif)) $parejas[] = [$f, $m, $dif, abs($d) + ($d < 0 ? 5 : 0)];
    }
  }
  usort($parejas, fn($a, $b) => $a[3] <=> $b[3]);
  $sugs = [];
  foreach ($parejas as [$f, $m, $dif]) {
    if (isset($sugs[$f['id']]) || isset($usadosS[$m['id']])) continue;
    $usadosS[$m['id']] = 1;
    $sugs[$f['id']] = ['tipo' => 'suplido', 'banco_id' => $m['id'], 'total' => redondear_(num_($f['total']) + $dif, 2), 'diferencia' => $dif,
      'texto' => 'El PDF suma ' . number_format($dif, 2, ',', '.') . ' € más (tasas o suplidos sin IVA): total real ' . number_format(num_($f['total']) + $dif, 2, ',', '.') .
        ' €, que es justo el pago del ' . fechaCortaTxt_($m['fecha']) . ' («' . trozo_(txt_($m['concepto']), 0, 40) . '»).'];
  }
  /* después, «mismo importe lejos»: un único movimiento libre con ese importe en todo el año */
  foreach ($pendS as $f) {
    if (isset($sugs[$f['id']])) continue;
    $resto = restoFactura_($f, $t); $fe = txt_($f['fecha']) ?: hoyISO_();
    $mismos = array_values(array_filter($libresS, fn($m) => !isset($usadosS[$m['id']]) && $signoOk($f, $m) && abs($m['_resto'] - $resto) <= TOLERANCIA_CASAR &&
      abs($dias($fe, txt_($m['fecha']))) <= 400));
    $otras = $mismos ? array_filter($pendS, fn($g) => $g['id'] !== $f['id'] && $signoOk($g, $mismos[0]) && abs(restoFactura_($g, $t) - $resto) <= TOLERANCIA_CASAR) : [1];
    if (count($mismos) === 1 && !$otras) {
      $m = $mismos[0]; $usadosS[$m['id']] = 1;
      $sugs[$f['id']] = ['tipo' => 'mismo_importe', 'banco_id' => $m['id'], 'total' => num_($f['total']), 'diferencia' => 0,
        'texto' => 'Único movimiento con el mismo importe: ' . fechaCortaTxt_($m['fecha']) . ' («' . trozo_(txt_($m['concepto']), 0, 40) . '»), a ' . abs($dias($fe, txt_($m['fecha']))) . ' días de la factura.'];
    }
  }
  foreach ($pendS as $f) {
    $nuevo = isset($sugs[$f['id']]) ? aJson_($sugs[$f['id']]) : '';
    if (txt_($f['sugerencia'] ?? '') !== $nuevo) actualizar_('FACTURAS_DOC', $f['id'], ['sugerencia' => $nuevo]);
  }
  $res['sugerencias'] = count($sugs);
  foreach (leer_('FACTURAS_DOC') as $f) if (txt_($f['sugerencia'] ?? '') !== '' && restoFactura_($f, $t) <= TOLERANCIA_CASAR) actualizar_('FACTURAS_DOC', $f['id'], ['sugerencia' => '']);

  /* motivo de lo que queda */
  $t = leer_('CASADOS'); $libresAhora = $libres(); $marcadas = 0;
  foreach (leer_('FACTURAS_DOC') as $f) {
    $resto = restoFactura_($f, $t);
    if (num_($f['total']) != 0 && $resto <= TOLERANCIA_CASAR) { if (txt_($f['revisar']) !== '') actualizar_('FACTURAS_DOC', $f['id'], ['revisar' => '']); continue; }
    $clave = claveContraparte_($f); $fe = txt_($f['fecha']) ?: hoyISO_();
    $mismo = 0; $nombre = 0;
    foreach ($libresAhora as $m) {
      if (!$signoOk($f, $m)) continue;
      $d = $dias($fe, txt_($m['fecha'])); if ($d < -60 || $d > 180) continue;
      if (abs($m['_resto'] - $resto) <= TOLERANCIA_CASAR) $mismo++;
      elseif (nombraContraparte_(txt_($m['concepto']), $clave)) $nombre++;
    }
    $quien = txt_($f['tipo']) === 'emitida' ? 'cobro' : 'pago';
    $sg = json_decode(txt_($f['sugerencia'] ?? ''), true);
    if (is_array($sg) && !empty($sg['texto'])) $motivo = '💡 ' . $sg['texto'] . ' Pulsa «Aplicar sugerencia».';
    elseif (num_($f['total']) == 0) $motivo = 'Sin importe: no se ha podido leer el total. Ponlo a mano y cásala.';
    elseif (txt_($f['casada']) === 'parcial') $motivo = 'Casada en parte: faltan ' . number_format($resto, 2, ',', '.') . ' €' . ($nombre ? ' (hay ' . $nombre . ' movimientos de la misma contraparte)' : '');
    elseif ($mismo > 1) $motivo = 'Hay ' . $mismo . ' movimientos con el mismo importe: elige cuál es.';
    elseif ($mismo === 1) $motivo = 'Un movimiento con el mismo importe pero lejos en fecha o sin el nombre: confírmalo.';
    elseif ($nombre) $motivo = 'Hay ' . $nombre . ' movimientos de la misma contraparte que no cuadran solos: puede ser un pago agrupado o parcial; cásala a mano.';
    else $motivo = txt_($f['tipo']) === 'emitida' ? 'Cobro no encontrado en el banco: ¿pendiente de cobrar o cobrada por otra vía?' : 'Pago no encontrado en el banco: ¿tarjeta, efectivo, pendiente de pagar o pagada por otra vía?';
    if (txt_($f['revisar']) !== $motivo) actualizar_('FACTURAS_DOC', $f['id'], ['revisar' => $motivo]);
    $marcadas++;
  }
  $res['pendientes'] = $marcadas;
  $res['movimientos_sin_factura'] = count($libres());
  registrar_($u, 'auto_casar', 'FACTURAS_DOC', '', json_encode($res));
  return ['ok' => true] + $res;
}

/**
 * Movimientos del banco sin factura casada entera (desde p.desde), para buscar la factura
 * que falta o marcarlos «no lleva factura». Se marcan los que ya tienen gasto o cobro en el CRM.
 */
function accBancoSinFactura_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $desde = txt_($p['desde'] ?? '') ?: substr(hoyISO_(), 0, 4) . '-01-01';
  $hasta = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $t = leer_('CASADOS');
  /* lo que no lleva factura: traspasos entre cuentas, nóminas, Seguridad Social, impuestos, préstamos */
  $sinFactura = '/traspaso|n[oó]mina|seg\.?\s*social|tgss|aeat|agencia tributaria|hacienda|impuesto|pr[eé]stamo|cuota pr[eé]stamo|comisi[oó]n mantenimiento|liquidaci[oó]n/i';
  $lista = [];
  foreach (leer_('BANCO') as $m) {
    $fe = txt_($m['fecha']);
    if (strcmp($fe, $desde) < 0 || strcmp($fe, $hasta) > 0) continue;
    $resto = restoMovimiento_($m, $t);
    if ($resto <= TOLERANCIA_CASAR) continue;
    $lista[] = ['id' => $m['id'], 'cuenta' => txt_($m['cuenta']), 'fecha' => $fe, 'concepto' => txt_($m['concepto']),
      'importe' => num_($m['importe']), 'resto' => $resto, 'parcial' => $resto < abs(num_($m['importe'])) - TOLERANCIA_CASAR,
      'categoria' => txt_($m['categoria']),
      'con_gasto' => txt_($m['gasto_id']) !== '', 'con_cobro' => txt_($m['cobro_id']) !== '',
      'marcado' => in_array(txt_($m['sin_factura'] ?? ''), ['si', 'lleva'], true), 'nota_factura' => txt_($m['nota_factura'] ?? ''),
      'concepto_sf' => ($k = conceptoSinFactura_($m)), 'no_lleva' => $k !== ''];
  }
  usort($lista, fn($a, $b) => strcmp($b['fecha'], $a['fecha']));
  return ['ok' => true, 'movimientos' => $lista, 'conceptos' => CONCEPTOS_SIN_FACTURA];
}

/** Marca (o desmarca) un movimiento como «no lleva factura», con su motivo. */
function accMarcarMovimientoSinFactura_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$m) return ['ok' => false, 'error' => 'Ese movimiento ya no está.'];
  /* p.concepto: una clave de CONCEPTOS_SIN_FACTURA, o «lleva» (sí lleva factura). Compatibilidad: p.sin_factura true/false. */
  $c = txt_($p['concepto'] ?? (isset($p['sin_factura']) ? (!empty($p['sin_factura']) ? 'otro' : 'lleva') : ''));
  $nota = trozo_(txt_($p['nota'] ?? ''), 0, 300);
  if ($c !== 'lleva' && !isset(CONCEPTOS_SIN_FACTURA[$c])) return ['ok' => false, 'error' => 'Elige el concepto.'];
  if ($c === 'otro' && $nota === '') return ['ok' => false, 'error' => 'Indica por qué no lleva factura.'];
  $cambios = ['sin_factura' => $c === 'lleva' ? 'lleva' : 'si', 'nota_factura' => $c === 'lleva' ? '' : $nota];
  if ($c !== 'lleva' && $c !== 'otro') $cambios['categoria'] = $c;
  if ($c === 'lleva' && isset(CONCEPTOS_SIN_FACTURA[txt_($m['categoria'])])) $cambios['categoria'] = num_($m['importe']) > 0 ? 'otros_ingresos' : 'otros_gastos';
  actualizar_('BANCO', $m['id'], $cambios);
  registrar_($u, 'movimiento_sin_factura', 'BANCO', $m['id'], $c . ($nota !== '' ? ' · ' . $nota : ''));
  return ['ok' => true];
}

/** Marca varios movimientos de una vez con el mismo concepto. p.ids, p.concepto, p.nota. */
function accMarcarMovimientosSinFactura_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $n = 0; $err = [];
  foreach ((array)($p['ids'] ?? []) as $id) {
    $r = accMarcarMovimientoSinFactura_($u, ['id' => $id, 'concepto' => $p['concepto'] ?? '', 'nota' => $p['nota'] ?? '']);
    if ($r['ok']) $n++; else $err[] = $id . ': ' . $r['error'];
  }
  return ['ok' => true, 'marcados' => $n, 'errores' => $err];
}

/** Facturas pendientes de casar que pueden ir con este movimiento (para casarlo desde el banco). */
function accFacturasParaMovimiento_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$m) return ['ok' => false, 'error' => 'Ese movimiento ya no está.'];
  $t = leer_('CASADOS');
  $resto = restoMovimiento_($m, $t);
  $tipo = num_($m['importe']) > 0 ? 'emitida' : 'recibida';
  $lista = [];
  foreach (leer_('FACTURAS_DOC') as $f) {
    if (txt_($f['tipo']) !== $tipo) continue;
    $pend = restoFactura_($f, $t);
    if ($pend <= TOLERANCIA_CASAR && num_($f['total']) != 0) continue;
    $d = (int)round((strtotime(txt_($m['fecha'])) - strtotime(txt_($f['fecha']) ?: hoyISO_())) / 86400);
    $nombra = nombraContraparte_(txt_($m['concepto']), claveContraparte_($f));
    $exacto = abs($pend - $resto) <= TOLERANCIA_CASAR;
    $puntos = ($exacto ? 100 : 0) + ($nombra ? 50 : 0) - abs($d) * 0.3;
    if (!$exacto && !$nombra && abs($d) > 60) continue;
    $lista[] = ['id' => $f['id'], 'fecha' => txt_($f['fecha']), 'quien' => $tipo === 'emitida' ? txt_($f['receptor']) : txt_($f['emisor']),
      'numero' => txt_($f['numero']), 'total' => num_($f['total']), 'pendiente' => $pend, 'exacto' => $exacto, 'nombra' => $nombra, 'puntos' => $puntos];
  }
  usort($lista, fn($a, $b) => $b['puntos'] <=> $a['puntos']);
  return ['ok' => true, 'resto' => $resto, 'facturas' => array_slice($lista, 0, 25)];
}


/* ---------- importar las facturas que ya están en el Drive (20/11/2026) ---------- */

/**
 * Archivos (PDF e imágenes) de las carpetas de facturación que se le pasan:
 * p.carpetas = [{id, tipo: emitida|recibida, nombre}]. Marca los que ya están importados.
 */
function accDriveFacturas_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $ya = [];
  foreach (leer_('FACTURAS_DOC') as $f) if (txt_($f['archivo_id']) !== '') $ya[txt_($f['archivo_id'])] = $f['id'];
  $lista = []; $errores = [];
  foreach ((array)($p['carpetas'] ?? []) as $c) {
    $id = txt_($c['id'] ?? ''); if ($id === '') continue;
    try { $arch = driveListar_($id); } catch (Throwable $e) { $errores[] = txt_($c['nombre'] ?? $id) . ': ' . $e->getMessage(); continue; }
    foreach ($arch as $a) {
      $mime = txt_($a['mime'] ?? '');
      if ($mime !== 'application/pdf' && strpos($mime, 'image/') !== 0) continue;
      $lista[] = ['id' => txt_($a['id']), 'nombre' => txt_($a['nombre']), 'mime' => $mime, 'creado' => txt_($a['creado'] ?? ''),
        'tipo' => txt_($c['tipo'] ?? '') === 'emitida' ? 'emitida' : 'recibida', 'carpeta' => txt_($c['nombre'] ?? ''),
        'importada' => $ya[txt_($a['id'])] ?? ''];
    }
  }
  return ['ok' => true, 'archivos' => $lista, 'errores' => $errores];
}

/** Descarga un archivo del Drive de la empresa (para leerlo en el navegador). Solo dirección. */
function accArchivoDrive_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  try { $a = driveDescargar_(txt_($p['id'] ?? '')); }
  catch (Throwable $e) { return ['ok' => false, 'error' => 'No se ha podido descargar del Drive: ' . $e->getMessage()]; }
  return ['ok' => true, 'nombre' => $a['nombre'] ?? '', 'mime' => $a['mime'] ?? '', 'datos' => $a['base64'] ?? ''];
}

/** Enlaza una factura importada del Drive con la factura emitida o el gasto que ya hay en el CRM (por número; los gastos también por proveedor + importe + fecha). */
function enlazarFacturaDrive_(array $f): array {
  $num = preg_replace('/[^a-z0-9]/', '', normal_($f['numero'] ?? ''));
  if (txt_($f['tipo']) === 'emitida') {
    if (txt_($f['factura_id']) !== '' || $num === '') return $f;
    $x = buscar1_('FACTURAS', fn($y) => preg_replace('/[^a-z0-9]/', '', normal_($y['numero'])) === $num);
    return $x ? actualizar_('FACTURAS_DOC', $f['id'], ['factura_id' => $x['id']] + (txt_($f['cliente_id']) === '' ? ['cliente_id' => txt_($x['cliente_id']), 'operacion_id' => txt_($x['operacion_id'])] : [])) : $f;
  }
  if (txt_($f['gasto_id']) !== '') return $f;
  $usados = [];
  foreach (leer_('FACTURAS_DOC') as $d) if (txt_($d['gasto_id']) !== '') $usados[txt_($d['gasto_id'])] = 1;
  $gs = array_filter(leer_('GASTOS'), fn($g) => !isset($usados[txt_($g['id'])]));
  $x = null;
  if ($num !== '') foreach ($gs as $g) if (preg_replace('/[^a-z0-9]/', '', normal_($g['factura_proveedor'])) === $num) { $x = $g; break; }
  if (!$x && num_($f['total']) > 0 && txt_($f['fecha']) !== '') {
    $pal = array_filter(explode(' ', preg_replace('/[^a-z0-9 ]/', ' ', normal_($f['emisor']))), fn($w) => strlen($w) > 3);
    foreach ($gs as $g) {
      /* el gasto puede estar apuntado con el total o con la base (y su IVA aparte) */
      $gi = num_($g['importe']); $gIva = $gi * (1 + (txt_($g['iva_pct']) === '' ? 21 : num_($g['iva_pct'])) / 100);
      if (abs($gi - num_($f['total'])) > 0.05 && abs($gIva - num_($f['total'])) > 0.06 && !(num_($f['base']) > 0 && abs($gi - num_($f['base'])) <= 0.05)) continue;
      $dias = abs((strtotime(txt_($g['fecha'])) - strtotime(txt_($f['fecha']))) / 86400);
      if ($dias > 20) continue;
      $prov = normal_($g['proveedor']);
      foreach ($pal as $w) if (strpos($prov, $w) !== false) { $x = $g; break 2; }
    }
  }
  return $x ? actualizar_('FACTURAS_DOC', $f['id'], ['gasto_id' => $x['id']] + (txt_($f['operacion_id']) === '' && txt_($x['operacion_id']) !== '' ? ['operacion_id' => txt_($x['operacion_id'])] : [])) : $f;
}

/**
 * Cuadre contable del periodo (p.desde / p.hasta): banco frente a facturas, cobros y pagos
 * pendientes, IVA por trimestre según las facturas y la lista de cosas que impiden cuadrar.
 */
function accCuadreContable_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $desde = txt_($p['desde'] ?? ''); $hasta = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $enRango = fn($fe) => ($desde === '' || strcmp($fe, $desde) >= 0) && strcmp($fe, $hasta) <= 0;
  $t = leer_('CASADOS');
  $ignorar = '/traspaso|n[oó]mina|seg\.?\s*social|tgss|aeat|agencia tributaria|hacienda|impuesto|pr[eé]stamo|cuota pr[eé]stamo|comisi[oó]n mantenimiento|liquidaci[oó]n/i';
  $b = ['movimientos' => 0, 'entradas' => 0.0, 'salidas' => 0.0, 'casado' => 0.0, 'sin_casar' => 0.0, 'n_sin_casar' => 0, 'no_lleva' => 0.0, 'n_no_lleva' => 0, 'por_concepto' => []];
  foreach (leer_('BANCO') as $m) {
    if (!$enRango(txt_($m['fecha']))) continue;
    $imp = num_($m['importe']); $b['movimientos']++;
    if ($imp > 0) $b['entradas'] += $imp; else $b['salidas'] += -$imp;
    $resto = restoMovimiento_($m, $t);
    $b['casado'] += abs($imp) - $resto;
    if ($resto <= TOLERANCIA_CASAR) continue;
    $k = conceptoSinFactura_($m);
    if ($k !== '') { $b['no_lleva'] += $resto; $b['n_no_lleva']++;
      $b['por_concepto'][$k] = $b['por_concepto'][$k] ?? ['concepto' => $k, 'nombre' => CONCEPTOS_SIN_FACTURA[$k], 'n' => 0, 'entradas' => 0.0, 'salidas' => 0.0];
      $b['por_concepto'][$k][$imp > 0 ? 'entradas' : 'salidas'] = redondear_($b['por_concepto'][$k][$imp > 0 ? 'entradas' : 'salidas'] + $resto, 2); $b['por_concepto'][$k]['n']++; }
    else { $b['sin_casar'] += $resto; $b['n_sin_casar']++; }
  }
  $lleva = $b['casado'] + $b['sin_casar'];
  $b['pct_casado'] = $lleva > 0 ? (int)round($b['casado'] / $lleva * 100) : 100;
  foreach (['entradas', 'salidas', 'casado', 'sin_casar', 'no_lleva'] as $k) $b[$k] = redondear_($b[$k], 2);
  $orden = array_keys(CONCEPTOS_SIN_FACTURA);
  $b['por_concepto'] = array_values($b['por_concepto']);
  usort($b['por_concepto'], fn($x, $y) => array_search($x['concepto'], $orden) <=> array_search($y['concepto'], $orden));

  $fac = ['emitida' => ['n' => 0, 'total' => 0.0, 'casado' => 0.0, 'pendiente' => 0.0, 'n_pendiente' => 0],
          'recibida' => ['n' => 0, 'total' => 0.0, 'casado' => 0.0, 'pendiente' => 0.0, 'n_pendiente' => 0]];
  $iva = []; $avisos = []; $sinImporte = 0; $fechaRara = 0; $noCuadra = 0; $viejas = 0; $vistos = []; $dups = 0; $deMas = 0;
  $docs = leer_('FACTURAS_DOC');
  foreach ($docs as $f) {
    $fe = txt_($f['fecha']); $tipo = txt_($f['tipo']) === 'emitida' ? 'emitida' : 'recibida';
    if ($fe === '' || $fe < '2020-01-01' || $fe > substr(hoyISO_(), 0, 4) . '-12-31') $fechaRara++;
    if (!$enRango($fe)) continue;
    $tot = num_($f['total']); $resto = restoFactura_($f, $t);
    $x = &$fac[$tipo]; $x['n']++; $x['total'] += $tot; $x['casado'] += $tot - max($resto, 0);
    if ($tot == 0) $sinImporte++;
    elseif ($resto > TOLERANCIA_CASAR) { $x['pendiente'] += $resto; $x['n_pendiente']++;
      if ($tipo === 'emitida' && (strtotime(hoyISO_()) - strtotime($fe)) / 86400 > 60) $viejas++; }
    if ($resto < -1) $deMas++;
    unset($x);
    if ($tot != 0 && num_($f['base']) != 0 && abs(num_($f['base']) + num_($f['iva']) - num_($f['irpf']) - $tot) > 0.05) $noCuadra++;
    $q = substr($fe, 0, 4) . '-T' . (int)ceil((int)substr($fe, 5, 2) / 3);
    $iva[$q] = $iva[$q] ?? ['trimestre' => $q, 'repercutido' => 0.0, 'soportado' => 0.0];
    $iva[$q][$tipo === 'emitida' ? 'repercutido' : 'soportado'] += num_($f['iva']);
    $k = $tipo . '|' . preg_replace('/[^a-z0-9]/', '', normal_($f['numero'])) . '|' . round(abs($tot), 2);
    if (preg_replace('/[^a-z0-9]/', '', normal_($f['numero'])) !== '' && $tot != 0) { if (isset($vistos[$k])) $dups++; $vistos[$k] = 1; }
  }
  foreach ($fac as &$x) foreach (['total', 'casado', 'pendiente'] as $k) $x[$k] = redondear_($x[$k], 2);
  unset($x);
  ksort($iva);
  $iva = array_values(array_map(fn($q) => $q + ['resultado' => redondear_($q['repercutido'] - $q['soportado'], 2)], $iva));
  foreach ($iva as &$q) { $q['repercutido'] = redondear_($q['repercutido'], 2); $q['soportado'] = redondear_($q['soportado'], 2); }
  unset($q);

  /* cruces con el resto del CRM */
  $conDoc = []; foreach ($docs as $f) { if (txt_($f['factura_id']) !== '') $conDoc['F' . $f['factura_id']] = 1; if (txt_($f['gasto_id']) !== '') $conDoc['G' . $f['gasto_id']] = 1; }
  $emitidasSinPdf = 0; foreach (leer_('FACTURAS') as $x) if ($enRango(txt_($x['fecha_emision'])) && !isset($conDoc['F' . $x['id']]) && normal_($x['estado']) !== 'anulada') $emitidasSinPdf++;
  $gastosSinFactura = 0; $gastosSinFacturaEur = 0.0;
  foreach (leer_('GASTOS') as $g) if ($enRango(txt_($g['fecha'])) && !isset($conDoc['G' . $g['id']]) && num_($g['importe']) > 0) { $gastosSinFactura++; $gastosSinFacturaEur += num_($g['importe']); }

  if ($b['n_sin_casar']) $avisos[] = $b['n_sin_casar'] . ' movimientos del banco sin factura (' . number_format($b['sin_casar'], 2, ',', '.') . ' €): súbela o márcalos «no lleva factura».';
  if ($fac['recibida']['n_pendiente']) $avisos[] = $fac['recibida']['n_pendiente'] . ' facturas recibidas sin casar: mira «Qué falta» en cada una.';
  if ($viejas) $avisos[] = $viejas . ' facturas emitidas con más de 60 días sin cobro en el banco.';
  if ($sinImporte) $avisos[] = $sinImporte . ' facturas sin importe leído: ábrelas y pon el total.';
  if ($noCuadra) $avisos[] = $noCuadra . ' facturas en las que base + IVA − IRPF no da el total: revisa los importes leídos.';
  if ($fechaRara) $avisos[] = $fechaRara . ' facturas sin fecha o con una fecha imposible.';
  if ($dups) $avisos[] = $dups . ' posibles facturas duplicadas (mismo número e importe).';
  if ($deMas) $avisos[] = $deMas . ' facturas casadas por más de su importe: revisa los trozos.';
  if ($emitidasSinPdf) $avisos[] = $emitidasSinPdf . ' facturas emitidas en el CRM sin su PDF en Escanear facturas.';
  if ($gastosSinFactura) $avisos[] = $gastosSinFactura . ' gastos del CRM sin factura (' . number_format($gastosSinFacturaEur, 2, ',', '.') . ' €): falta el justificante.';
  return ['ok' => true, 'desde' => $desde, 'hasta' => $hasta, 'banco' => $b, 'emitidas' => $fac['emitida'], 'recibidas' => $fac['recibida'], 'iva' => $iva, 'avisos' => $avisos];
}

/** El PDF (o la imagen) de una factura emitida del CRM: el escaneado/importado que la enlaza o, si no, el enlace de Drive de la factura. */
function accArchivoDeFactura_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $fid = txt_($p['factura_id'] ?? '');
  $doc = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['factura_id'], $fid) && txt_($x['archivo_id']) !== '');
  $driveId = $doc ? txt_($doc['archivo_id']) : '';
  $nombre = $doc ? txt_($doc['archivo_nombre']) : '';
  if ($driveId === '') {
    $f = buscar1_('FACTURAS', fn($x) => mismo_($x['id'], $fid));
    if ($f && preg_match('~/d/([\w-]{20,})|[?&]id=([\w-]{20,})~', txt_($f['url']), $m)) $driveId = $m[1] ?: $m[2];
    $nombre = $f ? 'Factura ' . txt_($f['numero']) : '';
  }
  if ($driveId === '') return ['ok' => false, 'sin_archivo' => true, 'error' => 'Esta factura no tiene el PDF guardado. Súbelo en «Escanear facturas» y quedará enlazado.'];
  try { $a = driveDescargar_($driveId); }
  catch (Throwable $e) { return ['ok' => false, 'error' => 'No se ha podido abrir el archivo del Drive.']; }
  return ['ok' => true, 'nombre' => $nombre ?: ($a['nombre'] ?? ''), 'mime' => $a['mime'] ?? 'application/pdf', 'datos' => $a['base64'] ?? '',
    'url' => 'https://drive.google.com/file/d/' . $driveId . '/view', 'doc_id' => $doc['id'] ?? ''];
}

/**
 * El dinero de un cliente (21/11/2026, solo dirección): sus facturas emitidas y recibidas
 * (con su PDF y si están casadas con el banco), los gastos de sus instalaciones, el plan de
 * cobros, y lo que el CRM estima cuando aún no hay facturas.
 */
function accDineroCliente_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  asegurarCasados_();
  $cid = txt_($p['cliente_id'] ?? '');
  $ops = filtrar_('OPERACIONES', fn($o) => mismo_($o['cliente_id'], $cid));
  $opIds = array_map(fn($o) => txt_($o['id']), $ops);
  $deEl = fn($x) => mismo_($x['cliente_id'] ?? '', $cid) || in_array(txt_($x['operacion_id'] ?? ''), $opIds, true);
  $t = leer_('CASADOS');
  $docs = array_values(array_map(fn($f) => facturaDocLigera_($f) + ['pendiente' => restoFactura_($f, $t)], array_filter(leer_('FACTURAS_DOC'), $deEl)));
  $conDoc = [];
  foreach ($docs as $d) { if (txt_($d['factura_id'] ?? '') !== '') $conDoc['F' . $d['factura_id']] = $d['id']; if (txt_($d['gasto_id'] ?? '') !== '') $conDoc['G' . $d['gasto_id']] = $d['id']; }
  $facturas = array_values(array_map(fn($f) => array_diff_key($f, ['_fila' => 1]) + ['doc_id' => $conDoc['F' . $f['id']] ?? ''], array_filter(leer_('FACTURAS'), $deEl)));
  $gastos = array_values(array_map(fn($g) => array_diff_key($g, ['_fila' => 1]) + ['doc_id' => $conDoc['G' . $g['id']] ?? ''], array_filter(leer_('GASTOS'), fn($g) => in_array(txt_($g['operacion_id']), $opIds, true))));
  $cobros = array_values(array_map(fn($c) => array_diff_key($c, ['_fila' => 1]), array_filter(leer_('COBROS'), fn($c) => in_array(txt_($c['operacion_id']), $opIds, true))));
  usort($docs, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
  return ['ok' => true, 'documentos' => $docs, 'facturas' => $facturas, 'gastos' => $gastos, 'cobros' => $cobros];
}
