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
    touch?: boolean
    navigationMode?: string
  }

  class Reveal {
    constructor(element: HTMLElement, options?: RevealOptions)

    initialize(): Promise<void>

    destroy(): void

    on(event: string, callback: (...args: unknown[]) => void): void

    off(event: string, callback: (...args: unknown[]) => void): void

    getIndices(): { h: number; v: number }

    next(): void

    prev(): void
  }

  export default Reveal
}
