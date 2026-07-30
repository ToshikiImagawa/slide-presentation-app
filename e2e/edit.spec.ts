import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { expected, openEditor, slide, slideTitle } from './fixtures'

/**
 * 編集画面（SlideEditor）の e2e。
 *
 * 保存・.spkg 書き出し・組み込みアドオン操作は Rust コマンド（invoke）に依存し、
 * screenshot モードには実 Tauri バックエンドがないため検証できない（実 WebView 前提の
 * WebdriverIO ルート・e2e/README.md 参照）。ここでは invoke を経由しない
 * クライアント側ロジック（JSON⇔フォーム⇔プレビュー同期・検証・終了確認等）のみを対象にする。
 */

/** JSON エディタ（CodeMirror）の先頭にカーソルを置く。先頭行をクリックしてフォーカスし、
 * Home で行頭（＝文書冒頭）へ移動する。座標計算に依存しないため見た目の変更に影響されない */
async function clickJsonEditorStart(page: Page) {
  await page.getByTestId('slide-editor').locator('.cm-content .cm-line').first().click()
  await page.keyboard.press('Home')
}

/** 未保存の変更を作り、編集終了ボタンから確認ダイアログを開く */
async function openExitConfirmDialog(page: Page, editor: Locator, ui: any): Promise<Locator> {
  await editor.getByRole('textbox', { name: ui.edit.metaTitle }).fill('未保存タイトル')
  await editor.getByRole('button', { name: ui.edit.exit, exact: true }).click()
  const dialog = page.getByTestId('confirm-dialog')
  await expect(dialog).toContainText(ui.edit.exitConfirmTitle)
  return dialog
}

test.describe('編集画面 (SlideEditor)', () => {
  test('サンプルを開いて編集ボタンから入場すると、先頭スライドのプレビューが描画される', async ({ page }, testInfo) => {
    const cover = slideTitle(slide(testInfo.project.name, 'cover'))
    await openEditor(page)

    await expect(page.getByTestId('slide-editor').locator('.reveal')).toContainText(cover)
  })

  test('検索・置換で JSON を書き換えると、フォームとライブプレビューへ反映される', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const cover = slideTitle(slide(testInfo.project.name, 'cover'))
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    await editor.getByRole('button', { name: ui.edit.searchOpen }).click()
    await editor.getByPlaceholder(ui.edit.searchPlaceholder, { exact: true }).fill(cover)
    await editor.getByRole('button', { name: ui.edit.searchToggleReplace }).click()
    await editor.getByPlaceholder(ui.edit.searchReplacePlaceholder, { exact: true }).fill(`${cover} EDITED`)
    await editor.getByRole('button', { name: ui.edit.searchReplaceAll }).click()

    await expect(editor.locator('.reveal')).toContainText(`${cover} EDITED`)
    await expect(editor.getByRole('textbox', { name: ui.edit.metaTitle })).toHaveValue(`${cover} EDITED`)
  })

  test('メタ情報フォームでタイトルを変更すると、JSON テキストへ反映される', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    await editor.getByRole('textbox', { name: ui.edit.metaTitle }).fill('フォーム編集タイトル E2E')

    await expect(editor.locator('.cm-content')).toContainText('フォーム編集タイトル E2E')
  })

  test('JSON に構文エラーがあるとプレビューが非表示になりフォーム編集が無効になる', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    await clickJsonEditorStart(page)
    await page.keyboard.type('X')

    await expect(editor.getByText(ui.edit.formDisabled)).toBeVisible()
    await expect(editor.locator('.reveal')).toHaveCount(0)
  })

  test('構文エラーを解消すると、プレビューとフォームが復帰する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const cover = slideTitle(slide(testInfo.project.name, 'cover'))
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    await clickJsonEditorStart(page)
    await page.keyboard.type('X')
    await expect(editor.getByText(ui.edit.formDisabled)).toBeVisible()

    await page.keyboard.press('Backspace')

    await expect(editor.getByText(ui.edit.formDisabled)).toHaveCount(0)
    await expect(editor.locator('.reveal')).toContainText(cover)
  })

  test('プレビューの ‹ › でスライドを送り・戻りできる', async ({ page }, testInfo) => {
    const { slides } = expected(testInfo.project.name)
    const cover = slideTitle(slide(testInfo.project.name, 'cover'))
    const section = slideTitle(slide(testInfo.project.name, 'section'))
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    await expect(editor.getByText(`1 / ${slides.length}`, { exact: true })).toBeVisible()

    await editor.getByRole('button', { name: '›', exact: true }).click()
    await expect(editor.getByText(`2 / ${slides.length}`, { exact: true })).toBeVisible()
    await expect(editor.locator('.reveal')).toContainText(section)

    await editor.getByRole('button', { name: '‹', exact: true }).click()
    await expect(editor.getByText(`1 / ${slides.length}`, { exact: true })).toBeVisible()
    await expect(editor.locator('.reveal')).toContainText(cover)
  })

  test('先頭で ‹ が無効、末尾で › が無効になる', async ({ page }, testInfo) => {
    const { slides } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    const prev = editor.getByRole('button', { name: '‹', exact: true })
    const next = editor.getByRole('button', { name: '›', exact: true })
    await expect(prev).toBeDisabled()

    for (let i = 0; i < slides.length - 1; i++) await next.click()

    await expect(editor.getByText(`${slides.length} / ${slides.length}`, { exact: true })).toBeVisible()
    await expect(next).toBeDisabled()
    await expect(prev).not.toBeDisabled()
  })

  test('パッケージ名を空にすると書き出しがブロックされるが、保存は可能なまま', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    await editor.getByRole('textbox', { name: ui.edit.packageName }).fill('')

    await expect(editor.getByTestId('ErrorOutlineIcon')).toHaveCount(1)
    await expect(editor.getByRole('button', { name: ui.edit.export, exact: true })).toBeDisabled()
    await expect(editor.getByRole('button', { name: ui.edit.save, exact: true })).not.toBeDisabled()
  })

  test('パッケージ名に不正な文字を入れるとエラーが表示され、修正すると解消する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    const nameField = editor.getByRole('textbox', { name: ui.edit.packageName })
    await nameField.fill('Invalid Name!')
    await expect(editor.getByTestId('ErrorOutlineIcon')).toHaveCount(1)
    await expect(editor.getByRole('button', { name: ui.edit.export, exact: true })).toBeDisabled()

    await nameField.fill('valid-name')
    await expect(editor.getByTestId('ErrorOutlineIcon')).toHaveCount(0)
    await expect(editor.getByRole('button', { name: ui.edit.export, exact: true })).not.toBeDisabled()
  })

  test('バージョンを空・不正フォーマットにするとエラーが表示され、正しい形式で解消する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    const versionField = editor.getByRole('textbox', { name: ui.edit.version })
    await versionField.fill('')
    await expect(editor.getByText(ui.edit.versionRequired)).toBeVisible()

    await versionField.fill('1.0')
    await expect(editor.getByText(ui.edit.versionInvalid)).toBeVisible()

    await versionField.fill('1.0.0')
    await expect(editor.getByText(ui.edit.versionRequired)).toHaveCount(0)
    await expect(editor.getByText(ui.edit.versionInvalid)).toHaveCount(0)
  })

  test('同梱アドオンが 0 件のとき「同梱できるアドオンがありません」と表示される', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    await expect(editor.getByText(ui.edit.noAddons)).toBeVisible()
  })

  test('未保存の変更がある状態で編集を終了すると確認ダイアログが出て、キャンセルで編集画面に留まる', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    const dialog = await openExitConfirmDialog(page, editor, ui)
    await dialog.getByRole('button', { name: ui.edit.cancel, exact: true }).click()

    await expect(dialog).toHaveCount(0)
    await expect(editor).toBeVisible()
  })

  test('未保存の変更がある状態で編集を終了→破棄すると編集画面を抜ける', async ({ page }, testInfo) => {
    const { ui, slides } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    const dialog = await openExitConfirmDialog(page, editor, ui)
    await dialog.getByRole('button', { name: ui.edit.exitConfirmDiscard, exact: true }).click()

    await expect(page.getByTestId('slide-editor')).toHaveCount(0)
    await expect(page.locator('.reveal .slides section')).toHaveCount(slides.length)
  })

  test('未保存の変更がなければ、編集を終了しても確認なしで即終了する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    await openEditor(page)

    await page.getByTestId('slide-editor').getByRole('button', { name: ui.edit.exit, exact: true }).click()

    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
    await expect(page.getByTestId('slide-editor')).toHaveCount(0)
  })

  test('テキスト入力中の Esc は編集画面を終了しない', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    const titleField = editor.getByRole('textbox', { name: ui.edit.metaTitle })
    await titleField.fill('未保存タイトル')
    await titleField.press('Escape')

    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
    await expect(editor).toBeVisible()
  })

  test('フォーカスが無い状態の Esc は、未保存の変更があれば確認ダイアログを出す', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    await editor.getByRole('textbox', { name: ui.edit.metaTitle }).fill('未保存タイトル')
    // フォーカスをテキスト入力欄の外（ラベルテキスト）へ移す
    await editor.getByText(ui.edit.includeAddons, { exact: false }).click()
    await page.keyboard.press('Escape')

    const dialog = page.getByTestId('confirm-dialog')
    await expect(dialog).toContainText(ui.edit.exitConfirmTitle)
    await dialog.getByRole('button', { name: ui.edit.cancel, exact: true }).click()
    await expect(editor).toBeVisible()
  })

  test('フォーカスが無い状態の Esc は、未保存の変更がなければ即終了する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const editor = page.getByTestId('slide-editor')
    await openEditor(page)

    // フォーカスをテキスト入力欄の外（ラベルテキスト）へ移してから押す
    await editor.getByText(ui.edit.includeAddons, { exact: false }).click()
    await page.keyboard.press('Escape')

    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
    await expect(page.getByTestId('slide-editor')).toHaveCount(0)
  })
})
