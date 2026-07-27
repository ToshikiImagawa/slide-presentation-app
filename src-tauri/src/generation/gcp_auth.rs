//! GCP ADC によるアクセストークン取得（#14・内蔵 Vertex 生成の認証）。
//!
//! GCP 認証クレートは使わず、`gcloud auth application-default login` が生成する ADC ファイルを読み、
//! `refresh_token` を Google の token エンドポイントへ投げて access_token を得る（`gcp_auth.rs` 流用）。
//! トークンは静的キャッシュに 55 分保持し、WebView には一切出さない（Rust 境界に閉じる・NFR-003）。

use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

/// Google OAuth2 トークンエンドポイント（refresh_token グラント）。
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// GCP アクセストークンの寿命は 60 分。5 分早めにリフレッシュする。
const TOKEN_TTL: Duration = Duration::from_secs(55 * 60);

/// アクセストークンのキャッシュ（値, 発行時刻）。ディスクには保存しない。
static TOKEN_CACHE: Mutex<Option<(String, Instant)>> = Mutex::const_new(None);

/// ADC ファイル（`application_default_credentials.json`）の `authorized_user` 型に必要なフィールド。
/// `type` の検証は `parse_adc` の先読みで済ませるため、ここには持たない（秘密フィールドのみ・Debug 非導出）。
#[derive(serde::Deserialize)]
struct AdcCredentials {
  client_id: String,
  client_secret: String,
  refresh_token: String,
}

#[derive(serde::Deserialize)]
struct TokenResponse {
  access_token: String,
}

/// GCP アクセストークンを取得する（55 分キャッシュ）。crate 内部限定・Vertex の `Authorization: Bearer` 付与にのみ使用。
pub(crate) async fn get_access_token(http_client: &reqwest::Client) -> Result<String, String> {
  {
    let cache = TOKEN_CACHE.lock().await;
    if let Some((ref token, issued_at)) = *cache {
      if issued_at.elapsed() < TOKEN_TTL {
        return Ok(token.clone());
      }
    }
  }
  let token = refresh_access_token(http_client).await?;
  {
    let mut cache = TOKEN_CACHE.lock().await;
    *cache = Some((token.clone(), Instant::now()));
  }
  Ok(token)
}

/// トークンキャッシュを破棄する（再ログイン後・401 検出時に呼ぶ）。
///
/// static キャッシュはプロセス存続中 55 分保持されるため、無効化経路がないと「別アカウントで再ログイン」
/// 「トークン失効」の後も古いトークンを返し続け、UI が案内する `gcloud auth application-default login` が
/// セッション内で効かない（アプリ再起動でしか復旧しない）。次回の `get_access_token` が ADC から取り直すよう捨てる。
pub(crate) async fn invalidate_token_cache() {
  let mut cache = TOKEN_CACHE.lock().await;
  *cache = None;
}

/// ADC ファイルを読み refresh_token グラントで access_token を得る。
async fn refresh_access_token(http_client: &reqwest::Client) -> Result<String, String> {
  let adc_path = adc_file_path()?;
  let content = tokio::fs::read_to_string(&adc_path).await.map_err(|e| {
    format!("GCP ADC ファイルの読み取りに失敗しました（{e}）。`gcloud auth application-default login` を実行してください")
  })?;
  let creds = parse_adc(&content)?;

  let resp = http_client
    .post(GOOGLE_TOKEN_URL)
    .form(&[
      ("client_id", creds.client_id.as_str()),
      ("client_secret", creds.client_secret.as_str()),
      ("refresh_token", creds.refresh_token.as_str()),
      ("grant_type", "refresh_token"),
    ])
    .send()
    .await
    .map_err(|e| format!("GCP トークン取得に失敗しました: {e}"))?;

  if !resp.status().is_success() {
    return Err("GCP トークン取得に失敗しました。`gcloud auth application-default login` を再実行してください".to_string());
  }

  let token: TokenResponse = resp
    .json()
    .await
    .map_err(|e| format!("GCP トークンレスポンスのパースに失敗しました: {e}"))?;
  Ok(token.access_token)
}

/// ADC JSON をパースし `authorized_user` 型を検証する（純関数・テスト対象）。
///
/// まず `type` だけを緩く先読みし、サービスアカウント鍵（`type=service_account`）など未対応の資格情報を
/// 原因と対処が分かる文言で弾く。サービスアカウント鍵は `client_secret`/`refresh_token` を持たないため、
/// 先に `AdcCredentials` へ直接デシリアライズすると「必須フィールド欠落」の汎用 serde エラーになり、
/// `GOOGLE_APPLICATION_CREDENTIALS` が SA 鍵を指す一般的な dev 環境で復旧手順が伝わらない。
fn parse_adc(content: &str) -> Result<AdcCredentials, String> {
  #[derive(serde::Deserialize)]
  struct AdcType {
    #[serde(rename = "type")]
    credential_type: Option<String>,
  }
  let probe: AdcType = serde_json::from_str(content)
    .map_err(|e| format!("GCP ADC ファイルのパースに失敗しました: {e}"))?;
  match probe.credential_type.as_deref() {
    Some("authorized_user") => {}
    Some("service_account") => {
      return Err(
        "GOOGLE_APPLICATION_CREDENTIALS が指すのはサービスアカウント鍵（type=service_account）です。本アプリはユーザー認証（authorized_user）のみ対応します。`gcloud auth application-default login` でユーザー認証を作成するか、環境変数 GOOGLE_APPLICATION_CREDENTIALS を解除してください".to_string(),
      );
    }
    Some(other) => {
      return Err(format!(
        "未対応の GCP 認証タイプです（type={other}）。`gcloud auth application-default login` を実行してください"
      ));
    }
    None => {
      return Err(
        "GCP ADC ファイルに type フィールドがありません。`gcloud auth application-default login` を実行してください".to_string(),
      );
    }
  }
  serde_json::from_str::<AdcCredentials>(content).map_err(|e| {
    format!("GCP ADC ファイルのパースに失敗しました（必須フィールド欠落の可能性）: {e}")
  })
}

/// ADC ファイルのパスを解決する（純関数・テスト対象）。
/// `$GOOGLE_APPLICATION_CREDENTIALS` があれば優先、なければ `{config_dir}/gcloud/application_default_credentials.json`。
fn adc_file_path() -> Result<PathBuf, String> {
  if let Some(path) = std::env::var_os("GOOGLE_APPLICATION_CREDENTIALS") {
    return Ok(PathBuf::from(path));
  }
  let config_dir = gcloud_config_dir()
    .ok_or_else(|| "ホームディレクトリ（HOME / APPDATA）が解決できませんでした".to_string())?;
  Ok(
    config_dir
      .join("gcloud")
      .join("application_default_credentials.json"),
  )
}

/// OS の設定ディレクトリ（Unix=`$HOME/.config`、Windows=`%APPDATA%`）。
fn gcloud_config_dir() -> Option<PathBuf> {
  #[cfg(windows)]
  {
    std::env::var_os("APPDATA").map(PathBuf::from)
  }
  #[cfg(not(windows))]
  {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config"))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_adc_accepts_authorized_user() {
    let json =
      r#"{"type":"authorized_user","client_id":"cid","client_secret":"csec","refresh_token":"rt"}"#;
    let creds = parse_adc(json).unwrap();
    assert_eq!(creds.client_id, "cid");
    assert_eq!(creds.client_secret, "csec");
    assert_eq!(creds.refresh_token, "rt");
  }

  #[test]
  fn parse_adc_rejects_non_authorized_user() {
    // service_account 等は authorized_user でないため拒否（`gcloud ... login` を促す）
    let json =
      r#"{"type":"service_account","client_id":"cid","client_secret":"csec","refresh_token":"rt"}"#;
    assert!(parse_adc(json).is_err());
  }

  #[test]
  fn parse_adc_gives_actionable_message_for_service_account() {
    // client_secret/refresh_token を持たない実際の SA 鍵でも、汎用 serde エラーではなく
    // 「サービスアカウント鍵は未対応・gcloud login か env 解除を」と原因と対処が伝わる文言で弾く
    let sa_key = r#"{"type":"service_account","project_id":"p","private_key_id":"k","client_email":"e@p.iam.gserviceaccount.com"}"#;
    // AdcCredentials は秘密フィールドを持つため Debug 非導出。unwrap_err ではなく match で取り出す
    let err = match parse_adc(sa_key) {
      Err(e) => e,
      Ok(_) => panic!("サービスアカウント鍵は受理してはならない"),
    };
    assert!(err.contains("サービスアカウント鍵"));
    assert!(err.contains("GOOGLE_APPLICATION_CREDENTIALS"));
  }

  #[test]
  fn parse_adc_rejects_invalid_json() {
    assert!(parse_adc("not json").is_err());
    // 必須フィールド欠落
    assert!(parse_adc(r#"{"type":"authorized_user"}"#).is_err());
  }

  #[test]
  fn adc_file_path_prefers_env_override() {
    // GOOGLE_APPLICATION_CREDENTIALS が設定されていれば最優先で返す
    // （プロセス全体に影響するため、このテスト内で set→検証→remove する）
    let key = "GOOGLE_APPLICATION_CREDENTIALS";
    let original = std::env::var_os(key);
    std::env::set_var(key, "/tmp/custom-adc.json");
    assert_eq!(
      adc_file_path().unwrap(),
      PathBuf::from("/tmp/custom-adc.json")
    );
    match original {
      Some(v) => std::env::set_var(key, v),
      None => std::env::remove_var(key),
    }
  }
}
