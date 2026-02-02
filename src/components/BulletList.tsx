import type { ReactNode } from 'react'
import List from '@mui/material/List'
import { BulletListItem } from './BulletListItem'

type Props = {
  items: ReactNode[]
}

export function BulletList({ items }: Props) {
  return (
    <List disablePadding>
      {items.map((item, i) => (
        <BulletListItem key={i} primary={item} />
      ))}
    </List>
  )
}
