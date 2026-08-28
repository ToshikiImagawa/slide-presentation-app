//! OSネイティブメニューへの「更新を確認」項目の追加（#121 follow-up）。
//!
//! 設定画面のボタン（`useUpdateCheck.checkForUpdateManually`）と同じ入口をOSの規約に沿った場所にも
//! 用意する: macOS はアプリ名メニュー内 About の直後、Windows/Linux は Help メニュー内 About の前
//! （`tauri::menu::Menu::default` が生成する既定メニューへの追記。カスタムメニューを一から組まない）。

use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::{AppHandle, Emitter, Runtime};

/// メニュー項目の id（クリック判定に使う。ラベルの変更に影響されない）。
const CHECK_FOR_UPDATES_MENU_ID: &str = "check-for-updates";
/// クリックをフロントへ伝えるイベント名（`open-slide-package` と同じ Rust→JS 通知パターン）。
pub const CHECK_FOR_UPDATES_EVENT: &str = "check-for-updates-requested";

/// 既定メニュー（`Menu::default`）に「Check for Updates…」を追記したメニューを組み立てる。
/// ラベルはOSネイティブメニューのため多言語化せず英語固定（`Menu::default` 自体の
/// "Window"/"Edit" 等と同様の扱い）。
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
  let menu = Menu::default(app)?;
  let check_for_updates = MenuItem::with_id(
    app,
    CHECK_FOR_UPDATES_MENU_ID,
    "Check for Updates…",
    true,
    None::<&str>,
  )?;
  let items = menu.items()?;

  #[cfg(target_os = "macos")]
  if let Some(app_submenu) = items.first().and_then(MenuItemKind::as_submenu) {
    app_submenu.insert(&PredefinedMenuItem::separator(app)?, 1)?;
    app_submenu.insert(&check_for_updates, 2)?;
  }

  #[cfg(not(target_os = "macos"))]
  if let Some(help_submenu) = items
    .iter()
    .find(|item| item.id().as_ref() == tauri::menu::HELP_SUBMENU_ID)
    .and_then(MenuItemKind::as_submenu)
  {
    help_submenu.insert(&check_for_updates, 0)?;
    help_submenu.insert(&PredefinedMenuItem::separator(app)?, 1)?;
  }

  Ok(menu)
}

/// メニューイベントを受け取り、「Check for Updates…」がクリックされたらフロントへ通知する。
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
  if event.id().as_ref() == CHECK_FOR_UPDATES_MENU_ID {
    let _ = app.emit(CHECK_FOR_UPDATES_EVENT, ());
  }
}
