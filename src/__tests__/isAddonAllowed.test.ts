import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tauri プラグイン依存をモックする。store はテスト内で読み書きを観測できるよう共有 Map で実装する。
const h = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  ask: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get = async (key: string) => h.data.get(key)
    set = async (key: string, value: unknown) => {
      h.data.set(key, value)
    }
    save = async () => {}
  },
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: h.ask, message: vi.fn(), open: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://localhost/${p}`, invoke: vi.fn() }))
vi.mock('@tauri-apps/api/path', () => ({ dirname: vi.fn() }))

import { isAddonAllowed, setEmbeddedAddonsDisabled, resetAddonTrust } from '../localSlideLoader'

const PATH = '/packages/demo.tgz'

describe('isAddonAllowed', () => {
  beforeEach(() => {
    h.data.clear()
    h.ask.mockReset()
  })

  it('許可済み（addonTrust=allowed）はダイアログを出さず true', async () => {
    h.data.set('addonTrust', { [PATH]: 'allowed' })
    await expect(isAddonAllowed(PATH)).resolves.toBe(true)
    expect(h.ask).not.toHaveBeenCalled()
  })

  it('拒否済み（addonTrust=denied）はダイアログを出さず false', async () => {
    h.data.set('addonTrust', { [PATH]: 'denied' })
    await expect(isAddonAllowed(PATH)).resolves.toBe(false)
    expect(h.ask).not.toHaveBeenCalled()
  })

  it('一律無効化が ON なら判断に関わらずダイアログなしで false', async () => {
    await setEmbeddedAddonsDisabled(true)
    h.data.set('addonTrust', { [PATH]: 'allowed' }) // 許可済みでも無効化が優先
    await expect(isAddonAllowed(PATH)).resolves.toBe(false)
    expect(h.ask).not.toHaveBeenCalled()
  })

  it('未判断で有効化を選ぶと true になり allowed が永続化される', async () => {
    h.ask.mockResolvedValue(true)
    await expect(isAddonAllowed(PATH)).resolves.toBe(true)
    expect(h.ask).toHaveBeenCalledOnce()
    expect((h.data.get('addonTrust') as Record<string, string>)[PATH]).toBe('allowed')
  })

  it('未判断で拒否を選ぶと false になり denied が永続化される（既定拒否）', async () => {
    h.ask.mockResolvedValue(false)
    await expect(isAddonAllowed(PATH)).resolves.toBe(false)
    expect((h.data.get('addonTrust') as Record<string, string>)[PATH]).toBe('denied')
  })

  it('一度判断すると次回は再確認しない', async () => {
    h.ask.mockResolvedValue(true)
    await isAddonAllowed(PATH)
    h.ask.mockClear()
    await expect(isAddonAllowed(PATH)).resolves.toBe(true)
    expect(h.ask).not.toHaveBeenCalled()
  })

  it('resetAddonTrust で判断が失効し、再度ダイアログが出る', async () => {
    h.data.set('addonTrust', { [PATH]: 'allowed' })
    await resetAddonTrust()
    h.ask.mockResolvedValue(false)
    await expect(isAddonAllowed(PATH)).resolves.toBe(false)
    expect(h.ask).toHaveBeenCalledOnce()
  })
})
