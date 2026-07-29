use serde::Serialize;
use std::sync::OnceLock;
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

/// latest.json の配信元リポジトリ（#121）。GitHub Releases API 経由でアセット URL を解決するため、
/// 静的な `releases/latest/download/` は使わない（GitHub 仕様で prerelease が除外され安定版に固定されるため）。
/// `tauri.conf.json` の `plugins.updater.endpoints` はプラグイン初期化時の静的スキーマ要件を満たすための
/// 値に過ぎず、実行時は必ずこのモジュールが解決した URL で上書きされる（endpoints の真実源はここ）
const REPO: &str = "ToshikiImagawa/slide-presentation-app";
const LATEST_JSON_ASSET_NAME: &str = "latest.json";

/// GitHub API 呼び出し用共有 reqwest クライアント（lib.rs の download_http_client と同パターン）。
/// 起動時に1回・更新実行時に1回程度の低頻度アクセスのため、既定タイムアウトで十分
static GITHUB_API_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn github_api_client() -> reqwest::Client {
  GITHUB_API_CLIENT.get_or_init(reqwest::Client::new).clone()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  pub version: String,
  pub current_version: String,
  pub body: Option<String>,
}

/// GitHub Releases API のレスポンス JSON から、指定した名前のアセット ID を取り出す（純粋関数・テスト対象）
fn find_asset_id(release_json: &serde_json::Value, asset_name: &str) -> Option<u64> {
  release_json
    .get("assets")?
    .as_array()?
    .iter()
    .find(|asset| asset.get("name").and_then(|n| n.as_str()) == Some(asset_name))?
    .get("id")?
    .as_u64()
}

/// GitHub API で最新リリースの latest.json アセット URL（`/releases/assets/{id}`）を解決する
async fn resolve_latest_json_asset_url(client: &reqwest::Client) -> Result<String, String> {
  let release_url = format!("https://api.github.com/repos/{REPO}/releases/latest");
  let response = client
    .get(&release_url)
    .header("User-Agent", REPO)
    .header("Accept", "application/vnd.github+json")
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!(
      "GitHub API がエラーを返しました: {}",
      response.status()
    ));
  }

  let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
  let asset_id = find_asset_id(&json, LATEST_JSON_ASSET_NAME)
    .ok_or_else(|| format!("最新リリースに {LATEST_JSON_ASSET_NAME} が添付されていません"))?;

  Ok(format!(
    "https://api.github.com/repos/{REPO}/releases/assets/{asset_id}"
  ))
}

/// GitHub API 経由で解決したアセット URL を updater の endpoints に設定し、check() する。
/// check_for_update・install_update の双方が使う共通処理（install 時に再度呼ぶことで、
/// 確認済みの更新をまたぐ状態を持たずに済む）
async fn resolve_update(app: &tauri::AppHandle) -> Result<Option<Update>, String> {
  let asset_url = resolve_latest_json_asset_url(&github_api_client()).await?;
  let endpoint = Url::parse(&asset_url).map_err(|e| e.to_string())?;

  let updater = app
    .updater_builder()
    .endpoints(vec![endpoint])
    .map_err(|e| e.to_string())?
    .header("Accept", "application/octet-stream")
    .map_err(|e| e.to_string())?
    .build()
    .map_err(|e| e.to_string())?;

  updater.check().await.map_err(|e| e.to_string())
}

/// 更新の有無を確認する。GitHub API 解決の失敗・latest.json 未添付・オフライン・レート制限などは
/// すべて Err にする。呼び出し側（フロント）はこれを無言で諦める（利用を妨げない・issue #121 の受け入れ基準）
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
  let update = resolve_update(&app).await?;
  Ok(update.map(|u| UpdateInfo {
    version: u.version,
    current_version: u.current_version,
    body: u.body,
  }))
}

/// 更新を（再確認の上）ダウンロード・インストールし、アプリを再起動する
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
  let update = resolve_update(&app)
    .await?
    .ok_or_else(|| "確認できる更新がありません".to_string())?;

  update
    .download_and_install(|_, _| {}, || {})
    .await
    .map_err(|e| e.to_string())?;

  app.request_restart();
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn find_asset_id_returns_matching_asset() {
    let release_json = json!({
      "assets": [
        { "name": "app.tar.gz", "id": 111 },
        { "name": "latest.json", "id": 222 },
      ]
    });
    assert_eq!(find_asset_id(&release_json, "latest.json"), Some(222));
  }

  #[test]
  fn find_asset_id_returns_none_when_missing() {
    let release_json = json!({ "assets": [{ "name": "app.tar.gz", "id": 111 }] });
    assert_eq!(find_asset_id(&release_json, "latest.json"), None);
  }

  #[test]
  fn find_asset_id_returns_none_when_assets_field_absent() {
    let release_json = json!({});
    assert_eq!(find_asset_id(&release_json, "latest.json"), None);
  }
}
