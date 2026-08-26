use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

/// latest.json の配信元リポジトリ（#121）。当初は GitHub Releases API 経由でアセット URL を解決していたが、
/// 未認証アクセスは IP あたり60リクエスト/時までしかなく、同一ネットワークの他ユーザー（自分のツール呼び出しを
/// 含む）と枠を共有して枯渇し、リリース直後に更新検出できない事象が発生した（v2.3.1）。
/// 静的ダウンロードURL（`github.com/.../releases/latest/download/...`）は `api.github.com` とは別カウンタで
/// （`github.com` 側のリダイレクト → 署名付きCDN URL。レート制限ヘッダも付かない）、両方式とも常に
/// `releases/latest`（prerelease除外）を見る点で挙動は同じなので、レート制限を受けないこちらに一本化する
/// （API経由でのプレリリース配信制御は将来必要になった時点で再検討する）。
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  pub version: String,
  pub current_version: String,
  pub body: Option<String>,
}

/// 最新リリースの latest.json への静的ダウンロードURL（`api.github.com` のレート制限を受けない）。
fn latest_json_url() -> String {
  format!("https://github.com/{REPO}/releases/latest/download/{LATEST_JSON_ASSET_NAME}")
}

/// 静的URLを updater の endpoints に設定し check() する。check_for_update・install_update の双方が使う
/// 共通処理（install 時に再度呼ぶことで、確認済みの更新をまたぐ状態を持たずに済む）
async fn resolve_update(app: &tauri::AppHandle) -> Result<Option<Update>, String> {
  let endpoint = Url::parse(&latest_json_url()).map_err(|e| e.to_string())?;

  let updater = app
    .updater_builder()
    .endpoints(vec![endpoint])
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

/// 更新の有無を確認する。開発ビルド（`npm run tauri:dev` 等）では常に確認せず `None` を返す
/// （dev では起動が頻繁なうえ配布物とバージョン整合の意味がないため。他の dev 限定機能と同じ
/// `cfg!(debug_assertions)` 規約）。前回チェックから24時間以内なら（同一ネットワーク内でのレート制限枠の
/// 消費を抑えるため）実際には確認せず `None` を返す。latest.json 未添付・オフラインなどはすべて Err にし、
/// 呼び出し側（フロント）はこれを無言で諦める（利用を妨げない・issue #121 の受け入れ基準）
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
  if cfg!(debug_assertions) {
    return Ok(None);
  }

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

  #[test]
  fn latest_json_url_points_at_the_release_download_redirect() {
    assert_eq!(
      latest_json_url(),
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
    // クロック補正等で now < last になっても panic せず「間引かない」側に倒す
    assert!(!is_within_cooldown(Some(2_000), 1_000, 3_600));
  }
}
