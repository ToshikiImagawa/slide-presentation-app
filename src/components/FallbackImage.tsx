import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

type Props = {
  src: string
  width: number
  height: number
  alt?: string
  className?: string
}

export function FallbackImage({ src, width, height, alt = '', className }: Props) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  if (status === 'error') {
    return (
      <Box
        className={className}
        sx={{
          width,
          height,
          border: '1px dashed var(--theme-border-light)',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          sx={{
            fontSize: '11px',
            fontFamily: "'Roboto Mono', monospace",
            color: 'var(--theme-text-muted)',
          }}
        >
          {width}px &times; {height}px
        </Typography>
      </Box>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        width,
        height,
        objectFit: 'contain',
        display: status === 'loading' ? 'none' : undefined,
      }}
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('error')}
    />
  )
}
