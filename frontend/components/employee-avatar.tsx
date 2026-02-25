"use client"

import { useEffect, useState, useRef } from "react"
import { getEmployeePhotoUrl } from "@/lib/hrms-api"

interface EmployeeAvatarProps {
  employeeId: number
  firstName: string
  lastName: string
  photoPath: string | null
  size?: "sm" | "md" | "lg"
  className?: string
  thumb?: boolean
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 sm:h-20 sm:w-20 text-lg sm:text-2xl",
}

export function EmployeeAvatar({ employeeId, firstName, lastName, photoPath, size = "md", className = "", thumb = true }: EmployeeAvatarProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const initials = `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase()
  const sizeClass = sizeClasses[size]

  // Ленивая загрузка — грузим фото только когда элемент виден
  useEffect(() => {
    if (!photoPath || !ref.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "100px" }
    )

    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [photoPath])

  // Загрузка фото с авторизацией
  useEffect(() => {
    if (!photoPath || !isVisible) {
      setBlobUrl(null)
      return
    }

    let revoked = false
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null

    fetch(getEmployeePhotoUrl(employeeId, thumb), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => res.ok ? res.blob() : null)
      .then(blob => {
        if (blob && !revoked) setBlobUrl(URL.createObjectURL(blob))
      })
      .catch(() => {})

    return () => {
      revoked = true
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }, [photoPath, employeeId, isVisible, thumb])

  if (blobUrl) {
    return (
      <img
        src={blobUrl}
        alt={`${firstName} ${lastName}`}
        className={`${sizeClass} shrink-0 rounded-xl object-cover ${className}`}
      />
    )
  }

  return (
    <div ref={ref} className={`${sizeClass} flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 font-bold text-white ${className}`}>
      {initials}
    </div>
  )
}
