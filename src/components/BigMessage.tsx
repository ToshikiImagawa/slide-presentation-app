import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useAutoFitHeadingFontSize } from '../hooks/useAutoFitHeadingFontSize'
import styles from './BigMessage.module.css'

type Props = {
  /** 主張・結びの文（改行の解釈は呼び出し側の renderWithLineBreaks が済ませた ReactNode） */
  children: ReactNode
  /** 主張に添える補足（1行程度）。省略時は主張だけを見せる */
  note?: ReactNode
  /** 文字サイズ(px)を明示指定する。省略時はコンテンツの長さに応じて自動的に縮小する
   * （useAutoFitHeadingFontSize） */
  fontSize?: number
}

/**
 * 大メッセージ・締めスライドの本体（#197）。章の切り替えや結びで「1枚1メッセージ」を成立させる。
 * 淡色地（デッキ既定の背景）と全面塗りの2バリアントで共有し、全面塗りの背景・文字色はマスターが持つ
 * （MessageLayout のコメント参照）。
 */
export function BigMessage({ children, note, fontSize }: Props) {
  const textRef = useRef<HTMLParagraphElement>(null)
  useAutoFitHeadingFontSize(textRef, fontSize === undefined)

  return (
    <div className={styles.message} data-testid="big-message">
      <p ref={textRef} className={styles.text} style={fontSize !== undefined ? ({ '--message-font-size': `${fontSize}px` } as CSSProperties) : undefined}>
        {children}
      </p>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  )
}
