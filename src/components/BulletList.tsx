import type { ReactNode } from 'react'
import List from '@mui/material/List'
import { BulletListItem } from './BulletListItem'

/** 箇条書き1項目分の入力。ネストや fragment 制御が必要な場合はchildren/fragmentを指定する（#193） */
export type BulletListItemInput = {
  content: ReactNode
  fragment?: boolean
  fragmentIndex?: number
  children?: ReactNode
}

type Props = {
  items: BulletListItemInput[]
}

export function BulletList({ items }: Props) {
  return (
    <List disablePadding>
      {items.map((item, i) => (
        <BulletListItem key={i} primary={item.content} fragment={item.fragment} fragmentIndex={item.fragmentIndex}>
          {item.children}
        </BulletListItem>
      ))}
    </List>
  )
}
