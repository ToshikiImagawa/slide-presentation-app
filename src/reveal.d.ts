declare module 'reveal.js' {
  interface RevealOptions {
    width?: number
    height?: number
    margin?: number
    minScale?: number
    maxScale?: number
    center?: boolean
    controls?: boolean
    slideNumber?: boolean | string
    hash?: boolean
    transition?: string
    progress?: boolean
    keyboard?: boolean
    /** キーボード操作を動的に無効化する（trueを返さない限り無視）。実行中は false 固定関数を渡す */
    keyboardCondition?: false | 'focused' | ((event: KeyboardEvent) => boolean)
    /** ? / F1 で Reveal 組み込みのヘルプオーバーレイを表示するか（既定 true） */
    help?: boolean
    touch?: boolean
    navigationMode?: string
    /** 現在スライドから何枚先まで data-src → src 遅延読み込みの昇格対象にするか（既定 3） */
    viewDistance?: number
  }

  class Reveal {
    constructor(element: HTMLElement, options?: RevealOptions)

    initialize(): Promise<void>

    destroy(): void

    on(event: string, callback: (...args: unknown[]) => void): void

    off(event: string, callback: (...args: unknown[]) => void): void

    configure(options: Partial<RevealOptions>): void

    getIndices(): { h: number; v: number }

    next(): void

    prev(): void
  }

  export default Reveal
}
