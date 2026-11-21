import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { workspaceNavigation } from '../src/constants/product.js'

function source(path) {
  return readFile(new URL('../src/' + path, import.meta.url), 'utf8')
}

const [router, shell, today, explore, record, workout] = await Promise.all([
  source('router/index.js'),
  source('components/AppShell.vue'),
  source('views/Today.vue'),
  source('views/Explore.vue'),
  source('views/RecordActivity.vue'),
  source('views/StartWorkout.vue'),
])

const routeRecords = router.match(/^const routes = \[\n([\s\S]*?)^\]/m)?.[1]
assert.ok(routeRecords, 'Missing router records')
const routes = new Map(
  routeRecords.trimEnd().split(/\n(?=  \{)/).map((record) => {
    const path = record.match(/\bpath: '([^']+)'/)?.[1]
    assert.ok(path, 'Missing path in a route record')
    return [path, record]
  }),
)

for (const path of [
  ...workspaceNavigation.flatMap(group => group.items.map(({ to }) => to)),
  '/activities/:id', '/status', '/status/health', '/status/performance',
  '/status/training-load', '/status/trends', '/status/calendar', '/status/records',
  '/coach', '/training-plans', '/explore/events', '/explore/courses', '/explore/routes', '/explore/weekly-report',
  '/me', '/me/sync', '/me/shoes', '/me/security', '/me/settings', '/me/admin', '/me/training-preferences',
]) {
  const route = routes.get(path)
  assert.ok(route, 'Missing route ' + path)
  assert.match(route, /component:\s*\w+/, path + ' must mount a view')
  assert.match(route, /requiresAuth: true/, path + ' must require authentication')
}
assert.match(routes.get('/me/admin'), /requiresAdmin: true/)
assert.doesNotMatch(router, /DatabaseSchema/)

for (const [legacy, current] of [
  ['/start', '/record'],
  ['/health', '/status/health'],
  ['/training-load', '/status/training-load'],
  ['/calendar', '/status/calendar'],
  ['/records', '/status/records'],
  ['/statistics', '/status/trends'],
  ['/trends', '/status/trends'],
  ['/analytics', '/status/trends'],
  ['/assistant', '/coach'],
  ['/sync', '/me/sync'],
  ['/shoes', '/me/shoes'],
  ['/settings', '/me/settings'],
  ['/admin', '/me/admin'],
  ['/schema', '/today'],
]) {
  assert.equal(routes.get(legacy)?.match(/redirect: '([^']+)'/)?.[1], current, legacy)
}

assert.match(shell, /v-for="group in workspaceNavigation"/)
assert.match(shell, /aria-label="打开工作区菜单"[^>]*@click="openMenu"/)
assert.match(shell, /<RouterLink to="\/coach"/)
assert.match(today, /path: '\/training-plans', query: \{ from: 'today' \}/)
assert.match(explore, /to="\/explore\/courses"/)
assert.match(explore, /to="\/explore\/routes"/)
assert.doesNotMatch(explore, /path: '\/coach'|path: '\/status'|\/explore\/events/)
assert.match(record, /<StartWorkout\b/)
assert.match(record, /<ManualActivityModal\b/)
assert.match(workout, /@click="toggleRecording"/)

const dataViews = [
  'Today', 'Activities', 'ActivityDetail', 'Status', 'HealthDetail', 'TrainingLoad',
  'Statistics', 'Calendar', 'Records', 'RecordActivity', 'Sync', 'Shoes',
  'Admin', 'TrainingPlans', 'Community', 'WeeklyReport', 'TrainingPreferences',
]
const dataSources = await Promise.all(dataViews.map((name) => source('views/' + name + '.vue')))
const forbiddenCopy = /数据库系统|数据库记录|原始字段|智能干预|浏览器模拟运动|AI Brief|Local AI|Manual activity/

for (const [index, view] of dataSources.entries()) {
  const name = dataViews[index]
  assert.doesNotMatch(view, /\bfetch\s*\(/, name + ' must use the shared API services')
  assert.doesNotMatch(view, forbiddenCopy, name + ' contains developer-facing copy')
  assert.match(view, /<StateBlock\b/, name + ' must expose a visible state')
  assert.match(view, /loading|Loading|加载|正在/, name + ' is missing a loading state')
  assert.match(view, /error|Error|失败|不可用/, name + ' is missing an error state')
}

console.log('Course delivery source checks passed.')
