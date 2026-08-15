'use client'

/**
 * Shared avatar — consolidates the two avatar implementations that used to
 * live separately in top-bar.tsx (user profile image) and
 * conversations/page.tsx (agent initials). Follows the same fallback order
 * Vercel's Geist Avatar documents (vercel.com/geist/avatar): image first,
 * initials if there's no image or it fails to load.
 *
 * Note: the actual @vercel/geistcn package this pattern is modeled on isn't
 * published to npm (confirmed 404 on the registry) — no CLI/registry
 * install path exists yet, so this is a local component matching its
 * documented behavior rather than a wrapper around the real thing.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: number
  className?: string
}

function getInitials(name: string | null | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) return '?'
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  return trimmed[0].toUpperCase()
}

export function Avatar({ src, name, size = 32, className }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)

  // Reset failure state if a new src comes in (e.g. switching between users) —
  // adjusted during render per React's guidance, no effect needed.
  const [prevSrc, setPrevSrc] = useState(src)
  if (src !== prevSrc) {
    setPrevSrc(src)
    setImgFailed(false)
  }

  const showImage = !!src && !imgFailed

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-full overflow-hidden flex items-center justify-center',
        'bg-primary/15 text-primary ring-1 ring-white/10 font-bold select-none',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      title={name || undefined}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  )
}
