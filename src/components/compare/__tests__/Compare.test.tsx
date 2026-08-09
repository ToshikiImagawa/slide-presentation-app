import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Compare } from '../Compare'
import type { CompareSpec } from '../types'

const PLAN: CompareSpec = {
  left: {
    heading: '採用する',
    items: [
      { text: '対応済み', status: 'pass' },
      { text: '未対応', status: 'fail' },
    ],
  },
  right: {
    heading: '採用しない',
    items: [{ text: '注意事項', status: 'warn' }, { text: '補足' }],
  },
}

describe('Compare', () => {
  it('左右ペインの見出しと項目を描画する', () => {
    const { getByText } = render(<Compare {...PLAN} />)
    expect(getByText('採用する')).toBeTruthy()
    expect(getByText('採用しない')).toBeTruthy()
    expect(getByText('対応済み')).toBeTruthy()
    expect(getByText('補足')).toBeTruthy()
  })

  it('statusを指定した項目は状態記号を描画する', () => {
    const { getByText } = render(<Compare {...PLAN} />)
    expect(getByText('✓')).toBeTruthy()
    expect(getByText('✕')).toBeTruthy()
    expect(getByText('!')).toBeTruthy()
  })

  it('statusを省略した項目は記号を描画しない', () => {
    const { getByText } = render(<Compare {...PLAN} />)
    const row = getByText('補足').closest('li') as HTMLElement
    expect(row.querySelector('span')?.textContent).toBe('補足')
  })

  it('状態色はカラーパレットキーから CSS 変数で解決する（テーマに追従する）', () => {
    const { getByText } = render(<Compare {...PLAN} />)
    expect(getByText('✓').style.getPropertyValue('--mark-color')).toBe('var(--theme-success)')
    expect(getByText('✕').style.getPropertyValue('--mark-color')).toBe('var(--theme-danger)')
    expect(getByText('!').style.getPropertyValue('--mark-color')).toBe('var(--theme-warning)')
  })

  it('2ペインが同じグリッドの行に配置される（高さが揃う）', () => {
    const { getByTestId } = render(<Compare {...PLAN} />)
    expect(getByTestId('compare').children).toHaveLength(2)
  })

  it('leftまたはrightを省略しても落ちない', () => {
    const { getByText } = render(<Compare left={PLAN.left} />)
    expect(getByText('採用する')).toBeTruthy()
  })

  it('itemsが配列でなくても落ちない（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByTestId } = render(<Compare left={{ heading: 'x', items: 'broken' as never }} />)
    expect(getByTestId('compare')).toBeTruthy()
  })
})
