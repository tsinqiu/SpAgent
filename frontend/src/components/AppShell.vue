<template>
  <div class="app-viewport">
    <div class="phone-frame" :class="{ 'phone-frame--training': wideTrainingView, 'phone-frame--coach': coachView, 'phone-frame--workspace': workspace }">
      <header v-if="workspace" class="workspace-navbar">
        <div class="workspace-navbar__left">
          <button ref="menuTrigger" type="button" class="workspace-button" aria-label="打开工作区菜单" aria-haspopup="dialog" aria-controls="workspace-menu" :aria-expanded="menuOpen" data-haptic @click="openMenu">
            <Menu :size="23" aria-hidden="true" />
          </button>
          <button v-if="showBack" type="button" class="workspace-button workspace-navbar__back" aria-label="返回" data-haptic @click="goBack">
            <ChevronLeft :size="22" aria-hidden="true" />
          </button>
        </div>
        <h1>{{ navTitle }}</h1>
        <div class="workspace-navbar__right">
          <div v-if="coachView" id="coach-navbar-actions"></div>
          <button v-if="pageAction" type="button" class="workspace-button" :aria-label="pageAction.label" @click="handlePageAction">
            <component v-if="pageAction.icon" :is="pageAction.icon" :size="21" aria-hidden="true" />
            <span v-else>{{ pageAction.label }}</span>
          </button>
        </div>
      </header>
      <van-nav-bar v-else class="app-navbar" :title="navTitle" />

      <main ref="scrollEl" class="page-frame">
        <RouterView v-slot="{ Component }">
          <Transition name="workspace-route" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>

      <dialog id="workspace-menu" v-if="workspace" ref="menu" class="workspace-menu" aria-label="SpAgent 工作区"
        :class="{ 'is-closing': menuClosing }" @close="handleMenuClose" @click.self="closeMenu"
        @cancel.prevent="closeMenu" @animationend.self="finishMenuAnimation" @animationcancel.self="finishMenuAnimation">
        <div class="workspace-menu__body">
          <header class="workspace-menu__header">
            <span class="workspace-menu__brand">SpAgent</span>
            <button type="button" class="workspace-button" aria-label="关闭菜单" data-haptic autofocus @click="closeMenu">
              <Menu :size="23" aria-hidden="true" />
            </button>
          </header>
          <nav aria-label="工作区导航" class="workspace-menu__navigation">
            <RouterLink to="/coach" class="workspace-menu__link workspace-menu__coach" :class="{ 'is-current': coachView }" data-haptic @click="closeMenu">
              <MessageCircle :size="18" aria-hidden="true" />
              <span>AI 教练</span>
            </RouterLink>
            <section v-for="group in workspaceNavigation" :key="group.label" class="workspace-menu__group">
              <h2>{{ group.label }}</h2>
              <RouterLink
                v-for="item in group.items"
                :key="item.to"
                :to="item.to"
                class="workspace-menu__link"
                :class="{ 'is-current': activeMenuPath === item.to }"
                data-haptic
                @click="closeMenu"
              >
                <component :is="navigationIcons[item.icon]" :size="17" aria-hidden="true" />
                <span>{{ item.label }}</span>
              </RouterLink>
            </section>
          </nav>
        </div>
      </dialog>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  Activity, CalendarDays, CalendarRange, ChevronLeft, ClipboardList, Compass, HeartPulse,
  MapPin, Menu, MessageCircle, RefreshCw, Settings, UserRound, UsersRound,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'

import { workspaceNavigation } from '@/constants/product'

const route = useRoute()
const router = useRouter()
const scrollEl = ref(null)
const menu = ref(null)
const menuTrigger = ref(null)
const menuOpen = ref(false)
const menuClosing = ref(false)
const pageTitleOverride = ref('')
const pageAction = shallowRef(null)

const navigationIcons = {
  today: CalendarDays,
  plans: ClipboardList,
  report: CalendarRange,
  activities: Activity,
  record: MapPin,
  status: HeartPulse,
  sync: RefreshCw,
  events: CalendarRange,
  explore: Compass,
  community: UsersRound,
  profile: UserRound,
  settings: Settings,
}
const returnTargets = {
  today: '/today',
  activities: '/activities',
  status: '/status',
  explore: '/explore',
  coach: '/coach',
  'weekly-report': '/explore/weekly-report',
}
const returnTarget = computed(() => {
  const source = route.query.from
  return typeof source === 'string' && Object.hasOwn(returnTargets, source) ? returnTargets[source] : ''
})
const workspace = computed(() => Boolean(route.meta.requiresAuth))
const showBack = computed(() => Boolean(route.meta.backTo || returnTarget.value))
const coachView = computed(() => route.name === 'coach')
const wideTrainingView = computed(() => ['today', 'coach', 'training-plans', 'weekly-report'].includes(route.name))
const navTitle = computed(() => pageTitleOverride.value || route.meta.title || 'SpAgent')
const activeMenuPath = computed(() => {
  const items = workspaceNavigation.flatMap(group => group.items)
  const exact = items.find(item => route.path === item.to)
  return exact?.to ?? items.find(item => route.path.startsWith(`${item.to}/`))?.to
})

function openMenu() {
  if (menu.value?.open) return
  menu.value?.showModal()
  menuOpen.value = Boolean(menu.value?.open)
}

function closeMenu() {
  if (!menu.value?.open || menuClosing.value) return
  if (!workspace.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    menu.value.close()
    return
  }
  menuClosing.value = true
}

function finishMenuAnimation(event) {
  if (event.animationName === 'workspace-menu-out' && menuClosing.value) menu.value?.close()
}

async function handleMenuClose() {
  menuOpen.value = false
  menuClosing.value = false
  await nextTick()
  if (!menuOpen.value) menuTrigger.value?.focus({ preventScroll: true })
}

function goBack() {
  const event = new CustomEvent('spagent:nav-back', { cancelable: true })
  window.dispatchEvent(event)
  if (!event.defaultPrevented) router.push(returnTarget.value || route.meta.backTo || '/coach')
}

function handlePageTitle(event) {
  pageTitleOverride.value = event.detail?.title || ''
}

function handlePageNavAction(event) {
  pageAction.value = event.detail || null
}

function handlePageAction() {
  window.dispatchEvent(new CustomEvent('spagent:nav-action-click'))
}

watch(() => route.path, () => {
  closeMenu()
  pageTitleOverride.value = ''
  pageAction.value = null
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = 0
  })
})

onMounted(() => {
  window.addEventListener('spagent:nav-title', handlePageTitle)
  window.addEventListener('spagent:nav-action', handlePageNavAction)
})

onBeforeUnmount(() => {
  window.removeEventListener('spagent:nav-title', handlePageTitle)
  window.removeEventListener('spagent:nav-action', handlePageNavAction)
})
</script>
