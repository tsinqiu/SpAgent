import { getEnvelope, mutateEnvelope } from '@/services/api'

const root = '/training/reminders'

export async function listTrainingReminders() {
  return (await getEnvelope(root)).data
}

export async function getReminderPreferences() {
  return (await getEnvelope(`${root}/preferences`)).data
}

export async function saveReminderPreferences(preferences) {
  return (await mutateEnvelope('put', `${root}/preferences`, preferences)).data
}

export async function dismissReminder(id) {
  await mutateEnvelope('post', `${root}/${id}/dismiss`, {})
}
