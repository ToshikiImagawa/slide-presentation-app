import { useMemo, type ReactNode } from 'react'
import Typography from '@mui/material/Typography'
import { resolveColorToken } from '../applyTheme'
import { sanitizeSvgMarkup } from './inlineSvg/sanitizeSvg'
import styles from './InlineSvg.module.css'

export type SvgSpec = {
  /** SVGマークアップ文字列（<svg>...</svg>）。viewBoxを指定すると縦横比を保ってセーフエリア内に自動フィットする。
   * registerDefaultComponent 経由（component:{name:"InlineSvg"}）では props が Record<string, unknown> として
   * 渡ってくるため、他の短縮記法対応コンポーネント（TableSpec等）と同様に全フィールドを省略可にする */
  markup?: string
  /** fill="currentColor"等が参照する文字色トークン名。省略時はprimary（resolveColorTokenの既定と同じ） */
  color?: string
  caption?: ReactNode
}

/**
 * SVGをインライン展開して描画する（#203）。<img> ではなく dangerouslySetInnerHTML で挿入するため、
 * SVG が fill="currentColor" や fill="var(--theme-primary)" 等でテーマのCSS変数を参照していれば、
 * テーマ切り替え時に自動で追従する（色の書き換えロジックは持たない。作者がテーマ変数を使う設計）。
 * currentColor を使う場合の基準色は、ラッパーの CSS `color` に resolveColorToken で解決したCSS変数を
 * 設定することで供給する（SVG自身は継承した color を currentColor として使う）。
 *
 * サニタイズ（script・イベントハンドラ属性・外部参照・foreignObject・image要素の除去）は sanitizeSvg.ts
 * が担う。解析不能・危険要素の除去は getSvgWarnings（applyTheme.ts）が利用者向け警告として報告するため、
 * ここでは console.warn を使わず、サニタイズに失敗した（=マークアップとして解析できなかった）場合のみ
 * 描画をスキップする（除去はできたが内容は描画する）。
 */
export function InlineSvg({ markup, color, caption }: SvgSpec) {
  // Reveal.jsは全スライドを同時にマウントしたまま保つため、他スライドの状態変化（トースト・テーマ再適用等）
  // による再レンダリングでも、markup が変わらない限り解析・サニタイズ（DOMParser + 木構造の走査）を
  // 再実行しない（#203。同一markupに対するgetSvgWarningsとの2重解析はデッキ読み込み時に1回だけなので許容する）
  const sanitized = useMemo(() => sanitizeSvgMarkup(markup), [markup])
  if (!sanitized) return null

  return (
    <div className={`content-area-fill-item ${styles.wrapper}`} data-testid="inline-svg">
      <div className={styles.svgArea} style={{ color: `var(${resolveColorToken(color)})` }} dangerouslySetInnerHTML={{ __html: sanitized.html }} />
      {caption && (
        <Typography variant="body2" sx={{ textAlign: 'center', color: 'var(--theme-text-muted)' }}>
          {caption}
        </Typography>
      )}
    </div>
  )
}
