import { describe, expect, it, vi } from 'vitest'
import { getVisualCheckWarnings, waitForImagesToSettle, waitForLayoutToSettle } from '../visualChecks'

/** テスト用の DOMRect を要素へ固定する（jsdom はレイアウトを計算しないため実測値を明示的に与える） */
function setRect(el: HTMLElement, r: { left: number; top: number; width: number; height: number }): void {
  const rect = {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    right: r.left + r.width,
    bottom: r.top + r.height,
    x: r.left,
    y: r.top,
    toJSON() {
      return this
    },
  } as DOMRect
  el.getBoundingClientRect = () => rect
}

/** SlideFrame.tsx が組み立てる DOM 構造（.slide-container > .master-layer-back/.master-body/.master-layer-front）を模したフィクスチャ */
function buildSection() {
  const section = document.createElement('section')
  section.className = 'slide-container'
  const back = document.createElement('div')
  back.className = 'master-layer-back'
  const body = document.createElement('div')
  body.className = 'master-body'
  body.style.paddingTop = '60px'
  body.style.paddingRight = '60px'
  body.style.paddingBottom = '60px'
  body.style.paddingLeft = '60px'
  const front = document.createElement('div')
  front.className = 'master-layer-front'
  section.append(back, body, front)
  document.body.appendChild(section)

  setRect(section, { left: 0, top: 0, width: 1280, height: 720 })
  setRect(body, { left: 0, top: 0, width: 1280, height: 720 })
  return { section, back, body, front }
}

function addLeaf(parent: HTMLElement, rect: { left: number; top: number; width: number; height: number }, text = 'content'): HTMLElement {
  const el = document.createElement('p')
  el.textContent = text
  parent.appendChild(el)
  setRect(el, rect)
  return el
}

/** テスト用に scrollHeight/clientHeight・scrollWidth/clientWidth を固定する（jsdom はレイアウトを計算しないため） */
function setScrollSize(el: HTMLElement, size: { scrollHeight?: number; clientHeight?: number; scrollWidth?: number; clientWidth?: number }): void {
  if (size.scrollHeight !== undefined) Object.defineProperty(el, 'scrollHeight', { value: size.scrollHeight, configurable: true })
  if (size.clientHeight !== undefined) Object.defineProperty(el, 'clientHeight', { value: size.clientHeight, configurable: true })
  if (size.scrollWidth !== undefined) Object.defineProperty(el, 'scrollWidth', { value: size.scrollWidth, configurable: true })
  if (size.clientWidth !== undefined) Object.defineProperty(el, 'clientWidth', { value: size.clientWidth, configurable: true })
}

describe('getVisualCheckWarnings（#209）', () => {
  it('.master-body が無い場合は空配列を返す', () => {
    const section = document.createElement('section')
    document.body.appendChild(section)
    expect(getVisualCheckWarnings(section)).toEqual([])
  })

  it('セーフエリア内に収まる本文には警告しない', () => {
    const { section, body } = buildSection()
    addLeaf(body, { left: 100, top: 100, width: 200, height: 50 })
    expect(getVisualCheckWarnings(section)).toEqual([])
  })

  it('スライド領域を超える要素をはみ出しとして警告する', () => {
    const { section, body } = buildSection()
    addLeaf(body, { left: 1200, top: 100, width: 200, height: 50 })
    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('はみ出し'))).toBe(true)
  })

  it('スライド領域内だがセーフエリア（padding）に侵入する要素を警告し、はみ出しとしては警告しない', () => {
    const { section, body } = buildSection()
    addLeaf(body, { left: 10, top: 100, width: 30, height: 50 })
    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('セーフエリア侵入'))).toBe(true)
    expect(warnings.some((w) => w.includes('はみ出し'))).toBe(false)
  })

  it('マスター装飾と本文が重なる場合に警告する', () => {
    const { section, body, front } = buildSection()
    const decoration = document.createElement('div')
    front.appendChild(decoration)
    setRect(decoration, { left: 1100, top: 600, width: 150, height: 100 })
    addLeaf(body, { left: 1120, top: 620, width: 80, height: 40 }, 'overlap-text')

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('装飾との重なり') && w.includes('overlap-text'))).toBe(true)
  })

  it('全面塗りの master-background 要素は装飾との重なり判定から除外する', () => {
    const { section, body, back } = buildSection()
    const background = document.createElement('div')
    background.className = 'master-background'
    back.appendChild(background)
    setRect(background, { left: 0, top: 0, width: 1280, height: 720 })
    addLeaf(body, { left: 100, top: 100, width: 200, height: 50 })

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('装飾との重なり'))).toBe(false)
  })

  it('Reveal.js の transform: scale（デッキ設計解像度とビューポートの比が1でない場合）を補正してセーフエリア判定する', () => {
    // デッキが 50% スケールで描画されている状況を模す（ビジュアル座標は半分、CSS の padding・offsetWidth/Height は
    // transform の影響を受けないローカル値のまま）。実効セーフエリアは 60px * 0.5 = 30px になるはず
    const { section, body } = buildSection()
    setRect(section, { left: 0, top: 0, width: 640, height: 360 })
    setRect(body, { left: 0, top: 0, width: 640, height: 360 })
    Object.defineProperty(body, 'offsetWidth', { value: 1280, configurable: true })
    Object.defineProperty(body, 'offsetHeight', { value: 720, configurable: true })
    // 実効境界（30px）のすぐ内側。素の padding（60px）で判定すると誤って侵入警告になってしまう境界値
    addLeaf(body, { left: 35, top: 35, width: 100, height: 30 })

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('セーフエリア侵入'))).toBe(false)
  })

  // #259: fill 変種の契約（.content-area-fill-item は fill ホストの中で残り高さを受け取る）が
  // 成立していない要素の検出。高さ 0 の要素は「見た目の最小単位」から除外されるため専用に検査する
  it('高さを受け取れていない「埋める要素」（.content-area-fill-item）を警告する', () => {
    const { section, body } = buildSection()
    const item = document.createElement('div')
    item.className = 'content-area-fill-item'
    body.appendChild(item)
    setRect(item, { left: 100, top: 300, width: 1080, height: 0 })

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('高さ 0'))).toBe(true)
  })

  it('高さを受け取れている「埋める要素」には警告しない', () => {
    const { section, body } = buildSection()
    const item = document.createElement('div')
    item.className = 'content-area-fill-item'
    body.appendChild(item)
    setRect(item, { left: 100, top: 100, width: 1080, height: 500 })

    expect(getVisualCheckWarnings(section)).toEqual([])
  })

  it('幅も 0 の「埋める要素」（Reveal.js の unload 等で描画されていない状態）は警告しない', () => {
    const { section, body } = buildSection()
    const item = document.createElement('div')
    item.className = 'content-area-fill-item'
    body.appendChild(item)
    setRect(item, { left: 0, top: 0, width: 0, height: 0 })

    expect(getVisualCheckWarnings(section)).toEqual([])
  })

  it('装飾同士がわずかに触れる程度（許容誤差以下）では重なりと見なさない', () => {
    const { section, body, front } = buildSection()
    const decoration = document.createElement('div')
    front.appendChild(decoration)
    setRect(decoration, { left: 1100, top: 600, width: 150, height: 100 })
    addLeaf(body, { left: 1249, top: 699, width: 80, height: 40 })

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('装飾との重なり'))).toBe(false)
  })

  // TwoColumnGrid.tsx の Column（justifyContent:center + overflow:hidden）でカラム内容がカラム高さを
  // 超えると中央寄せの結果上端が見切れる問題が、はみ出し/セーフエリア判定（位置比較）では検知できず
  // 見逃されていた。scrollHeight/clientHeight（overflowで隠れている内容の有無を示すネイティブ信号）で検知する
  it('overflow:hidden の要素で scrollHeight が clientHeight を超える場合に内部クリッピングを警告する', () => {
    const { section, body } = buildSection()
    const column = document.createElement('div')
    column.style.overflowY = 'hidden'
    body.appendChild(column)
    setRect(column, { left: 100, top: 100, width: 400, height: 300 })
    setScrollSize(column, { scrollHeight: 340, clientHeight: 300 })

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('内部クリッピング'))).toBe(true)
  })

  it('overflow:visible の要素は scrollHeight が clientHeight を超えても警告しない', () => {
    const { section, body } = buildSection()
    const column = document.createElement('div')
    column.style.overflowY = 'visible'
    body.appendChild(column)
    setRect(column, { left: 100, top: 100, width: 400, height: 300 })
    setScrollSize(column, { scrollHeight: 340, clientHeight: 300 })

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('内部クリッピング'))).toBe(false)
  })

  it('overflow:hidden でも差が許容誤差（1px）以内なら内部クリッピングを警告しない', () => {
    const { section, body } = buildSection()
    const column = document.createElement('div')
    column.style.overflowY = 'hidden'
    body.appendChild(column)
    setRect(column, { left: 100, top: 100, width: 400, height: 300 })
    setScrollSize(column, { scrollHeight: 300.5, clientHeight: 300 })

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('内部クリッピング'))).toBe(false)
  })

  // #297: fadeInUp の途中（translateY 分だけずれた座標）を実測してしまう誤検知の再発防止。
  // 「完了を待つ」実装は実行環境の速さに依存して4回破綻したため、待たずに最終状態を強制する方式にした。
  // #299: 最終状態への強制はクラスの付与/解除（animation: none のトグル）ではなく Animation.finish() で行う。
  // クラス着脱は解除時に animation-name が再適用され新規アニメーションとして扱われ、本番UIで
  // entrance animation が丸ごと再生され直す（二重発火）バグを踏んだため、クラスには一切触れない
  it('実測前に非無限アニメーションを Animation.finish() で最終状態へ確定し、クラスの着脱は行わない', () => {
    const { section } = buildSection()
    const finish = vi.fn()
    const finite = { finish, effect: { getComputedTiming: () => ({ iterations: 1 }) } } as unknown as Animation
    const infinite = { finish: vi.fn(), effect: { getComputedTiming: () => ({ iterations: Infinity }) } } as unknown as Animation
    section.getAnimations = vi.fn().mockReturnValue([finite, infinite])
    const classListAdd = vi.spyOn(section.classList, 'add')
    const classListRemove = vi.spyOn(section.classList, 'remove')

    getVisualCheckWarnings(section)

    expect(finish).toHaveBeenCalledTimes(1)
    expect(infinite.finish).not.toHaveBeenCalled()
    expect(classListAdd).not.toHaveBeenCalled()
    expect(classListRemove).not.toHaveBeenCalled()
  })
})

describe('waitForImagesToSettle（#209/#297）', () => {
  it('img が無ければ即座に timedOut: false で解決する', async () => {
    const section = document.createElement('section')
    await expect(waitForImagesToSettle(section)).resolves.toEqual({ timedOut: false })
  })

  it('読み込み確定済み（complete）の img は待たずに timedOut: false で解決する', async () => {
    const section = document.createElement('section')
    const img = document.createElement('img')
    Object.defineProperty(img, 'complete', { value: true, configurable: true })
    section.appendChild(img)
    await expect(waitForImagesToSettle(section)).resolves.toEqual({ timedOut: false })
  })

  it('読み込み未確定の img は load/error イベント発火まで解決を待ち、timedOut: false で解決する', async () => {
    const section = document.createElement('section')
    const img = document.createElement('img')
    Object.defineProperty(img, 'complete', { value: false, configurable: true })
    section.appendChild(img)

    let resolved: { timedOut: boolean } | undefined
    waitForImagesToSettle(section).then((result) => {
      resolved = result
    })
    await Promise.resolve()
    expect(resolved).toBeUndefined()

    img.dispatchEvent(new Event('load'))
    await new Promise((r) => setTimeout(r, 0))
    expect(resolved).toEqual({ timedOut: false })
  })

  // 打ち切りが起きたかどうかを呼び出し元（CIログ・コンソール）が判別できることを保証する（#297）
  it('タイムアウトまで読み込みが確定しない場合は timedOut: true で解決する', async () => {
    vi.useFakeTimers()
    try {
      const section = document.createElement('section')
      const img = document.createElement('img')
      Object.defineProperty(img, 'complete', { value: false, configurable: true })
      section.appendChild(img)

      const promise = waitForImagesToSettle(section)
      await vi.advanceTimersByTimeAsync(2000)
      await expect(promise).resolves.toEqual({ timedOut: true })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('waitForLayoutToSettle（#297）', () => {
  /** 呼ぶたびに配列の次の矩形を返し、尽きたら最後の矩形を返し続ける（収束後の安定を模す） */
  function setSequentialRects(el: HTMLElement, rects: Array<{ left: number; top: number; width: number; height: number }>): void {
    let index = 0
    el.getBoundingClientRect = () => {
      const r = rects[Math.min(index, rects.length - 1)]
      index++
      return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => r } as DOMRect
    }
  }

  it('矩形が最初から変化しなければ1フレームで timedOut: false になる', async () => {
    const section = document.createElement('section')
    setSequentialRects(section, [{ left: 0, top: 0, width: 1280, height: 720 }])
    await expect(waitForLayoutToSettle(section)).resolves.toEqual({ timedOut: false })
  })

  it('数フレーム変化した後に収束すれば timedOut: false になる（Reveal.js のレイアウト再計算の遅延を模す）', async () => {
    const section = document.createElement('section')
    setSequentialRects(section, [
      { left: 0, top: 0, width: 1280, height: 720 },
      { left: 5, top: 0, width: 1280, height: 720 },
      { left: 10, top: 0, width: 1280, height: 720 },
      { left: 10, top: 0, width: 1280, height: 720 },
    ])
    await expect(waitForLayoutToSettle(section)).resolves.toEqual({ timedOut: false })
  })

  // 収束せず打ち切った場合が判別できることを保証する（誤検知か実装の不具合かを切り分けるための診断情報・#297）
  it('フレーム数の上限まで収束しない場合は timedOut: true になる', async () => {
    const section = document.createElement('section')
    let left = 0
    section.getBoundingClientRect = () => {
      left += 1
      return { left, top: 0, width: 1280, height: 720, right: left + 1280, bottom: 720, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    }
    await expect(waitForLayoutToSettle(section)).resolves.toEqual({ timedOut: true })
  })

  // 対象要素は global.css の entrance animation 選択子リストを書き写さず getAnimations() から動的に
  // 求める（#297）。.slide-title に限らず、entrance animation を持つ要素なら等しく収束対象になることを確認する
  it('entrance animation が付与された要素（getAnimations の effect.target）も収束対象に含める', async () => {
    const section = document.createElement('section')
    const title = document.createElement('h2')
    title.className = 'slide-title'
    section.appendChild(title)
    section.getAnimations = () => [{ effect: { target: title } } as unknown as Animation]

    setSequentialRects(section, [{ left: 0, top: 0, width: 1280, height: 720 }])
    setSequentialRects(title, [
      { left: 20, top: 60, width: 1160, height: 60 },
      { left: 15, top: 60, width: 1160, height: 60 },
      { left: 15, top: 60, width: 1160, height: 60 },
    ])
    await expect(waitForLayoutToSettle(section)).resolves.toEqual({ timedOut: false })
  })

  it('getAnimations が無い環境（Web Animations API 非対応）では section だけを対象にする', async () => {
    const section = document.createElement('section')
    expect(typeof section.getAnimations).toBe('undefined')
    setSequentialRects(section, [{ left: 0, top: 0, width: 1280, height: 720 }])
    await expect(waitForLayoutToSettle(section)).resolves.toEqual({ timedOut: false })
  })
})
