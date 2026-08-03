//! ブランド取り込み確認ダイアログ（#168）の人の上書きを永続化する。
//!
//! テンプレートファイルのハッシュ（`brand::BrandProfile::template_hash`）をキーにすることで、
//! 同一テンプレートを別デッキ・別セッションで再取り込みしても上書きが再現される
//! （デッキ本体の JSON には保存しない・vertex_config.rs と同じ plugin-store パターン）。
//!
//! 上書きの内容（`BrandOverrides`）は TypeScript 側でしか解釈しないため、Rust 側は構造を持たない
//! JSON として素通しする（Rust に業務ロジックが無い値をこちら側の型として複製しない）。

use serde_json::Value;
use tauri_plugin_store::StoreExt;

/// 上書きを並置する plugin-store のパス。
const STORE_PATH: &str = "brand-overrides.json";

/// `template_hash` をキーに上書き（任意の JSON）を保存する。
pub fn save_brand_overrides(
  app: &tauri::AppHandle,
  template_hash: &str,
  overrides: Value,
) -> Result<(), String> {
  let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
  store.set(template_hash, overrides);
  store.save().map_err(|e| e.to_string())
}

/// `template_hash` に対応する上書きを取得する（未保存なら `None`）。
pub fn load_brand_overrides(
  app: &tauri::AppHandle,
  template_hash: &str,
) -> Result<Option<Value>, String> {
  let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
  Ok(store.get(template_hash))
}
