import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Swot } from '../Swot'
import { mockDiagramCanvasSize } from '../../structureDiagram/__tests__/testCanvasSize'

mockDiagramCanvasSize()

describe('Swot', () => {
  it('4ペインの表題ラベルを描画する（既定は英語表記）', () => {
    const { getByText } = render(<Swot strengths={{ items: ['s'] }} />)
    expect(getByText('Strengths')).toBeTruthy()
    expect(getByText('Weaknesses')).toBeTruthy()
    expect(getByText('Opportunities')).toBeTruthy()
    expect(getByText('Threats')).toBeTruthy()
  })

  it('labels で表題ラベルを差し替えられる', () => {
    const { getByText } = render(<Swot strengths={{ items: ['s'] }} labels={{ strengths: '強み', weaknesses: '弱み', opportunities: '機会', threats: '脅威' }} />)
    expect(getByText('強み')).toBeTruthy()
    expect(getByText('弱み')).toBeTruthy()
    expect(getByText('機会')).toBeTruthy()
    expect(getByText('脅威')).toBeTruthy()
  })

  it('items を改行区切りで描画する', () => {
    const { container } = render(<Swot strengths={{ items: ['ブランド認知', '熟練エンジニア'] }} />)
    // 改行付き文字列を .body に載せる（描画結果には両方の項目が含まれる）
    expect(container.textContent).toContain('ブランド認知')
    expect(container.textContent).toContain('熟練エンジニア')
  })

  it('全ペインが空・未指定の場合は何も描画しない', () => {
    expect(render(<Swot />).container.firstChild).toBeNull()
    expect(render(<Swot strengths={{ items: [] }} weaknesses={{ items: [] }} />).container.firstChild).toBeNull()
  })
})
