import { isValidElement } from 'react'
import type { ReactNode } from 'react'
import List from '@mui/material/List'
import { BulletListItem } from './BulletListItem'

/** ネストや fragment 制御が必要な項目向けのリッチ入力（#193） */
export type BulletListRichItem = {
  content: ReactNode
  fragment?: boolean
  fragmentIndex?: number
  children?: ReactNode
}

type Props = {
  items: Array<ReactNode | BulletListRichItem>
}

function isRichItem(item: ReactNode | BulletListRichItem): item is BulletListRichItem {
  return typeof item === 'object' && item !== null && !isValidElement(item) && 'content' in item
}

export function BulletList({ items }: Props) {
  return (
    <List disablePadding>
      {items.map((item, i) =>
        isRichItem(item) ? (
          <BulletListItem key={i} primary={item.content} fragment={item.fragment} fragmentIndex={item.fragmentIndex}>
            {item.children}
          </BulletListItem>
        ) : (
          <BulletListItem key={i} primary={item} />
        ),
      )}
    </List>
  )
}
