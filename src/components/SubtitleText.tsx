import type { ReactNode } from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'

type Props = {
  children: ReactNode
  sx?: SxProps<Theme>
}

export function SubtitleText({ children, sx }: Props) {
  return (
    <Typography variant="subtitle1" sx={sx}>
      {children}
    </Typography>
  )
}
