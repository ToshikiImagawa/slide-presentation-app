import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAutoFitHeadingFontSize } from '../useAutoFitHeadingFontSize'

/** テスト用に DOMRect を要素へ固定する（jsdom はレイアウトを計算しないため。visualChecks.test.ts の setRect と同じ手法） */
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

/** jsdom は要素に適用中の CSS カスケードを解決できないため、target の getComputedStyle().fontSize/lineHeight だけを
 * 固定値に差し替える。lineHeight 省略時は estimateLineCount が常に1行と見なす値（NaN → フォールバック）のまま */
function mockComputedFontSize(target: HTMLElement, px: number, lineHeightPx?: number): void {
  const original = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, ...rest) => (el === target ? ({ fontSize: `${px}px`, lineHeight: lineHeightPx !== undefined ? `${lineHeightPx}px` : undefined } as CSSStyleDeclaration) : original(el, ...rest)))
}

/** SlideFrame.tsx が組み立てる .master-body > .title-layout > h1 の構造を模したフィクスチャ。
 * .master-body は 1280x720・padding 60px（セーフエリア）で、offsetWidth/Height を rect と一致させて
 * scale=1（無補正）にする */
function buildFixture() {
  const container = document.createElement('div')
  container.className = 'master-body'
  container.style.paddingTop = '60px'
  container.style.paddingRight = '60px'
  container.style.paddingBottom = '60px'
  container.style.paddingLeft = '60px'
  const box = document.createElement('div')
  box.className = 'title-layout'
  const target = document.createElement('h1')
  box.appendChild(target)
  container.appendChild(box)
  document.body.appendChild(container)

  setRect(container, { left: 0, top: 0, width: 1280, height: 720 })
  Object.defineProperty(container, 'offsetWidth', { value: 1280, configurable: true })
  Object.defineProperty(container, 'offsetHeight', { value: 720, configurable: true })

  return { container, box, target }
}

/** .section-title-layout / .message-layout は height:100% で常に .master-body を埋める（global.css）ため、
 * 包む箱ではなく target 自身の矩形で判定する必要があることを確認する回帰フィクスチャ */
function buildHeightFullFixture() {
  const container = document.createElement('div')
  container.className = 'master-body'
  container.style.paddingTop = '60px'
  container.style.paddingRight = '60px'
  container.style.paddingBottom = '60px'
  container.style.paddingLeft = '60px'
  const box = document.createElement('div')
  box.className = 'message-layout'
  const target = document.createElement('p')
  box.appendChild(target)
  container.appendChild(box)
  document.body.appendChild(container)

  setRect(container, { left: 0, top: 0, width: 1280, height: 720 })
  Object.defineProperty(container, 'offsetWidth', { value: 1280, configurable: true })
  Object.defineProperty(container, 'offsetHeight', { value: 720, configurable: true })
  // height:100% により、内容量に関わらず常にセーフエリアにぴったり収まった矩形を返す（実機での不具合の再現）
  setRect(box, { left: 60, top: 60, width: 1160, height: 600 })

  return { container, box, target }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('useAutoFitHeadingFontSize', () => {
  it('セーフエリア内に収まっている場合はフォントサイズを縮小しない', () => {
    const { target } = buildFixture()
    mockComputedFontSize(target, 72)
    setRect(target, { left: 200, top: 200, width: 800, height: 200 }) // セーフエリア(60,60,1220,660)の内側

    renderHook(() => useAutoFitHeadingFontSize({ current: target }, true))

    expect(target.style.fontSize).toBe('')
  })

  it('セーフエリアからはみ出す場合は収まるまで段階的に縮小する', () => {
    const { target } = buildFixture()
    mockComputedFontSize(target, 72)
    // 3回縮小した時点で収まったことにする（実測値の変化ではなく縮小ロジックの停止条件を検証する）。
    // fontSize への書き込みを own property の getter/set で横取りし、空文字（リセット）は縮小回数に数えない
    let shrinkCount = 0
    let currentFontSize = ''
    Object.defineProperty(target.style, 'fontSize', {
      configurable: true,
      get: () => currentFontSize,
      set: (value: string) => {
        if (value !== '') shrinkCount++
        currentFontSize = value
      },
    })
    // セーフエリアは top=60,bottom=660。3回縮小するまでは top=40,height=640(bottom=680)で上下に20pxずつ侵入する
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        shrinkCount >= 3
          ? { left: 200, top: 60, width: 800, height: 600, right: 1000, bottom: 660, x: 200, y: 60, toJSON: () => ({}) }
          : { left: 200, top: 40, width: 800, height: 640, right: 1000, bottom: 680, x: 200, y: 40, toJSON: () => ({}) },
    })

    renderHook(() => useAutoFitHeadingFontSize({ current: target }, true))

    expect(target.style.fontSize).toBe('60px') // 72 -> 68 -> 64 -> 60px（4px刻みで3回縮小した時点で収まる）
  })

  it('下限(32px)まで縮小しても収まらない場合はそこで止まる', () => {
    const { target } = buildFixture()
    mockComputedFontSize(target, 40)
    setRect(target, { left: 200, top: 0, width: 800, height: 720 }) // セーフエリアを常に超える

    renderHook(() => useAutoFitHeadingFontSize({ current: target }, true))

    expect(target.style.fontSize).toBe('32px')
  })

  it('セーフエリア内でも2行に折り返っている場合は1行に収まるサイズまで縮小する', () => {
    const { target } = buildFixture()
    mockComputedFontSize(target, 72, 20) // line-height固定20px
    let shrinkCount = 0
    let currentFontSize = ''
    Object.defineProperty(target.style, 'fontSize', {
      configurable: true,
      get: () => currentFontSize,
      set: (value: string) => {
        if (value !== '') shrinkCount++
        currentFontSize = value
      },
    })
    // 常にセーフエリア内（top=300）。2回縮小するまでは高さ40px（line-height20pxで2行相当）、以降は20px（1行相当）
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        const height = shrinkCount >= 2 ? 20 : 40
        return { left: 200, top: 300, width: 800, height, right: 1000, bottom: 300 + height, x: 200, y: 300, toJSON: () => ({}) }
      },
    })

    renderHook(() => useAutoFitHeadingFontSize({ current: target }, true))

    expect(target.style.fontSize).toBe('64px') // 72 -> 68 -> 64px（2回縮小で1行に収まる）
  })

  it('下限(32px)まで縮小しても1行に収まらない場合は折り返りを許容してそこで止まる', () => {
    const { target } = buildFixture()
    mockComputedFontSize(target, 40, 20) // line-height固定20px
    setRect(target, { left: 200, top: 300, width: 800, height: 40 }) // 常に2行相当（セーフエリア内だが折り返り続ける）

    renderHook(() => useAutoFitHeadingFontSize({ current: target }, true))

    expect(target.style.fontSize).toBe('32px')
  })

  it('titleの\\nによる明示的な改行（<br>）がある場合は、セーフエリアに収まっていれば1行化のための縮小をしない', () => {
    const { target } = buildFixture()
    target.appendChild(document.createElement('span')).textContent = '1行目'
    const secondLine = document.createElement('span')
    secondLine.appendChild(document.createElement('br'))
    secondLine.appendChild(document.createTextNode('2行目'))
    target.appendChild(secondLine)
    mockComputedFontSize(target, 72, 20) // line-height固定20pxなら2行相当の高さになる
    setRect(target, { left: 200, top: 300, width: 800, height: 40 }) // セーフエリア内・2行相当だが明示的な改行

    renderHook(() => useAutoFitHeadingFontSize({ current: target }, true))

    expect(target.style.fontSize).toBe('') // 1行に収めるための縮小は行われない
  })

  it('height:100%の箱（.message-layout等）に包まれていても、箱ではなくtarget自身の矩形で判定する', () => {
    const { target } = buildHeightFullFixture()
    mockComputedFontSize(target, 72)
    // 箱（.message-layout）はセーフエリアにぴったり収まっているが、target 自身は中央寄せの結果セーフエリアを
    // 大きく超えて張り出している（実機で発生した不具合の再現）
    setRect(target, { left: 60, top: -60, width: 1160, height: 800 }) // top=-60,bottom=740（セーフエリア外）

    renderHook(() => useAutoFitHeadingFontSize({ current: target }, true))

    expect(target.style.fontSize).toBe('32px') // 箱の矩形だけを見ていたら（誤って）縮小されない
  })

  it('enabled=false の場合は縮小せず、既存のインラインfont-sizeを消す', () => {
    const { target } = buildFixture()
    target.style.fontSize = '40px'

    renderHook(() => useAutoFitHeadingFontSize({ current: target }, false))

    expect(target.style.fontSize).toBe('')
  })

  it('.master-body の外にある要素は何もしない', () => {
    const target = document.createElement('h1')
    document.body.appendChild(target)
    mockComputedFontSize(target, 72)

    expect(() => renderHook(() => useAutoFitHeadingFontSize({ current: target }, true))).not.toThrow()
    expect(target.style.fontSize).toBe('')
  })

  it('target が null の場合は何もしない', () => {
    expect(() => renderHook(() => useAutoFitHeadingFontSize({ current: null }, true))).not.toThrow()
  })
})
