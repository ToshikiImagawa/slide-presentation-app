// jsdom環境にないAPIのモック
class MockIntersectionObserver {
  readonly root: Element | null = null
  readonly rootMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []

  constructor(_callback: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

// jsdom は Range のレイアウト計測 API を実装しないため、CodeMirror（SlideJsonEditor）の座標計算が例外を投げる
Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => '' })
Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: () => [][Symbol.iterator]() }) as unknown as DOMRectList

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
