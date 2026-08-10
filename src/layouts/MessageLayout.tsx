import Box from '@mui/material/Box'
import { SlideFrame } from './SlideFrame'
import type { SlideFrameCommonProps } from './SlideFrame'

type Props = SlideFrameCommonProps & { children: React.ReactNode }

/**
 * タイトルバーを持たない「1枚1メッセージ」系のレイアウト（引用・大メッセージ・締め・#197）。
 *
 * 中身（引用文・主張・結び）を本文領域の中央に主役として置く。タイトルバー（.slide-title）を
 * 持たない点だけが ContentLayout との違いで、余白は SlideFrame の .master-body が持つため
 * 本編・発表者ビュー・編集プレビュー・PDF書き出しの4経路で同じ見た目になる。
 * 全面塗りバリアントの背景と文字色はマスター（theme.masters[].background と theme.tokens）が持ち、
 * このレイアウトは背景を塗らない（塗ると getThemeWarnings のコントラスト検証から外れる・#209）。
 */
export function MessageLayout({ children, ...frameProps }: Props) {
  return (
    <SlideFrame {...frameProps}>
      <Box className="message-layout">{children}</Box>
    </SlideFrame>
  )
}
