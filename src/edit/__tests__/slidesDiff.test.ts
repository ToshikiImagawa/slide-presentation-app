import { describe, it, expect } from 'vitest'
import { applySelectedChanges, computeSlidesDiff, deepEqual, hasChanges, selectAllChanges } from '../slidesDiff'

const BEFORE = JSON.stringify({
  meta: { title: 'プレゼン資料', author: '山田' },
  slides: [
    { id: 's1', layout: 'center', content: { title: 'はじめに' } },
    { id: 's2', layout: 'content', content: { heading: '背景' } },
    { id: 's3', layout: 'center', content: { title: 'まとめ' } },
  ],
})

const AFTER = JSON.stringify({
  meta: { title: 'AI の歴史入門', author: '山田' },
  slides: [
    { id: 's1', layout: 'center', content: { title: 'AI の歴史入門' } },
    { id: 's2', layout: 'content', content: { heading: '起源: チューリング' } },
    { id: 's3', layout: 'two-column', content: { left: '第一次', right: '第二次' } },
    { id: 's4', layout: 'content', content: { heading: '深層学習' } },
    { id: 's5', layout: 'center', content: { title: 'まとめと展望' } },
  ],
})

describe('computeSlidesDiff（構造サマリ差分）', () => {
  it('meta 変更・スライドの追加/変更/削除を id で突き合わせて算出する', () => {
    const diff = computeSlidesDiff(BEFORE, AFTER)

    expect(diff.parseable).toBe(true)
    expect(diff.beforeCount).toBe(3)
    expect(diff.afterCount).toBe(5)

    // meta.title のみ変更（author は不変）
    expect(diff.metaChanges).toHaveLength(1)
    expect(diff.metaChanges[0]).toMatchObject({ key: 'title', kind: 'changed' })

    // s1/s2/s3 変更、s4/s5 追加、削除なし
    expect(diff.added).toBe(2)
    expect(diff.changed).toBe(3)
    expect(diff.removed).toBe(0)
    const added = diff.slideChanges
      .filter((c) => c.kind === 'added')
      .map((c) => c.id)
      .sort()
    expect(added).toEqual(['s4', 's5'])
    const changed = diff.slideChanges
      .filter((c) => c.kind === 'changed')
      .map((c) => c.id)
      .sort()
    expect(changed).toEqual(['s1', 's2', 's3'])

    // 変更スライドは before/after を持ち、詳細展開に使える
    const s3 = diff.slideChanges.find((c) => c.id === 's3')!
    expect((s3.before as { layout: string }).layout).toBe('center')
    expect((s3.after as { layout: string }).layout).toBe('two-column')
  })

  it('削除を検出する（after で id が消える）', () => {
    const after = JSON.stringify({ meta: { title: 'x' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    const before = JSON.stringify({
      meta: { title: 'x' },
      slides: [
        { id: 's1', layout: 'center', content: {} },
        { id: 's2', layout: 'center', content: {} },
      ],
    })
    const diff = computeSlidesDiff(before, after)
    expect(diff.removed).toBe(1)
    expect(diff.slideChanges.find((c) => c.kind === 'removed')?.id).toBe('s2')
  })

  it('theme 等 meta/slides 以外のトップレベル変更を otherChanges で拾う', () => {
    const before = JSON.stringify({ meta: { title: 'x' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    const after = JSON.stringify({ meta: { title: 'x' }, theme: { colors: { primary: '#111' } }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    const diff = computeSlidesDiff(before, after)
    expect(diff.otherChanges).toHaveLength(1)
    expect(diff.otherChanges[0]).toMatchObject({ key: 'theme', kind: 'added' })
  })

  it('変更が一切なければ hasChanges は false', () => {
    const diff = computeSlidesDiff(BEFORE, BEFORE)
    expect(diff.parseable).toBe(true)
    expect(hasChanges(diff)).toBe(false)
  })

  it('構文エラー・非オブジェクトは parseable:false（フォールバック）', () => {
    expect(computeSlidesDiff('{ broken', AFTER).parseable).toBe(false)
    expect(computeSlidesDiff(BEFORE, '[]').parseable).toBe(false)
  })

  it('id 欠落・重複で突き合わせ不能なら parseable:false', () => {
    const noId = JSON.stringify({ meta: { title: 'x' }, slides: [{ layout: 'center', content: {} }] })
    expect(computeSlidesDiff(BEFORE, noId).parseable).toBe(false)
    const dupId = JSON.stringify({
      meta: { title: 'x' },
      slides: [
        { id: 's1', layout: 'center', content: {} },
        { id: 's1', layout: 'center', content: {} },
      ],
    })
    expect(computeSlidesDiff(BEFORE, dupId).parseable).toBe(false)
  })
})

describe('deepEqual', () => {
  it('キー順に依存せず等価判定する', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(deepEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
  })
})

describe('applySelectedChanges（部分適用・#301）', () => {
  const before = JSON.stringify({
    meta: { title: '旧タイトル' },
    theme: { colors: { primary: '#111111' } },
    slides: [
      { id: 's1', layout: 'center', content: { title: '旧1' } },
      { id: 's2', layout: 'center', content: { title: '旧2' } },
      { id: 's3', layout: 'center', content: { title: '旧3' } },
    ],
  })
  const after = JSON.stringify({
    meta: { title: '新タイトル' },
    theme: { colors: { primary: '#222222' } },
    slides: [
      { id: 's1', layout: 'center', content: { title: '新1' } },
      { id: 's4', layout: 'center', content: { title: '新4' } },
      { id: 's3', layout: 'center', content: { title: '新3' } },
    ],
  })

  it('全選択（selectAllChanges）は全体適用と等価（after と一致）', () => {
    const diff = computeSlidesDiff(before, after)
    const merged = JSON.parse(applySelectedChanges(before, after, selectAllChanges(diff)))
    expect(merged).toEqual(JSON.parse(after))
  })

  it('テーマのみ選択すると、テーマだけ変わりスライドは元のまま', () => {
    const merged = JSON.parse(applySelectedChanges(before, after, { theme: true, slideIds: new Set() }))
    expect(merged.theme).toEqual({ colors: { primary: '#222222' } })
    expect(merged.slides.map((s: { id: string }) => s.id)).toEqual(['s1', 's2', 's3'])
    expect(merged.slides.find((s: { id: string }) => s.id === 's1').content.title).toBe('旧1')
  })

  it('特定スライドの変更のみ選択すると、そのスライドだけ反映され他はそのまま（テーマも不変）', () => {
    const merged = JSON.parse(applySelectedChanges(before, after, { theme: false, slideIds: new Set(['s1']) }))
    expect(merged.theme).toEqual({ colors: { primary: '#111111' } })
    expect(merged.slides.map((s: { id: string }) => s.id)).toEqual(['s1', 's2', 's3'])
    expect(merged.slides.find((s: { id: string }) => s.id === 's1').content.title).toBe('新1')
    expect(merged.slides.find((s: { id: string }) => s.id === 's2').content.title).toBe('旧2')
  })

  it('追加スライドの選択は after での相対順序を保って挿入される', () => {
    const merged = JSON.parse(applySelectedChanges(before, after, { theme: false, slideIds: new Set(['s4']) }))
    // after では s1, s4, s3 の順（s2 は before のまま残る）
    expect(merged.slides.map((s: { id: string }) => s.id)).toEqual(['s1', 's4', 's2', 's3'])
  })

  it('削除の選択で該当スライドが除去され、非選択なら残る', () => {
    const b = JSON.stringify({
      meta: { title: 'x' },
      slides: [
        { id: 's1', layout: 'center', content: {} },
        { id: 's2', layout: 'center', content: {} },
      ],
    })
    const a = JSON.stringify({ meta: { title: 'x' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    const removed = JSON.parse(applySelectedChanges(b, a, { theme: true, slideIds: new Set(['s2']) }))
    expect(removed.slides.map((s: { id: string }) => s.id)).toEqual(['s1'])
    const kept = JSON.parse(applySelectedChanges(b, a, { theme: true, slideIds: new Set() }))
    expect(kept.slides.map((s: { id: string }) => s.id)).toEqual(['s1', 's2'])
  })

  it('meta と theme 以外のトップレベル変更は選択に関わらず常に適用される', () => {
    const b = JSON.stringify({ meta: { title: '旧' }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    const a = JSON.stringify({ meta: { title: '新' }, custom: { flag: true }, slides: [{ id: 's1', layout: 'center', content: {} }] })
    const merged = JSON.parse(applySelectedChanges(b, a, { theme: false, slideIds: new Set() }))
    expect(merged.meta.title).toBe('新')
    expect(merged.custom).toEqual({ flag: true })
  })

  it('部分適用後も2スペース整形が保たれる', () => {
    const diff = computeSlidesDiff(before, after)
    const merged = applySelectedChanges(before, after, selectAllChanges(diff))
    expect(merged).toBe(JSON.stringify(JSON.parse(merged), null, 2))
  })

  it('構造解析不能なら before をそのまま返す（フォールバック）', () => {
    const result = applySelectedChanges('{ broken', after, { theme: true, slideIds: new Set() })
    expect(result).toBe('{ broken')
  })
})
