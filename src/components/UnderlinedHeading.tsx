import { useRef } from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import { useAutoFitHeadingFontSize } from '../hooks/useAutoFitHeadingFontSize'
import styles from './UnderlinedHeading.module.css'

type Props = {
  children: React.ReactNode
  sx?: SxProps<Theme>
  /** タイトルの文字サイズ(px)を明示指定する。省略時はコンテンツの長さに応じて自動的に縮小する
   * （useAutoFitHeadingFontSize） */
  fontSize?: number
}

export function UnderlinedHeading({ children, sx, fontSize }: Props) {
  const titleRef = useRef<HTMLElement>(null)
  useAutoFitHeadingFontSize(titleRef, fontSize === undefined)

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', ...sx }}>
      <Typography ref={titleRef} variant="h2" sx={{ fontSize: fontSize !== undefined ? `${fontSize}px` : '64px', color: 'var(--theme-text-heading)' }}>
        {children}
      </Typography>
      <Divider
        className={styles.underline}
        sx={{
          borderWidth: 'var(--theme-heading-underline-width)',
          borderColor: 'var(--theme-primary)',
          mt: '30px',
        }}
      />
    </Box>
  )
}
