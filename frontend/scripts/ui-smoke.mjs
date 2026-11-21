import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from 'playwright'

const appUrl = process.env.UI_SMOKE_URL || 'http://127.0.0.1:4173'
const browserCandidates = [
  process.env.UI_SMOKE_BROWSER_EXECUTABLE,
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const shouldRegister = process.argv.includes('--register')
const shouldAuditGuards = process.argv.includes('--all-routes')
const adminEmail = process.env.UI_SMOKE_ADMIN_EMAIL || ''
const adminPassword = process.env.UI_SMOKE_ADMIN_PASSWORD || ''
const shouldRequireAdminAudit = process.env.UI_SMOKE_REQUIRE_ADMIN === '1'
const shouldExerciseGps = process.env.UI_SMOKE_EXERCISE_GPS === '1'
const screenshotDir = path.resolve('.codex-logs', 'ui-smoke')

function resolveBrowserExecutable() {
  return browserCandidates.find((candidate) => existsSync(candidate))
}

const authRoutes = [
  { path: '/today', selector: '.today-action-grid', name: 'today', requiredText: ['训练计划'] },
  { path: '/activities', selector: '.activity-list-section', name: 'activities', requiredText: ['筛选'] },
  { path: '/activities/', selector: '.activity-title-card h1', name: 'activity-detail', requiredText: ['AI 教练'] },
  { path: '/record', selector: '.record-dashboard', name: 'record', requiredText: ['定位状态', '结束并保存'] },
  { path: '/status', selector: '.page-stack', name: 'status', requiredAnyText: ['当前跑力', '等待跑力'] },
  { path: '/status/health', selector: '.range-pills', name: 'health', requiredAnyText: ['今日状态', '暂无训练负荷数据'] },
  { path: '/status/performance', selector: '.performance-detail-page', name: 'performance' },
  { path: '/status/training-load', selector: '.page-stack', name: 'training-load', requiredText: ['训练指数'] },
  { path: '/status/trends', selector: '.trend-range-pills', name: 'statistics', requiredAnyText: ['Avg:', '暂无趋势数据'] },
  { path: '/status/calendar', selector: '.page-stack', name: 'calendar', requiredText: ['运动日历'] },
  { path: '/status/records', selector: '.page-stack', name: 'records', requiredText: ['成绩曲线'] },
  { path: '/coach', selector: '.plan-agent__composer', name: 'coach', requiredText: ['AI 教练'] },
  { path: '/training-plans', selector: '.training-plan-page', name: 'training-plans', requiredAnyText: ['暂无训练课表', '我的训练计划'] },
  { path: '/explore', selector: '.explore-entry-grid', name: 'explore', requiredText: ['AI教练'] },
  { path: '/explore/events', selector: '.explore-tool-page', name: 'explore-events', requiredText: ['跑步赛事'] },
  { path: '/explore/courses', selector: '.course-page', name: 'explore-courses' },
  { path: '/explore/routes', selector: '.route-library-page', name: 'explore-routes', requiredText: ['运动路线'] },
  { path: '/explore/weekly-report', selector: '.weekly-report-page', name: 'weekly-report', requiredText: ['实际运动', '训练执行趋势', '计划执行'] },
  { path: '/community', selector: '.community-tabs', name: 'community' },
  { path: '/me', selector: '.page-stack', name: 'me', requiredText: ['个人服务'] },
  { path: '/me/sync', selector: '.page-stack', name: 'sync', requiredText: ['连接你的 Garmin 账号'] },
  { path: '/me/shoes', selector: '.page-stack', name: 'shoes', requiredText: ['跑鞋里程'] },
  { path: '/me/security', selector: '.page-stack', name: 'security', requiredText: ['账号安全'] },
  { path: '/me/settings', selector: '.settings-profile-form', name: 'settings', requiredText: ['保存设置'] },
  { path: '/me/training-preferences', selector: '.preference-form', name: 'training-preferences', requiredText: ['常用训练日'] },
]

const adminRoutes = [
  { path: '/me/admin', selector: '.page-stack', name: 'admin', requiredText: ['管理中心', '添加用户', '用户列表'] },
]

function redact(text = '') {
  return text.replace(/https?:\/\/[^/\s]+/g, 'http://<server>')
}

function routePath(route, state) {
  if (route.path === '/activities/') return state.manualActivityPath || '/activities'
  return route.path
}

async function collectBrowserEvents(page) {
  const events = []
  page.on('pageerror', (error) => events.push(`page:${redact(error.message)}`))
  page.on('console', (message) => {
    if (message.type() === 'error') events.push(`console:${redact(message.text())}`)
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.includes('/favicon')) return
    const failure = request.failure()?.errorText || 'failed'
    if (failure.includes('ERR_ABORTED')) return
    events.push(`request:${redact(url)}:${failure}`)
  })
  return events
}

async function registerAccount(page) {
  const timestamp = Date.now()
  const username = `codex_ui_${timestamp}`
  const email = `codex_ui_${timestamp}@spagent.local`
  const password = `SpAgent${timestamp}!`

  await page.goto(`${appUrl}/register`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.locator('input[autocomplete="username"]').fill(username)
  await page.locator('input[autocomplete="email"]').fill(email)
  const passwordInputs = page.locator('input[type="password"]')
  await passwordInputs.nth(0).fill(password)
  await passwordInputs.nth(1).fill(password)
  await page.getByRole('button', { name: /注册并登录/ }).click()
  await page.waitForURL('**/coach', { timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 })
  await page.getByRole('textbox', { name: '给教练发消息' }).waitFor()
  return { username, email, password }
}

async function loginAccount(page, { email, password }) {
  await page.goto(`${appUrl}/today`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.evaluate(() => localStorage.removeItem('spagent-token'))
  await page.goto(`${appUrl}/login`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.locator('input[autocomplete="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /^登录$/ }).click()
  await page.waitForURL('**/coach', { timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 })
  return { email }
}

async function exerciseManualActivity(page, state) {
  const activityName = `SmokeRun${Date.now()}${'LongTitle'.repeat(6)}`

  await page.goto(`${appUrl}/record`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByRole('button', { name: '手动添加运动' }).click()
  const form = page.locator('.manual-form')
  await form.getByLabel('运动名称').fill(activityName)
  await form.getByLabel('运动类型').selectOption('running')
  await form.getByLabel('地点').fill('服务器 UI 巡检')
  await form.getByLabel('距离 (m)').fill('5200')
  await form.getByLabel('时长 (s)').fill('1800')
  await form.getByLabel('卡路里').fill('380')
  await form.getByLabel('平均心率').fill('142')
  await form.getByLabel('最大心率').fill('168')
  await form.getByLabel('训练负荷').fill('52')
  await form.getByRole('button', { name: '保存' }).click()
  await page.waitForURL(/\/activities\/\d+/, { timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 })
  state.manualActivityPath = new URL(page.url()).pathname
  await page.waitForFunction(
    (savedActivityName) => document.body.innerText.includes(savedActivityName),
    activityName,
    { timeout: 15000 },
  )

  const text = await page.locator('body').innerText()
  if (!text.includes(activityName)) {
    throw new Error('Manual activity did not appear on the saved detail page')
  }

  await page.goto(`${appUrl}/activities`)
  const card = page.locator('.activity-card').filter({ hasText: activityName })
  await card.getByRole('button', { name: '编辑' }).press('Space')
  await page.getByRole('heading', { name: '编辑手动运动' }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/activities')
  await form.getByRole('button', { name: '取消' }).click()
  await card.press('Enter')
  await page.waitForURL(`${appUrl}${state.manualActivityPath}`)
}

async function exerciseLiveWorkout(page) {
  const context = page.context()
  await context.setGeolocation({ latitude: 31.2304, longitude: 121.4737, accuracy: 12 })

  await page.goto(`${appUrl}/record`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByLabel('实时运动数据').waitFor({ timeout: 10000 })
  const start = page.getByRole('button', { name: '开始', exact: true })
  await start.click()
  await page.getByText('定位正常', { exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  const [resumeResponse] = await Promise.all([
    page.waitForResponse('**/api/workouts/*/resume'),
    page.getByRole('button', { name: '继续', exact: true }).click(),
  ])
  assert.ok(resumeResponse.ok())
  await page.waitForTimeout(1200)

  await context.setGeolocation({ latitude: 31.23043, longitude: 121.47373, accuracy: 10 })
  await page.waitForFunction(
    () => /[2-9]\/\d+\s*点/.test(document.body.innerText),
    null,
    { timeout: 15000 },
  )
  await page.waitForFunction(
    () => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.includes('结束并保存'))
      return Boolean(button && !button.disabled)
    },
    null,
    { timeout: 15000 },
  )

  await page.getByRole('button', { name: '结束并保存' }).click()
  await page.getByText('运动已保存').waitFor({ timeout: 20000 })
  await start.click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByText('已取消', { exact: true }).waitFor()
}

async function exerciseShoeFlow(page) {
  const name = `Codex巡检鞋${Date.now()}`

  await page.goto(`${appUrl}/me/shoes`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByRole('button', { name: '添加跑鞋' }).first().click()
  await page.getByPlaceholder('名称（必填）').fill(name)
  await page.getByPlaceholder('品牌').fill('SpAgent')
  await page.getByPlaceholder('型号').fill('Smoke')
  await page.getByPlaceholder('目标里程 (km)').fill('800')
  await page.getByPlaceholder('初始里程 (km)').fill('10')
  await page.locator('.shoe-form').getByRole('button', { name: '保存' }).click()
  await page.getByText(name).waitFor({ timeout: 15000 })

  const card = page.locator('.shoe-card').filter({ hasText: name })
  await card.click()
  await page.getByText(`${name} 的活动记录`).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '关闭' }).click()

  page.once('dialog', (dialog) => dialog.accept())
  await card.getByRole('button', { name: '删除' }).click()
  await page.getByText(name).waitFor({ state: 'detached', timeout: 15000 }).catch(async () => {
    const remaining = await page.locator('.shoe-card').filter({ hasText: name }).count()
    if (remaining > 0) throw new Error('Smoke-created shoe was not deleted')
  })
}

async function exerciseSettingsFlow(page) {
  await page.goto(`${appUrl}/me/settings`, { waitUntil: 'networkidle', timeout: 20000 })
  const weight = page.locator('.profile-setting-card label').filter({ hasText: '体重' }).getByRole('spinbutton')
  await weight.fill('68')
  await page.getByRole('button', { name: '保存设置' }).click()
  await page.getByText('设置已保存。').waitFor({ timeout: 15000 })
  await page.reload()
  assert.equal(await weight.inputValue(), '68')
}

async function exerciseAdminUserFlow(page) {
  const timestamp = `${Date.now()}${process.pid}`
  const username = `Codex管理员巡检${timestamp}`
  const email = `codex_admin_flow_${timestamp}@spagent.local`
  const password = `SpAgentAdmin${timestamp}!`

  await page.goto(`${appUrl}/me/admin`, { waitUntil: 'networkidle', timeout: 20000 })
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(password)
  await page.getByLabel('角色').selectOption('user')
  await page.getByRole('button', { name: '添加用户' }).click()

  const createdCard = page.locator('.admin-user-card').filter({ hasText: email })
  await createdCard.waitFor({ timeout: 15000 })
  await createdCard.getByRole('button', { name: '停用账号' }).click()
  await page.getByRole('button', { name: /^停用$/ }).click()
  await createdCard.getByRole('button', { name: '账号已停用' }).waitFor({ timeout: 15000 })
}

async function auditRoute(page, route, index, state) {
  const targetPath = routePath(route, state)
  await page.goto(`${appUrl}${targetPath}`, { waitUntil: 'networkidle', timeout: 25000 })
  await page.waitForSelector(route.selector, { timeout: 10000 })
  await page.waitForTimeout(300)

  const metrics = await page.evaluate(() => {
    const frame = document.querySelector('.phone-frame')
    const frameRect = frame?.getBoundingClientRect()
    return {
      href: window.location.pathname,
      viewport: window.innerWidth,
      docWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      pageFrameScrollWidth: frame?.scrollWidth || 0,
      pageFrameClientWidth: frame?.clientWidth || 0,
      frameWidth: frameRect ? Math.round(frameRect.width) : null,
    }
  })
  const text = await page.locator('body').innerText()
  const issues = []

  if (metrics.href !== targetPath) issues.push(`unexpected-path:${metrics.href}`)
  if (Math.max(metrics.docWidth, metrics.bodyWidth) > metrics.viewport + 2) {
    issues.push(`body-overflow:${Math.max(metrics.docWidth, metrics.bodyWidth)}>${metrics.viewport}`)
  }
  if (metrics.pageFrameScrollWidth > metrics.pageFrameClientWidth + 2) {
    issues.push(`page-overflow:${metrics.pageFrameScrollWidth}>${metrics.pageFrameClientWidth}`)
  }
  if (/NaN|undefined/.test(text)) issues.push('bad-placeholder-text')
  if (route.requiredText) {
    for (const label of route.requiredText) {
      if (!text.includes(label)) issues.push(`missing-text:${label}`)
    }
  }
  if (route.requiredAnyText && !route.requiredAnyText.some((label) => text.includes(label))) {
    issues.push(`missing-any-text:${route.requiredAnyText.join('|')}`)
  }

  const screenshot = path.join(screenshotDir, `${String(index).padStart(2, '0')}-${route.name}.png`)
  await page.screenshot({ path: screenshot, fullPage: true })
  return { route: targetPath, name: route.name, metrics, issues, screenshot }
}

async function exercisePublicRegressions(context) {
  const page = await context.newPage()
  try {
    const apkUrl = '**/downloads/spagent-release.apk'
    const html = (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    await page.route(apkUrl, html)
    await page.goto(appUrl)
    await page.waitForURL('**/download')
    const unavailable = page.getByRole('button', { name: '安装包暂未上传' })
    await unavailable.waitFor()
    assert.ok(await unavailable.isDisabled())
    await page.unroute(apkUrl, html)

    await page.route(apkUrl, (route) => route.fulfill({
      contentType: 'application/vnd.android.package-archive',
    }))
    await page.reload()
    await page.getByRole('link', { name: '下载安卓版 APK' }).waitFor()
    await page.getByRole('link', { name: '使用网页版' }).click()
    await page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === '/coach')

    const loginUrl = '**/api/auth/login'
    const invalid = (route) => route.fulfill({
      status: 401,
      json: { error: { code: 'INVALID_CREDENTIALS', message: 'invalid email or password' } },
    })
    await page.route(loginUrl, invalid)
    await page.getByLabel('邮箱').fill('smoke-check@example.test')
    await page.getByLabel('密码', { exact: true }).fill('SyntheticSmoke!')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '邮箱或密码不正确' }).waitFor()
    await page.unroute(loginUrl, invalid)
    await page.route(loginUrl, (route) => route.abort('failed'))
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '暂时无法连接服务' }).waitFor()
  } finally {
    await page.close()
  }
}

async function exerciseRangeAndNavigation(context) {
  const page = await context.newPage()
  try {
    await page.goto(`${appUrl}/status/health?from=constructor`)
    const healthRange = page.getByRole('group', { name: '健康度时间范围' }).getByRole('button', { name: '6个月' })
    const [healthResponse] = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url())
        return url.pathname === '/api/training/load-balance' && url.searchParams.get('range') === '6m'
      }),
      healthRange.click(),
    ])
    assert.ok(healthResponse.ok())
    assert.equal(await healthRange.getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await page.waitForURL(`${appUrl}/status`)

    const trendUrl = '**/api/stats/metric-trends?*'
    const failed = (route) => route.fulfill({ status: 503 })
    await page.route(trendUrl, failed)
    await page.goto(`${appUrl}/status/trends?from=explore`)
    await page.getByText('趋势加载失败', { exact: true }).waitFor()
    await page.unroute(trendUrl, failed)
    const trendRange = page.getByRole('group', { name: '趋势时间范围' }).getByRole('button', { name: '6个月' })
    const [trendResponse] = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url())
        return url.pathname === '/api/stats/metric-trends' && url.searchParams.get('range') === '6m'
      }),
      trendRange.click(),
    ])
    assert.ok(trendResponse.ok())
    assert.equal(await trendRange.getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await page.waitForURL(`${appUrl}/explore`)
  } finally {
    await page.close()
  }
}

async function exerciseCoachWorkspace(page) {
  await page.goto(`${appUrl}/coach`)
  const menu = page.getByRole('dialog', { name: 'SpAgent 工作区' })
  const trigger = page.getByRole('button', { name: '打开工作区菜单' })
  const composer = page.getByRole('textbox', { name: '给教练发消息' })
  await composer.waitFor()
  assert.equal(await menu.isVisible(), false)
  await trigger.click()
  await menu.getByRole('link', { name: '数据同步' }).waitFor()
  await page.screenshot({ path: path.join(screenshotDir, 'coach-drawer.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '打开工作区菜单', expanded: false }).waitFor()

  const question = '我最近一次跑步是哪天？'
  let release
  const hold = new Promise(resolve => { release = resolve })
  const messageEndpoint = /\/api\/agent\/conversations\/\d+\/messages$/
  const delayReply = async route => {
    if (route.request().method() === 'POST') await hold
    await route.continue()
  }
  await page.route(messageEndpoint, delayReply)
  try {
    await composer.fill(question)
    await page.getByRole('button', { name: '发送消息' }).click()
    await page.getByRole('log').getByText(question, { exact: true }).waitFor()
    await page.getByRole('status', { name: '教练正在回复' }).waitFor()
    release()
    await page.getByRole('log').getByRole('article', { name: 'AI 教练' }).waitFor()
    assert.equal(await page.getByRole('log').getByText(question, { exact: true }).count(), 1)
    assert.equal(await page.getByRole('button', { name: /确认保存|确认调整/ }).count(), 0)
  } finally {
    release()
    await page.unroute(messageEndpoint, delayReply)
  }

  await composer.fill('这段草稿稍后发送')
  const historyTab = page.getByRole('tab', { name: '历史' })
  const filesTab = page.getByRole('tab', { name: '附件' })
  const chatTab = page.getByRole('tab', { name: '对话' })
  await historyTab.click()
  await page.getByRole('tabpanel', { name: '历史' }).getByRole('button', { name: question }).waitFor()
  assert.equal(await composer.isVisible(), false)
  await historyTab.press('ArrowRight')
  await page.getByRole('tabpanel', { name: '附件' }).getByText('当前对话暂无附件。').waitFor()
  assert.equal(await filesTab.getAttribute('aria-selected'), 'true')
  await chatTab.click()
  assert.equal(await composer.inputValue(), '这段草稿稍后发送')
  await trigger.click()
  await menu.getByRole('link', { name: '我的运动' }).waitFor()
  assert.equal(await menu.getByRole('button', { name: '新对话' }).count(), 0)
  await menu.getByRole('link', { name: '我的运动' }).click()
  await page.waitForURL('**/activities')
  await menu.waitFor({ state: 'hidden' })
  await trigger.click()
  await menu.getByRole('link', { name: 'AI 教练' }).click()
  await page.waitForURL('**/coach')
  await page.getByRole('log').getByText(question, { exact: true }).waitFor()
  await page.screenshot({ path: path.join(screenshotDir, 'coach-conversation.png') })
}

async function run() {
  await mkdir(screenshotDir, { recursive: true })

  const browserExecutable = resolveBrowserExecutable()
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserExecutable,
    args: shouldExerciseGps ? [
      `--unsafely-treat-insecure-origin-as-secure=${appUrl}`,
    ] : [],
  })
  const context = await browser.newContext({
    viewport: { width: Number(process.env.UI_SMOKE_VIEWPORT_WIDTH || 430), height: 932 },
    permissions: shouldExerciseGps ? ['geolocation'] : [],
    geolocation: shouldExerciseGps
      ? { latitude: 31.2304, longitude: 121.4737, accuracy: 12 }
      : undefined,
  })
  const page = await context.newPage()
  const events = await collectBrowserEvents(page)
  const state = { manualActivityPath: '' }
  let badgeText = ''
  let account = null
  let adminAccount = null
  let routeResults = []

  try {
    await exercisePublicRegressions(context)
    await page.goto(`${appUrl}/download`, { waitUntil: 'networkidle', timeout: 20000 })
    const badge = page.locator('.server-health-badge').filter({ hasText: '服务在线' })
    await badge.waitFor({ timeout: 8000 })
    badgeText = await badge.innerText()
    await page.screenshot({ path: path.join(screenshotDir, 'download.png'), fullPage: true })

    if (shouldAuditGuards) {
      for (const route of [...authRoutes, ...adminRoutes]) {
        const target = route.path === '/activities/' ? '/activities/1' : route.path
        await page.goto(`${appUrl}${target}`)
        await page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === target)
      }
    }

    if (shouldRegister) {
      account = await registerAccount(page)
      if (shouldExerciseGps) {
        await exerciseLiveWorkout(page)
      }
      await exerciseManualActivity(page, state)
      await exerciseShoeFlow(page)
      await exerciseSettingsFlow(page)
      await exerciseRangeAndNavigation(context)
      await exerciseCoachWorkspace(page)

      let counter = 1
      for (const route of authRoutes) {
        routeResults.push(await auditRoute(page, route, counter++, state))
      }

      if (adminEmail && adminPassword) {
        adminAccount = await loginAccount(page, { email: adminEmail, password: adminPassword })
        await exerciseAdminUserFlow(page)
        for (const route of adminRoutes) {
          routeResults.push(await auditRoute(page, route, counter++, state))
        }
      } else if (shouldRequireAdminAudit) {
        throw new Error('Admin route audit requires UI_SMOKE_ADMIN_EMAIL and UI_SMOKE_ADMIN_PASSWORD')
      }
    }
  } finally {
    await browser.close()
  }

  if (events.length) {
    throw new Error(`Browser reported errors:\n${events.join('\n')}`)
  }

  const routeIssues = routeResults.flatMap((result) => result.issues.map((issue) => `${result.name}:${issue}`))
  if (routeIssues.length) {
    throw new Error(`UI route audit failed:\n${routeIssues.join('\n')}`)
  }

  console.log(JSON.stringify({
    ok: true,
    url: appUrl,
    badge: badgeText,
    account: account ? { username: account.username, email: account.email } : null,
    adminAccount: adminAccount ? { email: adminAccount.email } : null,
    manualActivityPath: state.manualActivityPath || null,
    routesChecked: routeResults.length,
    screenshots: screenshotDir,
  }, null, 2))
}

run().catch((error) => {
  console.error(redact(error.stack || error.message))
  process.exit(1)
})
