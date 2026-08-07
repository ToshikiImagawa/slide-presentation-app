import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

type Props = {
  src: string
  /** 固定寸法（px）。fit 指定時は不要 */
  width?: number
  height?: number
  alt?: string
  className?: string
  /** 固定寸法の代わりに、縦横比を保って親要素に収める（画像スライドの自動フィット・#198）。
   * 読み込み失敗時の破線プレースホルダは親要素いっぱいに広がる（寸法表記は出さない） */
  fit?: boolean
}

export function FallbackImage({ src, width, height, alt = '', className, fit }: Props) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  if (status === 'error') {
    return (
      <Box
        className={className}
        sx={{
          width: fit ? '100%' : width,
          height: fit ? '100%' : height,
          border: '1px dashed var(--theme-border-light)',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!fit && (
          <Typography
            sx={{
              fontSize: '11px',
              fontFamily: "'Roboto Mono', monospace",
              color: 'var(--theme-text-muted)',
            }}
          >
            {width}px &times; {height}px
          </Typography>
        )}
      </Box>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        ...(fit ? { maxWidth: '100%', maxHeight: '100%' } : { width, height }),
        objectFit: 'contain',
        display: status === 'loading' ? 'none' : undefined,
      }}
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('error')}
    />
  )
}
