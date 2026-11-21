<template>
  <!-- 1. Tutorial Reader View -->
  <div v-if="selectedTutorial" class="page-stack reader-page">
    <article class="reader-card">
      <header class="reader-head">
        <div class="reader-badges">
          <span class="pill-badge">{{ selectedTutorial.category }}</span>
          <span class="pill-muted">{{ selectedTutorial.level }} · {{ selectedTutorial.readTime }}</span>
        </div>
        <h2>{{ selectedTutorial.title }}</h2>
        <p class="reader-summary">{{ selectedTutorial.summary }}</p>
      </header>

      <section class="reader-highlights" aria-label="核心要点">
        <h3>核心要点</h3>
        <ul>
          <li v-for="(item, idx) in selectedTutorial.highlights" :key="idx">{{ item }}</li>
        </ul>
      </section>

      <section v-for="(sec, sIdx) in selectedTutorial.sections" :key="sIdx" class="reader-section">
        <h3>{{ sec.heading }}</h3>
        <p v-if="sec.body">{{ sec.body }}</p>
        <ul v-if="sec.bullets?.length">
          <li v-for="(b, bIdx) in sec.bullets" :key="bIdx">{{ b }}</li>
        </ul>
      </section>

      <footer class="reader-actions">
        <button type="button" class="action-btn action-btn--ghost" @click="closeDetail">返回列表</button>
        <button type="button" class="action-btn action-btn--primary" @click="askCoachAboutTutorial(selectedTutorial)">
          <Sparkles :size="15" aria-hidden="true" />
          结合我的数据问教练
        </button>
      </footer>
    </article>
  </div>

  <!-- 2. Course Detail View -->
  <div v-else-if="selectedCourse" class="page-stack detail-page">
    <header class="detail-hero">
      <span class="detail-hero__icon" :style="{ '--course-color': selectedCourse.color }">
        <component :is="selectedCourse.icon" :size="22" aria-hidden="true" />
      </span>
      <div class="detail-hero__copy">
        <div class="detail-hero__meta">
          <span class="pill-badge">{{ selectedCourse.typeLabel }}</span>
          <span class="pill-muted">{{ selectedCourse.weeks.length }} 周{{ selectedCourse.level ? ` · ${selectedCourse.level}` : '' }}</span>
        </div>
        <h2>{{ selectedCourse.name }}</h2>
        <p>{{ selectedCourse.goal }}</p>
      </div>
    </header>

    <div class="detail-phase-bar">
      <span class="pill-badge">{{ selectedWeek.phase }}</span>
      <span class="pill-muted">第 {{ activeWeek }} / {{ selectedCourse.weeks.length }} 周</span>
    </div>

    <nav class="week-pills" aria-label="训练周次">
      <button
        v-for="week in selectedCourse.weeks"
        :key="week.week"
        type="button"
        class="week-pill"
        :class="{ active: activeWeek === week.week }"
        @click="activeWeek = week.week"
      >
        W{{ week.week }}
      </button>
    </nav>

    <section class="workout-list" aria-label="本周训练安排">
      <article
        v-for="(workout, wIdx) in selectedWeek.days"
        :key="`${selectedWeek.week}-${wIdx}`"
        class="workout-row"
        :class="{ 'is-rest': workout.title === '休息日' }"
      >
        <span class="workout-day">{{ weekdayLabel(wIdx) }}</span>
        <div class="workout-copy">
          <strong>{{ workout.title }}</strong>
          <p v-if="workout.subtitle && workout.subtitle !== '休息日'">{{ workout.subtitle }}</p>
          <small v-if="workout.note">{{ workout.note }}</small>
        </div>
      </article>
    </section>

    <div class="detail-actions">
      <button type="button" class="action-btn action-btn--ghost" @click="closeDetail">返回</button>
      <button type="button" class="action-btn action-btn--primary" :disabled="savingPlan" @click="savePlan">
        <Check :size="15" aria-hidden="true" />
        {{ savingPlan ? '保存中…' : '保存为我的计划草稿' }}
      </button>
    </div>
  </div>

  <!-- 3. Main Catalog View (Courses + Science Tutorials) -->
  <div v-else class="page-stack catalog-page">
    <div class="catalog-segment" role="tablist" aria-label="内容分类">
      <button
        type="button"
        class="catalog-segment__btn"
        :class="{ active: activeSection === 'courses' }"
        :aria-selected="activeSection === 'courses'"
        @click="activeSection = 'courses'"
      >
        系统课表 ({{ trainingPlanTemplates.length }})
      </button>
      <button
        type="button"
        class="catalog-segment__btn"
        :class="{ active: activeSection === 'tutorials' }"
        :aria-selected="activeSection === 'tutorials'"
        @click="activeSection = 'tutorials'"
      >
        科学教程 ({{ trainingTutorials.length }})
      </button>
    </div>

    <!-- Courses Tab -->
    <template v-if="activeSection === 'courses'">
      <nav class="filter-pills" aria-label="课程分类">
        <button
          v-for="filter in trainingPlanFilters"
          :key="filter.key"
          type="button"
          class="filter-pill"
          :class="{ active: activeFilter === filter.key }"
          @click="activeFilter = filter.key"
        >
          {{ filter.label }}
        </button>
      </nav>

      <section class="course-list" aria-label="常用训练计划">
        <button
          v-for="course in filteredTemplates"
          :key="course.id"
          type="button"
          class="course-card"
          @click="openCourse(course)"
        >
          <span class="course-card__icon" :style="{ '--course-color': course.color }">
            <component :is="course.icon" :size="20" aria-hidden="true" />
          </span>
          <div class="course-card__body">
            <div class="course-card__top">
              <strong>{{ course.name }}</strong>
              <span class="course-card__tag">{{ course.weeks.length }} 周</span>
            </div>
            <p>{{ course.goal }}</p>
            <small>{{ course.typeLabel }}{{ course.level ? ` · ${course.level}` : '' }}{{ course.weeklyFreq ? ` · ${course.weeklyFreq}` : '' }}</small>
          </div>
          <ChevronRight :size="16" class="course-card__arrow" aria-hidden="true" />
        </button>
      </section>
    </template>

    <!-- Tutorials Tab -->
    <section v-else class="tutorial-list" aria-label="运动科学教程">
      <button
        v-for="tutorial in trainingTutorials"
        :key="tutorial.id"
        type="button"
        class="tutorial-card"
        @click="openTutorial(tutorial)"
      >
        <div class="tutorial-card__meta">
          <span class="pill-badge">{{ tutorial.category }}</span>
          <span class="pill-muted">{{ tutorial.level }} · {{ tutorial.readTime }}</span>
        </div>
        <strong>{{ tutorial.title }}</strong>
        <p>{{ tutorial.summary }}</p>
        <span class="tutorial-card__cta">
          <BookOpen :size="13" aria-hidden="true" />
          阅读完整指南
          <ChevronRight :size="14" aria-hidden="true" />
        </span>
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { BookOpen, Check, ChevronRight, Sparkles } from '@lucide/vue'
import { trainingPlanFilters, trainingPlanTemplates } from '@/data/trainingPlanTemplates'
import { trainingTutorials } from '@/data/trainingTutorials'
import { saveTrainingPlan } from '@/services/trainingPlans'

const route = useRoute()
const router = useRouter()

const activeSection = ref('courses')
const activeFilter = ref('all')
const selectedCourse = ref(null)
const selectedTutorial = ref(null)
const activeWeek = ref(1)
const savingPlan = ref(false)

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const filteredTemplates = computed(() => {
  if (activeFilter.value === 'all') return trainingPlanTemplates
  return trainingPlanTemplates.filter((course) => course.type === activeFilter.value)
})

const selectedWeek = computed(() => (
  selectedCourse.value?.weeks.find((week) => week.week === activeWeek.value) || selectedCourse.value?.weeks[0]
))

function weekdayLabel(index) {
  return `周${WEEKDAY_LABELS[index] || ''}`
}

function openCourse(course) {
  selectedTutorial.value = null
  selectedCourse.value = course
  activeWeek.value = 1
}

function openTutorial(tutorial) {
  selectedCourse.value = null
  selectedTutorial.value = tutorial
}

function closeDetail() {
  selectedCourse.value = null
  selectedTutorial.value = null
}

function nextMondayDateStr() {
  const now = new Date()
  const day = now.getDay() || 7
  const diff = day === 1 ? 0 : 8 - day
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

function inferSessionType(workout, courseType) {
  if (courseType === 'strength') return 'other'
  const text = `${workout.title} ${workout.subtitle}`.toLowerCase()
  if (/恢复|recovery/.test(text)) return 'recovery'
  if (/轻松|慢跑|跑走|easy/.test(text)) return 'easy'
  if (/交叉|力量|休息/.test(text)) return 'other'
  return 'aerobic'
}

async function savePlan() {
  if (!selectedCourse.value || savingPlan.value) return
  savingPlan.value = true
  try {
    const course = selectedCourse.value
    const planType = ['running', 'cycling', 'swimming'].includes(course.type) ? course.type : 'running'
    const payload = {
      name: course.name.slice(0, 120),
      type: planType,
      goalType: 'custom',
      goal: (course.goal || course.name).slice(0, 480),
      startDate: nextMondayDateStr(),
      weeks: course.weeks.map((week) => ({
        phase: String(week.phase || `第 ${week.week} 周`).slice(0, 80),
        days: (week.days || []).slice(0, 7).map((day) => {
          if (!day || day.title === '休息日') return {}
          return {
            title: String(day.title || '').slice(0, 150),
            subtitle: String(day.subtitle || '').slice(0, 220),
            note: String(day.note || '').slice(0, 450),
            type: inferSessionType(day, course.type),
          }
        }),
      })),
    }
    const created = await saveTrainingPlan(null, payload)
    showToast('已保存为我的训练计划草稿')
    if (created?.id) {
      router.push({ name: 'training-plans', query: { planId: created.id } })
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '保存计划失败，请稍后重试')
  } finally {
    savingPlan.value = false
  }
}

function askCoachAboutTutorial(tutorial) {
  router.push({
    name: 'coach',
    query: { prompt: tutorial.coachPrompt || `请结合我的运动数据讲解「${tutorial.title}」` },
  })
}

function syncFromRouteQuery() {
  const { tab, courseId, tutorialId } = route.query
  if (tab === 'tutorials') activeSection.value = 'tutorials'
  else if (tab === 'courses') activeSection.value = 'courses'

  if (typeof courseId === 'string' && courseId) {
    const match = trainingPlanTemplates.find(c => c.id === courseId)
    if (match) {
      openCourse(match)
      return
    }
  }
  if (typeof tutorialId === 'string' && tutorialId) {
    const match = trainingTutorials.find(t => t.id === tutorialId)
    if (match) {
      openTutorial(match)
      return
    }
  }
}

function handleShellBack(event) {
  if (!selectedCourse.value && !selectedTutorial.value) return
  event.preventDefault()
  closeDetail()
}

watch(() => route.query, syncFromRouteQuery)

onMounted(() => {
  syncFromRouteQuery()
  window.addEventListener('spagent:nav-back', handleShellBack)
})

onBeforeUnmount(() => {
  window.removeEventListener('spagent:nav-back', handleShellBack)
})
</script>

<style scoped>
.catalog-page,
.detail-page,
.reader-page {
  gap: 12px;
}

.catalog-segment {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--text) 6%, var(--bg));
}

.catalog-segment__btn {
  height: 34px;
  min-height: 34px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.catalog-segment__btn.active {
  background: var(--panel);
  color: var(--text);
  font-weight: 650;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.filter-pills {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.filter-pills::-webkit-scrollbar {
  display: none;
}

.filter-pill {
  flex: 0 0 auto;
  height: 32px;
  min-height: 32px;
  padding: 0 13px;
  border: 0;
  border-radius: 999px;
  background: var(--panel);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 560;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.filter-pill.active {
  background: var(--text);
  color: var(--panel);
  font-weight: 620;
}

.course-list,
.tutorial-list {
  display: grid;
  gap: 10px;
}

.course-card {
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 0;
  border-radius: 18px;
  background: var(--panel);
  color: var(--text);
  text-align: left;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.12s ease;
}

.course-card:active,
.tutorial-card:active {
  transform: scale(0.99);
}

.course-card__icon,
.detail-hero__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--course-color) 12%, var(--panel-soft));
  color: var(--course-color);
}

.course-card__body {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.course-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.course-card__top strong {
  min-width: 0;
  font-size: 14.5px;
  font-weight: 650;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-card__tag {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.course-card__body p {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-card__body small {
  font-size: 11.5px;
  color: var(--green-strong);
  font-weight: 560;
}

.course-card__arrow {
  color: var(--muted);
}

.tutorial-card {
  width: 100%;
  display: grid;
  gap: 7px;
  padding: 14px 16px;
  border: 0;
  border-radius: 18px;
  background: var(--panel);
  color: var(--text);
  text-align: left;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.tutorial-card__meta,
.reader-badges,
.detail-hero__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pill-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--green-tint);
  color: var(--green-strong);
  font-size: 11.5px;
  font-weight: 620;
}

.pill-muted {
  font-size: 11.5px;
  color: var(--muted);
}

.tutorial-card strong {
  font-size: 15px;
  font-weight: 660;
  line-height: 1.35;
  color: var(--text);
}

.tutorial-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}

.tutorial-card__cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--green-strong);
}

/* Course Detail */
.detail-hero {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
  padding: 15px 16px;
  border-radius: 20px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.detail-hero__icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
}

.detail-hero__copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.detail-hero__copy h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 680;
  line-height: 1.25;
  color: var(--text);
}

.detail-hero__copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.48;
  color: var(--muted);
}

.detail-phase-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.week-pills {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.week-pills::-webkit-scrollbar {
  display: none;
}

.week-pill {
  flex: 0 0 auto;
  min-width: 46px;
  height: 32px;
  min-height: 32px;
  padding: 0 11px;
  border: 0;
  border-radius: 999px;
  background: var(--panel);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.week-pill.active {
  background: var(--text);
  color: var(--panel);
}

.workout-list {
  display: grid;
  border-radius: 18px;
  overflow: hidden;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.workout-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 0.5px solid var(--border);
}

.workout-row:last-child {
  border-bottom: 0;
}

.workout-row.is-rest {
  opacity: 0.6;
}

.workout-day {
  display: inline-grid;
  place-items: center;
  height: 26px;
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 11.5px;
  font-weight: 640;
}

.workout-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.workout-copy strong {
  font-size: 14px;
  font-weight: 620;
  line-height: 1.35;
  color: var(--text);
}

.workout-copy p,
.workout-copy small {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--muted);
}

.detail-actions,
.reader-actions {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding-top: 4px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 620;
  cursor: pointer;
}

.action-btn--ghost {
  border: 0;
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.action-btn--primary {
  border: 0;
  background: var(--text);
  color: var(--panel);
}

.action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Tutorial Reader */
.reader-card {
  display: grid;
  gap: 14px;
  padding: 18px 16px;
  border-radius: 22px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.reader-head {
  display: grid;
  gap: 8px;
}

.reader-head h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: var(--text);
}

.reader-summary {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--muted);
}

.reader-highlights {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--bg);
}

.reader-highlights h3 {
  margin: 0;
  font-size: 12.5px;
  font-weight: 680;
  color: var(--green-strong);
}

.reader-highlights ul,
.reader-section ul {
  margin: 0;
  padding-left: 17px;
  display: grid;
  gap: 5px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text);
}

.reader-section {
  display: grid;
  gap: 6px;
  padding-top: 8px;
  border-top: 0.5px solid var(--border);
}

.reader-section h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 660;
  color: var(--text);
}

.reader-section p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text);
}
</style>
