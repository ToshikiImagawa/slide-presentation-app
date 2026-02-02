import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { SlideMeta } from '../data'

type Props = { id: string; title: string; meta?: SlideMeta; children: React.ReactNode }

export function ContentLayout({ id, title, meta, children }: Props) {
  return (
    <section className="slide-container" id={id} data-transition={meta?.transition} data-background-image={meta?.backgroundImage} data-background-color={meta?.backgroundColor}>
      <Typography variant="h2" className="slide-title">
        {title}
      </Typography>
      <Box className="content-area">{children}</Box>
    </section>
  )
}
