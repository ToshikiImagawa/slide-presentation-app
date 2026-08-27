import { useLayoutEffect, type RefObject } from 'react'
import { finishSettlingAnimations, getSafeBounds, overshootPx } from '../visualChecks'

/** オートフィットが縮小するフォントサイズの下限(px)。これ以上縮めても収まらない場合は諦め、
 * はみ出し自体は既存の getVisualCheckWarnings に検出を委ねる */
const MIN_FONT_SIZE_PX = 32

/** 1回の縮小ステップ(px) */
const FONT_SIZE_STEP_PX = 4

/** セーフエリア侵入のサブピクセル差による誤検知（無限ループ・不要な縮小）を避ける許容誤差(px) */
const OVERFLOW_TOLERANCE_PX = 1

/** Reveal.js が現在表示中でないスライドに付与するクラス（3D変換で画面外へ回転・移動させる）。
 * 付与中は getBoundingClientRect が回転後の歪んだ矩形を返すため、実測に使えない */
const NOT_MEASURABLE_CLASSES = ['past', 'future']

/** target の描画行数を概算する（`.title-layout` の max-width（900px）により、コンテンツの長さに応じて
 * 折り返る場合がある。折り返り自体は正常な挙動だが、フォントサイズを下げれば1行に収まる範囲では
 * 1行を優先する・#タイトル回り込み）。
 * 折り返ったテキストは行の数だけ line box に分割されるが、target 自身（h1/h2/p等のブロック要素）の
 * `getClientRects()` はブロック全体で1つの矩形しか返さない（line box ごとの分割は反映されない）ため、
 * 実測した高さを行の高さ（line-height）で割って概算する */
function estimateLineCount(target: HTMLElement): number {
  const lineHeight = parseFloat(getComputedStyle(target).lineHeight)
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 1
  return Math.round(target.getBoundingClientRect().height / lineHeight)
}

/** title の `\n` による明示的な改行（`renderWithLineBreaks`。SlideRenderer.tsx）が `<br>` として
 * 描画されているか。明示的な改行がある場合は執筆者が意図した行分けなので、1行に収まるまで縮小する
 * 対象にはしない（自動での折り返りとは区別する） */
function hasExplicitLineBreak(target: HTMLElement): boolean {
  return target.querySelector('br') !== null
}

/**
 * タイトル要素（targetRef）を、祖先の `.master-body`（セーフエリア込みの表示可能領域・global.css）に
 * 侵入しなくなるまで段階的に縮小する（コンテンツの長さに応じた自動フォントサイズ調整）。
 *
 * 判定は `visualChecks.ts` の `getSafeBounds`/`overshootPx`（getVisualCheckWarnings の「セーフエリア侵入」
 * 判定と同一関数）で、**見出し要素（target）自身の矩形**を測る。見出しを包む `.title-layout` は内容量に
 * 応じた高さ（制約なし）だが、`.section-title-layout`/`.message-layout` は `height: 100%`（global.css）で
 * `.master-body` を常に埋めるため、包む箱の矩形は中身が縮小前でもオーバーフローしていても常に「収まっている」
 * ように見えてしまい、縮小の要否判定に使えない（実機検証で発覚）。一方 `target` 自身は親の `height:100%` の
 * 制約を受けず、`justify-content: center` による中央寄せで実際にセーフエリアの外へ張り出した分もそのまま
 * 矩形に表れるため、包む箱を経由せず target 自身を測ることで両レイアウトに共通のロジックで正しく判定できる。
 *
 * 全スライドは Reveal.js のデッキ全体が一度にマウントされる（#SlideRenderer）ため、現在表示中でない
 * スライドの `useLayoutEffect` も一緒に走る。Reveal.js は現在表示中でないスライドの `<section>` に
 * `past`/`future` クラスを付与し、3D回転・移動（`opacity:0` + `rotateY/translate3d` 等）で画面外へ配置する。
 * この間の `getBoundingClientRect` は回転後の歪んだ軸並行境界ボックスを返すため、セーフエリアとの
 * 重なり判定には使えない。そのため祖先 `<section>` の `class` 属性を `MutationObserver` で監視し、
 * `past`/`future` が付いている間は測定・縮小を行わず、`present` に変わった時点（＝正しく計測できる
 * ようになった時点）で改めて実行する。Reveal の外（編集プレビュー・発表者ビュー）では `<section>` に
 * これらのクラスが付かないため、常に計測対象になる。
 *
 * `present` になった直後は entrance アニメーション（`fadeInUp`。global.css の
 * `.reveal .slides section.present .title-layout` 等）が開始しており、`class` 変化を検知した直後に
 * 測ると transform/opacity がアニメーション途中の値のまま矩形を歪めてしまう（実機検証で発覚。
 * 見かけ上ズレた分だけ縮小が不十分または過剰になる）。`getVisualCheckWarnings` と同じ
 * `finishSettlingAnimations`（Animation.finish() で最終状態へ強制する。#297/#299）を測定直前に呼び、
 * アニメーションを終端まで進めてから測る。
 *
 * `.master-body` が実際のセーフエリアを持つのは Reveal.js の初期化（`useReveal.ts` の
 * `deck.initialize()`）が完了した後で、これは親コンポーネントの `useEffect`（非同期）で行われるため、
 * マウント直後の `useLayoutEffect` 一発では「まだサイズが確定していない箱」を測ってしまう。そのため
 * `.master-body` を `ResizeObserver` で監視し、サイズが確定した時点（＝変化した時点）で再計測する。
 * jsdom の ResizeObserver モックは `observe()` で初回コールバックを配送しないため、`DiagramCanvas.tsx` と
 * 同じ規約で `observe()` の前に一度明示的に実行する。
 *
 * 見出しフォント（`--theme-font-heading`。既定値は Noto Sans JP）は `<link ... display=swap>` で読み込む
 * Web フォントのため、初回の `fit()` はフォールバック書体（メトリクスが異なる）で測ってしまうことがある。
 * `document.fonts.ready` 解決時（本物の書体に差し替わった後）にも再度 `fit()` を実行し、書体差し替えによる
 * メトリクス変化を反映する。
 *
 * `enabled: false`（`content.titleFontSize` 等による手動指定時）は縮小を行わず、過去の自動縮小で残った
 * インラインの `font-size` を消す（手動指定 → 自動 → 手動、と切り替えたときに古い縮小値が残らないように
 * するため）。
 *
 * セーフエリアに収まっていても2行以上に折り返っている場合は、1行に収まるサイズまで追加で縮小する
 * （`estimateLineCount`。#タイトル回り込み）。`.title-layout` の `max-width: 900px` により、コンテンツが
 * 一定文字数を超えると縦方向には余裕があっても折り返る。折り返り自体は禁止しないが、縮小すれば1行に
 * 収まる範囲では1行表示を優先する（下限 `MIN_FONT_SIZE_PX` まで縮小しても折り返る場合は、その折り返りを
 * 許容する）。ただし `title` の `\n` による明示的な改行（`<br>`）がある場合は対象外にする
 * （`hasExplicitLineBreak`）。執筆者が意図して分けた行を「1行に収めるための縮小」で潰してしまうと、
 * 自動折り返りより短い1行のタイトルの方が不自然に小さく表示される（実際の不具合報告で発覚）。
 * 明示的な改行がある場合は、従来通りセーフエリアに収まるかどうかだけを見る。
 */
export function useAutoFitHeadingFontSize(targetRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useLayoutEffect(() => {
    const target = targetRef.current
    if (!target) return

    if (!enabled) {
      target.style.fontSize = ''
      return
    }

    const container = target.closest<HTMLElement>('.master-body')
    if (!container) return
    const section = target.closest<HTMLElement>('section')

    const isMeasurable = () => !section || !NOT_MEASURABLE_CLASSES.some((c) => section.classList.contains(c))

    let cancelled = false
    const fit = () => {
      if (cancelled || !isMeasurable()) return
      if (section) finishSettlingAnimations(section)

      target.style.fontSize = ''
      let size = parseFloat(getComputedStyle(target).fontSize)
      if (!Number.isFinite(size)) return

      const needsShrink = () => overshootPx(target.getBoundingClientRect(), getSafeBounds(container)) > OVERFLOW_TOLERANCE_PX || (!hasExplicitLineBreak(target) && estimateLineCount(target) > 1)
      while (needsShrink() && size > MIN_FONT_SIZE_PX) {
        size = Math.max(MIN_FONT_SIZE_PX, size - FONT_SIZE_STEP_PX)
        target.style.fontSize = `${size}px`
      }
    }

    fit()
    document.fonts.ready.then(fit)
    const resizeObserver = new ResizeObserver(fit)
    resizeObserver.observe(container)
    let classObserver: MutationObserver | undefined
    if (section) {
      classObserver = new MutationObserver(fit)
      classObserver.observe(section, { attributes: true, attributeFilter: ['class'] })
    }

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      classObserver?.disconnect()
    }
  })
}
