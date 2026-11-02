<?php
/**
 * resumen_semanal.php (= 14_ResumenSemanal.gs) — El correo de los viernes.
 *
 * Cada viernes por la tarde, cada persona recibe en su correo cómo le ha
 * ido la semana: lo que ha hecho, cómo va contra su objetivo, qué tiene
 * pendiente para la semana que viene y una frase para cerrar. Dirección
 * recibe además cómo va la casa.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

/* Frases para terminar. Rotan por semana, así que no se repite la misma
   dos viernes seguidos ni a todos les toca la misma. */
const FRASES = [
  'Las puertas que no se llaman son ventas que no existen.',
  'Una visita bien hecha vale más que diez propuestas enviadas a ciegas.',
  'El cliente no compra paneles: compra dejar de pagar de más.',
  'Lo que se apunta se sigue; lo que no, se pierde.',
  'La venta que se enfría casi siempre es la que nadie volvió a llamar.',
  'Mejor un no rápido que un quizá eterno.',
  'Cada instalación bien rematada trae la siguiente sin llamar a ninguna puerta.',
  'El mejor momento para llamar al que se lo está pensando fue ayer; el segundo mejor es el lunes.',
  'Se cierra explicando, no insistiendo.',
  'Quien enseña el ahorro con números no necesita bajar el precio.',
  'La constancia gana a la suerte, y encima repite.',
  'Un buen seguimiento es media venta hecha.',
  'El sol sale todos los días: el trabajo es estar delante de la casa correcta.',
  'No hace falta ser el más barato si eres el que mejor lo explica.',
  'Lo difícil no es que te digan que sí: es que te vuelvan a abrir la puerta.',
  'Cada ficha que subes es una oportunidad que antes no existía.',
  'La semana que viene empieza con lo que dejes preparado hoy.',
  'Un equipo que comparte lo que le funciona vende el doble.',
  'El que llama, cierra. El que espera, justifica.',
  'Hacer bien lo pequeño es lo que hace grande a una empresa.'
];

function fraseDeLaSemana_($semilla): string {
  $s = abs((int)num_($semilla));
  return FRASES[$s % count(FRASES)];
}

function numeroSemana_($fechaISO): int {
  $d = fecha_($fechaISO) ?? ahoraDT_();
  $inicio = (clone $d)->setDate((int)$d->format('Y'), 1, 1)->setTime(0, 0, 0);
  $dias = ($d->getTimestamp() - $inicio->getTimestamp()) / 86400;
  return (int)ceil(($dias + (int)$inicio->format('w') + 1) / 7);
}

/* ---------- el correo ---------- */

if (!defined('LOGO_CORREO')) define('LOGO_CORREO', 'https://zerowattiosingenieria-bit.github.io/crm/assets/img/logo-h96.png');
if (!defined('WEB_CRM')) define('WEB_CRM', 'https://zerowattiosingenieria-bit.github.io/crm/');

function cajaHtml_($titulo, $valor, $pie = ''): string {
  return '<td style="padding:6px">' .
    '<div style="border:1px solid #e3e7e0;border-radius:10px;padding:12px 14px;background:#fff">' .
    '<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#5b6159;' .
    'font-weight:700">' . $titulo . '</div>' .
    '<div style="font-size:23px;font-weight:750;color:#17191c;margin-top:4px">' . $valor . '</div>' .
    (($pie !== '' && $pie !== null && $pie !== false) ? '<div style="font-size:12px;color:#8b918a;margin-top:2px">' . $pie . '</div>' : '') .
    '</div></td>';
}

function listaHtml_($titulo, array $lineas): string {
  if (!count($lineas)) return '';
  return '<h3 style="font-size:15px;margin:22px 0 8px;color:#17191c">' . $titulo . '</h3>' .
    '<ul style="margin:0;padding-left:18px;font-size:14px;color:#17191c;line-height:1.6">' .
    implode('', array_map(fn($l) => '<li>' . $l . '</li>', $lineas)) . '</ul>';
}

function correoHtml_(array $persona, $cuerpo, $frase): string {
  return '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f3;padding:24px">' .
    '<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e3e7e0;' .
    'border-radius:14px;overflow:hidden">' .
      '<div style="background:#242422;padding:18px 22px">' .
        '<img src="' . LOGO_CORREO . '" alt="ZERO WATTIOS" style="height:26px">' .
        '<div style="color:#b4fa1e;font-size:11px;letter-spacing:.14em;text-transform:uppercase;' .
        'margin-top:6px">Resumen de la semana</div>' .
      '</div>' .
      '<div style="padding:22px">' .
        '<h2 style="margin:0 0 4px;font-size:19px;color:#17191c">' . txt_($persona['nombre'] ?? '') . '</h2>' .
        '<p style="margin:0 0 16px;color:#5b6159;font-size:13.5px">Así ha ido del lunes al viernes.</p>' .
        $cuerpo .
        '<div style="margin-top:24px;padding:14px 16px;background:#b4fa1e;border-radius:10px;' .
        'color:#242422;font-size:14.5px;font-weight:600;font-style:italic">' . $frase . '</div>' .
        '<p style="margin:20px 0 0;font-size:13px">' .
        '<a href="' . WEB_CRM . '" style="color:#17191c;font-weight:600">Abrir el CRM</a></p>' .
      '</div>' .
      '<div style="padding:14px 22px;border-top:1px solid #e3e7e0;color:#8b918a;font-size:11.5px">' .
      'ZERO WATTIOS INGENIERÍA, S.L. · Correo automático del CRM, no hace falta contestar.' .
      '</div>' .
    '</div></div>';
}

/* ---------- qué cuenta cada correo ---------- */

function cuerpoComercial_(array $r, string $lunes, string $viernes): string {
  $objetivo = num_($r['objetivo_mes'] ?? 0) ? (int)round(num_($r['logrado_objetivo'] ?? 0) * 100 / num_($r['objetivo_mes'])) : 0;
  $filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' .
      cajaHtml_('Ventas', milesTxt_($r['ventas'] ?? 0), eurTxt_(num_($r['importe_vendido'] ?? 0))) .
      cajaHtml_('Sentadas', milesTxt_($r['sentadas'] ?? 0), 'esta semana') .
      cajaHtml_('Propuestas', milesTxt_($r['propuestas'] ?? 0), pctTxt_($r['conversion_propuesta_venta'] ?? 0) . ' cierran') .
    '</tr><tr>' .
      cajaHtml_('Objetivo del periodo', ($r['logrado_objetivo'] ?? 0) . ' / ' . ($r['objetivo_mes'] ?? 0), $objetivo . ' %') .
      cajaHtml_('Cartera viva', eurTxt_(num_($r['cartera_importe'] ?? 0)), ($r['cartera_abierta'] ?? 0) . ' propuestas') .
      cajaHtml_('Comisiones', eurTxt_($r['comisiones']['total'] ?? 0), 'devengadas') .
    '</tr></table>';

  $proximas = array_values(array_filter($r['proximas'] ?? [], fn($p) => strcmp(txt_($p['fecha'] ?? ''), $viernes) >= 0));
  $proximas = array_map(function ($p) {
    return '<b>' . ($p['nombre'] ?? '') . '</b> · ' . (txt_($p['accion'] ?? '') ?: 'seguimiento') .
           ' · ' . selloFecha_($p['fecha'] ?? '');
  }, array_slice($proximas, 0, 8));
  $vencidas = array_values(array_filter($r['proximas'] ?? [], fn($p) => !empty($p['vencida'])));
  $vencidas = array_map(function ($p) {
    return '<b>' . ($p['nombre'] ?? '') . '</b> · ' . (txt_($p['accion'] ?? '') ?: 'seguimiento') .
           ' · vencía el ' . selloFecha_($p['fecha'] ?? '');
  }, array_slice($vencidas, 0, 8));
  $frios = array_map(function ($c) {
    return '<b>' . ($c['nombre'] ?? '') . '</b> · ' . txt_($c['municipio'] ?? '') . ' · ' . ($c['dias'] ?? '') . ' días sin contacto';
  }, array_slice($r['frios'] ?? [], 0, 6));

  return $filas .
    listaHtml_('Se te ha pasado la fecha en', $vencidas) .
    listaHtml_('Lo que tienes por delante', $proximas) .
    listaHtml_('Clientes que se enfrían', $frios);
}

function cuerpoCaptador_(array $r, string $lunes, string $viernes): string {
  $objetivo = num_($r['objetivo_mes'] ?? 0) ? (int)round(num_($r['logrado_objetivo'] ?? 0) * 100 / num_($r['objetivo_mes'])) : 0;
  $filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' .
      cajaHtml_('Fichas', milesTxt_($r['fichas'] ?? 0), 'esta semana') .
      cajaHtml_('Puertas', milesTxt_($r['puertas'] ?? 0), 'según tus partes') .
      cajaHtml_('Citas confirmadas', milesTxt_($r['citas_confirmadas'] ?? 0), '') .
    '</tr><tr>' .
      cajaHtml_('Llegan a sentada', pctTxt_($r['conversion_ficha_sentada'] ?? 0), milesTxt_($r['captaciones_sentada'] ?? 0) . ' sentadas') .
      cajaHtml_('Acaban en venta', pctTxt_($r['conversion_ficha_venta'] ?? 0), milesTxt_($r['captaciones_venta'] ?? 0) . ' ventas') .
      cajaHtml_('Objetivo del mes', ($r['logrado_objetivo'] ?? 0) . ' / ' . ($r['objetivo_mes'] ?? 0), $objetivo . ' %') .
    '</tr></table>';

  $personaId = $r['persona']['id'] ?? '';
  $sinAdjudicar = filtrar_('CAPTACIONES', fn($c) => mismo_($c['captador_id'], $personaId) && txt_($c['comercial_id']) === '' &&
           normal_($c['resultado']) === 'pendiente');
  $sinAdjudicar = array_map(function ($c) {
    $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $c['cliente_id']));
    return '<b>' . ($cli ? $cli['nombre'] : $c['cliente_id']) . '</b> · visita del ' . selloFecha_($c['fecha']) .
           ' · <i>sin comercial adjudicado</i>';
  }, array_slice($sinAdjudicar, 0, 8));

  $proximas = array_map(function ($p) {
    return '<b>' . ($p['nombre'] ?? '') . '</b> · ' . (txt_($p['accion'] ?? '') ?: 'visita') . ' · ' . selloFecha_($p['fecha'] ?? '');
  }, array_slice($r['proximas'] ?? [], 0, 8));

  return $filas .
    listaHtml_('Fichas pendientes de adjudicar a un comercial', $sinAdjudicar) .
    listaHtml_('Citas por delante', $proximas);
}

function cuerpoDireccion_(array $r, string $lunes, string $viernes): string {
  $fin = accFinanzas_(['id' => $r['persona']['id'] ?? '', 'rol' => 'admin'], ['desde' => sumarDias_($viernes, -365), 'hasta' => $viernes]);
  $res = $fin['resumen'] ?? [];
  $equipo = array_map(fn($u) => resumenPersona_($u, $lunes, $viernes, true),
    filtrar_('USUARIOS', fn($u) => normal_($u['activo']) === 'si' && in_array($u['rol'], ['comercial', 'captador'], true)));

  $ventasSemana = 0; $importeSemana = 0; $fichasSemana = 0;
  foreach ($equipo as $x) {
    $ventasSemana += num_($x['ventas'] ?? 0);
    $importeSemana += num_($x['importe_vendido'] ?? 0);
    $fichasSemana += num_($x['fichas'] ?? 0);
  }

  $cobrosVencidos = filtrar_('COBROS', fn($c) => txt_($c['fecha_cobro']) === '' && txt_($c['fecha_prevista']) !== '' && strcmp(txt_($c['fecha_prevista']), $viernes) < 0);

  $filas =
    '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' .
      cajaHtml_('Ventas de la semana', milesTxt_($ventasSemana), eurTxt_($importeSemana)) .
      cajaHtml_('Fichas captadas', milesTxt_($fichasSemana), 'esta semana') .
      cajaHtml_('Margen del año', pctTxt_($res['margen_pct'] ?? 0), eurTxt_($res['margen_bruto'] ?? 0)) .
    '</tr><tr>' .
      cajaHtml_('Pendiente de cobro', eurTxt_($res['pendiente_cobro'] ?? 0),
        num_($res['vencido_cobro'] ?? 0) ? eurTxt_($res['vencido_cobro']) . ' vencido' : 'todo en fecha') .
      cajaHtml_('Beneficio neto', eurTxt_($res['beneficio_neto'] ?? 0), 'del año') .
      cajaHtml_('Cobros vencidos', milesTxt_(count($cobrosVencidos)), 'por reclamar') .
    '</tr></table>';

  $porPersona = array_map(function ($x) {
    return '<b>' . ($x['persona']['nombre'] ?? '') . '</b> · ' .
      ((($x['persona']['rol'] ?? '') === 'captador')
        ? ($x['fichas'] ?? 0) . ' fichas, ' . ($x['captaciones_sentada'] ?? 0) . ' sentadas'
        : ($x['ventas'] ?? 0) . ' ventas (' . eurTxt_(num_($x['importe_vendido'] ?? 0)) . '), ' . ($x['sentadas'] ?? 0) . ' sentadas') .
      ' · objetivo ' . ($x['logrado_objetivo'] ?? 0) . '/' . ($x['objetivo_mes'] ?? 0);
  }, $equipo);

  $consejos = array_map(fn($c) => '<b>' . ($c['titulo'] ?? '') . '</b> · ' . ($c['accion'] ?? ''),
    array_slice($fin['consejos'] ?? [], 0, 3));

  $partes = leer_('PARTES');
  $sinParte = filtrar_('USUARIOS', function ($u) use ($partes, $lunes, $viernes) {
    if (normal_($u['activo']) !== 'si' || !in_array($u['rol'], ['comercial', 'captador'], true)) return false;
    foreach ($partes as $p) {
      if (mismo_($p['usuario_id'], $u['id']) && strcmp(txt_($p['fecha']), $lunes) >= 0 && strcmp(txt_($p['fecha']), $viernes) <= 0) return false;
    }
    return true;
  });
  $sinParte = array_map(fn($u) => '<b>' . $u['nombre'] . '</b> no ha enviado ningún parte esta semana', $sinParte);

  return $filas .
    listaHtml_('Cómo ha ido cada uno', $porPersona) .
    listaHtml_('Sin partes esta semana', $sinParte) .
    listaHtml_('Qué conviene mirar', $consejos);
}

/* ---------- utilidades de formato para el correo ---------- */
function milesTxt_($n): string { return preg_replace('/\B(?=(\d{3})+(?!\d))/', '.', (string)(int)round(num_($n))); }
function eurTxt_($n): string { return milesTxt_($n) . ' €'; }
function pctTxt_($n): string { return str_replace('.', ',', (string)redondear_(num_($n), 1)) . ' %'; }
function selloFecha_($iso): string {
  $s = trozo_($iso, 0, 10);
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return $s !== '' ? $s : '—';
  $p = explode('-', $s);
  return $p[2] . '/' . $p[1];
}

/* ---------- el envío ---------- */

/**
 * Manda el resumen de la semana a cada persona. Lo llama cron.php los
 * viernes; también se puede lanzar a mano desde el CRM.
 */
function resumenSemanal($soloA = null): array {
  if (txt_($soloA) === '') $soloA = null;
  $cfg = config_();
  if (normal_($cfg['resumen_semanal'] ?? '') === 'no' && !$soloA) {
    error_log('El resumen semanal está desactivado en Ajustes.');
    return ['ok' => true, 'enviados' => 0, 'motivo' => 'desactivado'];
  }

  $hoy = hoyISO_();
  $d = fecha_($hoy);
  $desdeLunes = ((int)$d->format('w') + 6) % 7;             // 0 = lunes
  $lunes = sumarDias_($hoy, -$desdeLunes);
  $viernes = sumarDias_($lunes, 4);
  $semana = numeroSemana_($hoy);

  $gente = filtrar_('USUARIOS', function ($u) use ($soloA) {
    if (normal_($u['activo']) !== 'si' || txt_($u['email']) === '') return false;
    return $soloA ? (mismo_($u['id'], $soloA) || normal_($u['usuario']) === normal_($soloA)) : true;
  });

  $enviados = 0;
  $fallos = [];
  $i = 0;
  foreach ($gente as $u) {
    try {
      $r = resumenPersona_($u, $lunes, $viernes, true);
      $cuerpo = ($u['rol'] === 'captador') ? cuerpoCaptador_($r, $lunes, $viernes)
              : (in_array($u['rol'], ['admin', 'superadmin'], true)
                  ? cuerpoDireccion_($r, $lunes, $viernes)
                  : cuerpoComercial_($r, $lunes, $viernes));
      $frase = fraseDeLaSemana_($semana + $i);
      $html = correoHtml_($u, $cuerpo, $frase);
      $asunto = 'Tu semana en ZERO WATTIOS · ' . selloFecha_($lunes) . ' a ' . selloFecha_($viernes);

      /* Mientras «resumen_a» tenga un correo, todo va ahí y no a cada uno.
         Sirve para rodar el envío sin molestar al equipo; se vacía el campo
         en Ajustes y cada persona vuelve a recibir el suyo. */
      $unico = txt_($cfg['resumen_a'] ?? '');
      correo_(['to' => $unico !== '' ? $unico : txt_($u['email']),
        'subject' => $asunto . ($unico !== '' ? ' · ' . txt_($u['nombre']) : ''),
        'htmlBody' => $html, 'name' => 'CRM ZERO WATTIOS']);
      $enviados++;
    } catch (Throwable $e) { $fallos[] = txt_($u['usuario']) . ': ' . $e->getMessage(); }
    $i++;
  }

  /* Copia para quien lleve el control, si se ha puesto en Ajustes. */
  if (txt_($cfg['copia_resumen'] ?? '') !== '' && !$soloA && txt_($cfg['resumen_a'] ?? '') === '') {
    try {
      correo_(['to' => txt_($cfg['copia_resumen']),
        'subject' => 'Resúmenes semanales enviados · semana ' . $semana,
        'htmlBody' => '<p>Se han enviado ' . $enviados . ' resúmenes' .
          (count($fallos) ? '. No han salido: ' . implode(', ', $fallos) : '.') . '</p>',
        'name' => 'CRM ZERO WATTIOS']);
    } catch (Throwable $e) { /* la copia no puede tumbar el envío */ }
  }

  /* Y a cada comercial y captador, su lista completa de vencidos (orden de
     Nando del 29/10/2026: en la agenda del CRM ya no les salen). */
  if (!$soloA) {
    try { avisoVencidos(); } catch (Throwable $e) { $fallos[] = 'vencidos: ' . $e->getMessage(); }
  }

  registrar_(null, 'resumen_semanal', 'USUARIOS', '', $enviados . ' enviados' .
    (count($fallos) ? ', fallos: ' . implode(' | ', $fallos) : ''));
  error_log('Resúmenes enviados: ' . $enviados . (count($fallos) ? ' · fallos: ' . implode(' | ', $fallos) : ''));
  return ['ok' => true, 'enviados' => $enviados, 'fallos' => $fallos, 'lunes' => $lunes, 'viernes' => $viernes];
}

/** Lanza el resumen a mano desde el CRM (dirección). */
function accResumenSemanalAhora_(array $u, array $p): array {
  exigir_($u, 'config');
  $r = resumenSemanal(txt_($p['usuario_id'] ?? '') ?: null);
  return ['ok' => true, 'resultado' => $r];
}

/** Me lo mando solo a mí para ver cómo queda. */
function accProbarResumen_(array $u, array $p): array {
  if (txt_($u['email'] ?? '') === '') return ['ok' => false, 'error' => 'Tu usuario no tiene correo puesto.'];
  $r = resumenSemanal($u['id']);
  return ['ok' => true, 'resultado' => $r];
}

/**
 * Pone al día los correos de los usuarios ya creados con los de
 * 00_Config.gs (USUARIOS_INICIALES). Útil si el CRM ya estaba instalado.
 */
function actualizarCorreos(): int {
  $cambiados = 0;
  foreach (USUARIOS_INICIALES as $ini) {
    $u = buscar1_('USUARIOS', fn($x) => normal_($x['usuario']) === normal_($ini['usuario'] ?? ''));
    if ($u && txt_($ini['email'] ?? '') !== '' && txt_($u['email']) !== txt_($ini['email'])) {
      actualizar_('USUARIOS', $u['id'], ['email' => $ini['email']]);
      $cambiados++;
    }
  }
  error_log('Correos actualizados: ' . $cambiados);
  return $cambiados;
}

/* ---------- los vencidos de cada uno, los viernes ---------- */

/**
 * Lo vencido de una persona: seguimientos con la fecha pasada, citas que
 * siguen pendientes después de su día e instalaciones que debían estar
 * hechas. Es lo mismo que la agenda enseña a dirección en «Vencido».
 */
function vencidosDe_(array $u, string $hoy): array {
  $id = txt_($u['id']);
  $clientes = leer_('CLIENTES');
  $porId = [];
  foreach ($clientes as $c) $porId[txt_($c['id'])] = $c;
  $lista = [];

  if ($u['rol'] !== 'captador') {
    foreach ($clientes as $c) {
      if (txt_($c['comercial_id']) !== $id) continue;
      if (in_array(normal_($c['estado']), ['ganado', 'perdido'], true)) continue;
      $f = trozo_($c['proxima_fecha'], 0, 10);
      if ($f !== '' && strcmp($f, $hoy) < 0) $lista[] = ['fecha' => $f, 'tipo' => 'Seguimiento', 'nombre' => $c['nombre'],
        'texto' => txt_($c['proxima_accion']) ?: 'seguimiento'];
    }
    foreach (leer_('OPERACIONES') as $o) {
      $c = $porId[txt_($o['cliente_id'])] ?? null;
      if (!$c || txt_($c['comercial_id']) !== $id) continue;
      $f = trozo_($o['fecha_prevista_instalacion'], 0, 10);
      if ($f !== '' && strcmp($f, $hoy) < 0 && txt_($o['fecha_instalacion']) === '' && normal_($o['estado']) !== 'cancelada')
        $lista[] = ['fecha' => $f, 'tipo' => 'Instalación', 'nombre' => $c['nombre'], 'texto' => 'instalación prevista sin hacer'];
    }
  }
  foreach (leer_('CAPTACIONES') as $k) {
    $mio = $u['rol'] === 'captador' ? txt_($k['captador_id']) === $id : txt_($k['comercial_id']) === $id;
    if (!$mio || normal_($k['resultado']) !== 'pendiente') continue;
    $f = trozo_($k['fecha'], 0, 10);
    $c = $porId[txt_($k['cliente_id'])] ?? null;
    if ($c && $f !== '' && strcmp($f, $hoy) < 0) $lista[] = ['fecha' => $f, 'tipo' => 'Cita', 'nombre' => $c['nombre'],
      'texto' => 'cita sin resultado apuntado'];
  }
  return ordenar_($lista, fn($a, $b) => comparar_($a['fecha'], $b['fecha']));
}

/**
 * Lo de la semana (lunes a viernes) de un comercial o captador: citas,
 * sentadas, propuestas hechas, ventas y los ratios entre ellas. Se cuenta
 * sobre las captaciones y operaciones, no sobre los partes, para que salga
 * aunque alguien no los haya rellenado.
 */
function semanaDe_(array $u, string $lunes, string $viernes): array {
  $id = txt_($u['id']);
  $esCaptador = $u['rol'] === 'captador';
  $enSemana = function ($f) use ($lunes, $viernes) { $x = trozo_($f, 0, 10); return strcmp($x, $lunes) >= 0 && strcmp($x, $viernes) <= 0; };
  $clientes = leer_('CLIENTES');
  $porId = [];
  foreach ($clientes as $c) $porId[txt_($c['id'])] = $c;
  $mio = fn($x) => txt_($esCaptador ? ($x['captador_id'] ?? '') : ($x['comercial_id'] ?? '')) === $id;

  $caps = filtrar_('CAPTACIONES', $mio);
  $citas = array_values(array_filter($caps, fn($k) => $enSemana($k['fecha']) && normal_($k['resultado']) !== 'cancelada' && isset($porId[txt_($k['cliente_id'])])));
  $sentadas = array_values(array_filter($citas, fn($k) => in_array(normal_($k['resultado']), ['sentada', 'potencial', 'venta'], true)));
  $fichas = $esCaptador ? array_values(array_filter($caps, fn($k) => $enSemana(txt_($k['creado']) ?: $k['fecha']))) : [];

  $ops = filtrar_('OPERACIONES', $mio);
  $ventas = array_values(array_filter($ops, fn($o) => esGanada_($o) && $enSemana(txt_($o['fecha_firma']))));

  /* Propuestas: operaciones con fecha de propuesta esta semana y proyectos
     entregados esta semana; una por cliente. */
  $propuestas = [];
  $vistos = [];
  foreach ($ops as $o) {
    if (!$enSemana($o['fecha_propuesta']) || !empty($vistos[txt_($o['cliente_id'])])) continue;
    $vistos[txt_($o['cliente_id'])] = true;
    $c = $porId[txt_($o['cliente_id'])] ?? null;
    $propuestas[] = ['nombre' => $c ? $c['nombre'] : $o['cliente_id'], 'importe' => num_($o['total']), 'fecha' => trozo_($o['fecha_propuesta'], 0, 10)];
  }
  foreach (leer_('PROYECTOS') as $p) {
    $c = $porId[txt_($p['cliente_id'])] ?? null;
    if (!$c || !$mio($c) || !empty($vistos[txt_($p['cliente_id'])])) continue;
    $f = txt_($p['entregado']) ?: txt_($p['enviado']);
    if (!$enSemana($f)) continue;
    $vistos[txt_($p['cliente_id'])] = true;
    $op = null;
    foreach ($ops as $o) if (mismo_($o['cliente_id'], $p['cliente_id'])) { $op = $o; break; }
    $propuestas[] = ['nombre' => $c['nombre'], 'importe' => $op ? num_($op['total']) : 0, 'fecha' => trozo_($f, 0, 10)];
  }

  $esSentada = fn($k) => in_array(normal_($k['resultado']), ['sentada', 'potencial', 'venta'], true);
  return ['citas' => $citas, 'sentadas' => $sentadas, 'fichas' => $fichas, 'ventas' => $ventas, 'propuestas' => $propuestas,
    'ratio_sentadas' => pct_(count($sentadas), count($citas)),
    'ratio_propuestas' => pct_(count($propuestas), count($sentadas)),
    'ratio_ventas' => pct_(count($ventas), count($sentadas)),
    'ratio_ficha_sentada' => pct_(count(array_filter($fichas, $esSentada)), count($fichas)),
    'ratio_sentada_venta' => pct_(count(array_filter($sentadas, fn($k) => normal_($k['resultado']) === 'venta')),
      count($sentadas))];
}

/**
 * Los viernes, a cada comercial y captador: su semana (propuestas,
 * sentadas, ventas y ratios) y la lista completa de sus vencidos. Va a su
 * propio correo aunque el resumen semanal esté en pruebas («resumen_a») y
 * sale siempre, tenga o no vencidos.
 */
function avisoVencidos($soloA = null): array {
  if (txt_($soloA) === '') $soloA = null;
  $hoy = hoyISO_();
  $d = fecha_($hoy);
  $lunes = sumarDias_($hoy, -(((int)$d->format('w') + 6) % 7));
  $viernes = sumarDias_($lunes, 4);
  $gente = filtrar_('USUARIOS', function ($u) use ($soloA) {
    if (normal_($u['activo']) !== 'si' || txt_($u['email']) === '') return false;
    if (!in_array($u['rol'], ['comercial', 'captador'], true)) return false;
    return $soloA ? (mismo_($u['id'], $soloA) || normal_($u['usuario']) === normal_($soloA)) : true;
  });
  /* `String.replace(texto, nuevo)` de JS: solo la primera aparición. */
  $reemplazar1 = function (string $html, string $viejo, string $nuevo): string {
    $pos = strpos($html, $viejo);
    return $pos === false ? $html : substr_replace($html, $nuevo, $pos, strlen($viejo));
  };
  $enviados = 0;
  $fallos = [];
  foreach ($gente as $u) {
    try {
      $lista = vencidosDe_($u, $hoy);
      $s = semanaDe_($u, $lunes, $viernes);
      $esCaptador = $u['rol'] === 'captador';
      $totalVentas = 0;
      foreach ($s['ventas'] as $o) $totalVentas += num_($o['total']);
      $cajas = $esCaptador
        ? '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' .
            cajaHtml_('Fichas', milesTxt_(count($s['fichas'])), 'esta semana') .
            cajaHtml_('Citas', milesTxt_(count($s['citas'])), 'con fecha esta semana') .
            cajaHtml_('Sentadas', milesTxt_(count($s['sentadas'])), '') .
          '</tr><tr>' .
            cajaHtml_('Ficha → sentada', pctTxt_($s['ratio_ficha_sentada']), '') .
            cajaHtml_('Sentada → venta', pctTxt_($s['ratio_sentada_venta']), '') .
            cajaHtml_('Vencidos', milesTxt_(count($lista)), 'por cerrar') .
          '</tr></table>'
        : '<table style="width:100%;border-collapse:separate;border-spacing:0"><tr>' .
            cajaHtml_('Sentadas', milesTxt_(count($s['sentadas'])), 'de ' . count($s['citas']) . ' citas') .
            cajaHtml_('Propuestas', milesTxt_(count($s['propuestas'])), 'hechas esta semana') .
            cajaHtml_('Ventas', milesTxt_(count($s['ventas'])), eurTxt_($totalVentas)) .
          '</tr><tr>' .
            cajaHtml_('Sentadas / citas', pctTxt_($s['ratio_sentadas']), '') .
            cajaHtml_('Propuestas / sentadas', pctTxt_($s['ratio_propuestas']), '') .
            cajaHtml_('Ventas / sentadas', pctTxt_($s['ratio_ventas']), '') .
          '</tr></table>';
      $lProp = array_map(function ($x) {
        return '<b>' . txt_($x['nombre']) . '</b>' . (num_($x['importe']) ? ' · ' . eurTxt_($x['importe']) : '') . ' · ' . selloFecha_($x['fecha']);
      }, $s['propuestas']);
      $lSent = array_map(function ($k) {
        $c = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $k['cliente_id']));
        return '<b>' . ($c ? txt_($c['nombre']) : $k['cliente_id']) . '</b> · ' .
          api_etiqueta_($k['resultado']) . ' · ' . selloFecha_($k['fecha']);
      }, $s['sentadas']);
      $lVenc = array_map(function ($x) {
        return '<b>' . txt_($x['nombre']) . '</b> · ' . $x['tipo'] . ' · ' . $x['texto'] . ' · desde el ' . selloFecha_($x['fecha']);
      }, $lista);
      $cuerpo = $cajas .
        listaHtml_('Propuestas hechas esta semana', $lProp) .
        listaHtml_('Sentadas de la semana', $lSent) .
        (count($lista)
          ? listaHtml_('Vencidos a ' . selloFecha_($hoy) . ' (ponlos al día en el CRM)', $lVenc)
          : '<p style="margin:18px 0 0;font-size:14px;color:#17191c">No tienes nada vencido. ¡Así da gusto!</p>');
      $html = correoHtml_($u, $cuerpo, 'Lo que se apunta se sigue; lo que no, se pierde.');
      $html = $reemplazar1($html, 'Resumen de la semana', 'Tu semana y tus vencidos');
      $html = $reemplazar1($html, 'Así ha ido del lunes al viernes.', 'Del ' . selloFecha_($lunes) . ' al ' . selloFecha_($viernes) . '.');
      correo_(['to' => txt_($u['email']),
        'subject' => 'Tu semana y tus vencidos en el CRM · ' . selloFecha_($lunes) . ' a ' . selloFecha_($viernes),
        'htmlBody' => $html, 'name' => 'CRM ZERO WATTIOS']);
      $enviados++;
    } catch (Throwable $e) { $fallos[] = txt_($u['usuario']) . ': ' . $e->getMessage(); }
  }
  registrar_(null, 'aviso_vencidos', 'USUARIOS', '', $enviados . ' enviados' .
    (count($fallos) ? ', fallos: ' . implode(' | ', $fallos) : ''));
  return ['ok' => true, 'enviados' => $enviados, 'fallos' => $fallos];
}

/* Nombre legible del resultado de una captación, para el correo. */
function api_etiqueta_($v): string {
  $m = ['sentada' => 'sentada', 'potencial' => 'visita con potencial', 'venta' => 'venta'];
  return $m[normal_($v)] ?? txt_($v);
}
