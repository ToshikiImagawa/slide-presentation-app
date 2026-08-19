import { describe, expect, it } from 'vitest'
import { countLayoutAssignments, mergeLayoutAssignments, recommendLayoutAssignments } from '../layoutAssignmentHints'
import type { BrandPlaceholderKind, LayoutAssignmentSlot, MasterProfile, PlaceholderProfile, PlaceholderTextProps, SlideLayoutProfile } from '../types'
import { profile } from './fixtures'

function placeholder(kind: BrandPlaceholderKind, rect: Partial<Pick<PlaceholderProfile, 'xEmu' | 'yEmu' | 'cxEmu' | 'cyEmu'>> = {}): PlaceholderProfile {
  const text: PlaceholderTextProps = { latin: null, ea: null, cs: null, sizePt: null, bold: null, colorHex: null, fontOrigin: 'none' }
  return { phType: null, idx: null, kind, text, xEmu: null, yEmu: null, cxEmu: null, cyEmu: null, ...rect }
}

function layout(overrides: Partial<SlideLayoutProfile> = {}): SlideLayoutProfile {
  return { part: 'ppt/slideLayouts/slideLayoutN.xml', name: null, layoutType: null, placeholders: [], backgroundColorHex: null, ...overrides }
}

function master(slideLayouts: SlideLayoutProfile[]): MasterProfile {
  return { part: 'ppt/slideMasters/slideMaster1.xml', mappedColors: profile().mappedColors, slideLayouts }
}

describe('recommendLayoutAssignments（#372）', () => {
  it('layoutType が title の layout は center を推薦する（body の有無に関わらず）', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'title', placeholders: [placeholder('title'), placeholder('body')] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'center' })
  })

  it('title のみ（body 無し）で背景色が無い layout は center を推薦する', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'obj', placeholders: [placeholder('title')], backgroundColorHex: null })])] })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'center' })
  })

  it('title のみで全面塗りの背景色を持つ layout は center/message-inverse を推薦する', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'obj', placeholders: [placeholder('title')], backgroundColorHex: '#000000' })])] })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'center/message-inverse' })
  })

  it('title + body が1つずつの layout は content を推薦する', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'obj', placeholders: [placeholder('title'), placeholder('body')] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'content' })
  })

  it('body が2つ横並びで左右に余白がある layout は two-column を推薦する', () => {
    const a = placeholder('body', { xEmu: 609_600, yEmu: 1_000_000, cxEmu: 5_000_000, cyEmu: 4_000_000 })
    const b = placeholder('body', { xEmu: 6_600_000, yEmu: 1_000_000, cxEmu: 5_000_000, cyEmu: 4_000_000 })
    const p = profile({ masters: [master([layout({ layoutType: 'twoObj', placeholders: [a, b] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'two-column' })
  })

  it('body が2つ横並びで左右の余白をほぼ持たない layout は bleed を推薦する', () => {
    const a = placeholder('body', { xEmu: 0, yEmu: 1_000_000, cxEmu: 6_096_000, cyEmu: 4_000_000 })
    const b = placeholder('body', { xEmu: 6_096_000, yEmu: 1_000_000, cxEmu: 6_096_000, cyEmu: 4_000_000 })
    const p = profile({ masters: [master([layout({ layoutType: 'twoObj', placeholders: [a, b] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'bleed' })
  })

  it('slideSize が無いテンプレートでは全面判定ができないため two-column に倒す', () => {
    const a = placeholder('body', { xEmu: 0, yEmu: 1_000_000, cxEmu: 6_096_000, cyEmu: 4_000_000 })
    const b = placeholder('body', { xEmu: 6_096_000, yEmu: 1_000_000, cxEmu: 6_096_000, cyEmu: 4_000_000 })
    const p = profile({ slideSize: null, masters: [master([layout({ layoutType: 'twoObj', placeholders: [a, b] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'two-column' })
  })

  it('body が2つでも縦に並ぶ（横並びでない）場合は未割当のままにする', () => {
    const a = placeholder('body', { xEmu: 1_000_000, yEmu: 500_000, cxEmu: 8_000_000, cyEmu: 1_000_000 })
    const b = placeholder('body', { xEmu: 1_000_000, yEmu: 3_000_000, cxEmu: 8_000_000, cyEmu: 1_000_000 })
    const p = profile({ masters: [master([layout({ layoutType: 'obj', placeholders: [a, b] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({})
  })

  it('body が3つ以上の layout は未割当のままにする（確信が持てない構成）', () => {
    const rect = { xEmu: 0, yEmu: 0, cxEmu: 1_000_000, cyEmu: 1_000_000 }
    const p = profile({ masters: [master([layout({ layoutType: 'obj', placeholders: [placeholder('body', rect), placeholder('body', rect), placeholder('body', rect)] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({})
  })

  it('title も body も無い layout は未割当のままにする', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'obj', placeholders: [placeholder('other')] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({})
  })

  it('center/section・center/closing は構成だけでは推薦しない（layoutType の名前に依存しない）', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'secHead', placeholders: [placeholder('title')] })])] })
    // secHead という名前を持つ layoutType でも、実際の判定は「title のみ」ルールに従い center を推薦する
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'center' })
  })

  it('name（テンプレート作者依存の文字列）には一切依存しない', () => {
    const p = profile({ masters: [master([layout({ name: 'CUSTOM_1_1_1', layoutType: 'title', placeholders: [placeholder('title')] })])] })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'center' })
  })

  it('同じ枠に複数の layout が該当する場合、確度が高い方を採り、もう一方は未割当のままにする', () => {
    const p = profile({
      masters: [
        master([
          layout({ layoutType: 'title', placeholders: [placeholder('title')] }), // confidence 最高（layoutType）
          layout({ layoutType: 'obj', placeholders: [placeholder('title')] }), // confidence 中（構成のみ）。同じ center 枠に該当
        ]),
      ],
    })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'center' })
  })

  it('同じ confidence が競合する場合は走査順が早い方（masterIndex→layoutIndex）を採る', () => {
    const p = profile({
      masters: [master([layout({ layoutType: 'obj', placeholders: [placeholder('title')] }), layout({ layoutType: 'obj', placeholders: [placeholder('title')] })])],
    })
    expect(recommendLayoutAssignments(p)).toEqual({ '0:0': 'center' })
  })

  it('推薦が0件（未検出・確信が持てない構成のみ）のとき空オブジェクトを返す', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'secHead', placeholders: [], backgroundColorHex: '#000000' }), layout({ layoutType: 'obj', placeholders: [], backgroundColorHex: null })])] })
    expect(recommendLayoutAssignments(p)).toEqual({})
  })

  it('同じ入力から必ず同じ推薦になる（決定的）', () => {
    const p = profile({
      masters: [master([layout({ layoutType: 'title', placeholders: [placeholder('title'), placeholder('body')] }), layout({ layoutType: 'obj', placeholders: [placeholder('title'), placeholder('body')] })])],
    })
    const first = recommendLayoutAssignments(p)
    for (let i = 0; i < 5; i++) {
      expect(recommendLayoutAssignments(p)).toEqual(first)
    }
  })
})

describe('mergeLayoutAssignments（#372）', () => {
  const recommended: Record<string, LayoutAssignmentSlot> = { '0:0': 'center', '0:1': 'content' }

  it('人の上書きが無ければ推薦をそのまま採用する', () => {
    expect(mergeLayoutAssignments(recommended, undefined)).toEqual(recommended)
  })

  it('人の上書きは推薦より優先し、異なる枠を選んでもそのまま採用する', () => {
    expect(mergeLayoutAssignments(recommended, { '0:0': 'two-column' })).toEqual({ '0:0': 'two-column', '0:1': 'content' })
  })

  it('人が明示的に未割当（null）を選んだ場合、推薦を無視してその枠は未割当になる', () => {
    expect(mergeLayoutAssignments(recommended, { '0:0': null })).toEqual({ '0:0': null, '0:1': 'content' })
  })

  it('人の上書きが推薦の枠を奪った場合、その推薦は落ちる（枠は1対1）', () => {
    // '0:2' を人が center に割り当てると、推薦されていた '0:0': center が枠を失い脱落する
    expect(mergeLayoutAssignments(recommended, { '0:2': 'center' })).toEqual({ '0:1': 'content', '0:2': 'center' })
  })
})

describe('countLayoutAssignments（#372）', () => {
  it('推薦 / 上書き / 未割当の件数を正しく数える', () => {
    const p = profile({
      masters: [
        master([
          layout({ layoutType: 'title', placeholders: [placeholder('title')] }), // '0:0': 推薦(center)
          layout({ layoutType: 'obj', placeholders: [] }), // '0:1': 人が上書き(content)
          layout({ layoutType: 'obj', placeholders: [] }), // '0:2': 未割当
        ]),
      ],
    })
    expect(countLayoutAssignments(p, { '0:1': 'content' })).toEqual({ recommended: 1, overridden: 1, unassigned: 1 })
  })

  it('人が推薦と同じ値を明示的に選んだ場合も overridden として数える（人の行動として記録する）', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'title', placeholders: [placeholder('title')] })])] })
    expect(countLayoutAssignments(p, { '0:0': 'center' })).toEqual({ recommended: 0, overridden: 1, unassigned: 0 })
  })

  it('人が明示的に未割当（null）を選んだ場合は unassigned として数える', () => {
    const p = profile({ masters: [master([layout({ layoutType: 'title', placeholders: [placeholder('title')] })])] })
    expect(countLayoutAssignments(p, { '0:0': null })).toEqual({ recommended: 0, overridden: 0, unassigned: 1 })
  })

  it('レイアウトが1枚も無ければ全件0を返す', () => {
    expect(countLayoutAssignments(profile(), undefined)).toEqual({ recommended: 0, overridden: 0, unassigned: 0 })
  })
})
