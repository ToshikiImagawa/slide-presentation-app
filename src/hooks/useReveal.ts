import { useCallback, useEffect, useRef } from 'react'
import Reveal from 'reveal.js'

export interface UseRevealOptions {
  onSlideChanged?: (event: { indexh: number; indexv: number }) => void
}

export interface UseRevealReturn {
  deckRef: React.RefObject<HTMLDivElement | null>
  getCurrentSlide: () => { indexh: number; indexv: number } | null
  goToNext: () => void
  goToPrev: () => void
}

export function useReveal(options?: UseRevealOptions): UseRevealReturn {
  const deckRef = useRef<HTMLDivElement>(null)
  const deckInstanceRef = useRef<InstanceType<typeof Reveal> | null>(null)
  const onSlideChangedRef = useRef(options?.onSlideChanged)

  // コールバックの最新値を ref に保持（stale closure 回避）
  useEffect(() => {
    onSlideChangedRef.current = options?.onSlideChanged
  }, [options?.onSlideChanged])

  useEffect(() => {
    if (!deckRef.current) return

    const deck = new Reveal(deckRef.current, {
      width: 1280,
      height: 720,
      margin: 0,
      minScale: 0.2,
      maxScale: 2.0,
      center: false,
      controls: true,
      slideNumber: 'c/t',
      hash: true,
      transition: 'slide',
      progress: true,
      keyboard: true,
      touch: true,
      navigationMode: 'linear',
    })

    deck.initialize()
    deckInstanceRef.current = deck

    const handleSlideChanged = () => {
      if (onSlideChangedRef.current) {
        const indices = deck.getIndices()
        onSlideChangedRef.current({ indexh: indices.h, indexv: indices.v })
      }
    }

    deck.on('slidechanged', handleSlideChanged)

    return () => {
      deck.off('slidechanged', handleSlideChanged)
      deck.destroy()
      deckInstanceRef.current = null
    }
  }, [])

  const getCurrentSlide = useCallback((): { indexh: number; indexv: number } | null => {
    if (!deckInstanceRef.current) return null
    const indices = deckInstanceRef.current.getIndices()
    return { indexh: indices.h, indexv: indices.v }
  }, [])

  const goToNext = useCallback(() => {
    deckInstanceRef.current?.next()
  }, [])

  const goToPrev = useCallback(() => {
    deckInstanceRef.current?.prev()
  }, [])

  return { deckRef, getCurrentSlide, goToNext, goToPrev }
}
