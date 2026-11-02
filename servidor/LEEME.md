# Servidor: crm.zerowattios.com (IONOS)

Desde el 02/11/2026 el CRM vive en el hosting de IONOS (contrato WordPress
Hosting Expand), con la base de datos en MySQL/MariaDB y el backend en PHP
(carpeta `api/`, traducción función a función de `apps-script/`).

- Espacio web: `/crm` (esta web y `api/`), fuera de la carpeta de WordPress.
- `servidor/zw-crm.php` va en `/wordpress/wp-content/mu-plugins/`: cuando se
  entra por crm.zerowattios.com sirve el CRM y enruta `/api/…` al PHP; para
  cualquier otro dominio no hace nada.
- La base de datos es la del propio WordPress (tablas `zw_*`); la conexión
  sale de sus constantes `DB_*`.
- Lo que solo puede hacer Google (Drive, correo, mapas) lo sigue haciendo el
  proyecto de Apps Script, como servicio (`apps-script/30_Servicio.gs`). Cada
  noche vuelca todas las tablas a la hoja de cálculo de siempre (espejo) y
  cada 10 minutos da el «tic» del reloj del servidor (`api/cron.php`).
- Cada 5 minutos el servidor mira este repositorio y, si hay un commit nuevo
  en `main`, despliega la web y `api/` (`api/desplegar.php`).
- Copias: los viernes JSON + volcado SQL en Drive (BACKUP CRM ZERO WATTIOS),
  espejo diario en la hoja y copia semanal en el Escritorio de Nando.
- Nunca se indexa: robots.txt, cabecera X-Robots-Tag y meta noindex.
