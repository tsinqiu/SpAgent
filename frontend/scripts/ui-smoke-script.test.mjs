import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('./ui-smoke.mjs', import.meta.url), 'utf8')

test('ui smoke audits every primary app route after authentication', () => {
  assert.match(source, /const authRoutes = \[/)

  for (const route of [
    '/today',
    '/activities',
    '/activities/',
    '/record',
    '/explore',
    '/explore/weekly-report',
    '/community',
    '/training-plans',
    '/status',
    '/status/health',
    '/status/performance',
    '/status/training-load',
    '/status/trends',
    '/status/calendar',
    '/status/records',
    '/coach',
    '/me',
    '/me/sync',
    '/me/shoes',
    '/me/security',
    '/me/settings',
    '/me/training-preferences',
  ]) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/')))
  }
})

test('ui smoke audits the admin page with a real admin session', () => {
  assert.match(source, /const adminRoutes = \[/)
  assert.match(source, /UI_SMOKE_ADMIN_EMAIL/)
  assert.match(source, /UI_SMOKE_ADMIN_PASSWORD/)
  assert.match(source, /async function loginAccount/)
  assert.match(source, /path: '\/me\/admin'[\s\S]*requiredText: \['管理中心'/)
  assert.doesNotMatch(source, /requiredAnyText: \['管理中心', '今日'\]/)
})

test('ui smoke can reuse an installed system browser instead of downloading one', () => {
  assert.match(source, /UI_SMOKE_BROWSER_EXECUTABLE/)
  assert.match(source, /resolveBrowserExecutable/)
  assert.match(source, /C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome\.exe/)
  assert.match(source, /C:\\\\Program Files \(x86\)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge\.exe/)
  assert.match(source, /executablePath: browserExecutable/)
})

test('ui smoke checks production mobile layout invariants on every route', () => {
  assert.match(source, /function auditRoute/)
  assert.match(source, /docWidth/)
  assert.match(source, /bodyWidth/)
  assert.match(source, /pageFrameScrollWidth/)
  assert.match(source, /NaN\|undefined/)
  assert.doesNotMatch(source, /rqTabs/)
})

test('ui smoke exercises core server-backed app functions', () => {
  assert.match(source, /UI_SMOKE_EXERCISE_GPS/)
  assert.match(source, /newContext\(\{[\s\S]*permissions:\s*shouldExerciseGps\s*\?\s*\['geolocation'\]\s*:\s*\[\]/)
  assert.match(source, /geolocation:\s*shouldExerciseGps\s*\?/)
  assert.match(source, /args:\s*shouldExerciseGps\s*\?\s*\[/)
  assert.match(source, /--unsafely-treat-insecure-origin-as-secure=\$\{appUrl\}/)
  assert.doesNotMatch(source, /grantPermissions/)
  assert.match(source, /async function exerciseLiveWorkout/)
  assert.match(source, /async function exerciseManualActivity/)
  assert.match(source, /async function exerciseShoeFlow/)
  assert.match(source, /async function exerciseSettingsFlow/)
})

test('ui smoke exercises admin user creation and disable flow', () => {
  assert.match(source, /async function exerciseAdminUserFlow/)
  assert.match(source, /Codex管理员巡检/)
  assert.match(source, /添加用户/)
  assert.match(source, /停用账号/)
  assert.match(source, /name: \/\^停用\$\//)
  assert.match(source, /账号已停用/)
})

test('ui smoke waits for saved manual activity content before asserting detail page', () => {
  assert.match(source, /waitForFunction\([\s\S]*activityName/)
  assert.match(source, /Manual activity did not appear/)
})

test('ui smoke ignores navigation-aborted requests that happen during route changes', () => {
  assert.match(source, /ERR_ABORTED/)
})

test('ui smoke exercises download and account error regressions', () => {
  assert.match(source, /await exercisePublicRegressions\(context\)/)
  assert.match(source, /contentType: 'text\/html'/)
  assert.match(source, /contentType: 'application\/vnd\.android\.package-archive'/)
  assert.match(source, /INVALID_CREDENTIALS/)
  assert.match(source, /route\.abort\('failed'\)/)
})

test('ui smoke verifies that data filters and back navigation work together', () => {
  assert.match(source, /await exerciseRangeAndNavigation\(context\)/)
  assert.match(source, /\/api\/training\/load-balance/)
  assert.match(source, /\/api\/stats\/metric-trends/)
  assert.match(source, /趋势加载失败/)
  assert.match(source, /from=constructor/)
  assert.match(source, /from=explore/)
})
