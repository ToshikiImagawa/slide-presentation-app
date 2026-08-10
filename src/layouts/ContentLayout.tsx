import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { SlideFrame } from './SlideFrame'
import type { SlideFrameCommonProps } from './SlideFrame'

type Props = SlideFrameCommonProps & {
  title: string
  /** 本文領域を .content-area の fill 変種にする（#225）。残り高さいっぱいに広がる子（画像・表・チャート・
   * 図解など）を置くときに指定し、埋める側の要素は .content-area-fill-item を付けて高さを受け取る */
  fill?: boolean
  children: React.ReactNode
}

export function ContentLayout({ title, fill, children, ...frameProps }: Props) {
  return (
    <SlideFrame {...frameProps}>
      <Typography variant="h2" className="slide-title">
        {title}
      </Typography>
      <Box className={fill ? 'content-area content-area-fill' : 'content-area'}>{children}</Box>
    </SlideFrame>
  )
}
