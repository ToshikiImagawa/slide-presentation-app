import { useRef, type ReactNode } from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useAutoFitHeadingFontSize } from '../hooks/useAutoFitHeadingFontSize'

type Props = {
  title: ReactNode
  variant?: 'h1' | 'h2' | 'h3'
  description?: ReactNode | ReactNode[]
  sx?: SxProps<Theme>
  /** タイトルの文字サイズ(px)を明示指定する（variant="h1" の表紙スライドのみ有効）。省略時はコンテンツの
   * 長さに応じて自動的に縮小する（useAutoFitHeadingFontSize） */
  fontSize?: number
}

export function SlideHeading({ title, variant = 'h2', description, sx, fontSize }: Props) {
  const items = Array.isArray(description) ? description : description != null ? [description] : []
  const titleRef = useRef<HTMLElement>(null)
  useAutoFitHeadingFontSize(titleRef, variant === 'h1' && fontSize === undefined)

  return (
    <>
      <Typography ref={titleRef} variant={variant} sx={{ mb: variant === 'h1' ? '20px' : variant === 'h2' ? '20px' : '12px', ...sx, ...(fontSize !== undefined ? { fontSize: `${fontSize}px` } : {}) }}>
        {title}
      </Typography>
      {items.map((item, i) => (
        <Typography key={i} variant="body1" sx={i < items.length - 1 ? { mb: '16px' } : undefined}>
          {item}
        </Typography>
      ))}
    </>
  )
}
