import { describe, it, expect } from 'vitest'
import { buildSections, findSectionAt } from '../sections'
import type { SlideData } from '../data'

/** meta.section だけを持つ最小スライドを並べる（章の導出は layout/content に依存しない） */
function deck(...sections: (string | undefined)[]): SlideData[] {
  return sections.map((section, i) => ({ id: `s${i}`, layout: 'content', content: {}, meta: section ? { section } : undefined }))
}

describe('buildSections', () => {
  it('meta.section を持つスライドがなければ空配列を返す（章定義のないデッキ）', () => {
    expect(buildSections(deck(undefined, undefined))).toEqual([])
    expect(buildSections([])).toEqual([])
  })

  it('同じタイトルが隣接して続くスライドを1つの章としてまとめ、章番号を宣言順に振る', () => {
    expect(buildSections(deck(undefined, '導入', '導入', '設計'))).toEqual([
      { title: '導入', number: 1, startIndex: 1, slideCount: 2 },
      { title: '設計', number: 2, startIndex: 3, slideCount: 1 },
    ])
  })

  it('章に属さないスライドで途切れた場合は同じタイトルでも別の章として数える', () => {
    expect(buildSections(deck('導入', undefined, '導入'))).toEqual([
      { title: '導入', number: 1, startIndex: 0, slideCount: 1 },
      { title: '導入', number: 2, startIndex: 2, slideCount: 1 },
    ])
  })

  it('離れた位置に同じタイトルが再登場した場合も別の章になる', () => {
    const sections = buildSections(deck('導入', '設計', '導入'))
    expect(sections.map((s) => [s.title, s.number, s.startIndex])).toEqual([
      ['導入', 1, 0],
      ['設計', 2, 1],
      ['導入', 3, 2],
    ])
  })
})

describe('findSectionAt', () => {
  const sections = buildSections(deck(undefined, '導入', '導入', '設計'))

  it('章に属するスライドの index からその章を返す', () => {
    expect(findSectionAt(sections, 1)?.title).toBe('導入')
    expect(findSectionAt(sections, 2)?.title).toBe('導入')
    expect(findSectionAt(sections, 3)?.title).toBe('設計')
  })

  it('章に属さないスライドの index では undefined を返す', () => {
    expect(findSectionAt(sections, 0)).toBeUndefined()
    expect(findSectionAt([], 0)).toBeUndefined()
  })
})
