import type { ReactNode } from 'react'
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'

type Props = {
  /** バッジに表示する内容。連番タイムライン（steps）では番号、日付タイムライン（dateTimeline・#206）では
   * 日付文字列を渡す（見た目は共通で、バッジの中身だけが違う） */
  badge: ReactNode
  title: string
  children: ReactNode
}

export function TimelineNode({ badge, title, children }: Props) {
  return (
    <>
      <Avatar
        sx={{
          // 幅は内容に応じて伸ばす（下限50px）。連番（1〜2桁）は50px未満に収まるため下限で止まり、
          // 従来と同じ正円のまま変わらない。日付文字列（dateTimeline・#206）は50pxを超えて伸び、
          // border-radius: 50%（Avatarの既定）が非正方形の角に効いてピル形になり、文字が切れない
          minWidth: 50,
          width: 'fit-content',
          height: 50,
          px: '10px',
          bgcolor: 'var(--theme-background)',
          border: 'var(--theme-node-ring-width) solid var(--theme-primary)',
          color: 'var(--theme-primary)',
          fontWeight: 700,
          fontSize: '20px',
          whiteSpace: 'nowrap',
          mx: 'auto',
          mb: '20px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, calc(0.06 * var(--theme-shadow-strength)))',
        }}
      >
        {badge}
      </Avatar>
      <Typography variant="h3" sx={{ fontSize: '22px', mb: '10px', color: 'var(--theme-primary)' }}>
        {title}
      </Typography>
      {children}
    </>
  )
}
