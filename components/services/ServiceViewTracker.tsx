'use client'

import { useEffect } from 'react'

export default function ServiceViewTracker({ serviceId }: { serviceId: string }) {
  useEffect(() => {
    if (!serviceId) return
    const id = encodeURIComponent(serviceId)
    fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/public/services/${id}/view`,
      { method: 'POST', credentials: 'include' }
    ).catch(() => { /* best-effort, silent */ })
  }, [serviceId])

  return null
}
