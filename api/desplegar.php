<?php
/**
 * desplegar.php — Mantiene crm.zerowattios.com igual que el repositorio de
 * GitHub (zerowattiosingenieria-bit/crm): cada pocos minutos mira si hay un
 * commit nuevo en `main` y, si lo hay, descarga esa versión y la deja en la
 * carpeta /crm del espacio web (sin tocar lo que es solo del servidor:
 * config_local.php, llaves, copias…).
 *
 * Retoques que aplica al desplegar (no están en GitHub a propósito):
 *   - assets/js/api.js: ENDPOINT_POR_DEFECTO = propiedad ENDPOINT_WEB
 *     ('/api/' cuando el CRM ya trabaja contra MySQL).
 *   - index.html: <meta name="robots" content="noindex, nofollow, noarchive">.
 *
 * Lo lanza el mu-plugin (WP-Cron cada 5 minutos) o /api/desplegar?llave=…
 */

require_once __DIR__ . '/base.php';

const GITHUB_REPO = 'zerowattiosingenieria-bit/crm';
const GITHUB_RAMA = 'main';

function pedirGitHub_(string $url, int $timeout = 60): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5,
    CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_TIMEOUT => $timeout,
    CURLOPT_HTTPHEADER => ['User-Agent: crm-zerowattios-deploy', 'Accept: application/vnd.github+json'],
  ]);
  $texto = curl_exec($ch);
  $codigo = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $err = curl_error($ch);
  curl_close($ch);
  return ['codigo' => $codigo, 'texto' => $texto === false ? '' : $texto, 'error' => $err];
}

/** Copia recursiva de una carpeta sobre otra (sobrescribe, no borra lo demás). */
function copiarSobre_(string $desde, string $hasta): int {
  $n = 0;
  if (!is_dir($hasta)) mkdir($hasta, 0755, true);
  foreach (scandir($desde) as $e) {
    if ($e === '.' || $e === '..') continue;
    $a = $desde . '/' . $e; $b = $hasta . '/' . $e;
    if (is_dir($a)) { $n += copiarSobre_($a, $b); continue; }
    if (!copy($a, $b . '.tmp')) throw new Exception('No se ha podido escribir ' . $b);
    rename($b . '.tmp', $b);
    $n++;
  }
  return $n;
}

function borrarCarpeta_(string $d): void {
  if (!is_dir($d)) return;
  foreach (scandir($d) as $e) {
    if ($e === '.' || $e === '..') continue;
    $p = $d . '/' . $e;
    is_dir($p) ? borrarCarpeta_($p) : @unlink($p);
  }
  @rmdir($d);
}

/** Los retoques del servidor sobre los archivos recién copiados. */
function retocarDespliegue_(string $raiz): array {
  $hecho = [];
  $endpoint = prop_('ENDPOINT_WEB') ?? '';
  $api = $raiz . '/assets/js/api.js';
  if ($endpoint !== '' && is_file($api)) {
    $js = file_get_contents($api);
    $js2 = preg_replace("/const ENDPOINT_POR_DEFECTO = '[^']*';/", "const ENDPOINT_POR_DEFECTO = '" . addslashes($endpoint) . "';", $js, 1);
    if ($js2 !== $js) { file_put_contents($api, $js2); $hecho[] = 'endpoint'; }
  }
  $idx = $raiz . '/index.html';
  if (is_file($idx)) {
    $html = file_get_contents($idx);
    if (strpos($html, 'name="robots"') === false) {
      $html = preg_replace('/<meta name="viewport"/', '<meta name="robots" content="noindex, nofollow, noarchive">' . "\n" . '<meta name="viewport"', $html, 1);
      file_put_contents($idx, $html);
      $hecho[] = 'noindex';
    }
  }
  if (!is_file($raiz . '/robots.txt')) { file_put_contents($raiz . '/robots.txt', "User-agent: *\nDisallow: /\n"); $hecho[] = 'robots.txt'; }
  return $hecho;
}

/**
 * Comprueba GitHub y despliega si hace falta. Devuelve qué ha pasado.
 * $raiz es la carpeta del CRM en el espacio web (/crm). $forzar vuelve a
 * desplegar aunque el commit sea el mismo.
 */
function desplegarDesdeGitHub_(string $raiz, bool $forzar = false): array {
  $r = pedirGitHub_('https://api.github.com/repos/' . GITHUB_REPO . '/commits/' . GITHUB_RAMA, 30);
  if ($r['codigo'] !== 200) return ['ok' => false, 'error' => 'GitHub ha respondido ' . $r['codigo'] . ' ' . $r['error']];
  $d = json_decode($r['texto'], true);
  $sha = txt_($d['sha'] ?? '');
  if (!$sha) return ['ok' => false, 'error' => 'GitHub no ha devuelto el commit.'];
  $actual = prop_('GITHUB_SHA') ?? '';
  if ($sha === $actual && !$forzar) {
    setProp_('GITHUB_COMPROBADO', ahora_());
    return ['ok' => true, 'cambios' => false, 'sha' => $sha];
  }

  $tmp = rtrim(sys_get_temp_dir(), '/') . '/zw_deploy_' . substr($sha, 0, 8);
  borrarCarpeta_($tmp); mkdir($tmp, 0755, true);
  $zip = $tmp . '/repo.zip';
  $z = pedirGitHub_('https://codeload.github.com/' . GITHUB_REPO . '/zip/' . $sha, 180);
  if ($z['codigo'] !== 200 || $z['texto'] === '') { borrarCarpeta_($tmp); return ['ok' => false, 'error' => 'No se ha podido descargar el zip (' . $z['codigo'] . ').']; }
  file_put_contents($zip, $z['texto']);
  $za = new ZipArchive();
  if ($za->open($zip) !== true) { borrarCarpeta_($tmp); return ['ok' => false, 'error' => 'El zip de GitHub no se puede abrir.']; }
  $za->extractTo($tmp . '/x'); $za->close();
  $dirs = glob($tmp . '/x/*', GLOB_ONLYDIR);
  $src = $dirs[0] ?? '';
  if (!$src || !is_file($src . '/index.html')) { borrarCarpeta_($tmp); return ['ok' => false, 'error' => 'El zip no trae index.html.']; }

  /* Lo que se publica: la web y, si está en el repositorio, el backend api/. */
  $n = 0;
  foreach (['index.html', 'manifest.webmanifest', 'robots.txt'] as $f) {
    if (is_file($src . '/' . $f)) { copy($src . '/' . $f, $raiz . '/' . $f . '.tmp'); rename($raiz . '/' . $f . '.tmp', $raiz . '/' . $f); $n++; }
  }
  if (is_dir($src . '/assets')) $n += copiarSobre_($src . '/assets', $raiz . '/assets');
  if (is_dir($src . '/api')) $n += copiarSobre_($src . '/api', $raiz . '/api');
  $retoques = retocarDespliegue_($raiz);
  borrarCarpeta_($tmp);
  setProp_('GITHUB_SHA', $sha);
  setProp_('GITHUB_DESPLEGADO', ahora_());
  setProp_('GITHUB_COMPROBADO', ahora_());
  try { registrar_(null, 'despliegue', 'GITHUB', substr($sha, 0, 7), $n . ' archivos; ' . implode(',', $retoques)); } catch (Throwable $e) {}
  return ['ok' => true, 'cambios' => true, 'sha' => $sha, 'archivos' => $n, 'retoques' => $retoques];
}
