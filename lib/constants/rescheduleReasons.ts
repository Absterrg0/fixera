export const RESCHEDULE_REASONS = [
  'Weather delay',
  'Resource availability',
  'Material delivery issues',
  'Crew unavailable',
  'Customer request',
  'Other',
] as const

export type RescheduleReason = typeof RESCHEDULE_REASONS[number]
