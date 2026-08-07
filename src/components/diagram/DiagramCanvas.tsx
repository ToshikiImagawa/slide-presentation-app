import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
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

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      setSize((prev) => (prev.width === el.offsetWidth && prev.height === el.offsetHeight ? prev : { width: el.offsetWidth, height: el.offsetHeight }))
    }
    // Reveal.js は非表示スライドを opacity/transform で隠す（display:none にしない）ため、
    // 現在表示中でないスライドでもマウント直後に実サイズが取れる
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
