import { SERIES_KEYS } from '../chart/chartScale'

/** ノードの色分けは系列色トークンから引く（#205）。明示指定が無いノードには並び順で series1〜series6 を巡回して割り当てる */
export function defaultSeriesColor(index: number): string {
  return SERIES_KEYS[index % SERIES_KEYS.length]
}
