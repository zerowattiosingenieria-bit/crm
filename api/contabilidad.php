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
  foreach ($campos as $c) if (array_key_exists($c, $d)) $f[$c] = is_array($d[$c]) ? json_encode($d[$c], JSON_UNESCAPED_UNICODE) : $d[$c];

  /* comprobaciones */
  $tipo = normal_($f['tipo'] ?? 'recibida') === 'emitida' ? 'emitida' : 'recibida';
  $f['tipo'] = $tipo;
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
  if (txt_($f['gasto_id']) !== '') borrar_('GASTOS', $f['gasto_id']);
  if (txt_($f['factura_id']) !== '') borrar_('FACTURAS', $f['factura_id']);
  if (txt_($f['archivo_id']) !== '') { try { driveBorrar_(txt_($f['archivo_id'])); } catch (Throwable $e) {} }
  borrar_('FACTURAS_DOC', $f['id']);
  registrar_($u, 'borrar_factura_doc', 'FACTURAS_DOC', $f['id'], txt_($f['emisor']) . ' · ' . txt_($f['numero']));
  return ['ok' => true];
}
