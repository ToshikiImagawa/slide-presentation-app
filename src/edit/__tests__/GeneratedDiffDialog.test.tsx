import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { GeneratedDiffDialog } from '../GeneratedDiffDialog'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'

const locales: LocaleResource[] = [{ languageCode: 'ja-JP', languageName: '日本語', ui: {} }]
function wrap(ui: ReactNode) {
  return (
    <I18nProvider locales={locales} defaultLocale="ja-JP">
      {ui}
    </I18nProvider>
  )
}

const BEFORE = JSON.stringify({ meta: { title: '旧タイトル' }, slides: [{ id: 's1', layout: 'center', content: { title: '旧' } }] })
// meta.title 変更 + s1 変更 + s2 追加
const AFTER = JSON.stringify({
  meta: { title: '新タイトル' },
  slides: [
    { id: 's1', layout: 'center', content: { title: '新' } },
    { id: 's2', layout: 'center', content: {} },
  ],
})

describe('GeneratedDiffDialog（①構造サマリ差分）', () => {
  it('構造サマリ（追加/変更/削除/メタ）を表示する', () => {
    render(wrap(<GeneratedDiffDialog open beforeText={BEFORE} afterText={AFTER} validationErrors={[]} onApply={() => {}} onCancel={() => {}} />))
    // 集計チップ（単一文字列ラベル）
    expect(screen.getByText('追加 1')).toBeTruthy()
    expect(screen.getByText('変更 1')).toBeTruthy()
    expect(screen.getByText('削除 0')).toBeTruthy()
    expect(screen.getByText('メタ変更 1')).toBeTruthy()
    // 変更スライドの id が出る（s1・s2）
    expect(screen.getByText('s1')).toBeTruthy()
    expect(screen.getByText('s2')).toBeTruthy()
  })

  it('[適用する]/[キャンセル] で各コールバックを呼ぶ', () => {
    const onApply = vi.fn()
    const onCancel = vi.fn()
    render(wrap(<GeneratedDiffDialog open beforeText={BEFORE} afterText={AFTER} validationErrors={[]} onApply={onApply} onCancel={onCancel} />))
    fireEvent.click(screen.getByRole('button', { name: '適用する' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('構造解析不能ならフォールバック（全体置換）表示になり、[適用する] は使える', () => {
    const onApply = vi.fn()
    render(wrap(<GeneratedDiffDialog open beforeText={BEFORE} afterText={'{ broken json'} validationErrors={[]} onApply={onApply} onCancel={() => {}} />))
    expect(screen.getByText(/構造を解析できない/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '適用する' }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('open=false のときは中身をレンダリングしない', () => {
    render(wrap(<GeneratedDiffDialog open={false} beforeText={BEFORE} afterText={AFTER} validationErrors={[]} onApply={() => {}} onCancel={() => {}} />))
    expect(screen.queryByRole('button', { name: '適用する' })).toBeNull()
  })

  it('validationErrors があれば検証エラーの内容を表示する（自動修正の上限到達＝exhausted・#47）', () => {
    const errors = [{ path: 'slides[0].content.title', message: '必須項目です', expected: 'string', actual: 'undefined' }]
    render(wrap(<GeneratedDiffDialog open beforeText={BEFORE} afterText={AFTER} validationErrors={errors} onApply={() => {}} onCancel={() => {}} />))
    expect(screen.getByText('検証エラー (1)')).toBeTruthy()
    expect(screen.getByText(/slides\[0\]\.content\.title/)).toBeTruthy()
    expect(screen.getByText(/必須項目です/)).toBeTruthy()
  })

  it('validationErrors が空なら検証エラーのセクションを表示しない', () => {
    render(wrap(<GeneratedDiffDialog open beforeText={BEFORE} afterText={AFTER} validationErrors={[]} onApply={() => {}} onCancel={() => {}} />))
    expect(screen.queryByText(/検証エラー/)).toBeNull()
  })

  it('changed のスライドは git diff 風の行単位表示（追加=+/削除=-）になる', () => {
    // MUI Dialog は Portal で document.body 直下に描画されるため container ではなく document から探す
    render(wrap(<GeneratedDiffDialog open beforeText={BEFORE} afterText={AFTER} validationErrors={[]} onApply={() => {}} onCancel={() => {}} />))
    const pre = document.body.querySelector('pre')
    // JSON インデントの空白がそのまま残るため、prefix 直後の空白量は問わずに判定する
    expect(pre?.textContent).toMatch(/-\s+"title": "旧"/)
    expect(pre?.textContent).toMatch(/\+\s+"title": "新"/)
    // 左右2カラム表示（変更前/変更後の見出し）はもう使わない
    expect(screen.queryByText('変更前')).toBeNull()
  })
})
