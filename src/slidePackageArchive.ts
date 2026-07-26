/**
 * スライドパッケージのアーカイブ拡張子（.spkg が既定。旧 .tgz も後方互換で開ける）。
 * Tauri アプリ本体（localSlideLoader.ts）と Node 製ビルドツール（vite.config.ts）の
 * 両方から参照する単一真実源（DC-003）。依存を持たない純粋モジュールにし、どちらからも import できるようにする。
 */
export const SLIDE_PACKAGE_ARCHIVE_EXTENSIONS = ['.spkg', '.tgz']

/** path がスライドパッケージのアーカイブ（.spkg または旧 .tgz）かどうかを判定する（純粋関数） */
export function isSlidePackageArchivePath(path: string): boolean {
  const lower = path.toLowerCase()
  return SLIDE_PACKAGE_ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
