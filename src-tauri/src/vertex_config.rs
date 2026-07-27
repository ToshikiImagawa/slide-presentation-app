//! Vertex AI 生成の設定保管（#14・内蔵 Vertex 生成）。
//!
//! project_id / region / model は秘密ではないため plugin-store に平文保存する（keyring は使わない）。
//! GCP アクセストークンは `generation::gcp_auth` が ADC から都度取得・キャッシュするため、本モジュールは
//! 「どのプロジェクト/リージョン/モデルへ投げるか」の設定のみを扱う（トークン自体は保存しない）。

use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

/// 設定を並置する plugin-store のパス。
const CONFIG_STORE_PATH: &str = "ai-vertex-config.json";
/// 設定オブジェクトのキー。
const CONFIG_KEY: &str = "vertexConfig";

/// Vertex AI 生成の設定（TS `VertexConfig` と camelCase で一致）。
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct VertexConfig {
  /// GCP プロジェクト ID
  pub project_id: String,
  /// リージョン（`global` またはリージョン名。ホスト名の分岐に使う）
  pub region: String,
  /// Vertex のモデル ID（`@date` 付き。例 `claude-sonnet-4-5@20250929`）
  pub model: String,
}

impl VertexConfig {
  /// 3 項目すべて非空なら設定済み（事前ゲートの判定）。
  pub fn is_complete(&self) -> bool {
    !self.project_id.trim().is_empty()
      && !self.region.trim().is_empty()
      && !self.model.trim().is_empty()
  }
}

/// 事前ゲート用の設定状態（TS `VertexStatus` と一致・生値は含めない）。
#[derive(Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VertexStatus {
  pub configured: bool,
}

/// 設定（有無）から状態を組み立てる純関数（テスト対象）。
pub fn status_from_config(config: Option<&VertexConfig>) -> VertexStatus {
  VertexStatus {
    configured: config.map(|c| c.is_complete()).unwrap_or(false),
  }
}

/// 入力設定を検証する（3 項目すべて必須。半端な設定を保存しない）。純関数・テスト対象。
pub fn validate(config: &VertexConfig) -> Result<(), String> {
  if config.is_complete() {
    Ok(())
  } else {
    Err("project ID・region・model をすべて入力してください".to_string())
  }
}

/// Vertex 設定を plugin-store へ保存する（非秘密・平文）。
pub fn set_vertex_config(app: &tauri::AppHandle, config: VertexConfig) -> Result<(), String> {
  validate(&config)?;
  let store = app.store(CONFIG_STORE_PATH).map_err(|e| e.to_string())?;
  store.set(
    CONFIG_KEY,
    serde_json::to_value(&config).map_err(|e| e.to_string())?,
  );
  store.save().map_err(|e| e.to_string())
}

/// Vertex 設定を取得する（未設定・不正は `None`）。フォームのプリフィルと生成実行の双方で使う。
pub fn get_vertex_config(app: &tauri::AppHandle) -> Result<Option<VertexConfig>, String> {
  let store = app.store(CONFIG_STORE_PATH).map_err(|e| e.to_string())?;
  Ok(
    store
      .get(CONFIG_KEY)
      .and_then(|v| serde_json::from_value::<VertexConfig>(v).ok()),
  )
}

/// 事前ゲート表示用に設定状態のみ返す（生値を返さない）。
pub fn vertex_status(app: &tauri::AppHandle) -> Result<VertexStatus, String> {
  let config = get_vertex_config(app)?;
  Ok(status_from_config(config.as_ref()))
}

/// Vertex 設定を消去する。
pub fn clear_vertex_config(app: &tauri::AppHandle) -> Result<(), String> {
  let store = app.store(CONFIG_STORE_PATH).map_err(|e| e.to_string())?;
  store.delete(CONFIG_KEY);
  store.save().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn cfg(project: &str, region: &str, model: &str) -> VertexConfig {
    VertexConfig {
      project_id: project.to_string(),
      region: region.to_string(),
      model: model.to_string(),
    }
  }

  #[test]
  fn is_complete_requires_all_three_non_empty() {
    assert!(cfg("p", "us-east5", "claude-sonnet-4-5@20250929").is_complete());
    assert!(!cfg("", "us-east5", "m").is_complete());
    assert!(!cfg("p", "  ", "m").is_complete());
    assert!(!cfg("p", "r", "").is_complete());
  }

  #[test]
  fn validate_rejects_incomplete() {
    assert!(validate(&cfg("p", "r", "m")).is_ok());
    assert!(validate(&cfg("p", "", "m")).is_err());
  }

  #[test]
  fn status_from_config_reflects_completeness() {
    assert!(status_from_config(Some(&cfg("p", "r", "m"))).configured);
    assert!(!status_from_config(Some(&cfg("p", "", "m"))).configured);
    assert!(!status_from_config(None).configured);
  }

  #[test]
  fn vertex_config_serializes_to_camel_case() {
    let json = serde_json::to_string(&cfg("proj", "global", "claude-opus-4-1@20250805")).unwrap();
    assert!(json.contains("\"projectId\":\"proj\""));
    assert!(json.contains("\"region\":\"global\""));
    assert!(json.contains("\"model\":\"claude-opus-4-1@20250805\""));
    // VertexStatus は configured のみ
    assert_eq!(
      serde_json::to_string(&status_from_config(None)).unwrap(),
      r#"{"configured":false}"#
    );
  }
}
