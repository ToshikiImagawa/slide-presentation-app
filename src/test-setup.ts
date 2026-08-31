// jsdom環境にないAPIのモック。observe() は実物と異なり、常に isIntersecting: true で即時同期発火する
// （TerminalAnimation・SequenceDiagram の SequenceMessages 等、IntersectionObserver で「このスライドが
// 表示中か」を判定するコンポーネントのテストで、要素が最初から見えている状態を再現するため）
class MockIntersectionObserver {
  readonly root: Element | null = null
  readonly rootMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []
  private callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this)
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

// jsdom はレイアウトを持たないため ResizeObserver も実装しない（SlidePreview・PresenterViewWindow・DiagramCanvas が使用）。
// observe() は実物と違って初回コールバックを配送しないため、購読側の同期的な初回計測だけが効く
class MockResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// jsdom は document.fonts（FontFaceSet）を実装しない（useAutoFitHeadingFontSize が Web フォント読み込み完了を待つのに使用）
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
}

// jsdom は Range のレイアウト計測 API を実装しないため、CodeMirror（SlideJsonEditor）の座標計算が例外を投げる
Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => '' })
Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList

// jsdom はレンダリングループを持たないため requestAnimationFrame を実装しない（pdfExport のペイント待ちで使用）
globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => setTimeout(() => callback(performance.now()), 0) as unknown as number

// jsdom は isContentEditable を実装しない（常に undefined）ため、contenteditable 属性から祖先方向に解決する
Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
  configurable: true,
  get(this: HTMLElement) {
    for (let el: HTMLElement | null = this; el; el = el.parentElement) {
      const value = el.getAttribute('contenteditable')
      if (value === 'true' || value === '') return true
      if (value === 'false') return false
    }
    return false
  },
})
