export const FORCEABLE_BOOKING_STATUSES = [
  "payment_pending",
  "booked",
  "in_progress",
  "professional_completed",
  "completed",
  "dispute",
] as const

export type ForceableBookingStatus = (typeof FORCEABLE_BOOKING_STATUSES)[number]
