<?php
/**
 * Plugin Name: ZERO WATTIOS · CRM en crm.zerowattios.com
 * Description: Sirve el CRM interno (carpeta /crm del espacio web, fuera de WordPress) cuando se entra por crm.zerowattios.com, las apps de clientes (clientes.zerowattios.com) y de subcontratas (contratas.zerowattios.com), enruta /api/ al backend PHP y lanza las tareas programadas. Nada de esto es indexable.
 * Version: 2.2
 */

if (!defined('ABSPATH')) exit;

define('ZW_CRM_HOST', 'crm.zerowattios.com');
define('ZW_CRM_RAIZ', dirname(ABSPATH) . '/crm');
/* Las dos apps de fuera: misma carpeta, mismo backend, otra puerta. */
define('ZW_PORTALES', ['clientes.zerowattios.com' => 'cliente', 'contratas.zerowattios.com' => 'contrata']);

/* ---------- tareas programadas ----------
   El reloj principal es el Apps Script, que llama a /api/cron cada 10 min.
   Además, cuando alguien usa el CRM y hace más de 5 min del último tic,
   se lanza uno al terminar de responder (sin que el usuario espere). */

function zw_crm_tic_si_toca($raiz) {
    $marca = $raiz . '/api/.ultimo_tic';
    if (is_file($marca) && time() - filemtime($marca) < 300) return;
    if (!is_file($raiz . '/api/cron.php')) return;
    @touch($marca);
    register_shutdown_function(function () use ($raiz) {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        try {
            require_once $raiz . '/api/cargar.php';
            require_once $raiz . '/api/cron.php';
            ejecutarCron_($raiz);
        } catch (Throwable $e) { error_log('CRM tic: ' . $e->getMessage()); }
    });
}

/* ---------- servir el CRM ---------- */

function zw_crm_tipo_mime($ext) {
    $tipos = [
        'html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
        'mjs' => 'text/javascript; charset=utf-8', 'css' => 'text/css; charset=utf-8',
        'json' => 'application/json; charset=utf-8', 'webmanifest' => 'application/manifest+json',
        'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif',
        'svg' => 'image/svg+xml', 'ico' => 'image/x-icon', 'webp' => 'image/webp',
        'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf', 'txt' => 'text/plain; charset=utf-8',
        'map' => 'application/json', 'pdf' => 'application/pdf', 'md' => 'text/plain; charset=utf-8',
    ];
    return $tipos[$ext] ?? 'application/octet-stream';
}

/* ---------- las apps de clientes y subcontratas ----------
   Solo se sirve: /api (el mismo backend; las acciones «portal*» llevan sus
   propias cuentas), /robots.txt, el manifest, /assets/portal/ y /assets/img/.
   Cualquier otra ruta devuelve la app (assets/portal/index.html). */
function zw_portal_servir($host, $tipo) {
    $raiz = realpath(ZW_CRM_RAIZ);
    if (!$raiz) return;
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    if (!$https) { header('Location: https://' . $host . ($_SERVER['REQUEST_URI'] ?? '/'), true, 301); exit; }
    $uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    if (preg_match('#^/(wp-admin|wp-login\.php|wp-json|wp-includes|wp-content|wp-cron\.php|xmlrpc\.php)(/|$)#', $uri)) { http_response_code(404); exit; }
    if ($uri === '/robots.txt') { header('Content-Type: text/plain; charset=utf-8'); echo "User-agent: *\nDisallow: /\n"; exit; }
    if (preg_match('#^/api/?$#', $uri)) {
        $f = $raiz . '/api/index.php';
        if (!is_file($f)) { http_response_code(503); exit; }
        if (!defined('ZW_API_NOMBRE')) define('ZW_API_NOMBRE', 'index');
        zw_crm_tic_si_toca($raiz);
        chdir($raiz . '/api');
        require $f;
        exit;
    }
    if ($uri === '/manifest.webmanifest') $uri = '/assets/portal/manifest-' . $tipo . '.webmanifest';
    if ($uri === '/favicon.ico') $uri = '/assets/img/isotipo.png';
    $fichero = null;
    if (preg_match('#^/assets/(portal|img)/#', $uri)) {
        $f = realpath($raiz . $uri);
        if ($f && strpos($f, $raiz . '/assets/') === 0 && is_file($f) && !preg_match('#\.(php|phtml|ini|htaccess|zip|sql|gz|log)$#i', $f)) $fichero = $f;
        else { http_response_code(404); header('Content-Type: text/plain'); echo 'No encontrado'; exit; }
    }
    if (!$fichero) $fichero = $raiz . '/assets/portal/index.html';
    if (!is_file($fichero)) { http_response_code(503); header('Content-Type: text/plain; charset=utf-8'); echo 'App en preparación'; exit; }
    $ext = strtolower(pathinfo($fichero, PATHINFO_EXTENSION));
    header('Content-Type: ' . zw_crm_tipo_mime($ext));
    if ($ext === 'html') header('Cache-Control: no-store');
    else {
        header('Cache-Control: no-cache');
        $etag = '"' . md5($fichero . filemtime($fichero) . filesize($fichero)) . '"';
        header('ETag: ' . $etag);
        if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
    }
    header('Content-Length: ' . filesize($fichero));
    readfile($fichero);
    exit;
}

(function () {
    $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
    $sinWww = preg_replace('/^www\./', '', $host);
    if (isset(ZW_PORTALES[$sinWww])) { zw_portal_servir($sinWww, ZW_PORTALES[$sinWww]); return; }
    if ($host !== ZW_CRM_HOST && $host !== 'www.' . ZW_CRM_HOST) return;

    $raiz = realpath(ZW_CRM_RAIZ);
    if (!$raiz) return;

    /* Primera vez: desempaquetar crm_site.zip si aún no hay index.html */
    if (!file_exists($raiz . '/index.html') && file_exists($raiz . '/crm_site.zip') && class_exists('ZipArchive')) {
        $zip = new ZipArchive();
        if ($zip->open($raiz . '/crm_site.zip') === true) { $zip->extractTo($raiz); $zip->close(); @unlink($raiz . '/crm_site.zip'); }
    }

    /* Nunca indexar, nunca sin HTTPS */
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    if (!$https) { header('Location: https://' . ZW_CRM_HOST . ($_SERVER['REQUEST_URI'] ?? '/'), true, 301); exit; }

    $uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');

    /* La administración de WordPress sigue accesible por si hiciera falta */
    if (preg_match('#^/(wp-admin|wp-login\.php|wp-json|wp-includes|wp-content|wp-cron\.php)(/|$)#', $uri)) return;

    if ($uri === '/robots.txt') { header('Content-Type: text/plain; charset=utf-8'); echo "User-agent: *\nDisallow: /\n"; exit; }

    /* El backend: /api, /api/ y /api/<nombre> -> /crm/api/<nombre>.php (index.php por defecto) */
    if (preg_match('#^/api(?:/([a-z0-9_\-]+)(?:\.php)?)?/?$#i', $uri, $m)) {
        $nombre = isset($m[1]) && $m[1] !== '' ? $m[1] : 'index';
        if ($nombre[0] === '_' || !in_array($nombre, ['index', 'exportar', 'copia', 'cron', 'puesta_a_punto', 'desempaquetar'], true)) { http_response_code(404); header('Content-Type: text/plain'); echo 'No encontrado'; exit; }
        $f = $raiz . '/api/' . $nombre . '.php';
        if (is_file($f)) {
            if (!defined('ZW_API_NOMBRE')) define('ZW_API_NOMBRE', $nombre);
            if ($nombre !== 'cron') zw_crm_tic_si_toca($raiz);
            chdir($raiz . '/api');
            require $f;
            exit;
        }
        http_response_code(404); header('Content-Type: text/plain'); echo 'No encontrado'; exit;
    }

    if ($uri === '/' || $uri === '') $uri = '/index.html';
    $fichero = realpath($raiz . $uri);
    if (!$fichero || strpos($fichero, $raiz . DIRECTORY_SEPARATOR) !== 0 || !is_file($fichero)) {
        $fichero = $raiz . '/index.html';
        if (!is_file($fichero)) { http_response_code(404); header('Content-Type: text/plain'); echo 'CRM no instalado'; exit; }
    }
    /* Nada del servidor sale por aquí: ni código PHP ni configuración ni copias. */
    if (preg_match('#\.(php|phtml|ini|htaccess|zip|sql|gz|log)$#i', $fichero) || strpos($fichero, $raiz . '/api/') === 0) { http_response_code(403); exit; }

    $ext = strtolower(pathinfo($fichero, PATHINFO_EXTENSION));
    header('Content-Type: ' . zw_crm_tipo_mime($ext));
    if ($ext === 'html') {
        header('Cache-Control: no-store');
    } else {
        /* Siempre se revalida (ETag): así un despliegue nuevo se ve al momento sin cargar el servidor. */
        header('Cache-Control: no-cache');
        $etag = '"' . md5($fichero . filemtime($fichero) . filesize($fichero)) . '"';
        header('ETag: ' . $etag);
        if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
    }
    header('Content-Length: ' . filesize($fichero));
    readfile($fichero);
    exit;
})();
