<?php
/* Prueba rápida (sin base de datos) de las mejoras 6, 7 y 11 del 28/11/2026:
   php pruebas/tareas_y_duplicados.php */
require __DIR__ . '/../api/base.php';
function veCliente_($u, $c) { return true; }
require __DIR__ . '/../api/ficha.php';
require __DIR__ . '/../api/tareas_auto.php';
$fallos = 0;
$ok = function ($nombre, $cond) use (&$fallos) { echo ($cond ? '  ok · ' : '  FALLA · ') . $nombre . "\n"; if (!$cond) $fallos++; };

echo "== Tareas repetidas ==\n";
$ok('misma visita con distinta fecha', claveTarea_('Apuntar resultado de la visita: Calle Ejemplo 37 (11/11 18:00)') === claveTarea_('Apuntar resultado visita Calle Ejemplo 37 (repetida)'));
$ok('Sta. = Santa', claveTarea_('Apuntar resultado visita Sta. Ana del Prado 8 (05/11)') === claveTarea_('Apuntar resultado de la visita del 05/11 18:00 · C. Santa Ana del Prado 8'));
$ok('calles distintas no se juntan', claveTarea_('Apuntar resultado de la visita · Av. Uno, 40') !== claveTarea_('Apuntar resultado de la visita · C. Valle Dos, 25'));

echo "== Tarea de un cliente por su calle ==\n";
$cli = ['id' => 'C-1', 'direccion' => 'PINTOR GOYA, 7 28000'];
$ok('Pintor Goya 7 sí', tareaDeCliente_(['cliente_id' => '', 'titulo' => 'Cobrar fancoils Pintor Goya 7 (3.865 €)'], $cli));
$ok('Pintor Goya 71 no', !tareaDeCliente_(['cliente_id' => '', 'titulo' => 'Pintor Goya 71: algo'], $cli));
$ok('Valle de/del Pinar', tareaDeCliente_(['cliente_id' => '', 'titulo' => 'Llamar al cliente · Valle de Pinar 3'], ['id' => 'C-3', 'direccion' => 'VALLE DEL PINAR, 3']));

echo "== Fichas repetidas ==\n";
$L = [['id' => 'C-900001', 'nombre' => 'JUAN - casa', 'telefono' => '', 'direccion' => 'VALLE DEL PINAR, 3', 'municipio' => 'Pueblo Uno', 'otros' => '', 'proxima_accion' => ''],
      ['id' => 'C-900002', 'nombre' => 'Cliente B', 'telefono' => '600000002', 'direccion' => 'C. Camino Ancho 42', 'municipio' => 'Pueblo Dos', 'otros' => '', 'proxima_accion' => '']];
$d = buscarDuplicado_(['nombre' => 'Juan Teléfono: 600000001', 'telefono' => '', 'direccion' => 'Calle Pinar (Pueblo Uno)', 'municipio' => 'Pueblo Uno'], null, $L);
$ok('calle sin número = posible duplicado', ($d['cliente']['id'] ?? '') === 'C-900001' && !empty($d['posible']));
$d = buscarDuplicado_(['nombre' => 'x', 'telefono' => '', 'direccion' => 'Camino Ancho, 42', 'municipio' => 'Pueblo Dos de Madrid'], null, $L);
$ok('municipio escrito distinto sigue siendo la misma casa', ($d['por'] ?? '') === 'dirección');
$ok('teléfono escrito en el nombre', in_array('600000001', telefonosDe_(['nombre' => 'Cliente Teléfono: 600 000 001']), true));
$ok('número distinto no es duplicado', buscarDuplicado_(['nombre' => 'x', 'telefono' => '', 'direccion' => 'Camino Ancho, 44', 'municipio' => 'Pueblo Dos'], null, $L) === null);

echo $fallos ? "\n$fallos fallos\n" : "\nTodo bien\n";
exit($fallos ? 1 : 0);
