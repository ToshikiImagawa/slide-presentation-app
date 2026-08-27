/**
 * スライド1枚分の DOM 実測に基づく見た目の破綻検出（はみ出し・セーフエリア侵入・マスター装飾との重なり・
 * 内部クリッピング・#209）。
 * getThemeWarnings（applyTheme.ts）等の静的な JSON 検証とは異なり、実際にレイアウトされた
 * getBoundingClientRect を読むため、レンダリング済みの `<section class="slide-container">` を渡して呼ぶ。
 * 既存の警告方針（検証エラーではなく警告。描画は継続する）を維持し、例外を投げない。
 */

/** 座標比較の許容誤差（px）。サブピクセルの丸め・アンチエイリアスによる誤検知を避ける */
const BOUNDS_TOLERANCE_PX = 1

/** 装飾との重なり判定の許容誤差（px）。端が数px触れる程度の意図的な近接配置は重なりと見なさない */
const OVERLAP_TOLERANCE_PX = 2

/** 「高さを受け取れていない」と見なす高さ（px）。0 を期待する検査だが、枠線や端数で数px残ることがある（#259） */
const COLLAPSED_HEIGHT_PX = 1

/** テキストが確認できる程度の抜粋（警告文で対象要素を識別するため） */
const EXCERPT_MAX_LENGTH = 24

type Bounds = { left: number; right: number; top: number; bottom: number }

function toBounds(rect: DOMRect): Bounds {
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
}

/** rect が bounds をどれだけ超えて出ているか（px）。内側（許容誤差込み）なら 0 */
function overshootPx(rect: DOMRect, bounds: Bounds): number {
  return Math.max(0, bounds.left - rect.left, rect.right - bounds.right, bounds.top - rect.top, rect.bottom - bounds.bottom)
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

type ElementRect = readonly [HTMLElement, DOMRect]

/**
 * root 配下の全要素を1要素につき1回だけ実測する。**この Map が実測の唯一の出処**で、
 * はみ出し・セーフエリア侵入・装飾重なり・高さ 0（#259）の各判定がすべてこれを共有する
 * （判定を足すたびに測り直すと、要素数 × 判定数の実測になる）。
 */
function measureDescendants(root: HTMLElement): Map<Element, DOMRect> {
  return new Map(Array.from(root.querySelectorAll('*')).map((el) => [el, el.getBoundingClientRect()]))
}

/**
 * 「見た目の最小単位」とみなす要素（レンダリングサイズを持ち、かつ描画済みの子要素を持たない）を集める。
 * 親→子の入れ子で同じはみ出しを重複報告しないよう、最も深い要素だけを対象にする。
 */
function getContentLeaves(rects: Map<Element, DOMRect>): ElementRect[] {
  return [...rects].filter(([el, rect]) => hasVisibleSize(rect) && !Array.from(el.children).some((child) => hasVisibleSize(rects.get(child)!))).map(([el, rect]): ElementRect => [el as HTMLElement, rect])
}

/**
 * 高さを受け取れていない「埋める要素」（.content-area-fill-item）を集める（#259）。
 * 幾何の破綻ではなく **fill 変種の契約（global.css）が成立しているかの検査** なので、矩形は返さない。
 *
 * 契約では、埋める要素は fill ホスト（.content-area-fill）の中に置かれて初めて flex:1 で残り高さを受け取る。
 * ホストの外に置かれると高さ 0 のまま静かに消えるが、getContentLeaves は 0 サイズの要素を
 * 「見た目の最小単位」から除外するため、はみ出し検査では気づけない。
 * 幅は持つのに高さだけ 0 の要素を対象にする（幅も 0 の場合は Reveal.js の unload 等で描画されていない
 * 状態であり、高さ解決の失敗とは区別する）。
 */
function getCollapsedFillItems(rects: Map<Element, DOMRect>): HTMLElement[] {
  return [...rects].filter(([el, rect]) => el.classList.contains('content-area-fill-item') && rect.width > 0 && rect.height <= COLLAPSED_HEIGHT_PX).map(([el]) => el as HTMLElement)
}

/** `overflow` が内容を隠す設定になっている値（`visible` は含まない） */
const CLIPPING_OVERFLOW_VALUES = new Set(['hidden', 'auto', 'scroll', 'clip'])

/**
 * `overflow`（-x/-y）が hidden/auto/scroll/clip の要素で、`scrollHeight`/`scrollWidth` が
 * `clientHeight`/`clientWidth` を超えている（= 見える範囲より内容が大きく、隠れている部分がある）ものを集める。
 *
 * はみ出し/セーフエリア判定は要素の位置をスライド全体・セーフエリアの境界と比較する方式のため、
 * 「内側のコンテナ自身の overflow によってそのコンテナの中でコンテンツが隠れている」状態
 * （例: `TwoColumnGrid.tsx` の `Column` が `justifyContent:center` + `overflow:hidden` を持ち、
 * カラム内容がカラム高さを超えると中央寄せの結果上端が見切れる。クリップされた見出しの座標自体は
 * スライド内・セーフエリア内に収まるため、位置比較では検知できない）を検知できない盲点だった。
 * `scrollHeight`/`scrollWidth` はブラウザが計算するスクロール可能な全内容のサイズなので、
 * 個別のレイアウト実装を知らずに汎用的に検知できる。
 */
function getClippedContainers(masterBody: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const el of masterBody.querySelectorAll<HTMLElement>('*')) {
    const style = getComputedStyle(el)
    if (!CLIPPING_OVERFLOW_VALUES.has(style.overflowY) && !CLIPPING_OVERFLOW_VALUES.has(style.overflowX)) continue
    if (el.scrollHeight - el.clientHeight > BOUNDS_TOLERANCE_PX || el.scrollWidth - el.clientWidth > BOUNDS_TOLERANCE_PX) {
      out.push(el)
    }
  }
  return out
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

/**
 * .master-body の padding（セーフエリア）を除いた内側の矩形。
 * `getComputedStyle` の padding は Reveal.js の `transform: scale()`（デッキ全体をビューポートに収めるための
 * 縮小/拡大。`useReveal.ts`）の影響を受けない素の値だが、`getBoundingClientRect` はスケール後（ビジュアル座標）
 * の値を返す。素の padding をそのままビジュアル座標の rect に加減すると、スケール比が1でない環境
 * （ビューポートがデッキの設計解像度と一致しない場合。CI 実測: 約51%スケールで約30px の誤検知）で境界がずれる。
 * offsetWidth/Height（transform 前のローカル border-box）と rect（transform 後）の比から実効スケールを求め、
 * padding をビジュアル座標系に変換してから rect に適用する。
 */
function getSafeBounds(masterBody: HTMLElement): Bounds {
  const rect = masterBody.getBoundingClientRect()
  const style = getComputedStyle(masterBody)
  const scaleX = masterBody.offsetWidth > 0 ? rect.width / masterBody.offsetWidth : 1
  const scaleY = masterBody.offsetHeight > 0 ? rect.height / masterBody.offsetHeight : 1
  return {
    left: rect.left + parseFloat(style.paddingLeft || '0') * scaleX,
    right: rect.right - parseFloat(style.paddingRight || '0') * scaleX,
    top: rect.top + parseFloat(style.paddingTop || '0') * scaleY,
    bottom: rect.bottom - parseFloat(style.paddingBottom || '0') * scaleY,
  }
}

/**
 * section 内で進行中の非無限アニメーション（`.content-area` の fadeInUp 等）を
 * Animation.finish() で最終状態（fill-mode: both の "to" 側）へ確定する。
 *
 * 以前はクラスの付与→解除（`animation: none` のトグル）で強制していたが、解除時に
 * `animation-name` が再適用されるとブラウザは別インスタンスの新規アニメーションとして
 * 扱うため、測定直後に fadeInUp が丸ごと再生され、本番UIでスライド切替の度に二重発火していた
 * （#299）。Animation.finish() は同一の Animation インスタンスを終端まで進めるだけで
 * `animation-name` 自体には触れないため、呼んだあとに何かを "元に戻す" 操作が発生せず、
 * 再生の再トリガーが起きない。既に完了しているアニメーションに対しては no-op。
 * カーソル点滅等の無限アニメーションは終端が無いため対象から除外する
 * （#209/#225 以前の `waitForAnimationsToSettle` と同じ判定基準）。
 *
 * getVisualCheckWarnings（ライブアプリ・CI）のほか、entrance animation の最終状態固定を
 * 必要とする箇所（PDF書き出し: `src/pdfExport.ts`、e2e の直接実測: `e2e/content-area-fill.spec.ts`）
 * からも同じ関数を呼び、固定手段を1系統に統一する（#306）。
 */
export function finishSettlingAnimations(section: HTMLElement): void {
  const animations = typeof section.getAnimations === 'function' ? section.getAnimations({ subtree: true }) : []
  for (const animation of animations) {
    if (animation.effect?.getComputedTiming().iterations === Infinity) continue
    animation.finish()
  }
}

/**
 * レンダリング済みのスライド1枚（`<section class="slide-container">`）を実測し、
 * ①はみ出し（スライド領域の外）②セーフエリア侵入（余白への侵入）③マスター装飾との重なり
 * ④高さを受け取れていない「埋める要素」（#259）⑤内部クリッピング（内側コンテナ自身の overflow による見切れ）、
 * を警告として返す。
 * `.master-body` が無い（現行と完全同一のフォールバック等）場合は検査対象がないため空配列を返す。
 *
 * 実測前に finishSettlingAnimations で entrance animation を最終状態へ強制する（理由は同関数の doc 参照）。
 */
export function getVisualCheckWarnings(section: HTMLElement): string[] {
  const masterBody = section.querySelector<HTMLElement>('.master-body')
  if (!masterBody) return []

  finishSettlingAnimations(section)

  const warnings: string[] = []
  const sectionBounds = toBounds(section.getBoundingClientRect())
  const safeBounds = getSafeBounds(masterBody)
  const rects = measureDescendants(masterBody)
  const leaves = getContentLeaves(rects)

  const overflowing = new Set<HTMLElement>()
  for (const [leaf, rect] of leaves) {
    const overshoot = overshootPx(rect, sectionBounds)
    if (overshoot > BOUNDS_TOLERANCE_PX) {
      overflowing.add(leaf)
      warnings.push(`はみ出し: ${describeElement(leaf)} がスライド領域の外に出ています（${overshoot.toFixed(1)}px 超過）`)
    }
  }

  for (const [leaf, rect] of leaves) {
    if (overflowing.has(leaf)) continue
    const overshoot = overshootPx(rect, safeBounds)
    if (overshoot > BOUNDS_TOLERANCE_PX) {
      warnings.push(`セーフエリア侵入: ${describeElement(leaf)} が余白（セーフエリア）に侵入しています（${overshoot.toFixed(1)}px 超過）`)
    }
  }

  for (const item of getCollapsedFillItems(rects)) {
    warnings.push(`高さ 0: ${describeElement(item)} が本文領域の残り高さを受け取れていません（.content-area-fill を名乗る区画の外に置かれている可能性）`)
  }

  const decorations: ElementRect[] = getDecorationElements(section)
    .map((el): ElementRect => [el, el.getBoundingClientRect()])
    .filter(([, rect]) => hasVisibleSize(rect))
  for (const [decoration, decorationRect] of decorations) {
    for (const [leaf, rect] of leaves) {
      if (rectsOverlap(decorationRect, rect)) {
        warnings.push(`装飾との重なり: ${describeElement(leaf)} がマスター装飾（${describeElement(decoration)}）と重なっています`)
      }
    }
  }

  for (const el of getClippedContainers(masterBody)) {
    const overflowPx = Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth)
    warnings.push(`内部クリッピング: ${describeElement(el)} が overflow で内容を隠しています（${overflowPx.toFixed(1)}px 超過）`)
  }

  return warnings
}

/** img の読み込み確定（成功/失敗問わず complete）を待つタイムアウト（ms）。読み込みが遅い/止まっている
 * 場合に検査自体が止まらないようにする保険で、実測はほぼ即座に解決する想定。
 * 画像はアニメーションと異なり「最終状態を強制する」手段がない（読み込み自体が非同期のIO）ため、
 * このタイムアウトは残す。打ち切りが起きたかどうかは戻り値の `timedOut` で判別できる（黙って起きない・#297） */
const IMAGE_SETTLE_TIMEOUT_MS = 2000

type ImageSettleResult = { timedOut: boolean }

/**
 * section 内の `<img>` がすべて読み込み確定（成功/失敗問わず）するまで待つ。
 * `FallbackImage`（`src/components/FallbackImage.tsx`）は読み込み確定まで `<img>` を `display:none` にし、
 * 確定後に実寸の `<img>` またはエラー用プレースホルダへ切り替える。読み込み確定前に実測すると、画像を
 * 含む figure/grid 等のレイアウトが最終形と異なり得るため、getVisualCheckWarnings を呼ぶ前に必ず待つ。
 *
 * `timedOut: true` で解決した場合、一部の画像が読み込み未確定のまま実測される可能性がある
 * （呼び出し元が CI ログ・コンソールに出す診断情報。誤検知と実装の不具合を切り分けるための材料）。
 */
export function waitForImagesToSettle(section: HTMLElement): Promise<ImageSettleResult> {
  const pending = Array.from(section.querySelectorAll('img')).filter((img) => !img.complete)
  if (pending.length === 0) return Promise.resolve({ timedOut: false })

  const settled: Promise<ImageSettleResult> = Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => ({ timedOut: false }))

  const timeout: Promise<ImageSettleResult> = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), IMAGE_SETTLE_TIMEOUT_MS))

  return Promise.race([settled, timeout])
}

/** レイアウト収束待ちの安全弁（フレーム数）。フレーム数は時間の上限を保証しない（rAF 自体が CPU 負荷で
 * 遅延しうるため、負荷が高い環境ほどこの安全弁も長くかかる。これは意図通り: 完了そのものを待つ設計であり、
 * 環境が遅いことを理由に途中の座標へ諦めて落ちることこそ避けたい）。fadeInUp とは無関係に Reveal.js 自身が
 * `.present` 付与後に行う transform:scale() 等の再計算が、CPU 負荷の高い環境（CI・並列実行）で数フレーム
 * 遅れて収束することがある（#297。entrance animation を瞬時に確定できるようになって初めて実測が
 * 瞬時になったことで露呈した別要因）。固定の待ち時間ではなく「連続2フレームで矩形が変化しなくなる」という完了そのものを待ち、
 * 収束しない場合の頭打ちとしてのみフレーム数を使う（打ち切りは戻り値の `timedOut` で判別できる） */
const LAYOUT_SETTLE_MAX_FRAMES = 120

type LayoutSettleResult = { timedOut: boolean }

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function rectsEqual(a: DOMRect, b: DOMRect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/**
 * section と、entrance animation（fadeInUp）が付与された要素すべての矩形が連続する2フレームで
 * 変化しなくなるまで待つ。対象要素は `getAnimations({subtree:true})` の effect.target から動的に
 * 求める（global.css の entrance animation 選択子リストを JS 側に書き写さないための設計）。
 * Reveal.js の内部レイアウト・スケール再計算が収束する前に実測すると、これらの要素が数px
 * ずれた位置で観測され、セーフエリア侵入として誤検知される（CI 実測。CPU 負荷が高いほど収束が遅れる）。
 */
export async function waitForLayoutToSettle(section: HTMLElement): Promise<LayoutSettleResult> {
  // アニメーションは .present 付与後のスタイル再計算で初めて生成されるため、1フレーム待ってから収集する
  await nextFrame()
  const animatedTargets =
    typeof section.getAnimations === 'function'
      ? section
          .getAnimations({ subtree: true })
          .map((animation) => (animation.effect as { target?: EventTarget | null } | null)?.target)
          .filter((target): target is HTMLElement => target instanceof HTMLElement)
      : []
  const targets = [section, ...new Set(animatedTargets)]

  let previous = targets.map((el) => el.getBoundingClientRect())
  for (let frame = 0; frame < LAYOUT_SETTLE_MAX_FRAMES; frame++) {
    await nextFrame()
    const current = targets.map((el) => el.getBoundingClientRect())
    if (current.every((rect, i) => rectsEqual(rect, previous[i]))) {
      return { timedOut: false }
    }
    previous = current
  }
  return { timedOut: true }
}

/**
 * scripts/screenshot/inspect-reference-deck.mjs（CI の見本デッキ全枚数検査）が Playwright の
 * page.evaluate 経由で同じ検出ロジックを呼び出すための公開口（#209）。screenshot モード
 * （`vite --mode screenshot`）でのみ window に生える。本番ビルドには一切混入しない
 * （src/__screenshot__/ の Tauri IPC モックと同じ「screenshot モード限定で window に生やす」規約）。
 */
if (import.meta.env.MODE === 'screenshot') {
  const bridge = window as unknown as {
    __VISUAL_CHECK__?: typeof getVisualCheckWarnings
    __VISUAL_CHECK_WAIT_IMAGES__?: typeof waitForImagesToSettle
    __VISUAL_CHECK_WAIT_LAYOUT__?: typeof waitForLayoutToSettle
    __VISUAL_CHECK_FINISH_ANIMATIONS__?: typeof finishSettlingAnimations
  }
  bridge.__VISUAL_CHECK__ = getVisualCheckWarnings
  bridge.__VISUAL_CHECK_WAIT_IMAGES__ = waitForImagesToSettle
  bridge.__VISUAL_CHECK_WAIT_LAYOUT__ = waitForLayoutToSettle
  bridge.__VISUAL_CHECK_FINISH_ANIMATIONS__ = finishSettlingAnimations
}
