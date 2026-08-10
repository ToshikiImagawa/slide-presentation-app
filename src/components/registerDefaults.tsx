import DescriptionIcon from '@mui/icons-material/Description'
import MemoryIcon from '@mui/icons-material/Memory'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import SearchIcon from '@mui/icons-material/Search'
import TrafficIcon from '@mui/icons-material/Traffic'
import logText from '../data/default-log.txt?raw'
import { TerminalAnimation } from './TerminalAnimation'
import { FallbackImage } from './FallbackImage'
import { Diagram } from './diagram'
import { Chart } from './chart'
import { registerDefaultComponent } from './ComponentRegistry'

/** TerminalAnimationのラッパー（デフォルトlogTextを注入） */
function DefaultTerminalAnimation(props: { logTextUrl?: string }) {
  return <TerminalAnimation logText={logText} {...props} />
}

/** FallbackImageのラッパー（ComponentRegistryから利用可能にする） */
function DefaultImage(props: Record<string, unknown>) {
  return <FallbackImage src={props.src as string} width={props.width as number} height={props.height as number} alt={props.alt as string | undefined} />
}

/** デフォルトコンポーネントをレジストリに登録する */
export function registerDefaultComponents(): void {
  // ビジュアルコンポーネント
  registerDefaultComponent('TerminalAnimation', DefaultTerminalAnimation)
  registerDefaultComponent('Image', DefaultImage)
  // 図解プリミティブ（#202）。矢印・コネクタ・カード・バッジ・引出線を正規化座標で組み立てる。
  // キャンバス（DiagramCanvas）は本文領域の残り高さいっぱいに広がるので fill 変種を要求する（#256）
  registerDefaultComponent('Diagram', Diagram, { fillsContentArea: true })
  // チャート（#204）。ComponentRegistry に登録することで content.chart の短縮記法だけでなく
  // two-column の各カラム・bleed・custom 等、component 参照を受け付けるすべての経路から使える（#241）。
  // 本文領域の残り高さいっぱいに広がるので Diagram と同様に fill 変種を要求する
  registerDefaultComponent('Chart', Chart, { fillsContentArea: true })

  // MUIアイコン
  registerDefaultComponent('Icon:Description', () => <DescriptionIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:PlaylistAddCheck', () => <PlaylistAddCheckIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Traffic', () => <TrafficIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:FactCheck', () => <FactCheckIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Memory', () => <MemoryIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Search', () => <SearchIcon sx={{ fontSize: 32 }} />)
}
