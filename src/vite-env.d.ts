/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ホーム画面「サンプルを開く」が最初にフェッチする slides.json の URL を上書きする（スクリーンショット fixture・基準見本デッキ #208 の切り替え等に使用） */
  readonly VITE_SLIDES_PATH: string
  /** 配布サンプルの取得元 URL を上書きする（未公開バージョンでの検証・独自サンプルへの差し替え用） */
  readonly VITE_SAMPLE_PACKAGE_URL: string
  /** 'remote' を指定すると同梱 slides.json を無視し、必ずリモートからサンプルを取得する（リモート経路の実機確認用） */
  readonly VITE_SAMPLE_SOURCE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
