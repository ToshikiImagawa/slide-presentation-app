import type { ReactNode } from 'react'
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'

type Props = {
  number: number
  title: string
  children: ReactNode
}

export function TimelineNode({ number, title, children }: Props) {
  return (
    <>
      <Avatar
        sx={{
          width: 50,
          height: 50,
          bgcolor: 'var(--theme-background)',
          border: '3px solid var(--theme-primary)',
          color: 'var(--theme-primary)',
          fontWeight: 700,
          fontSize: '20px',
          mx: 'auto',
          mb: '20px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        }}
      >
        {number}
      </Avatar>
      <Typography variant="h3" sx={{ fontSize: '22px', mb: '10px', color: 'var(--theme-primary)' }}>
        {title}
      </Typography>
      {children}
    </>
  )
}
