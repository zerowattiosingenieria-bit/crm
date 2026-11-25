<?php
/**
 * etiquetas.php — Etiquetas del tablero de fichas (25/11/2026, Nando).
 *
 * «En el tablero de fichas tengo que poder meter las etiquetas con las que trabajamos,
 *  e incluso alguna más si quiero.»
 *
 * Catálogo ETIQUETAS: arranca con las del Trello de visitas (mismos nombres y colores).
 * Las que llevan «clave» van ligadas al estado de la cita (confirmada, sentada, venta…) o
 * a datos de la ficha (tecnología, propuesta enviada) y salen solas; el resto se ponen y
 * quitan a mano en cada ficha (CAPTACIONES.etiquetas = ids separados por comas).
 * Crear, renombrar, cambiar de color o retirar etiquetas: Nando, Fernando y el superadmin
 * (permiso controlsub) y dirección. Ponerlas en una ficha: quien puede editar esa ficha.
 */

/* Las 20 del tablero de visitas de Trello (whf4hb8Y), mismo nombre y color, más dos del CRM. */
const ETIQUETAS_TRELLO = [
  ['fv', 'FOTOVOLTAICA', '#4bce97'], ['aero', 'AEROTERMIA', '#fea362'], ['confirmada', 'CONFIRMADA 📲', '#0c66e4'], ['', 'Libre', '#fedec8'],
  ['', 'Sandra 🐝', '#e774bb'], ['', 'ROBER', '#6e5dc6'], ['', 'FERNANDO', '#946f00'], ['', 'Abraham 🐝', '#94c748'],
  ['bat', 'Batería 🔋🔋', '#5b7f24'], ['sentada', 'SENTADA', '#f8e6a0'], ['', 'OCUPADO', '#c9372c'], ['proyecto', 'PROYECTO HECHO 📐', '#579dff'],
  ['potencial', 'VISITA CON POTENCIAL♻️', '#c6edfb'], ['propuesta', 'PROPUESTA ENVIADA 📨', '#baf3db'], ['reagendar', 'REAGENDAR', '#dfd8fd'], ['venta', 'VENTA', '#1f845a'],
  ['', 'EN OPERACIÓN 📡', '#d3f1a7'], ['suelo', 'SUELO RADIANTE', '#ffd5d2'], ['', 'PÉRGOLA', '#626f86'], ['', 'FINALIZADA CON ÉXITO🐝', '#6cc3e0'],
  ['cancelada', 'CANCELADA', '#ae2e24'], ['pendiente_aut', 'PENDIENTE DE AUTORIZAR', '#c25100'],
];

function etiquetasTablero_(): array {
  $l = leer_('ETIQUETAS');
  if (!$l) {
    foreach (ETIQUETAS_TRELLO as $i => [$clave, $nombre, $color])
      insertar_('ETIQUETAS', ['clave' => $clave, 'nombre' => $nombre, 'color' => $color, 'orden' => ($i + 1) * 10, 'activa' => 'si', 'creado' => ahora_(), 'creado_por' => 'sistema']);
    $l = leer_('ETIQUETAS');
  }
  usort($l, fn($a, $b) => ((int)$a['orden'] <=> (int)$b['orden']) ?: strcmp(txt_($a['id']), txt_($b['id'])));
  return array_map(fn($e) => ['id' => txt_($e['id']), 'clave' => txt_($e['clave']), 'nombre' => txt_($e['nombre']), 'color' => txt_($e['color']),
    'orden' => (int)$e['orden'], 'activa' => normal_($e['activa']) !== 'no'], $l);
}

/** Solo ids de etiquetas que existen, sin repetir: «EQ-000014,EQ-000015». */
function limpiarEtiquetas_($v): string {
  $ids = is_array($v) ? $v : preg_split('/\s*,\s*/', txt_($v));
  $hay = [];
  foreach (etiquetasTablero_() as $e) $hay[$e['id']] = true;
  $ok = [];
  foreach ($ids as $id) { $id = txt_($id); if ($id !== '' && isset($hay[$id]) && !in_array($id, $ok, true)) $ok[] = $id; }
  return implode(',', array_slice($ok, 0, 20));
}

function accEtiquetasTablero_(array $u, array $p): array {
  return ['ok' => true, 'etiquetas' => etiquetasTablero_()];
}

/** p.id (vacío = nueva), p.nombre, p.color, p.activa ('si'/'no'), p.orden. */
function accGuardarEtiqueta_(array $u, array $p): array {
  $per = permisos_($u);
  if (empty($per['controlsub']) && ($per['alcance'] ?? '') !== 'todo') return ['ok' => false, 'error' => 'Las etiquetas las crean y cambian Nando, Fernando o el superadmin.'];
  etiquetasTablero_();
  $nombre = mb_substr(trim(txt_($p['nombre'] ?? '')), 0, 40);
  $color = preg_match('/^#[0-9a-fA-F]{6}$/', txt_($p['color'] ?? '')) ? strtolower(txt_($p['color'])) : '';
  if (txt_($p['id'] ?? '') === '') {
    if ($nombre === '') return ['ok' => false, 'error' => 'Ponle un nombre a la etiqueta.'];
    foreach (etiquetasTablero_() as $e) if ($e['activa'] && normal_($e['nombre']) === normal_($nombre)) return ['ok' => false, 'error' => 'Ya hay una etiqueta «' . $e['nombre'] . '».'];
    $max = 0; foreach (etiquetasTablero_() as $e) $max = max($max, $e['orden']);
    $e = insertar_('ETIQUETAS', ['clave' => '', 'nombre' => $nombre, 'color' => $color ?: '#8590a2', 'orden' => $max + 10, 'activa' => 'si', 'creado' => ahora_(), 'creado_por' => $u['id']]);
    registrar_($u, 'crear_etiqueta', 'ETIQUETAS', $e['id'], $nombre);
  } else {
    $e = buscar1_('ETIQUETAS', fn($x) => mismo_($x['id'], $p['id']));
    if (!$e) return ['ok' => false, 'error' => 'Esa etiqueta ya no está.'];
    $c = [];
    if ($nombre !== '') $c['nombre'] = $nombre;
    if ($color !== '') $c['color'] = $color;
    if (isset($p['activa'])) $c['activa'] = normal_($p['activa']) === 'no' ? 'no' : 'si';
    if (isset($p['orden']) && is_numeric($p['orden'])) $c['orden'] = (int)$p['orden'];
    $e = actualizar_('ETIQUETAS', $e['id'], $c);
    registrar_($u, 'cambiar_etiqueta', 'ETIQUETAS', $e['id'], json_encode($c, JSON_UNESCAPED_UNICODE));
  }
  return ['ok' => true, 'etiqueta' => $e, 'etiquetas' => etiquetasTablero_()];
}
