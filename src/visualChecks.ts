/**
 * スライド1枚分の DOM 実測に基づく見た目の破綻検出（はみ出し・セーフエリア侵入・マスター装飾との重なり・#209）。
 * getThemeWarnings（applyTheme.ts）等の静的な JSON 検証とは異なり、実際にレイアウトされた
 * getBoundingClientRect を読むため、レンダリング済みの `<section class="slide-container">` を渡して呼ぶ。
 * 既存の警告方針（検証エラーではなく警告。描画は継続する）を維持し、例外を投げない。
 */

/** 座標比較の許容誤差（px）。サブピクセルの丸め・アンチエイリアスによる誤検知を避ける */
const BOUNDS_TOLERANCE_PX = 1

/** 装飾との重なり判定の許容誤差（px）。端が数px触れる程度の意図的な近接配置は重なりと見なさない */
const OVERLAP_TOLERANCE_PX = 2

/** テキストが確認できる程度の抜粋（警告文で対象要素を識別するため） */
const EXCERPT_MAX_LENGTH = 24

type Bounds = { left: number; right: number; top: number; bottom: number }

function toBounds(rect: DOMRect): Bounds {
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
}

/** rect が bounds の外に出ているか（許容誤差込み） */
function exceedsBounds(rect: DOMRect, bounds: Bounds): boolean {
  return rect.left < bounds.left - BOUNDS_TOLERANCE_PX || rect.right > bounds.right + BOUNDS_TOLERANCE_PX || rect.top < bounds.top - BOUNDS_TOLERANCE_PX || rect.bottom > bounds.bottom + BOUNDS_TOLERANCE_PX
}

/** 2つの矩形が許容誤差を超えて重なっているか */
function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return overlapWidth > OVERLAP_TOLERANCE_PX && overlapHeight > OVERLAP_TOLERANCE_PX
}

function hasVisibleSize(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0
}

/** 警告文に載せる要素の識別子（タグ名 + 直下テキストの抜粋） */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, EXCERPT_MAX_LENGTH)
  return text ? `<${tag}>"${text}"` : `<${tag}>`
}

/**
 * root 配下で「見た目の最小単位」とみなす要素（レンダリングサイズを持ち、かつ描画済みの子要素を持たない）を集める。
 * 親→子の入れ子で同じはみ出しを重複報告しないよう、最も深い要素だけを対象にする。
 */
function getContentLeaves(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) => {
    const rect = el.getBoundingClientRect()
    if (!hasVisibleSize(rect)) return false
    return !Array.from(el.children).some((child) => hasVisibleSize(child.getBoundingClientRect()))
  })
}

/** マスター装飾の要素（.master-layer-back/.master-layer-front の直下。全面塗りの背景要素は対象外） */
function getDecorationElements(section: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = []
  for (const layer of section.querySelectorAll<HTMLElement>('.master-layer-back, .master-layer-front')) {
    for (const child of Array.from(layer.children)) {
      if (child instanceof HTMLElement && !child.classList.contains('master-background')) {
        elements.push(child)
      }
    }
  }
  return elements
}

/** .master-body の padding（セーフエリア）を除いた内側の矩形 */
function getSafeBounds(masterBody: HTMLElement): Bounds {
  const rect = masterBody.getBoundingClientRect()
  const style = getComputedStyle(masterBody)
  return {
    left: rect.left + parseFloat(style.paddingLeft || '0'),
    right: rect.right - parseFloat(style.paddingRight || '0'),
    top: rect.top + parseFloat(style.paddingTop || '0'),
    bottom: rect.bottom - parseFloat(style.paddingBottom || '0'),
  }
}

/**
 * レンダリング済みのスライド1枚（`<section class="slide-container">`）を実測し、
 * ①はみ出し（スライド領域の外）②セーフエリア侵入（余白への侵入）③マスター装飾との重なり、を警告として返す。
 * `.master-body` が無い（現行と完全同一のフォールバック等）場合は検査対象がないため空配列を返す。
 */
export function getVisualCheckWarnings(section: HTMLElement): string[] {
  const masterBody = section.querySelector<HTMLElement>('.master-body')
  if (!masterBody) return []

  const warnings: string[] = []
  const sectionBounds = toBounds(section.getBoundingClientRect())
  const safeBounds = getSafeBounds(masterBody)
  const leaves = getContentLeaves(masterBody)

  const overflowing = new Set<HTMLElement>()
  for (const leaf of leaves) {
    const rect = leaf.getBoundingClientRect()
    if (exceedsBounds(rect, sectionBounds)) {
      overflowing.add(leaf)
      warnings.push(`はみ出し: ${describeElement(leaf)} がスライド領域の外に出ています`)
    }
  }

  for (const leaf of leaves) {
    if (overflowing.has(leaf)) continue
    const rect = leaf.getBoundingClientRect()
    if (exceedsBounds(rect, safeBounds)) {
      warnings.push(`セーフエリア侵入: ${describeElement(leaf)} が余白（セーフエリア）に侵入しています`)
    }
  }

  const decorations = getDecorationElements(section).filter((el) => hasVisibleSize(el.getBoundingClientRect()))
  for (const decoration of decorations) {
    const decorationRect = decoration.getBoundingClientRect()
    for (const leaf of leaves) {
      if (rectsOverlap(decorationRect, leaf.getBoundingClientRect())) {
        warnings.push(`装飾との重なり: ${describeElement(leaf)} がマスター装飾（${describeElement(decoration)}）と重なっています`)
      }
    }
  }

  return warnings
}

/**
 * scripts/screenshot/inspect-reference-deck.mjs（CI の見本デッキ全枚数検査）が Playwright の
 * page.evaluate 経由で同じ検出ロジックを呼び出すための公開口（#209）。screenshot モード
 * （`vite --mode screenshot`）でのみ window に生える。本番ビルドには一切混入しない
 * （src/__screenshot__/ の Tauri IPC モックと同じ「screenshot モード限定で window に生やす」規約）。
 */
if (import.meta.env.MODE === 'screenshot') {
  ;(window as unknown as { __VISUAL_CHECK__?: typeof getVisualCheckWarnings }).__VISUAL_CHECK__ = getVisualCheckWarnings
}
