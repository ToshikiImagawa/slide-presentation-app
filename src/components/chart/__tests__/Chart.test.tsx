import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Chart } from '../Chart'
import type { ChartSpec } from '../types'

const QUARTERS: ChartSpec = {
  type: 'bar',
  unit: '%',
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { name: '今期', values: [42, 51, 58, 67] },
    { name: '前期', values: [38, 40, 47, 52], color: 'series3' },
  ],
}

/** 棒（縦棒・横棒）だけを集める。data-negative は棒にのみ付くのでラッパー要素を拾わない */
function bars(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-negative]'))
}

describe('Chart', () => {
  it('5種類すべてを描画できる', () => {
    for (const type of ['bar', 'line', 'pie', 'hbar', 'kpi'] as const) {
      const { getByTestId, unmount } = render(<Chart {...QUARTERS} type={type} value={128400} trend={[1, 2, 3]} />)
      expect(getByTestId('chart').dataset.chartType).toBe(type)
      unmount()
    }
  })

  it('未知の種別は描画せず警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Chart {...QUARTERS} type={'radar' as never} />)

    expect(container.firstChild).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('categories と series が空なら描画せず警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Chart type="bar" />)

    expect(container.firstChild).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('series が配列でなくても落ちない（不正なデッキでデッキ全体を落とさない）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Chart type="bar" series={'broken' as never} categories={'broken' as never} />)

    expect(container.firstChild).toBeNull()
    warn.mockRestore()
  })

  it('kpi で value も trend も無ければ描画せず警告する（#241）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Chart type="kpi" label="MAU" />)

    expect(container.firstChild).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('Chart（縦棒）', () => {
  it('系列色はCSS変数で解決する（テーマに追従する）', () => {
    const { container } = render(<Chart {...QUARTERS} />)
    const colors = new Set(bars(container).map((bar) => bar.style.background))

    expect(colors).toEqual(new Set(['var(--theme-series-1)', 'var(--theme-series-3)']))
  })

  it('棒の高さは軸スケール上の比率で決まる（0〜80 の軸に対し 42% は 52.5%）', () => {
    const { container } = render(<Chart {...QUARTERS} />)
    const [bar] = bars(container)

    expect(bar.style.bottom).toBe('0%')
    expect(bar.style.height).toBe('52.5%')
  })

  it('負の値は基準線から下向きに伸びる', () => {
    const { container } = render(<Chart type="bar" categories={['A', 'B']} series={[{ values: [-20, 40] }]} />)
    const [negative, positive] = bars(container)

    expect(negative.dataset.negative).toBe('true')
    expect(Number.parseFloat(negative.style.bottom)).toBeLessThan(Number.parseFloat(positive.style.bottom))
  })

  it('項目名と軸の目盛りを描画する', () => {
    const { getByText } = render(<Chart {...QUARTERS} />)

    expect(getByText('Q1')).toBeTruthy()
    expect(getByText('80%')).toBeTruthy()
  })

  it('axis: false で目盛りと格子線を描かない', () => {
    const { container, queryByText } = render(<Chart {...QUARTERS} axis={false} />)

    expect(queryByText('80%')).toBeNull()
    expect(container.querySelector('[class*="gridline"]')).toBeNull()
  })

  it('項目名は12個を超えると間引かれ、セル自体は全項目分残る（マークとの対応がずれない）', () => {
    const categories = Array.from({ length: 24 }, (_, index) => `M${index + 1}`)
    const { container } = render(<Chart type="bar" categories={categories} series={[{ values: categories.map((_, index) => index) }]} />)
    const labels = Array.from(container.querySelectorAll<HTMLElement>('[class*="xLabel"]'))

    expect(labels).toHaveLength(24)
    expect(labels.filter((label) => label.textContent !== '').length).toBeLessThanOrEqual(12)
    expect(labels[0].textContent).toBe('M1')
    expect(labels[23].textContent).toBe('M24')
  })

  it('描画点が多いと値ラベルを既定で省き、明示すれば描く', () => {
    const categories = Array.from({ length: 24 }, (_, index) => `M${index + 1}`)
    const values = categories.map((_, index) => index + 1)

    const auto = render(<Chart type="bar" categories={categories} series={[{ values }]} />)
    expect(auto.container.querySelectorAll('[class*="valueAbove"]')).toHaveLength(0)
    auto.unmount()

    const explicit = render(<Chart type="bar" categories={categories} series={[{ values }]} valueLabels />)
    expect(explicit.container.querySelectorAll('[class*="valueAbove"]')).toHaveLength(24)
  })
})

describe('Chart（折れ線）', () => {
  it('線をSVGのpolylineで描き、縦横比で歪まないようnon-scaling-strokeを使う', () => {
    const { container } = render(<Chart {...QUARTERS} type="line" />)
    const polyline = container.querySelector('polyline')

    // 4項目なので各点は項目セルの中心（12.5% / 37.5% / 62.5% / 87.5%）に来る
    expect(polyline?.getAttribute('points')).toBe('12.5,47.5 37.5,36.25 62.5,27.5 87.5,16.25')
    expect(polyline?.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    expect(polyline?.getAttribute('stroke')).toBe('var(--theme-series-1)')
  })

  it('線幅は --theme-border-width の倍率で指定する（意匠トークンに追従する）', () => {
    const { container } = render(<Chart {...QUARTERS} type="line" />)

    expect(container.querySelector('polyline')?.style.strokeWidth).toBe('calc(var(--theme-border-width) * 3)')
  })

  it('非数値は経路から除く', () => {
    const { container } = render(<Chart type="line" categories={['A', 'B', 'C']} series={[{ values: [10, Number.NaN, 30] }]} />)

    expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(2)
  })
})

describe('Chart（円）', () => {
  it('構成比を扇形として描き、色は系列色トークンに追従する', () => {
    const { container } = render(<Chart type="pie" categories={['A', 'B', 'C']} series={[{ values: [50, 30, 20] }]} />)
    const paths = Array.from(container.querySelectorAll('path'))

    expect(paths).toHaveLength(3)
    expect(paths.map((path) => path.getAttribute('fill'))).toEqual(['var(--theme-series-1)', 'var(--theme-series-2)', 'var(--theme-series-3)'])
  })

  it('単一項目はパスでは描けないため円として塗る', () => {
    const { container } = render(<Chart type="pie" categories={['A']} series={[{ values: [100] }]} />)

    expect(container.querySelector('circle')).toBeTruthy()
    expect(container.querySelector('path')).toBeNull()
  })

  it('構成比が小さい項目は扇形上のラベルを省く（隣と重ならない）', () => {
    const { container } = render(<Chart type="pie" categories={['A', 'B', 'C']} series={[{ values: [90, 8, 2] }]} valueLabels />)
    const labels = Array.from(container.querySelectorAll('[class*="pieLabel"]')).map((label) => label.textContent)

    expect(labels).toEqual(['90%', '8%'])
  })

  it('凡例は項目名と実数値を並べる', () => {
    const { getByTestId } = render(<Chart type="pie" unit="件" categories={['A', 'B']} series={[{ values: [1200, 800] }]} />)

    expect(getByTestId('chart-legend').textContent).toContain('A 1,200件')
  })
})

describe('Chart（横棒）', () => {
  it('項目名を左に並べ、棒は軸スケール上の比率で伸ばす', () => {
    const { container, getByText } = render(<Chart type="hbar" categories={['施策アルファ', '施策ベータ']} series={[{ values: [30, 60] }]} max={100} />)
    const [alpha, beta] = bars(container)

    expect(getByText('施策アルファ')).toBeTruthy()
    expect(alpha.style.width).toBe('30%')
    expect(beta.style.width).toBe('60%')
  })

  it('項目が多いと行を詰める（横棒は間引きができないため）', () => {
    const many = Array.from({ length: 14 }, (_, index) => `項目${index + 1}`)
    const { getByTestId } = render(<Chart type="hbar" categories={many} series={[{ values: many.map((_, index) => index + 1) }]} />)

    expect(getByTestId('chart-hbar').dataset.dense).toBe('true')
  })
})

describe('Chart（大数値＋推移）', () => {
  it('大数値・見出し・増減注記・推移線を描く', () => {
    const { getByText, container } = render(<Chart type="kpi" label="MAU" value={128400} delta="+18.2% 前年同月比" trend={[72000, 95000, 128400]} />)

    expect(getByText('128,400')).toBeTruthy()
    expect(getByText('MAU')).toBeTruthy()
    expect(getByText('+18.2% 前年同月比')).toBeTruthy()
    expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(3)
  })

  it('文字列の大数値はそのまま表示する', () => {
    const { getByText } = render(<Chart type="kpi" value="1.2M" trend={[1, 2]} />)

    expect(getByText('1.2M')).toBeTruthy()
  })

  it('推移が1点以下なら線を描かない', () => {
    const { container } = render(<Chart type="kpi" value={10} trend={[10]} />)

    expect(container.querySelector('polyline')).toBeNull()
  })

  it('推移線は0基準ではなくデータ範囲に合わせる（変化が読める）', () => {
    const { container } = render(<Chart type="kpi" value={102} trend={[100, 101, 102]} />)
    const [, , last] = container.querySelector('polyline')?.getAttribute('points')?.split(' ') ?? []

    // 最大値がプロット上端付近（余白の 12% を残した位置）へ来る
    expect(last).toBe('100,12')
  })
})

describe('Chart（凡例）', () => {
  it('系列名が2つ以上あれば既定で表示する', () => {
    const { getByTestId } = render(<Chart {...QUARTERS} />)

    expect(getByTestId('chart-legend').textContent).toContain('今期')
    expect(getByTestId('chart-legend').textContent).toContain('前期')
  })

  it('単一系列では既定で表示しない', () => {
    const { queryByTestId } = render(<Chart type="bar" categories={['A']} series={[{ name: '今期', values: [1] }]} />)

    expect(queryByTestId('chart-legend')).toBeNull()
  })

  it('legend: false で明示的に隠せる', () => {
    const { queryByTestId } = render(<Chart {...QUARTERS} legend={false} />)

    expect(queryByTestId('chart-legend')).toBeNull()
  })
})
