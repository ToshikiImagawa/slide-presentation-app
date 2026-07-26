import { describe, it, expect } from 'vitest'
import { computeSlidesDiff, deepEqual, hasChanges } from '../slidesDiff'

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
