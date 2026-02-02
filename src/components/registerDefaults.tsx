import DescriptionIcon from '@mui/icons-material/Description'
import MemoryIcon from '@mui/icons-material/Memory'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import SearchIcon from '@mui/icons-material/Search'
import TrafficIcon from '@mui/icons-material/Traffic'
import logText from '../data/default-log.txt?raw'
import { TerminalAnimation } from './TerminalAnimation'
import { FallbackImage } from './FallbackImage'
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

  // MUIアイコン
  registerDefaultComponent('Icon:Description', () => <DescriptionIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:PlaylistAddCheck', () => <PlaylistAddCheckIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Traffic', () => <TrafficIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:FactCheck', () => <FactCheckIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Memory', () => <MemoryIcon sx={{ fontSize: 32 }} />)
  registerDefaultComponent('Icon:Search', () => <SearchIcon sx={{ fontSize: 32 }} />)
}
