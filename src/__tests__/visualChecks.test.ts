import { describe, expect, it } from 'vitest'
import { getVisualCheckWarnings } from '../visualChecks'

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

  it('装飾同士がわずかに触れる程度（許容誤差以下）では重なりと見なさない', () => {
    const { section, body, front } = buildSection()
    const decoration = document.createElement('div')
    front.appendChild(decoration)
    setRect(decoration, { left: 1100, top: 600, width: 150, height: 100 })
    addLeaf(body, { left: 1249, top: 699, width: 80, height: 40 })

    const warnings = getVisualCheckWarnings(section)
    expect(warnings.some((w) => w.includes('装飾との重なり'))).toBe(false)
  })
})
