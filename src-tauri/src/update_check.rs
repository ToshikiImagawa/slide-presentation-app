use serde::Serialize;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

/// latest.json の配信元リポジトリ（#121）。GitHub Releases API 経由でアセット URL を解決するため、
/// 静的な `releases/latest/download/` は主経路として使わない（GitHub 仕様で prerelease が除外され安定版に
/// 固定されるため）。ただし GitHub API（`api.github.com`）は未認証だと IP あたり60リクエスト/時と枠が狭く、
/// 同一ネットワークの他ユーザー（自分のツール呼び出しを含む）と枠を共有して枯渇しうる（実例あり）。
/// 静的ダウンロードURL（`github.com/.../releases/latest/download/...`）はこの枠と別カウンタのため、
/// API 解決が失敗した時だけ保険としてこちらへフォールバックする（トークン等の秘密は追加しない）。
/// `tauri.conf.json` の `plugins.updater.endpoints` はプラグイン初期化時の静的スキーマ要件を満たすための
/// 値に過ぎず、実行時は必ずこのモジュールが解決した URL で上書きされる（endpoints の真実源はここ）
const REPO: &str = "ToshikiImagawa/slide-presentation-app";
const LATEST_JSON_ASSET_NAME: &str = "latest.json";

/// 直前のチェック時刻を並置する plugin-store のパス（他の設定保存モジュールと同じパターン）。
const LAST_CHECK_STORE_PATH: &str = "update-check.json";
const LAST_CHECK_KEY: &str = "lastCheckedAtEpochSecs";
/// 起動ごとに毎回チェックすると、上記のレート制限枠をより早く消費してしまうため間引く。
/// パッチリリースの頻度（数日〜数週間おき）に対して十分短く、かつ呼び出し回数を大きく減らせる値として24時間とする
const CHECK_COOLDOWN_SECS: u64 = 24 * 60 * 60;

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

/// GitHub API が失敗した時（レート制限等）だけ使う保険の静的URL。`api.github.com` とは別カウンタのため、
/// API 側の枠が枯渇していても到達できる可能性がある
fn static_latest_json_url() -> String {
  format!("https://github.com/{REPO}/releases/latest/download/{LATEST_JSON_ASSET_NAME}")
}

/// GitHub API 経由でアセット URL を解決し、失敗時は静的URLへフォールバックして updater の endpoints に
/// 設定し check() する。check_for_update・install_update の双方が使う共通処理（install 時に再度呼ぶことで、
/// 確認済みの更新をまたぐ状態を持たずに済む）
async fn resolve_update(app: &tauri::AppHandle) -> Result<Option<Update>, String> {
  let asset_url = match resolve_latest_json_asset_url(&github_api_client()).await {
    Ok(url) => url,
    Err(_) => static_latest_json_url(),
  };
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

fn now_epoch_secs() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0)
}

/// 直前のチェックから CHECK_COOLDOWN_SECS 未満しか経っていなければ true（純粋関数・テスト対象）。
/// `now < last`（システムクロックが後退した等）は経過時間を計算できないため、間引かない側（false）に倒す
fn is_within_cooldown(
  last_checked_epoch_secs: Option<u64>,
  now_epoch_secs: u64,
  cooldown_secs: u64,
) -> bool {
  match last_checked_epoch_secs {
    Some(last) => now_epoch_secs
      .checked_sub(last)
      .is_some_and(|elapsed| elapsed < cooldown_secs),
    None => false,
  }
}

fn read_last_checked_at(app: &tauri::AppHandle) -> Option<u64> {
  app
    .store(LAST_CHECK_STORE_PATH)
    .ok()?
    .get(LAST_CHECK_KEY)?
    .as_u64()
}

/// チェックを試みた（成否問わず）時刻を記録する。書き込み失敗は次回起動時のチェックを妨げないよう無視する
fn record_checked_now(app: &tauri::AppHandle) {
  if let Ok(store) = app.store(LAST_CHECK_STORE_PATH) {
    store.set(LAST_CHECK_KEY, serde_json::json!(now_epoch_secs()));
    let _ = store.save();
  }
}

/// 更新の有無を確認する。前回チェックから24時間以内なら（同一ネットワーク内でのレート制限枠の
/// 消費を抑えるため）実際には確認せず `None` を返す。GitHub API 解決の失敗・latest.json 未添付・
/// オフライン・レート制限などはすべて Err にする。呼び出し側（フロント）はこれを無言で諦める
/// （利用を妨げない・issue #121 の受け入れ基準）
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
  if is_within_cooldown(
    read_last_checked_at(&app),
    now_epoch_secs(),
    CHECK_COOLDOWN_SECS,
  ) {
    return Ok(None);
  }

  let result = resolve_update(&app).await;
  record_checked_now(&app);
  let update = result?;
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

  #[test]
  fn static_latest_json_url_points_at_the_release_download_redirect() {
    assert_eq!(
      static_latest_json_url(),
      "https://github.com/ToshikiImagawa/slide-presentation-app/releases/latest/download/latest.json"
    );
  }

  #[test]
  fn is_within_cooldown_true_when_last_check_was_recent() {
    assert!(is_within_cooldown(Some(1_000), 1_000 + 60, 3_600));
  }

  #[test]
  fn is_within_cooldown_false_once_cooldown_has_elapsed() {
    assert!(!is_within_cooldown(Some(1_000), 1_000 + 3_600, 3_600));
  }

  #[test]
  fn is_within_cooldown_false_when_never_checked_before() {
    assert!(!is_within_cooldown(None, 1_000, 3_600));
  }

  #[test]
  fn is_within_cooldown_false_when_now_is_before_last_check() {
    // クロック補正等で now < last になっても saturating_sub でパニックせず「間引かない」側に倒す
    assert!(!is_within_cooldown(Some(2_000), 1_000, 3_600));
  }
}
