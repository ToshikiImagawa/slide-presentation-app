import Box from '@mui/material/Box'
import type { SlideMeta } from '../data'

type Props = { id: string; meta?: SlideMeta; children: React.ReactNode }

export function TitleLayout({ id, meta, children }: Props) {
  return (
    <section className="slide-container" id={id} data-transition={meta?.transition} data-background-image={meta?.backgroundImage} data-background-color={meta?.backgroundColor}>
      <Box className="title-layout">{children}</Box>
    </section>
  )
}
