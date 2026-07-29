import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  save: vi.fn(),
  html2canvas: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
  output: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }))
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
    h.invoke.mockReset()
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

  it('保存ダイアログをキャンセルすると invoke を呼ばずに cancelled を返す', async () => {
    h.save.mockResolvedValue(null)

    const result = await exportSlidesToPdf(buildDeck(2), 'my-deck')

    expect(h.invoke).not.toHaveBeenCalled()
    expect(result).toBe('cancelled')
  })

  it('正常系で export_pdf_file を path/bytes で呼ぶ', async () => {
    h.save.mockResolvedValue('/tmp/my-deck.pdf')

    await exportSlidesToPdf(buildDeck(1), 'my-deck')

    expect(h.invoke).toHaveBeenCalledWith('export_pdf_file', {
      path: '/tmp/my-deck.pdf',
      bytes: [0, 0, 0, 0],
    })
  })
})
