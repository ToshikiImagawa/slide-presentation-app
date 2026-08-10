import type { ReactNode } from 'react'
import Box from '@mui/material/Box'

type Props = {
  left: ReactNode
  right: ReactNode
  /** 左カラムを fill ホストにするか（#259）。カラムに置いた「本文領域を埋めるコンポーネント」
   * （.content-area-fill-item を持つ図解・表・チャート等）が残り高さを受け取れるようにする */
  leftFill?: boolean
  /** 右カラムを fill ホストにするか（#259） */
  rightFill?: boolean
}

/**
 * カラム1つ分。グリッドの行高（= 本文領域の高さ）を height:100% で受けた確定高さの箱で、
 * fill 指定時は global.css の fill ホストを名乗って残り高さを子へ渡す（#259）。
 * ホストの印をこのカラム自身に付けるのが契約で、祖先（グリッドのルート）に付けてはならない
 * （:has() 規則が display:grid を flex 列へ上書きして2カラムが崩れる。global.css に理由を記載）。
 * justify-content は fill 指定でも center のままでよい（埋める子の flex:1 が余白を使い切るため
 * 主軸配置は結果に影響しない）。
 */
function Column({ fill, children }: { fill?: boolean; children: ReactNode }) {
  return (
    <Box className={fill ? 'content-area-fill' : undefined} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' }}>
      {children}
    </Box>
  )
}

export function TwoColumnGrid({ left, right, leftFill, rightFill }: Props) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '60px',
        height: '100%',
        alignItems: 'start',
      }}
    >
      <Column fill={leftFill}>{left}</Column>
      <Column fill={rightFill}>{right}</Column>
    </Box>
  )
}
