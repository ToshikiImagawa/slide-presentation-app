import { useEffect, useId, useState, type ReactNode } from 'react'
import Typography from '@mui/material/Typography'
import styles from './TextDiagram.module.css'

export type TextDiagramSpec = {
  /** Mermaid記法のダイアグラム定義（flowchart/sequenceDiagram等）。mermaid公式の記法をそのまま書く */
  source?: string
  caption?: ReactNode
}

type RenderState = { status: 'loading' } | { status: 'done'; svg: string } | { status: 'error' }

/**
 * テキスト図法（Mermaid）を描画する（#203）。mermaidは d3/dagre/katex/cytoscape等の重い依存を持ち込むため
 * （バンドルサイズはPR本文に実測値を記載）、静的importでコアの初期バンドルへ含めず、pdfExport.ts の
 * html2canvas/jspdf と同じ手法（利用時に動的 import）で別チャンクとして遅延ロードする。dist/ に同梱される
 * ローカルファイルとして提供されるため、テキスト図法を含まないデッキの起動時間・オフライン動作には影響しない。
 *
 * mermaid.render は非同期（Promise<{svg}>）。構文が不正な場合はrejectするので、描画スキップ（プレースホルダ表示）
 * のみ行い console.warn は使わない（#203の受け入れ基準）。getThemeWarnings（getTextDiagramWarnings・applyTheme.ts）
 * は source が空・未指定という静的に判定可能な誤りだけを検出する。Mermaid構文そのものの妥当性判定には
 * mermaid 本体（動的import対象そのもの）が必要で、検証のためだけに常時読み込むと遅延ロードの意図が崩れるため、
 * 構文ミス自体は getThemeWarnings の対象外とし、表示中のプレースホルダで気づける形にする。
 */
export function TextDiagram({ source, caption }: TextDiagramSpec) {
  const renderId = useId().replace(/:/g, '-')
  const [state, setState] = useState<RenderState>({ status: 'loading' })

  useEffect(() => {
    if (!source) {
      setState({ status: 'error' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    import('mermaid')
      .then(({ default: mermaid }) => {
        // securityLevel: 'strict' はHTMLタグ・クリックイベントハンドラ等をmermaid自身が除去する設定で、
        // これにより本コンポーネントは script 実行の余地を作らない（InlineSvg.tsxのような自前サニタイズを
        // 持たず、mermaid本体の安全機構に委ねる設計判断・#203）。ネットワークアクセスは行わないためオフラインで完結する。
        // 複数回の初期化は害がないため（mermaid公式の挙動）、レンダリングごとに呼んでもガードは不要
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
        return mermaid.render(`text-diagram-${renderId}`, source)
      })
      .then((result) => {
        if (!cancelled) setState({ status: 'done', svg: result.svg })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [source, renderId])

  return (
    <div className={`content-area-fill-item ${styles.wrapper}`} data-testid="text-diagram">
      {state.status === 'done' ? <div className={styles.diagramArea} dangerouslySetInnerHTML={{ __html: state.svg }} /> : <div className={styles.placeholder} data-state={state.status === 'error' ? 'error' : 'loading'} />}
      {caption && (
        <Typography variant="body2" sx={{ textAlign: 'center', color: 'var(--theme-text-muted)' }}>
          {caption}
        </Typography>
      )}
    </div>
  )
}
