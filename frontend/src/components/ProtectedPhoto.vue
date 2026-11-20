<template>
  <img v-if="src" :src="src" :alt="alt" v-bind="$attrs" @error="src = ''" />
  <span v-else ref="placeholder" class="protected-photo-placeholder" v-bind="$attrs"><slot /></span>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { apiClient, resolveMediaUrl } from '@/services/http'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  kind: { type: String, required: true },
  id: { type: [Number, String], required: true },
  path: { type: String, default: '' },
  alt: { type: String, default: '' },
  lazy: { type: Boolean, default: false },
})

const media = {
  activity: { collection: 'activities', filename: 'photo' },
  shoe: { collection: 'shoes', filename: 'photo' },
  community: { collection: 'community/posts', filename: 'image' },
}
const src = ref('')
const placeholder = ref(null)
const visible = ref(!props.lazy)
let observer

onMounted(() => {
  if (!props.lazy) return
  if (!placeholder.value || typeof IntersectionObserver === 'undefined') {
    visible.value = true
    return
  }
  observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    visible.value = true
    observer.disconnect()
  }, { rootMargin: '160px' })
  observer.observe(placeholder.value)
})

onBeforeUnmount(() => observer?.disconnect())

watch(() => [props.path, props.kind, props.id, visible.value], async ([path, kind, id, inView], _, cleanup) => {
  src.value = ''
  if (typeof path !== 'string' || !path || !inView) return
  if (!path.startsWith(`/uploads/${kind}-images/`)) {
    src.value = resolveMediaUrl(path)
    return
  }

  const controller = new AbortController()
  const { collection, filename } = media[kind]
  let blobUrl
  cleanup(() => {
    controller.abort()
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  })
  try {
    const { data } = await apiClient.get(`/${collection}/${encodeURIComponent(id)}/${filename}`, {
      responseType: 'blob', signal: controller.signal,
    })
    if (!controller.signal.aborted && data.type.startsWith('image/')) {
      blobUrl = URL.createObjectURL(data)
      src.value = blobUrl
    }
  } catch {
    // Keep the caller's placeholder visible when the photo is unavailable.
  }
}, { immediate: true })
</script>

<style scoped>
.protected-photo-placeholder { display: inline-flex; align-items: center; justify-content: center; }
</style>
