import type { ReactNode } from 'react'
import Avatar from '@mui/material/Avatar'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

type Tile = {
  icon: ReactNode
  title: string
  description: ReactNode
}

type Props = {
  tiles: Tile[]
}

export function FeatureTileGrid({ tiles }: Props) {
  return (
    <Stack direction="row" spacing="30px" sx={{ width: '100%' }}>
      {tiles.map((tile) => (
        <Card key={tile.title} sx={{ flex: 1, p: '30px' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Avatar
              sx={{
                width: 62,
                height: 62,
                mb: '20px',
                bgcolor: 'rgba(var(--theme-primary-rgb), 0.06)',
                border: '1px solid rgba(var(--theme-primary-rgb), 0.12)',
                borderRadius: '14px',
                color: 'var(--theme-primary)',
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
      ))}
    </Stack>
  )
}
