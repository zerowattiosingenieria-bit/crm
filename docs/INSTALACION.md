# Puesta en marcha

Hay que hacerlo una sola vez y lleva unos veinte minutos. Todo se hace con la
cuenta **zerowattiosingenieria@gmail.com**, que es la dueña de la base de
datos.

## 1. Crear el proyecto de Apps Script

1. Entra en https://script.google.com con la cuenta de la empresa.
2. **Nuevo proyecto** y ponle de nombre `CRM · ZERO WATTIOS`.
3. Borra el contenido del archivo `Código.gs` que viene por defecto.
4. Copia, uno a uno, los once archivos de la carpeta `apps-script/` de este
   repositorio. Para cada uno: **+** junto a *Archivos* → *Secuencia de
   comandos* → le pones el mismo nombre que tiene aquí (sin la extensión
   `.gs`) y pegas dentro todo el contenido.

   El orden no importa, pero los nombres sí, porque así se entienden luego:
   `00_Config`, `01_Base`, `02_Instalar`, `03_Auth`, `04_Clientes`,
   `05_Finanzas`, `06_Partes`, `07_Resumen`, `08_Nominas`, `09_Mapa`,
   `10_Api`.

5. Guarda con el icono del disquete.

## 2. Crear la base de datos

1. Arriba, en el desplegable de funciones, elige **instalar** y pulsa
   **Ejecutar**.
2. Google pedirá permisos la primera vez: *Revisar permisos* → elige la cuenta
   → *Configuración avanzada* → *Ir a CRM · ZERO WATTIOS (no seguro)* →
   *Permitir*. Es tu propio proyecto: ese aviso es el normal de Google para
   los scripts sin verificar.
3. Al acabar, en el **Registro de ejecución** aparecen las siete claves
   iniciales, una por usuario. Cópialas ahora.
4. La hoja de cálculo se ha creado en el Drive de la cuenta con el nombre
   *CRM · ZERO WATTIOS — Base de datos*. Ejecuta la función **abrirBase** si
   quieres su dirección. Dentro hay una pestaña `CLAVES_INICIALES` con las
   mismas claves: **bórrala en cuanto cada uno haya entrado y cambiado la
   suya**.

## 3. Publicar la aplicación web

1. Arriba a la derecha: **Implementar** → **Nueva implementación**.
2. En el engranaje, tipo **Aplicación web**.
3. Rellena así:
   - Descripción: `CRM v1`
   - Ejecutar como: **Yo** (la cuenta de la empresa)
   - Quién tiene acceso: **Cualquier usuario**
4. **Implementar** y copia la **URL de la aplicación web**. Termina en
   `/exec`.

> «Cualquier usuario» significa que la dirección responde a quien la conozca;
> el que decide qué se puede ver y hacer es el usuario y la clave del CRM, que
> se comprueban en el servidor en cada petición.

Cada vez que cambies el código del backend hay que **Implementar → Gestionar
implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar**.
Si creas una implementación nueva en lugar de editar la existente, cambia la
dirección y habría que volver a configurarla en el CRM.

## 4. Publicar la web en GitHub Pages

El repositorio `crm` de la cuenta `zerowattiosingenieria-bit` ya trae todo lo
necesario. En GitHub: **Settings → Pages → Source: Deploy from a branch →
Branch: `main` / carpeta `/ (root)` → Save**. En un par de minutos la web
queda en https://zerowattiosingenieria-bit.github.io/crm/

## 5. Primer arranque

1. Abre la web. Debajo del botón de entrar, pulsa **Configurar servidor**,
   pega la URL que termina en `/exec` y dale a **Guardar dirección**. Esto se
   guarda en ese dispositivo; hay que hacerlo una vez en cada móvil u
   ordenador.

   Si prefieres que no haya que configurarlo en cada dispositivo, escribe la
   dirección directamente en el código: en `assets/js/api.js`, primera
   constante, `ENDPOINT_POR_DEFECTO`.

2. Entra con `superadmin` y su clave inicial.
3. En **Usuarios**, repasa los seis usuarios, ajusta sueldos, comisiones y
   objetivos, y reparte las claves en mano.
4. Cada persona entra y cambia su clave en **Mi perfil**.
5. En **Ajustes**, revisa el IVA, el coste de estructura mensual, las tarifas
   y las comisiones: de ahí salen los cálculos de margen y de salud
   financiera.

## 6. Nóminas en PDF

La primera vez que dirección suba una nómina, Apps Script pedirá permiso para
usar Google Drive. Se crea sola una carpeta llamada *NÓMINAS · CRM ZERO
WATTIOS* en el Drive de la cuenta de la empresa. Los PDF se guardan ahí **sin
compartir con nadie**: el CRM los entrega solo a su dueño o a dirección, y
nunca por un enlace público.

## 7. Copia de seguridad semanal

En el editor de Apps Script, ejecuta una vez la función
**instalarDisparadores**. A partir de ahí, todos los viernes sobre las 19:15
el CRM guarda solo una copia completa en *ZERO WATTIOS / BACKUP CRM ZERO
WATTIOS* dentro del Drive de la empresa: el Excel de la base de datos y un
volcado JSON con todas las tablas. Las copias de más de tres meses se borran
solas. Como esa carpeta está sincronizada con Google Drive en el ordenador de
la oficina, las copias aparecen allí solas; además, una tarea programada de
Claude las deja cada viernes en el Escritorio, en *BACKUP CRM ZERO WATTIOS*, y
limpia allí lo que pase de tres meses.

Comprueba que el proyecto tiene la zona horaria de Madrid: en Apps Script,
**Configuración del proyecto → Zona horaria → (GMT+01:00) Madrid**. Si no, el
disparador saltaría a otra hora.

Desde el CRM, en *Ajustes*, dirección ve las copias guardadas y puede lanzar
una a mano.

## 8. Datos de ejemplo (opcional)

Para ver el CRM lleno antes de meter clientes de verdad, ejecuta la función
**cargarDemo** desde el editor de Apps Script. Crea dieciséis clientes
ficticios con sus instalaciones, cobros y gastos. Cuando quieras empezar en
limpio, ejecuta **borrarDemo**: vacía las tablas de trabajo y deja usuarios y
configuración intactos.

## 9. Y además

La hoja de cálculo guarda su propio historial de versiones (*Archivo →
Historial de versiones*), que sirve para recuperar un cambio concreto sin
tocar la copia semanal.

## Mantenimiento

- **Cambiar la clave de alguien sin entrar en el CRM:** en Apps Script,
  función `regenerarClave`, escribiendo el usuario entre comillas dentro de la
  función o llamándola desde el editor; la nueva clave sale en el registro.
- **Añadir una columna nueva a una tabla:** se añade en `00_Config.gs`
  (`ESQUEMA`) y se vuelve a ejecutar `instalar()`. Respeta lo que ya hay.
- **Ver quién ha hecho qué:** pestaña `LOG` de la hoja, o **Registro** dentro
  del CRM.
- **Si alguien dice que no le carga:** que compruebe la dirección del servidor
  en *Configurar servidor*; si la implementación se recreó, la dirección
  cambió.
