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
  if (txt_($f['banco_id'] ?? '') !== '') soltarMovimiento_($f);
  $delDrive = txt_($f['origen'] ?? '') === 'drive';   /* del Drive: el archivo y el gasto/factura no son nuestros, se quedan */
  if (!$delDrive && txt_($f['gasto_id']) !== '') borrar_('GASTOS', $f['gasto_id']);
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

const MEDIOS_PAGO = ['banco', 'tarjeta', 'efectivo'];

/** ¿El movimiento del banco ya está casado con alguna factura escaneada? */
function facturaDocDeMovimiento_(string $bancoId): ?array {
  if ($bancoId === '') return null;
  return buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['banco_id'], $bancoId));
}

/** Movimientos del banco que pueden ser el pago o el cobro de una factura. */
function accCandidatosBancoFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  $total = abs(num_($f['total']));
  $signo = txt_($f['tipo']) === 'emitida' ? 1 : -1;
  $fecha = txt_($f['fecha']) ?: hoyISO_();
  $palabras = array_values(array_filter(preg_split('/\s+/', normal_(preg_replace('/\b(s\.?l\.?u?|s\.?a\.?u?)\b\.?/i', '', txt_($f['emisor']) . ' ' . txt_($f['receptor'])))),
    fn($w) => strlen($w) >= 4));
  $lista = [];
  foreach (leer_('BANCO') as $m) {
    $imp = num_($m['importe']);
    if ($imp * $signo <= 0) continue;
    $dif = abs(abs($imp) - $total);
    if ($dif > max(0.05, $total * 0.01)) continue;
    $dias = (int)round((strtotime(txt_($m['fecha'])) - strtotime($fecha)) / 86400);
    if ($dias < -45 || $dias > 120) continue;
    $otra = facturaDocDeMovimiento_(txt_($m['id']));
    if ($otra && !mismo_($otra['id'], $f['id'])) continue;
    $conc = normal_($m['concepto']);
    $coincide = 0; foreach ($palabras as $w) if (strpos($conc, $w) !== false) $coincide++;
    $puntos = 100 - $dif * 20 - abs($dias) * 0.6 + $coincide * 15 + ($dias >= 0 ? 5 : 0);
    $lista[] = ['id' => $m['id'], 'cuenta' => txt_($m['cuenta']), 'fecha' => txt_($m['fecha']), 'concepto' => txt_($m['concepto']),
      'importe' => $imp, 'dias' => $dias, 'puntos' => round($puntos, 1), 'casado' => (bool)$otra,
      'tarjeta' => (bool)preg_match('/tarj|card|compra\s|visa|mastercard/i', txt_($m['concepto']))];
  }
  usort($lista, fn($a, $b) => $b['puntos'] <=> $a['puntos']);
  return ['ok' => true, 'candidatos' => array_slice($lista, 0, 8)];
}

/**
 * Casa la factura con su pago o cobro. p.id, p.medio (banco | tarjeta | efectivo),
 * p.banco_id (si es un movimiento), p.fecha (efectivo o tarjeta sin movimiento).
 */
function accCasarFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  $medio = normal_($p['medio'] ?? '');
  if (!in_array($medio, MEDIOS_PAGO, true)) return ['ok' => false, 'error' => 'Elige banco, tarjeta o efectivo.'];
  $bancoId = txt_($p['banco_id'] ?? '');
  $fecha = txt_($p['fecha'] ?? '') ?: hoyISO_();
  $nota = '';
  if ($bancoId !== '') {
    $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $bancoId));
    if (!$m) return ['ok' => false, 'error' => 'Ese movimiento del banco ya no está.'];
    $otra = facturaDocDeMovimiento_($bancoId);
    if ($otra && !mismo_($otra['id'], $f['id'])) return ['ok' => false, 'error' => 'Ese movimiento ya está casado con la factura ' . $otra['id'] . '.'];
    $signo = txt_($f['tipo']) === 'emitida' ? 1 : -1;
    if (num_($m['importe']) * $signo <= 0) return ['ok' => false, 'error' => txt_($f['tipo']) === 'emitida' ? 'Una factura emitida se casa con un ingreso.' : 'Una factura recibida se casa con un pago.'];
    $fecha = txt_($m['fecha']);
    $dif = redondear_(abs(num_($m['importe'])) - abs(num_($f['total'])), 2);
    if (abs($dif) > 0.01) $nota = 'Diferencia con el banco: ' . txt_($dif) . ' €';
    $cambiosB = ['conciliado' => 'si', 'notas' => trim(txt_($m['notas']) . ' · Factura ' . txt_($f['id']) . ' ' . txt_($f['numero']), ' ·')];
    if (txt_($f['gasto_id']) !== '') $cambiosB['gasto_id'] = txt_($f['gasto_id']);
    if (txt_($f['operacion_id']) !== '' && txt_($m['operacion_id']) === '') $cambiosB['operacion_id'] = txt_($f['operacion_id']);
    actualizar_('BANCO', $m['id'], $cambiosB);
  }
  /* si estaba casada con otro movimiento, se suelta */
  if (txt_($f['banco_id']) !== '' && !mismo_($f['banco_id'], $bancoId)) soltarMovimiento_($f);
  $r = actualizar_('FACTURAS_DOC', $f['id'], ['medio_pago' => $medio, 'banco_id' => $bancoId, 'casada' => 'si',
    'fecha_casada' => ahora_(), 'estado_pago' => 'pagado', 'fecha_pago' => $fecha,
    'notas' => $nota !== '' ? trim(txt_($f['notas']) . ' · ' . $nota, ' ·') : txt_($f['notas']),
    'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  $r = contabilizarFacturaDoc_($u, $r);
  registrar_($u, 'casar_factura_doc', 'FACTURAS_DOC', $f['id'], $medio . ($bancoId !== '' ? ' ' . $bancoId : ''));
  return ['ok' => true, 'factura' => facturaDocLigera_($r), 'aviso' => $nota];
}

function soltarMovimiento_(array $f): void {
  $m = buscar1_('BANCO', fn($x) => mismo_($x['id'], $f['banco_id']));
  if (!$m) return;
  $cambios = ['notas' => trim(str_replace('Factura ' . txt_($f['id']) . ' ' . txt_($f['numero']), '', txt_($m['notas'])), ' ·')];
  if (txt_($f['gasto_id']) !== '' && mismo_($m['gasto_id'], $f['gasto_id'])) { $cambios['gasto_id'] = ''; $cambios['conciliado'] = 'no'; }
  elseif (txt_($m['gasto_id']) === '' && txt_($m['cobro_id']) === '') $cambios['conciliado'] = 'no';
  actualizar_('BANCO', $m['id'], $cambios);
}

/** Deshace el casado: la factura vuelve a pendiente y el movimiento queda libre. */
function accDescasarFacturaDoc_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $f = buscar1_('FACTURAS_DOC', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$f) return ['ok' => false, 'error' => 'Esa factura ya no está.'];
  if (txt_($f['banco_id']) !== '') soltarMovimiento_($f);
  $r = actualizar_('FACTURAS_DOC', $f['id'], ['medio_pago' => '', 'banco_id' => '', 'casada' => 'no', 'fecha_casada' => '',
    'estado_pago' => 'pendiente', 'fecha_pago' => '', 'modificado' => ahora_(), 'modificado_por' => $u['id']]);
  $r = contabilizarFacturaDoc_($u, $r);
  registrar_($u, 'descasar_factura_doc', 'FACTURAS_DOC', $f['id'], '');
  return ['ok' => true, 'factura' => facturaDocLigera_($r)];
}

/**
 * Movimientos del banco sin factura escaneada casada (desde p.desde), para
 * buscar la factura que falta. Se marcan los que ya tienen gasto o cobro en el CRM.
 */
function accBancoSinFactura_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  $desde = txt_($p['desde'] ?? '') ?: substr(hoyISO_(), 0, 4) . '-01-01';
  $hasta = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $casados = [];
  foreach (leer_('FACTURAS_DOC') as $f) if (txt_($f['banco_id']) !== '') $casados[txt_($f['banco_id'])] = true;
  /* lo que no lleva factura: traspasos entre cuentas, nóminas, Seguridad Social, impuestos, préstamos */
  $sinFactura = '/traspaso|n[oó]mina|seg\.?\s*social|tgss|aeat|agencia tributaria|hacienda|impuesto|pr[eé]stamo|cuota pr[eé]stamo|comisi[oó]n mantenimiento|liquidaci[oó]n/i';
  $lista = [];
  foreach (leer_('BANCO') as $m) {
    $fe = txt_($m['fecha']);
    if (strcmp($fe, $desde) < 0 || strcmp($fe, $hasta) > 0) continue;
    if (!empty($casados[txt_($m['id'])])) continue;
    $lista[] = ['id' => $m['id'], 'cuenta' => txt_($m['cuenta']), 'fecha' => $fe, 'concepto' => txt_($m['concepto']),
      'importe' => num_($m['importe']), 'categoria' => txt_($m['categoria']),
      'con_gasto' => txt_($m['gasto_id']) !== '', 'con_cobro' => txt_($m['cobro_id']) !== '',
      'no_lleva' => (bool)preg_match($sinFactura, txt_($m['concepto']) . ' ' . txt_($m['categoria']))];
  }
  usort($lista, fn($a, $b) => strcmp($b['fecha'], $a['fecha']));
  return ['ok' => true, 'movimientos' => $lista];
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
      if (abs(num_($g['importe']) - num_($f['total'])) > 0.05) continue;
      $dias = abs((strtotime(txt_($g['fecha'])) - strtotime(txt_($f['fecha']))) / 86400);
      if ($dias > 20) continue;
      $prov = normal_($g['proveedor']);
      foreach ($pal as $w) if (strpos($prov, $w) !== false) { $x = $g; break 2; }
    }
  }
  return $x ? actualizar_('FACTURAS_DOC', $f['id'], ['gasto_id' => $x['id']] + (txt_($f['operacion_id']) === '' && txt_($x['operacion_id']) !== '' ? ['operacion_id' => txt_($x['operacion_id'])] : [])) : $f;
}
