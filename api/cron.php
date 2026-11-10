<?php
/**
 * cron.php — Las tareas programadas (lo que antes hacían los disparadores
 * de Apps Script). Lo lanza el mu-plugin cada 5 minutos (WP-Cron) o
 * /api/cron?llave=LLAVE_CRON. Cada tarea apunta en zw_propiedades cuándo
 * se hizo por última vez, así nunca se repite ni se pierde aunque el
 * tic llegue tarde.
 *
 *   resumenSemanal()        viernes 18:00
 *   copiaSeguridad()        viernes 19:15 (+ volcado .sql.gz a Drive)
 *   avisoPuertasSemana('')  lunes 08:00
 *   recordatoriosCRM()      todos los días 13:30 y 19:30
 *   sincronizar con GitHub  cada tic (cada 5 min)
 */

require_once __DIR__ . '/cargar.php';

/* Tareas: [clave, días de la semana (1=lunes..7=domingo), hora 'HH:MM', función]. */
function tareasCron_(): array {
  return [
    ['resumen_semanal', [5], '18:00', fn() => resumenSemanal()],
    ['copia_viernes',   [5], '19:15', fn() => copiaViernes_()],
    ['aviso_puertas',   [1], '08:00', fn() => avisoPuertasSemana('')],
    ['record_1330',     [1, 2, 3, 4, 5, 6, 7], '13:30', fn() => recordatoriosCRM()],
    ['record_1930',     [1, 2, 3, 4, 5, 6, 7], '19:30', fn() => recordatoriosCRM()],
  ];
}

/** La copia de los viernes: el JSON de siempre y además el volcado SQL. */
function copiaViernes_(): array {
  $r = copiaSeguridad();
  try {
    require_once __DIR__ . '/sql.php';
    $sello = ahoraDT_()->format('Y-m-d_H-i');
    $a = driveSubir_(carpetaBackup_(), 'CRM_ZERO_WATTIOS_' . $sello . '.sql.gz', base64_encode(gzencode(volcadoSql_(), 6)), 'application/gzip');
    $r['sql'] = $a['nombre'] ?? '';
  } catch (Throwable $e) { $r['error_sql'] = $e->getMessage(); }
  return $r;
}

/**
 * ¿Toca esta tarea? Toca si hoy es uno de sus días, ya pasó la hora, y la
 * última vez que se hizo fue antes de la hora de hoy. Con un margen de 6 h:
 * si el servidor estuvo parado más, esa vuelta se salta.
 */
function tocaTarea_(string $clave, array $dias, string $hora, DateTime $ahora): bool {
  $dia = (int)$ahora->format('N');
  if (!in_array($dia, $dias, true)) return false;
  $objetivo = (clone $ahora)->setTime((int)substr($hora, 0, 2), (int)substr($hora, 3, 2), 0);
  if ($ahora < $objetivo) return false;
  if ($ahora->getTimestamp() - $objetivo->getTimestamp() > 6 * 3600) return false;
  $ultima = prop_('CRON_' . $clave);
  return !$ultima || strcmp($ultima, $objetivo->format('Y-m-d H:i:s')) < 0;
}

/** Un tic del reloj. Devuelve lo que ha hecho. */
function ejecutarCron_(string $raiz = ''): array {
  $hecho = [];
  /* Que dos tics no se pisen. */
  $db = db_();
  if (!$db->query("SELECT GET_LOCK('zw_cron', 0)")->fetchColumn()) return ['ocupado' => true];
  try {
    $ahora = ahoraDT_();
    foreach (tareasCron_() as [$clave, $dias, $hora, $fn]) {
      if (!tocaTarea_($clave, $dias, $hora, $ahora)) continue;
      setProp_('CRON_' . $clave, ahora_());       // antes de lanzarla: si falla, no se reintenta en bucle
      try { $hecho[$clave] = $fn(); }
      catch (Throwable $e) { $hecho[$clave] = ['error' => $e->getMessage()]; error_log('CRM cron ' . $clave . ': ' . $e->getMessage()); }
      olvidarTodo_();
    }
    /* Sesiones caducadas fuera, una vez por hora. */
    $ultLimpieza = prop_('CRON_limpieza');
    if (!$ultLimpieza || minutosDesde_($ultLimpieza) >= 60) {
      setProp_('CRON_limpieza', ahora_());
      try { limpiarSesiones_(); $hecho['limpieza'] = true; } catch (Throwable $e) { $hecho['limpieza'] = $e->getMessage(); }
    }
    /* Apps de clientes y subcontratas: tickets fuera de plazo → aviso y escalado a Fernando. */
    if (function_exists('ticPortal_')) {
      try { $tp = ticPortal_(); if ($tp['avisos'] || $tp['escalados']) $hecho['portal'] = $tp; } catch (Throwable $e) { $hecho['portal'] = $e->getMessage(); }
    }
    /* GitHub: si hay versión nueva de la web, se despliega. */
    if ($raiz !== '' && prop_('GITHUB_AUTO') !== 'no') {
      require_once __DIR__ . '/desplegar.php';
      try { $d = desplegarDesdeGitHub_($raiz); if (!empty($d['cambios']) || empty($d['ok'])) $hecho['github'] = $d; }
      catch (Throwable $e) { $hecho['github'] = ['error' => $e->getMessage()]; }
    }
    setProp_('CRON_ULTIMO_TIC', ahora_());
  } finally { $db->query("SELECT RELEASE_LOCK('zw_cron')"); }
  return $hecho;
}

/* Llamada directa por HTTP: /api/cron?llave=… — la hace el Apps Script cada
   10 minutos (ticCrm), que es el reloj fiable: WP-Cron solo se mueve con visitas. */
if (defined('ZW_API_NOMBRE') && ZW_API_NOMBRE === 'cron') {
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  header('X-Robots-Tag: noindex, nofollow');
  $llave = txt_($_SERVER['HTTP_X_CRON_KEY'] ?? ($_GET['llave'] ?? ''));
  $buena = prop_('LLAVE_CRON');
  if (!$buena || !$llave || !hash_equals($buena, $llave)) { http_response_code(403); echo aJson_(['ok' => false, 'error' => 'Llave incorrecta.']); exit; }
  set_time_limit(300);
  $raiz = realpath(__DIR__ . '/..') ?: '';
  @touch(__DIR__ . '/.ultimo_tic');
  echo aJson_(['ok' => true, 'hecho' => ejecutarCron_($raiz), 'hora' => ahora_()]);
  exit;
}
