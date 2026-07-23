/**
 * スクリーンショット撮影モード（`vite --mode screenshot`）専用の
 * `@tauri-apps/api/event` モック。
 *
 * インページのイベントバスで emit / listen を再現する。加えて:
 * - 発表者ビュー（presenter-view.html）の単独撮影のため、'presenterViewReady' を
 *   受けたら /slides.json を読み込んで addonsChanged + slideChanged を返送する
 *   responder を内蔵する（本来はメインウィンドウが担う応答をモックが肩代わりする）。
 * - 撮影ドライバから任意イベントを注入できるよう window.__SCREENSHOT_EMIT__ を公開する。
 *
 * Vite alias 経由で screenshot モード時のみ差し替わり、本番ビルドには混入しない。
 */
export interface Event<T> {
  event: string
  id: number
  payload: T
}

export type EventCallback<T> = (event: Event<T>) => void
export type UnlistenFn = () => void

const listeners = new Map<string, Set<EventCallback<unknown>>>()
let eventId = 0

function dispatch(event: string, payload: unknown): void {
  const set = listeners.get(event)
  if (set) {
    for (const cb of [...set]) {
      cb({ event, id: ++eventId, payload })
    }
  }
  respondToPresenterReady(event, payload)
}

async function loadFixtureSlides(): Promise<unknown[]> {
  try {
    const res = await fetch('/slides.json')
    if (res.ok) {
      const data = (await res.json()) as { slides?: unknown }
      if (Array.isArray(data.slides)) return data.slides
    }
  } catch {
    // fixture が無い場合は空スライド（発表者ビューは待機表示のまま）
  }
  return []
}

/** 発表者ビューが emit する presenterViewReady に対し、slides 付きの slideChanged を返送する */
function respondToPresenterReady(event: string, payload: unknown): void {
  if (event !== 'presenter-view') return
  const message = payload as { type?: string } | undefined
  if (!message || message.type !== 'presenterViewReady') return
  void loadFixtureSlides().then((slides) => {
    dispatch('presenter-view', { type: 'addonsChanged', payload: { owner: '', scripts: [] } })
    dispatch('presenter-view', { type: 'slideChanged', payload: { currentIndex: 0, slides } })
  })
}

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  let set = listeners.get(event)
  if (!set) {
    set = new Set()
    listeners.set(event, set)
  }
  const wrapped = handler as EventCallback<unknown>
  set.add(wrapped)
  return () => {
    set?.delete(wrapped)
  }
}

export async function emit<T>(event: string, payload?: T): Promise<void> {
  dispatch(event, payload)
}

declare global {
  interface Window {
    __SCREENSHOT_EMIT__?: (event: string, payload?: unknown) => void
  }
}

if (typeof window !== 'undefined') {
  window.__SCREENSHOT_EMIT__ = (event, payload) => dispatch(event, payload)
}
