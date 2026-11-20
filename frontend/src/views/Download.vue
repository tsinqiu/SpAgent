<template>
  <main class="download-page">
    <section class="download-shell">
      <div class="download-brand">
        <img class="download-brand__icon" src="/icons/spagent-icon.svg" alt="" />
        <strong>SpAgent</strong>
      </div>

      <div class="download-hero">
        <h1>下载 SpAgent</h1>
      </div>

      <ServerHealthBadge compact :show-caption="false" :show-detail="false" />

      <a
        v-if="apkAvailable"
        class="download-primary"
        href="/downloads/spagent-release.apk"
        download
      >
        <DownloadIcon :size="20" />
        <span>
          <strong>下载安卓版 APK</strong>
        </span>
      </a>
      <button v-else class="download-primary download-primary--disabled" type="button" disabled>
        <DownloadIcon :size="20" />
        <span>
          <strong>{{ apkChecking ? '正在检查安装包' : '安装包暂未上传' }}</strong>
        </span>
      </button>

      <RouterLink class="download-return" to="/today">
        <ArrowLeft :size="16" aria-hidden="true" />
        <span>使用网页版</span>
      </RouterLink>

      <p class="download-note">{{ downloadNote }}</p>
    </section>
  </main>
</template>

<script setup>
import { ArrowLeft, Download as DownloadIcon } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

import ServerHealthBadge from '@/components/ServerHealthBadge.vue'

const apkAvailable = ref(false)
const apkChecking = ref(true)

const downloadNote = computed(() => {
  if (apkChecking.value) return '正在确认安卓安装包是否可下载。'
  if (!apkAvailable.value) return '安装包暂未发布，可以使用网页版。'
  return '如果无法安装，请检查是否允许安装未知来源应用。'
})

onMounted(async () => {
  try {
    const response = await fetch('/downloads/spagent-release.apk', {
      method: 'HEAD',
      cache: 'no-store',
    })
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    apkAvailable.value = response.ok && [
      'application/vnd.android.package-archive',
      'application/octet-stream',
    ].includes(contentType)
  } catch {
    apkAvailable.value = false
  } finally {
    apkChecking.value = false
  }
})
</script>

<style scoped>
.download-hero {
  padding-top: 16px;
}

.download-primary {
  min-height: 64px;
}

.download-primary span {
  align-items: center;
}

.download-primary strong {
  font-size: 17px;
  line-height: 1.2;
}

.download-primary--disabled {
  border: 0;
  opacity: 0.72;
  cursor: not-allowed;
}

.download-return {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--download-green) 18%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--download-green) 7%, var(--panel));
  color: var(--download-green);
  font-weight: 800;
  text-decoration: none;
}
</style>
