import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  writeFile: vi.fn(),
  save: vi.fn(),
  html2canvas: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
  output: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: h.writeFile }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: h.save }))
vi.mock('html2canvas', () => ({ default: h.html2canvas }))
vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(function MockJsPDF() {
    return { addPage: h.addPage, addImage: h.addImage, output: h.output }
  }),
}))

import { exportSlidesToPdf } from '../pdfExport'

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
})
