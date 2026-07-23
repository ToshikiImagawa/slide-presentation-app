use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// ユーザーがダイアログで選んだディレクトリを asset プロトコル・fs プラグイン双方の
/// 読み取り許可スコープに追加する（fs プラグインの scope は asset プロトコルの scope とは別物で、
/// readTextFile 等はこちらが許可されていないと forbidden path エラーになる）
#[tauri::command]
fn allow_asset_dir(app: tauri::AppHandle, dir: String) -> Result<(), String> {
  app
    .asset_protocol_scope()
    .allow_directory(&dir, true)
    .map_err(|e| e.to_string())?;
  app
    .fs_scope()
    .allow_directory(&dir, true)
    .map_err(|e| e.to_string())?;
  Ok(())
}

/// tgz バイト列を extract_dir に展開し、slides.json のあるディレクトリを返す
/// （`npm pack` は内容を package/ 配下にネストするため、scripts/export-slides.mjs 由来の
/// tgz と同じ規則で package/ を優先的に探す）
fn extract_tgz(bytes: &[u8], extract_dir: &Path) -> Result<PathBuf, String> {
  if extract_dir.exists() {
    fs::remove_dir_all(extract_dir).map_err(|e| e.to_string())?;
  }
  fs::create_dir_all(extract_dir).map_err(|e| e.to_string())?;

  let gz = flate2::read::GzDecoder::new(Cursor::new(bytes));
  tar::Archive::new(gz)
    .unpack(extract_dir)
    .map_err(|e| e.to_string())?;

  let package_dir = extract_dir.join("package");
  Ok(if package_dir.is_dir() {
    package_dir
  } else {
    extract_dir.to_path_buf()
  })
}

/// スライドパッケージ (.tgz) をアプリのキャッシュディレクトリに展開し、slides.json のあるディレクトリを返す
#[tauri::command]
fn extract_slide_package(app: tauri::AppHandle, tgz_path: String) -> Result<String, String> {
  let bytes = fs::read(&tgz_path).map_err(|e| e.to_string())?;

  let stem = Path::new(&tgz_path)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("package");
  let extract_dir = app
    .path()
    .app_cache_dir()
    .map_err(|e| e.to_string())?
    .join("slide-packages")
    .join(stem);

  let result_dir = extract_tgz(&bytes, &extract_dir)?;
  result_dir
    .to_str()
    .map(|s| s.to_string())
    .ok_or_else(|| "抽出先パスの文字列化に失敗しました".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      allow_asset_dir,
      extract_slide_package
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;

  /// package/slides.json を含む npm pack 形式の tar.gz バイト列を作る
  fn build_npm_pack_tgz(slides_json: &[u8]) -> Vec<u8> {
    let mut tar_bytes = Vec::new();
    {
      let mut builder = tar::Builder::new(&mut tar_bytes);
      let mut header = tar::Header::new_gnu();
      header.set_path("package/slides.json").unwrap();
      header.set_size(slides_json.len() as u64);
      header.set_cksum();
      builder.append(&header, slides_json).unwrap();
      builder.finish().unwrap();
    }

    let mut gz_bytes = Vec::new();
    {
      let mut encoder =
        flate2::write::GzEncoder::new(&mut gz_bytes, flate2::Compression::default());
      encoder.write_all(&tar_bytes).unwrap();
      encoder.finish().unwrap();
    }
    gz_bytes
  }

  #[test]
  fn extract_tgz_prefers_npm_pack_package_dir() {
    let content = b"{\"meta\":{\"title\":\"t\"},\"slides\":[]}";
    let gz_bytes = build_npm_pack_tgz(content);

    let extract_dir =
      std::env::temp_dir().join(format!("slide-extract-test-{}", std::process::id()));
    let result = extract_tgz(&gz_bytes, &extract_dir).expect("extraction should succeed");

    assert_eq!(result, extract_dir.join("package"));
    let slides_json_path = result.join("slides.json");
    assert!(slides_json_path.is_file());
    assert_eq!(fs::read(&slides_json_path).unwrap(), content);

    fs::remove_dir_all(&extract_dir).ok();
  }

  #[test]
  fn extract_tgz_replaces_existing_dir() {
    let extract_dir =
      std::env::temp_dir().join(format!("slide-extract-test-replace-{}", std::process::id()));
    fs::create_dir_all(&extract_dir).unwrap();
    fs::write(extract_dir.join("stale.txt"), b"old").unwrap();

    let gz_bytes = build_npm_pack_tgz(b"{\"meta\":{\"title\":\"t\"},\"slides\":[]}");
    extract_tgz(&gz_bytes, &extract_dir).expect("extraction should succeed");

    assert!(!extract_dir.join("stale.txt").exists());
    assert!(extract_dir.join("package").join("slides.json").is_file());

    fs::remove_dir_all(&extract_dir).ok();
  }
}
