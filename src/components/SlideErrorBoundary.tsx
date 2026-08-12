import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useTranslation } from '../i18n'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

/**
 * 1スライド分の描画中の例外をここで止め、他のスライドとアプリ全体の描画を継続させる（#280）。
 * `content.component` 等で参照した任意のコンポーネントが不正な入力で例外を投げても、
 * デッキ全体が白画面にならないための「最後の網」であり、個別コンポーネントの入力検証
 * （#276 のような添字/プロパティアクセスの防御）を代替するものではない。
 *
 * 正常時は render() が `this.props.children` をそのまま返すため DOM ノードは増えない。
 * フォールバック（`<section>` 等）が現れるのは例外発生時のみ。
 */
export class SlideErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[slide-error-boundary] スライドの描画中に例外が発生しました（このスライドのみ最小フォールバックに切り替えます）', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <SlideErrorFallback />
    }
    return this.props.children
  }
}

/**
 * フォールバック表示。getFallbackPresentationData（src/data/loader.ts）と同じ「最小限のメッセージのみ」の
 * 思想に揃える。SlideFrame/TitleLayout（通常の描画経路）には**あえて乗せない**: master解決・テーマの
 * トークン参照はここで捕捉したい例外の発生源そのものになり得るため、フォールバックが通常経路に依存すると
 * フォールバック自身も同じ原因で例外を投げて上位（境界なし）まで抜けてしまう。「最後の網」は網自体が
 * 破れないよう、捕捉対象と依存を分離しておく
 */
function SlideErrorFallback() {
  const { t } = useTranslation()
  return (
    <section className="slide-container">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          padding: '40px',
          textAlign: 'center',
          color: 'var(--theme-text-body)',
          fontFamily: 'var(--theme-font-body)',
        }}
      >
        <p style={{ fontSize: '24px' }}>{t('slideError.message', 'このスライドを表示できませんでした')}</p>
      </div>
    </section>
  )
}
