import type { ReactNode } from 'react'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'

type Props = {
  header: ReactNode
  items: ReactNode[]
}

export function CodeBlockPanel({ header, items }: Props) {
  return (
    <Paper
      sx={{
        background: 'var(--theme-background-alt)',
        p: '20px',
        borderRadius: '8px',
        border: '1px solid var(--theme-border)',
        mt: '20px',
      }}
    >
      <code style={{ display: 'block', color: 'var(--theme-primary)', marginBottom: '10px' }}>{header}</code>
      <List dense disablePadding sx={{ color: 'var(--theme-text-heading)' }}>
        {items.map((item, i) => (
          <ListItem key={i} disablePadding disableGutters>
            <ListItemText primary={item} />
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}
