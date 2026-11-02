<?php
/**
 * CRM · ZERO WATTIOS
 * importar.php (= 15_Importar.gs) — Meter de golpe el histórico de la empresa.
 *
 * Sirve para arrancar el CRM con lo que ya pasó: los clientes de la carpeta
 * de Drive, las facturas emitidas, sus cobros, los gastos y las nóminas.
 * Se puede lanzar las veces que haga falta: cada cosa tiene una clave natural
 * (la referencia del cliente, la de la operación, el número de factura…) y lo
 * que ya está se actualiza en lugar de duplicarse.
 */

require_once __DIR__ . '/base.php';
require_once __DIR__ . '/google.php';

/** Los usuarios por su nombre de entrada, para resolver comercial y captador. */
function usuariosPorNombre_(): array {
  $m = [];
  foreach (leer_('USUARIOS') as $u) {
    $m[normal_($u['usuario'])] = $u['id'];
    $m[normal_($u['nombre'])] = $u['id'];
  }
  return $m;
}

/** Busca un registro por el valor de una columna, ya normalizado. */
function porClave_(string $tabla, string $columna): array {
  $m = [];
  foreach (leer_($tabla) as $r) {
    $k = normal_($r[$columna] ?? '');
    if ($k !== '') $m[$k] = $r;
  }
  return $m;
}

/**
 * El paquete puede venir en la llamada o, si es grande, en un archivo JSON
 * dejado en el Drive de la empresa. Así no hay que empujar megas por HTTP.
 */
function paqueteDeDrive_(string $nombre): array {
  $lista = driveBuscarPorNombre_($nombre);
  if (!$lista) throw new Exception('No encuentro el archivo ' . $nombre . ' en el Drive.');
  $f = $lista[0];
  $d = deJson_(driveLeerTexto_((string)$f['id']), null);
  if (!is_array($d)) throw new Exception('El archivo ' . $nombre . ' no es un JSON válido.');
  return $d;
}

function accImportar_(array $u, array $p): array {
  exigir_($u, 'editarTodo');
  if (txt_($p['archivo'] ?? '') !== '') {
    $paquete = paqueteDeDrive_(txt_($p['archivo']));
    foreach (['clientes', 'operaciones', 'facturas', 'cobros', 'gastos', 'nominas'] as $k) {
      if (isset($paquete[$k]) && is_array($paquete[$k])) $p[$k] = $paquete[$k];
    }
  }
  $gente = usuariosPorNombre_();
  $quien = fn($nombre) => $gente[normal_($nombre ?? '')] ?? '';
  $cuenta = ['clientes' => 0, 'operaciones' => 0, 'facturas' => 0, 'cobros' => 0, 'gastos' => 0,
             'actualizados' => 0];

  /* ---------- clientes, por referencia ---------- */
  $clientesPorRef = porClave_('CLIENTES', 'etiquetas');
  $clientesPorNombre = porClave_('CLIENTES', 'nombre');
  $refACliente = [];
  foreach (($p['clientes'] ?? []) as $c) {
    $ref = txt_($c['ref'] ?? '');
    $existente = $clientesPorRef[normal_($ref)] ?? $clientesPorNombre[normal_($c['nombre'] ?? '')] ?? null;
    $datos = [
      'nombre' => txt_($c['nombre'] ?? ''), 'telefono' => txt_($c['telefono'] ?? ''), 'email' => txt_($c['email'] ?? ''),
      'direccion' => txt_($c['direccion'] ?? ''), 'municipio' => txt_($c['municipio'] ?? ''), 'cp' => txt_($c['cp'] ?? ''),
      'comercial_id' => $quien($c['comercial'] ?? ''), 'captador_id' => $quien($c['captador'] ?? ''),
      'interes' => txt_($c['interes'] ?? ''), 'origen' => txt_($c['origen'] ?? '') ?: 'historico',
      'estado' => txt_($c['estado'] ?? '') ?: 'nuevo', 'fecha_estado' => txt_($c['fecha_estado'] ?? ''),
      'etiquetas' => $ref, 'otros' => txt_($c['notas'] ?? ''),
      'modificado' => ahora_(), 'modificado_por' => $u['id']
    ];
    if ($existente) {
      actualizar_('CLIENTES', $existente['id'], $datos);
      $refACliente[$ref] = $existente['id'];
      $cuenta['actualizados']++;
    } else {
      $datos['creado'] = txt_($c['creado'] ?? '') ?: ahora_();
      $datos['creado_por'] = $u['id'];
      $refACliente[$ref] = insertar_('CLIENTES', $datos)['id'];
      $cuenta['clientes']++;
    }
  }

  /* ---------- operaciones, por referencia ---------- */
  $opsPorRef = porClave_('OPERACIONES', 'referencia');
  /* Las obras que ya están cuentan desde el principio: así un paquete que
     solo traiga gastos puede colgarlos de su instalación. */
  $refAOperacion = [];
  foreach (leer_('OPERACIONES') as $o) {
    if (txt_($o['referencia']) !== '') $refAOperacion[txt_($o['referencia'])] = $o['id'];
  }
  foreach (($p['operaciones'] ?? []) as $o) {
    $ref = txt_($o['referencia'] ?? '');
    $cliente = $refACliente[txt_($o['ref_cliente'] ?? '')] ??
               (($clientesPorNombre[normal_($o['cliente'] ?? '')] ?? [])['id'] ?? '');
    if (txt_($cliente) === '') continue;
    $datos = [
      'cliente_id' => $cliente, 'comercial_id' => $quien($o['comercial'] ?? ''), 'captador_id' => $quien($o['captador'] ?? ''),
      'referencia' => $ref, 'tipo' => txt_($o['tipo'] ?? ''), 'estado' => txt_($o['estado'] ?? '') ?: 'instalada',
      'fecha_propuesta' => txt_($o['fecha_propuesta'] ?? ''), 'fecha_contrato' => txt_($o['fecha_contrato'] ?? ''),
      'fecha_firma' => txt_($o['fecha_firma'] ?? ''), 'fecha_instalacion' => txt_($o['fecha_instalacion'] ?? ''),
      'forma_pago' => txt_($o['forma_pago'] ?? ''), 'financiera' => txt_($o['financiera'] ?? ''),
      'importe_fv' => num_($o['importe_fv'] ?? 0), 'importe_aero' => num_($o['importe_aero'] ?? 0),
      'importe_bateria' => num_($o['importe_bateria'] ?? 0), 'importe_cargador' => num_($o['importe_cargador'] ?? 0),
      'importe_extras' => num_($o['importe_extras'] ?? 0),
      'iva_pct' => !array_key_exists('iva_pct', $o) ? configNum_('iva_pct', 21) : num_($o['iva_pct']),
      'paneles_num' => num_($o['paneles_num'] ?? 0), 'panel_modelo' => txt_($o['panel_modelo'] ?? ''),
      'inversor_modelo' => txt_($o['inversor_modelo'] ?? ''), 'inversor_kw' => num_($o['inversor_kw'] ?? 0),
      'bateria_kwh' => num_($o['bateria_kwh'] ?? 0), 'bateria_modelo' => txt_($o['bateria_modelo'] ?? ''),
      'cargador_modelo' => txt_($o['cargador_modelo'] ?? ''),
      'aero_kw' => num_($o['aero_kw'] ?? 0), 'aero_modelo' => txt_($o['aero_modelo'] ?? ''),
      'precio_ajustado' => txt_($o['precio_ajustado'] ?? '') ?: 'no',
      'observaciones' => txt_($o['observaciones'] ?? '')
    ];
    /* El total lo manda el histórico si viene; si no, se suma por partidas. */
    $base = num_($o['base'] ?? 0) ?: ($datos['importe_fv'] + $datos['importe_aero'] +
      $datos['importe_bateria'] + $datos['importe_cargador'] + $datos['importe_extras']);
    $datos['base'] = redondear_($base, 2);
    $datos['total'] = num_($o['total'] ?? 0) ?: redondear_($base * (1 + $datos['iva_pct'] / 100), 2);

    $existente = $opsPorRef[normal_($ref)] ?? null;
    if ($existente) {
      actualizar_('OPERACIONES', $existente['id'], $datos);
      $refAOperacion[$ref] = $existente['id'];
      $cuenta['actualizados']++;
    } else {
      $datos['creado'] = txt_($o['creado'] ?? '') ?: (txt_($o['fecha_firma'] ?? '') ?: ahora_());
      $datos['creado_por'] = $u['id'];
      $refAOperacion[$ref] = insertar_('OPERACIONES', $datos)['id'];
      $cuenta['operaciones']++;
    }
    /* NOTA PORT: el original llamaba a sincronizarEstadoCliente_(cliente) con un
       solo argumento (el id del cliente). La firma real es (u, op), así que `op`
       llegaba undefined y la función salía sin hacer nada. Se deja sin llamar
       para conservar ese comportamiento (en PHP la llamada daría un TypeError). */
  }

  /* ---------- facturas, por número ---------- */
  $factPorNumero = porClave_('FACTURAS', 'numero');
  foreach (($p['facturas'] ?? []) as $f) {
    $opId = $refAOperacion[txt_($f['ref_operacion'] ?? '')] ?? '';
    $cliId = $refACliente[txt_($f['ref_cliente'] ?? '')] ??
      ($opId !== '' ? txt_((buscar1_('OPERACIONES', fn($x) => $x['id'] === $opId) ?? [])['cliente_id'] ?? '') : '');
    $datos = [
      'numero' => txt_($f['numero'] ?? ''), 'operacion_id' => $opId, 'cliente_id' => $cliId,
      'fecha_emision' => txt_($f['fecha'] ?? ''), 'concepto' => txt_($f['concepto'] ?? ''),
      'base' => num_($f['base'] ?? 0), 'iva_pct' => num_($f['iva_pct'] ?? 0) ?: 21, 'iva' => num_($f['iva'] ?? 0),
      'total' => num_($f['total'] ?? 0), 'estado' => txt_($f['estado'] ?? '') ?: 'cobrada',
      'fecha_vencimiento' => txt_($f['fecha_vencimiento'] ?? ''), 'fecha_cobro' => txt_($f['fecha_cobro'] ?? ''),
      'emitida_por' => $u['id'], 'notas' => txt_($f['notas'] ?? '')
    ];
    $existente = $factPorNumero[normal_($f['numero'] ?? '')] ?? null;
    if ($existente) { actualizar_('FACTURAS', $existente['id'], $datos); $cuenta['actualizados']++; }
    else { insertar_('FACTURAS', $datos); $cuenta['facturas']++; }
  }

  /* ---------- cobros: la clave es la operación más el concepto ---------- */
  $cobrosPorClave = [];
  foreach (leer_('COBROS') as $c) {
    $cobrosPorClave[txt_($c['operacion_id']) . '|' . normal_($c['concepto']) . '|' . redondear_(num_($c['importe']), 2)] = $c;
  }
  foreach (($p['cobros'] ?? []) as $c) {
    $opId = $refAOperacion[txt_($c['ref_operacion'] ?? '')] ?? '';
    if (txt_($opId) === '') continue;
    $clave = $opId . '|' . normal_($c['concepto'] ?? '') . '|' . redondear_(num_($c['importe'] ?? 0), 2);
    $datos = [
      'operacion_id' => $opId, 'concepto' => txt_($c['concepto'] ?? ''), 'importe' => redondear_(num_($c['importe'] ?? 0), 2),
      'fecha_prevista' => txt_($c['fecha_prevista'] ?? ''), 'fecha_cobro' => txt_($c['fecha_cobro'] ?? ''),
      'estado' => txt_($c['fecha_cobro'] ?? '') !== '' ? 'cobrado' : 'pendiente',
      'metodo' => txt_($c['metodo'] ?? '') ?: 'transferencia', 'notas' => txt_($c['notas'] ?? '')
    ];
    $existente = $cobrosPorClave[$clave] ?? null;
    if ($existente) { actualizar_('COBROS', $existente['id'], $datos); $cuenta['actualizados']++; }
    else { $datos['creado'] = ahora_(); $datos['creado_por'] = $u['id']; insertar_('COBROS', $datos); $cuenta['cobros']++; }
  }

  /* ---------- gastos: proveedor, fecha e importe ---------- */
  $gastosPorClave = [];
  foreach (leer_('GASTOS') as $g) {
    $gastosPorClave[normal_($g['proveedor']) . '|' . txt_($g['fecha']) . '|' .
                    redondear_(num_($g['importe']), 2)] = $g;
  }
  $claveGasto = fn($prov, $fecha, $importe) => normal_($prov ?? '') . '|' . txt_($fecha ?? '') . '|' . redondear_(num_($importe ?? 0), 2);
  foreach (($p['gastos'] ?? []) as $g) {
    /* «anterior» señala un gasto que ya está, para corregirlo en su sitio:
       así el apunte del banco pasa a ser la factura de la obra, con su
       importe sin IVA y la instalación a la que pertenece, sin duplicarse. */
    $propia = $claveGasto($g['proveedor'] ?? '', $g['fecha'] ?? '', $g['importe'] ?? 0);
    $ant = $g['anterior'] ?? null;
    $antigua = is_array($ant) ? $claveGasto($ant['proveedor'] ?? '', $ant['fecha'] ?? '', $ant['importe'] ?? 0) : '';
    /* Si ya se corrigió en una pasada anterior, la clave vieja ya no está y
       vale la nueva; por eso se busca primero una y luego la otra. */
    $clave = ($antigua !== '' && isset($gastosPorClave[$antigua])) ? $antigua : $propia;
    $datos = [
      'operacion_id' => $refAOperacion[txt_($g['ref_operacion'] ?? '')] ?? '',
      'categoria' => txt_($g['categoria'] ?? '') ?: 'otros', 'proveedor' => txt_($g['proveedor'] ?? ''),
      'concepto' => txt_($g['concepto'] ?? ''), 'importe' => redondear_(num_($g['importe'] ?? 0), 2),
      'iva_pct' => num_($g['iva_pct'] ?? 0) ?: 21, 'fecha' => txt_($g['fecha'] ?? ''),
      'estado_pago' => txt_($g['estado_pago'] ?? '') ?: 'pagado', 'fecha_pago' => txt_($g['fecha_pago'] ?? '') ?: txt_($g['fecha'] ?? ''),
      'factura_proveedor' => txt_($g['factura_proveedor'] ?? ''), 'notas' => txt_($g['notas'] ?? '')
    ];
    $existente = $gastosPorClave[$clave] ?? null;
    if ($existente) {
      actualizar_('GASTOS', $existente['id'], $datos);
      unset($gastosPorClave[$clave]);
      $gastosPorClave[$propia] = $existente;
      $cuenta['actualizados']++;
    } else {
      $datos['creado'] = ahora_(); $datos['creado_por'] = $u['id'];
      insertar_('GASTOS', $datos);
      $gastosPorClave[$propia] = $datos;
      $cuenta['gastos']++;
    }
  }

  /* ---------- nóminas: una por persona y mes ---------- */
  $nomPorClave = [];
  foreach (leer_('NOMINAS') as $n) {
    $nomPorClave[txt_($n['usuario_id']) . '|' . txt_($n['periodo'])] = $n;
  }
  $cuenta['nominas'] = 0;
  foreach (($p['nominas'] ?? []) as $n) {
    $uid = $quien($n['usuario'] ?? '');
    if (txt_($uid) === '') continue;
    $bruto = num_($n['bruto'] ?? 0); $dietas = num_($n['dietas'] ?? 0); $comisiones = num_($n['comisiones'] ?? 0);
    $brutoTotal = num_($n['bruto_total'] ?? 0) ?: redondear_($bruto + $dietas + $comisiones, 2);
    $irpf = num_($n['irpf'] ?? 0); $ss = num_($n['ss'] ?? 0);
    $datos = [
      'usuario_id' => $uid, 'periodo' => txt_($n['periodo'] ?? ''),
      'bruto' => $bruto, 'dietas' => $dietas, 'comisiones' => $comisiones, 'otros' => num_($n['otros'] ?? 0),
      'bruto_total' => $brutoTotal,
      'irpf_pct' => num_($n['irpf_pct'] ?? 0) ?: pct_($irpf, $brutoTotal), 'irpf' => $irpf,
      'ss_pct' => num_($n['ss_pct'] ?? 0) ?: pct_($ss, $brutoTotal), 'ss' => $ss,
      'neto' => num_($n['neto'] ?? 0) ?: redondear_($brutoTotal - $irpf - $ss, 2),
      'estado' => txt_($n['estado'] ?? '') ?: 'pagada', 'fecha_pago' => txt_($n['fecha_pago'] ?? ''),
      'detalle' => txt_($n['detalle'] ?? ''), 'notas' => txt_($n['notas'] ?? '')
    ];
    $clave = $uid . '|' . $datos['periodo'];
    $existente = $nomPorClave[$clave] ?? null;
    if ($existente) { actualizar_('NOMINAS', $existente['id'], $datos); $cuenta['actualizados']++; }
    else { $datos['creado'] = ahora_(); insertar_('NOMINAS', $datos); $cuenta['nominas']++; }
  }

  registrar_($u, 'importar_historico', 'CRM', '', aJson_($cuenta));
  return ['ok' => true, 'resumen' => $cuenta];
}
