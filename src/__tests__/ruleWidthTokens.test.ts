import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** 装飾的な太線の意匠トークン（#228・見出し下線を #257 で追加）。
 *  既定値が現行の見た目と一致することは reference-deck:diff（差分ゼロ）が担保するので、
 *  ここでは「トークンが宣言されていること」と「太さを持つ全箇所がトークンを参照していること」を守る。
 *  特に上端の帯は詳細度の違う 2 セレクタで宣言されており、片方だけをトークン化すると
 *  詳細度の高いほうが勝ってテーマから変えられなくなる（この回帰を機械的に防ぐのが主目的）。 */
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf-8')

const globalCss = read('../styles/global.css')
const timelineCss = read('../components/Timeline.module.css')
const timelineNodeTsx = read('../components/TimelineNode.tsx')
const underlinedHeadingTsx = read('../components/UnderlinedHeading.tsx')

describe('装飾的な太線の意匠トークン', () => {
  it('5 つのトークンを :root に宣言し、既定値は現行の見た目のまま', () => {
    expect(globalCss).toContain('--theme-heading-accent-width: 6px;')
    expect(globalCss).toContain('--theme-heading-underline-width: 1.5px;')
    expect(globalCss).toContain('--theme-frame-rule-width: 4px;')
    expect(globalCss).toContain('--theme-rule-width: 4px;')
    expect(globalCss).toContain('--theme-node-ring-width: 3px;')
  })

  it('スライド上端の帯は詳細度の違う 2 セレクタの両方がトークンを参照する', () => {
    const bandBlocks = globalCss.match(/\.slide-container::before\s*\{[^}]*\}/g) ?? []
    expect(bandBlocks).toHaveLength(2)
    for (const block of bandBlocks) {
      expect(block).toContain('height: var(--theme-frame-rule-width);')
    }
  })

  it('見出しの左バー・見出しの下線・Timeline の水平線・ノードのリングがトークンを参照する', () => {
    expect(globalCss).toContain('border-left: var(--theme-heading-accent-width) solid var(--theme-primary);')
    expect(underlinedHeadingTsx).toContain("borderWidth: 'var(--theme-heading-underline-width)',")
    expect(timelineCss).toContain('height: var(--theme-rule-width);')
    expect(timelineNodeTsx).toContain("border: 'var(--theme-node-ring-width) solid var(--theme-primary)',")
  })
})
