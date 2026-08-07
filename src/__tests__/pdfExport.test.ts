import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  writeFile: vi.fn(),
  save: vi.fn(),
  html2canvas: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
  output: vi.fn(),
  jsPDFCtor: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: h.writeFile }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: h.save }))
vi.mock('html2canvas', () => ({ default: h.html2canvas }))
vi.mock('jspdf', () => ({
  jsPDF: h.jsPDFCtor,
}))

import { exportSlidesToPdf, resolveCssVars } from '../pdfExport'

function buildDeck(slideCount: number): HTMLElement {
  const deck = document.createElement('div')
  const slides = document.createElement('div')
  slides.className = 'slides'
  for (let i = 0; i < slideCount; i++) {
    const section = document.createElement('section')
    section.textContent = `slide-${i}`
    slides.appendChild(section)
  }
  deck.appendChild(slides)
  return deck
}

describe('exportSlidesToPdf', () => {
  beforeEach(() => {
    h.writeFile.mockReset()
    h.save.mockReset()
    h.html2canvas.mockReset()
    h.addPage.mockReset()
    h.addImage.mockReset()
    h.output.mockReset()
    h.jsPDFCtor.mockReset()
    h.jsPDFCtor.mockImplementation(function MockJsPDF() {
      return { addPage: h.addPage, addImage: h.addImage, output: h.output }
    })
    h.html2canvas.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,dummy' })
    h.output.mockReturnValue(new ArrayBuffer(4))
  })

  it('スライドが1枚もない場合はエラーになる', async () => {
    await expect(exportSlidesToPdf(buildDeck(0), 'my-deck')).rejects.toThrow()
    expect(h.html2canvas).not.toHaveBeenCalled()
  })

  it('スライド枚数分 html2canvas を呼び、1枚目は new jsPDF、以降は addPage する', async () => {
    h.save.mockResolvedValue('/tmp/my-deck.pdf')

    const result = await exportSlidesToPdf(buildDeck(3), 'my-deck')

    expect(h.html2canvas).toHaveBeenCalledTimes(3)
    expect(h.addPage).toHaveBeenCalledTimes(2)
    expect(h.addImage).toHaveBeenCalledTimes(3)
    expect(result).toBe('saved')
  })

  it('保存ダイアログをキャンセルすると writeFile を呼ばずに cancelled を返す', async () => {
    h.save.mockResolvedValue(null)

    const result = await exportSlidesToPdf(buildDeck(2), 'my-deck')

    expect(h.writeFile).not.toHaveBeenCalled()
    expect(result).toBe('cancelled')
  })

  it('正常系で writeFile を保存先パス・バイト列で呼ぶ', async () => {
    h.save.mockResolvedValue('/tmp/my-deck.pdf')

    await exportSlidesToPdf(buildDeck(1), 'my-deck')

    expect(h.writeFile).toHaveBeenCalledTimes(1)
    const [path, bytes] = h.writeFile.mock.calls[0]
    expect(path).toBe('/tmp/my-deck.pdf')
    expect(bytes).toBeInstanceOf(Uint8Array)
  })

  it('各スライドをキャプチャ後に .present クラスを元の状態へ復元する', async () => {
    h.save.mockResolvedValue('/tmp/my-deck.pdf')
    const deck = buildDeck(2)
    const sections = deck.querySelectorAll('section')
    sections[0].classList.add('present')

    await exportSlidesToPdf(deck, 'my-deck')

    expect(sections[0].classList.contains('present')).toBe(true)
    expect(sections[1].classList.contains('present')).toBe(false)
  })

  it('キャプチャ対象に .past/.future が残っていない状態で html2canvas を呼ぶ（Reveal.jsの隠しCSSを回避）', async () => {
    h.save.mockResolvedValue('/tmp/my-deck.pdf')
    const deck = buildDeck(3)
    const sections = deck.querySelectorAll('section')
    sections[0].classList.add('present')
    sections[1].classList.add('future')
    sections[2].classList.add('future')

    const capturedClassNames: string[] = []
    h.html2canvas.mockImplementation(async (el: HTMLElement) => {
      capturedClassNames.push(el.className)
      return { toDataURL: () => 'data:image/png;base64,dummy' }
    })

    await exportSlidesToPdf(deck, 'my-deck')

    expect(capturedClassNames).toEqual(['present', 'present', 'present'])
    // キャプチャ後は元の past/future 構成に復元される
    expect(sections[1].classList.contains('future')).toBe(true)
    expect(sections[2].classList.contains('future')).toBe(true)
  })

  it('キャプチャ対象以外は .future で隠したまま撮影する（素のブロック要素として表示されるのを防ぐ）', async () => {
    h.save.mockResolvedValue('/tmp/my-deck.pdf')
    const deck = buildDeck(3)
    const sections = deck.querySelectorAll('section')

    const bystanderStates: string[][] = []
    h.html2canvas.mockImplementation(async (el: HTMLElement) => {
      bystanderStates.push(
        Array.from(sections)
          .filter((s) => s !== el)
          .map((s) => s.className),
      )
      return { toDataURL: () => 'data:image/png;base64,dummy' }
    })

    await exportSlidesToPdf(deck, 'my-deck')

    for (const bystanders of bystanderStates) {
      for (const className of bystanders) {
        expect(className).toBe('future')
      }
    }
  })

  describe('キャンバスサイズ（#188）', () => {
    it('canvasWidth/canvasHeight 省略時は 1280x720（現行と完全同一）', async () => {
      h.save.mockResolvedValue('/tmp/my-deck.pdf')

      await exportSlidesToPdf(buildDeck(1), 'my-deck')

      expect(h.jsPDFCtor).toHaveBeenCalledWith({ orientation: 'landscape', unit: 'px', format: [1280, 720] })
      expect(h.html2canvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width: 1280, height: 720 }))
      expect(h.addImage).toHaveBeenCalledWith(expect.anything(), 'PNG', 0, 0, 1280, 720)
    })

    it('canvasWidth/canvasHeight を指定するとその用紙比率・キャプチャサイズになる（4:3等）', async () => {
      h.save.mockResolvedValue('/tmp/my-deck.pdf')

      await exportSlidesToPdf(buildDeck(2), 'my-deck', 1280, 960)

      expect(h.jsPDFCtor).toHaveBeenCalledWith({ orientation: 'landscape', unit: 'px', format: [1280, 960] })
      expect(h.html2canvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ width: 1280, height: 960 }))
      expect(h.addPage).toHaveBeenCalledWith([1280, 960], 'landscape')
      expect(h.addImage).toHaveBeenCalledWith(expect.anything(), 'PNG', 0, 0, 1280, 960)
    })
  })

  // #204: html2canvas は <svg> を単体シリアライズして画像化するため、SVG 内の var() は祖先を失って解決できない。
  // 撮影の瞬間だけ実測値へ置き換え、チャート・図解プリミティブが PDF でも同じ色・線幅で描かれるようにする
  describe('SVG 内の CSS 変数のインライン化', () => {
    /** 色・線幅を var() で持つ SVG を含むデッキを作る。
     * jsdom の getComputedStyle は継承したカスタムプロパティを解決しないため、変数の定義も参照元の要素自身に置く
     * （実ブラウザではカスタムプロパティが継承するので、実際には :root や section[data-master] 側の定義でも解決できる） */
    function buildDeckWithSvg(): { deck: HTMLElement; polyline: SVGElement } {
      const deck = buildDeck(1)
      const section = deck.querySelector('section') as HTMLElement

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
      polyline.setAttribute('stroke', 'var(--theme-series-1)')
      polyline.setAttribute('style', '--theme-series-1: rgb(1, 2, 3); --theme-border-width: 2px; stroke-width: calc(var(--theme-border-width) * 3)')
      svg.appendChild(polyline)
      section.appendChild(svg)
      document.body.appendChild(deck)
      return { deck, polyline }
    }

    it('撮影時は var() が実測値に置き換わり、撮影後は元の指定へ復元する', async () => {
      h.save.mockResolvedValue('/tmp/my-deck.pdf')
      const { deck, polyline } = buildDeckWithSvg()

      const captured: Array<string | null> = []
      h.html2canvas.mockImplementation(async () => {
        captured.push(polyline.getAttribute('stroke'), polyline.getAttribute('style'))
        return { toDataURL: () => 'data:image/png;base64,dummy' }
      })

      await exportSlidesToPdf(deck, 'my-deck')

      expect(captured[0]).toBe('rgb(1, 2, 3)')
      expect(captured[1]).toContain('stroke-width: calc(2px * 3)')
      expect(polyline.getAttribute('stroke')).toBe('var(--theme-series-1)')
      expect(polyline.getAttribute('style')).toContain('stroke-width: calc(var(--theme-border-width) * 3)')
      deck.remove()
    })

    it('html2canvas が失敗しても元の指定へ復元する', async () => {
      h.save.mockResolvedValue('/tmp/my-deck.pdf')
      const { deck, polyline } = buildDeckWithSvg()
      h.html2canvas.mockRejectedValue(new Error('capture failed'))

      await expect(exportSlidesToPdf(deck, 'my-deck')).rejects.toThrow('capture failed')

      expect(polyline.getAttribute('stroke')).toBe('var(--theme-series-1)')
      deck.remove()
    })
  })
})

describe('resolveCssVars', () => {
  function computedOf(declarations: Record<string, string>): CSSStyleDeclaration {
    const probe = document.createElement('div')
    for (const [name, value] of Object.entries(declarations)) {
      probe.style.setProperty(name, value)
    }
    document.body.appendChild(probe)
    return getComputedStyle(probe)
  }

  it('未定義の変数はフォールバックを使う', () => {
    expect(resolveCssVars('var(--missing, 8px)', computedOf({}))).toBe('8px')
  })

  it('定義済みならフォールバックより実測値を優先する', () => {
    expect(resolveCssVars('var(--theme-radius-md, 8px)', computedOf({ '--theme-radius-md': '12px' }))).toBe('12px')
  })

  it('入れ子のフォールバックを内側から解く', () => {
    expect(resolveCssVars('var(--missing, var(--theme-primary))', computedOf({ '--theme-primary': 'teal' }))).toBe('teal')
  })

  it('解決できない参照が残っても無限に繰り返さない', () => {
    expect(resolveCssVars('var(--missing)', computedOf({}))).toBe('')
  })
})
