<?php
/**
 * CRM · ZERO WATTIOS
 * seguimiento.php — Panel de seguimiento de operaciones (10/11/2026, petición
 * de Rubén a través de Nando).
 *
 * «Necesita una interfaz que pueda ver el estado de todas las operaciones de
 * una forma muy ágil y rápida, de un simple vistazo»: check de correos y
 * WhatsApp (CEE inicial, aviso de descarga…) y check de documentación (CIE,
 * CITE…). Todo sale de las pestañas CORREOS-WHATSSAP y DOCUMENTACIÓN
 * PROYECTOS del Excel «SEGUIMIENTO OPERACIONES ZERO WATTIOS BUENO».
 *
 * - El Excel manda: aquí solo se LEE (regla de Nando: no cambiar nada en ese
 *   documento). Se descarga de Drive, se lee el .xlsm con ZipArchive y se
 *   guarda una copia ya interpretada en zw_propiedades durante 10 minutos.
 * - Solo dirección (alcance «todo»).
 * - Nunca salen DNI, teléfono ni email: solo nº, nombre, dirección,
 *   población, contrato, fecha de financiación, productos y los checks.
 */

require_once __DIR__ . '/base.php';

const SEG_EXCEL_ID = '1NXH1uIJHFDzCk0W8dym6fWwLXbjYdpmF';
const SEG_CACHE_MIN = 10;

/* Columnas de cada pestaña: clave => [texto de la cabecera normalizado (empieza por), etiqueta corta, aplica a]. */
const SEG_COMUNICACION = [
  'wa_preinst_aero' => ['whatsapp preinstalacion aerotermia', 'WhatsApp preinstalación aerotermia', 'Preinst. aero', 'aero'],
  'wa_preinst_fv'   => ['whatsapp preinstalacion fotovoltaica', 'WhatsApp preinstalación fotovoltaica', 'Preinst. FV', 'fv'],
  'wa_dr'           => ['whatsapp dr', 'WhatsApp DR (Juan)', 'DR', ''],
  'wa_cee_ini'      => ['whatsapp cee inicial', 'WhatsApp CEE inicial', 'CEE inicial', ''],
  'equipos_pedidos' => ['dia 7', 'Día 7 · equipos solicitados', 'Día 7 pedido', ''],
  'equipos_llegan'  => ['dia 15', 'Día 15 · equipos recibidos (aviso de descarga)', 'Día 15 descarga', ''],
  'montaje'         => ['dia 21', 'Día 21-30 · fecha de suministro y montaje', 'Día 21 montaje', ''],
  'wa_cie'          => ['whatsapp cie', 'WhatsApp CIE / COVE', 'CIE/COVE', ''],
  'wa_cee_fin'      => ['whatsapp cee final', 'WhatsApp CEE final', 'CEE final', ''],
  'mail_pasos'      => ['correo a cliente indicando', 'Correo: pasos a seguir', '✉ Pasos', ''],
  'mail_cee'        => ['correo a cliente enviando cee', 'Correo: envío del CEE', '✉ CEE', ''],
  'mail_final'      => ['correo a cliente con documentacion', 'Correo: documentación final', '✉ Doc. final', '']
];
const SEG_DOCUMENTACION = [
  'visita_aero'  => ['visita presintalacion aerotermia', 'Visita preinstalación aerotermia', 'Visita aero', 'aero'],
  'visita_fv'    => ['visita presintalacion fotovoltaica', 'Visita preinstalación fotovoltaica', 'Visita FV', 'fv'],
  'cee_ini'      => ['cee inicial', 'CEE inicial', 'CEE inicial', ''],
  'dr'           => ['dr', 'Declaración responsable (DR)', 'DR', ''],
  'cie'          => ['cie', 'CIE (boletín eléctrico)', 'CIE', ''],
  'cite'         => ['cite', 'CITE', 'CITE', ''],
  'cee_fin'      => ['cee final', 'CEE final', 'CEE final', ''],
  'fotos'        => ['fotos finales', 'Fotos finales', 'Fotos', ''],
  'ayto'         => ['documentacion ayuntamiento', 'Documentación ayuntamiento', 'Ayto.', ''],
  'memoria'      => ['memoria', 'Memoria / proyecto', 'Memoria', ''],
  'cove'         => ['cove', 'COVE', 'COVE', ''],
  'caes'         => ['documentacion caes', 'Documentación CAEs', 'CAEs', ''],
  'domusa'       => ['puesta en marcha domusa', 'Puesta en marcha Domusa (Abraham)', 'P. marcha', 'aero'],
  'resena'       => ['encuesta de calidad', 'Encuesta de calidad / reseña', 'Reseña', '']
];

function exigirDireccionSeg_(array $u): void {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') throw new Exception('Este apartado es solo para dirección.');
}

/* ---------- lectura del .xlsx/.xlsm ---------- */

/** Pestañas del libro: [nombre => [[celdas fila 1], [fila 2]…]] solo de las que interesan. */
function leerLibroSeg_(string $binario, array $quiero): array {
  $tmp = tempnam(sys_get_temp_dir(), 'seg');
  file_put_contents($tmp, $binario);
  $za = new ZipArchive();
  if ($za->open($tmp) !== true) { @unlink($tmp); throw new Exception('El Excel de seguimiento no se puede abrir.'); }
  try {
    $comunes = [];
    $ss = $za->getFromName('xl/sharedStrings.xml');
    if ($ss !== false) {
      $x = simplexml_load_string($ss);
      foreach ($x->si as $si) {
        if (isset($si->t)) $comunes[] = (string)$si->t;
        else { $t = ''; foreach ($si->r as $r) $t .= (string)$r->t; $comunes[] = $t; }
      }
    }
    $rels = [];
    $xr = simplexml_load_string($za->getFromName('xl/_rels/workbook.xml.rels'));
    foreach ($xr->Relationship as $r) $rels[(string)$r['Id']] = (string)$r['Target'];
    $wb = simplexml_load_string($za->getFromName('xl/workbook.xml'));
    $hojas = [];
    foreach ($wb->sheets->sheet as $s) {
      $nombre = (string)$s['name'];
      $clave = null;
      foreach ($quiero as $k => $patron) if (preg_match($patron, normal_($nombre))) $clave = $k;
      if ($clave === null) continue;
      $rid = (string)$s->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
      $ruta = 'xl/' . ltrim(preg_replace('#^/?xl/#', '', $rels[$rid] ?? ''), '/');
      $xml = $za->getFromName($ruta);
      if ($xml === false) continue;
      $hojas[$clave] = filasHojaSeg_(simplexml_load_string($xml), $comunes);
    }
    return $hojas;
  } finally { $za->close(); @unlink($tmp); }
}

function colSeg_(string $ref): int {
  $l = preg_replace('/\d+/', '', $ref); $n = 0;
  for ($i = 0; $i < strlen($l); $i++) $n = $n * 26 + (ord($l[$i]) - 64);
  return $n - 1;
}

function filasHojaSeg_(SimpleXMLElement $x, array $comunes): array {
  $filas = [];
  foreach ($x->sheetData->row as $row) {
    $f = [];
    foreach ($row->c as $c) {
      $t = (string)$c['t']; $v = isset($c->v) ? (string)$c->v : null;
      if ($t === 's') $val = $comunes[(int)$v] ?? '';
      elseif ($t === 'b') $val = $v === '1';
      elseif ($t === 'inlineStr') $val = (string)($c->is->t ?? '');
      elseif ($t === 'str' || $t === 'e') $val = $v;
      else $val = $v === null || $v === '' ? null : (is_numeric($v) ? $v + 0 : $v);
      $f[colSeg_((string)$c['r'])] = $val;
    }
    $filas[(int)$row['r']] = $f;
  }
  return $filas;
}

/** Serie de Excel (días desde 1899-12-30) → AAAA-MM-DD. */
function fechaExcelSeg_($v): string {
  if (is_numeric($v) && $v > 20000) return gmdate('Y-m-d', (int)round(((float)$v - 25569) * 86400));
  return txt_($v);
}

/** ¿Está hecho? true / false / null (sin marcar). Admite casillas, ✅/⛔, SI/NO, X. */
function checkSeg_($v): ?bool {
  if ($v === true) return true;
  if ($v === false) return null;   // casilla sin marcar = pendiente
  if ($v === null) return null;
  $s = normal_((string)$v);
  if ($s === '') return null;
  if (str_contains((string)$v, '✅') || str_contains((string)$v, '✔') || in_array($s, ['si', 'sí', 'x', 'ok', 'hecho', '1', 'true', 'verdadero'], true)) return true;
  if (str_contains((string)$v, '⛔') || str_contains((string)$v, '❌') || in_array($s, ['0', 'false', 'falso'], true)) return null;  // ⛔ = aún no
  if ($s === 'no') return false;
  return null;
}

/** De una pestaña saca [nº => fila interpretada] con las columnas pedidas. */
function operacionesHojaSeg_(array $filas, array $defs): array {
  if (!$filas) return [];
  ksort($filas);
  $cab = reset($filas);
  $idx = [];
  foreach ($cab as $i => $t) $idx[$i] = trim(preg_replace('/\s+/', ' ', str_replace(['º', 'ª', '.'], '', normal_(txt_($t)))));
  $buscaCol = function (string $empieza) use ($idx) {
    foreach ($idx as $i => $t) if ($t === $empieza) return $i;
    foreach ($idx as $i => $t) if ($t !== '' && str_starts_with($t, $empieza)) return $i;
    return null;
  };
  $base = ['numero' => $buscaCol('n cliente') ?? $buscaCol('no cliente') ?? 0, 'nombre' => $buscaCol('nombre cliente'),
           'direccion' => $buscaCol('direccion'), 'poblacion' => $buscaCol('poblacion'), 'contrato' => $buscaCol('n contrato'),
           'fecha' => $buscaCol('fecha financiacion'), 'aero' => $buscaCol('producto (aerotermia)'), 'fv' => $buscaCol('producto (fotovoltaica)')];
  $cols = [];
  foreach ($defs as $k => $d) $cols[$k] = $buscaCol($d[0]);
  $res = [];
  $primera = true;
  foreach ($filas as $f) {
    if ($primera) { $primera = false; continue; }
    $nombre = txt_($f[$base['nombre']] ?? '');
    if ($nombre === '') continue;
    $num = txt_($f[$base['numero']] ?? '');
    $o = ['numero' => $num, 'nombre' => $nombre,
          'direccion' => txt_($f[$base['direccion']] ?? ''), 'poblacion' => txt_($f[$base['poblacion']] ?? ''),
          'contrato' => txt_($f[$base['contrato']] ?? ''), 'fecha_financiacion' => fechaExcelSeg_($f[$base['fecha']] ?? ''),
          'aero' => txt_($f[$base['aero']] ?? ''), 'fv' => txt_($f[$base['fv']] ?? ''), 'checks' => []];
    foreach ($cols as $k => $i) $o['checks'][$k] = $i === null ? null : checkSeg_($f[$i] ?? null);
    $res[$num !== '' ? $num : normal_($nombre)] = $o;
  }
  return $res;
}

/** Junta las dos pestañas y calcula progreso y siguiente paso. */
function construirSeguimiento_(array $hojas): array {
  $com = operacionesHojaSeg_($hojas['comunicacion'] ?? [], SEG_COMUNICACION);
  $doc = operacionesHojaSeg_($hojas['documentacion'] ?? [], SEG_DOCUMENTACION);
  $claves = array_unique(array_merge(array_keys($com), array_keys($doc)));
  $ops = [];
  foreach ($claves as $k) {
    $a = $com[$k] ?? null; $b = $doc[$k] ?? null; $x = $a ?: $b;
    $sinAero = in_array(normal_($x['aero']), ['', 'n/a', 'na', 'no', '-'], true);
    $sinFv = in_array(normal_($x['fv']), ['', 'n/a', 'na', 'no', '-'], true);
    $op = ['numero' => $x['numero'], 'nombre' => $x['nombre'], 'direccion' => $x['direccion'], 'poblacion' => $x['poblacion'],
           'contrato' => $x['contrato'], 'fecha_financiacion' => $x['fecha_financiacion'],
           'aero' => $sinAero ? '' : $x['aero'], 'fv' => $sinFv ? '' : $x['fv']];
    foreach (['comunicacion' => [SEG_COMUNICACION, $a], 'documentacion' => [SEG_DOCUMENTACION, $b]] as $bloque => [$defs, $fila]) {
      $estados = []; $hechos = 0; $aplican = 0; $siguiente = '';
      foreach ($defs as $ck => $d) {
        $v = $fila ? ($fila['checks'][$ck] ?? null) : null;
        $noAplica = ($d[3] === 'aero' && $sinAero) || ($d[3] === 'fv' && $sinFv);
        if ($v === true) $e = 'si';
        elseif ($noAplica) $e = 'na';
        elseif ($v === false) $e = 'no';
        else $e = 'pte';
        $estados[$ck] = $e;
        if ($e !== 'na') { $aplican++; if ($e === 'si') $hechos++; elseif ($siguiente === '') $siguiente = $d[1]; }
      }
      $op[$bloque] = $estados;
      $op['p_' . $bloque] = $aplican ? (int)round($hechos * 100 / $aplican) : 100;
      $op['sig_' . $bloque] = $siguiente;
      $op['pte_' . $bloque] = $aplican - $hechos;
    }
    $op['progreso'] = (int)round(($op['p_comunicacion'] + $op['p_documentacion']) / 2);
    $ops[] = $op;
  }
  usort($ops, fn($p, $q) => ((int)$q['numero'] <=> (int)$p['numero']) ?: strcmp($p['nombre'], $q['nombre']));
  return $ops;
}

function columnasSeg_(): array {
  $c = [];
  foreach (['comunicacion' => SEG_COMUNICACION, 'documentacion' => SEG_DOCUMENTACION] as $b => $defs)
    foreach ($defs as $k => $d) $c[$b][] = ['id' => $k, 'nombre' => $d[1], 'corto' => $d[2], 'aplica' => $d[3]];
  return $c;
}

/* ---------- acción ---------- */

function accSeguimientoOperaciones_(array $u, array $p): array {
  exigirDireccionSeg_($u);
  $cfg = config_();
  $id = txt_($cfg['seguimiento_excel_id'] ?? '') ?: SEG_EXCEL_ID;
  $cache = json_decode((string)prop_('SEGUIMIENTO_CACHE'), true);
  $fresco = is_array($cache) && ($cache['id'] ?? '') === $id && !empty($cache['leido'])
    && (time() - strtotime($cache['leido'])) < SEG_CACHE_MIN * 60;
  $aviso = '';
  if (!$fresco || !empty($p['forzar'])) {
    try {
      $r = driveDescargar_($id);
      $bin = base64_decode($r['base64'] ?? '');
      if (!$bin) throw new Exception('El Excel ha llegado vacío.');
      $hojas = leerLibroSeg_($bin, ['comunicacion' => '/correos|whats/', 'documentacion' => '/documentacion proyecto/']);
      if (empty($hojas['comunicacion']) && empty($hojas['documentacion'])) throw new Exception('No encuentro las pestañas CORREOS-WHATSAPP y DOCUMENTACIÓN PROYECTOS.');
      $cache = ['id' => $id, 'leido' => ahora_(), 'nombre' => preg_match('/\.xls[xm]?$/i', txt_($r['nombre'] ?? '')) ? preg_replace('/\.xls[xm]?$/i', '', txt_($r['nombre'])) : 'SEGUIMIENTO OPERACIONES ZERO WATTIOS BUENO', 'operaciones' => construirSeguimiento_($hojas)];
      setProp_('SEGUIMIENTO_CACHE', aJson_($cache));
    } catch (Throwable $e) {
      if (!is_array($cache) || empty($cache['operaciones'])) throw new Exception('No se ha podido leer el Excel de seguimiento: ' . $e->getMessage());
      $aviso = 'No se ha podido releer el Excel (' . $e->getMessage() . '); se muestra la última lectura.';
    }
  }
  return ['ok' => true, 'operaciones' => $cache['operaciones'], 'columnas' => columnasSeg_(), 'leido' => $cache['leido'],
          'archivo' => $cache['nombre'] ?? '', 'url' => 'https://drive.google.com/file/d/' . $id . '/view', 'aviso' => $aviso];
}
