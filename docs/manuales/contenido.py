# -*- coding: utf-8 -*-
"""El texto de cada manual. Un archivo por papel dentro de la empresa."""

from generar import construir, WEB

ENTRAR = [
    ('h2', 'Entrar en el CRM'),
    ('p', 'El CRM se abre en <b>' + WEB + '</b> desde cualquier ordenador o móvil, sin instalar nada. '
          'La primera vez, en ese mismo dispositivo, hay que pulsar <b>Configurar servidor</b>, pegar la '
          'dirección que te pase Fernando o Rubén y guardar. Eso se hace una vez por dispositivo.'),
    ('p', 'Entras con tu usuario (tu nombre en minúsculas, sin acentos) y la clave de diez caracteres que '
          'te han dado en mano. La sesión dura doce horas.'),
    ('caja', 'Lo primero que tienes que hacer',
     'Entrar y cambiar la clave desde <b>Mi perfil</b>. La inicial la conoce quien te la dio; la tuya, solo tú. '
     'Mínimo ocho caracteres.'),
    ('p', 'En el móvil conviene añadirlo a la pantalla de inicio: se abre como una aplicación y el menú se '
          'despliega con el botón de arriba a la izquierda.'),
    ('img', 'acceso',
     'La pantalla de entrada. Si es la primera vez en ese aparato, primero <b>Configurar servidor</b>; después, usuario y clave.'),
]

VACACIONES = [
    ('h2', 'Vacaciones'),
    ('p', 'Tienes <b>22 días laborables</b> al año. En <b>Vacaciones</b> aparece el calendario entero: pulsas '
          'el primer día, luego el último, y abajo te dice cuántos días laborables son y te deja pedirlos. '
          'Los fines de semana y los festivos no cuentan ni se pueden marcar.'),
    ('p', 'Los días quedan <b>pendientes hasta que Rubén o Fernando los aprueben</b>. Mientras tanto se ven en '
          'ámbar; aprobados, en verde. En azul salen los días que ya tiene aprobados otra persona del equipo, '
          'para que no pidáis todos lo mismo. Puedes retirar una petición tuya mientras no haya pasado.'),
    ('img', 'comercial-vacaciones',
     'El calendario de vacaciones: marcas el primer día y el último, y abajo te dice cuántos laborables son antes de pedirlos.'),
]

NOMINA = [
    ('h2', 'Tu nómina'),
    ('p', 'En <b>Mi nómina</b> están los PDF que sube dirección cada mes: se abren con el botón <b>Ver PDF</b> '
          'y se pueden guardar. Nadie más que tú y dirección puede abrirlos.'),
    ('p', 'Debajo, plegado, hay un desglose día a día que calcula el propio CRM con el sueldo prorrateado, las '
          'dietas y las comisiones que te han caído cada jornada. Sirve para cuadrar; la nómina buena es '
          'siempre el PDF.'),
    ('img', 'comercial-nomina',
     'Tus nóminas por meses. El PDF es el documento bueno; el desglose de abajo es solo para cuadrar.'),
]

VIERNES = [
    ('h2', 'El correo de los viernes'),
    ('p', 'Cada viernes sobre las 18:00 recibes en tu correo un resumen de la semana: tus números, cómo vas '
          'contra tu objetivo, lo que tienes por delante la semana siguiente y una frase para cerrar. No hay '
          'que contestarlo; está para que el lunes sepas por dónde seguir.'),
]

# ---------------------------------------------------------------- comercial
comercial = ENTRAR + [
    ('h2', 'Qué ves y qué no'),
    ('p', 'Ves <b>solo tus clientes</b>: los que das de alta tú y los que los captadores te adjudican. Los de '
          'los demás comerciales no aparecen, ni ellos ven los tuyos. De cada cliente tuyo lo ves todo: '
          'vivienda, consumo, perfil, historial, instalación, importes, componentes, fechas y cobros.'),
    ('p', 'No ves la contabilidad de la empresa, ni el banco, ni los márgenes, ni el mapa general, ni las '
          'nóminas de nadie más. No es desconfianza: cada uno trabaja con lo suyo y el CRM lo aplica en el '
          'servidor, no escondiendo botones.'),

    ('h2', 'Tu día'),
    ('h3', 'Panel'),
    ('p', 'Lo primero que ves al entrar: ventas del periodo contra tu objetivo, facturado, cartera viva, '
          'sentadas, conversión y comisiones. Debajo, tus próximos pasos y los clientes que se están '
          'enfriando.'),
    ('img', 'comercial-panel',
     'El panel de un comercial: objetivo del periodo, próximos pasos y los clientes que llevan tiempo sin contacto.'),
    ('h3', 'Agenda'),
    ('p', 'Un calendario del mes con un punto por cada cosa que hay ese día: verde las sentadas concertadas, '
          'azul los seguimientos y lima las instalaciones previstas. Pulsas un día y se abre lo que toca. '
          'Debajo, lo mismo repartido en vencido, hoy, esta semana y más adelante.'),
    ('p', 'En cada línea tienes tres botones: <b>Llamar</b>, el <b>botón del coche</b>, que abre Google Maps con la '
          'ruta hasta la vivienda lista para arrancar, y <b>Apuntar</b>, para dejar constancia de lo que ha '
          'pasado.'),
    ('img', 'comercial-agenda',
     'La agenda con el calendario del mes. Cada punto es algo que hay ese día; pulsándolo se abre lo que toca.'),
    ('h3', 'Ficha del cliente'),
    ('p', 'Desde la ficha se llama, se manda un WhatsApp, se abre el mapa, se arranca la navegación en coche, '
          'se edita, se apunta un contacto o se crea la instalación. Las pestañas separan el resumen, las '
          'instalaciones, el historial de contactos, la vivienda y el consumo, y la ficha de captación si '
          'venía de puerta fría.'),
    ('img', 'comercial-ficha',
     'La ficha de un cliente, con sus pestañas y los botones de llamar, WhatsApp e ir en coche.'),
    ('caja', 'Apuntar un contacto no es papeleo',
     'Cada llamada o visita apuntada actualiza sola el estado del cliente y su próxima acción. Es lo que hace '
     'que la agenda del lunes tenga sentido y que nadie se quede sin seguimiento.'),

    ('h2', 'La instalación'),
    ('p', 'En la instalación se guardan los importes por partida (fotovoltaica, aerotermia, baterías, cargador '
          'y extras), el IVA, las ayudas y el CAE, la forma de pago con su financiera, plazo y cuota, las '
          'fechas de todo el proceso y los componentes reales: número y modelo de paneles, inversor, batería, '
          'kW de aerotermia, depósitos y cubierta.'),
    ('p', 'Si la venta es al contado, el calendario de cobros <b>50 / 25 / 25</b> se crea solo al guardar. Si '
          'luego cambias el importe y todavía no ha entrado dinero, el CRM lo rehace para que no quede '
          'descuadrado.'),
    ('img', 'comercial-instalaciones',
     'Tus instalaciones, con importe, estado y fechas de cada una.'),

    ('h2', 'El parte del día'),
    ('p', 'Al terminar la jornada, en <b>Parte del día</b>: cuántas sentadas has tenido y con quién (se eligen '
          'de tu lista de clientes), ventas cerradas e importe, y un resumen escrito en lenguaje normal.'),
    ('p', 'Nombra a los clientes tal y como están en el CRM. Por ejemplo: <i>«He estado con Marta Sanz y '
          'firmamos el contrato. Óscar se lo piensa, le vuelvo a llamar el lunes. A Javier Nieto le he enviado '
          'la propuesta, llamar para cerrar el 12/12.»</i>'),
    ('p', 'El CRM lee ese texto y propone: Marta pasa a ganado, Óscar a negociando con llamada para el lunes '
          'que viene y Javier a propuesta con llamada de cierre el 12 de diciembre. <b>Propone; no cambia '
          'nada hasta que lo marcas.</b> Desmarcas lo que no cuadre y pulsas aplicar: cada cambio deja además '
          'su apunte en el historial del cliente.'),
    ('caja', 'Dos minutos bien pagados',
     'El parte es lo que mantiene el CRM al día sin teclear fichas una por una, y es de donde salen tus '
     'sentadas, tu conversión y el resumen de los viernes.'),
    ('img', 'comercial-parte',
     'El parte del día: sentadas, ventas y el resumen escrito que el CRM lee para proponerte los cambios de estado.'),

    ('h2', 'Tu resumen'),
    ('p', 'En <b>Mi resumen</b> tienes ventas contra objetivo del periodo (del 16 al 15), cartera viva, '
          'conversión de propuesta a venta, comisiones devengadas con su detalle, próximas acciones y los '
          'clientes que llevan más de quince días sin contacto.'),
    ('img', 'comercial-resumen',
     'Mi resumen: cómo vas contra el objetivo y qué comisiones llevas devengadas en el periodo.'),
] + VACACIONES + NOMINA + VIERNES + [
    ('h2', 'Preguntas rápidas'),
    ('p', '<b>¿Puedo sacar los datos a Excel?</b> Sí, casi todas las tablas tienen <i>Exportar CSV</i> y el '
          'archivo se abre directamente en Excel.'),
    ('p', '<b>He olvidado la clave.</b> El superadmin genera una nueva desde Usuarios. Nadie puede ver la '
          'anterior: en la base de datos solo se guarda su huella cifrada.'),
    ('p', '<b>Un cliente mío lo lleva ahora otro.</b> Eso lo cambia dirección desde la ficha del cliente; en '
          'cuanto lo hace, deja de aparecerte a ti.'),
]

# ---------------------------------------------------------------- captador
captador = ENTRAR + [
    ('h2', 'Qué ves y qué no'),
    ('p', 'Ves <b>solo los clientes que has captado tú</b>, con toda su información y su estado: si llegó a '
          'sentada, si se vendió o si se cayó. Así sabes qué pasa con cada puerta que abriste.'),
    ('p', 'No ves la contabilidad, ni el banco, ni los márgenes, ni el mapa general, ni las nóminas de nadie '
          'más.'),
    ('img', 'captador-panel',
     'El panel de un captador: fichas del periodo, citas y qué ha pasado con lo que has captado.'),

    ('h2', 'La ficha de captación'),
    ('p', 'En <b>Mis captaciones &gt; + Nueva ficha</b> se rellena lo de la puerta: propietarios, teléfono, '
          'dirección y coordenadas, lo que gastan hoy en luz y combustible, la cita concertada, la tecnología '
          'que les interesa y el perfil del cliente. Al guardar se crea el cliente y la cita de una vez.'),
    ('h3', 'Adjudicar la ficha a un comercial'),
    ('p', 'El botón <b>Adjudicar</b> (o <b>Cambiar</b>) de cada fila decide qué comercial la lleva. Esto es lo '
          'importante: <b>un comercial solo ve las captaciones que se le han adjudicado</b>. Mientras la ficha '
          'no tenga comercial, no aparece en la cartera de nadie más que la tuya, y arriba ves cuántas están '
          '<i>sin adjudicar</i>.'),
    ('p', 'Desde ahí también se cambia el día y la hora de la visita y se dejan notas para el comercial.'),
    ('img', 'captador-captaciones',
     'Mis captaciones. El botón de adjudicar decide qué comercial la lleva; arriba ves cuántas siguen sin adjudicar.'),
    ('caja', 'Tu trabajo se mide por lo que pasa después',
     'El CRM sigue cada ficha hasta el final: cuántas llegan a sentada, cuántas acaban en venta y cuántas se '
     'caen. Esa es tu conversión, y de ahí salen tus comisiones por captación vendida.'),

    ('h2', 'El parte del día'),
    ('p', 'Al terminar la jornada, en <b>Parte del día</b>: cuántas puertas has tocado y cuántas visitas has '
          'hecho. Las fichas subidas se cuentan solas. El resumen escrito lo lee dirección: zona trabajada, '
          'qué te has encontrado, casas a las que hay que volver.'),
    ('img', 'captador-parte',
     'El parte del día de un captador: puertas, visitas y el resumen de la zona trabajada.'),

    ('h2', 'Tu resumen'),
    ('p', 'En <b>Mi resumen</b>: fichas del periodo contra tu objetivo, citas confirmadas, cuántas llegan a '
          'sentada, cuántas acaban en venta y las comisiones devengadas, con el mes a mes.'),
    ('img', 'captador-resumen',
     'Mi resumen: de cada ficha, hasta dónde llegó.'),

    ('h2', 'Agenda'),
    ('p', 'Un calendario del mes con las citas que has concertado y todo lo que tenga fecha, avisando de lo '
          'que ya venció. En cada línea, botón de llamar, el <b>botón del coche</b> para arrancar la navegación hasta '
          'la vivienda y el de apuntar el contacto.'),
] + VACACIONES + NOMINA + VIERNES + [
    ('h2', 'Preguntas rápidas'),
    ('p', '<b>¿Y si no sé aún qué comercial la llevará?</b> Guarda la ficha sin adjudicar: seguirá siendo tuya '
          'y no la verá ningún comercial hasta que la asignes.'),
    ('p', '<b>He olvidado la clave.</b> El superadmin genera una nueva desde Usuarios.'),
]

# ---------------------------------------------------------------- dirección
direccion = ENTRAR + [
    ('h2', 'Qué ves'),
    ('p', 'Todo: los clientes de todo el mundo, las instalaciones, la contabilidad, el banco, las facturas, '
          'los cobros, los gastos, el equipo, los partes, las nóminas, las vacaciones y el mapa. Lo único '
          'reservado al superadmin es dar de alta usuarios y generar claves.'),

    ('h2', 'Panel'),
    ('p', 'Facturación del año, margen, beneficio neto, pendiente de cobro, cartera y ticket medio; evolución '
          'mensual; avisos de cobros vencidos, facturas pasadas de fecha y propuestas dormidas; el embudo del '
          'año y las próximas instalaciones.'),
    ('img', 'direccion-panel',
     'El panel de dirección: el año de un vistazo, los avisos que piden una llamada y lo que viene.'),

    ('h2', 'Contabilidad'),
    ('p', 'Es el corazón financiero. Arriba, ingresos sin IVA, costes directos, margen bruto, estructura, '
          'beneficio neto y caja del periodo. Debajo, cuatro cosas que conviene mirar cada semana:'),
    ('tabla', [
        ['Bloque', 'Para qué sirve'],
        ['Tabla de salud', 'Diez indicadores con su valor, su objetivo y un semáforo: margen, beneficio, caja '
                           'a 30 días, cobros vencidos, desvío de cobro, pendiente de cobro sobre pendiente de '
                           'pago, peso del mayor cliente, ticket medio, punto de equilibrio y conversión.'],
        ['Qué hacer ahora', 'Consejos concretos ordenados por urgencia, sacados de los indicadores que estén '
                            'en rojo. No son frases hechas: salen de tus números.'],
        ['Tesorería prevista', 'Lo que entra, lo que sale y lo que queda a 30, 60 y 90 días, contando el coste '
                               'fijo. Solo con lo ya comprometido.'],
        ['Cuenta de cada instalación', 'Ingreso, coste, margen, porcentaje, cobrado, pendiente y el beneficio '
                                       'no económico que se haya apuntado, obra por obra.'],
    ], [42*2.83, 128*2.83]),
    ('img', 'direccion-contabilidad',
     'Contabilidad: la tabla de salud con su semáforo y, al lado, qué conviene hacer esta semana.'),

    ('h2', 'Banco'),
    ('p', 'Se descarga el extracto del banco en CSV y se sube con <b>Importar extracto</b>. El CRM reconoce las '
          'columnas aunque vengan en otro orden, no duplica lo que ya estaba y clasifica cada movimiento solo: '
          'nóminas, Seguridad Social, proveedores, impuestos, teléfono, seguros, combustible… Si algo está mal, '
          'se cambia la categoría en la propia fila y esa corrección manda sobre las reglas.'),
    ('p', 'De ahí salen el saldo real, las entradas y salidas de cada mes y el <b>coste real de estructura</b>, '
          'que es lo que cuesta tener la empresa abierta al margen de las obras. Si no coincide con el de '
          'Ajustes, sale un aviso con un botón para ponerlo al día: de ese número dependen el beneficio neto y '
          'el punto de equilibrio.'),
    ('p', 'Cada entrada de dinero se puede casar con un cobro pendiente —el CRM propone primero los de importe '
          'parecido— y cada salida se puede pasar a gasto de una instalación, ya como pagada.'),
    ('img', 'direccion-banco',
     'El banco después de importar el extracto: saldo real, movimientos clasificados y coste de estructura.'),

    ('h2', 'Facturas, cobros y gastos'),
    ('p', 'Facturas con numeración automática, cobros que se marcan con un botón y gastos por instalación o '
          'generales. En cobros, lo vencido sale en rojo: es la lista de llamadas de los lunes.'),
    ('img', 'direccion-cobros',
     'Cobros: lo vencido en rojo es por donde se empieza el lunes.'),

    ('h2', 'Equipo'),
    ('p', 'Ranking de comerciales y captadores con sus conversiones, objetivos y comisiones; embudo del '
          'periodo, municipios donde se cierra, motivos de pérdida y mezcla de producto. Pulsando una fila se '
          'abre el resumen completo de esa persona.'),
    ('p', 'En <b>Partes diarios</b> está lo que ha enviado el equipo cada día, con su resumen escrito, y quién '
          'no lo ha enviado.'),
    ('img', 'direccion-equipo',
     'Equipo: cómo va cada uno contra su objetivo, con su conversión y sus comisiones.'),

    ('h2', 'Mapa'),
    ('p', 'Todos los clientes visitados sobre el mapa, con filtros por estado, municipio, comercial, captador, '
          'interés y fecha, capa de calor por gasto energético y la ficha completa al pulsar un punto, con '
          'botón para ir en coche. La tabla de zonas dice la conversión de cada municipio: dónde merece la '
          'pena mandar a los captadores.'),
    ('p', 'Si hay clientes con dirección pero sin coordenadas, el botón <i>Buscar coordenadas que faltan</i> '
          'las localiza de veinte en veinte.'),
    ('img', 'direccion-mapa',
     'El mapa de clientes visitados, con filtros y la conversión por municipio.'),

    ('h2', 'Vacaciones: tu parte'),
    ('p', 'Las vacaciones que pide el equipo <b>no valen hasta que tú o Rubén las aprobéis</b>. En la pantalla '
          'de Vacaciones, arriba del todo, salen las peticiones pendientes con los botones de aprobar o '
          'denegar; al denegar hay que explicar el motivo, que le llega a la persona en su lista. Al aprobar, '
          'esos días quedan marcados como vacaciones en el calendario de su nómina.'),
    ('img', 'direccion-vacaciones',
     'Las peticiones pendientes salen arriba del todo, con aprobar y denegar a mano.'),

    ('h2', 'Nóminas'),
    ('p', 'Cada mes subís el PDF de la nómina de cada persona: se elige de quién es, el mes, el archivo y, si '
          'queréis, el neto y la fecha de pago. El PDF queda en el Drive de la empresa <b>sin compartir</b>: '
          'solo esa persona y vosotros podéis abrirlo desde el CRM. Si se vuelve a subir el mismo mes, '
          'sustituye al anterior.'),
    ('p', 'Debajo queda el devengo día a día que calcula el CRM, útil para cuadrar comisiones antes de hacer '
          'la nómina: se cuentan del 16 del mes anterior al 15 de este.'),
    ('img', 'direccion-nominas',
     'Subir la nómina del mes: persona, mes, PDF y, si queréis, neto y fecha de pago.'),

    ('h2', 'Lo que hace el CRM solo'),
    ('tabla', [
        ['Cuándo', 'Qué pasa'],
        ['Viernes 18:00', 'Cada persona recibe por correo su resumen de la semana; vosotros, además, las '
                          'cuentas de la casa, cómo ha ido cada uno y quién no ha enviado partes.'],
        ['Viernes 19:15', 'Copia de seguridad completa (Excel + volcado) en el Drive de la empresa, borrando '
                          'sola lo que pase de tres meses. Una tarea programada la deja también en el '
                          'Escritorio del ordenador de la oficina.'],
        ['Al firmar al contado', 'Se crea el calendario de cobros 50 / 25 / 25.'],
        ['Al aprobar vacaciones', 'Los días quedan marcados en el calendario de la nómina de esa persona.'],
        ['Al apuntar un contacto', 'Cambia el estado del cliente y su próxima acción.'],
    ], [35*2.83, 135*2.83]),

    ('h2', 'Ajustes'),
    ('p', 'Datos de la empresa, IVA, coste de estructura, margen objetivo, comisiones, objetivos y tarifas de '
          'venta. De aquí salen los cálculos de toda la casa, así que conviene repasarlo cuando cambien los '
          'precios. Ahí abajo están también quién recibe el resumen semanal y las copias de seguridad '
          'guardadas, con un botón para hacer una a mano.'),
    ('p', 'En <b>Registro</b> queda quién ha hecho qué y cuándo.'),
    ('img', 'direccion-ajustes',
     'Ajustes: precios, comisiones y objetivos, más el resumen semanal y las copias de seguridad.'),
] + VACACIONES + VIERNES

# ---------------------------------------------------------------- superadmin
superadmin = ENTRAR + [
    ('h2', 'Qué puedes hacer tú y nadie más'),
    ('p', 'Ves todo lo que ve dirección y, además, eres el único que da de alta usuarios, cambia sus '
          'condiciones y genera claves.'),

    ('h2', 'Usuarios'),
    ('p', 'En <b>Usuarios</b> están las seis personas del CRM con su rol, su correo, su sueldo, sus dietas, su '
          'IRPF, sus comisiones y su objetivo mensual. Desde ahí se da de alta a alguien nuevo, se le cambian '
          'las condiciones o se le desactiva cuando se va: desactivar conserva su histórico; borrar no hace '
          'falta nunca.'),
    ('caja', 'Las claves se enseñan una sola vez',
     'Al crear un usuario o pulsar <b>Nueva clave</b>, la clave aparece en pantalla una única vez. Apúntala y '
     'pásala en mano. En la base de datos solo queda su huella cifrada: ni tú ni nadie puede recuperarla '
     'después.'),
    ('tabla', [
        ['Rol', 'Qué abre'],
        ['Superadmin', 'Todo, más el alta de usuarios y las claves.'],
        ['Administrador', 'Todo menos usuarios: contabilidad, banco, equipo, nóminas, vacaciones y mapa.'],
        ['Comercial', 'Solo sus clientes e instalaciones, su parte, su resumen, su nómina y sus vacaciones.'],
        ['Captador', 'Solo sus captaciones y clientes, su parte, su resumen, su nómina y sus vacaciones.'],
    ], [32*2.83, 138*2.83]),
    ('img', 'superadmin-usuarios',
     'Usuarios: alta, condiciones y el botón de nueva clave.'),

    ('h2', 'Si algo se tuerce'),
    ('p', '<b>Alguien no puede entrar.</b> Comprueba que su usuario está activo y genérale una clave nueva. Si '
          'la pantalla no carga, que revise la dirección del servidor en <i>Configurar servidor</i>.'),
    ('p', '<b>Hay que recuperar datos.</b> Cada viernes hay una copia completa en el Drive de la empresa '
          '(Excel y volcado JSON) y otra en el Escritorio del ordenador de la oficina. Además, la hoja de '
          'cálculo guarda su propio historial de versiones.'),
    ('img', 'superadmin-registro',
     'El registro de actividad: quién ha hecho qué y cuándo.'),
    ('p', '<b>Hay que tocar el código.</b> Todo está en github.com/zerowattiosingenieria-bit/crm, con el '
          'manual de instalación paso a paso en docs/INSTALACION.md.'),
] + VIERNES

MANUALES = [
    ('Comercial', 'Nando y Rober', comercial, 'Manual_CRM_Comercial.pdf'),
    ('Captador', 'Sandra y Abraham', captador, 'Manual_CRM_Captador.pdf'),
    ('Dirección', 'Rubén y Fernando', direccion, 'Manual_CRM_Direccion.pdf'),
    ('Superadmin', 'Administración del sistema', superadmin, 'Manual_CRM_Superadmin.pdf'),
]

if __name__ == '__main__':
    for rol, personas, bloques, archivo in MANUALES:
        ruta = construir(rol, personas, bloques, archivo)
        print('generado:', ruta)
