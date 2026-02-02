import type { SxProps, Theme } from '@mui/material/styles'
import Box from '@mui/material/Box'
import { FallbackImage } from './FallbackImage'

type Props = {
  url: string
  size?: number
  sx?: SxProps<Theme>
}

export function QrCodeCard({ url, size = 200, sx }: Props) {
  return (
    <Box
      sx={{
        width: 'fit-content',
        background: 'var(--theme-background)',
        p: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        border: '1px solid var(--theme-border)',
        ...sx,
      }}
    >
      <FallbackImage src={`https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&data=${encodeURIComponent(url)}`} alt="QR Code" width={size} height={size} />
    </Box>
  )
}
