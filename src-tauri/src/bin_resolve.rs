//! バイナリ解決の共通ヘルパー。
//!
//! GUI アプリ（Tauri）は Finder/Dock 起動時に login shell の PATH（Homebrew や各種
//! インストーラが `~/.zshrc` 等に追加したパス）を継承しないことがあるため、PATH 探索に
//! 失敗した場合は代表的なインストール先もフォールバックにする（`claude` / `gcloud` 双方で使用）。

use std::path::{Path, PathBuf};

/// PATH からバイナリを探す（簡易・先頭一致）。
pub(crate) fn find_in_path(name: &str) -> Option<PathBuf> {
  let path_var = std::env::var_os("PATH")?;
  for dir in std::env::split_paths(&path_var) {
    let candidate = dir.join(name);
    if candidate.is_file() {
      return Some(candidate);
    }
  }
  None
}

/// PATH → 代表配置の順でバイナリを解決する。
pub(crate) fn resolve_binary(name: &str, candidates: &[PathBuf]) -> Option<PathBuf> {
  find_in_path(name).or_else(|| candidates.iter().find(|c| c.is_file()).cloned())
}

/// 解決済みバイナリパスから起動用の `Command` を構築する。
/// Windows の `.cmd`/`.bat` は `CreateProcess` が直接起動できないため `cmd /C` 経由にする。
pub(crate) fn command_for_binary(binary: &Path) -> tokio::process::Command {
  #[cfg(windows)]
  {
    let is_script = binary
      .extension()
      .and_then(|ext| ext.to_str())
      .is_some_and(|ext| ext.eq_ignore_ascii_case("cmd") || ext.eq_ignore_ascii_case("bat"));
    if is_script {
      let mut cmd = tokio::process::Command::new("cmd");
      cmd.arg("/C").arg(binary);
      return cmd;
    }
  }
  tokio::process::Command::new(binary)
}
