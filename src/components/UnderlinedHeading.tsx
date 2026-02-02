import type { SxProps, Theme } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

type Props = {
  children: React.ReactNode
  sx?: SxProps<Theme>
}

export function UnderlinedHeading({ children, sx }: Props) {
  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', ...sx }}>
      <Typography variant="h2" sx={{ fontSize: '64px', color: 'var(--theme-text-heading)' }}>
        {children}
      </Typography>
      <Divider
        sx={{
          borderWidth: '1.5px',
          borderColor: 'var(--theme-primary)',
          mt: '30px',
        }}
      />
    </Box>
  )
}
