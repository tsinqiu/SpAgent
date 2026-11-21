<template>
  <div class="page-stack explore-home">
    <!-- 1. Featured Sports Science Tutorials -->
    <section class="hub-section" aria-label="科学训练教程">
      <header class="hub-section__head">
        <div>
          <h2>科学训练教程</h2>
          <p>极化训练、赛前减量、跑姿防伤与 HRV 恢复指南</p>
        </div>
        <RouterLink class="hub-section__more" :to="{ path: '/explore/courses', query: { tab: 'tutorials' } }">
          全部教程
          <ChevronRight :size="15" aria-hidden="true" />
        </RouterLink>
      </header>

      <div class="tutorial-preview-list">
        <RouterLink
          v-for="item in featuredTutorials"
          :key="item.id"
          :to="{ path: '/explore/courses', query: { tab: 'tutorials', tutorialId: item.id } }"
          class="tutorial-preview-card"
        >
          <div class="tutorial-preview-card__top">
            <span class="hub-pill">{{ item.category }}</span>
            <span class="hub-muted">{{ item.readTime }}</span>
          </div>
          <strong>{{ item.title }}</strong>
          <p>{{ item.summary }}</p>
        </RouterLink>
      </div>
    </section>

    <!-- 2. Featured Training Courses -->
    <section class="hub-section" aria-label="系统训练课表">
      <header class="hub-section__head">
        <div>
          <h2>系统训练课表</h2>
          <p>按距离与周期编排，支持一键存为我的计划草稿</p>
        </div>
        <RouterLink class="hub-section__more" to="/explore/courses">
          全部课表
          <ChevronRight :size="15" aria-hidden="true" />
        </RouterLink>
      </header>

      <div class="course-preview-list">
        <RouterLink
          v-for="course in featuredCourses"
          :key="course.id"
          :to="{ path: '/explore/courses', query: { courseId: course.id } }"
          class="course-preview-card"
        >
          <span class="course-preview-card__icon" :style="{ '--accent': course.color }">
            <component :is="course.icon" :size="18" aria-hidden="true" />
          </span>
          <div class="course-preview-card__body">
            <strong>{{ course.name }}</strong>
            <p>{{ course.goal }}</p>
            <span class="course-preview-card__meta">
              {{ course.typeLabel }} · {{ course.weeks?.length || 4 }} 周{{ course.level ? ` · ${course.level}` : '' }}
            </span>
          </div>
          <ChevronRight :size="16" class="hub-arrow" aria-hidden="true" />
        </RouterLink>
      </div>
    </section>

    <!-- 3. Featured Running Routes -->
    <section class="hub-section" aria-label="精选运动路线">
      <header class="hub-section__head">
        <div>
          <h2>精选运动路线</h2>
          <p>经典城市跑道与个人历史 GPS 轨迹路线库</p>
        </div>
        <RouterLink class="hub-section__more" to="/explore/routes">
          全部路线
          <ChevronRight :size="15" aria-hidden="true" />
        </RouterLink>
      </header>

      <div class="route-preview-list">
        <RouterLink
          v-for="routeItem in featuredRoutes"
          :key="routeItem.id"
          to="/explore/routes"
          class="route-preview-card"
        >
          <span class="route-preview-card__icon" aria-hidden="true">
            <MapPin :size="17" />
          </span>
          <div class="route-preview-card__body">
            <strong>{{ routeItem.name }}</strong>
            <p>{{ routeItem.location }} · {{ routeItem.distance }} · {{ routeItem.tag }}</p>
          </div>
          <ChevronRight :size="16" class="hub-arrow" aria-hidden="true" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ChevronRight, MapPin } from '@lucide/vue'
import { trainingPlanTemplates } from '@/data/trainingPlanTemplates'
import { trainingTutorials } from '@/data/trainingTutorials'

const featuredTutorials = trainingTutorials.slice(0, 3)
const featuredCourses = [
  trainingPlanTemplates.find(c => c.id === 'run-6w-5k-speed'),
  trainingPlanTemplates.find(c => c.id === 'run-12w-half'),
  trainingPlanTemplates.find(c => c.id === 'strength-4w-runner-core'),
  trainingPlanTemplates.find(c => c.id === 'run-16w-sub4'),
].filter(Boolean)

const featuredRoutes = [
  { id: 'r-wuxi-taihu', name: '蠡湖环湖经典跑道', location: '无锡', distance: '10–21 km', tag: '平缓滨水 · 补给友好' },
  { id: 'r-sh-binjiang', name: '徐汇滨江绿道', location: '上海', distance: '8–15 km', tag: '塑胶跑道 · 夜景佳' },
  { id: 'r-bj-aosen', name: '奥林匹克森林公园南北园', location: '北京', distance: '10.7 km', tag: '标准环线 · 跑者聚集' },
]
</script>

<style scoped>
.explore-home {
  gap: 16px;
}

.hub-section {
  display: grid;
  gap: 9px;
}

.hub-section__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 2px 0;
}

.hub-section__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 660;
  letter-spacing: -0.02em;
  color: var(--text);
}

.hub-section__head p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.hub-section__more {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--green-strong);
  text-decoration: none;
}

.tutorial-preview-list,
.course-preview-list,
.route-preview-list {
  display: grid;
  gap: 8px;
}

.tutorial-preview-card {
  display: grid;
  gap: 5px;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--panel);
  color: var(--text);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
}

.tutorial-preview-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hub-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--green-tint);
  color: var(--green-strong);
  font-size: 11px;
  font-weight: 620;
}

.hub-muted {
  font-size: 11px;
  color: var(--muted);
}

.tutorial-preview-card strong {
  font-size: 14px;
  font-weight: 640;
  line-height: 1.3;
  color: var(--text);
}

.tutorial-preview-card p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-preview-card,
.route-preview-card {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 13px;
  border-radius: 16px;
  background: var(--panel);
  color: var(--text);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: transform 0.12s ease;
}

.course-preview-card:active,
.route-preview-card:active,
.tutorial-preview-card:active {
  transform: scale(0.99);
}

.course-preview-card__icon {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent, var(--app-green)) 13%, var(--panel-soft));
  color: var(--accent, var(--app-green));
}

.route-preview-card__icon {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--green-tint);
  color: var(--green-strong);
}

.course-preview-card__body,
.route-preview-card__body {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.course-preview-card__body strong,
.route-preview-card__body strong {
  font-size: 14px;
  font-weight: 630;
  color: var(--text);
}

.course-preview-card__body p,
.route-preview-card__body p {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.course-preview-card__meta {
  font-size: 11px;
  font-weight: 560;
  color: var(--green-strong);
}

.hub-arrow {
  flex: 0 0 auto;
  color: var(--muted);
}
</style>
