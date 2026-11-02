<?php
/**
 * directorio.php — El archivo histórico y las puertas tocadas.
 *
 * Aquí viven los clientes de siempre (Zero Wattios y Aurus) y las puertas
 * que se han ido tocando, que son miles. No se mezclan con el pipeline:
 * el CRM del día a día sigue teniendo sus operaciones y sus cobros, y esto
 * es la memoria de la casa, para buscar y para mirar en el mapa.
 *
 * No lo ve todo el mundo. La lista de quién entra está en Ajustes, en la
 * clave directorio_usuarios, y se comprueba SIEMPRE en el servidor.
 *
 * (Traducción de 17_Directorio.gs.)
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

if (!defined('LOGO_CORREO')) define('LOGO_CORREO', 'https://zerowattiosingenieria-bit.github.io/crm/assets/img/logo-h96.png');
if (!defined('WEB_CRM')) define('WEB_CRM', 'https://crm.zerowattios.com/');

/* ---------- quién pasa ---------- */

function veDirectorio_(array $u): bool {
  $lista = txt_(config_()['directorio_usuarios'] ?? '');
  if ($lista === '') return normal_($u['rol'] ?? '') === 'superadmin';
  $permitidos = array_map(fn($x) => normal_($x), partir_($lista, ','));
  return in_array(normal_($u['usuario'] ?? ''), $permitidos, true);
}

function exigirDirectorio_(array $u): void {
  if (!veDirectorio_($u)) throw new Exception('El directorio no está abierto para tu usuario.');
}

/* ---------- consultar el directorio ---------- */

function accDirectorio_(array $u, array $p): array {
  exigirDirectorio_($u);
  $buscar = normal_($p['buscar'] ?? '');
  $empresa = normal_($p['empresa'] ?? '');
  $municipio = normal_($p['municipio'] ?? '');
  $pagina = (int)max(1, num_($p['pagina'] ?? '') ?: 1);
  $porPagina = (int)min(200, max(10, num_($p['por_pagina'] ?? '') ?: 50));

  $todos = leer_('DIRECTORIO');
  $municipios = [];
  $empresas = [];
  foreach ($todos as $c) {
    $m = txt_($c['municipio']); if ($m !== '') $municipios[$m] = ($municipios[$m] ?? 0) + 1;
    $e = txt_($c['empresa']); if ($e !== '') $empresas[$e] = ($empresas[$e] ?? 0) + 1;
  }

  $filtrados = array_values(array_filter($todos, function ($c) use ($buscar, $empresa, $municipio) {
    if ($empresa !== '' && normal_($c['empresa']) !== $empresa) return false;
    if ($municipio !== '' && normal_($c['municipio']) !== $municipio) return false;
    if ($buscar === '') return true;
    $heno = normal_(implode(' ', [$c['nombre'], $c['otros'], $c['direccion'], $c['municipio'], $c['telefono'], $c['email'],
                                  $c['ref'], $c['interes'], $c['producto'], $c['notas']]));
    return strpos($heno, $buscar) !== false;
  }));

  /* Primero los que se han movido hace menos. Entre los que no tienen
     visita apuntada manda la fecha de alta, para que una ficha que se acaba
     de crear a mano no se hunda al final del archivo. */
  $filtrados = ordenar_($filtrados, function ($a, $b) {
    return comparar_(txt_($b['ultima_visita']), txt_($a['ultima_visita'])) ?:
           comparar_(txt_($b['alta_crm']), txt_($a['alta_crm'])) ?:
           comparar_(txt_($a['nombre']), txt_($b['nombre']));
  });

  /* Para exportar hace falta la lista filtrada entera, no la página que se
     está mirando. Se pide aparte y sin el resto del aparato. */
  if (!empty($p['todo'])) {
    return ['ok' => true, 'total' => count($todos), 'encontrados' => count($filtrados),
            'clientes' => $filtrados];
  }

  $desde = ($pagina - 1) * $porPagina;
  ksort($municipios, SORT_STRING);
  ksort($empresas, SORT_STRING);
  $listaMun = []; foreach ($municipios as $k => $n) $listaMun[] = ['municipio' => $k, 'n' => $n];
  $listaEmp = []; foreach ($empresas as $k => $n) $listaEmp[] = ['empresa' => $k, 'n' => $n];
  return ['ok' => true,
    'total' => count($todos),
    'encontrados' => count($filtrados),
    'pagina' => $pagina, 'por_pagina' => $porPagina,
    'clientes' => array_slice($filtrados, $desde, $porPagina),
    /* Para el mapa hace falta todo lo que tenga coordenada, pero en corto.
       Si una coordenada cae fuera de España no se pinta: aquí solo
       trabajamos aquí, y un punto perdido abre el mapa en medio del mundo. */
    'puntos' => array_values(array_map(function ($c) {
      return [txt_($c['ref']), num_($c['lat']), num_($c['lon']), txt_($c['nombre']), txt_($c['empresa']),
              txt_($c['municipio']), txt_($c['precision'])];
    }, array_filter($filtrados, function ($c) {
      /* `c.lat && c.lon` del original ya lo cubre enEspana_ (devuelve false si alguna es 0 o vacía). */
      return enEspana_($c['lat'], $c['lon']); }))),
    'municipios' => $listaMun,
    'empresas' => $listaEmp];
}

/** La ficha entera de uno, con sus visitas. */
function accDirectorioFicha_(array $u, array $p): array {
  exigirDirectorio_($u);
  $ref = txt_($p['ref'] ?? '');
  $c = buscar1_('DIRECTORIO', fn($x) => txt_($x['ref']) === $ref);
  if (!$c) return ['ok' => false, 'error' => 'No existe esa ficha.'];
  $visitas = ordenar_(filtrar_('DIR_VISITAS', fn($v) => txt_($v['ref']) === $ref),
    fn($a, $b) => comparar_(txt_($b['fecha']), txt_($a['fecha'])));
  return ['ok' => true, 'cliente' => $c, 'visitas' => $visitas];
}

/* ---------- las puertas ---------- */

/** El lunes de la semana de una fecha, para contar "lo de esta semana". */
function lunesDe_($iso): string {
  $d = fecha_($iso) ?: ahoraDT_();
  $dia = ((int)$d->format('w') + 6) % 7;            // lunes = 0
  $l = (clone $d)->modify('-' . $dia . ' days');
  return formatearFecha_($l, 'yyyy-MM-dd');
}

function accPuertas_(array $u, array $p): array {
  exigirDirectorio_($u);
  $zona = normal_($p['zona'] ?? '');
  $desde = txt_($p['desde'] ?? '');
  $hasta = txt_($p['hasta'] ?? '');
  $buscar = normal_($p['buscar'] ?? '');

  $todas = leer_('PUERTAS');
  $zonas = [];
  foreach ($todas as $x) { $z = txt_($x['zona']) ?: '(sin zona)'; $zonas[$z] = ($zonas[$z] ?? 0) + 1; }

  /* Para filtrar por fechas vale la que haya; para decir si es nueva, solo
     cuenta el día en que se tocó: una puerta sin fecha no es de esta semana
     por mucho que se haya cargado hoy. */
  $cuando = fn($x) => txt_($x['fecha']) ?: txt_($x['alta_crm']);
  $esNueva = fn($x, $lunes) => txt_($x['fecha']) !== '' && txt_($x['fecha']) >= $lunes;
  $lista = array_values(array_filter($todas, function ($x) use ($zona, $desde, $hasta, $buscar, $cuando) {
    if ($zona !== '' && normal_($x['zona']) !== $zona) return false;
    $f = $cuando($x);
    if ($desde !== '' && $f !== '' && $f < $desde) return false;
    if ($hasta !== '' && $f !== '' && $f > $hasta) return false;
    if ($buscar === '') return true;
    return strpos(normal_(implode(' ', [$x['nombre'], $x['direccion'], $x['zona'], $x['nota'], $x['categoria']])), $buscar) !== false;
  }));

  /* Primero las de hoy. Importa que se ordene aquí y no en la pantalla:
     el listado solo pinta las 600 primeras, así que si se cortara antes de
     ordenar saldrían las primeras de la hoja, que son las más viejas. Las
     que no tienen día se van al final, que no se sabe cuándo fueron. */
  $lista = ordenar_($lista, function ($a, $b) {
    $fa = txt_($a['fecha']); $fb = txt_($b['fecha']);
    if ($fa === '' && $fb === '') return comparar_(txt_($a['zona']), txt_($b['zona']));
    if ($fa === '') return 1;
    if ($fb === '') return -1;
    return comparar_($fb, $fa) ?: comparar_(txt_($b['hora']), txt_($a['hora']));
  });

  /* Lo nuevo de esta semana y el reparto por semanas, que es lo que se mira. */
  $lunes = lunesDe_(hoyISO_());
  $semanaPasada = formatearFecha_(fecha_($lunes)->modify('-7 days'), 'yyyy-MM-dd');
  $nuevas = array_values(array_filter($todas, fn($x) => $esNueva($x, $lunes)));
  $previas = array_values(array_filter($todas, function ($x) use ($semanaPasada, $lunes) {
    $f = txt_($x['fecha']); return $f !== '' && $f >= $semanaPasada && $f < $lunes; }));
  $sinFecha = count(array_filter($todas, fn($x) => txt_($x['fecha']) === ''));

  $porSemana = [];
  foreach ($todas as $x) {
    $f = txt_($x['fecha']); if ($f === '') continue;
    $l = lunesDe_($f);
    $porSemana[$l] = ($porSemana[$l] ?? 0) + 1;
  }

  uksort($zonas, fn($a, $b) => $zonas[$b] <=> $zonas[$a]);
  $listaZonas = []; foreach ($zonas as $k => $n) $listaZonas[] = ['zona' => $k, 'n' => $n];
  ksort($porSemana, SORT_STRING);
  $listaSemanas = [];
  foreach (array_slice($porSemana, -16, null, true) as $k => $n) $listaSemanas[] = ['semana' => $k, 'n' => $n];

  return ['ok' => true,
    'total' => count($todas),
    'encontradas' => count($lista),
    'puertas' => array_map(function ($x) use ($esNueva, $lunes) {
      return ['id' => $x['id'], 'nombre' => txt_($x['nombre']), 'direccion' => txt_($x['direccion']), 'zona' => txt_($x['zona']),
              'fecha' => txt_($x['fecha']), 'hora' => txt_($x['hora']), 'nota' => txt_($x['nota']),
              'categoria' => txt_($x['categoria']), 'lista' => txt_($x['lista']),
              'lat' => num_($x['lat']), 'lon' => num_($x['lon']),
              'nueva' => $esNueva($x, $lunes) ? 'si' : 'no'];
    }, $lista),
    'semana' => ['lunes' => $lunes, 'nuevas' => count($nuevas), 'semana_pasada' => count($previas),
                 'sin_fecha' => $sinFecha],
    'zonas' => $listaZonas,
    'semanas' => $listaSemanas];
}

/* ---------- cargar desde los Excel de la carpeta ---------- */

/* Solo trabajamos en España. En el export de Google Maps se cuelan sitios
   guardados de viajes, y una puerta en Shanghái no es una puerta: se queda
   fuera al cargar. La caja cubre península, Baleares y Canarias. */
const ESPANA = ['latMin' => 27.5, 'latMax' => 44.0, 'lonMin' => -18.5, 'lonMax' => 4.6];

function enEspana_($la, $lo): bool {
  $a = num_($la); $o = num_($lo);
  if (!$a || !$o) return false;
  return $a >= ESPANA['latMin'] && $a <= ESPANA['latMax'] && $o >= ESPANA['lonMin'] && $o <= ESPANA['lonMax'];
}

/** Clave de una puerta: dónde está y qué día se tocó. */
function clavePuerta_(array $x): string {
  return txt_(redondear_(num_($x['lat'] ?? ''), 5)) . '|' . txt_(redondear_(num_($x['lon'] ?? ''), 5)) . '|' . txt_($x['fecha'] ?? '');
}

function accImportarPuertas_(array $u, array $p): array {
  exigirDirectorio_($u);
  $entran = is_array($p['puertas'] ?? null) ? array_values($p['puertas']) : [];
  if (!count($entran)) return ['ok' => true, 'nuevas' => 0, 'repetidas' => 0];

  $ya = [];
  foreach (leer_('PUERTAS') as $x) $ya[clavePuerta_($x)] = true;

  $hoy = hoyISO_();
  $nuevas = [];
  $fuera = 0;
  foreach ($entran as $x) {
    if (!is_array($x)) $x = [];
    if (!enEspana_($x['lat'] ?? '', $x['lon'] ?? '')) { $fuera++; continue; }
    $k = clavePuerta_($x);
    if (isset($ya[$k])) continue;
    $ya[$k] = true;
    $nuevas[] = ['lista' => txt_($x['lista'] ?? ''), 'nota' => txt_($x['nota'] ?? ''), 'categoria' => txt_($x['categoria'] ?? ''),
                 'nombre' => txt_($x['nombre'] ?? ''), 'direccion' => txt_($x['direccion'] ?? ''), 'zona' => txt_($x['zona'] ?? ''),
                 'fecha' => txt_($x['fecha'] ?? ''), 'hora' => txt_($x['hora'] ?? ''),
                 'lat' => num_($x['lat'] ?? ''), 'lon' => num_($x['lon'] ?? ''), 'alta_crm' => $hoy];
  }
  anadirFilas_('PUERTAS', $nuevas);
  registrar_($u, 'importar_puertas', 'PUERTAS', '',
    count($nuevas) . ' nuevas de ' . count($entran) . ($fuera ? ', ' . $fuera . ' fuera de España' : ''));
  return ['ok' => true, 'nuevas' => count($nuevas), 'fuera_de_espana' => $fuera,
          'repetidas' => count($entran) - count($nuevas) - $fuera,
          'total' => count(leer_('PUERTAS'))];
}

function accImportarDirectorio_(array $u, array $p): array {
  exigirDirectorio_($u);
  $entran = is_array($p['clientes'] ?? null) ? array_values($p['clientes']) : [];
  if (!count($entran)) return ['ok' => true, 'altas' => 0, 'actualizados' => 0];

  $porRef = [];
  foreach (leer_('DIRECTORIO') as $c) $porRef[txt_($c['ref'])] = $c;

  $hoy = hoyISO_();
  $campos = ['ref','empresa','nombre','otros','telefono','email','direccion','municipio','cp',
             'lat','lon','precision','interes','situacion','etiquetas','comerciales','n_visitas',
             'primera_visita','ultima_visita','importe','producto','financiera','instalador',
             'n_documentos','carpeta','notas','ultima_actividad'];
  $altas = [];
  $actualizados = 0;
  foreach ($entran as $x) {
    if (!is_array($x)) continue;
    $ref = txt_($x['ref'] ?? '');
    if ($ref === '') continue;
    $fila = [];
    foreach ($campos as $c) $fila[$c] = $x[$c] ?? '';
    $fila['actualizado'] = $hoy;
    /* El cliente entra igual, pero una coordenada de fuera de España no:
       se queda sin punto en el mapa antes que mandar el mapa a China. */
    if (txt_($fila['lat']) !== '' && !enEspana_($fila['lat'], $fila['lon'])) { $fila['lat'] = ''; $fila['lon'] = ''; }
    if (isset($porRef[$ref])) {
      /* Al actualizar no se pisa con vacío lo que ya estaba: si el Excel de
         esta semana no trae un dato, el que había sigue valiendo. */
      $soloLoQueViene = ['actualizado' => $hoy];
      foreach ($campos as $c) { if (txt_($fila[$c]) !== '') $soloLoQueViene[$c] = $fila[$c]; }
      actualizar_('DIRECTORIO', $porRef[$ref]['id'], $soloLoQueViene);
      $actualizados++;
    } else {
      $fila['alta_crm'] = $hoy;
      $altas[] = $fila;
      $porRef[$ref] = $fila;
    }
  }
  anadirFilas_('DIRECTORIO', $altas);
  registrar_($u, 'importar_directorio', 'DIRECTORIO', '', count($altas) . ' altas, ' . $actualizados . ' al día');
  return ['ok' => true, 'altas' => count($altas), 'actualizados' => $actualizados, 'total' => count(leer_('DIRECTORIO'))];
}

function accImportarDirVisitas_(array $u, array $p): array {
  exigirDirectorio_($u);
  $entran = is_array($p['visitas'] ?? null) ? array_values($p['visitas']) : [];
  if (!count($entran)) return ['ok' => true, 'nuevas' => 0];

  $ya = [];
  foreach (leer_('DIR_VISITAS') as $v) {
    $ya[txt_($v['ref']) . '|' . txt_($v['fecha']) . '|' . txt_($v['hora'])] = true; }

  $nuevas = [];
  foreach ($entran as $x) {
    if (!is_array($x)) $x = [];
    $k = txt_($x['ref'] ?? '') . '|' . txt_($x['fecha'] ?? '') . '|' . txt_($x['hora'] ?? '');
    if (isset($ya[$k])) continue;
    $ya[$k] = true;
    $nuevas[] = ['ref' => txt_($x['ref'] ?? ''), 'cliente' => txt_($x['cliente'] ?? ''), 'empresa' => txt_($x['empresa'] ?? ''),
                 'fecha' => txt_($x['fecha'] ?? ''), 'hora' => txt_($x['hora'] ?? ''), 'comercial' => txt_($x['comercial'] ?? ''),
                 'etiquetas' => txt_($x['etiquetas'] ?? ''), 'tarjeta' => txt_($x['tarjeta'] ?? '')];
  }
  anadirFilas_('DIR_VISITAS', $nuevas);
  return ['ok' => true, 'nuevas' => count($nuevas), 'repetidas' => count($entran) - count($nuevas)];
}

/** Saca las que ya estaban cargadas y caen fuera de España. */
function accLimpiarPuertasFuera_(array $u, array $p): array {
  exigirDirectorio_($u);
  $fuera = filtrar_('PUERTAS', fn($x) => !enEspana_($x['lat'], $x['lon']));
  borrarVarios_('PUERTAS', array_map(fn($x) => $x['id'], $fuera));
  registrar_($u, 'limpiar_puertas', 'PUERTAS', '', count($fuera) . ' fuera de España');
  return ['ok' => true, 'borradas' => count($fuera),
    'detalle' => array_map(function ($x) {
      return ['zona' => txt_($x['zona']), 'nombre' => txt_($x['nombre']) ?: txt_($x['direccion']),
              'lat' => num_($x['lat']), 'lon' => num_($x['lon'])]; }, $fuera),
    'total' => count(leer_('PUERTAS'))];
}

/* ---------- el correo de las puertas nuevas ---------- */

/* NOTA PORT: la programación (cada lunes) la hace cron.php, que llama a avisoPuertasSemana(). */
function avisoPuertasSemana($desdeLunes = ''): array {
  /* Va a quien puede ver el directorio, que para eso es suyo. Si hay un
     «resumen_a» puesto, manda ese, que es el desvío de toda la casa. */
  $cfg = config_();
  $desvio = txt_($cfg['resumen_a'] ?? '');
  if ($desvio !== '') $destino = $desvio;
  else {
    $correos = [];
    foreach (leer_('USUARIOS') as $x) {
      if (veDirectorio_($x) && normal_($x['activo']) === 'si' && txt_($x['email']) !== '') $correos[] = txt_($x['email']);
    }
    $destino = implode(',', array_values(array_unique($correos)));
  }
  if ($destino === '') return ['ok' => false, 'error' => 'No hay nadie a quien mandárselo.'];

  /* Si lo lanza el disparador un lunes, lo interesante es la semana que
     acaba de cerrarse, de lunes a domingo. Si se pide a mano, la semana en
     curso desde su lunes hasta hoy. */
  $hoy = fecha_(hoyISO_());
  $esLunes = txt_($desdeLunes) === '' && $hoy && (int)$hoy->format('w') === 1;
  $lunes = txt_($desdeLunes) ?: ($esLunes
    ? formatearFecha_((clone $hoy)->modify('-7 days'), 'yyyy-MM-dd')
    : lunesDe_(hoyISO_()));
  $hasta = $esLunes ? hoyISO_() : '';     // el lunes se corta en domingo
  $todas = leer_('PUERTAS');
  $nuevas = array_values(array_filter($todas, function ($x) use ($lunes, $hasta) {
    $f = txt_($x['fecha']);
    return $f !== '' && $f >= $lunes && ($hasta === '' || $f < $hasta); }));

  $porZona = [];
  foreach ($nuevas as $x) { $z = txt_($x['zona']) ?: '(sin zona)'; $porZona[$z] = ($porZona[$z] ?? 0) + 1; }
  $zonas = array_keys($porZona);
  $zonas = ordenar_($zonas, fn($a, $b) => $porZona[$b] <=> $porZona[$a]);

  $filas = implode('', array_map(function ($x) {
    return '<tr><td style="padding:6px 10px;border-top:1px solid #e3e7e0">' .
      txt_($x['fecha']) . (txt_($x['hora']) !== '' ? ' ' . txt_($x['hora']) : '') . '</td>' .
      '<td style="padding:6px 10px;border-top:1px solid #e3e7e0">' . txt_($x['zona']) . '</td>' .
      '<td style="padding:6px 10px;border-top:1px solid #e3e7e0">' .
      (txt_($x['nombre']) ?: txt_($x['direccion'])) . '</td></tr>';
  }, array_slice($nuevas, 0, 40)));

  $html =
    '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f4f6f3;padding:24px">' .
    '<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e3e7e0;' .
    'border-radius:14px;overflow:hidden">' .
      '<div style="background:#242422;padding:18px 22px">' .
        '<img src="' . LOGO_CORREO . '" alt="ZERO WATTIOS" style="height:26px">' .
        '<div style="color:#b4fa1e;font-size:11px;letter-spacing:.14em;text-transform:uppercase;' .
        'margin-top:6px">Puertas de la semana</div>' .
      '</div>' .
      '<div style="padding:22px">' .
        '<h2 style="margin:0 0 4px;font-size:19px;color:#17191c">' . count($nuevas) .
        ' puertas nuevas</h2>' .
        '<p style="margin:0 0 16px;color:#5b6159;font-size:13.5px">' .
        ($hasta !== '' ? 'Semana del ' . $lunes . ' al ' . $hasta : 'Desde el lunes ' . $lunes) .
        '. En total llevamos ' . count($todas) . ' puertas tocadas.</p>' .
        (count($zonas) ? '<p style="margin:0 0 16px;font-size:13.5px">' . implode(' · ', array_map(function ($z) use ($porZona) {
          return '<b>' . $z . '</b> ' . $porZona[$z]; }, $zonas)) . '</p>' : '') .
        ($filas !== '' ? '<table style="width:100%;border-collapse:collapse;font-size:13px">' . $filas .
          '</table>' : '<p style="font-size:13.5px">Esta semana no se ha tocado ninguna puerta nueva.</p>') .
        (count($nuevas) > 40 ? '<p style="margin:12px 0 0;color:#8b918a;font-size:12.5px">Y ' .
          (count($nuevas) - 40) . ' más, que están todas en el CRM.</p>' : '') .
        '<p style="margin:20px 0 0;font-size:13px">' .
        '<a href="' . WEB_CRM . '#directorio" style="color:#17191c;font-weight:600">' .
        'Abrir el directorio</a></p>' .
      '</div>' .
      '<div style="padding:14px 22px;border-top:1px solid #e3e7e0;color:#8b918a;font-size:11.5px">' .
      'ZERO WATTIOS INGENIERÍA, S.L. · Correo automático del CRM, no hace falta contestar.' .
      '</div>' .
    '</div></div>';

  correo_(['to' => $destino, 'subject' => 'Puertas nuevas de la semana · ' . count($nuevas),
           'htmlBody' => $html, 'name' => 'CRM ZERO WATTIOS']);
  error_log('Aviso de puertas enviado a ' . $destino . ': ' . count($nuevas) . ' nuevas');
  return ['ok' => true, 'nuevas' => count($nuevas), 'destino' => $destino];
}

function accAvisoPuertas_(array $u, array $p): array {
  exigirDirectorio_($u);
  return ['ok' => true, 'resultado' => avisoPuertasSemana(txt_($p['desde'] ?? ''))];
}

/* ================= tocar el directorio a mano =================
 *
 * El grueso entra por el Excel de cada semana, pero hace falta poder
 * arreglar una ficha mal puesta, dar de alta la que falta y quitar la que
 * sobra sin esperar al lunes. Todo esto solo lo ve y lo toca quien tiene el
 * directorio abierto.
 */

/** Alta o corrección de una ficha del directorio. */
function accGuardarDirectorio_(array $u, array $p): array {
  exigirDirectorio_($u);
  $d = $p['cliente'] ?? [];
  if (!is_array($d)) $d = [];
  $campos = array_values(array_filter(ESQUEMA['DIRECTORIO'], fn($c) => !in_array($c, ['id', 'alta_crm', 'actualizado'], true)));

  /* La coordenada de fuera de España no se guarda: aquí solo trabajamos
     aquí y un punto perdido abre el mapa en medio del mundo. */
  $coordenadaRara = txt_($d['lat'] ?? '') !== '' && !enEspana_($d['lat'] ?? '', $d['lon'] ?? '');
  if ($coordenadaRara) { $d['lat'] = ''; $d['lon'] = ''; }

  if (!empty($d['id'])) {
    $actual = buscar1_('DIRECTORIO', fn($c) => mismo_($c['id'], $d['id']));
    if (!$actual) return ['ok' => false, 'error' => 'Esa ficha ya no está en el directorio.'];
    $cambios = ['actualizado' => hoyISO_()];
    foreach ($campos as $c) { if (array_key_exists($c, $d)) $cambios[$c] = $d[$c]; }
    /* La referencia es la que casa el Excel de cada semana con la ficha:
       si se cambia, la semana que viene entraría por duplicado. */
    unset($cambios['ref']);
    $r = actualizar_('DIRECTORIO', $d['id'], $cambios);
    registrar_($u, 'editar_directorio', 'DIRECTORIO', $d['id'], txt_($r ? $r['nombre'] : ''));
    return ['ok' => true, 'cliente' => $r, 'coordenada_fuera' => $coordenadaRara];
  }

  if (txt_($d['nombre'] ?? '') === '' && txt_($d['direccion'] ?? '') === '') {
    return ['ok' => false, 'error' => 'Ponle al menos un nombre o una dirección.'];
  }
  $nuevo = [];
  foreach ($campos as $c) $nuevo[$c] = $d[$c] ?? '';
  $ref = txt_($nuevo['ref']);
  if ($ref !== '' && buscar1_('DIRECTORIO', fn($c) => txt_($c['ref']) === $ref)) {
    return ['ok' => false, 'error' => 'Ya hay una ficha con la referencia ' . $ref . '.'];
  }
  if ($ref === '') $nuevo['ref'] = nuevosIds_('DIRECTORIO', 1)[0];
  $nuevo['alta_crm'] = hoyISO_();
  $nuevo['actualizado'] = hoyISO_();
  $r = insertar_('DIRECTORIO', $nuevo);
  registrar_($u, 'alta_directorio', 'DIRECTORIO', $r['id'], txt_($r['nombre']));
  return ['ok' => true, 'cliente' => $r, 'coordenada_fuera' => $coordenadaRara];
}

/** Quita una ficha o varias, y con ellas sus visitas. */
function accBorrarDirectorio_(array $u, array $p): array {
  exigirDirectorio_($u);
  $pide = [];
  $lista = is_array($p['ids'] ?? null) ? array_values($p['ids']) : (isset($p['ids']) && $p['ids'] !== '' && $p['ids'] !== null ? [$p['ids']] : []);
  if (!empty($p['id'])) $lista[] = $p['id'];
  foreach ($lista as $x) { if (txt_($x) !== '') $pide[txt_($x)] = true; }
  $ids = array_keys($pide);
  if (!count($ids)) return ['ok' => false, 'error' => 'No has marcado ninguna ficha.'];

  $fichas = filtrar_('DIRECTORIO', fn($c) => isset($pide[txt_($c['id'])]));
  if (!count($fichas)) return ['ok' => false, 'error' => 'Esas fichas ya no están.'];
  $refs = [];
  foreach ($fichas as $c) { if (txt_($c['ref']) !== '') $refs[txt_($c['ref'])] = true; }

  $visitas = filtrar_('DIR_VISITAS', fn($v) => isset($refs[txt_($v['ref'])]));
  borrarVarios_('DIR_VISITAS', array_map(fn($v) => $v['id'], $visitas));
  $borradas = borrarVarios_('DIRECTORIO', array_map(fn($c) => $c['id'], $fichas));

  registrar_($u, 'borrar_directorio', 'DIRECTORIO', implode(' ', $ids),
             $borradas . ' fichas y ' . count($visitas) . ' visitas');
  return ['ok' => true, 'borradas' => $borradas, 'visitas_borradas' => count($visitas),
          'total' => count(leer_('DIRECTORIO'))];
}

/** Alta o corrección de una puerta. */
function accGuardarPuerta_(array $u, array $p): array {
  exigirDirectorio_($u);
  $d = $p['puerta'] ?? [];
  if (!is_array($d)) $d = [];
  $campos = array_values(array_filter(ESQUEMA['PUERTAS'], fn($c) => !in_array($c, ['id', 'alta_crm'], true)));

  if (txt_($d['lat'] ?? '') !== '' || txt_($d['lon'] ?? '') !== '') {
    if (!enEspana_($d['lat'] ?? '', $d['lon'] ?? '')) {
      return ['ok' => false, 'error' => 'Esa coordenada cae fuera de España; aquí solo trabajamos aquí.'];
    }
  }

  if (!empty($d['id'])) {
    $actual = buscar1_('PUERTAS', fn($x) => mismo_($x['id'], $d['id']));
    if (!$actual) return ['ok' => false, 'error' => 'Esa puerta ya no está.'];
    $cambios = [];
    foreach ($campos as $c) { if (array_key_exists($c, $d)) $cambios[$c] = $d[$c]; }
    $r = actualizar_('PUERTAS', $d['id'], $cambios);
    registrar_($u, 'editar_puerta', 'PUERTAS', $d['id'], txt_($r ? (txt_($r['nombre']) !== '' ? $r['nombre'] : $r['direccion']) : ''));
    return ['ok' => true, 'puerta' => $r];
  }

  if (txt_($d['nombre'] ?? '') === '' && txt_($d['direccion'] ?? '') === '') {
    return ['ok' => false, 'error' => 'Ponle al menos un nombre o una dirección.'];
  }
  if (!num_($d['lat'] ?? '') || !num_($d['lon'] ?? '')) {
    return ['ok' => false, 'error' => 'Una puerta sin coordenada no se puede pintar en el mapa.'];
  }
  $nueva = [];
  foreach ($campos as $c) $nueva[$c] = $d[$c] ?? '';
  /* La misma puerta el mismo día ya está contada: no se apunta dos veces. */
  $clave = clavePuerta_($nueva);
  if (buscar1_('PUERTAS', fn($x) => clavePuerta_($x) === $clave)) {
    return ['ok' => false, 'error' => 'Esa puerta ya está apuntada con esa fecha.'];
  }
  $nueva['alta_crm'] = hoyISO_();
  $r = insertar_('PUERTAS', $nueva);
  registrar_($u, 'alta_puerta', 'PUERTAS', $r['id'], txt_(txt_($r['nombre']) !== '' ? $r['nombre'] : $r['direccion']));
  return ['ok' => true, 'puerta' => $r];
}

/** Quita una puerta o todas las que se hayan marcado. */
function accBorrarPuertas_(array $u, array $p): array {
  exigirDirectorio_($u);
  $pide = [];
  $lista = is_array($p['ids'] ?? null) ? array_values($p['ids']) : (isset($p['ids']) && $p['ids'] !== '' && $p['ids'] !== null ? [$p['ids']] : []);
  if (!empty($p['id'])) $lista[] = $p['id'];
  foreach ($lista as $x) { if (txt_($x) !== '') $pide[txt_($x)] = true; }
  $ids = array_keys($pide);
  if (!count($ids)) return ['ok' => false, 'error' => 'No has marcado ninguna puerta.'];
  $borradas = borrarVarios_('PUERTAS', $ids);
  if (!$borradas) return ['ok' => false, 'error' => 'Esas puertas ya no están.'];
  registrar_($u, 'borrar_puertas', 'PUERTAS', implode(' ', $ids), $borradas . ' puertas');
  return ['ok' => true, 'borradas' => $borradas, 'total' => count(leer_('PUERTAS'))];
}
