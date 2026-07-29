import { useCallback, useState } from 'react'

export const DEFAULT_SCROLL_SPEED = 20
const SCROLL_SPEED_STORAGE_KEY = 'slide-app-scroll-speed'

/**
 * スクロール速度（タイマー自動送りの秒数）を保持する。
 *
 * localStorage 永続のグローバル設定なので、設定 UI（Root の SettingsWindow）とタイマー（App の useAutoSlideshow）の
 * 共通祖先で所有する。アプリ起動時に1回だけ localStorage を読み、以降は state が真実源になる
 */
export function useScrollSpeed(): [number, (speed: number) => void] {
  const [scrollSpeed, setScrollSpeedState] = useState(() => {
    const stored = localStorage.getItem(SCROLL_SPEED_STORAGE_KEY)
    if (stored != null) {
      const parsed = Number(stored)
      if (Number.isFinite(parsed) && parsed >= 1) return parsed
    }
    return DEFAULT_SCROLL_SPEED
  })

  const setScrollSpeed = useCallback((speed: number) => {
    setScrollSpeedState(speed)
    localStorage.setItem(SCROLL_SPEED_STORAGE_KEY, String(speed))
  }, [])

  return [scrollSpeed, setScrollSpeed]
}
