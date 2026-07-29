import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/** useReveal.ts の設計解像度と一致させる（スライドとPDFページを1:1で対応させるため） */
const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720
const CAPTURE_SCALE = 2

export type PdfExportResult = 'saved' | 'cancelled'

/**
 * 各スライドをオフスクリーンでクローン・キャプチャしPDFへ組み立てる。
 * Reveal.js の slide() ナビゲーションは使わない。実際にスライドを送ると slidechanged が発火し、
 * 音声再生・発表者ビュー同期等の副作用（App.tsx の handleSlideChanged）が誤作動するため、
 * ライブDOM/Revealの状態には触れず deckEl から直接 section をクローンして処理する。
 */
export async function exportSlidesToPdf(deckEl: HTMLElement, title: string): Promise<PdfExportResult> {
  const sections = deckEl.querySelectorAll<HTMLElement>('.slides > section')
  if (sections.length === 0) {
    throw new Error('no slides to export')
  }

  const container = createCaptureContainer()
  document.body.appendChild(container)

  let pdf: jsPDF | null = null
  try {
    for (const section of sections) {
      const clone = cloneSlideForCapture(section)
      container.replaceChildren(clone)
      await waitForNextPaint()

      const canvas = await html2canvas(clone, {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        scale: CAPTURE_SCALE,
      })
      const imageData = canvas.toDataURL('image/png')

      if (!pdf) {
        pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_WIDTH, SLIDE_HEIGHT] })
      } else {
        pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], 'landscape')
      }
      pdf.addImage(imageData, 'PNG', 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
    }
  } finally {
    container.remove()
  }
  if (!pdf) {
    throw new Error('no slides to export')
  }

  const destination = await save({
    defaultPath: `${sanitizeFileName(title)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!destination) {
    return 'cancelled'
  }

  const bytes = Array.from(new Uint8Array(pdf.output('arraybuffer')))
  await invoke('export_pdf_file', { path: destination, bytes })
  return 'saved'
}

/** Reveal.js の `.slides > section:not(.present)` スコープ外に置くための一時コンテナ */
function createCaptureContainer(): HTMLDivElement {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = `-${SLIDE_WIDTH + 100}px`
  container.style.width = `${SLIDE_WIDTH}px`
  container.style.height = `${SLIDE_HEIGHT}px`
  container.style.overflow = 'hidden'
  return container
}

function cloneSlideForCapture(section: HTMLElement): HTMLElement {
  const clone = section.cloneNode(true) as HTMLElement
  clone.style.display = 'block'
  clone.style.width = `${SLIDE_WIDTH}px`
  clone.style.height = `${SLIDE_HEIGHT}px`
  clone.style.transform = 'none'
  // 未訪問のフラグメントも書き出しでは表示済み状態にする（PrintView相当の挙動）
  clone.querySelectorAll('.fragment').forEach((el) => el.classList.add('visible'))
  return clone
}

/** フォント確定・レイアウト反映を待つ（rAF2回） */
function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function sanitizeFileName(title: string): string {
  const sanitized = title.replace(/[\\/:*?"<>|]/g, '_').trim()
  return sanitized || 'slides'
}
