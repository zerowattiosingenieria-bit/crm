# Historial de cambios

Qué se ha ido tocando en el CRM y, sobre todo, por qué. Lo de arriba es lo
más reciente.

Esto no sustituye al manual: el manual cuenta cómo se usa el CRM hoy
(`docs/MANUAL.md`), y aquí queda la razón de cada cambio, que es lo que
luego no hay manera de reconstruir.


## 07/10/2026

### La entrada al CRM, bastante más dura de forzar

Cuatro cosas, que juntas cierran casi todo lo que estaba abierto.

Las claves ya no se guardan con una sola pasada de SHA-256, que es
instantánea de probar a lo bruto, sino con cuatro mil. Las que ya estaban
se reescriben reforzadas la primera vez que su dueño entra, sin que nadie
tenga que cambiar nada ni enterarse.

Cinco fallos seguidos cierran la entrada de ese usuario diez minutos, y
cada tanda siguiente el triple, hasta una hora. A dirección le llega un
aviso por correo cuando pasa. Antes solo había una espera de 0,7 segundos
por intento, que da para unos cinco mil intentos por hora.

Una sesión parada dos horas deja de valer, además del tope de doce, y
cambiar la clave echa fuera a quien estuviera dentro con la anterior
—menos a quien la está cambiando, que si no se quedaría en la calle—.
Resetearle la clave a alguien le cierra todo y le olvida los equipos.

Y entrar desde un ordenador o un móvil nuevo pide un código de seis
dígitos que llega al correo de esa persona. Desde un aparato ya conocido
no se pide; los conocidos se ven y se quitan desde Mi perfil. Si un día
el correo falla y deja a alguien fuera, se apaga desde Ajustes con
«dos_pasos» en «no», que para eso está.


## 05/10/2026

### El README lleva al historial

_Sin más detalle._

### El porqué de cada cambio queda en el repositorio

_Sin más detalle._

### Pruebas del cuadre de facturación

_Sin más detalle._

### Aviso automático cuando la facturación no cuadra

_Sin más detalle._

### Pruebas del orden por lo más reciente

_Sin más detalle._

### La pantalla respeta el orden por lo más reciente

_Sin más detalle._

### Las fechas se ordenan como fechas, no como números

_Sin más detalle._

### Las puertas se ordenan en el servidor, de la más nueva a la más vieja

_Sin más detalle._

### Prueba de la hora suelta

_Sin más detalle._

### La hora sale como hora, no como una fecha de 1899

_Sin más detalle._

### Pruebas de exportar, crear, corregir y borrar

_Sin más detalle._

### Botones de exportar y de tocar las fichas y las puertas

_Sin más detalle._

### Excel y PDF sin librerías de fuera

_Sin más detalle._

### Directorio y puertas: alta, edición y borrado desde el CRM

_Sin más detalle._

### Pruebas del cliente con coordenada de fuera

_Sin más detalle._

### La regla de España vale también para los clientes

_Sin más detalle._

### Pruebas de la regla de España

_Sin más detalle._

### Solo España: las puertas de fuera no entran, y las coladas se borran

_Sin más detalle._

### El mapa se encaja donde está el grueso

_Sin más detalle._

### Prueba del aviso de la semana cerrada

_Sin más detalle._

### El aviso de puertas sale solo los lunes

_Sin más detalle._

### Prueba de la puerta sin fecha

_Sin más detalle._

### Las puertas sin fecha se cuentan aparte

_Sin más detalle._

### Una puerta sin fecha no es una puerta de esta semana

_Sin más detalle._

### Pruebas del directorio, los permisos y las puertas nuevas

_Sin más detalle._

### Pantalla del directorio y arreglo del mapa en blanco

_Sin más detalle._

### El directorio entra en el menú

_Sin más detalle._

### El directorio histórico y las puertas tocadas

_Sin más detalle._


## 22/09/2026

### Regenerar el paquete de una sola pieza

_Sin más detalle._

### Pruebas: conceptos cortados y sesiones que no caducan al nacer

_Sin más detalle._

### Ningún gasto se queda sin clasificar

_Sin más detalle._

### Las sesiones ya no nacen caducadas

_Sin más detalle._

### Las sesiones ya no nacen caducadas

_Sin más detalle._

### Ningún gasto se queda sin clasificar

_Sin más detalle._

### Regenerar el paquete de una sola pieza

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._


## 21/09/2026

### Pruebas de la segunda cuenta bancaria

_Sin más detalle._

### Cada apunte del banco sabe de qué cuenta es

_Sin más detalle._

### El banco admite más de una cuenta

_Sin más detalle._

### El banco enseña el saldo de cada cuenta

_Sin más detalle._

### Regenerar el paquete de una sola pieza

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Deshacer el duplicado del archivo

_Sin más detalle._

### Importador del histórico de la empresa

_Sin más detalle._

### Pruebas: comisiones, importador y correo de los viernes

_Sin más detalle._

### Ajustes: cada forma de comisionar con su sitio

_Sin más detalle._

### Cuatro formas de comisionar, no una

_Sin más detalle._

### Cuatro formas de comisionar, no una

_Sin más detalle._

### Al instalar, cada uno nace con su tarifa y su responsable

_Sin más detalle._

### El detalle de comisiones dice por qué se cobra cada una

_Sin más detalle._

### El resumen de los viernes puede ir todo a un solo correo

_Sin más detalle._

### El buzón de pruebas se puede vaciar entre envíos

_Sin más detalle._

### Marcar en la ficha si se bajó el precio de tarifa

_Sin más detalle._

### La nómina cuenta también lo que vende el equipo

_Sin más detalle._

### Los cuatro campos de comisión viajan al navegador

_Sin más detalle._

### Registrar la acción de importar en la API

_Sin más detalle._

### Recortar la cabecera al regenerar el paquete

Sin esto, TODO_EN_UNO.gs ganaba dos lineas en blanco cada vez que se regeneraba.

### La cabecera del paquete ya no engorda

unir.js conservaba la cabecera de la vuelta anterior con las lineas en blanco que le habia dejado el separador, asi que el archivo ganaba dos lineas en cada regeneracion. Ahora se recorta antes de pegar.

### El texto de los cuatro manuales

Bloques compartidos (entrar, vacaciones, nomina, el correo de los viernes) y lo propio de cada papel, con la captura de pantalla debajo del parrafo que la explica.

### La maqueta de los manuales

ReportLab: banda negra con el logo en cada pagina, tipografias, tablas, recuadros de aviso y las capturas de pantalla con su pie.

### Las capturas de los manuales se sacan solas

Recorre el CRM de pruebas con cada rol y guarda 24 capturas recortadas a lo que se ve sin bajar, que es lo que entra en el PDF.

### Cómo se hacen los manuales

Un PDF por perfil, y los dos comandos para regenerarlos con sus capturas.

### Fuera del repositorio los PDF y las capturas

Se regeneran con los comandos del README de docs/manuales.

### Dos comprobaciones para el cargo repetido

Cubren el caso real del extracto: un cargo, su devolucion y el mismo cargo otra vez, con el saldo volviendo al mismo sitio. Y que una repeticion de mas si entra al reimportar. 149 comprobaciones en verde.

### El paquete de una sentada, con los dos arreglos

Regenerado con node pruebas/unir.js: identificadores por lotes y el conteo de repeticiones del banco. Es el mismo codigo que corre ya en Apps Script.

### El banco cuenta las repeticiones en lugar de descartarlas

La clave de un movimiento llevaba fecha, concepto, importe y saldo, dando por hecho que el saldo separa dos apuntes iguales del mismo dia. No siempre: un cargo, su devolucion y el mismo cargo otra vez dejan el saldo igual las dos veces, y los dos son de verdad. En el extracto real habia dos casos asi y el CRM se comia un movimiento de cada par. Ahora se compara cuantas veces aparece cada apunte en el extracto contra cuantas hay guardadas, y solo entra lo que sobra: reimportar el mismo archivo sigue sin duplicar nada.

### Identificadores por lotes al insertar

insertarLote_ pedia un id por fila, cada uno con su propio candado y su escritura en PropertiesService: importar un extracto de 344 apuntes tardaba mas de un minuto y dos importaciones a la vez se pisaban y duplicaban los movimientos. Ahora se reservan todos los ids de una vez. De paso, BANCO, VACACIONES, SESIONES y LOG tienen su propio prefijo en lugar de X.

### Resumen semanal por correo los viernes y correos del equipo

_Sin más detalle._

### README: resumen semanal por correo

_Sin más detalle._

### Manual: el correo de los viernes

_Sin más detalle._

### 147 comprobaciones, con el correo de los viernes

_Sin más detalle._

### Ajustes: quien recibe el resumen semanal y envio a mano

_Sin más detalle._

### README: captaciones adjudicadas, calendario y ruta en coche

_Sin más detalle._

### Manual: adjudicar captaciones, calendario y ruta en coche

_Sin más detalle._

### 135 comprobaciones y prueba de adjudicacion, calendario y ruta

_Sin más detalle._

### Estilos del calendario de visitas

_Sin más detalle._

### Agenda con calendario, adjudicacion de captaciones y boton de ir en coche

_Sin más detalle._

### Calendario mensual reutilizable y enlaces de navegacion en coche

_Sin más detalle._

### Adjudicar la captacion a un comercial sincroniza la cartera del cliente

_Sin más detalle._

### Script que junta el backend en un solo archivo

_Sin más detalle._

### README: el backend tambien viene en un solo archivo

_Sin más detalle._

### Instalacion: la forma rapida con TODO_EN_UNO.gs

_Sin más detalle._

### Backend en un solo archivo para instalar de golpe

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Add files via upload

_Sin más detalle._

### Instalacion: donde quedan las copias y como llegan al Escritorio

_Sin más detalle._

### Simulador de Drive con carpetas anidadas

_Sin más detalle._

### Las copias van dentro de ZERO WATTIOS en el Drive, para que se sincronicen solas

_Sin más detalle._

### README con vacaciones y copias de seguridad

_Sin más detalle._

### Manual e instalacion con vacaciones y copia semanal

_Sin más detalle._

### 109 comprobaciones: vacaciones, copias y cobros

_Sin más detalle._

### Estilos del calendario de vacaciones

_Sin más detalle._

### Menu con vacaciones y pintado sin pisarse entre pantallas

_Sin más detalle._

### Pantalla de vacaciones y copias de seguridad en ajustes

_Sin más detalle._

### Vacaciones con aprobacion, copia de seguridad semanal y recalculo de cobros

_Sin más detalle._

### README con la agenda y las nominas en PDF

_Sin más detalle._

### Manual e instalacion al dia con las nominas en PDF

_Sin más detalle._

### Pruebas de la nomina en PDF y Drive simulado

_Sin más detalle._

### Nominas: subida y descarga del PDF mensual con permisos

_Sin más detalle._

### Pantallas del CRM: panel, agenda, clientes, finanzas, equipo, parte, nominas y mapa

_Sin más detalle._

### Simulador de Apps Script y pruebas automaticas

_Sin más detalle._

### Instalacion paso a paso y manual de uso por rol

_Sin más detalle._

### Iconos de Leaflet

_Sin más detalle._

### Leaflet dentro del repositorio: el mapa no depende de ningun CDN

_Sin más detalle._

### Nucleo de la interfaz: armazon, API, componentes y graficos

_Sin más detalle._

### Logotipo de ZERO WATTIOS e iconos

_Sin más detalle._

### Hoja de estilo del CRM

_Sin más detalle._

### Backend en Apps Script: datos, permisos, finanzas, partes, nominas y mapa

_Sin más detalle._

### CRM de ZERO WATTIOS: raíz del proyecto

_Sin más detalle._
