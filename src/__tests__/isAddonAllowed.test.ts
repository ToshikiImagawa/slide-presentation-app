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

import { isAddonAllowed, setEmbeddedAddonsDisabled, resetAddonTrust, setAddonTrustDecision, clearAddonTrustDecision, getAddonTrustMap } from '../localSlideLoader'

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

describe('setAddonTrustDecision / getAddonTrustMap（層C）', () => {
  beforeEach(() => {
    h.data.clear()
    h.ask.mockReset()
  })

  it('個別に allow/deny を設定でき、他 path の判断を保持する（read-modify-write）', async () => {
    h.data.set('addonTrust', { '/other.tgz': 'allowed' })

    await setAddonTrustDecision(PATH, 'denied')

    const map = h.data.get('addonTrust') as Record<string, string>
    expect(map[PATH]).toBe('denied')
    expect(map['/other.tgz']).toBe('allowed')
  })

  it('getAddonTrustMap は永続化されたマップを返す', async () => {
    await setAddonTrustDecision(PATH, 'allowed')
    await expect(getAddonTrustMap()).resolves.toEqual({ [PATH]: 'allowed' })
  })

  it('allowed を設定すると isAddonAllowed はダイアログなしで true（無効化 OFF 時）', async () => {
    await setAddonTrustDecision(PATH, 'allowed')

    await expect(isAddonAllowed(PATH)).resolves.toBe(true)
    expect(h.ask).not.toHaveBeenCalled()
  })

  it('個別 allow でも一律無効化 ON なら false（無効化が優先）', async () => {
    await setAddonTrustDecision(PATH, 'allowed')
    await setEmbeddedAddonsDisabled(true)

    await expect(isAddonAllowed(PATH)).resolves.toBe(false)
  })

  it('clearAddonTrustDecision は対象 path のみ未設定へ戻し、他 path は保持する', async () => {
    h.data.set('addonTrust', { [PATH]: 'allowed', '/other.tgz': 'denied' })

    await clearAddonTrustDecision(PATH)

    const map = h.data.get('addonTrust') as Record<string, string>
    expect(map[PATH]).toBeUndefined()
    expect(map['/other.tgz']).toBe('denied')
  })

  it('clearAddonTrustDecision 後は再びダイアログが出る（未設定＝既定拒否へ戻る）', async () => {
    await setAddonTrustDecision(PATH, 'allowed')
    await clearAddonTrustDecision(PATH)

    h.ask.mockResolvedValue(false)
    await expect(isAddonAllowed(PATH)).resolves.toBe(false)
    expect(h.ask).toHaveBeenCalledOnce()
  })

  it('間で await しない連続書き込みを直列化し、片方の判断を失わない（fire-and-forget 競合対策）', async () => {
    // 2件をほぼ同時に発火する（キューが無いと後着が先着の判断を上書きして失われる）
    const p1 = setAddonTrustDecision('/a.tgz', 'allowed')
    const p2 = setAddonTrustDecision('/b.tgz', 'denied')
    await Promise.all([p1, p2])

    const map = h.data.get('addonTrust') as Record<string, string>
    expect(map['/a.tgz']).toBe('allowed')
    expect(map['/b.tgz']).toBe('denied')
  })
})
