import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }))

import { checkForUpdate, installUpdate } from '../update'

describe('update', () => {
  beforeEach(() => {
    h.invoke.mockReset()
  })

  it('checkForUpdate は check_for_update を呼び、結果を返す', async () => {
    const info = { version: '2.1.0', currentVersion: '2.0.0', body: 'release notes' }
    h.invoke.mockResolvedValue(info)

    const result = await checkForUpdate()

    expect(h.invoke).toHaveBeenCalledWith('check_for_update')
    expect(result).toEqual(info)
  })

  it('checkForUpdate は更新がない場合 null を返す', async () => {
    h.invoke.mockResolvedValue(null)

    expect(await checkForUpdate()).toBeNull()
  })

  it('installUpdate は install_update を呼ぶ', async () => {
    h.invoke.mockResolvedValue(undefined)

    await installUpdate()

    expect(h.invoke).toHaveBeenCalledWith('install_update')
  })
})
