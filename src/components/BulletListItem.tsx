import type { ReactNode } from 'react'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

type Props = {
  primary: ReactNode
}

export function BulletListItem({ primary }: Props) {
  return (
    <ListItem disablePadding sx={{ mb: '20px', pl: '30px', position: 'relative' }}>
      <ListItemIcon
        sx={{
          minWidth: 0,
          position: 'absolute',
          left: 0,
          color: 'var(--theme-primary)',
        }}
      >
        <ChevronRightIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText
        primary={primary}
        slotProps={{
          primary: {
            sx: {
              fontSize: '20px',
              lineHeight: 1.6,
              color: 'var(--theme-text-body)',
            },
          },
        }}
      />
    </ListItem>
  )
}
