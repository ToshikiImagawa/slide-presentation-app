import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '../ConfirmDialog'

describe('ConfirmDialog（破壊的操作の確認）', () => {
  it('タイトル・メッセージを表示し、確定/取消で各コールバックを呼ぶ', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="削除しますか？" message="取り消せません" confirmLabel="削除する" cancelLabel="キャンセル" onConfirm={onConfirm} onCancel={onCancel} />)

    expect(screen.getByText('削除しますか？')).toBeTruthy()
    expect(screen.getByText('取り消せません')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('open=false のときは中身をレンダリングしない', () => {
    render(<ConfirmDialog open={false} title="x" message="y" confirmLabel="削除する" cancelLabel="キャンセル" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByRole('button', { name: '削除する' })).toBeNull()
  })
})
