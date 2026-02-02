import type { ReactNode } from 'react'
import { BulletList } from './BulletList'
import { SlideHeading } from './SlideHeading'

type Props = {
  title: string
  description?: ReactNode
  items: ReactNode[]
}

export function TitledBulletList({ title, description, items }: Props) {
  return (
    <>
      <SlideHeading title={title} variant="h3" description={description} />
      <BulletList items={items} />
    </>
  )
}
