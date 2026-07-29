use serde::Serialize;
use std::sync::Mutex;
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

/// latest.json の配信元リポジトリ（#121）。GitHub Releases API 経由でアセット URL を解決するため、
/// 静的な `releases/latest/download/` は使わない（GitHub 仕様で prerelease が除外され安定版に固定されるため）。
/// `tauri.conf.json` の `plugins.updater.endpoints` はプラグイン初期化時の静的スキーマ要件を満たすための
/// 値に過ぎず、実行時は必ずこのモジュールが解決した URL で上書きされる（endpoints の真実源はここ）
const REPO: &str = "ToshikiImagawa/slide-presentation-app";
const LATEST_JSON_ASSET_NAME: &str = "latest.json";

/// check_for_update が確認済みの更新を保持し、install_update が再チェックなしに使い回す
pub struct PendingUpdate(pub Mutex<Option<Update>>);

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

/// 更新の有無を確認する。GitHub API 解決の失敗・latest.json 未添付・オフライン・レート制限などは
/// すべて Err にする。呼び出し側（フロント）はこれを無言で諦める（利用を妨げない・issue #121 の受け入れ基準）
#[tauri::command]
pub async fn check_for_update(
  app: tauri::AppHandle,
  state: tauri::State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
  let client = reqwest::Client::new();
  let asset_url = resolve_latest_json_asset_url(&client).await?;
  let endpoint = Url::parse(&asset_url).map_err(|e| e.to_string())?;

  let updater = app
    .updater_builder()
    .endpoints(vec![endpoint])
    .map_err(|e| e.to_string())?
    .header("Accept", "application/octet-stream")
    .map_err(|e| e.to_string())?
    .build()
    .map_err(|e| e.to_string())?;

  let update = updater.check().await.map_err(|e| e.to_string())?;

  let info = update.as_ref().map(|u| UpdateInfo {
    version: u.version.clone(),
    current_version: u.current_version.clone(),
    body: u.body.clone(),
  });
  *state.0.lock().map_err(|e| e.to_string())? = update;
  Ok(info)
}

/// check_for_update が確認済みの更新をダウンロード・インストールし、アプリを再起動する
#[tauri::command]
pub async fn install_update(
  app: tauri::AppHandle,
  state: tauri::State<'_, PendingUpdate>,
) -> Result<(), String> {
  let update = state
    .0
    .lock()
    .map_err(|e| e.to_string())?
    .take()
    .ok_or_else(|| "確認済みの更新がありません（先に check_for_update が必要です）".to_string())?;

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
