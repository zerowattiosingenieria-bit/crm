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
 * - El Excel solo se LEE (regla de Nando: no cambiar nada en ese documento).
 *   Se descarga de Drive, se lee el .xlsm con ZipArchive y se guarda una copia
 *   ya interpretada en zw_propiedades durante 10 minutos.
 * - Se puede editar desde el CRM (10/11/2026, Nando: «se tiene que poder
 *   editar si se da sobre un cliente»): cada cambio se guarda en el CRM
 *   (propiedad SEGUIMIENTO_CAMBIOS) y manda sobre lo que diga el Excel. Cuando
 *   el Excel llega a decir lo mismo, el cambio del CRM se retira solo y vuelve
 *   a mandar el Excel.
 * - Copia editable en Google Sheets («… · COPIA EDITABLE», misma carpeta): se
 *   rehace con el original + los cambios en cada lectura, en cada cambio y en
 *   el tic de 10 minutos. Lo que alguien marque o desmarque directamente en la
 *   copia se detecta (comparando con lo último que escribió el CRM) y pasa a
 *   ser un cambio del CRM. Necesita los servicios hojaLeer/hojaEscribir del
 *   Apps Script.
 * - Solo dirección (alcance «todo»).
 * - Nunca salen DNI, teléfono ni email: solo nº, nombre, dirección,
 *   población, contrato, fecha de financiación, productos y los checks.
 */

require_once __DIR__ . '/base.php';

const SEG_EXCEL_ID = '1NXH1uIJHFDzCk0W8dym6fWwLXbjYdpmF';
const SEG_CACHE_MIN = 10;
/* Copia editable en Google Sheets (10/11/2026): Rubén sigue en el Excel original;
   la copia = original + cambios hechos en el CRM o tocados en la propia copia. */
const SEG_COPIA_ID = '1Azgj1jjb79fTKJoXrpl8s7nzCFKnUETeVuhRdiLKiFs';
const SEG_COPIA_PESTANAS = ['comunicacion' => 'CORREOS-WHATSSAP', 'documentacion' => 'DOCUMENTACIÓN PROYECTOS'];
const SEG_TEXTO = ['domusa', 'resena'];   // columnas que el Excel marca con ✅ en texto, no con casilla

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

/** Índices de las columnas base y de los checks a partir de la fila de cabecera. */
function columnasHojaSeg_(array $cab, array $defs): array {
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
  return [$base, $cols];
}

/** De una pestaña saca [nº => fila interpretada] con las columnas pedidas. */
function operacionesHojaSeg_(array $filas, array $defs): array {
  if (!$filas) return [];
  ksort($filas);
  $cab = reset($filas);
  [$base, $cols] = columnasHojaSeg_($cab, $defs);
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
    $op = ['clave' => (string)$k, 'numero' => $x['numero'], 'nombre' => $x['nombre'], 'direccion' => $x['direccion'], 'poblacion' => $x['poblacion'],
           'contrato' => $x['contrato'], 'fecha_financiacion' => $x['fecha_financiacion'],
           'aero' => $sinAero ? '' : $x['aero'], 'fv' => $sinFv ? '' : $x['fv']];
    foreach (['comunicacion' => [SEG_COMUNICACION, $a], 'documentacion' => [SEG_DOCUMENTACION, $b]] as $bloque => [$defs, $fila]) {
      $estados = [];
      foreach ($defs as $ck => $d) {
        $v = $fila ? ($fila['checks'][$ck] ?? null) : null;
        $noAplica = ($d[3] === 'aero' && $sinAero) || ($d[3] === 'fv' && $sinFv);
        $estados[$ck] = $v === true ? 'si' : ($noAplica ? 'na' : ($v === false ? 'no' : 'pte'));
      }
      $op[$bloque] = $estados;
    }
    recalcularOpSeg_($op);
    $ops[] = $op;
  }
  usort($ops, fn($p, $q) => ((int)$q['numero'] <=> (int)$p['numero']) ?: strcmp($p['nombre'], $q['nombre']));
  return $ops;
}

const SEG_ESTADOS = ['si', 'pte', 'no', 'na'];

function defsSeg_(): array { return ['comunicacion' => SEG_COMUNICACION, 'documentacion' => SEG_DOCUMENTACION]; }

/** Progreso, pendientes y siguiente paso de cada bloque a partir de los estados. */
function recalcularOpSeg_(array &$op): void {
  foreach (defsSeg_() as $bloque => $defs) {
    $hechos = 0; $aplican = 0; $siguiente = '';
    foreach ($defs as $ck => $d) {
      $e = $op[$bloque][$ck] ?? 'pte';
      if ($e === 'na') continue;
      $aplican++;
      if ($e === 'si') $hechos++; elseif ($siguiente === '') $siguiente = $d[1];
    }
    $op['p_' . $bloque] = $aplican ? (int)round($hechos * 100 / $aplican) : 100;
    $op['sig_' . $bloque] = $siguiente;
    $op['pte_' . $bloque] = $aplican - $hechos;
  }
  $op['progreso'] = (int)round(($op['p_comunicacion'] + $op['p_documentacion']) / 2);
}

function claveOpSeg_(array $op): string {
  return txt_($op['clave'] ?? '') ?: (txt_($op['numero'] ?? '') ?: normal_(txt_($op['nombre'] ?? '')));
}

function cambiosSeg_(): array {
  $c = json_decode((string)prop_('SEGUIMIENTO_CAMBIOS'), true);
  return is_array($c) ? $c : [];
}

/**
 * Pone encima de lo leído del Excel los cambios hechos en el CRM. Si el Excel
 * ya dice lo mismo que el cambio, el cambio sobra y se apunta en $sobran.
 */
function aplicarCambiosSeg_(array $ops, array $cambios, array &$sobran): array {
  foreach ($ops as &$op) {
    $k = claveOpSeg_($op);
    $op['clave'] = $k;
    $op['editado'] = new stdClass();
    if (empty($cambios[$k])) continue;
    $ed = [];
    foreach ($cambios[$k] as $id => $c) {
      [$bloque, $ck] = array_pad(explode('.', $id, 2), 2, '');
      if (!isset($op[$bloque][$ck])) continue;
      $excel = $op[$bloque][$ck];
      if ($excel === ($c['e'] ?? '')) { $sobran[] = [$k, $id]; continue; }
      $op[$bloque][$ck] = $c['e'];
      $ed[$id] = ['excel' => $excel, 'por' => $c['por'] ?? '', 'en' => $c['en'] ?? ''];
    }
    if ($ed) { $op['editado'] = $ed; recalcularOpSeg_($op); }
  }
  unset($op);
  return $ops;
}

function columnasSeg_(): array {
  $c = [];
  foreach (['comunicacion' => SEG_COMUNICACION, 'documentacion' => SEG_DOCUMENTACION] as $b => $defs)
    foreach ($defs as $k => $d) $c[$b][] = ['id' => $k, 'nombre' => $d[1], 'corto' => $d[2], 'aplica' => $d[3]];
  return $c;
}

/* ---------- acción ---------- */

/** Lectura del Excel original con su caché de 10 minutos. Devuelve [caché, aviso, releído]. */
function leerSeguimiento_(bool $forzar = false): array {
  $cfg = config_();
  $id = txt_($cfg['seguimiento_excel_id'] ?? '') ?: SEG_EXCEL_ID;
  $cache = json_decode((string)prop_('SEGUIMIENTO_CACHE'), true);
  $fresco = is_array($cache) && ($cache['id'] ?? '') === $id && !empty($cache['leido'])
    && (time() - strtotime($cache['leido'])) < SEG_CACHE_MIN * 60;
  $aviso = ''; $releido = false;
  if (!$fresco || $forzar) {
    try {
      $r = driveDescargar_($id);
      $bin = base64_decode($r['base64'] ?? '');
      if (!$bin) throw new Exception('El Excel ha llegado vacío.');
      $hojas = leerLibroSeg_($bin, ['comunicacion' => '/correos|whats/', 'documentacion' => '/documentacion proyecto/']);
      if (empty($hojas['comunicacion']) && empty($hojas['documentacion'])) throw new Exception('No encuentro las pestañas CORREOS-WHATSAPP y DOCUMENTACIÓN PROYECTOS.');
      $cache = ['id' => $id, 'leido' => ahora_(), 'nombre' => preg_match('/\.xls[xm]?$/i', txt_($r['nombre'] ?? '')) ? preg_replace('/\.xls[xm]?$/i', '', txt_($r['nombre'])) : 'SEGUIMIENTO OPERACIONES ZERO WATTIOS BUENO', 'operaciones' => construirSeguimiento_($hojas)];
      setProp_('SEGUIMIENTO_CACHE', aJson_($cache));
      $releido = true;
    } catch (Throwable $e) {
      if (!is_array($cache) || empty($cache['operaciones'])) throw new Exception('No se ha podido leer el Excel de seguimiento: ' . $e->getMessage());
      $aviso = 'No se ha podido releer el Excel (' . $e->getMessage() . '); se muestra la última lectura.';
    }
  }
  return [$cache, $aviso, $releido];
}

/** Operaciones con los cambios del CRM aplicados (y limpia los que ya sobran). */
function operacionesConCambiosSeg_(array $cache): array {
  $sobran = [];
  $ops = aplicarCambiosSeg_($cache['operaciones'], cambiosSeg_(), $sobran);
  if ($sobran) conCandado_(function () use ($sobran) {
    $c = cambiosSeg_();
    foreach ($sobran as [$k, $id]) { unset($c[$k][$id]); if (empty($c[$k])) unset($c[$k]); }
    setProp_('SEGUIMIENTO_CAMBIOS', aJson_((object)$c));
  });
  return $ops;
}

function idCopiaSeg_(): string {
  return txt_(config_()['seguimiento_copia_id'] ?? '') ?: SEG_COPIA_ID;
}

function letraColSeg_(int $i): string {
  $s = ''; $i++;
  while ($i > 0) { $m = ($i - 1) % 26; $s = chr(65 + $m) . $s; $i = intdiv($i - 1, 26); }
  return $s;
}

/**
 * Pone la copia editable al día: primero recoge lo que alguien haya tocado a
 * mano en la copia (y lo guarda como cambio del CRM) y después escribe en la
 * copia lo que diga el original + los cambios. Devuelve [operaciones, resumen].
 */
function sincronizarCopiaSeg_(array $cache): array {
  $idCopia = idCopiaSeg_();
  $r = googleServicio_('hojaLeer', ['id' => $idCopia, 'pestanas' => array_values(SEG_COPIA_PESTANAS)]);
  $copia = $r['pestanas'] ?? [];
  $ops = operacionesConCambiosSeg_($cache);
  $foto = json_decode((string)prop_('SEGUIMIENTO_COPIA_FOTO'), true);
  $foto = is_array($foto) && ($foto['_id'] ?? '') === $idCopia ? $foto : ['_id' => $idCopia];
  $defs = defsSeg_();
  $mapas = [];
  /* 1) Lo tocado a mano en la copia. */
  $nuevos = [];
  foreach (SEG_COPIA_PESTANAS as $bloque => $pest) {
    $vals = $copia[$pest] ?? null;
    if (!is_array($vals) || !$vals) continue;
    [$base, $cols] = columnasHojaSeg_($vals[0], $defs[$bloque]);
    $filas = [];
    foreach ($vals as $i => $f) if ($i > 0 && txt_($f[$base['nombre']] ?? '') !== '') $filas[txt_($f[$base['numero']] ?? '')] = $i;
    $mapas[$bloque] = ['vals' => $vals, 'base' => $base, 'cols' => $cols, 'filas' => $filas, 'ultima' => count($vals)];
    foreach ($ops as $op) {
      $i = $filas[txt_($op['numero'])] ?? null;
      if ($i === null) continue;
      foreach ($cols as $ck => $c) {
        if ($c === null) continue;
        $id = $bloque . '.' . $ck;
        if (!array_key_exists($id, $foto[$op['clave']] ?? [])) continue;
        $enCopia = checkSeg_($vals[$i][$c] ?? null) === true;
        if ($enCopia === (bool)$foto[$op['clave']][$id]) continue;
        $nuevos[] = [$op, $bloque, $ck, $enCopia ? 'si' : 'pte'];
      }
    }
  }
  if ($nuevos) {
    conCandado_(function () use ($nuevos) {
      $c = cambiosSeg_();
      foreach ($nuevos as [$op, $bloque, $ck, $e]) {
        $id = $bloque . '.' . $ck;
        $excel = ((array)($op['editado'] ?? []))[$id]['excel'] ?? ($op[$bloque][$ck] ?? '');
        if ($e === $excel) { unset($c[$op['clave']][$id]); if (empty($c[$op['clave']])) unset($c[$op['clave']]); }
        else $c[$op['clave']][$id] = ['e' => $e, 'por' => 'la copia del Excel', 'en' => ahora_()];
      }
      setProp_('SEGUIMIENTO_CAMBIOS', aJson_((object)$c));
    });
    foreach ($nuevos as [$op, $bloque, $ck, $e])
      registrar_(null, 'editar_seguimiento', 'SEGUIMIENTO', $op['clave'], trim($op['direccion'] . ' · ' . $op['nombre']) . ' · ' . $defs[$bloque][$ck][1] . ' → ' . ($e === 'si' ? 'hecho' : 'pendiente') . ' (tocado en la copia)');
    $ops = operacionesConCambiosSeg_($cache);
  }
  /* 2) Escribir en la copia lo que toca. */
  $celdas = []; $casillas = []; $nuevaFoto = ['_id' => $idCopia]; $altas = 0;
  foreach ($mapas as $bloque => &$m) {
    $pest = SEG_COPIA_PESTANAS[$bloque];
    foreach ($ops as $op) {
      $i = $m['filas'][txt_($op['numero'])] ?? null;
      if ($i === null) {
        /* Operación nueva en el original: se añade al final de la copia. */
        $i = $m['ultima']++;
        $m['filas'][txt_($op['numero'])] = $i;
        $altas++;
        $campos = ['numero' => is_numeric($op['numero']) ? $op['numero'] + 0 : $op['numero'], 'nombre' => $op['nombre'], 'direccion' => $op['direccion'],
                   'poblacion' => $op['poblacion'], 'contrato' => $op['contrato'], 'fecha' => $op['fecha_financiacion'], 'aero' => $op['aero'], 'fv' => $op['fv']];
        foreach ($campos as $k => $v) if ($m['base'][$k] !== null && txt_($v) !== '') $celdas[] = [$pest, $i + 1, $m['base'][$k] + 1, $v];
      }
      foreach ($m['cols'] as $ck => $c) {
        if ($c === null) continue;
        $quiero = ($op[$bloque][$ck] ?? '') === 'si';
        $nuevaFoto[$op['clave']][$bloque . '.' . $ck] = $quiero;
        $hay = checkSeg_($m['vals'][$i][$c] ?? null) === true;
        $texto = in_array($ck, SEG_TEXTO, true);
        if ($hay !== $quiero || (!$texto && !is_bool($m['vals'][$i][$c] ?? null)))
          $celdas[] = [$pest, $i + 1, $c + 1, $texto ? ($quiero ? '✅' : '') : $quiero];
      }
    }
    foreach ($m['cols'] as $ck => $c)
      if ($c !== null && !in_array($ck, SEG_TEXTO, true)) $casillas[] = "'" . $pest . "'!" . letraColSeg_($c) . '2:' . letraColSeg_($c) . max(2, $m['ultima']);
  }
  unset($m);
  if ($celdas) googleServicio_('hojaEscribir', ['id' => $idCopia, 'casillas' => $casillas, 'celdas' => $celdas]);
  setProp_('SEGUIMIENTO_COPIA_FOTO', aJson_($nuevaFoto));
  setProp_('SEGUIMIENTO_COPIA_FECHA', ahora_());
  return [$ops, ['escritas' => count($celdas), 'de_la_copia' => count($nuevos), 'altas' => $altas]];
}

/** Lee, aplica cambios y (si toca) pone al día la copia. Lo usan la pantalla y el tic. */
function seguimientoAlDia_(bool $forzar = false, bool $sincronizar = false): array {
  [$cache, $aviso, $releido] = leerSeguimiento_($forzar);
  $ops = null; $copia = null;
  if ($releido || $sincronizar) {
    try { [$ops, $copia] = sincronizarCopiaSeg_($cache); }
    catch (Throwable $e) { $aviso = trim($aviso . ' No se ha podido poner al día la copia editable: ' . $e->getMessage()); }
  }
  if ($ops === null) $ops = operacionesConCambiosSeg_($cache);
  return [$cache, $ops, $aviso, $copia];
}

/** Tic del reloj (cada 10 min): relee el Excel si toca y pone al día la copia. */
function ticSeguimiento_(): ?array {
  if (!prop_('SEGUIMIENTO_CACHE')) return null;   // nadie lo ha abierto todavía
  [, , $aviso, $copia] = seguimientoAlDia_(false, false);
  return $copia || $aviso ? ['copia' => $copia, 'aviso' => $aviso] : null;
}

function accSeguimientoOperaciones_(array $u, array $p): array {
  exigirDireccionSeg_($u);
  [$cache, $ops, $aviso] = seguimientoAlDia_(!empty($p['forzar']), !empty($p['forzar']) || !empty($p['sincronizar']));
  $idCopia = idCopiaSeg_();
  return ['ok' => true, 'operaciones' => $ops, 'columnas' => columnasSeg_(), 'leido' => $cache['leido'],
          'archivo' => $cache['nombre'] ?? '', 'url' => 'https://drive.google.com/file/d/' . $cache['id'] . '/view',
          'copia_url' => 'https://docs.google.com/spreadsheets/d/' . $idCopia . '/edit', 'copia_fecha' => prop_('SEGUIMIENTO_COPIA_FECHA') ?? '',
          'aviso' => $aviso];
}

/**
 * Cambia un check de una operación desde el CRM. estado: si | pte | no | na,
 * o «excel» para quitar el cambio y volver a lo que diga el Excel.
 */
function accSeguimientoCambiar_(array $u, array $p): array {
  exigirDireccionSeg_($u);
  $k = txt_($p['clave'] ?? '');
  $bloque = txt_($p['bloque'] ?? ''); $ck = txt_($p['check'] ?? ''); $e = txt_($p['estado'] ?? '');
  $defs = defsSeg_();
  if ($k === '' || !isset($defs[$bloque][$ck])) throw new Exception('Ese check no existe.');
  if ($e !== 'excel' && !in_array($e, SEG_ESTADOS, true)) throw new Exception('Estado no válido.');
  $cache = json_decode((string)prop_('SEGUIMIENTO_CACHE'), true);
  $op = null;
  foreach (($cache['operaciones'] ?? []) as $o) if (claveOpSeg_($o) === $k) $op = $o;
  if (!$op) throw new Exception('No encuentro esa operación en el seguimiento. Pulsa «Actualizar» y vuelve a probar.');
  $id = $bloque . '.' . $ck;
  conCandado_(function () use ($k, $id, $e, $u, $op, $bloque, $ck) {
    $c = cambiosSeg_();
    if ($e === 'excel' || ($op[$bloque][$ck] ?? '') === $e) { unset($c[$k][$id]); if (empty($c[$k])) unset($c[$k]); }
    else $c[$k][$id] = ['e' => $e, 'por' => primerNombre_(txt_($u['nombre'] ?? '')), 'en' => ahora_()];
    setProp_('SEGUIMIENTO_CAMBIOS', aJson_((object)$c));
  });
  $nombre = $defs[$bloque][$ck][1];
  $txt = ['si' => 'hecho', 'pte' => 'pendiente', 'no' => 'no', 'na' => 'no aplica', 'excel' => 'lo que diga el Excel'][$e];
  registrar_($u, 'editar_seguimiento', 'SEGUIMIENTO', $k, trim($op['direccion'] . ' · ' . $op['nombre']) . ' · ' . $nombre . ' → ' . $txt);
  return accSeguimientoOperaciones_($u, ['sincronizar' => true]);
}
