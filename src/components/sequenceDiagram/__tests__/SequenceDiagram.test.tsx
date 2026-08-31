import { describe, expect, it } from 'vitest'
import { fireEvent, render, type RenderResult } from '@testing-library/react'
import { SequenceDiagram } from '../SequenceDiagram'
import type { SequenceDiagramSpec } from '../types'
import { mockDiagramCanvasSize } from '../../structureDiagram/__tests__/testCanvasSize'

mockDiagramCanvasSize()

const LIFELINES = [
  { id: 'user', label: 'User' },
  { id: 'api', label: 'API' },
  { id: 'db', label: 'DB' },
]
const MESSAGES = [
  { from: 'user', to: 'api', label: 'login()' },
  { from: 'api', to: 'db', label: 'query()', type: 'async' as const },
  { from: 'api', to: 'api', label: 'validate()' },
  { from: 'db', to: 'api', label: 'result' },
  { from: 'api', to: 'user', label: 'response' },
]
const ACTIVATIONS = [{ lifeline: 'api', from: 0, to: 4 }]

/** メッセージ矢印は「直前の矢印の描画アニメーション（polyline の animationend）が完了した」ことを
 * 起点に1本ずつ出現する（SequenceDiagram.tsx の SequenceMessages 参照）。jsdom は CSS アニメーションを
 * 実行しないため、直前にマウントされた矢印の polyline（DOM上は常に最後の polyline。dashed なスパインは
 * 先に描画済みで区別できる）へ animationend を都度手動で発火させて全件描画済みの状態を作る。
 * result.container から直接 querySelectorAll するのは、同じテスト内で複数回 render するケースがあり、
 * document.body 基準の bound query（getByTestId 等）だと前回の render の要素も含んでしまうため */
function renderAllRevealed(props: SequenceDiagramSpec): RenderResult {
  const result = render(<SequenceDiagram {...props} />)
  const count = props.messages?.length ?? 0
  for (let i = 1; i < count; i++) {
    const polylines = result.container.querySelectorAll('polyline')
    const current = polylines[polylines.length - 1]
    if (current) fireEvent.animationEnd(current)
  }
  return result
}

describe('SequenceDiagram', () => {
  it('ライフラインラベルとメッセージラベルを描画する', () => {
    const { getByText } = renderAllRevealed({ lifelines: LIFELINES, messages: MESSAGES })
    expect(getByText('User')).toBeTruthy()
    expect(getByText('API')).toBeTruthy()
    expect(getByText('DB')).toBeTruthy()
    expect(getByText('login()')).toBeTruthy()
    expect(getByText('query()')).toBeTruthy()
  })

  it('ライフライン数（スパイン）+メッセージ数だけ折れ線を描画する', () => {
    const { container } = renderAllRevealed({ lifelines: LIFELINES, messages: MESSAGES })
    expect(container.querySelectorAll('polyline')).toHaveLength(LIFELINES.length + MESSAGES.length)
  })

  it('type省略（sync）は塗り三角、type: asyncは開いた矢羽根の終端マーカーを使う', () => {
    const { container } = renderAllRevealed({ lifelines: LIFELINES, messages: MESSAGES })
    const markers = container.querySelectorAll('marker path')
    // messages[0]（sync既定）→塗りpath、messages[1]（async）→fill="none"のpath
    expect(markers[0].getAttribute('fill')).not.toBe('none')
    expect(markers[1].getAttribute('fill')).toBe('none')
  })

  it('自己メッセージ（from===toのメッセージ）は4点の折れ線（コの字経路）で描画する', () => {
    const { container } = renderAllRevealed({ lifelines: LIFELINES, messages: MESSAGES })
    const pointCounts = Array.from(container.querySelectorAll('polyline')).map((polyline) => polyline.getAttribute('points')!.trim().split(' ').length)
    // messages[2]（api→api）のみ4点、他（スパイン2本＋通常メッセージ4本）は2点
    expect(pointCounts.filter((count) => count === 4)).toHaveLength(1)
  })

  it('活性区間はfilled variantのカードとして描画する', () => {
    const { container } = renderAllRevealed({ lifelines: LIFELINES, messages: MESSAGES, activations: ACTIVATIONS })
    // filled variantはDiagramCard.module.cssのfilledクラスを持つ（ヘッダーカードは既定のoutlineなので混在しない）
    expect(container.querySelectorAll('[class*="filled"]')).toHaveLength(ACTIVATIONS.length)
  })

  it('存在しないライフラインidを参照するメッセージ・活性区間は描画をスキップする（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByText, queryByText } = renderAllRevealed({
      lifelines: [{ id: 'a', label: 'A' }],
      messages: [
        { from: 'a', to: 'ghost', label: '不正' },
        { from: 'a', to: 'a', label: '正常' },
      ],
      activations: [{ lifeline: 'ghost', from: 0, to: 1 }],
    })
    expect(queryByText('不正')).toBeNull()
    expect(getByText('正常')).toBeTruthy()
  })

  it('idを持たないライフラインは除外する（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByText, queryByText } = render(<SequenceDiagram lifelines={[{ label: 'idなし' } as never, { id: 'ok', label: '正常' }]} />)
    expect(queryByText('idなし')).toBeNull()
    expect(getByText('正常')).toBeTruthy()
  })

  it('lifelines未指定・空配列では何も描画しない', () => {
    expect(render(<SequenceDiagram />).container.firstChild).toBeNull()
    expect(render(<SequenceDiagram lifelines={[]} />).container.firstChild).toBeNull()
  })

  it('同じ入力からは常に同じ配置になる（決定的。乱数・力学モデルを使わない・#269の受け入れ基準）', () => {
    const pointsOf = (container: HTMLElement) => Array.from(container.querySelectorAll('polyline')).map((polyline) => polyline.getAttribute('points'))
    const a = pointsOf(renderAllRevealed({ lifelines: LIFELINES, messages: MESSAGES, activations: ACTIVATIONS }).container)
    const b = pointsOf(renderAllRevealed({ lifelines: LIFELINES, messages: MESSAGES, activations: ACTIVATIONS }).container)
    expect(a.length).toBeGreaterThan(0)
    expect(a).toEqual(b)
  })
})
