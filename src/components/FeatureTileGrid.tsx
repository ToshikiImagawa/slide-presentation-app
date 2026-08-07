import type { ReactNode } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { resolveColorToken } from '../applyTheme'

type Tile = {
  icon: ReactNode
  title: string
  description: ReactNode
  /** カラーパレットキー名（例: 'series2'）。省略時は'primary' */
  accentColor?: string
}

type Props = {
  tiles: Tile[]
  /** 列数。省略時はタイル数と同数の列（現行と同一の1行表示） */
  columns?: number
}

export function FeatureTileGrid({ tiles, columns }: Props) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${columns ?? tiles.length}, 1fr)`, gap: '30px', width: '100%' }}>
      {tiles.map((tile) => {
        const cssVar = resolveColorToken(tile.accentColor)
        return (
          <Card key={tile.title} sx={{ p: '30px' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Avatar
                sx={{
                  width: 62,
                  height: 62,
                  mb: '20px',
                  bgcolor: `rgba(var(${cssVar}-rgb), 0.06)`,
                  border: `1px solid rgba(var(${cssVar}-rgb), 0.12)`,
                  borderRadius: '14px',
                  color: `var(${cssVar})`,
                }}
                variant="rounded"
              >
                {tile.icon}
              </Avatar>
              <Typography variant="h3" sx={{ mb: '12px' }}>
                {tile.title}
              </Typography>
              <Typography variant="body2">{tile.description}</Typography>
            </CardContent>
          </Card>
        )
      })}
    </Box>
  )
}
