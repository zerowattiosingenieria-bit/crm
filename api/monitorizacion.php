<?php
/**
 * Monitorización de las plantas de SolaX Cloud (13/11/2026, pedido por Nando).
 *
 * Una tarea diaria lee las plantas de global.solaxcloud.com y las manda aquí:
 * una fila por planta y día (generación, carga/descarga de batería, estado de la
 * planta y de la red) con la incidencia y la recomendación si las hay. Cada planta
 * se enlaza con su cliente por la dirección (o por el nombre / un mapa fijo), y la
 * ficha del cliente enseña su última lectura y el histórico.
 *
 * Importar: solo dirección. Leer la de un cliente: quien vea ese cliente.
 */

function exigirDireccionMon_(array $u): void {
  if ((permisos_($u)['alcance'] ?? '') !== 'todo') throw new Exception('Solo la dirección puede cargar la monitorización.');
}

/** Mapa fijo planta → cliente (propiedad SOLAX_MAPA, JSON), para plantas sin número en la dirección. */
function mapaSolax_(): array {
  $m = json_decode((string)prop_('SOLAX_MAPA'), true);
  return is_array($m) ? $m : [];
}

function clienteDePlanta_(array $d, array $clientes, array $mapa): string {
  $planta = txt_($d['planta'] ?? '');
  if (txt_($d['cliente_id'] ?? '') !== '') return txt_($d['cliente_id']);
  if ($planta !== '' && isset($mapa[$planta])) return txt_($mapa[$planta]);
  $cid = clientePorDireccionTra_(txt_($d['direccion'] ?? ''), $clientes);
  if ($cid !== '') return $cid;
  /* Por nombre: la planta suele llamarse como el titular. */
  $np = normal_($planta);
  if (strlen($np) >= 6) foreach ($clientes as $c) {
    $nc = normal_($c['nombre'] ?? '');
    if (strlen($nc) >= 6 && ($nc === $np || str_contains($nc, $np) || str_contains($np, $nc))) return txt_($c['id']);
  }
  return '';
}

function accImportarMonitorizacion_(array $u, array $p): array {
  exigirDireccionMon_($u);
  $filas = is_array($p['plantas'] ?? null) ? $p['plantas'] : [];
  if (!count($filas)) return ['ok' => false, 'error' => 'No ha llegado ninguna planta.'];
  $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', txt_($p['fecha'] ?? '')) ? txt_($p['fecha']) : hoyISO_();
  if (is_array($p['mapa'] ?? null)) {
    $m = mapaSolax_();
    foreach ($p['mapa'] as $k => $v) if (txt_($k) !== '' && txt_($v) !== '') $m[txt_($k)] = txt_($v);
    setProp_('SOLAX_MAPA', json_encode($m, JSON_UNESCAPED_UNICODE));
  }
  $mapa = mapaSolax_();
  $clientes = leer_('CLIENTES');
  $hoy = array_values(array_filter(leer_('MONITOREO'), fn($r) => txt_($r['fecha'] ?? '') === $fecha));
  $nuevas = 0; $cambiadas = 0; $sinCliente = [];
  foreach ($filas as $d) {
    if (!is_array($d) || txt_($d['planta'] ?? '') === '') continue;
    $cid = clienteDePlanta_($d, $clientes, $mapa);
    if ($cid === '') $sinCliente[] = txt_($d['planta']) . ' · ' . txt_($d['direccion'] ?? '');
    $fila = ['fecha' => $fecha, 'cliente_id' => $cid];
    foreach (['planta', 'usuario_solax', 'direccion', 'estado', 'red', 'incidencia', 'recomendacion'] as $c) $fila[$c] = mb_substr(txt_($d[$c] ?? ''), 0, 400);
    foreach (['kwp', 'bat_kwh', 'gen_dia', 'carga_dia', 'descarga_dia', 'gen_mes', 'gen_total'] as $c)
      $fila[$c] = (isset($d[$c]) && $d[$c] !== '' && $d[$c] !== '--' && $d[$c] !== null) ? (float)str_replace(',', '.', (string)$d[$c]) : '';
    $ya = null;
    foreach ($hoy as $r) if (txt_($r['planta'] ?? '') === $fila['planta']) { $ya = $r; break; }
    if ($ya) { actualizar_('MONITOREO', $ya['id'], $fila); $cambiadas++; }
    else { $fila['creado'] = ahora_(); insertar_('MONITOREO', $fila); $nuevas++; }
  }
  registrar_($u, 'monitorizacion', 'MONITOREO', '', "$fecha · $nuevas nuevas · $cambiadas actualizadas");
  return ['ok' => true, 'fecha' => $fecha, 'nuevas' => $nuevas, 'actualizadas' => $cambiadas, 'sin_cliente' => $sinCliente];
}

function filaMon_(array $r): array {
  $o = [];
  foreach (ESQUEMA['MONITOREO'] as $c) $o[$c] = $r[$c] ?? '';
  return $o;
}

/** Histórico (90 días) de las plantas de un cliente, lo último primero. */
function accMonitorizacionCliente_(array $u, array $p): array {
  $v = clienteVisible_($u, $p['cliente_id'] ?? '');
  if (isset($v['error'])) return ['ok' => false, 'error' => $v['error']];
  $desde = ahoraDT_()->modify('-90 days')->format('Y-m-d');
  $rows = array_values(array_filter(leer_('MONITOREO'), fn($r) => mismo_($r['cliente_id'] ?? '', $v['cliente']['id']) && txt_($r['fecha'] ?? '') >= $desde));
  usort($rows, fn($a, $b) => strcmp(txt_($b['fecha']), txt_($a['fecha'])));
  return ['ok' => true, 'lecturas' => array_map('filaMon_', $rows)];
}

/** Última lectura de todas las plantas (dirección). */
function accMonitorizacion_(array $u, array $p): array {
  exigirDireccionMon_($u);
  $rows = leer_('MONITOREO');
  $ult = [];
  foreach ($rows as $r) { $k = txt_($r['planta'] ?? ''); if (!isset($ult[$k]) || txt_($r['fecha']) > txt_($ult[$k]['fecha'])) $ult[$k] = $r; }
  return ['ok' => true, 'plantas' => array_map('filaMon_', array_values($ult)), 'mapa' => mapaSolax_()];
}
