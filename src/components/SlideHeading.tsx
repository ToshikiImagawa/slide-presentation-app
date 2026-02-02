import type { ReactNode } from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'

type Props = {
  title: string
  variant?: 'h1' | 'h2' | 'h3'
  description?: ReactNode | ReactNode[]
  sx?: SxProps<Theme>
}

export function SlideHeading({ title, variant = 'h2', description, sx }: Props) {
  const items = Array.isArray(description) ? description : description != null ? [description] : []

  return (
    <>
      <Typography variant={variant} sx={{ mb: variant === 'h1' ? '20px' : variant === 'h2' ? '20px' : '12px', ...sx }}>
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
