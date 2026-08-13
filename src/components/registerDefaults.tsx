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
import { Table } from './table'
import { Compare } from './compare'
import { Flow } from './flow'
import { Checklist } from './Checklist'
import { ClassDiagram, HierarchyDiagram, OrgChart, ServerDiagram } from './structureDiagram'
import { Flowchart, Gantt, Swimlane } from './processDiagram'
import { Funnel, Heatmap, Swot, TwoByTwoMatrix } from './analysisDiagram'
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
  // #274: Chart/Diagram で塞いだ穴を残り11種にも広げる。fillsContentArea は SlideRenderer.tsx の
  // CONTENT_BRANCHES（短縮記法側）の fill 判定が引く単一真実源で、二重管理しない。値は各短縮記法の
  // 既存の fill と一致させる（変えない）
  registerDefaultComponent('Table', Table, { fillsContentArea: true })
  registerDefaultComponent('Compare', Compare, { fillsContentArea: true })
  registerDefaultComponent('Flow', Flow, { fillsContentArea: true })
  registerDefaultComponent('Checklist', Checklist)
  registerDefaultComponent('HierarchyDiagram', HierarchyDiagram, { fillsContentArea: true })
  registerDefaultComponent('ServerDiagram', ServerDiagram, { fillsContentArea: true })
  registerDefaultComponent('OrgChart', OrgChart, { fillsContentArea: true })
  registerDefaultComponent('ClassDiagram', ClassDiagram, { fillsContentArea: true })
  registerDefaultComponent('Flowchart', Flowchart, { fillsContentArea: true })
  registerDefaultComponent('Swimlane', Swimlane, { fillsContentArea: true })
  registerDefaultComponent('Gantt', Gantt, { fillsContentArea: true })
  // 分析図（#207）。同じく DiagramCanvas に載せるので fill 変種を要求する
  registerDefaultComponent('TwoByTwoMatrix', TwoByTwoMatrix, { fillsContentArea: true })
  registerDefaultComponent('Funnel', Funnel, { fillsContentArea: true })
  registerDefaultComponent('Swot', Swot, { fillsContentArea: true })
  registerDefaultComponent('Heatmap', Heatmap, { fillsContentArea: true })

  // MUIアイコン
  registerDefaultComponent('Icon:Description', () => <DescriptionIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:PlaylistAddCheck', () => <PlaylistAddCheckIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Traffic', () => <TrafficIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:FactCheck', () => <FactCheckIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Memory', () => <MemoryIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Search', () => <SearchIcon sx={{ fontSize: 32 }} />)
}
