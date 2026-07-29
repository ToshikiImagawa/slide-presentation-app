import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import type { jsPDF as JsPDF } from 'jspdf'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from './hooks/useReveal'

const CAPTURE_SCALE = 2
const IMAGE_LOAD_TIMEOUT_MS = 5000
/** IntersectionObserver 駆動のアニメーション（TerminalAnimation 等）が開始してから安定するまでの待機 */
const RENDER_SETTLE_MS = 500

export type PdfExportResult = 'saved' | 'cancelled'

/**
 * 各スライドを一時的に .present 化してキャプチャし、PDFへ組み立てる。
 * Reveal.js の slide() ナビゲーションは使わない。実際にスライドを送ると slidechanged が発火し、
 * 音声再生・発表者ビュー同期等の副作用（App.tsx の handleSlideChanged）が誤作動するため、
 * .present クラスを直接トグルするだけに留める（Reveal自身のイベントは発火しない）。
 * オフスクリーンへクローンする方式は .reveal .slides スコープのCSS（テーマ色・フラグメント等）が
 * 適用されない上、画像読み込み・IntersectionObserver駆動のアニメーションの状態も引き継がれないため、
 * ライブDOMの該当スライドを直接キャプチャする。
 */
export async function exportSlidesToPdf(deckEl: HTMLElement, title: string): Promise<PdfExportResult> {
  const slidesEl = deckEl.querySelector<HTMLElement>('.slides')
  const sections = Array.from(deckEl.querySelectorAll<HTMLElement>('.slides > section'))
  if (!slidesEl || sections.length === 0) {
    throw new Error('no slides to export')
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])

  const previouslyPresent = sections.filter((section) => section.classList.contains('present'))
  const originalTransform = slidesEl.style.transform
  // Reveal.js が実行時に付与するビューポート合わせの scale transform を打ち消し、
  // 常に設計解像度どおりのサイズでキャプチャする（Reveal自身の @media print と同じ考え方）
  slidesEl.style.transform = 'none'
  deckEl.classList.add('pdf-capturing')

  let pdf: JsPDF
  try {
    // sections.length > 0 は上でガード済みなので、1ページ目を持つ状態で作成できる
    pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_WIDTH, SLIDE_HEIGHT] })
    for (const [index, section] of sections.entries()) {
      sections.forEach((s) => s.classList.remove('present'))
      section.classList.add('present')
      await waitForSlideReady(section)

      const canvas = await html2canvas(section, {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        scale: CAPTURE_SCALE,
      })
      const imageData = canvas.toDataURL('image/png')

      if (index > 0) {
        pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], 'landscape')
      }
      pdf.addImage(imageData, 'PNG', 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
    }
  } finally {
    sections.forEach((s) => s.classList.remove('present'))
    previouslyPresent.forEach((s) => s.classList.add('present'))
    slidesEl.style.transform = originalTransform
    deckEl.classList.remove('pdf-capturing')
  }

  const destination = await save({
    defaultPath: `${sanitizeFileName(title)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!destination) {
    return 'cancelled'
  }

  await writeFile(destination, new Uint8Array(pdf.output('arraybuffer')))
  return 'saved'
}

/** present化直後の画像読み込み・タイピングアニメーション開始を待つ */
async function waitForSlideReady(section: HTMLElement): Promise<void> {
  await waitForNextPaint()
  const pendingImages = Array.from(section.querySelectorAll('img')).filter((img) => !img.complete)
  await Promise.all(pendingImages.map(waitForImageSettled))
  await new Promise((resolve) => setTimeout(resolve, RENDER_SETTLE_MS))
}

function waitForImageSettled(img: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, IMAGE_LOAD_TIMEOUT_MS)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
  })
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
