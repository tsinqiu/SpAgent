import { getEnvelope } from '@/services/api'

export async function getPerformanceProfile() {
  const envelope = await getEnvelope('/training/performance-profile')
  return envelope.data || null
}
