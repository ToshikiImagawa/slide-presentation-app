import type { ReactNode } from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'

type Props = {
  children: ReactNode
  sx?: SxProps<Theme>
}

export function AccentText({ children, sx }: Props) {
  return (
    <Typography variant="body1" sx={{ color: 'var(--theme-primary)', ...sx }}>
      {children}
    </Typography>
  )
}
