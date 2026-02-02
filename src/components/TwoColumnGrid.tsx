import type { ReactNode } from 'react'
import Box from '@mui/material/Box'

type Props = {
  left: ReactNode
  right: ReactNode
}

export function TwoColumnGrid({ left, right }: Props) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '60px',
        height: '100%',
        alignItems: 'start',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' }}>{left}</Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' }}>{right}</Box>
    </Box>
  )
}
