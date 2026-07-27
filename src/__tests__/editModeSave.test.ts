import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ invoke: vi.fn(), save: vi.fn(), open: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: h.save, open: h.open }))

import { enterEditMode, exitEditMode, saveSlidesJson, exportSlidePackage, chooseExportDir, listBuiltinAddons, addBuiltinAddon, removeBuiltinAddon } from '../editModeSave'

describe('editModeSave', () => {
  beforeEach(() => {
    h.invoke.mockReset()
    h.save.mockReset()
    h.open.mockReset()
  })

  it('enterEditMode / exitEditMode は set_edit_mode を enabled 付きで呼ぶ', async () => {
    await enterEditMode()
    expect(h.invoke).toHaveBeenCalledWith('set_edit_mode', { enabled: true })
    await exitEditMode()
    expect(h.invoke).toHaveBeenCalledWith('set_edit_mode', { enabled: false })
  })

  it('saveSlidesJson は save_slides_json を path/json で呼ぶ', async () => {
    await saveSlidesJson('/tmp/slides.json', '{}')
    expect(h.invoke).toHaveBeenCalledWith('save_slides_json', { path: '/tmp/slides.json', json: '{}' })
  })

  it('exportSlidePackage は camelCase 引数で export_slide_package を呼び、既定値を補完する', async () => {
    h.invoke.mockResolvedValue('/out/slides-demo-1.0.0.tgz')

    const result = await exportSlidePackage('{}', { outDir: '/out', name: 'demo', version: '1.0.0' })

    expect(h.invoke).toHaveBeenCalledWith('export_slide_package', {
      json: '{}',
      outDir: '/out',
      baseDir: '',
      name: 'demo',
      version: '1.0.0',
      includedAddons: [],
    })
    expect(result).toBe('/out/slides-demo-1.0.0.tgz')
  })

  it('chooseExportDir はキャンセル（文字列以外）を null にする', async () => {
    h.open.mockResolvedValue(null)
    expect(await chooseExportDir()).toBeNull()

    h.open.mockResolvedValue('/chosen/dir')
    expect(await chooseExportDir()).toBe('/chosen/dir')
  })

  it('listBuiltinAddons / addBuiltinAddon / removeBuiltinAddon が対応コマンドを呼ぶ（層A）', async () => {
    h.invoke.mockResolvedValue(['a', 'b'])
    await expect(listBuiltinAddons()).resolves.toEqual(['a', 'b'])
    expect(h.invoke).toHaveBeenCalledWith('list_builtin_addons')

    h.invoke.mockResolvedValue(undefined)
    await addBuiltinAddon('my-addon')
    expect(h.invoke).toHaveBeenCalledWith('add_builtin_addon', { name: 'my-addon' })

    await removeBuiltinAddon('my-addon')
    expect(h.invoke).toHaveBeenCalledWith('remove_builtin_addon', { name: 'my-addon' })
  })
})
