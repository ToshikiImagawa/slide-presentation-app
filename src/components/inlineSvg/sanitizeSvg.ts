/**
 * インラインSVG（#203）のサニタイズ。renderHtml（SlideRenderer.tsx）は無サニタイズだが、SVGは
 * script・イベントハンドラ属性・外部参照（href/xlink:href・<image>）による攻撃面が本文用の短いHTML
 * 断片よりずっと広く、.spkg として第三者から受け取って開く運用があるため、この経路だけ明示的に
 * サニタイズする（既存のrenderHtmlとの差の理由）。
 *
 * サニタイズ後は fill="currentColor" / fill="var(--theme-primary)" 等をそのまま残す。テーマ追従は
 * 色の書き換えロジックを自前で持たず、作者がテーマのCSS変数を参照する設計に委ねる（InlineSvg.tsx）。
 */

/** 除去するタグ名（小文字比較）。script: 任意コード実行 / foreignObject: HTML埋め込みでscript同様の実行が可能 / image: 外部ラスタ画像の読み込み（オフライン動作を壊す） */
const DISALLOWED_TAGS: Record<string, string> = {
  script: 'script要素',
  foreignobject: 'foreignObject要素',
  image: 'image要素',
}

/** href/xlink:href が外部参照かどうかを判定する対象の属性名（小文字比較） */
const HREF_ATTR_NAMES = new Set(['href', 'xlink:href'])

function isEventHandlerAttr(name: string): boolean {
  return /^on/i.test(name)
}

/** '#' で始まる内部参照（<use href="#id"> 等）は除去対象外。それ以外（http/https/data/相対パス等）は外部参照として除去する */
function isExternalHrefValue(value: string): boolean {
  return !value.startsWith('#')
}

/** 要素とその子孫から危険な属性・要素を除去する。除去した種別名を removed に積む（呼び出し側は重複除去のため Set を渡す） */
function sanitizeElement(el: Element, removed: Set<string>): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    if (isEventHandlerAttr(name)) {
      el.removeAttribute(attr.name)
      removed.add('イベントハンドラ属性(on*)')
    } else if (HREF_ATTR_NAMES.has(name) && isExternalHrefValue(attr.value)) {
      el.removeAttribute(attr.name)
      removed.add('外部参照(href/xlink:href)')
    }
  }

  for (const child of Array.from(el.children)) {
    const disallowedLabel = DISALLOWED_TAGS[child.tagName.toLowerCase()]
    if (disallowedLabel) {
      child.remove()
      removed.add(disallowedLabel)
    } else {
      sanitizeElement(child, removed)
    }
  }
}

export type SanitizedSvg = {
  /** サニタイズ後の再直列化済みマークアップ */
  html: string
  /** 除去した種別名（重複なし）。空配列なら無害な入力だった */
  removed: string[]
}

/**
 * SVGマークアップを解析・サニタイズして再直列化する。解析不能・ルートが `<svg>` でない場合は
 * null を返す（呼び出し元は描画をスキップする。警告は getSvgWarnings（applyTheme.ts）が担う）。
 */
export function sanitizeSvgMarkup(markup: unknown): SanitizedSvg | null {
  if (typeof markup !== 'string' || markup.trim() === '') return null

  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    return null
  }

  const removed = new Set<string>()
  sanitizeElement(root, removed)

  return { html: new XMLSerializer().serializeToString(root), removed: [...removed] }
}
