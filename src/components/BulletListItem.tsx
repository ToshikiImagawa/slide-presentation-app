import type { ReactNode } from 'react'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

type Props = {
  primary: ReactNode
  /** Reveal.jsのフラグメント表示（class="fragment"）を有効にする */
  fragment?: boolean
  fragmentIndex?: number
  /** ネストした箇条書き等、この項目の下に描画する子要素 */
  children?: ReactNode
}

export function BulletListItem({ primary, fragment, fragmentIndex, children }: Props) {
  return (
    <ListItem disablePadding className={fragment ? 'fragment' : undefined} data-fragment-index={fragmentIndex} sx={{ mb: '20px', pl: '30px', position: 'relative', flexDirection: 'column', alignItems: 'stretch' }}>
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
      {children}
    </ListItem>
  )
}
