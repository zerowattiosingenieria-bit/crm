<?php
/**
 * CRM · ZERO WATTIOS
 * tramites.php (= 27_Tramites.gs) — CAEs (Novawatt) y cambios de compañía
 * eléctrica (WIXER) (09/11/2026, orden de Nando).
 *
 * «Crea un apartado también para WIXER y para los CAEs, lo tienes también en
 * Drive en su carpeta correspondiente»: G:\Mi unidad\ZERO WATTIOS\10-CAES
 * (NOVAWATT) y 11 - WIXER (CAMBIO CONTRATOS ELECTRICIDAD). Allí Rubén lleva
 * un Excel de seguimiento y una carpeta por casa.
 *
 * - Una sola tabla TRAMITES con «tipo» = cae | wixer. Lo propio de cada tipo
 *   va en «datos» (JSON); la lista de documentos del CAE en «checklist».
 * - Solo dirección (alcance «todo»). Los importes, además, solo con permiso
 *   de finanzas: al resto les llegan vacíos.
 * - Nunca se guardan IBAN ni DNI: se quedan en el Excel y en Drive.
 * - «importarTramites» da de alta o actualiza en bloque (lo usa la
 *   sincronización con Drive): casa por carpeta de Drive, luego por número
 *   del Excel y luego por dirección. No duplica.
 */

require_once __DIR__ . '/base.php';

const TIPOS_TRAMITE = ['cae', 'wixer'];
const ESTADOS_TRAMITE = [
  'cae' => ['documentacion', 'completo', 'presentado', 'cobrado', 'cancelado'],
  'wixer' => ['pendiente', 'solicitado', 'pte_facturar', 'finalizado', 'cancelado']
];
/* Los documentos que pide Novawatt (las columnas del Excel de Rubén). */
const DOCS_CAE = ['registro_novawatt', 'fotos_existente', 'etiqueta_existente', 'fotos_instalado', 'etiqueta_instalado',
                  'factura_luz', 'cee_inicial', 'cee_final', 'cite', 'factura_instalacion'];
const DATOS_TRAMITE = [
  'cae' => ['contrato', 'fecha_financiacion', 'cp', 'provincia', 'telefono', 'email'],
  'wixer' => ['id_proyecto', 'contrato', 'ref_catastral', 'cups', 'compania_actual', 'potencia', 'peaje',
              'compania_nueva', 'tarifa', 'factura', 'cp', 'provincia', 'telefono', 'email']
];
/* Lo que no entra nunca, venga de donde venga. */
const PROHIBIDOS_TRAMITE = ['iban', 'dni', 'cuenta', 'tarjeta'];

/* Quién ve qué (orden de Nando, 09/11/2026): «el responsable de los CAEs es
   Abraham, y lo ve también dirección, el resto no. Y el responsable de WIXER
   es Sandra, y lo ve dirección y Abraham, el resto no». Se puede cambiar en
   la configuración (tramites_cae_usuarios / tramites_wixer_usuarios, por
   usuario de entrada separados por comas). */
const RESPONSABLE_TRAMITE = ['cae' => 'abraham', 'wixer' => 'sandra'];
const VEN_TRAMITE = ['cae' => 'abraham', 'wixer' => 'sandra,abraham'];

/* Orden de Nando (09/11/2026): «las antiguas de Aurus no las tengas en cuenta
   para WIXER y CAEs; solo las de Zero Wattios». Cliente de Aurus = etiqueta
   «Aurus» sin etiqueta de Zero Wattios (los que estuvieron en las dos etapas
   sí cuentan). */
function esAurusTra_(?array $c): bool {
  if (!$c) return false;
  $e = normal_(($c['etiquetas'] ?? '') . ' ' . ($c['origen'] ?? ''));
  return str_contains($e, 'aurus') && !preg_match('/zero ?w?att?ios|\\bzw\\b/', $e);
}

function esDireccionTra_(array $u): bool { return (permisos_($u)['alcance'] ?? '') === 'todo'; }
function tiposVisiblesTra_(array $u): array {
  if (esDireccionTra_($u)) return TIPOS_TRAMITE;
  $yo = normal_($u['usuario'] ?? '');
  $cfg = config_();
  return array_values(array_filter(TIPOS_TRAMITE, function ($t) use ($yo, $cfg) {
    $lista = array_map('normal_', explode(',', txt_($cfg['tramites_' . $t . '_usuarios'] ?? '') ?: VEN_TRAMITE[$t]));
    return $yo !== '' && in_array($yo, $lista, true);
  }));
}
function exigirDireccionTra_(array $u, string $tipo = ''): void {
  $ve = tiposVisiblesTra_($u);
  if (!count($ve) || ($tipo !== '' && !in_array($tipo, $ve, true))) throw new Exception('Este apartado no está abierto para tu usuario.');
}

function jsonTra_($v): array {
  if (is_array($v)) return $v;
  $s = txt_($v);
  if ($s === '') return [];
  $j = json_decode($s, true);
  return is_array($j) ? $j : [];
}

/** «Calle de la Atalayuela, 39» → «atalayuela 39»: para casar direcciones escritas distinto. */
function claveDireccionTra_($s): string {
  $s = normal_($s);
  $s = preg_replace('/\(.*?\)/', ' ', $s);
  $s = preg_replace('/[^a-z0-9ñ ]+/u', ' ', $s);
  $fuera = ['calle', 'c', 'cl', 'avenida', 'avda', 'av', 'de', 'del', 'la', 'las', 'los', 'el', 'paseo', 'plaza', 'pza',
            'camino', 'urb', 'urbanizacion', 'n', 'no', 'numero', 'cancelado'];
  $pal = array_values(array_filter(preg_split('/\s+/', $s), fn($p) => $p !== '' && !in_array($p, $fuera, true)));
  $nombre = []; $num = '';
  foreach ($pal as $p) {
    if (preg_match('/^\d+[a-z]?$/', $p)) { if ($num === '' && count($nombre)) $num = $p; if ($num !== '') break; continue; }
    if ($num === '') $nombre[] = $p;
  }
  /* «Río Guadiana» y «Guadina» o «Sánchez» y «Shachez» pasan: basta la palabra más larga y el número. */
  return $num === '' ? '' : implode(' ', $nombre) . ' ' . $num;
}

function mismaDireccionTra_(string $a, string $b): bool {
  if ($a === '' || $b === '') return false;
  if ($a === $b) return true;
  [$na, $xa] = [substr($a, 0, strrpos($a, ' ')), substr($a, strrpos($a, ' ') + 1)];
  [$nb, $xb] = [substr($b, 0, strrpos($b, ' ')), substr($b, strrpos($b, ' ') + 1)];
  if ((int)$xa !== (int)$xb || (int)$xa === 0) return false;
  $pa = array_filter(explode(' ', $na), fn($p) => strlen($p) >= 4);
  $pb = array_filter(explode(' ', $nb), fn($p) => strlen($p) >= 4);
  foreach ($pa as $p) foreach ($pb as $q) {
    if ($p === $q || levenshtein($p, $q) <= 1 || (strlen($p) >= 5 && strlen($q) >= 5 && levenshtein($p, $q) <= 2)) return true;
  }
  return false;
}

function clientePorDireccionTra_(string $direccion, array $clientes): string {
  $k = claveDireccionTra_($direccion);
  if ($k === '') return '';
  foreach ($clientes as $c) if (mismaDireccionTra_($k, claveDireccionTra_($c['direccion'] ?? ''))) return txt_($c['id']);
  return '';
}

function progresoTra_(array $t): int {
  if (($t['tipo'] ?? '') !== 'cae') return (int)num_($t['progreso'] ?? 0);
  $ch = jsonTra_($t['checklist'] ?? '');
  $hechos = count(array_filter(DOCS_CAE, fn($d) => !empty($ch[$d])));
  /* Sin ningún documento marcado se respeta el porcentaje del Excel de Rubén. */
  return $hechos ? (int)round(100 * $hechos / count(DOCS_CAE)) : max(0, min(100, (int)num_($t['progreso'] ?? 0)));
}

function tramitePublico_(array $t, array $clientes, array $usuarios, bool $finanzas): array {
  $tipo = in_array($t['tipo'] ?? '', TIPOS_TRAMITE, true) ? $t['tipo'] : 'cae';
  $cli = $clientes[txt_($t['cliente_id'] ?? '')] ?? [];
  $datos = jsonTra_($t['datos'] ?? '');
  $o = [];
  foreach (DATOS_TRAMITE[$tipo] as $c) $o[$c] = txt_($datos[$c] ?? '');
  $ch = jsonTra_($t['checklist'] ?? '');
  $estado = normal_($t['estado'] ?? '');
  if (!in_array($estado, ESTADOS_TRAMITE[$tipo], true)) $estado = ESTADOS_TRAMITE[$tipo][0];
  $carpeta = txt_($t['carpeta_id'] ?? '');
  return [
    'id' => txt_($t['id'] ?? ''), 'tipo' => $tipo, 'numero' => txt_($t['numero'] ?? ''),
    'cliente_id' => txt_($t['cliente_id'] ?? ''), 'cliente' => txt_($cli['nombre'] ?? ''),
    'nombre' => txt_($t['nombre'] ?? '') ?: txt_($cli['nombre'] ?? ''),
    'direccion' => txt_($t['direccion'] ?? '') ?: txt_($cli['direccion'] ?? ''),
    'poblacion' => txt_($t['poblacion'] ?? '') ?: txt_($cli['municipio'] ?? ''),
    'producto' => txt_($t['producto'] ?? ''), 'estado' => $estado, 'progreso' => progresoTra_($t),
    'checklist' => $tipo === 'cae' ? array_combine(DOCS_CAE, array_map(fn($d) => !empty($ch[$d]), DOCS_CAE)) : (object)[],
    'datos' => $o,
    'importe' => $finanzas ? num_($t['importe'] ?? 0) : null,
    'fecha_cobro' => $finanzas ? txt_($t['fecha_cobro'] ?? '') : '',
    'carpeta_id' => $carpeta, 'carpeta_url' => $carpeta !== '' ? 'https://drive.google.com/drive/folders/' . $carpeta : '',
    'notas' => txt_($t['notas'] ?? ''),
    'creado' => txt_($t['creado'] ?? ''), 'modificado' => txt_($t['modificado'] ?? ''),
    'modificado_por' => txt_($usuarios[txt_($t['modificado_por'] ?? '')]['nombre'] ?? '')
  ];
}

function accTramites_(array $u, array $p): array {
  exigirDireccionTra_($u);
  asegurarHoja_('TRAMITES');
  $fin = !empty(permisos_($u)['finanzas']);
  $clientes = indexar_(leer_('CLIENTES'));
  $usuarios = indexar_(leer_('USUARIOS'));
  $tipo = normal_($p['tipo'] ?? '');
  $ve = tiposVisiblesTra_($u);
  $lista = array_map(fn($t) => tramitePublico_($t, $clientes, $usuarios, $fin),
    array_values(array_filter(leer_('TRAMITES'), fn($t) => in_array(normal_($t['tipo'] ?? ''), $ve, true) && ($tipo === '' || normal_($t['tipo'] ?? '') === $tipo)
      && !esAurusTra_($clientes[txt_($t['cliente_id'] ?? '')] ?? null))));
  $lista = ordenar_($lista, function ($a, $b) {
    $ca = $a['estado'] === 'cancelado' ? 1 : 0; $cb = $b['estado'] === 'cancelado' ? 1 : 0;
    if ($ca !== $cb) return $ca - $cb;
    if ($a['tipo'] !== $b['tipo']) return strcmp($a['tipo'], $b['tipo']);
    return (int)$b['numero'] <=> (int)$a['numero'] ?: strcmp($b['creado'], $a['creado']);
  });
  $cuentas = [];
  foreach ($ve as $t) {
    $de = array_values(array_filter($lista, fn($x) => $x['tipo'] === $t && $x['estado'] !== 'cancelado'));
    $c = ['total' => count($de)];
    foreach (ESTADOS_TRAMITE[$t] as $e) $c[$e] = count(array_filter($de, fn($x) => $x['estado'] === $e));
    if ($t === 'cae') $c['docs_pendientes'] = count(array_filter($de, fn($x) => $x['progreso'] < 100 && $x['estado'] === 'documentacion'));
    if ($fin) {
      $c['importe'] = redondear_(array_sum(array_map(fn($x) => num_($x['importe']), $de)), 2);
      $c['importe_pendiente'] = redondear_(array_sum(array_map(fn($x) => num_($x['importe']),
        array_filter($de, fn($x) => !in_array($x['estado'], ['cobrado', 'finalizado'], true)))), 2);
    }
    $cuentas[$t] = $c;
  }
  $cfg = config_();
  $resp = [];
  foreach ($ve as $t) {
    $r = buscar1_('USUARIOS', fn($x) => normal_($x['usuario'] ?? '') === RESPONSABLE_TRAMITE[$t]);
    $resp[$t] = txt_($r['nombre'] ?? '') ?: ucfirst(RESPONSABLE_TRAMITE[$t]);
  }
  return ['ok' => true, 'tramites' => $lista, 'cuentas' => $cuentas, 'finanzas' => $fin, 'tipos' => $ve, 'responsables' => $resp,
    'docs_cae' => DOCS_CAE, 'estados' => ESTADOS_TRAMITE,
    'carpetas' => ['cae' => txt_($cfg['drive_caes'] ?? '') ?: '1NjmgQN7WI7ytY7rfr4e-xXL3asco03Bs',
                   'wixer' => txt_($cfg['drive_wixer'] ?? '') ?: '1zhxXbPrhJSWuQAuBj6ce-4EARvQAcgRr'],
    'sincronizado' => txt_($cfg['tramites_sincronizado'] ?? '')];
}

/** Junta lo que llega con lo que hay. Devuelve los cambios de la fila. */
function cambiosTra_(array $d, ?array $actual, bool $fin, bool $soloVacios = false): array {
  $tipo = $actual ? txt_($actual['tipo']) : normal_($d['tipo'] ?? '');
  if (!in_array($tipo, TIPOS_TRAMITE, true)) throw new Exception('El tipo es «cae» o «wixer».');
  $c = $actual ? [] : ['tipo' => $tipo];
  $poner = function (string $campo, $valor) use (&$c, $actual, $soloVacios) {
    if ($soloVacios && $actual && txt_($actual[$campo] ?? '') !== '') return;
    $c[$campo] = $valor;
  };
  foreach (['numero', 'cliente_id', 'nombre', 'direccion', 'poblacion', 'producto', 'carpeta_id', 'notas'] as $k) {
    if (array_key_exists($k, $d)) $poner($k, trozo_(txt_($d[$k]), 0, $k === 'notas' ? 2000 : 300));
  }
  if (array_key_exists('estado', $d) && txt_($d['estado']) !== '') {
    $e = normal_($d['estado']);
    if (!in_array($e, ESTADOS_TRAMITE[$tipo], true)) throw new Exception('Estado no válido: ' . $e);
    $poner('estado', $e);
  }
  if (array_key_exists('progreso', $d)) $poner('progreso', max(0, min(100, (int)num_($d['progreso']))));
  if ($fin) {
    if (array_key_exists('importe', $d) && $d['importe'] !== null && txt_($d['importe']) !== '') $poner('importe', redondear_(num_($d['importe']), 2));
    if (array_key_exists('fecha_cobro', $d)) $poner('fecha_cobro', substr(txt_($d['fecha_cobro']), 0, 10));
  }
  if (isset($d['datos']) && is_array($d['datos'])) {
    $datos = jsonTra_($actual['datos'] ?? '');
    foreach (DATOS_TRAMITE[$tipo] as $k) {
      if (!array_key_exists($k, $d['datos'])) continue;
      if ($soloVacios && txt_($datos[$k] ?? '') !== '') continue;
      $datos[$k] = trozo_(txt_($d['datos'][$k]), 0, 200);
    }
    foreach (array_keys($datos) as $k) if (in_array(normal_($k), PROHIBIDOS_TRAMITE, true)) unset($datos[$k]);
    $c['datos'] = json_encode($datos, JSON_UNESCAPED_UNICODE);
  }
  if ($tipo === 'cae' && isset($d['checklist']) && is_array($d['checklist'])) {
    $ch = jsonTra_($actual['checklist'] ?? '');
    foreach (DOCS_CAE as $k) if (array_key_exists($k, $d['checklist'])) $ch[$k] = !empty($d['checklist'][$k]);
    $c['checklist'] = json_encode($ch);
  }
  return $c;
}

function accGuardarTramite_(array $u, array $p): array {
  exigirDireccionTra_($u);
  asegurarHoja_('TRAMITES');
  $fin = !empty(permisos_($u)['finanzas']);
  $d = is_array($p['tramite'] ?? null) ? $p['tramite'] : [];
  $actual = null;
  if (txt_($d['id'] ?? '') !== '') {
    $actual = buscar1_('TRAMITES', fn($t) => mismo_($t['id'], $d['id']));
    if (!$actual) return ['ok' => false, 'error' => 'Ese trámite ya no existe.'];
  }
  exigirDireccionTra_($u, $actual ? txt_($actual['tipo']) : normal_($d['tipo'] ?? ''));
  if (($d['cliente_id'] ?? '') !== '') {
    $cliD = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $d['cliente_id']));
    if (!$cliD) return ['ok' => false, 'error' => 'Ese cliente no existe.'];
    if (esAurusTra_($cliD)) return ['ok' => false, 'error' => 'Es un cliente antiguo de Aurus: CAEs y WIXER son solo de Zero Wattios.'];
  }
  $c = cambiosTra_($d, $actual, $fin);
  /* Con todos los papeles del CAE, pasa solo a «completo» (si estaba en documentación). */
  if (($actual['tipo'] ?? ($c['tipo'] ?? '')) === 'cae' && isset($c['checklist'])) {
    $prog = progresoTra_(array_merge($actual ?? [], $c));
    $est = $c['estado'] ?? normal_($actual['estado'] ?? '') ?: 'documentacion';
    if ($prog >= 100 && $est === 'documentacion') $c['estado'] = 'completo';
    if ($prog < 100 && $est === 'completo') $c['estado'] = 'documentacion';
    $c['progreso'] = $prog;
  }
  $c['modificado'] = ahora_(); $c['modificado_por'] = $u['id'] ?? '';
  if ($actual) {
    $r = actualizar_('TRAMITES', $actual['id'], $c);
    registrar_($u, 'editar_tramite', 'TRAMITES', $actual['id'], $actual['tipo'] . ' ' . txt_($actual['direccion']));
  } else {
    if (txt_($c['direccion'] ?? '') === '' && txt_($c['cliente_id'] ?? '') === '') return ['ok' => false, 'error' => 'Pon la dirección o el cliente.'];
    if (txt_($c['cliente_id'] ?? '') === '') $c['cliente_id'] = clientePorDireccionTra_(txt_($c['direccion'] ?? ''), leer_('CLIENTES'));
    $c['estado'] = $c['estado'] ?? ESTADOS_TRAMITE[$c['tipo']][0];
    $c['creado'] = ahora_(); $c['creado_por'] = $u['id'] ?? '';
    $r = insertar_('TRAMITES', $c);
    registrar_($u, 'alta_tramite', 'TRAMITES', $r['id'], $c['tipo'] . ' ' . txt_($c['direccion'] ?? ''));
  }
  return ['ok' => true, 'tramite' => tramitePublico_($r ?? array_merge($actual ?? [], $c), indexar_(leer_('CLIENTES')), indexar_(leer_('USUARIOS')), $fin)];
}

/**
 * Alta o actualización en bloque (sincronización con el Drive de Rubén).
 * p.tramites = [{tipo, numero, direccion, carpeta_id, …}]. Con «soloVacios»
 * no pisa lo que ya se haya tocado en el CRM (salvo estado y progreso, que
 * mandan desde el Excel si se pide «estados»).
 */
function accImportarTramites_(array $u, array $p): array {
  exigirDireccionTra_($u);
  asegurarHoja_('TRAMITES');
  $fin = !empty(permisos_($u)['finanzas']);
  $filas = is_array($p['tramites'] ?? null) ? $p['tramites'] : [];
  if (!count($filas)) return ['ok' => false, 'error' => 'No ha llegado ningún trámite.'];
  $soloVacios = !empty($p['soloVacios']);
  $clientes = leer_('CLIENTES');
  $todos = leer_('TRAMITES');
  $nuevos = 0; $cambiados = 0; $sinCliente = []; $aurus = []; $cliIdx = null;
  foreach ($filas as $d) {
    if (!is_array($d)) continue;
    $tipo = normal_($d['tipo'] ?? '');
    if (!in_array($tipo, tiposVisiblesTra_($u), true)) continue;
    $actual = null;
    $k = claveDireccionTra_($d['direccion'] ?? '');
    foreach ($todos as $t) {
      if (normal_($t['tipo'] ?? '') !== $tipo) continue;
      if (txt_($d['carpeta_id'] ?? '') !== '' && txt_($t['carpeta_id'] ?? '') === txt_($d['carpeta_id'])) { $actual = $t; break; }
    }
    if (!$actual && $k !== '') foreach ($todos as $t) {
      if (normal_($t['tipo'] ?? '') === $tipo && mismaDireccionTra_($k, claveDireccionTra_($t['direccion'] ?? ''))) { $actual = $t; break; }
    }
    if (!$actual && txt_($d['numero'] ?? '') !== '' && $k === '') foreach ($todos as $t) {
      if (normal_($t['tipo'] ?? '') === $tipo && txt_($t['numero'] ?? '') === txt_($d['numero'])) { $actual = $t; break; }
    }
    $e = $d;
    $cliIdx = $cliIdx ?? indexar_($clientes);
    $cid = txt_($e['cliente_id'] ?? '') ?: clientePorDireccionTra_(txt_($d['direccion'] ?? ''), $clientes);
    if ($cid !== '' && esAurusTra_($cliIdx[$cid] ?? null)) { $aurus[] = txt_($d['direccion'] ?? ''); continue; }
    if (txt_($e['cliente_id'] ?? '') === '') {
      $e['cliente_id'] = clientePorDireccionTra_(txt_($d['direccion'] ?? ''), $clientes);
      if ($e['cliente_id'] === '') { unset($e['cliente_id']); $sinCliente[] = txt_($d['direccion'] ?? $d['nombre'] ?? ''); }
    }
    $c = cambiosTra_($e, $actual, $fin, $soloVacios && $actual !== null);
    if (!empty($p['estados']) && $actual) {
      foreach (['estado', 'progreso'] as $x) if (array_key_exists($x, $d) && txt_($d[$x]) !== '') $c[$x] = $x === 'progreso' ? (int)num_($d[$x]) : normal_($d[$x]);
    }
    if (!count($c)) continue;
    $c['modificado'] = ahora_(); $c['modificado_por'] = $u['id'] ?? '';
    if ($actual) {
      $r = actualizar_('TRAMITES', $actual['id'], $c); $cambiados++;
      foreach ($todos as $i => $t) if ($t['id'] === $actual['id']) $todos[$i] = $r ?? array_merge($t, $c);
    } else {
      $c['estado'] = $c['estado'] ?? ESTADOS_TRAMITE[$tipo][0];
      $c['creado'] = ahora_(); $c['creado_por'] = $u['id'] ?? '';
      $todos[] = insertar_('TRAMITES', $c); $nuevos++;
    }
  }
  guardarConfigTra_('tramites_sincronizado', ahora_());
  registrar_($u, 'importar_tramites', 'TRAMITES', '', $nuevos . ' nuevos, ' . $cambiados . ' actualizados');
  return ['ok' => true, 'nuevos' => $nuevos, 'actualizados' => $cambiados, 'sin_cliente' => array_values(array_unique(array_filter($sinCliente))), 'aurus_fuera' => array_values(array_unique(array_filter($aurus)))];
}

function guardarConfigTra_(string $clave, string $valor): void {
  escribirConfig_($clave, $valor, $clave === 'sync_contabilidad' ? 'Sincronización de la contabilidad (BankTrack y Drive)' : 'Última sincronización de CAEs y WIXER con Drive');
}

/**
 * Estado de la sincronización de la contabilidad (BankTrack y Drive ›
 * FACTURACIÓN). La escribe la tarea programada que sincroniza cada día;
 * se enseña en Contabilidad. Solo finanzas.
 */
function accSyncContabilidad_(array $u, array $p): array {
  exigir_($u, 'finanzas');
  if (isset($p['guardar']) && is_array($p['guardar'])) {
    $g = $p['guardar'];
    $limpio = [
      'fecha' => ahora_(),
      'banktrack' => is_array($g['banktrack'] ?? null) ? array_slice($g['banktrack'], 0, 20) : [],
      'drive' => is_array($g['drive'] ?? null) ? array_slice($g['drive'], 0, 20) : [],
      'avisos' => array_slice(array_map(fn($x) => trozo_(txt_($x), 0, 300), is_array($g['avisos'] ?? null) ? $g['avisos'] : []), 0, 40)
    ];
    guardarConfigTra_('sync_contabilidad', json_encode($limpio, JSON_UNESCAPED_UNICODE));
    registrar_($u, 'sync_contabilidad', 'CONFIG', 'sync_contabilidad', count($limpio['avisos']) . ' avisos');
    return ['ok' => true, 'sync' => $limpio];
  }
  return ['ok' => true, 'sync' => jsonTra_(config_()['sync_contabilidad'] ?? '')];
}
