//! API キー保管（#14）— keyring（OS キーチェーン）二層保管。
//!
//! 秘密本体（Anthropic API キー）は keyring に、メタデータ（`configured` / `last_updated`）は
//! plugin-store に並置する（ticketvc `token_store.rs` / `credential_default_repository.rs` の二層パターン）。
//! これにより `has_api_key` は keyring に触れずメタデータのみで状態を返せ、
//! 「生成無効時はキーチェーンへ到達しない」（NFR-003）と事前ゲート表示（FR-007）を両立する。
//!
//! - fail-closed: 保管失敗時に平文/base64 へフォールバックしない（失敗はエラーで返す・NFR-003）。
//! - 生値非開放: 生値を返す JS コマンドを作らない。`load_api_key` は crate 内部限定で HTTP ヘッダ付与にのみ使う。
//!
//! keyring/plugin-store への実 I/O を伴う関数（`set_api_key` 等）は OS 資源に依存するため、
//! 単体テストでは純粋ロジック（`validate_api_key` / `status_from_metadata` / `MaskedSecret`）を検証し、
//! 実結線は手動検証（tasks 4.5・実機 macOS）に委ねる（#13 の純粋関数テスト方針を踏襲）。

use secrecy::SecretString;
use tauri_plugin_store::StoreExt;

/// keyring のサービス名（アプリ識別子に一致させる）。
const KEYRING_SERVICE: &str = "com.toshikiimagawa.slide-presentation-app";
/// keyring のアカウント名（本アプリが保管する秘密は Anthropic API キーの単一エントリ）。
const KEYRING_ACCOUNT: &str = "anthropic-api-key";
/// メタデータ（非秘密）を並置する plugin-store のパス。
const METADATA_STORE_PATH: &str = "ai-credential-state.json";
/// メタデータのキー: キー登録済みか。
const META_KEY_CONFIGURED: &str = "configured";
/// メタデータのキー: 最終更新日時（RFC3339）。
const META_KEY_LAST_UPDATED: &str = "lastUpdated";

/// API キー保管のエラー（UI へは `to_string()` で返す。生値・内部秘密は含めない）。
#[derive(Debug)]
pub enum CredentialError {
  /// キー未登録（`load_api_key` で keyring にエントリが無い）。
  NotConfigured,
  /// 入力キーが不正（空など）。
  Invalid(String),
  /// keyring 操作の失敗（fail-closed。フォールバックしない）。
  Keyring(String),
  /// メタデータストア操作の失敗。
  Store(String),
}

impl std::fmt::Display for CredentialError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      CredentialError::NotConfigured => write!(f, "API キーが登録されていません"),
      CredentialError::Invalid(msg) => write!(f, "API キーが不正です: {msg}"),
      CredentialError::Keyring(msg) => {
        write!(f, "キーチェーン操作に失敗しました: {msg}")
      }
      CredentialError::Store(msg) => write!(f, "設定ストアの操作に失敗しました: {msg}"),
    }
  }
}

impl std::error::Error for CredentialError {}

/// API キーの登録状態（生値は返さない。FR-006 / NFR-003）。TS `ApiKeyStatus` と一致。
#[derive(serde::Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
  /// キーが登録済みか。
  pub configured: bool,
  /// 最終更新日時（未登録なら省略し `null` を出さない＝TS `lastUpdated?: string` と一致）。
  #[serde(skip_serializing_if = "Option::is_none")]
  pub last_updated: Option<String>,
}

/// ログ・エラー・`Debug` に生値を出さないためのマスクラッパ（長さのみ露出）。
/// ticketvc `MaskedSecret` 相当。Phase 3 の生成ログで秘密を含む文字列を包む用途に使う。
pub struct MaskedSecret<'a>(pub &'a str);

impl std::fmt::Debug for MaskedSecret<'_> {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    if self.0.is_empty() {
      write!(f, "\"\"")
    } else {
      write!(f, "\"<{}B masked>\"", self.0.len())
    }
  }
}

impl std::fmt::Display for MaskedSecret<'_> {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "<masked>")
  }
}

// ---- 純粋ロジック（単体テスト対象・OS 資源に触れない） ----

/// 入力 API キーを検証する（空・空白のみを拒否）。保管前に必ず通す。
pub fn validate_api_key(key: &str) -> Result<(), CredentialError> {
  if key.trim().is_empty() {
    return Err(CredentialError::Invalid(
      "空のキーは登録できません".to_string(),
    ));
  }
  Ok(())
}

/// メタデータ（configured / last_updated）から `ApiKeyStatus` を組み立てる純関数。
/// keyring に触れずメタデータのみで状態を返す（NFR-003）。未登録時は last_updated を握り潰す。
pub fn status_from_metadata(configured: bool, last_updated: Option<String>) -> ApiKeyStatus {
  ApiKeyStatus {
    configured,
    // 未登録なら最終更新日時は返さない（stale なメタデータの露出を防ぐ）
    last_updated: if configured { last_updated } else { None },
  }
}

/// 現在時刻を RFC3339 で返す（メタデータ last_updated 用）。
fn now_rfc3339() -> String {
  time::OffsetDateTime::now_utc()
    .format(&time::format_description::well_known::Rfc3339)
    .unwrap_or_default()
}

// ---- keyring / plugin-store への実 I/O を伴うラッパ（手動検証・tasks 4.5） ----

/// API キーを OS キーチェーンへ保管し、メタデータ（configured=true / last_updated=now）を更新する。
/// keyring 保管に失敗した場合はフォールバックせずエラーを返す（fail-closed・NFR-003）。
pub fn set_api_key(app: &tauri::AppHandle, key: &str) -> Result<(), CredentialError> {
  validate_api_key(key)?;

  let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
    .map_err(|e| CredentialError::Keyring(e.to_string()))?;
  entry
    .set_password(key)
    .map_err(|e| CredentialError::Keyring(e.to_string()))?;

  // 保管成功後にメタデータを更新（keyring とストアを必ず一致させる）。
  // keyring 保管は成功済みのため、ストア操作が失敗したら keyring を best-effort でロールバックし、
  // 孤児シークレット（keychain に残るがメタデータ上は未登録）を残さない。
  let store = match app.store(METADATA_STORE_PATH) {
    Ok(store) => store,
    Err(e) => {
      let _ = entry.delete_credential();
      return Err(CredentialError::Store(e.to_string()));
    }
  };
  store.set(META_KEY_CONFIGURED, serde_json::Value::Bool(true));
  store.set(
    META_KEY_LAST_UPDATED,
    serde_json::Value::String(now_rfc3339()),
  );
  if let Err(e) = store.save() {
    let _ = entry.delete_credential();
    return Err(CredentialError::Store(e.to_string()));
  }
  // 監査ログ（生値は出さず長さのみ・NFR-003）
  log::debug!("API キーを保管しました: {:?}", MaskedSecret(key));
  Ok(())
}

/// API キーを削除する（keyring エントリ削除＋メタデータ消去）。冪等（未登録でも成功扱い）。
pub fn delete_api_key(app: &tauri::AppHandle) -> Result<(), CredentialError> {
  match keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
    Ok(entry) => match entry.delete_credential() {
      Ok(()) | Err(keyring::Error::NoEntry) => {}
      Err(e) => return Err(CredentialError::Keyring(e.to_string())),
    },
    Err(e) => return Err(CredentialError::Keyring(e.to_string())),
  }

  // keyring 削除後にメタデータを消去（順序を保ち「メタデータのみ残る」不整合を避ける）
  let store = app
    .store(METADATA_STORE_PATH)
    .map_err(|e| CredentialError::Store(e.to_string()))?;
  store.set(META_KEY_CONFIGURED, serde_json::Value::Bool(false));
  store.delete(META_KEY_LAST_UPDATED);
  store
    .save()
    .map_err(|e| CredentialError::Store(e.to_string()))?;
  Ok(())
}

/// キー登録状態のみ返す（メタデータのみ読み keyring に触れない・生値を返さない・NFR-003）。
/// 事前ゲート表示のため生成無効時でも呼べる。
pub fn has_api_key(app: &tauri::AppHandle) -> Result<ApiKeyStatus, CredentialError> {
  let store = app
    .store(METADATA_STORE_PATH)
    .map_err(|e| CredentialError::Store(e.to_string()))?;
  let configured = store
    .get(META_KEY_CONFIGURED)
    .and_then(|v| v.as_bool())
    .unwrap_or(false);
  let last_updated = store
    .get(META_KEY_LAST_UPDATED)
    .and_then(|v| v.as_str().map(|s| s.to_string()));
  Ok(status_from_metadata(configured, last_updated))
}

/// keyring から API キーを取得する（crate 内部限定・生成実行時の HTTP ヘッダ付与にのみ使用）。
/// エントリが無い/取得失敗は fail-closed でエラーを返す（平文フォールバックしない）。
pub(crate) fn load_api_key(_app: &tauri::AppHandle) -> Result<SecretString, CredentialError> {
  let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
    .map_err(|e| CredentialError::Keyring(e.to_string()))?;
  match entry.get_password() {
    Ok(password) => Ok(SecretString::from(password)),
    Err(keyring::Error::NoEntry) => Err(CredentialError::NotConfigured),
    Err(e) => Err(CredentialError::Keyring(e.to_string())),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn validate_api_key_rejects_empty_and_whitespace() {
    assert!(validate_api_key("").is_err());
    assert!(validate_api_key("   ").is_err());
    assert!(validate_api_key("\t\n").is_err());
    assert!(validate_api_key("sk-ant-xxxx").is_ok());
  }

  #[test]
  fn status_from_metadata_keeps_timestamp_only_when_configured() {
    // 登録済みなら last_updated を保持
    let s = status_from_metadata(true, Some("2026-07-25T00:00:00Z".to_string()));
    assert!(s.configured);
    assert_eq!(s.last_updated.as_deref(), Some("2026-07-25T00:00:00Z"));

    // 未登録なら configured=false かつ last_updated は握り潰す（stale 露出防止）
    let s = status_from_metadata(false, Some("2026-07-25T00:00:00Z".to_string()));
    assert!(!s.configured);
    assert!(s.last_updated.is_none());

    let s = status_from_metadata(false, None);
    assert!(!s.configured);
    assert!(s.last_updated.is_none());
  }

  #[test]
  fn api_key_status_serializes_to_camel_case_and_omits_null() {
    // 未登録: lastUpdated キー自体を出さない（TS lastUpdated?: string と一致）
    let json = serde_json::to_string(&status_from_metadata(false, None)).unwrap();
    assert_eq!(json, r#"{"configured":false}"#);

    // 登録済み: camelCase の lastUpdated を出す
    let json = serde_json::to_string(&status_from_metadata(
      true,
      Some("2026-07-25T00:00:00Z".to_string()),
    ))
    .unwrap();
    assert_eq!(
      json,
      r#"{"configured":true,"lastUpdated":"2026-07-25T00:00:00Z"}"#
    );
  }

  #[test]
  fn masked_secret_hides_value_and_shows_length_only() {
    let secret = "sk-ant-super-secret-key";
    let debug = format!("{:?}", MaskedSecret(secret));
    // 生値を一切含まず、長さのみ露出する
    assert!(!debug.contains(secret));
    assert!(!debug.contains("sk-ant"));
    assert_eq!(debug, format!("\"<{}B masked>\"", secret.len()));
    // Display は固定文言（長さも出さない）
    assert_eq!(format!("{}", MaskedSecret(secret)), "<masked>");
    // 空はそのまま空表示
    assert_eq!(format!("{:?}", MaskedSecret("")), "\"\"");
  }

  #[test]
  fn now_rfc3339_is_non_empty_and_utc() {
    let now = now_rfc3339();
    assert!(!now.is_empty());
    // RFC3339 の UTC は末尾 Z（time の Rfc3339 well-known）
    assert!(now.ends_with('Z'), "RFC3339 UTC: {now}");
  }
}
