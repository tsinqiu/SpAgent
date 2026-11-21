import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

const [
  appCss,
  coachView,
  coachPlanAgent,
  adminView,
  mainSource,
  statusView,
  todayView,
  trainingLoadView,
  activitiesView,
  activityCard,
  manualActivityModal,
  activityDetailView,
  lapTable,
  sessionDetails,
  zoneDistribution,
  healthDetailView,
  recordsView,
  recordActivityView,
  calendarView,
  statisticsView,
  startWorkoutView,
  meView,
  securityView,
  settingsView,
  syncView,
  shoesView,
  loginView,
  registerView,
  appShell,
] = await Promise.all([
  source('src/assets/app.css'),
  source('src/views/Coach.vue'),
  source('src/components/CoachPlanAgent.vue'),
  source('src/views/Admin.vue'),
  source('src/main.js'),
  source('src/views/Status.vue'),
  source('src/views/Today.vue'),
  source('src/views/TrainingLoad.vue'),
  source('src/views/Activities.vue'),
  source('src/components/ActivityCard.vue'),
  source('src/components/ManualActivityModal.vue'),
  source('src/views/ActivityDetail.vue'),
  source('src/components/LapTable.vue'),
  source('src/components/SessionDetails.vue'),
  source('src/components/ZoneDistribution.vue'),
  source('src/views/HealthDetail.vue'),
  source('src/views/Records.vue'),
  source('src/views/RecordActivity.vue'),
  source('src/views/Calendar.vue'),
  source('src/views/Statistics.vue'),
  source('src/views/StartWorkout.vue'),
  source('src/views/Me.vue'),
  source('src/views/Security.vue'),
  source('src/views/Settings.vue'),
  source('src/views/Sync.vue'),
  source('src/views/Shoes.vue'),
  source('src/views/Login.vue'),
  source('src/views/Register.vue'),
  source('src/components/AppShell.vue'),
])

test('phone frame is a 430px named inline-size container', () => {
  assert.match(appCss, /--phone-max:\s*430px/)
  assert.match(appCss, /\.phone-frame\s*\{[\s\S]*?container-name:\s*phone-frame/)
  assert.match(appCss, /\.phone-frame\s*\{[\s\S]*?container-type:\s*inline-size/)
})

test('layout responds to compact and large phone container widths', () => {
  assert.match(appCss, /@container\s+phone-frame\s*\(max-width:\s*374px\)/)
  assert.match(appCss, /@container\s+phone-frame\s*\(min-width:\s*410px\)/)
})

test('phone content and form controls are allowed to shrink', () => {
  assert.match(appCss, /\.phone-frame\s+\.page-stack\s*\{[\s\S]*?min-width:\s*0/)
  assert.match(appCss, /\.phone-frame\s+:is\([^}]*input[^}]*textarea[^}]*select[^}]*\)\s*\{[\s\S]*?min-width:\s*0/)
})

test('coach keeps the composer visible and scrolls only the conversation', () => {
  assert.match(coachPlanAgent, /\.plan-agent\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/)
  assert.match(coachPlanAgent, /\.plan-agent__thread\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/)
  assert.match(coachPlanAgent, /\.plan-agent__composer\s*\{[^}]*grid-template-columns:\s*40px\s+minmax\(0,\s*1fr\)\s+(?:44px|auto)/)
  assert.match(coachPlanAgent, /overflow-wrap:\s*anywhere/)
})

test('admin users render as mobile cards with a Vant confirmation dialog', () => {
  assert.doesNotMatch(adminView, /<table[\s>]/)
  assert.match(adminView, /class="admin-user-list"/)
  assert.match(adminView, /class="admin-user-card"/)
  assert.match(adminView, /showConfirmDialog/)
})

test('admin page opens as a mobile permission operations dashboard', () => {
  assert.match(adminView, /权限总览/)
  assert.match(adminView, /账号运营/)
  assert.match(adminView, /可用账号/)
  assert.match(adminView, /管理员/)
  assert.match(adminView, /停用保护/)
  assert.match(adminView, /admin-rq-panel/)
  assert.match(adminView, /admin-metric-grid/)
  assert.match(adminView, /admin-create-card/)
  assert.match(adminView, /admin-users-panel/)
  assert.match(adminView, /\.admin-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(adminView, /\.admin-metric-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(adminView, /\.admin-create-card\s*\{[\s\S]*?border-top:\s*4px solid/)
})

test('personal record rows reserve fluid space for both labels and values', () => {
  assert.match(appCss, /\.records-grid\s*\{[^}]*grid-template-columns:\s*1fr/)
  assert.match(
    appCss,
    /\.record-list\s+button\s*\{[\s\S]*?grid-template-columns:\s*minmax\(72px,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+18px/,
  )
})

test('the persisted theme is initialized before any route renders', () => {
  assert.match(mainSource, /import\s*\{\s*initTheme\s*\}\s*from\s*['"]@\/composables\/useThemeMode['"]/)
  assert.match(mainSource, /initTheme\(\)[\s\S]*createApp\(App\)/)
})

test('mobile shell scrolls its content and accounts for device safe areas', () => {
  assert.match(appCss, /--safe-top:\s*env\(safe-area-inset-top,\s*0px\)/)
  assert.match(appCss, /--safe-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/)
  assert.match(appCss, /\.workspace-navbar\s*\{[^}]*padding:\s*calc\(4px \+ var\(--safe-top\)\)/)
  assert.match(appCss, /\.workspace-menu__navigation\s*\{[^}]*var\(--safe-bottom\)/)
  assert.match(coachPlanAgent, /\.plan-agent__tabs\s*\{[^}]*var\(--safe-bottom\)/)
  assert.match(appCss, /\.phone-frame\s+\.page-frame\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/)
})

test('nested page shortcuts and menu trigger have accessible names', () => {
  assert.match(appShell, /<button\b[^>]*:aria-label="pageAction\.label"[^>]*@click="handlePageAction"/)
  assert.match(appShell, /aria-label="打开工作区菜单"[^>]*aria-haspopup="dialog"[^>]*aria-controls="workspace-menu"/)
  assert.match(appShell, /<dialog id="workspace-menu"/)
  assert.match(appShell, /menu\.value\?\.showModal\(\)/)
  assert.doesNotMatch(appShell, /<van-tabbar\b/)
})

test('workspace menus support reduced motion and have a named close action', () => {
  assert.match(appCss, /prefers-reduced-motion:\s*reduce[\s\S]*?\.workspace-menu\[open\]\s*\{\s*animation:\s*none/)
  assert.match(appShell, /aria-label="关闭菜单"[^>]*@click="closeMenu"/)
  assert.match(appCss, /\.workspace-menu\[open\]\.is-closing\s*\{[^}]*workspace-menu-out/)
  assert.match(appShell, /@cancel\.prevent="closeMenu"[\s\S]*?@animationend\.self="finishMenuAnimation"/)
})

test('status page shows recovery data and opens running-power details', () => {
  for (const metric of ['sleepScore', 'restingHeartRateBpm', 'avgStressLevel', 'avgHrv']) {
    assert.match(statusView, new RegExp('<MetricCard\\b[^>]*metricValue\\(health\\.' + metric + '\\b'))
  }
  assert.match(statusView, /<button\b[^>]*@click="goPerformanceDetail"/)
  assert.match(statusView, /function goPerformanceDetail\(\)\s*\{[^}]*router\.push\('\/status\/performance'\)/)
  assert.match(statusView, /getPerformanceProfile\(\)/)
})

test('status page includes an RQ-style running power score band', () => {
  assert.match(statusView, /当前跑力/)
  assert.match(statusView, /跑力等级/)
  assert.match(statusView, /rq-score-panel/)
  assert.match(statusView, /score-band/)
  assert.match(appCss, /\.rq-score-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.score-band__marker\s*\{[\s\S]*?left:\s*var\(--score-position\)/)
})

test('status page mirrors runner five-power analysis with radar and load bars', () => {
  assert.match(statusView, /跑步五力/)
  assert.match(statusView, /五力分析图/)
  assert.match(statusView, /rq-five-power-panel/)
  assert.match(statusView, /rq-five-power-radar/)
  assert.match(statusView, /rq-load-bars/)
  assert.match(statusView, /rqPowerAxes/)
  assert.match(statusView, /recentLoadBars/)
  assert.match(statusView, /耐力/)
  assert.match(statusView, /速度/)
  assert.match(statusView, /技术/)
  assert.match(statusView, /肌力/)
  assert.match(statusView, /稳定/)
  assert.match(appCss, /\.rq-five-power-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.rq-five-power-radar\s*\{[\s\S]*?aspect-ratio:\s*1/)
  assert.match(appCss, /\.rq-load-bars\s+i\s*\{[\s\S]*?height:\s*var\(--bar-height\)/)
})

test('today shows the calculated training index and coaching guidance', () => {
  assert.match(todayView, /<strong[^>]*>\{\{\s*trainingIndexDisplay\s*\}\}<\/strong>/)
  assert.match(todayView, /\{\{\s*compactTrainingAdvice\s*\}\}/)
  assert.match(todayView, /const trainingIndexDisplay = computed\([^\n]*trainingIndexScore\.value \?\? '--'/)
  assert.match(todayView, /getPerformanceProfile\(\)/)
  assert.match(todayView, /getDailyBrief\(\)/)
})

test('main product pages use the shared navigation and keep shortcuts to training plans', () => {
  for (const view of [todayView, activitiesView, statusView, coachView, statisticsView]) {
    assert.doesNotMatch(view, /rq-page-tabs/)
  }
  assert.match(todayView, /<nav\b[^>]*aria-label="今日快捷入口"/)
  assert.match(todayView, /<RouterLink\b[^>]*v-for="item in todayActions"[^>]*:to="item\.to"/)
  assert.match(todayView, /path:\s*'\/training-plans',\s*query:\s*\{\s*from:\s*'today'\s*\}/)
})

test('status subpages stay page-scoped without old secondary navigation or cross-page CTAs', () => {
  const statusSubpageViews = [healthDetailView, trainingLoadView, calendarView, recordsView]

  for (const view of statusSubpageViews) {
    assert.doesNotMatch(view, /rq-page-tabs/)
    assert.doesNotMatch(view, /to="\/record"|router\.push\('\/record'\)|action-label="记录运动"/)
    assert.doesNotMatch(view, /to="\/me\/sync"|router\.push\('\/me\/sync'\)|action-label="前往同步"/)
  }

  assert.doesNotMatch(healthDetailView, /health-empty-actions/)
})

test('activity filters and coach actions fit beside flexible content', () => {
  assert.match(activitiesView, /<button\b[^>]*@click="filterOpen = true"/)
  assert.match(activitiesView, /\.feed-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/)
  assert.match(activitiesView, /\.feed-toolbar__tabs\s*\{[^}]*min-width:\s*0/)
  assert.match(coachPlanAgent, /\.plan-agent__composer textarea\s*\{[^}]*min-width:\s*0/)
})

test('today page exposes an RQ-style weekly training rhythm panel', () => {
  assert.match(todayView, /本周训练节奏/)
  assert.match(todayView, /周负荷/)
  assert.match(todayView, /有负荷记录/)
  assert.doesNotMatch(todayView, /完成度|今日无训练安排/)
  assert.match(todayView, /row\.dailyTrainingLoad \?\? row\.daily_training_load \?\? 0/)
  assert.match(todayView, /microcycle-panel/)
  assert.match(todayView, /microcycle-bars/)
  assert.match(todayView, /weeklyLoadBars/)
  assert.match(todayView, /weekSummary/)
  assert.match(todayView, /\.microcycle-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(todayView, /\.microcycle-bars\s+i\s*\{[\s\S]*?height:\s*var\(--bar-height\)/)
})

test('today lets users step through dates and shows an empty state for days without activities', () => {
  assert.match(todayView, /<button\b[^>]*aria-label="前一天"[^>]*@click="shiftSelectedDate\(-1\)"/)
  assert.match(todayView, /<button\b[^>]*:disabled="!canShiftNextDate"[^>]*@click="shiftSelectedDate\(1\)"/)
  assert.match(todayView, /<ActivityCard\s+v-for="activity in selectedDateActivities"/)
  assert.match(todayView, /<article\b[^>]*v-else[^>]*class="today-no-activity-row"/)
  assert.match(todayView, /<StateBlock[\s\S]*?@action="loadToday"/)
})

test('training load page presents training index and pace zones like a runner analysis tool', () => {
  assert.match(trainingLoadView, /训练指数/)
  assert.match(trainingLoadView, /配速区间/)
  assert.match(trainingLoadView, /training-index-panel/)
  assert.match(trainingLoadView, /pace-zone-panel/)
  assert.match(trainingLoadView, /load-score-band/)
  assert.match(trainingLoadView, /formatLoadDateLabel/)
  assert.match(trainingLoadView, /containLabel:\s*true/)
  assert.match(trainingLoadView, /showMaxLabel:\s*false/)
  assert.match(trainingLoadView, /hideOverlap:\s*true/)
})

test('training load labels pair metric acronyms with plain language', () => {
  for (const source of [todayView, statusView, healthDetailView]) {
    for (const label of ['体能（CTL）', '疲劳（ATL）', '状态（TSB）']) {
      assert.ok(source.includes(label), 'Missing training load label ' + label)
    }
  }
  assert.match(trainingLoadView, /训练指数/)
  assert.match(trainingLoadView, /配速区间/)
  assert.match(trainingLoadView, /体感强度/)

  const weather = todayView.match(/<section\b[^>]*class="today-weather-card"[^>]*>[\s\S]*?<\/section>/)?.[0]
  assert.ok(weather)
  assert.doesNotMatch(weather, /<button\b|开启定位/)
})

test('health and training summaries present available metrics with descriptive labels', () => {
  for (const label of ['睡眠', '静息心率', '心率变异']) {
    assert.ok(statusView.includes(label), 'Missing recovery indicator ' + label)
  }
  assert.match(healthDetailView, /暂无训练负荷数据/)
  assert.match(trainingLoadView, /部分健康指标暂时不可用/)
  assert.match(trainingLoadView, /体感强度/)
})

test('activity and status metric names give context for displayed units', () => {
  assert.match(statusView, /aria-label="跑步五力雷达"/)
  assert.doesNotMatch(statusView, /(?:>|aria-label=|title=)\s*["']?[^\n<]*(?:RQ五力|RQrun)/)
  assert.match(activityDetailView, /createLineOption\('心率', 'bpm'/)
  assert.match(activityDetailView, /createLineOption\('功率', 'W'/)
  assert.match(statisticsView, /label: '平均心率', unit: 'bpm'/)
  assert.match(lapTable, /心率/)
  assert.match(sessionDetails, /心率/)
  assert.match(zoneDistribution, /心率区间/)
  assert.match(zoneDistribution, /功率区间/)
})

test('training load empty state never renders NaN in the score header', () => {
  assert.match(trainingLoadView, /currentLoadDisplay/)
  assert.match(trainingLoadView, /isCurrentLoadAvailable/)
  assert.match(trainingLoadView, /training-index-panel--empty/)
  assert.doesNotMatch(trainingLoadView, /<h2>\{\{\s*currentLoad\s*\}\}<\/h2>/)
})

test('status empty state keeps RQ-style analysis affordances visible', () => {
  assert.match(statusView, /status-empty-rq-panel/)
  assert.match(statusView, /等待跑力/)
  assert.match(statusView, /恢复概览/)
  assert.match(statusView, /训练负荷/)
  assert.match(statusView, /空态也保留/)
  assert.match(statusView, /\.status-empty-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('activity feed renders cards with separate keyboard behavior for nested actions', () => {
  assert.match(activitiesView, /<ActivityCard[\s\S]*?:activity="activity"[\s\S]*?@select="goToActivity"/)
  assert.match(activitiesView, /@click\.stop="openEdit\(activity\)"/)
  assert.match(activitiesView, /@click\.stop="removeManual\(activity\)"/)
  assert.match(activityCard, /role="button"\s+tabindex="0"/)
  assert.match(activityCard, /@keydown\.enter\.self=/)
  assert.match(activityCard, /@keydown\.space\.self\.prevent=/)
})

test('activity detail keeps metrics and splits available and wraps long titles', () => {
  assert.match(activityDetailView, /aria-label="运动详情页签"/)
  assert.match(activityDetailView, /activeTab === 'analysis'/)
  assert.match(activityDetailView, /activeTab === 'splits'|class="detail-tab-panel splits-tab"/)
  assert.match(activityDetailView, /<h1>\{\{\s*activityTitle\s*\}\}<\/h1>/)
  assert.match(activityDetailView, /\.activity-title-card h1\s*\{[^}]*overflow-wrap:\s*anywhere/)
})

test('activity detail provides item actions with touch targets and shell navigation', () => {
  assert.match(activityDetailView, /aria-label="运动操作"/)
  assert.match(activityDetailView, /<ManualActivityModal\b/)
  assert.match(activityDetailView, /@click="removeActivity"/)
  assert.match(activityDetailView, /\.detail-action-row button\s*\{[^}]*min-height:/)
  assert.doesNotMatch(activityDetailView, /to="\/activities"|detail-action--back/)
})

test('coach uses the unified chat component and names the responding provider', () => {
  assert.match(coachView, /<CoachPlanAgent\b/)
  assert.match(coachPlanAgent, /DeepSeek 暂时不可用 · 本地回复/)
})

test('primary app pages use Chinese labels for key operations', () => {
  for (const [view, label] of [
    [todayView, '今日快捷入口'],
    [coachPlanAgent, '给教练发消息'],
    [activityDetailView, '运动操作'],
    [syncView, '同步动态'],
    [statisticsView, '趋势指标'],
  ]) {
    assert.ok(view.includes(label), 'Missing UI label ' + label)
  }
  for (const view of [todayView, coachView, activityDetailView, syncView, statisticsView, lapTable, sessionDetails, zoneDistribution]) {
    assert.doesNotMatch(view, />\s*(?:Training Rhythm|AI Coach|Daily Brief|AI Analysis|Sign in|Achievements)\s*</)
  }
})

test('health detail filters training load by a single labeled range control', () => {
  assert.match(healthDetailView, /role="group" aria-label="健康度时间范围"/)
  assert.match(healthDetailView, /:aria-pressed="range === item\.value"/)
  assert.match(healthDetailView, /@click="range = item\.value"/)
  assert.match(healthDetailView, /getLoadBalance\(\{ range: activeRange\.value\.value \}\)/)
  assert.match(healthDetailView, /watch\(range, load/)
  assert.doesNotMatch(healthDetailView, /aria-label="(?:上一周期|下一周期)"/)
})

test('health detail distinguishes empty training data from a retryable request failure', () => {
  assert.match(healthDetailView, /v-else-if="error"[^>]*title="健康度加载失败"[^>]*@action="load"/)
  assert.match(healthDetailView, /v-else-if="!chartRows.length"[^>]*title="暂无训练负荷数据"/)
  assert.match(healthDetailView, /if \(version === loadVersion\) trainingLoad\.value =/)
  assert.match(healthDetailView, /<ChartPanel\b/)
})

test('records page presents personal bests as a compact ability profile', () => {
  assert.match(recordsView, /能力档案/)
  assert.match(recordsView, /成绩曲线/)
  assert.match(recordsView, /最佳配速/)
  assert.match(recordsView, /record-power-panel/)
  assert.match(recordsView, /record-profile-grid/)
  assert.match(appCss, /\.record-power-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('record page wires live recording and the manual activity form', () => {
  assert.match(recordActivityView, /<StartWorkout\b[^>]*@add-manual="manualOpen = true"/)
  assert.match(recordActivityView, /<ManualActivityModal\s+v-if="manualOpen"[\s\S]*?:save="createManualActivity"/)
  assert.match(recordActivityView, /@saved="openSavedActivity"/)
  assert.match(recordActivityView, /router\.push\(\{ name: 'activity-detail', params: \{ id: activity\.id \} \}\)/)
})

test('manual activity modal opens as a training capture panel', () => {
  assert.match(manualActivityModal, /训练采集/)
  assert.match(manualActivityModal, /关键指标/)
  assert.match(manualActivityModal, /运动负荷/)
  assert.match(manualActivityModal, /manual-rq-modal/)
  assert.match(manualActivityModal, /manual-capture-panel/)
  assert.match(manualActivityModal, /manual-capture-grid/)
  assert.match(manualActivityModal, /manual-form-section/)
  assert.match(manualActivityModal, /manual-form-actions/)
  assert.match(manualActivityModal, /\.manual-rq-modal\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(manualActivityModal, /\.manual-capture-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(manualActivityModal, /\.manual-form-section\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
})

test('calendar shows the selected month and reloads its training totals', () => {
  assert.match(calendarView, /运动日历/)
  assert.match(calendarView, /aria-label="本月训练概览"/)
  assert.match(calendarView, /watch\(month, load/)
  assert.match(calendarView, /@action="load"/)
  assert.match(calendarView, /\.calendar-stat-grid\s*\{[^}]*grid-template-columns:/)
})

test('trends support sport and range filtering and separate failures from empty data', () => {
  assert.match(statisticsView, /aria-label="运动类型筛选"/)
  assert.match(statisticsView, /role="group" aria-label="趋势时间范围"/)
  assert.match(statisticsView, /:aria-pressed="range === item\.value"/)
  assert.match(statisticsView, /watch\(\[range, activityType\], load/)
  assert.match(statisticsView, /getMetricTrends\(\{[^}]*range: range\.value,[^}]*activity_type: activityType\.value/)
  assert.match(statisticsView, /if \(version !== loadVersion\) return/)
  assert.match(statisticsView, /v-else-if="error"[^>]*title="趋势加载失败"[^>]*@action="load"/)
  assert.match(statisticsView, /title="暂无趋势数据"/)
  assert.doesNotMatch(statisticsView, /aria-label="(?:上一周期|下一周期)"/)
})

test('live workout records GPS and keeps manual entry separate when recording', () => {
  assert.match(startWorkoutView, /aria-label="实时运动数据"/)
  assert.match(startWorkoutView, /aria-label="手动添加运动"[^>]*:disabled="sportLocked \|\| busy"[^>]*@click="\$emit\('add-manual'\)"/)
  assert.match(startWorkoutView, /@click="toggleRecording"/)
  assert.match(startWorkoutView, /if \(current\.status === 'paused'\) workout\.value = await resumeWorkout/)
  assert.match(startWorkoutView, /:disabled="busy \|\| !workout \|\| elapsed < 1 \|\| trackPoints.length === 0" @click="finish"/)
  assert.match(startWorkoutView, /结束并保存/)
  assert.match(startWorkoutView, /function handleLocation\(position\)[\s\S]*error\.value = ''/)
  assert.match(startWorkoutView, /function handleLocationError\(err\)[\s\S]*trackPoints\.value\.length > 0[\s\S]*定位不稳定/)
  assert.match(startWorkoutView, /navigator\.geolocation\.watchPosition/)
  assert.match(startWorkoutView, /latitude/)
  assert.match(startWorkoutView, /longitude/)
  assert.match(startWorkoutView, /appendWorkoutTrackPoints/)
  assert.doesNotMatch(startWorkoutView, /定位功能后续接入/)
})

test('profile page presents the account as a runner profile dashboard', () => {
  assert.match(meView, /跑者档案/)
  assert.doesNotMatch(meView, /目标赛事|targetRace|getRaceCountdown|race-card/)
  assert.match(meView, /个人服务/)
  assert.match(meView, /数据同步/)
  assert.match(meView, /跑鞋/)
  assert.match(meView, /profile-rq-panel/)
  assert.match(meView, /runner-profile-grid/)
  assert.match(appCss, /\.profile-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('profile, settings, and security pages allow long account text to fit', () => {
  assert.match(meView, /class="profile-meta__name"/)
  assert.match(meView, /\.profile-meta__name\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/)
  assert.match(appCss, /\.profile-head__main\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/)
  assert.match(settingsView, /\.profile-setting-card :is\(input, select\)\s*\{[^}]*min-width:\s*0/)
  assert.match(securityView, /security-log-list__value/)
  assert.match(appCss, /\.security-log-list__value\s*\{[^}]*overflow-wrap:\s*anywhere/)
})

test('security page opens as a runner data protection dashboard', () => {
  assert.match(securityView, /数据保护/)
  assert.match(securityView, /保护指数/)
  assert.match(securityView, /登录状态/)
  assert.match(securityView, /数据范围/)
  assert.match(securityView, /设备保护/)
  assert.match(securityView, /退出设备/)
  assert.match(securityView, /security-rq-panel/)
  assert.match(securityView, /security-protection-score/)
  assert.match(securityView, /security-protection-grid/)
  assert.match(securityView, /security-device-card/)
  assert.match(appCss, /\.security-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(appCss, /\.security-protection-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
})

test('settings saves athlete profile and training preferences', () => {
  for (const label of ['个人信息', '身体数据', '偏好设置', '生理指标', '性能阈值', '体能水平']) {
    assert.ok(settingsView.includes(label), 'Missing profile setting section ' + label)
  }
  assert.match(settingsView, /@submit\.prevent="save"/)
  assert.match(settingsView, /type="submit" :disabled="saving"/)
  assert.match(settingsView, /设置已保存。/)
  assert.match(settingsView, /设置保存失败/)
})

test('sync shows Garmin connection state and activity history', () => {
  assert.match(syncView, /连接你的 Garmin 账号/)
  assert.match(syncView, /Garmin 已连接.*等待绑定账号/)
  assert.match(syncView, /v-if="account\.exists"[^>]*sync-connection-panel/)
  assert.match(syncView, /更新 Garmin 绑定.*绑定 Garmin/)
  assert.match(syncView, /最近同步/)
  assert.match(syncView, /同步动态/)
  assert.match(syncView, /<StateBlock\b/)
})

test('sync page disabled actions keep mobile breathing room', () => {
  assert.match(syncView, /v-if="account\.exists"[\s\S]*class="sync-actions"/)
  assert.match(syncView, /class="primary-link sync-action-primary"/)
  assert.match(syncView, /class="danger-link sync-action-danger"/)
  assert.doesNotMatch(syncView, /:disabled="busy \|\| !account\.exists"/)
  assert.match(appCss, /\.sync-actions\s*\{[\s\S]*?padding-bottom:\s*var\(--space-4\)/)
})

test('shoes page acts as an equipment mileage dashboard', () => {
  assert.match(shoesView, /装备看板/)
  assert.match(shoesView, /总里程/)
  assert.match(shoesView, /服役跑鞋/)
  assert.match(shoesView, /shoe-rq-panel/)
  assert.match(shoesView, /shoe-mileage-grid/)
  assert.match(appCss, /\.shoe-rq-panel\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
})

test('shoes empty state keeps an equipment readiness panel', () => {
  assert.match(shoesView, /当前还没有绑定跑鞋/)
  assert.match(shoesView, /装备健康/)
  assert.match(shoesView, /磨损预警/)
  assert.match(shoesView, /下一双跑鞋/)
  assert.match(shoesView, /shoe-empty-stage/)
  assert.match(shoesView, /shoe-empty-track/)
  assert.match(shoesView, /shoe-empty-grid/)
  assert.doesNotMatch(shoesView, /先记录运动/)
  assert.doesNotMatch(shoesView, /to="\/record"/)
  assert.match(shoesView, /\.shoe-empty-stage\s*\{[\s\S]*?border-top:\s*4px solid var\(--app-green\)/)
  assert.match(shoesView, /\.shoe-empty-track__bar i\s*\{[\s\S]*?width:\s*42%/)
  assert.match(shoesView, /\.shoe-empty-actions\s*\{[\s\S]*?grid-template-columns:\s*1fr/)
})

test('login provides account and recovery controls without fake readiness metrics', () => {
  assert.match(loginView, /欢迎回来/)
  assert.match(loginView, /autocomplete="email"/)
  assert.match(loginView, /autocomplete="current-password"/)
  assert.match(loginView, /隐藏密码.*显示密码/)
  assert.match(loginView, /name: 'register'/)
  assert.doesNotMatch(loginView, /今日跑力|auth-runner-grid|>68</)
})

test('registration requires account details and confirmation without unrelated fields', () => {
  assert.match(registerView, /注册 SpAgent/)
  assert.match(registerView, /autocomplete="username"/)
  assert.match(registerView, /autocomplete="email"/)
  assert.match(registerView, /v-model="form.confirmPassword"/)
  assert.match(registerView, /form\.password !== form\.confirmPassword/)
  assert.match(registerView, /name: 'login'/)
  assert.doesNotMatch(registerView, /数据源|训练目标/)
})
