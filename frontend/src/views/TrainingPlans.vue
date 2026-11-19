<template>
  <div
    class="training-plan-page"
    :class="{
      'training-plan-page--detail': selectedPlan,
      'training-plan-page--empty': !selectedPlan && !loading && !loadError && plans.length === 0,
    }"
  >
    <StateBlock v-if="loadError" title="训练计划加载失败" :message="loadError" tone="danger" action-label="重试" @action="refreshPlans" />
    <StateBlock v-else-if="loading" title="正在加载训练计划" message="正在读取已保存的训练安排。" />
    <template v-else-if="selectedPlan">
      <header class="training-detail-hero">
        <span class="training-detail-icon" :style="{ '--plan-color': typeMeta(selectedPlan.type).color }">
          <component :is="typeMeta(selectedPlan.type).icon" :size="32" aria-hidden="true" />
        </span>
        <div>
          <h2>{{ selectedPlan.name }}</h2>
          <p>{{ selectedPlan.goal }}</p>
          <p v-if="selectedPlan.weeklyFrequency">每周 {{ selectedPlan.weeklyFrequency }} 次</p>
          <span>{{ statusLabels[selectedPlan.status] }} · {{ selectedDetailWeek.phase }}</span>
        </div>
      </header>

      <nav class="training-detail-weeks" aria-label="训练周次">
        <button
          v-for="week in selectedPlan.weeks"
          :key="week.week"
          type="button"
          :class="{ active: detailActiveWeek === week.week }"
          :aria-pressed="detailActiveWeek === week.week"
          @click="detailActiveWeek = week.week"
        >
          <Check v-if="detailActiveWeek === week.week" :size="18" aria-hidden="true" />
          W{{ week.week }}
        </button>
      </nav>

      <section class="training-detail-workouts" aria-label="本周训练安排">
        <article v-for="workout in selectedDetailWeek.days" :key="workout.date">
          <span :title="weekdayNames[weekday(workout.date)]">{{ workout.date.slice(5) }}</span>
          <div class="training-workout-content">
            <strong>{{ workout.title }}</strong>
            <p v-if="workout.subtitle || workout.distanceM || workout.durationS">{{ sessionSummary(workout) }}</p>
            <small v-if="workout.note">{{ workout.note }}</small>
            <div v-if="workout.id && (selectedPlan.status === 'active' || workout.status !== 'pending')" class="training-workout-controls">
              <span>{{ sessionLabels[workout.status] }}</span>
              <template v-if="selectedPlan.status === 'active'">
                <template v-if="workout.status === 'pending'">
                  <button type="button" :disabled="busy" @click="recordSession(workout, 'completed')">标为完成</button>
                  <button type="button" :disabled="busy" @click="recordSession(workout, 'skipped')">跳过</button>
                </template>
                <button v-else type="button" :disabled="busy" @click="recordSession(workout, 'pending')">撤销状态</button>
              </template>
            </div>
          </div>
          <Info v-if="workout.note" :size="19" aria-hidden="true" />
        </article>
      </section>

      <div class="training-detail-actions">
        <button type="button" @click="closePlan">返回列表</button>
        <button v-if="selectedPlan.status === 'draft'" class="training-activate-btn" type="button" :disabled="busy" @click="startPlan(selectedPlan)">
          <Play :size="18" fill="currentColor" aria-hidden="true" />
          开始执行
        </button>
        <button v-if="selectedPlan.status !== 'archived'" type="button" :disabled="busy" @click="editPlan">编辑计划</button>
        <button v-if="selectedPlan.status === 'active'" type="button" :disabled="busy" @click="archivePlan">归档</button>
        <button v-if="selectedPlan.status === 'draft'" type="button" :disabled="busy" @click="removePlan">删除草稿</button>
      </div>
    </template>

    <template v-else>
      <section v-if="context" class="training-context" aria-label="近期训练数据">
        <h2>近期训练</h2>
        <div class="training-context-windows">
          <div v-for="window in context.windows" :key="window.days">
            <strong>近 {{ window.days }} 天</strong>
            <span>{{ window.running.activityCount ? `${window.running.activityCount} 次跑步 · ${contextDistance(window.running)}` : '暂无跑步记录' }}</span>
            <small>
              {{ window.running.trainingLoad == null ? '缺少训练负荷' : `负荷 ${window.running.trainingLoad}` }}
              · {{ window.recovery.sleepScore.average == null ? '缺少睡眠评分' : `睡眠均分 ${window.recovery.sleepScore.average}` }}
            </small>
            <small v-if="window.running.avgPaceSecPerKm != null">{{ formatPaceSeconds(window.running.avgPaceSecPerKm) }} / 公里</small>
            <small v-if="window.running.demoActivities || Object.values(window.recovery).some(metric => metric.demoSamples)">含合成演示数据</small>
          </div>
        </div>
      </section>
      <section v-if="plans.length === 0" class="training-empty-state">
        <span class="training-empty-icon">
          <CalendarDays :size="76" aria-hidden="true" />
        </span>
        <h2>暂无训练课表</h2>
        <p>导入常用计划，或按自己的日程创建。</p>
      </section>

      <template v-else>
        <section class="training-section-title">
          <span aria-hidden="true"></span>
          <h2>我的训练计划</h2>
        </section>

        <section class="training-plan-list" aria-label="已安排训练计划">
          <article
            v-for="plan in plans"
            :key="plan.id"
            class="training-plan-card"
            role="button"
            tabindex="0"
            @click="openPlan(plan)"
            @keydown.enter.self.prevent="openPlan(plan)"
            @keydown.space.self.prevent="openPlan(plan)"
          >
          <div class="training-plan-card__accent" aria-hidden="true"></div>
          <div class="training-plan-card__top">
            <span class="training-type-label" :style="{ '--plan-color': typeMeta(plan.type).color }">
              <component :is="typeMeta(plan.type).icon" :size="26" aria-hidden="true" />
              {{ typeMeta(plan.type).english }}
            </span>
            <span class="training-status-pill">{{ statusLabels[plan.status] }}</span>
          </div>

          <div class="training-plan-card__title">
            <h3>{{ plan.name }}</h3>
            <ChevronRight :size="28" aria-hidden="true" />
          </div>

          <div class="training-phase-grid">
            <span v-for="phase in phaseSummary(plan)" :key="phase.label">
              <i :style="{ background: phase.color }" aria-hidden="true"></i>
              <b>{{ phase.label }}</b>
              <small>{{ phase.range }}</small>
            </span>
          </div>

          <div class="training-progress-row">
            <div class="training-progress-track">
              <i :style="{ width: `${plan.progress || 0}%` }" aria-hidden="true"></i>
            </div>
            <b>{{ plan.progress || 0 }}%</b>
          </div>

          <div class="training-plan-card__bottom">
            <span>{{ plan.startDate }} · W{{ plan.currentWeek }} / {{ plan.weeks.length }}</span>
            <button v-if="plan.status === 'draft'" type="button" :disabled="busy" @click.stop="startPlan(plan)">
              <Play :size="18" fill="currentColor" aria-hidden="true" />
              开始执行
            </button>
          </div>
          </article>
        </section>
      </template>

      <div class="training-plan-actions">
        <button type="button" class="training-import-btn" @click="showImportSheet = true">
          <FolderOpen :size="22" aria-hidden="true" />
          导入常用计划
        </button>
        <button type="button" class="training-custom-btn" @click="openCustomCreator()">
          <Sparkles :size="22" aria-hidden="true" />
          自定义创建计划
        </button>
      </div>
    </template>

    <Teleport to=".phone-frame">
      <div v-if="showImportSheet" class="training-sheet-backdrop" role="presentation" @click.self="showImportSheet = false">
        <section class="training-sheet" role="dialog" aria-modal="true" aria-label="导入常用计划">
          <header>
            <strong>导入常用计划</strong>
            <button type="button" aria-label="关闭" @click="showImportSheet = false">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="training-template-list">
            <button v-for="goal in runningGoals" :key="goal.id" type="button" class="training-template-row" @click="openCustomCreator(goal)">
              <span :style="{ '--plan-color': typeMap.running.color }"><Activity :size="26" aria-hidden="true" /></span>
              <div><strong>{{ goal.name }}</strong><small>跑步 · 4周</small></div>
              <Plus :size="22" aria-hidden="true" />
            </button>
            <button
              v-for="course in trainingPlanTemplates"
              :key="course.id"
              type="button"
              class="training-template-row"
              :disabled="busy"
              @click="importTemplate(course)"
            >
              <span :style="{ '--plan-color': course.color }">
                <component :is="course.icon" :size="26" aria-hidden="true" />
              </span>
              <div>
                <strong>{{ course.name }}</strong>
                <small>{{ course.typeLabel }} · {{ course.weeks.length }}周</small>
              </div>
              <Plus :size="22" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </Teleport>

    <Teleport to=".phone-frame">
      <div v-if="customOpen" class="training-sheet-backdrop" role="presentation" @click.self="closeCustomCreator">
        <section class="training-sheet training-custom-sheet" role="dialog" aria-modal="true" :aria-label="editing ? '编辑训练计划' : '创建训练计划'">
          <header>
            <strong>{{ editing ? '编辑训练计划' : '创建训练计划' }}</strong>
            <button type="button" aria-label="关闭" @click="closeCustomCreator">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>

          <form v-if="customStep === 1" class="training-custom-form" @submit.prevent="goCustomSchedule">
            <label>
              <span>计划名称</span>
              <input v-model.trim="customDraft.name" type="text" maxlength="120" placeholder="例如 4周入门跑步" required />
            </label>
            <label>
              <span>运动类别</span>
              <select v-model="customDraft.type" :disabled="customDraft.goalType !== 'custom' || editing?.status === 'active'">
                <option value="running">跑步</option>
                <option value="cycling">骑行</option>
                <option value="swimming">游泳</option>
              </select>
            </label>
            <label>
              <span>周期时间</span>
              <input v-model.number="customDraft.weekCount" type="number" min="1" max="24" inputmode="numeric" :disabled="customDraft.goalType !== 'custom'" required />
            </label>
            <label><span>开始日期</span><input v-model="customDraft.startDate" type="date" min="2000-01-01" max="9999-01-01" :disabled="editing?.status === 'active'" required /></label>
            <label><span>训练目标</span><input v-model.trim="customDraft.goal" type="text" maxlength="500" /></label>
            <fieldset v-if="preset" class="training-weekday-picker">
              <legend>可训练日（每周选 2–4 天）</legend>
              <label v-for="(label, index) in weekdayNames" :key="label">
                <input v-model="trainingDays" type="checkbox" :value="index" />{{ label }}
              </label>
              <small>每周 {{ trainingDays.length }} 次</small>
            </fieldset>
            <button class="training-custom-primary" type="submit">下一步</button>
          </form>

          <form v-else class="training-custom-schedule" @submit.prevent="saveCustomPlan">
            <nav class="training-custom-weeks" aria-label="自定义周次">
              <button
                v-for="week in customWeeks"
                :key="week.week"
                type="button"
                :class="{ active: customActiveWeek === week.week }"
                :aria-pressed="customActiveWeek === week.week"
                @click="customActiveWeek = week.week"
              >
                W{{ week.week }}
              </button>
            </nav>
            <div class="training-day-editor">
              <div v-for="day in activeCustomDays" :key="day.date" class="training-day-input">
                <b>{{ day.date.slice(5) }} {{ weekdayNames[weekday(day.date)] }}</b>
                <input v-model.trim="day.title" type="text" maxlength="160" :readonly="isRecorded(day)" placeholder="训练名称，留空为休息" :aria-label="`${day.date} 训练名称`" />
                <template v-if="day.title">
                  <input v-model.trim="day.subtitle" type="text" maxlength="240" :readonly="isRecorded(day)" placeholder="训练说明" :aria-label="`${day.date} 训练说明`" />
                  <div class="training-day-targets">
                    <select v-model="day.type" :disabled="isRecorded(day)" :aria-label="`${day.date} 类型`">
                      <option value="other">自定义</option><option value="easy">轻松跑</option><option value="aerobic">常规有氧</option><option value="recovery">恢复</option>
                    </select>
                    <input v-model.number="day.distanceM" type="number" min="1" max="200000" :readonly="isRecorded(day)" placeholder="米" :aria-label="`${day.date} 距离（米）`" />
                    <input v-model.number="day.durationS" type="number" min="1" max="86400" :readonly="isRecorded(day)" placeholder="秒" :aria-label="`${day.date} 时长（秒）`" />
                  </div>
                </template>
              </div>
            </div>
            <div class="training-custom-actions">
              <button type="button" @click="customStep = 1">上一步</button>
              <button type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存计划' }}</button>
            </div>
          </form>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import {
  Activity,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  FolderOpen,
  Info,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Waves,
  X,
} from '@lucide/vue'

import { trainingPlanTemplates } from '@/data/trainingPlanTemplates'
import StateBlock from '@/components/StateBlock.vue'
import { formatPaceSeconds } from '@/utils/formatters'
import {
  changePlanStatus, changeSessionStatus, deleteDraftPlan,
  getTrainingContext, getTrainingPlan, listTrainingPlans, saveTrainingPlan,
} from '@/services/trainingPlans'

const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const route = useRoute()
const runningGoals = [
  { id: 'first_5k', name: '首次 5 公里', description: '用四周建立跑走节奏，为首次完成 5 公里做准备。', minutes: [20, 22, 25, 28] },
  { id: 'regular_running', name: '规律跑步', description: '用四周建立固定的轻松跑习惯。', minutes: [18, 20, 22, 24] },
]
const statusLabels = { draft: '草稿', active: '执行中', archived: '已归档' }
const sessionLabels = { pending: '待训练', completed: '已完成', skipped: '已跳过' }
const typeMap = {
  running: { label: '跑步', english: 'RUNNING', icon: Activity, color: '#16a34a' },
  cycling: { label: '骑行', english: 'CYCLING', icon: Bike, color: '#f59e0b' },
  swimming: { label: '游泳', english: 'SWIMMING', icon: Waves, color: '#0ea5e9' },
}

const plans = ref([])
const context = ref(null)
const loading = ref(true)
const loadError = ref('')
const busy = ref(false)
const selectedPlan = ref(null)
const detailActiveWeek = ref(1)
const showImportSheet = ref(false)
const customOpen = ref(false)
const customStep = ref(1)
const customActiveWeek = ref(1)
const customWeeks = ref([])
const editing = ref(null)
const preset = ref(null)
const trainingDays = ref([])
const customDraft = reactive({})
let generatedSchedule = ''

const activeCustomDays = computed(() => (
  customWeeks.value.find((week) => week.week === customActiveWeek.value)?.days || []
))
const selectedDetailWeek = computed(() => (
  selectedPlan.value?.weeks.find((week) => week.week === detailActiveWeek.value) || selectedPlan.value?.weeks[0]
))

function typeMeta(type) {
  return typeMap[type] || typeMap.running
}

function phaseSummary(plan) {
  const seen = []
  plan.weeks.forEach((week) => {
    const raw = week.phase || `第${week.week}周`
    if (!seen.some((item) => item.raw === raw)) {
      const match = raw.match(/^(.+?)\s*\((.+)\)$/)
      seen.push({
        raw,
        label: match?.[1] || raw,
        range: match?.[2] || `W${week.week}`,
      })
    }
  })
  const fallback = [{ label: '训练期', range: `W1-W${plan.weeks.length}` }]
  return (seen.length ? seen : fallback).slice(0, 3).map((item, index) => ({
    ...item,
    color: ['#0ea5e9', '#0ea5e9', '#f59e0b'][index] || '#16a34a',
  }))
}

function addDays(date, amount) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + amount)
  return day.toISOString().slice(0, 10)
}

function weekday(date) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
}

function nextMonday() {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format()
  return addDays(today, (7 - weekday(today)) % 7)
}

function contextDistance(running) {
  return running.distanceM == null ? '缺少跑量' : `${(running.distanceM / 1000).toFixed(1)} 公里`
}

function sessionSummary(session) {
  return [
    session.subtitle,
    session.distanceM && `${session.distanceM} 米`,
    session.durationS && `${session.durationS} 秒`,
  ].filter(Boolean).join(' · ')
}

function isRecorded(day) {
  return day.status === 'completed' || day.status === 'skipped'
}

function errorMessage(error) {
  switch (error.code) {
    case 'TRAINING_PLAN_VERSION_CONFLICT': return '该计划已在别处更新，请关闭编辑并刷新后重试。'
    case 'ACTIVE_TRAINING_PLAN_EXISTS': return '已有执行中的计划，请先归档再开始新的计划。'
    case 'TRAINING_PLAN_CONFLICT': return '此操作与计划当前状态冲突。请保留已完成或跳过的安排。'
    case 'INVALID_TRAINING_PLAN': return '请检查训练安排和目标。跑步目标的每周训练日需保持一致。'
    default: return error.message || '请求失败，请重试。'
  }
}

async function refreshPlans() {
  const selectedId = selectedPlan.value?.id
  loading.value = true
  loadError.value = ''
  void getTrainingContext().then(data => { context.value = data }).catch(() => { context.value = null })
  try {
    plans.value = await listTrainingPlans()
    selectedPlan.value = selectedId && plans.value.some(plan => plan.id === selectedId)
      ? await getTrainingPlan(selectedId) : null
    if (selectedPlan.value && detailActiveWeek.value > selectedPlan.value.weeks.length) {
      detailActiveWeek.value = selectedPlan.value.currentWeek
    }
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function act(work) {
  if (busy.value) return
  busy.value = true
  try {
    await work()
  } catch (error) {
    showToast(errorMessage(error))
  } finally {
    busy.value = false
  }
}

function displayPlan(plan, resetWeek = false) {
  const exists = plans.value.some(item => item.id === plan.id)
  plans.value = exists ? plans.value.map(item => item.id === plan.id ? plan : item) : [plan, ...plans.value]
  if (resetWeek || !selectedPlan.value || selectedPlan.value.id !== plan.id ||
      detailActiveWeek.value > plan.weeks.length) detailActiveWeek.value = plan.currentWeek
  selectedPlan.value = plan
}

function importTemplate(course) {
  return act(async () => {
    const plan = await saveTrainingPlan(null, {
      name: course.name, type: course.type, goal: course.goal, startDate: nextMonday(), weeks: course.weeks,
    })
    showImportSheet.value = false
    displayPlan(plan, true)
    showToast('已导入训练计划')
  })
}

function openPlan(plan) {
  return act(async () => {
    displayPlan(await getTrainingPlan(plan.id), true)
  })
}

function closePlan() {
  selectedPlan.value = null
}

function openCustomCreator(goal = null) {
  if (busy.value) return
  editing.value = null
  preset.value = goal
  generatedSchedule = ''
  trainingDays.value = [1, 3, 5]
  customWeeks.value = []
  Object.assign(customDraft, {
    name: goal?.name || '', type: 'running', goalType: goal?.id || 'custom',
    goal: goal?.description || '', startDate: nextMonday(), weekCount: 4,
  })
  showImportSheet.value = false
  customOpen.value = true
  customStep.value = 1
  customActiveWeek.value = 1
}

function closeCustomCreator() {
  if (!busy.value) customOpen.value = false
}

function editPlan() {
  const { name, type, goalType, goal, startDate, weeks } = selectedPlan.value
  openCustomCreator()
  editing.value = selectedPlan.value
  Object.assign(customDraft, { name, type, goalType, goal, startDate, weekCount: weeks.length })
  customWeeks.value = weeks.map(week => ({
    ...week,
    days: week.days.map(day => day.id ? { ...day } : { date: day.date, title: '', type: 'other' }),
  }))
}

function goCustomSchedule() {
  const count = Math.min(Math.max(Number(customDraft.weekCount) || 1, 1), 24)
  customDraft.weekCount = count
  if (preset.value && (trainingDays.value.length < 2 || trainingDays.value.length > 4)) {
    showToast('请选择每周 2 至 4 个训练日')
    return
  }
  const signature = `${customDraft.startDate}:${[...trainingDays.value].sort().join(',')}`
  customWeeks.value = Array.from({ length: count }, (_, index) => ({
    week: index + 1,
    phase: customWeeks.value[index]?.phase || `第${index + 1}周`,
    days: weekdayNames.map((_, dayIndex) => {
      const date = addDays(customDraft.startDate, index * 7 + dayIndex)
      if (preset.value && signature !== generatedSchedule) {
        const minutes = preset.value.minutes[index]
        return trainingDays.value.includes(weekday(date))
          ? { date, title: preset.value.id === 'first_5k' ? '轻松跑走' : '轻松跑', type: 'easy', durationS: minutes * 60 }
          : { date, title: '', type: 'other' }
      }
      return { title: '', type: 'other', ...customWeeks.value[index]?.days[dayIndex], date }
    }),
  }))
  generatedSchedule = signature
  customActiveWeek.value = 1
  customStep.value = 2
}

function saveCustomPlan() {
  if (!customWeeks.value.some(week => week.days.some(day => day.title && day.title !== '休息日'))) {
    showToast('请至少填写一项训练')
    return
  }
  return act(async () => {
    const weeks = customWeeks.value.map(week => ({
      phase: week.phase,
      days: week.days.map(day => ({
        ...day,
        distanceM: day.distanceM || null,
        durationS: day.durationS || null,
      })),
    }))
    const plan = await saveTrainingPlan(editing.value?.id, {
      ...customDraft, weeks, version: editing.value?.version,
    })
    customOpen.value = false
    displayPlan(plan, !editing.value)
    showToast('训练计划已保存')
  })
}

function startPlan(plan) {
  return act(async () => {
    displayPlan(await changePlanStatus(plan.id, plan.version, 'activate'))
    showToast('计划已开始')
  })
}

function recordSession(session, status) {
  return act(async () => {
    const { id, version } = selectedPlan.value
    displayPlan(await changeSessionStatus(id, session.id, version, status))
  })
}

async function archivePlan() {
  const plan = selectedPlan.value
  try {
    await showConfirmDialog({ title: '归档训练计划', message: '归档后仍可查看训练记录。' })
  } catch {
    return
  }
  await act(async () => {
    displayPlan(await changePlanStatus(plan.id, plan.version, 'archive'))
    showToast('计划已归档')
  })
}

async function removePlan() {
  const plan = selectedPlan.value
  try {
    await showConfirmDialog({ title: '删除草稿', message: '删除后无法找回该草稿及其任务。' })
  } catch {
    return
  }
  await act(async () => {
    await deleteDraftPlan(plan.id, plan.version)
    plans.value = plans.value.filter(item => item.id !== plan.id)
    closePlan()
    showToast('草稿已删除')
  })
}

function handleNavAction() {
  if (!busy.value && !loading.value) refreshPlans()
}

function handleShellBack(event) {
  if (!selectedPlan.value) return
  event.preventDefault()
  closePlan()
}

onMounted(async () => {
  window.dispatchEvent(new CustomEvent('motioncare:nav-action', { detail: { icon: RefreshCw, label: '刷新' } }))
  window.addEventListener('motioncare:nav-action-click', handleNavAction)
  window.addEventListener('motioncare:nav-back', handleShellBack)
  await refreshPlans()
  const linkedPlan = plans.value.find(plan => String(plan.id) === route.query.planId)
  if (linkedPlan) await openPlan(linkedPlan)
})

onBeforeUnmount(() => {
  window.dispatchEvent(new CustomEvent('motioncare:nav-action', { detail: null }))
  window.removeEventListener('motioncare:nav-action-click', handleNavAction)
  window.removeEventListener('motioncare:nav-back', handleShellBack)
})
</script>

<style scoped>
.training-plan-page {
  min-height: calc(100dvh - 120px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 0;
}

.training-plan-page--detail {
  display: grid;
  gap: 20px;
  padding-bottom: 96px;
}

.training-plan-page--empty {
  min-height: calc(100dvh - 168px);
}

.training-empty-state {
  flex: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  min-height: clamp(360px, 52dvh, 480px);
  text-align: center;
}

.training-empty-icon {
  width: 154px;
  height: 154px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-green) 10%, transparent);
  color: color-mix(in srgb, var(--app-green) 78%, #7dd3fc);
}

.training-empty-state h2 {
  margin: 0;
  color: var(--text);
  font-size: 28px;
  font-weight: 950;
}

.training-empty-state p {
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.5;
}

.training-section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 2px 12px;
}

.training-section-title span {
  width: 5px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 60%, var(--app-green));
}

.training-section-title h2 {
  margin: 0;
  color: color-mix(in srgb, var(--text) 72%, var(--muted));
  font-size: 22px;
  font-weight: 950;
}

.training-plan-list {
  display: grid;
  gap: 12px;
  padding-bottom: 132px;
}

.training-plan-card {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
  border-radius: 20px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.training-plan-card:focus-visible {
  outline: 2px solid var(--app-green);
  outline-offset: 3px;
}

.training-plan-card__accent {
  position: absolute;
  inset: 0 auto 0 0;
  width: 6px;
  background: var(--app-green);
}

.training-plan-card__top,
.training-plan-card__title,
.training-plan-card__bottom,
.training-type-label,
.training-progress-row {
  display: flex;
  align-items: center;
}

.training-plan-card__top,
.training-plan-card__title,
.training-plan-card__bottom,
.training-progress-row {
  justify-content: space-between;
  gap: 14px;
}

.training-type-label {
  gap: 10px;
  color: var(--plan-color);
  font-size: 17px;
  font-weight: 950;
  letter-spacing: 0.08em;
}

.training-status-pill {
  padding: 7px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, #38bdf8 14%, var(--panel));
  color: #0284c7;
  font-size: 16px;
  font-weight: 900;
}

.training-plan-card__title h3 {
  margin: 0;
  color: var(--text);
  font-size: 25px;
  line-height: 1.2;
}

.training-phase-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.training-phase-grid span {
  min-height: 56px;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  align-content: center;
  align-items: center;
  column-gap: 7px;
  row-gap: 4px;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 12px;
}

.training-phase-grid i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.training-phase-grid b,
.training-phase-grid small {
  color: var(--text);
  font-size: 14px;
  line-height: 1.1;
}

.training-phase-grid small {
  grid-column: 2;
  color: var(--muted);
}

.training-progress-track {
  flex: 1;
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

.training-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--app-green);
}

.training-progress-row b {
  color: var(--text);
  font-size: 18px;
}

.training-plan-card__bottom span {
  padding: 8px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-green) 12%, transparent);
  color: var(--app-green-dark);
  font-size: 18px;
  font-weight: 950;
}

.training-plan-card__bottom button {
  min-height: 50px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 22px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-green) 18%, var(--panel));
  color: var(--text);
  font: inherit;
  font-size: 18px;
  font-weight: 900;
}

.training-detail-hero {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  padding-top: 18px;
}

.training-detail-icon {
  width: 70px;
  height: 70px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: color-mix(in srgb, var(--plan-color) 12%, #f8fafc);
  color: var(--plan-color);
}

.training-detail-hero div {
  min-width: 0;
  display: grid;
  gap: 9px;
}

.training-detail-hero h2 {
  margin: 0;
  color: var(--text);
  font-size: 30px;
  font-weight: 950;
  line-height: 1.16;
}

.training-detail-hero p {
  margin: 0;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.45;
}

.training-detail-hero div > span {
  width: fit-content;
  padding: 8px 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-green) 15%, var(--panel));
  color: var(--app-green-dark);
  font-size: 16px;
  font-weight: 900;
}

.training-detail-weeks {
  display: flex;
  gap: 12px;
  margin-inline: calc(-1 * var(--space-4));
  padding: 2px var(--space-4) 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.training-detail-weeks::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.training-detail-weeks button {
  flex: 0 0 116px;
  min-height: 62px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 14px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 20px;
  font-weight: 900;
}

.training-detail-weeks button.active {
  border-color: transparent;
  background: color-mix(in srgb, var(--app-green) 16%, var(--panel));
}

.training-detail-workouts {
  display: grid;
  overflow: hidden;
  border-radius: 22px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.training-detail-workouts article {
  min-height: 112px;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
}

.training-detail-workouts article:last-child {
  border-bottom: 0;
}

.training-detail-workouts article > span {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 7%, transparent);
  color: var(--text);
  font-size: 18px;
  font-weight: 950;
}

.training-detail-workouts div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.training-detail-workouts strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1.35;
}

.training-detail-workouts p,
.training-detail-workouts small {
  margin: 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.45;
}

.training-detail-workouts svg {
  color: var(--app-green);
}

.training-detail-actions {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  padding: 8px 0;
  background: var(--bg);
}

.training-detail-actions button {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 999px;
  font: inherit;
  font-size: 15px;
  font-weight: 900;
  border: 1px solid color-mix(in srgb, var(--text) 34%, transparent);
  background: var(--panel);
  color: var(--text);
}

.training-detail-actions .training-activate-btn {
  border: 1px solid var(--app-green);
  background: var(--app-green);
  color: #fff;
}

.training-context {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--panel);
}

.training-context h2 {
  margin: 0 0 10px;
  font-size: 17px;
}

.training-context-windows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.training-context-windows div {
  display: grid;
  align-content: start;
  gap: 5px;
  padding: 9px;
  border-radius: 12px;
  background: var(--panel-soft);
  font-size: 13px;
}

.training-context-windows small,
.training-workout-controls span {
  color: var(--muted);
}

.training-detail-workouts .training-workout-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 10px;
  font-size: 13px;
}

.training-workout-controls button {
  min-height: 44px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.training-plan-actions {
  position: sticky;
  bottom: calc(12px + var(--safe-bottom));
  z-index: 20;
  display: grid;
  gap: 14px;
  margin-top: auto;
  padding-top: 10px;
  background: linear-gradient(180deg, transparent, var(--bg) 26%);
}

.training-plan-actions button {
  min-height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 18px;
  font: inherit;
  font-size: 18px;
  font-weight: 900;
}

.training-import-btn {
  border: 1px solid color-mix(in srgb, var(--text) 52%, transparent);
  background: var(--panel);
  color: var(--text);
}

.training-custom-btn {
  border: 1px solid var(--app-green);
  background: #12c96b;
  color: #fff;
}

.training-sheet-backdrop {
  position: absolute;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  padding: 12px;
  padding-bottom: calc(12px + var(--safe-bottom));
  background: rgb(6 20 14 / 0.34);
}

.training-sheet {
  width: 100%;
  max-height: min(78dvh, 680px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  background: var(--panel);
  box-shadow: 0 24px 70px rgb(15 23 42 / 0.24);
}

.training-sheet header {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
}

.training-sheet header strong {
  color: var(--text);
  font-size: 18px;
  font-weight: 950;
}

.training-sheet header button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--text);
}

.training-template-list,
.training-custom-form,
.training-custom-schedule {
  overflow-y: auto;
  padding: 14px;
}

.training-template-list {
  display: grid;
  gap: 12px;
}

.training-template-row {
  min-height: 82px;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  border-radius: 18px;
  background: var(--panel);
  color: var(--text);
  text-align: left;
}

.training-template-row > span {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--plan-color) 12%, #f8fafc);
  color: var(--plan-color);
}

.training-template-row div {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.training-template-row strong {
  overflow: hidden;
  color: var(--text);
  font-size: 18px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.training-template-row small {
  color: var(--muted);
  font-size: 14px;
}

.training-custom-form {
  display: grid;
  gap: 14px;
}

.training-custom-form label {
  display: grid;
  gap: 7px;
}

.training-custom-form span {
  color: var(--muted);
  font-size: 13px;
  font-weight: 850;
}

.training-custom-form :is(input, select),
.training-day-editor :is(input, select) {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--app-green) 18%, var(--border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-soft) 65%, var(--panel));
  color: var(--text);
  font: inherit;
  padding: 12px;
}

.training-custom-primary,
.training-custom-actions button:last-child {
  min-height: 50px;
  border: 0;
  border-radius: 14px;
  background: var(--app-green);
  color: #fff;
  font: inherit;
  font-weight: 900;
}

.training-custom-weeks {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
}

.training-custom-weeks button {
  flex: 0 0 64px;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-weight: 900;
}

.training-custom-weeks button.active {
  background: color-mix(in srgb, var(--app-green) 16%, var(--panel));
}

.training-day-editor {
  display: grid;
  gap: 10px;
}

.training-day-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.training-day-editor b {
  font-size: 14px;
  color: var(--muted);
}

.training-day-targets {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.training-weekday-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.training-weekday-picker label {
  display: flex;
  align-items: center;
  min-height: 44px;
}

.training-weekday-picker input {
  width: auto;
}

.training-weekday-picker small {
  align-self: center;
  color: var(--muted);
}

.training-custom-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.training-custom-actions button:first-child {
  min-height: 50px;
  border: 1px solid color-mix(in srgb, var(--text) 22%, transparent);
  border-radius: 14px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-weight: 900;
}

@container phone-frame (max-width: 390px) {
  .training-plan-card {
    padding: 16px 14px 16px 18px;
  }

  .training-plan-card__title h3 {
    font-size: 22px;
  }

  .training-phase-grid {
    grid-template-columns: 1fr;
  }

  .training-detail-hero {
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 12px;
  }

  .training-detail-icon {
    width: 56px;
    height: 56px;
    border-radius: 15px;
  }

  .training-detail-hero h2 {
    font-size: 24px;
  }

  .training-detail-workouts article {
    grid-template-columns: 46px minmax(0, 1fr) 20px;
    gap: 12px;
    padding: 15px 12px;
  }

  .training-detail-workouts strong {
    font-size: 18px;
  }
}
</style>
