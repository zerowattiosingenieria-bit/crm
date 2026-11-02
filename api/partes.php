<?php
/**
 * partes.php — Parte diario del equipo y lectura automática del resumen.
 * (Traducción de 06_Partes.gs)
 *
 * Al final del día, el captador dice cuántas puertas y cuántas fichas ha
 * hecho; el comercial dice cuántas sentadas ha tenido y con quién, y
 * escribe un resumen en lenguaje normal. El servidor lee ese resumen,
 * reconoce a los clientes y propone cambios de estado, próximos pasos y
 * fechas. Nada se aplica sin que la persona lo confirme.
 */

require_once __DIR__ . '/base.php';

function accGuardarParte_(array $u, array $p): array {
  $d = is_array($p['parte'] ?? null) ? $p['parte'] : [];
  $fecha = txt_($d['fecha'] ?? '') ?: hoyISO_();
  $existente = buscar1_('PARTES', fn($x) => mismo_($x['usuario_id'], $u['id'] ?? '') && txt_($x['fecha']) === $fecha);

  /* Las fichas de captación del día se cuentan solas. */
  $fichasHoy = count(filtrar_('CAPTACIONES', fn($c) => mismo_($c['captador_id'], $u['id'] ?? '') && txt_($c['fecha']) === $fecha));

  $sentadas = (is_array($d['sentadas_detalle'] ?? null) && array_is_list($d['sentadas_detalle'])) ? $d['sentadas_detalle'] : [];
  $analisis = analizarResumen_($u, txt_($d['resumen'] ?? ''), $fecha);

  $datos = [
    'fecha' => $fecha, 'usuario_id' => $u['id'] ?? '', 'rol' => $u['rol'] ?? '',
    'visitas' => num_($d['visitas'] ?? ''), 'puertas' => num_($d['puertas'] ?? ''), 'fichas' => $fichasHoy,
    'sentadas' => count($sentadas) ?: num_($d['sentadas'] ?? ''),
    'sentadas_detalle' => aJson_($sentadas),
    'ventas' => num_($d['ventas'] ?? ''), 'importe_vendido' => num_($d['importe_vendido'] ?? ''),
    'resumen' => txt_($d['resumen'] ?? ''), 'analisis' => aJson_($analisis),
    'estado' => 'enviado', 'modificado' => ahora_()
  ];

  if ($existente) {
    $datos['propuestas_aplicadas'] = $existente['propuestas_aplicadas'];
    $r = actualizar_('PARTES', $existente['id'], $datos);
  } else {
    $datos['creado'] = ahora_();
    $datos['propuestas_aplicadas'] = '';
    $r = insertar_('PARTES', $datos);
  }
  registrar_($u, 'parte_diario', 'PARTES', $r['id'] ?? '', $fecha);
  return ['ok' => true, 'parte' => $r, 'analisis' => $analisis];
}

/** Aplica las propuestas que la persona ha confirmado. */
function accAplicarParte_(array $u, array $p): array {
  $parte = buscar1_('PARTES', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$parte) return ['ok' => false, 'error' => 'No existe ese parte.'];
  if (!mismo_($parte['usuario_id'], $u['id'] ?? '') && empty(permisos_($u)['editarTodo'])) {
    return ['ok' => false, 'error' => 'Ese parte no es tuyo.'];
  }
  $cambios = is_array($p['cambios'] ?? null) ? $p['cambios'] : [];
  $aplicados = [];
  foreach ($cambios as $c) {
    $cli = buscar1_('CLIENTES', fn($x) => mismo_($x['id'], $c['cliente_id'] ?? ''));
    if (!$cli || !veCliente_($u, $cli)) continue;
    $upd = ['modificado' => ahora_(), 'modificado_por' => $u['id'] ?? ''];
    if (txt_($c['estado'] ?? '') !== '') { $upd['estado'] = $c['estado']; $upd['fecha_estado'] = txt_($parte['fecha']); }
    if (txt_($c['proximo_paso'] ?? '') !== '') $upd['proxima_accion'] = $c['proximo_paso'];
    if (txt_($c['proxima_fecha'] ?? '') !== '') $upd['proxima_fecha'] = $c['proxima_fecha'];
    actualizar_('CLIENTES', $cli['id'], $upd);
    insertar_('SEGUIMIENTO', [
      'cliente_id' => $cli['id'], 'operacion_id' => (txt_($c['operacion_id'] ?? '') !== '' ? $c['operacion_id'] : ''), 'usuario_id' => $u['id'] ?? '',
      'fecha' => txt_($parte['fecha']), 'canal' => (txt_($c['canal'] ?? '') !== '' ? $c['canal'] : 'visita'),
      'nota' => txt_($c['nota'] ?? '') ?: 'Anotado en el parte diario.',
      'proximo_paso' => txt_($c['proximo_paso'] ?? ''), 'proxima_fecha' => txt_($c['proxima_fecha'] ?? ''),
      'estado_resultante' => txt_($c['estado'] ?? ''), 'origen' => 'parte', 'creado' => ahora_()
    ]);
    $aplicados[] = $cli['id'];
  }
  actualizar_('PARTES', $parte['id'], ['propuestas_aplicadas' => aJson_($aplicados), 'estado' => 'aplicado']);
  registrar_($u, 'aplicar_parte', 'PARTES', $parte['id'], implode(',', array_map('txt_', $aplicados)));
  return ['ok' => true, 'aplicados' => $aplicados];
}

function accPartes_(array $u, array $p): array {
  $per = permisos_($u);
  $desde = txt_($p['desde'] ?? '') ?: sumarDias_(hoyISO_(), -30);
  $hasta = txt_($p['hasta'] ?? '') ?: hoyISO_();
  $partes = filtrar_('PARTES', fn($x) => txt_($x['fecha']) >= $desde && txt_($x['fecha']) <= $hasta);
  if (empty($per['partesAjenos'])) {
    $partes = array_values(array_filter($partes, fn($x) => mismo_($x['usuario_id'], $u['id'] ?? '')));
  } elseif (txt_($p['usuario_id'] ?? '') !== '') {
    $partes = array_values(array_filter($partes, fn($x) => mismo_($x['usuario_id'], $p['usuario_id'])));
  }
  $partes = ordenar_($partes, fn($a, $b) => comparar_(txt_($b['fecha']), txt_($a['fecha'])));
  return ['ok' => true, 'partes' => $partes];
}

/* ================= lectura del resumen escrito ================= */

/* Lo que dice el comercial -> lo que significa para la ficha del cliente. */
const REGLAS_ESTADO = [
  ['estado' => 'ganado', 'claves' => ['firmado','firmamos','firma el contrato','cerrado','cerramos','vendido',
      'vendida','acepta la propuesta','acepta el presupuesto','me da el si','me da el sí','adelante con la obra',
      'contrato firmado','se lo queda']],
  ['estado' => 'perdido', 'claves' => ['no interesa','no le interesa','descartado','descartamos','se cae',
      'se ha caido','se ha caído','no sigue adelante','ha dicho que no','nos dice que no','perdido',
      'se va con otra','ha contratado a otra','lo deja','no quiere']],
  ['estado' => 'negociando', 'claves' => ['se lo piensa','lo va a pensar','pide descuento','esta negociando',
      'está negociando','quiere rebaja','compara presupuestos','duda','pendiente de decidir',
      'le tengo que ajustar','pide mejorar precio','consultarlo con']],
  ['estado' => 'propuesta', 'claves' => ['le mando la propuesta','propuesta enviada','presupuesto enviado',
      'le envio el presupuesto','le envío el presupuesto','mandada la oferta','oferta enviada',
      'le paso la propuesta','enviada la propuesta']],
  ['estado' => 'sentada', 'claves' => ['sentada','he estado en casa de','visita realizada','estuve con',
      'he visitado','hemos visitado','visita hecha']],
  ['estado' => 'cita', 'claves' => ['cita concertada','quedamos el','concertada la visita','me recibe el',
      'visita el']],
  ['estado' => 'frio', 'claves' => ['en frio','en frío','lo dejamos aparcado','para mas adelante',
      'para más adelante','ahora no','el año que viene','despues del verano','después del verano']]
];

/* Pistas de que hay que volver a llamar. */
const REGLAS_PASO = [
  ['paso' => 'Llamar para cerrar', 'claves' => ['llamar para cerrar','cerrar por telefono','cerrar por teléfono','llamada de cierre']],
  ['paso' => 'Volver a llamar', 'claves' => ['volver a llamar','le llamo','llamarle','rellamada','le vuelvo a llamar','llamar']],
  ['paso' => 'Enviar propuesta', 'claves' => ['mandar propuesta','enviar propuesta','preparar presupuesto','pasar presupuesto','hacer la oferta']],
  ['paso' => 'Segunda visita', 'claves' => ['segunda visita','volver a casa','volver a la vivienda','ir otra vez']],
  ['paso' => 'Pendiente de financiación', 'claves' => ['financiacion','financiación','banco','cetelem','estudio de financiera','scoring']],
  ['paso' => 'Pendiente de documentación', 'claves' => ['falta el dni','manda el dni','falta la factura de la luz','cups','documentacion','documentación']],
  ['paso' => 'Visita técnica', 'claves' => ['visita tecnica','visita técnica','medir','replanteo','ver el tejado']]
];

const DIAS_SEMANA = [['domingo',0],['lunes',1],['martes',2],['miercoles',3],['miércoles',3],
  ['jueves',4],['viernes',5],['sabado',6],['sábado',6]];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
  'septiembre','octubre','noviembre','diciembre'];

/**
 * Lee el resumen, localiza a los clientes de esa persona por su nombre y
 * propone cambios. Devuelve propuestas, nunca cambios hechos.
 */
function analizarResumen_(array $u, $texto, $fechaParte): array {
  $limpio = normal_($texto);
  if ($limpio === '') return ['frases' => [], 'propuestas' => [], 'avisos' => []];

  $clientes = misClientes_($u);
  $operaciones = misOperaciones_($u);
  $opPorCliente = [];
  foreach ($operaciones as $o) $opPorCliente[txt_($o['cliente_id'])] = $o;

  /* Se parte por frases: cada una suele hablar de un cliente. */
  $frases = array_values(array_filter(
    array_map(fn($f) => trim($f), preg_split('/(?:\.|;|\n|\r|•|·)+/u', txt_($texto))),
    fn($f) => mb_strlen($f) > 3
  ));

  $propuestas = [];
  $avisos = [];

  $ultimos = [];   // de quién se venía hablando en la frase anterior
  foreach ($frases as $frase) {
    $f = normal_($frase);
    $encontrados = array_values(array_filter($clientes, fn($c) => mencionado_($f, $c)));
    $estado = estadoDe_($f);
    $paso = pasoDe_($f);
    $fecha = fechaDe_($f, $fechaParte);
    $heredado = false;

    if (!count($encontrados)) {
      /* "Le llamo el lunes" suele seguir hablando del cliente anterior. */
      if (count($ultimos) && ($estado !== '' || $paso !== '' || $fecha !== '')) {
        $encontrados = $ultimos;
        $heredado = true;
      } else {
        if (preg_match('/(firm|cerr|vend|no interesa|propuesta|presupuesto)/u', $f)) {
          $avisos[] = 'No he reconocido a ningún cliente tuyo en: "' . trim($frase) . '"';
        }
        continue;
      }
    } else {
      $ultimos = $encontrados;
    }

    foreach ($encontrados as $c) {
      if ($estado === '' && $paso === '' && $fecha === '') continue;
      $op = $opPorCliente[txt_($c['id'])] ?? null;
      $propuestas[] = [
        'cliente_id' => $c['id'], 'cliente' => $c['nombre'], 'operacion_id' => $op ? $op['id'] : '',
        'estado_actual' => $c['estado'], 'estado' => ($estado !== '' && $estado !== txt_($c['estado'])) ? $estado : '',
        'proximo_paso' => $paso, 'proxima_fecha' => $fecha,
        'nota' => trim($frase), 'canal' => preg_match('/llama|telefono|teléfono/u', $f) ? 'llamada'
              : (preg_match('/whatsapp|wasap/u', $f) ? 'whatsapp' : (preg_match('/correo|email|mail/u', $f) ? 'email' : 'visita')),
        'confianza' => ($estado !== '' ? 2 : 0) + ($paso !== '' ? 1 : 0) + ($fecha !== '' ? 1 : 0) - ($heredado ? 1 : 0)
      ];
    }
  }

  /* Si dos frases hablan del mismo cliente, manda la de más confianza. */
  $porCliente = [];
  foreach ($propuestas as $p) {
    $k = txt_($p['cliente_id']);
    if (!isset($porCliente[$k]) || $porCliente[$k]['confianza'] < $p['confianza']) $porCliente[$k] = $p;
    else {
      if ($porCliente[$k]['estado'] === '' && $p['estado'] !== '') $porCliente[$k]['estado'] = $p['estado'];
      if ($porCliente[$k]['proximo_paso'] === '' && $p['proximo_paso'] !== '') $porCliente[$k]['proximo_paso'] = $p['proximo_paso'];
      if ($porCliente[$k]['proxima_fecha'] === '' && $p['proxima_fecha'] !== '') $porCliente[$k]['proxima_fecha'] = $p['proxima_fecha'];
    }
  }

  $lista = ordenar_(
    array_values(array_filter(array_values($porCliente), fn($p) => $p['estado'] !== '' || $p['proximo_paso'] !== '' || $p['proxima_fecha'] !== '')),
    fn($a, $b) => $b['confianza'] <=> $a['confianza']
  );

  return ['frases' => $frases, 'propuestas' => $lista, 'avisos' => $avisos];
}

/** ¿Se está hablando de este cliente? Por nombre, apellido o dirección. */
function mencionado_(string $fraseNormal, array $cliente): bool {
  $nombre = normal_($cliente['nombre'] ?? '');
  if ($nombre === '') return false;
  if (mb_strpos($fraseNormal, $nombre) !== false) return true;
  /* Los nombres pueden traer paréntesis, puntos o barras («Rio Lega 2 (pendiente
     de nombre)»): se quitan los signos antes de buscar, y cada trozo se escapa
     para que nunca rompa la expresión regular. */
  $partes = array_values(array_filter(
    array_map(fn($x) => preg_replace('/[^a-z0-9ñ]/u', '', $x), preg_split('/\s+/u', $nombre)),
    fn($x) => mb_strlen($x) >= 4
  ));
  /* Con el nombre de pila basta si es razonablemente distintivo. */
  $aciertos = count(array_filter($partes, function ($x) use ($fraseNormal) {
    $seguro = preg_quote($x, '/');
    $r = @preg_match('/(^|[^a-z0-9])' . $seguro . '([^a-z0-9]|$)/u', $fraseNormal);
    if ($r === false) return mb_strpos($fraseNormal, $x) !== false;
    return $r === 1;
  }));
  if ($aciertos >= 1 && count($partes) === 1) return true;
  if ($aciertos >= 1 && mb_strpos($fraseNormal, $partes[0]) !== false) return true;
  $dir = normal_($cliente['direccion'] ?? '');
  if (mb_strlen($dir) > 8 && mb_strpos($fraseNormal, $dir) !== false) return true;
  return false;
}

function estadoDe_(string $f): string {
  foreach (REGLAS_ESTADO as $r) {
    foreach ($r['claves'] as $clave) {
      if (mb_strpos($f, $clave) !== false) return $r['estado'];
    }
  }
  return '';
}

function pasoDe_(string $f): string {
  foreach (REGLAS_PASO as $r) {
    foreach ($r['claves'] as $clave) {
      if (mb_strpos($f, $clave) !== false) return $r['paso'];
    }
  }
  return '';
}

/** Saca una fecha de expresiones normales: mañana, el lunes, el 3 de octubre, 12/10. */
function fechaDe_(string $f, $referenciaISO): string {
  $ref = txt_($referenciaISO) ?: hoyISO_();

  if (preg_match('/\bhoy\b/u', $f)) return $ref;
  if (preg_match('/\bmanana\b|\bmañana\b/u', $f)) return sumarDias_($ref, 1);
  if (preg_match('/pasado manana|pasado mañana/u', $f)) return sumarDias_($ref, 2);
  if (preg_match('/semana que viene|proxima semana|próxima semana/u', $f)) return sumarDias_($ref, 7);
  if (preg_match('/en quince dias|en 15 dias|dos semanas/u', $f)) return sumarDias_($ref, 14);
  if (preg_match('/mes que viene|proximo mes|próximo mes/u', $f)) return sumarDias_($ref, 30);

  if (preg_match('/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/u', $f, $m)) {
    $d = (int)$m[1]; $mes = (int)$m[2];
    $tieneAnio = ($m[3] ?? '') !== '';
    $anio = $tieneAnio ? (int)$m[3] : (int)substr($ref, 0, 4);
    if ($anio < 100) $anio += 2000;
    if ($d >= 1 && $d <= 31 && $mes >= 1 && $mes <= 12) {
      $iso = $anio . '-' . str_pad((string)$mes, 2, '0', STR_PAD_LEFT) . '-' . str_pad((string)$d, 2, '0', STR_PAD_LEFT);
      return ($iso < $ref && !$tieneAnio) ? ($anio + 1) . substr($iso, 4) : $iso;
    }
  }

  if (preg_match('/\b(\d{1,2})\s+de\s+([a-z]+)/u', $f, $m)) {
    $d = (int)$m[1];
    $mes = array_search($m[2], MESES, true);
    if ($mes !== false && $d >= 1 && $d <= 31) {
      $anio = (int)substr($ref, 0, 4);
      $iso = $anio . '-' . str_pad((string)($mes + 1), 2, '0', STR_PAD_LEFT) . '-' . str_pad((string)$d, 2, '0', STR_PAD_LEFT);
      return $iso < $ref ? ($anio + 1) . substr($iso, 4) : $iso;
    }
  }

  foreach (DIAS_SEMANA as $dia) {
    if (preg_match('/\b' . $dia[0] . '\b/u', $f)) {
      $objetivo = $dia[1];
      $base = fecha_($ref) ?? ahoraDT_();
      $dias = ($objetivo - (int)$base->format('w') + 7) % 7;
      if ($dias === 0) $dias = 7;
      return sumarDias_($ref, $dias);
    }
  }
  return '';
}

/** Relee un parte ya guardado (por si se ha corregido el texto). */
function accReanalizar_(array $u, array $p): array {
  $parte = buscar1_('PARTES', fn($x) => mismo_($x['id'], $p['id'] ?? ''));
  if (!$parte) return ['ok' => false, 'error' => 'No existe ese parte.'];
  if (!mismo_($parte['usuario_id'], $u['id'] ?? '') && empty(permisos_($u)['partesAjenos'])) {
    return ['ok' => false, 'error' => 'Ese parte no es tuyo.'];
  }
  $analisis = analizarResumen_($u, txt_($p['resumen'] ?? '') ?: txt_($parte['resumen']), txt_($parte['fecha']));
  actualizar_('PARTES', $parte['id'], ['analisis' => aJson_($analisis),
    'resumen' => txt_($p['resumen'] ?? '') ?: txt_($parte['resumen']), 'modificado' => ahora_()]);
  return ['ok' => true, 'analisis' => $analisis];
}
