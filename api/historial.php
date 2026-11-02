<?php
/**
 * CRM · ZERO WATTIOS
 * historial.php (= 25_Historial.gs) — Histórico de cambios de cada lead (02/11/2026).
 *
 * Orden de Nando: «en el lead se tiene que ver un histórico de todos los
 * cambios que ha ido haciendo el captador o el comercial». Cada vez que
 * alguien cambia un dato de la ficha del cliente o de una de sus citas, se
 * apunta qué campo era, cómo estaba, cómo queda, quién y cuándo.
 */

require_once __DIR__ . '/base.php';

const CAMPOS_SIN_HISTORIAL = ['id', 'creado', 'creado_por', 'modificado', 'modificado_por', 'fecha_estado', 'fecha_resultado',
  'cliente_id', 'operacion_id'];
const CAMPOS_SIN_VALOR = ['dni', 'cotitular'];

const NOMBRE_CAMPO = [
  'nombre' => 'Nombre', 'telefono' => 'Teléfono', 'email' => 'Correo', 'direccion' => 'Dirección', 'municipio' => 'Municipio', 'cp' => 'C.P.',
  'coordenadas' => 'Coordenadas', 'tipo_vivienda' => 'Tipo de vivienda', 'regimen' => 'Régimen', 'm2' => 'm²', 'personas' => 'Personas',
  'anyo' => 'Año', 'calefaccion' => 'Calefacción', 'gasto_combustible' => 'Gasto combustible', 'periodo_combustible' => 'Periodo combustible',
  'gasto_luz_mes' => 'Gasto de luz/mes', 'comercializadora' => 'Comercializadora', 'cups' => 'CUPS', 'potencia_contratada' => 'Potencia',
  'ya_fv' => 'Ya tiene FV', 'interes' => 'Interés', 'perfil' => 'Perfil', 'otros' => 'Otros datos', 'origen' => 'Origen', 'estado' => 'Estado',
  'proxima_accion' => 'Próximo paso', 'proxima_fecha' => 'Fecha próximo paso', 'etiquetas' => 'Etiquetas', 'comercial_id' => 'Comercial',
  'captador_id' => 'Captador', 'dni' => 'DNI', 'cotitular' => 'Cotitular',
  'fecha' => 'Día de la cita', 'hora_cita' => 'Hora', 'estado_cita' => 'Estado de la cita', 'tecnologia' => 'Tecnología',
  'resultado' => 'Resultado', 'notas' => 'Notas',
];

function valorHistorial_($v): string {
  $s = txt_($v);
  return mb_strlen($s) > 300 ? mb_substr($s, 0, 297) . '…' : $s;
}

function mismoNumero_(string $a, string $d): bool {
  if (!preg_match('/^-?[\d.,]+$/', $a) || !preg_match('/^-?[\d.,]+$/', $d)) return false;
  return abs((float)str_replace(',', '.', $a) - (float)str_replace(',', '.', $d)) < 1e-9;
}

/** Apunta los campos que cambian entre $antes y $despues. Para un alta, $antes es null y se apunta una línea. */
function apuntarHistorial_($u, string $entidad, $entidadId, $clienteId, ?array $antes, ?array $despues, string $resumenAlta = ''): void {
  try {
    $filas = [];
    $base = ['fecha' => ahora_(), 'usuario_id' => $u ? $u['id'] : '', 'cliente_id' => txt_($clienteId), 'entidad' => $entidad, 'entidad_id' => txt_($entidadId)];
    if (!$antes) {
      $filas[] = $base + ['campo' => 'alta', 'antes' => '', 'despues' => trozo_($resumenAlta, 0, 300)];
    } else {
      foreach (($despues ?? []) as $k => $v) {
        $k = (string)$k;
        if (in_array($k, CAMPOS_SIN_HISTORIAL, true) || $k === '' || $k[0] === '_') continue;
        $a = txt_($antes[$k] ?? ''); $d = txt_($v);
        if ($a === $d || mismoNumero_($a, $d)) continue;
        if (in_array($k, CAMPOS_SIN_VALOR, true)) {
          $filas[] = $base + ['campo' => $k, 'antes' => $a !== '' ? '(había)' : '', 'despues' => $d !== '' ? '(cambiado)' : '(borrado)'];
          continue;
        }
        /* Un texto al que se le añade algo: solo lo añadido. */
        if (in_array($k, ['notas', 'perfil', 'otros'], true) && $a !== '' && strpos($d, $a) === 0) {
          $filas[] = $base + ['campo' => $k, 'antes' => '', 'despues' => valorHistorial_('+ ' . trim(substr($d, strlen($a))))];
          continue;
        }
        $filas[] = $base + ['campo' => $k, 'antes' => valorHistorial_($a), 'despues' => valorHistorial_($d)];
      }
    }
    if ($filas) anadirFilas_('CAMBIOS', $filas);
  } catch (Throwable $e) { /* el historial nunca impide guardar */ }
}

function etiquetaCatalogo_(string $lista, $v): string {
  foreach (CATALOGO[$lista] ?? [] as $x) if ($x[0] === normal_($v)) return $x[1];
  return txt_($v);
}

/** El histórico de un cliente y de sus citas, lo más nuevo arriba. */
function accHistorialCambios_(array $u, array $p): array {
  $cli = buscar1_('CLIENTES', fn($c) => mismo_($c['id'], $p['cliente_id'] ?? ''));
  if (!$cli) return ['ok' => false, 'error' => 'No existe ese cliente.'];
  if (!veCliente_($u, $cli)) return ['ok' => false, 'error' => 'Ese cliente no es tuyo.'];
  $usuarios = indexar_(leer_('USUARIOS'), 'id');
  $nombre = fn($id) => txt_($usuarios[txt_($id)]['nombre'] ?? '');
  $caps = [];
  foreach (leer_('CAPTACIONES') as $k) if (mismo_($k['cliente_id'], $cli['id'])) $caps[txt_($k['id'])] = $k;
  $traducir = function (string $campo, string $v) use ($nombre) {
    if (in_array($campo, ['comercial_id', 'captador_id', 'usuario_id'], true) && $v !== '') return $nombre($v) ?: $v;
    if ($campo === 'estado_cita') return etiquetaCatalogo_('estadosCita', $v);
    if ($campo === 'resultado') return etiquetaCatalogo_('resultadosCaptacion', $v);
    if ($campo === 'estado') return etiquetaCatalogo_('estadosCliente', $v);
    if (preg_match('/fecha$/', $campo) && preg_match('/^\d{4}-\d{2}-\d{2}/', $v)) return implode('/', array_reverse(explode('-', substr($v, 0, 10))));
    return $v;
  };
  $filas = [];
  foreach (leer_('CAMBIOS') as $x) {
    if (!mismo_($x['cliente_id'], $cli['id'])) continue;
    /* La nota automática de reagendar o cancelar ya se ve en el motivo y en el cambio de día. */
    if (txt_($x['campo']) === 'notas' && preg_match('/^(\+ )?(Reagendada del|Cancelada el) /u', txt_($x['despues']))) continue;
    $cita = $x['entidad'] === 'CAPTACIONES' ? ($caps[txt_($x['entidad_id'])] ?? null) : null;
    $campo = txt_($x['campo']);
    $filas[] = ['fecha' => txt_($x['fecha']), 'quien' => $nombre($x['usuario_id']) ?: 'Sistema', 'usuario_id' => txt_($x['usuario_id']),
      'que' => $x['entidad'] === 'CAPTACIONES' ? 'Cita' . ($cita ? ' del ' . fechaLarga_($cita['fecha']) : '') : 'Ficha',
      'campo' => $campo, 'nombre_campo' => $campo === 'alta' ? 'Alta' : (NOMBRE_CAMPO[$campo] ?? $campo),
      'antes' => $traducir($campo, txt_($x['antes'])), 'despues' => $traducir($campo, txt_($x['despues']))];
  }
  foreach (leer_('CITAS_CAMBIOS') as $x) {
    if (!mismo_($x['cliente_id'], $cli['id']) || txt_($x['motivo']) === '') continue;
    $filas[] = ['fecha' => txt_($x['creado']), 'quien' => $nombre($x['usuario_id']) ?: 'Sistema', 'usuario_id' => txt_($x['usuario_id']),
      'que' => 'Cita del ' . fechaLarga_($x['fecha_antes']), 'campo' => 'motivo',
      'nombre_campo' => normal_($x['tipo']) === 'cancelada' ? 'Motivo de la cancelación' : 'Motivo del cambio', 'antes' => '', 'despues' => txt_($x['motivo'])];
  }
  usort($filas, fn($a, $b) => strcmp($b['fecha'], $a['fecha']));
  return ['ok' => true, 'cambios' => array_slice($filas, 0, 500)];
}
