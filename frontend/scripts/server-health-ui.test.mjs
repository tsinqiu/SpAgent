import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const [
  systemService,
  serverHealthBadge,
  authStore,
  loginView,
  registerView,
  todayView,
  downloadView,
  routerSource,
  appCss,
  packageJsonText,
  backendNginxConfig,
  frontendNginxConfig,
] = await Promise.all([
  source('src/services/system.js'),
  source('src/components/ServerHealthBadge.vue'),
  source('src/stores/authStore.js'),
  source('src/views/Login.vue'),
  source('src/views/Register.vue'),
  source('src/views/Today.vue'),
  source('src/views/Download.vue'),
  source('src/router/index.js'),
  source('src/assets/app.css'),
  source('package.json'),
  source('../backend/docs/nginx-spagent.conf'),
  source('deploy/nginx.spagent.example.conf'),
])

const packageJson = JSON.parse(packageJsonText)

test('public system service reads the server health endpoint through the configured API client', () => {
  assert.match(systemService, /apiClient\.get\(['"]\/health['"]\)/)
  assert.match(systemService, /unwrapApiResponse\(response\.data\)/)
  assert.match(systemService, /export\s+async\s+function\s+getServerHealth/)
})

test('public service status distinguishes checking, online, degraded and offline states', () => {
  assert.match(serverHealthBadge, /aria-live="polite"/)
  assert.match(serverHealthBadge, /await getServerHealth\(\)/)
  assert.match(serverHealthBadge, /health\?\.status === 'ok' && health\.database\?\.ok/)
  for (const [status, label] of [
    ['online', '服务在线'], ['degraded', '部分服务可用'], ['offline', '服务暂不可用'],
  ]) {
    assert.match(serverHealthBadge, new RegExp(`status\\.value === '${status}'\\) return '${label}'`))
  }
  assert.match(serverHealthBadge, /ref\('checking'\)/)
  assert.match(serverHealthBadge, /return '连接中'/)
  assert.doesNotMatch(serverHealthBadge, /SpAgent API|数据层|数据库/)
})

test('account screens surface form and authentication failures and disable duplicate submissions', () => {
  for (const [view, action] of [[loginView, 'signIn'], [registerView, 'signUp']]) {
    assert.match(view, /@submit\.prevent="submit"/)
    assert.match(view, /role="alert"/)
    assert.match(view, /v-if="localError \|\| authSession\.error"/)
    assert.match(view, /\{\{\s*localError \|\| authSession\.error\s*\}\}/)
    assert.match(view, /:disabled="authSession\.loading"/)
    assert.match(view, new RegExp(`await ${action}\\(`))
  }
  assert.match(authStore, /authSession\.error\s*=[^\n]*error/)
})

test('auth screens keep direct package downloads on the web download route', () => {
  for (const view of [loginView, registerView]) {
    assert.doesNotMatch(view, /\/downloads\/[^'"\s]+\.apk/)
  }
  assert.match(loginView, /<RouterLink\b[^>]*v-if="showApkDownloadEntry"[^>]*:to="\{ name: 'download' \}"/)
  assert.match(loginView, /showApkDownloadEntry\s*=\s*!Capacitor\.isNativePlatform\(\)/)
})

test('download page is the web-only home for the server-hosted Android package', () => {
  assert.match(routerSource, /import\s+\{\s*Capacitor\s*\}\s+from\s+['"]@capacitor\/core['"]/)
  assert.match(routerSource, /function\s+isNativeRuntime\(\)/)
  assert.match(routerSource, /path:\s*['"]\/download['"]/)
  assert.match(routerSource, /name:\s*['"]download['"]/)
  assert.match(routerSource, /redirect:\s*\(\)\s*=>\s*\(isNativeRuntime\(\)\s*\|\|\s*hasAuthToken\(\)\s*\?\s*['"]\/today['"]\s*:\s*['"]\/download['"]\)/)
  assert.match(routerSource, /to\.name === 'download'[\s\S]*?isNativeRuntime\(\)[\s\S]*?hasAuthToken\(\) \? \{ name: 'today' \} : \{ name: 'login' \}/)
  assert.match(downloadView, /<ServerHealthBadge\b[^>]*\/>/)
  assert.match(downloadView, /<a\b[^>]*v-if="apkAvailable"[^>]*href="\/downloads\/spagent-release\.apk"[^>]*\bdownload\b/)
  assert.doesNotMatch(downloadView, /\/downloads\/spagent-debug\.apk/)
  assert.match(downloadView, /下载安卓版 APK/)
  assert.match(downloadView, /<button\b[^>]*v-else[^>]*\sdisabled\s*>/)
  assert.match(downloadView, /正在检查安装包/)
  assert.match(downloadView, /安装包暂未上传/)
})

test('package availability checks the response content type as well as HTTP status', () => {
  assert.match(downloadView, /fetch\(['"]\/downloads\/spagent-release\.apk['"],\s*\{[\s\S]*?method:\s*['"]HEAD['"]/)
  assert.match(downloadView, /response\.headers\.get\(['"]content-type['"]\)/i)
  assert.match(downloadView, /application\/vnd\.android\.package-archive/)
  assert.match(downloadView, /application\/octet-stream/)
  assert.match(downloadView, /apkAvailable\.value\s*=\s*response\.ok\s*&&/)
})

test('the home page links web users to Android downloads and the download page links to the web app', () => {
  assert.match(todayView, /<RouterLink\b[^>]*v-if="showApkDownloadEntry"[^>]*:to="\{ name: 'download' \}"/)
  assert.match(todayView, /showApkDownloadEntry\s*=\s*!Capacitor\.isNativePlatform\(\)/)
  assert.match(todayView, /下载安卓版 APK/)
  assert.doesNotMatch(todayView, /\/downloads\/spagent-release\.apk/)
  assert.match(downloadView, /<RouterLink\b[^>]*to="\/today"[^>]*>[\s\S]*?使用网页版[\s\S]*?<\/RouterLink>/)
})

test('the service status badge provides distinct styles for degraded and offline states', () => {
  assert.match(appCss, /\.server-health-badge__dot\s*\{[^}]*background:\s*var\(--app-green\)/)
  assert.match(appCss, /\.server-health-badge--degraded\s+\.server-health-badge__dot\s*\{[^}]*background:/)
  assert.match(appCss, /\.server-health-badge--offline\s+\.server-health-badge__dot\s*\{[^}]*background:/)
})

test('course check includes server health UI coverage', () => {
  assert.match(packageJson.scripts['check:course'] || '', /scripts\/server-health-ui\.test\.mjs/)
})

test('nginx serves Android packages as real files instead of SPA fallback', () => {
  for (const config of [backendNginxConfig, frontendNginxConfig]) {
    assert.match(config, /location\s+\/downloads\/\s*\{[^}]*try_files\s+\$uri\s+=404;/)
  }
})

test('nginx forwards uploads to Express instead of serving them from disk', () => {
  for (const config of [backendNginxConfig, frontendNginxConfig]) {
    assert.match(config, /location\s+\/uploads\/\s*\{[^}]*proxy_pass\s+http:\/\/127\.0\.0\.1:8080;/)
  }
})
