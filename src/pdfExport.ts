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

  // Reveal.js は初期化時に現在スライド以外へ .past/.future を付与し、opacity:0・画面外transformで隠す。
  // .present だけをトグルしてもこれらは残るため、キャプチャ対象を確実に見せるには両方消す必要がある
  const originalClassNames = sections.map((section) => section.className)
  // html2canvas は section の実際の画面上サイズ（Reveal.js がビューポートに合わせて付与する
  // scale transform適用後）を基準にキャプチャするため、ウィンドウが設計解像度(1280x720)より
  // 小さいと縮小されたまま撮影され、PDFページの余白が白抜けになる。
  // Reveal自身が scale===1 のときに使う「空文字列にリセット」と同じ方法で無効化する
  // （transform:'none'等を明示指定すると .reveal .slides の left:50%/top:50% が残ってしまい中央寄せが崩れる）。
  // ウィンドウリサイズで Reveal の resize ハンドラが再度上書きしてくる可能性があるため、
  // スライドごとに撮影直前へ都度リセットする
  const originalSlidesStyle = {
    left: slidesEl.style.left,
    top: slidesEl.style.top,
    right: slidesEl.style.right,
    bottom: slidesEl.style.bottom,
    zoom: slidesEl.style.zoom,
    transform: slidesEl.style.transform,
  }
  const neutralizeSlidesScale = () => {
    slidesEl.style.left = ''
    slidesEl.style.top = ''
    slidesEl.style.right = ''
    slidesEl.style.bottom = ''
    slidesEl.style.zoom = ''
    slidesEl.style.transform = ''
  }
  // .pdf-capturing 付与中は global.css がテーマ背景・フェード効果を .slide-container に再現し、
  // fadeInUp アニメーションも無効化する（祖先である body/.backgrounds の見た目は
  // html2canvas が section 単体しかキャプチャしないため引き継がれない）
  deckEl.classList.add('pdf-capturing')

  let pdf: JsPDF
  try {
    // sections.length > 0 は上でガード済みなので、1ページ目を持つ状態で作成できる
    pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_WIDTH, SLIDE_HEIGHT] })
    for (const [index, section] of sections.entries()) {
      // 対象以外は .future を付与して隠す（opacity:0・画面外transform）。
      // present/past/future のいずれも持たない状態は Reveal.js が想定しないため、通常のブロック要素として
      // 表示されてしまう（対象スライドしか表示しない、という前提が崩れる）
      sections.forEach((s) => {
        s.classList.remove('present', 'past', 'future')
        if (s !== section) {
          s.classList.add('future')
        }
      })
      section.classList.add('present')
      neutralizeSlidesScale()
      await waitForSlideReady(section)
      neutralizeSlidesScale()

      const canvas = await html2canvas(section, {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        scale: CAPTURE_SCALE,
        // QrCodeCard等の外部画像（api.qrserver.com等）をCORSモードで再取得する。
        // 未対応だとcanvasが汚染され、その画像だけ空白になる
        useCORS: true,
      })
      const imageData = canvas.toDataURL('image/png')

      if (index > 0) {
        pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], 'landscape')
      }
      pdf.addImage(imageData, 'PNG', 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
    }
  } finally {
    sections.forEach((s, i) => {
      s.className = originalClassNames[i]
    })
    slidesEl.style.left = originalSlidesStyle.left
    slidesEl.style.top = originalSlidesStyle.top
    slidesEl.style.right = originalSlidesStyle.right
    slidesEl.style.bottom = originalSlidesStyle.bottom
    slidesEl.style.zoom = originalSlidesStyle.zoom
    slidesEl.style.transform = originalSlidesStyle.transform
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
