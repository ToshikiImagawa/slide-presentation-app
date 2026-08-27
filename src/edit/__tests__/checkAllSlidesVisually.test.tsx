import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect, useRef, useState } from 'react'
import { render, act } from '@testing-library/react'
import { checkAllSlidesVisually, deriveCheckableDeck, summarizeVisualCheckWarnings } from '../checkAllSlidesVisually'
import type { SlideData } from '../../data'

// checkAllSlidesVisually 自体は DOM 実測（waitForImagesToSettle/waitForLayoutToSettle/getVisualCheckWarnings）を
// 呼ぶだけで、実測ロジック自体は visualChecks.test.ts の対象。ここではインデックス走査・集約ロジックを検証する
const h = vi.hoisted(() => ({
  getVisualCheckWarnings: vi.fn<(section: HTMLElement) => string[]>(),
}))
vi.mock('../../visualChecks', () => ({
  getVisualCheckWarnings: h.getVisualCheckWarnings,
  waitForImagesToSettle: vi.fn().mockResolvedValue({ timedOut: false }),
  waitForLayoutToSettle: vi.fn().mockResolvedValue({ timedOut: false }),
}))

const SLIDES: SlideData[] = [
  { id: 's0', layout: 'center', content: {} },
  { id: 's1', layout: 'center', content: {} },
  { id: 's2', layout: 'center', content: {} },
]

/** flushSync で setIndex を叩けるよう、実際にコミットされる section を持つ最小の描画先を用意する */
function Harness({ onReady }: { onReady: (api: { setIndex: (i: number) => void; getSection: () => HTMLElement | null }) => void }) {
  const [index, setIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    onReady({ setIndex, getSection: () => containerRef.current?.querySelector<HTMLElement>('section.slide-container') ?? null })
  }, [onReady])
  return <div ref={containerRef}>{index !== null && <section className="slide-container" data-index={index} />}</div>
}

function renderHarness(): Promise<{ setIndex: (i: number) => void; getSection: () => HTMLElement | null }> {
  return new Promise((resolve) => {
    render(<Harness onReady={resolve} />)
  })
}

describe('checkAllSlidesVisually', () => {
  beforeEach(() => {
    h.getVisualCheckWarnings.mockReset()
  })

  it('警告があるスライドだけを index/slideId 付きで集める', async () => {
    h.getVisualCheckWarnings.mockImplementation((section) => (section.dataset.index === '1' ? ['内部クリッピング: 見出しが隠れています'] : []))
    const { setIndex, getSection } = await renderHarness()

    const results = await act(() => checkAllSlidesVisually(SLIDES, setIndex, getSection))

    expect(results).toEqual([{ index: 1, slideId: 's1', warnings: ['内部クリッピング: 見出しが隠れています'] }])
  })

  it('全スライドで警告が無ければ空配列を返す', async () => {
    h.getVisualCheckWarnings.mockReturnValue([])
    const { setIndex, getSection } = await renderHarness()

    const results = await act(() => checkAllSlidesVisually(SLIDES, setIndex, getSection))

    expect(results).toEqual([])
    expect(h.getVisualCheckWarnings).toHaveBeenCalledTimes(SLIDES.length)
  })

  it('section が取得できないインデックスはスキップする', async () => {
    h.getVisualCheckWarnings.mockReturnValue(['警告'])
    const results = await act(() =>
      checkAllSlidesVisually(
        SLIDES,
        () => undefined,
        () => null,
      ),
    )

    expect(results).toEqual([])
    expect(h.getVisualCheckWarnings).not.toHaveBeenCalled()
  })
})

describe('summarizeVisualCheckWarnings', () => {
  it('index/slideId/警告を "- slides[N]（id: X）: 警告" 形式の行に整形する', () => {
    const text = summarizeVisualCheckWarnings([{ index: 2, slideId: 'guide-image', warnings: ['はみ出し: 見出しがスライド外に出ています', '内部クリッピング: 本文が隠れています'] }])

    expect(text).toContain('- slides[2]（id: guide-image）: はみ出し: 見出しがスライド外に出ています')
    expect(text).toContain('- slides[2]（id: guide-image）: 内部クリッピング: 本文が隠れています')
  })

  it('結果が空なら見出し文のみを返す', () => {
    const text = summarizeVisualCheckWarnings([])
    expect(text.split('\n')).toHaveLength(1)
  })
})

describe('deriveCheckableDeck', () => {
  const VALID = JSON.stringify({ meta: { title: 'T', logo: { src: 'logo.png' } }, slides: [{ id: 's0', layout: 'center', content: {}, meta: { section: '章1' } }] })

  it('妥当な JSON から slides/logo/confidential/sections を導出する', () => {
    const deck = deriveCheckableDeck(VALID, '', undefined)
    expect(deck).not.toBeNull()
    expect(deck?.slides.map((s) => s.id)).toEqual(['s0'])
    expect(deck?.logo).toEqual({ src: 'logo.png' })
    expect(deck?.sections).toEqual([{ title: '章1', number: 1, startIndex: 0, slideCount: 1 }])
  })

  it('JSON 構文エラーなら null を返す', () => {
    expect(deriveCheckableDeck('{ invalid', '', undefined)).toBeNull()
  })

  it('構文的には妥当だが構造エラー（slides欠落等）なら null を返す', () => {
    expect(deriveCheckableDeck(JSON.stringify({ meta: {}, slides: [] }), '', undefined)).toBeNull()
  })
})
