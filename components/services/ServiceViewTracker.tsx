'use client'

import { useEffect } from 'react'

export default function ServiceViewTracker({ serviceId }: { serviceId: string }) {
  useEffect(() => {
    if (!serviceId) return
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL
    if (!backend || typeof backend !== 'string' || backend.length === 0) return
    const controller = new AbortController()
    const id = encodeURIComponent(serviceId)
    fetch(
      `${backend}/api/public/services/${id}/view`,
      { method: 'POST', credentials: 'include', signal: controller.signal }
    ).catch((err) => {
      if (err?.name === 'AbortError') return
    })
    return () => controller.abort()
  }, [serviceId])

  return null
}
