<?php
/**
 * calinstalaciones.php — Calendario de instalaciones (12/11/2026, petición de Nando).
 *
 * «Ver un calendario de cómo se están realizando las instalaciones, qué se
 * hace, quién lo hace y cuándo.» Lo junta todo en un mismo sitio:
 *   · las obras de cada instalador (FV / aerotermia): del día previsto o de
 *     la llegada real hasta que se termina, con su avance;
 *   · cada fase que el instalador marca hecha en la app de subcontratas, el
 *     día que la marcó (estructura, paneles, unidad exterior…);
 *   · lo que queda por hacer con fecha (llamar al cliente, completar fases,
 *     subir la legalización, avisos que pone dirección);
 *   · las visitas de los instaladores (replanteo, técnica, revisión…);
 *   · de cada operación: firma, instalación prevista (también sin instalador
 *     asignado), instalada y legalizada.
 *
 * Quién lo ve: dirección todas; cada comercial SOLO las operaciones de sus
 * clientes. Nunca salen importes ni datos de cobro (regla de la casa).
 */

require_once __DIR__ . '/base.php';

const CALI_ESTADOS_OP = ['firmada', 'financiacion', 'tramite', 'material', 'instalacion', 'instalada', 'legalizada', 'cerrada'];
const CALI_ESP = ['fotovoltaica' => 'Fotovoltaica', 'aerotermia' => 'Aerotermia'];

function caliVeTodo_(array $u): bool { return (permisos_($u)['alcance'] ?? '') === 'todo'; }

function accCalendarioInstalaciones_(array $u, array $p): array {
  $todo = caliVeTodo_($u);
  if (!$todo && normal_($u['rol'] ?? '') !== 'comercial') return ['ok' => false, 'error' => 'Tu usuario no tiene acceso al calendario de instalaciones.'];

  $mes = preg_match('/^\d{4}-\d{2}$/', txt_($p['mes'] ?? '')) ? $p['mes'] : substr(hoyISO_(), 0, 7);
  $ini = new DateTime($mes . '-01');
  $desde = (clone $ini)->modify('-' . (((int)$ini->format('N')) - 1) . ' days')->format('Y-m-d');      // lunes de la 1.ª semana
  $finMes = (clone $ini)->modify('last day of this month');
  $hasta = (clone $finMes)->modify('+' . (7 - (int)$finMes->format('N')) . ' days')->format('Y-m-d'); // domingo de la última
  $comercial = $todo ? txt_($p['comercial_id'] ?? '') : txt_($u['id']);

  $ops = filtrar_('OPERACIONES', fn($o) => in_array(normal_($o['estado'] ?? ''), CALI_ESTADOS_OP, true)
    && ($comercial === '' || mismo_($o['comercial_id'] ?? '', $comercial)));
  $opsIdx = []; foreach ($ops as $o) $opsIdx[(string)$o['id']] = $o;
  $cliIds = []; foreach ($ops as $o) $cliIds[(string)$o['cliente_id']] = true;
  $clientes = []; foreach (filtrar_('CLIENTES', fn($c) => isset($cliIds[(string)$c['id']])) as $c) $clientes[(string)$c['id']] = $c;
  $contratas = []; foreach (filtrar_('PORTAL_CUENTAS', fn($c) => normal_($c['tipo'] ?? '') === 'contrata') as $c) $contratas[(string)$c['id']] = txt_($c['empresa']) ?: txt_($c['nombre']) ?: txt_($c['usuario']);
  $usuarios = []; foreach (leer_('USUARIOS') as $x) $usuarios[(string)$x['id']] = txt_($x['nombre']);

  $obrasPorOp = [];
  foreach (filtrar_('OBRAS', fn($x) => isset($opsIdx[(string)$x['operacion_id']]) && normal_($x['estado'] ?? '') !== 'cancelada') as $ob) {
    $obrasPorOp[(string)$ob['operacion_id']][] = $ob;
  }
  $visitas = filtrar_('VISITAS_INSTALADOR', fn($v) => isset($cliIds[(string)$v['cliente_id']]) && normal_($v['estado'] ?? '') !== 'cancelada'
    && ($v['operacion_id'] === '' || $v['operacion_id'] === null || isset($opsIdx[(string)$v['operacion_id']])));

  $hoy = hoyISO_();
  $ev = [];
  $enRango = fn($f) => $f !== '' && strcmp($f, $desde) >= 0 && strcmp($f, $hasta) <= 0;
  $solapa = fn($a, $b) => $a !== '' && strcmp($a, $hasta) <= 0 && strcmp($b ?: $a, $desde) >= 0;
  $instalaciones = [];

  foreach ($ops as $op) {
    $cli = $clientes[(string)$op['cliente_id']] ?? [];
    $base = ['op_id' => $op['id'], 'cliente_id' => txt_($op['cliente_id']), 'cliente' => txt_($cli['nombre'] ?? ''),
             'direccion' => trim(txt_($cli['direccion'] ?? '') . (txt_($cli['municipio'] ?? '') !== '' ? ', ' . txt_($cli['municipio']) : ''))];
    $obras = $obrasPorOp[(string)$op['id']] ?? [];
    $resObras = [];
    $espConObra = [];

    foreach ($obras as $ob) {
      $esp = normal_($ob['especialidad']) === 'aerotermia' ? 'aerotermia' : 'fotovoltaica';
      $espConObra[$esp] = true;
      $quien = $contratas[(string)$ob['contrata_id']] ?? 'Sin instalador';
      $est = normal_($ob['estado']);
      $ini0 = substr(txt_($ob['llegada']), 0, 10) ?: txt_($ob['fecha_prevista']);
      $fin0 = substr(txt_($ob['terminada']), 0, 10) ?: substr(txt_($ob['salida']), 0, 10);
      if ($fin0 === '' && $est === 'en_curso') $fin0 = max($hoy, $ini0);
      if ($fin0 === '' || strcmp($fin0, $ini0) < 0) $fin0 = $ini0;
      $real = txt_($ob['llegada']) !== '';
      if ($solapa($ini0, $fin0)) {
        $ev[] = $base + ['tipo' => 'obra', 'esp' => $esp, 'fecha' => $ini0, 'fin' => $fin0,
          'titulo' => CALI_ESP[$esp] . ' · ' . $quien, 'quien' => $quien, 'estado' => $est, 'progreso' => (int)num_($ob['progreso']),
          'real' => $real, 'obra_id' => $ob['id']];
      }
      /* Fases hechas, el día que se marcaron. */
      $hechas = deJson_($ob['checklist'] ?? '', []) ?: [];
      $fases = [];
      $defs = function_exists('portalFasesDe_') ? portalFasesDe_($ob, $op) : [];
      foreach ($defs as [$k, $t]) {
        $f = substr(txt_($hechas[$k]['fecha'] ?? ''), 0, 10);
        $fases[] = ['titulo' => $t, 'hecho' => $f];
        if ($enRango($f) && $k !== 'llegada') $ev[] = $base + ['tipo' => 'fase', 'esp' => $esp, 'fecha' => $f, 'titulo' => $t, 'quien' => $quien, 'hecho' => true];
      }
      /* Lo que queda por hacer con fecha. */
      $pend = [];
      foreach ((function_exists('portalAvisos_') ? portalAvisos_($ob) : []) as $a) {
        $pend[] = ['texto' => $a['texto'], 'fecha' => $a['fecha'], 'hecho' => $a['hecho'], 'vencido' => $a['vencido']];
        if (!$a['hecho'] && $enRango($a['fecha']) && $a['clave'] !== 'llegada') {
          $ev[] = $base + ['tipo' => 'tarea', 'esp' => $esp, 'fecha' => $a['fecha'], 'titulo' => $a['texto'], 'quien' => $quien, 'vencido' => $a['vencido']];
        }
      }
      $resObras[] = ['id' => $ob['id'], 'esp' => $esp, 'quien' => $quien, 'estado' => $est, 'progreso' => (int)num_($ob['progreso']),
        'prevista' => txt_($ob['fecha_prevista']), 'llegada' => txt_($ob['llegada']), 'terminada' => txt_($ob['terminada']),
        'fases' => $fases, 'pendientes' => $pend,
        'equipos' => function_exists('portalEquiposOp_') ? portalEquiposOp_($op, $esp, deJson_($ob['equipos'] ?? '', []) ?: []) : []];
    }

    /* Instalación prevista sin instalador asignado para alguna especialidad. */
    $especialidades = function_exists('portalEspecialidadesOp_') ? portalEspecialidadesOp_($op) : [];
    $faltan = array_values(array_filter($especialidades, fn($e) => empty($espConObra[$e])));
    $prev = txt_($op['fecha_prevista_instalacion']);
    if ($faltan && $enRango($prev) && txt_($op['fecha_instalacion']) === '') {
      $ev[] = $base + ['tipo' => 'sin_asignar', 'fecha' => $prev,
        'titulo' => 'Instalación prevista · sin instalador de ' . implode(' y ', array_map(fn($e) => mb_strtolower(CALI_ESP[$e]), $faltan))];
    }
    foreach ([['fecha_firma', 'firma', 'Firma del contrato'], ['fecha_instalacion', 'instalada', 'Instalación terminada'],
              ['fecha_legalizacion', 'legalizada', 'Legalizada']] as [$campo, $tipo, $tit]) {
      $f = substr(txt_($op[$campo] ?? ''), 0, 10);
      if ($enRango($f)) $ev[] = $base + ['tipo' => $tipo, 'fecha' => $f, 'titulo' => $tit];
    }

    $instalaciones[(string)$op['id']] = $base + [
      'referencia' => txt_($op['referencia']), 'estado' => normal_($op['estado']), 'tipo' => function_exists('portalTipoOp_') ? portalTipoOp_($op) : txt_($op['tipo']),
      'comercial' => $usuarios[(string)$op['comercial_id']] ?? '', 'firma' => txt_($op['fecha_firma']), 'prevista' => $prev,
      'instalada' => txt_($op['fecha_instalacion']), 'legalizada' => txt_($op['fecha_legalizacion']), 'sin_instalador' => $faltan,
      'equipos' => function_exists('portalEquiposOp_') ? portalEquiposOp_($op, '') : [], 'obras' => $resObras, 'visitas' => []
    ];
  }

  foreach ($visitas as $v) {
    $opId = txt_($v['operacion_id']);
    if ($opId === '') { foreach ($ops as $o) if (mismo_($o['cliente_id'], $v['cliente_id'])) { $opId = (string)$o['id']; break; } }
    if (!isset($instalaciones[$opId])) continue;
    $quien = $contratas[(string)$v['contrata_id']] ?? 'Instalador';
    $tipoN = (defined('PORTAL_TIPOS_VISITA') ? PORTAL_TIPOS_VISITA[normal_($v['tipo'])] ?? 'Visita' : 'Visita');
    $x = ['fecha' => txt_($v['fecha']), 'hora' => txt_($v['hora']), 'tipo' => $tipoN, 'quien' => $quien, 'estado' => normal_($v['estado'])];
    $instalaciones[$opId]['visitas'][] = $x;
    if ($enRango($x['fecha'])) {
      $b = $instalaciones[$opId];
      $ev[] = ['op_id' => $opId, 'cliente_id' => $b['cliente_id'], 'cliente' => $b['cliente'], 'direccion' => $b['direccion'],
               'tipo' => 'visita', 'fecha' => $x['fecha'], 'hora' => $x['hora'], 'titulo' => $tipoN . ' · ' . $quien, 'quien' => $quien,
               'hecho' => $x['estado'] === 'hecha', 'vencido' => $x['estado'] === 'pendiente' && strcmp($x['fecha'], $hoy) < 0];
    }
  }

  usort($ev, fn($a, $b) => strcmp($a['fecha'] . ($a['hora'] ?? ''), $b['fecha'] . ($b['hora'] ?? '')));
  /* Solo se mandan las instalaciones que salen en el mes o que están vivas (en marcha). */
  $usadas = [];
  foreach ($ev as $e) $usadas[(string)$e['op_id']] = true;
  $vivas = array_values(array_filter($instalaciones, fn($i) => isset($usadas[(string)$i['op_id']])
    || in_array($i['estado'], ['material', 'instalacion', 'tramite', 'firmada', 'financiacion'], true)));

  return ['ok' => true, 'mes' => $mes, 'desde' => $desde, 'hasta' => $hasta, 'hoy' => $hoy, 'todo' => $todo,
          'eventos' => $ev, 'instalaciones' => $vivas];
}
