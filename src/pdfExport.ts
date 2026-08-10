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
 * canvasWidth/canvasHeight 省略時は SLIDE_WIDTH/SLIDE_HEIGHT（現行と完全同一の1280x720）。
 * テーマの canvas サイズに合わせることで、用紙比率がキャンバス定義に追従する（#188）
 */
export async function exportSlidesToPdf(deckEl: HTMLElement, title: string, canvasWidth: number = SLIDE_WIDTH, canvasHeight: number = SLIDE_HEIGHT): Promise<PdfExportResult> {
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
  // Reveal.js の data-src → src 昇格（slideContent プラグイン）は viewDistance 圏内のスライドに
  // しか走らず、かつ .present クラスを直接トグルするだけの撮影ループでは Reveal 自身の
  // slidechanged/sync も発火しない。撮影対象は全スライドなので、ここで一括昇格させる（#224）
  const restoreLazyImages = promoteLazyImages(deckEl)

  let pdf: JsPDF
  try {
    // sections.length > 0 は上でガード済みなので、1ページ目を持つ状態で作成できる
    pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvasWidth, canvasHeight] })
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

      const restoreSvgVars = inlineSvgCssVariables(section)
      let imageData: string
      try {
        const canvas = await html2canvas(section, {
          width: canvasWidth,
          height: canvasHeight,
          scale: CAPTURE_SCALE,
          // QrCodeCard等の外部画像（api.qrserver.com等）をCORSモードで再取得する。
          // 未対応だとcanvasが汚染され、その画像だけ空白になる
          useCORS: true,
        })
        imageData = canvas.toDataURL('image/png')
      } finally {
        restoreSvgVars()
      }

      if (index > 0) {
        pdf.addPage([canvasWidth, canvasHeight], 'landscape')
      }
      pdf.addImage(imageData, 'PNG', 0, 0, canvasWidth, canvasHeight)
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
    restoreLazyImages()
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

/** `var(--name)` / `var(--name, fallback)`。入れ子は内側から解けるので fallback には括弧を含めない */
const CSS_VAR_PATTERN = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g

/** 入れ子の var() を解くための反復上限（フォールバックの連鎖がこれ以上深くなる指定は想定しない） */
const CSS_VAR_MAX_DEPTH = 4

/**
 * 文字列中の CSS 変数参照を、要素の計算済みカスタムプロパティ値へ置き換える。
 * 変数はカスタムプロパティなので継承する＝要素自身から読めば `:root` の値もマスター単位の
 * 上書き（theme.tokens の `section[data-master=...]` スコープ）も正しく解決できる。
 */
export function resolveCssVars(value: string, computed: CSSStyleDeclaration): string {
  let resolved = value
  for (let depth = 0; depth < CSS_VAR_MAX_DEPTH && resolved.includes('var('); depth++) {
    const next = resolved.replace(CSS_VAR_PATTERN, (_match, name: string, fallback?: string) => computed.getPropertyValue(name).trim() || (fallback ?? '').trim())
    if (next === resolved) break
    resolved = next
  }
  return resolved
}

/**
 * 撮影直前に、SVG 配下の属性（inline style を含む）に書かれた CSS 変数参照を実測値へ置き換える。
 *
 * html2canvas は `<svg>` を XMLSerializer で単体シリアライズして data URI の画像として描くため
 * （html2canvas の SVGElementContainer）、SVG の中の `var(--theme-series-1)` は祖先を失って解決できず、
 * 黒や未描画になる。チャート（#204）・図解プリミティブ（#202）はいずれも色・線幅を意匠トークンから
 * 引いているので、この置き換えがないと PDF だけ表示が一致しない。
 *
 * 戻り値を呼ぶと元の属性値へ戻す（ライブDOMを一時的に触るのは、この関数の呼び出し元が
 * class や transform に対して既に行っているのと同じ方針）。
 */
export function inlineSvgCssVariables(root: HTMLElement): () => void {
  const restores: Array<() => void> = []

  const inline = (element: Element) => {
    const targets = Array.from(element.attributes).filter((attr) => attr.value.includes('var('))
    if (targets.length === 0) return
    const computed = getComputedStyle(element)
    for (const attr of targets) {
      const { name, value } = attr
      element.setAttribute(name, resolveCssVars(value, computed))
      restores.push(() => element.setAttribute(name, value))
    }
  }

  for (const svg of Array.from(root.querySelectorAll('svg'))) {
    inline(svg)
    for (const descendant of Array.from(svg.querySelectorAll('*'))) {
      inline(descendant)
    }
  }

  return () => restores.forEach((restore) => restore())
}

/**
 * `data-src` のまま未読み込みの img を一括で `src` へ昇格させる（#224 の遅延読み込み対応）。
 * 戻り値を呼ぶと `src` を外して元の遅延読み込み状態（`data-src` のみ）に戻す。
 */
function promoteLazyImages(deckEl: HTMLElement): () => void {
  const images = Array.from(deckEl.querySelectorAll<HTMLImageElement>('img[data-src]:not([src])'))
  images.forEach((img) => {
    img.src = img.dataset.src as string
  })
  return () => {
    images.forEach((img) => img.removeAttribute('src'))
  }
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
