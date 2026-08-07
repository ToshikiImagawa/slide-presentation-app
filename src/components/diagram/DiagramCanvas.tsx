import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { CanvasSize } from './geometry'
import styles from './DiagramCanvas.module.css'

const DiagramSizeContext = createContext<CanvasSize>({ width: 0, height: 0 })

/**
 * キャンバスの実測サイズ（CSS px）を得る。線系プリミティブは縦横比で歪まない px 空間で
 * 経路を組む必要があるため、この値を掛けて正規化座標を px に変換する。
 * 計測前は 0 なので、線系プリミティブは 0 の間は描画を諦める（次の再描画で載る）。
 */
export function useDiagramSize(): CanvasSize {
  return useContext(DiagramSizeContext)
}

/**
 * 図解プリミティブを載せるキャンバス（#202）。
 *
 * 子要素はキャンバス相対の正規化座標（0〜1）で配置されるため、キャンバスサイズ（テーマの
 * canvas 定義や本文領域の高さ）が変わっても相対配置が保たれる。
 * サイズ計測は CSS zoom の影響を受けない offsetWidth/offsetHeight を読む（Reveal.js は
 * ウィンドウが設計解像度より大きいとき .slides に zoom を掛けるため、getBoundingClientRect
 * では zoom 込みの値になり px 経路が二重に拡大される）。
 */
export function DiagramCanvas({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 })

  // 線系プリミティブは実測サイズが揃うまで描けないため、ペイント前に計測して二重描画を避ける
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      // Reveal.js は viewDistance（既定 3）の外のスライドを unload して display:none にするため、
      // 表示範囲を出入りするたびに 0 が観測される。0 は「箱が無い」だけで図解の寸法が変わったわけでは
      // ないので無視し、最後の実サイズを保持する（線レイヤーの破棄・再構築を防ぐ）
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return
      setSize((prev) => (prev.width === el.offsetWidth && prev.height === el.offsetHeight ? prev : { width: el.offsetWidth, height: el.offsetHeight }))
    }
    // jsdom の ResizeObserver モックは observe() で初回コールバックを配送しないため明示的に呼ぶ
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={styles.canvas} data-testid="diagram-canvas">
      <DiagramSizeContext.Provider value={size}>{children}</DiagramSizeContext.Provider>
    </div>
  )
}
