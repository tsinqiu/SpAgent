import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

async function json(path) {
  const text = await source(path)
  return text ? JSON.parse(text) : null
}

const [
  packageJson,
  httpSource,
  syncSource,
  protectedPhotoSource,
  activityCardSource,
  activityDetailSource,
  shoesSource,
  capacitorConfig,
  androidSyncScript,
  androidDebugScript,
  envExample,
  envProductionExample,
] = await Promise.all([
  json('package.json'),
  source('src/services/http.js'),
  source('src/services/sync.js'),
  source('src/components/ProtectedPhoto.vue'),
  source('src/components/ActivityCard.vue'),
  source('src/views/ActivityDetail.vue'),
  source('src/views/Shoes.vue'),
  source('capacitor.config.ts'),
  source('scripts/sync-android-server.ps1'),
  source('scripts/build-android-debug.ps1'),
  source('.env.example'),
  source('.env.production.example'),
])

test('API client selects the server API for native builds instead of localhost', () => {
  assert.match(httpSource, /import\s+\{\s*Capacitor\s*\}\s+from\s+['"]@capacitor\/core['"]/)
  assert.match(httpSource, /function\s+resolveApiBaseUrl\(/)
  assert.match(httpSource, /Capacitor\.isNativePlatform\(\)/)
  assert.match(httpSource, /import\.meta\.env\.VITE_NATIVE_API_BASE_URL/)
  assert.match(httpSource, /LOCAL_API_BASE_URL\s*=\s*import\.meta\.env\.DEV\s*\?\s*['"]http:\/\/localhost:8080\/api['"]\s*:\s*['"]\/api['"]/)
})

test('web production builds default to the same-origin API prefix', () => {
  assert.match(httpSource, /LOCAL_API_BASE_URL\s*=\s*import\.meta\.env\.DEV\s*\?\s*['"]http:\/\/localhost:8080\/api['"]\s*:\s*['"]\/api['"]/)
  assert.match(httpSource, /return\s+import\.meta\.env\.VITE_API_BASE_URL\s*\|\|\s*LOCAL_API_BASE_URL/)
})

test('media URLs reuse the configured API base instead of hardcoded localhost', () => {
  assert.match(httpSource, /export\s+function\s+resolveMediaUrl/)
  for (const consumer of [activityCardSource, activityDetailSource, shoesSource]) {
    assert.doesNotMatch(consumer, /localhost:808[09]/)
    assert.match(consumer, /<ProtectedPhoto\b/)
  }
  assert.match(protectedPhotoSource, /import\s+\{\s*apiClient,\s*resolveMediaUrl\s*\}\s+from\s+['"]@\/services\/http['"]/)
  assert.match(protectedPhotoSource, /apiClient\.get\([^\n]*\$\{collection\}\/\$\{encodeURIComponent\(id\)\}\/\$\{filename\}/)
  assert.match(protectedPhotoSource, /responseType:\s*['"]blob['"]/)
  assert.match(protectedPhotoSource, /URL\.revokeObjectURL\(/)
})

test('sync service names only implemented Garmin provider', () => {
  assert.match(syncSource, /garmin:\s*['"]Garmin Connect['"]/)
  assert.doesNotMatch(syncSource, /strava|coros|apple_health|Strava|COROS|Apple Health/)
  assert.doesNotMatch(syncSource, /providers\/\$\{provider\}/)
})

test('Android sync requires an explicitly configured server API', () => {
  assert.match(packageJson.scripts['android:sync'] || '', /sync-android-server\.ps1/)
  assert.match(androidSyncScript, /if\s*\(-not \$env:VITE_NATIVE_API_BASE_URL\)/)
  assert.match(androidSyncScript, /VITE_NATIVE_API_BASE_URL is required/)
  assert.doesNotMatch(androidSyncScript, /D:\\SpAgent|Get-Content/)
  assert.match(androidSyncScript, /\$env:VITE_API_BASE_URL\s*=\s*\$env:VITE_NATIVE_API_BASE_URL/)
  assert.match(androidSyncScript, /npm run build/)
  assert.match(androidSyncScript, /npx cap sync android/)
  assert.match(androidDebugScript, /npm run android:sync/)
})

test('Capacitor allows the current HTTP server API while HTTPS is pending', () => {
  assert.match(capacitorConfig, /cleartext:\s*true/)
  assert.match(envExample, /VITE_NATIVE_API_BASE_URL=https:\/\/spagent\.example\.com\/api/)
  assert.match(envProductionExample, /VITE_NATIVE_API_BASE_URL=https:\/\/spagent\.example\.com\/api/)
})
