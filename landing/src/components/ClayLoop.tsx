import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

// A clay animation clip (assets/video/web) that plays only while on screen.
// Reduced motion, or a browser that refuses autoplay, shows the webp poster instead.
export function ClayLoop({ name, className, once = false, size }: { name: string; className?: string; once?: boolean; size?: number }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {})
      else if (!once) v.pause()
    })
    io.observe(v)
    return () => io.disconnect()
  }, [once])
  const poster = `/video/${name}.webp`
  if (reduce) return <img className={className} src={poster} alt="" width={size} height={size} />
  return (
    <video
      ref={ref}
      className={className}
      src={`/video/${name}.mp4`}
      poster={poster}
      muted
      playsInline
      loop={!once}
      preload="metadata"
      width={size}
      height={size}
      aria-hidden="true"
    />
  )
}
