//! 外部生成（Claude Code CLI）へ渡す環境変数の設定保管（#152）。
//!
//! `CLAUDE_CONFIG_DIR` 等は秘密ではないため plugin-store に平文保存する（`vertex_config.rs` と同じパターン）。
//! GUI 起動の Tauri アプリはシェルプロファイル経由の環境変数を継承しないことがあるため、
//! キー・バリューのペア列として保持し `generation::claude_cli::run_cli()` がサブプロセス起動時に明示的に注入する。

use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

/// 設定を並置する plugin-store のパス。
const CONFIG_STORE_PATH: &str = "ai-claude-cli-config.json";
/// 設定オブジェクトのキー。
const CONFIG_KEY: &str = "claudeCliConfig";

/// 環境変数 1 件（TS の `ClaudeCliEnvVar` と camelCase で一致）。
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliEnvVar {
  pub key: String,
  pub value: String,
}

/// 外部 CLI（Claude Code CLI）へ渡す環境変数の設定（TS `ClaudeCliConfig` と camelCase で一致）。
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliConfig {
  pub env_vars: Vec<ClaudeCliEnvVar>,
}

impl ClaudeCliConfig {
  /// UI の未入力行（キー空）を除き、キー・値を trim した有効なペアのみ返す（サブプロセス注入用）。
  pub fn sanitized_pairs(&self) -> Vec<(String, String)> {
    self
      .env_vars
      .iter()
      .filter_map(|entry| {
        let key = entry.key.trim();
        if key.is_empty() {
          None
        } else {
          Some((key.to_string(), entry.value.trim().to_string()))
        }
      })
      .collect()
  }
}

/// Claude CLI 環境変数設定を plugin-store へ保存する（非秘密・平文）。
pub fn set_claude_cli_config(
  app: &tauri::AppHandle,
  config: ClaudeCliConfig,
) -> Result<(), String> {
  let store = app.store(CONFIG_STORE_PATH).map_err(|e| e.to_string())?;
  store.set(
    CONFIG_KEY,
    serde_json::to_value(&config).map_err(|e| e.to_string())?,
  );
  store.save().map_err(|e| e.to_string())
}

/// Claude CLI 環境変数設定を取得する（未設定・不正は `None`）。フォームのプリフィルと生成実行の双方で使う。
pub fn get_claude_cli_config(app: &tauri::AppHandle) -> Result<Option<ClaudeCliConfig>, String> {
  let store = app.store(CONFIG_STORE_PATH).map_err(|e| e.to_string())?;
  Ok(
    store
      .get(CONFIG_KEY)
      .and_then(|v| serde_json::from_value::<ClaudeCliConfig>(v).ok()),
  )
}

/// Claude CLI 環境変数設定を消去する。
pub fn clear_claude_cli_config(app: &tauri::AppHandle) -> Result<(), String> {
  let store = app.store(CONFIG_STORE_PATH).map_err(|e| e.to_string())?;
  store.delete(CONFIG_KEY);
  store.save().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn entry(key: &str, value: &str) -> ClaudeCliEnvVar {
    ClaudeCliEnvVar {
      key: key.to_string(),
      value: value.to_string(),
    }
  }

  #[test]
  fn sanitized_pairs_trims_and_drops_empty_keys() {
    let config = ClaudeCliConfig {
      env_vars: vec![
        entry(" CLAUDE_CONFIG_DIR ", " /tmp/x "),
        entry("", "ignored"),
        entry("   ", "ignored"),
      ],
    };
    assert_eq!(
      config.sanitized_pairs(),
      vec![("CLAUDE_CONFIG_DIR".to_string(), "/tmp/x".to_string())]
    );
  }

  #[test]
  fn sanitized_pairs_empty_for_default() {
    assert!(ClaudeCliConfig::default().sanitized_pairs().is_empty());
  }

  #[test]
  fn claude_cli_config_serializes_to_camel_case() {
    let config = ClaudeCliConfig {
      env_vars: vec![entry("CLAUDE_CONFIG_DIR", "/tmp/x")],
    };
    let json = serde_json::to_string(&config).unwrap();
    assert!(json.contains("\"envVars\""));
    assert!(json.contains("\"key\":\"CLAUDE_CONFIG_DIR\""));
    assert!(json.contains("\"value\":\"/tmp/x\""));
  }
}
