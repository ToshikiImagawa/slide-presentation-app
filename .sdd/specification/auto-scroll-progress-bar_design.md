---
id: design-auto-scroll-progress-bar
title: 自動スクロールプログレスバー（Auto Scroll Progress Bar）技術設計書
type: design
status: draft
sdd-phase: plan
impl-status: implemented
created: 2026-02-02
updated: 2026-07-24
depends-on:
  - spec-auto-scroll-progress-bar
tags:
  - auto-scroll
  - progress
  - presenter-view
  - audio
  - timer
category: presentation-ui
---

# 自動スクロールプログレスバー（Auto Scroll Progress Bar）

**ドキュメント種別:** 技術設計書 (Design Doc)
**SDDフェーズ:** Plan (計画/設計)
**最終更新日:** 2026-07-24
**関連 Spec:** [auto-scroll-progress-bar_spec.md](./auto-scroll-progress-bar_spec.md)
**関連 PRD:** [auto-scroll-progress-bar.md](../requirement/auto-scroll-progress-bar.md)

---

# 1. 実装ステータス

**ステータス:** 🟢 実装済み

## 1.1. 実装進捗

| モジュール/機能                 | ステータス | 備考                                                                        |
|--------------------------|-------|---------------------------------------------------------------------------|
| useCircularProgress フック  | 🟢    | 進行ソース判定ロジック（audio/timer/none の判定、animationDuration の算出）。メイン・発表者ビュー共通         |
| CircularProgress コンポーネント | 🟢    | メインウィンドウ用UI（SVGリングによる円形プログレス、audio/timer 両モードとも CSS @keyframes で補間）        |
| FillProgress コンポーネント      | 🟢    | 発表者ビュー用UI（ボタンを下から上へ塗りつぶすオーバーレイ、CSS @keyframes fillUp で補間）                   |
| useAudioPlayer への進行情報追加  | 🟢    | currentTime/duration/hasError の公開（timeupdate/durationchange/loadedmetadata/error イベント経由） |
| App.tsx への統合             | 🟢    | useCircularProgress フック呼び出し + AudioControlBar 経由で円形プログレスを表示               |
| 発表者ビューへの統合               | 🟢    | Tauri Event（`emit`/`listen`、`'presenter-view'`）経由の progressChanged メッセージ + ボタン上に FillProgress オーバーレイ表示 |

---

# 2. 設計目標

1. **既存アーキテクチャとの一貫性**: 既存の `useAudioPlayer`、`useAutoSlideshow` フックのパターンに従い、プログレスバーのロジックをカスタムフックとして分離する
2. **最小限の変更**: 既存コードへの変更を最小限にし、主に新規ファイルの追加で実現する
3. **タイマー統合**: `useAutoSlideshow` から `timerDuration` を受け取り、CSS @keyframes アニメーションで滑らかに進行表示する
4. **テーマ統合**: CSS変数を活用し、テーマカラーとの統一感を保つ（A-002 準拠）
5. **デュアルビュー対応**: メインウィンドウ（円形プログレス）と発表者ビュー（塗りつぶしオーバーレイ）の両方に進行インジケーターを表示し、既存の Tauri Event（`emit`/`listen`、イベント名 `'presenter-view'`）
   通信パターンに従って進行状況を同期する

---

# 3. 技術スタック

| 領域               | 採用技術                                            | 選定理由                                                                             |
|------------------|-------------------------------------------------|----------------------------------------------------------------------------------|
| UI               | React コンポーネント + SVG                             | 既存のコンポーネントアーキテクチャに準拠（A-001）。SVG circle で円形リングを描画                                 |
| ロジック             | React カスタムフック                                   | 既存の useAudioPlayer, useAutoSlideshow パターンとの一貫性                                   |
| アニメーション（音声/タイマー共通） | CSS @keyframes (circularFill)                   | ブラウザ GPU で 0→100% を滑らかに補間。React state の毎フレーム更新が不要でカクつかない。音声モードは duration、タイマーモードは scrollSpeed を animationDuration に設定 |
| スタイリング           | CSS Modules                                     | コンポーネント固有スタイルの管理（A-002 の3層モデル準拠）                                                 |
| 音声進行取得           | HTMLAudioElement timeupdate/durationchange イベント | 既存の useAudioPlayer が内部で管理する Audio 要素から進行情報を取得。durationchange で duration の取得漏れを防止 |

---

# 4. アーキテクチャ

## 4.1. システム構成図

```mermaid
graph TD
    subgraph "既存"
        App[App.tsx]
        UAP[useAudioPlayer]
        UAS[useAutoSlideshow]
        SR[SlideRenderer]
        Audio[HTMLAudioElement]
        UPV[usePresenterView]
        PVW[PresenterViewWindow]
        EV[Tauri Event 'presenter-view']
    end

    subgraph "新規"
        UCP[useCircularProgress]
        CP[CircularProgress]
        CPStyle[CircularProgress.module.css]
        FP[FillProgress]
        FPStyle[FillProgress.module.css]
    end

    App --> UCP
    UCP --> UAP
    UAS -->|timerDuration| UCP
    App --> CP
    CP --> CPStyle
    UAP --> Audio
    Audio -->|timeupdate/durationchange/error| UAP
    App -->|progress/visible/animationDuration| UPV
    UPV -->|emit progressChanged| EV
    EV -->|listen progressChanged| PVW
    PVW --> FP
    FP --> FPStyle
```

## 4.2. モジュール分割

| モジュール名                      | 責務                                        | 依存関係                                                 | 配置場所                                       |
|-----------------------------|-------------------------------------------|------------------------------------------------------|--------------------------------------------|
| useCircularProgress         | 進行率の算出と表示状態の管理（メイン・発表者ビュー共通）              | useAudioPlayer の戻り値、useAutoSlideshow の timerDuration | src/hooks/useCircularProgress.ts           |
| CircularProgress            | メインウィンドウ用の円形プログレス描画（animationDuration 指定時: @keyframes / 未指定時: stroke-dashoffset 直接設定） | なし（props のみ）                                         | src/components/CircularProgress.tsx        |
| CircularProgress.module.css | 円形プログレスのスタイル定義（@keyframes による audio/timer 共通アニメーション + transition による animationDuration 未指定時のフォールバック） | CSS変数（--theme-*, --circumference）                    | src/components/CircularProgress.module.css |
| FillProgress                | 発表者ビュー用の塗りつぶしオーバーレイ描画（animationDuration 指定時: @keyframes fillUp / 未指定時: height 直接設定） | なし（props のみ）                                         | src/components/FillProgress.tsx            |
| FillProgress.module.css     | 塗りつぶしオーバーレイのスタイル定義（@keyframes fillUp で下から上へ塗る + transition による animationDuration 未指定時のフォールバック） | CSS変数（--theme-primary-rgb）                           | src/components/FillProgress.module.css     |

## 4.3. 既存コードへの変更

| 対象ファイル                                 | 変更内容                                                                                      | 理由                                                    |
|----------------------------------------|-------------------------------------------------------------------------------------------|-------------------------------------------------------|
| src/hooks/useAudioPlayer.ts            | `currentTime` と `duration` を戻り値に追加。`durationchange` イベント対応、`timeupdate` 内での duration 同期   | 音声再生の進行情報をプログレスバーに提供するため。loadedmetadata が発火しないケースへの対策 |
| src/App.tsx                            | useCircularProgress フックの呼び出しと AudioControlBar 経由で円形プログレスを表示                               | 円形プログレスの統合                                            |
| src/components/AudioControlBar.tsx     | progress/progressVisible/animationDuration/progressResetKey props を追加、自動スライドショーボタンにリングを統合 | メインウィンドウでの円形プログレス表示                                   |
| src/hooks/usePresenterView.ts          | `PresenterViewMessage` union に `progressChanged` メッセージ型をインラインで追加（`{ progress, visible, animationDuration? }`）。`sendProgressState` で Tauri Event `emit` | 発表者ビューへの進行状況同期                                        |
| src/components/PresenterViewWindow.tsx | 自動スライドショーボタン上に FillProgress オーバーレイを配置（`resetKey={currentIndex}`）                            | 発表者ビューでの進行表示                                          |

---

# 5. データモデル

```typescript
/** useAudioPlayer の戻り値への追加 */
interface UseAudioPlayerReturn {
  // 既存フィールド
  playbackState: AudioPlaybackState
  play: (src: string) => void
  stop: () => void
  isPlaying: boolean
  hasError: boolean     // 音声読み込みに失敗した場合 true（error イベントで設定。タイマーフォールバック判定に使用）
  onEndedRef: React.MutableRefObject<(() => void) | null>
  // 追加フィールド
  currentTime: number   // 現在の再生位置（秒）
  duration: number      // 音声の総時間（秒）
}

/** useCircularProgress の入力 */
interface UseCircularProgressOptions {
  autoSlideshow: boolean
  hasVoice: boolean
  audioProgress: AudioProgress | null
  /** タイマーがアクティブな場合の総時間（秒）。非アクティブ時は null */
  timerDuration: number | null
}

/** useCircularProgress の出力 */
interface UseCircularProgressReturn {
  progress: number
  source: 'audio' | 'timer' | 'none'
  visible: boolean
  /** CSS アニメーション用 duration（秒）。audio モード・timer モードで使用。none 時は undefined */
  animationDuration?: number
}

/** CircularProgress の props（メインウィンドウ用） */
interface CircularProgressProps {
  /** 進行率（0.0〜1.0）。animationDuration 未指定時に使用 */
  progress: number
  /** 表示/非表示 */
  visible: boolean
  /** CSS アニメーションで 0→100% を補間する duration（秒）。指定時は progress を無視 */
  animationDuration?: number
  /** 変更するとアニメーションをリセットする key */
  resetKey?: string | number
}

/** FillProgress の props（発表者ビュー用）。CircularProgressProps と同一形状で、描画表現のみ異なる */
interface FillProgressProps {
  /** 進行率（0.0〜1.0）。animationDuration 未指定時に使用（height に反映） */
  progress: number
  /** 表示/非表示 */
  visible: boolean
  /** CSS アニメーションで 0→100% を補間する duration（秒）。指定時は progress を無視 */
  animationDuration?: number
  /** 変更するとアニメーションをリセットする key */
  resetKey?: string | number
}

/**
 * progressChanged メッセージのペイロード。
 * 実装では独立した型ではなく、PresenterViewMessage union のインラインメンバーとして定義される
 * （src/data/types.ts: `| { type: 'progressChanged'; payload: { progress: number; visible: boolean; animationDuration?: number } }`）。
 * Tauri Event（`emit`/`listen`、イベント名 `'presenter-view'`）で送受信する。
 */
interface ProgressChangedPayload {
  progress: number
  visible: boolean
  animationDuration?: number
}
```

---

# 6. インターフェース定義

```typescript
/** useCircularProgress フック（メイン・発表者ビュー共通の進行状態算出） */
function useCircularProgress(options: UseCircularProgressOptions): UseCircularProgressReturn {
}

/** CircularProgress コンポーネント（メインウィンドウ用: SVGリング） */
function CircularProgress(props: CircularProgressProps): JSX.Element | null {
}

/** FillProgress コンポーネント（発表者ビュー用: 下から上への塗りつぶしオーバーレイ） */
function FillProgress(props: FillProgressProps): JSX.Element | null {
}
```

---

# 7. 非機能要件実現方針

| 要件                       | 実現方針                                                                                                                                                 |
|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| 滑らかなアニメーション（FR-ASPB-004） | 音声/タイマー共通: CSS `@keyframes` でブラウザ GPU による滑らかな 0→100% アニメーション。メイン=`circularFill`（SVG stroke-dashoffset）、発表者ビュー=`fillUp`（height 0→100%）。`animationDuration` に音声の総時間またはスクロールスピードを設定 |
| コンテンツ非干渉（DC_ASPB_002）    | メイン=ボタン周囲のリング、発表者ビュー=ボタン上のオーバーレイとして自動スライドショーボタンに重ねて配置し、スライドコンテンツ領域を占有しない                                                                                                       |
| テーマ統合（DC_ASPB_001）       | リングの色に `var(--theme-primary)`、塗りつぶしオーバーレイに `rgba(var(--theme-primary-rgb), 0.25)` を使用                                                                                          |
| ライフサイクル管理（DC_ASPB_003）   | useEffect のクリーンアップで timeupdate/durationchange/loadedmetadata/error イベントリスナーを解除。アニメーションは `resetKey` によるコンポーネント再マウントでリセット                                                            |

---

# 8. テスト戦略

| テストレベル  | 対象                       | カバレッジ目標                                                 |
|---------|--------------------------|---------------------------------------------------------|
| ユニットテスト | useCircularProgress フック  | 進行率算出ロジック（audio/timer/none の各ケース、animationDuration の返却） |
| ユニットテスト | CircularProgress コンポーネント | 表示/非表示切替、progress 値の反映（メインウィンドウ用リング）                    |
| ユニットテスト | FillProgress コンポーネント     | 表示/非表示切替、progress 値の反映（発表者ビュー用塗りつぶしオーバーレイ）              |
| ユニットテスト | useAudioPlayer 拡張        | currentTime/duration/hasError の正しい値返却                   |

---

# 9. 設計判断

## 9.1. 決定事項

| 決定事項               | 選択肢                                                                        | 決定内容                         | 理由                                                                                                                                                   |
|--------------------|----------------------------------------------------------------------------|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| アニメーション方式（音声/タイマー共通） | (a) CSS transition + React state (b) CSS @keyframes (c) requestAnimationFrame | (b) CSS @keyframes           | 音声・タイマー両モードで CSS @keyframes を統一採用。React state の頻繁な更新（音声モードでは timeupdate ~250ms間隔）が不要になり、再レンダリングを最小化。ブラウザ GPU が滑らかに 0→100% を補間。`animationDuration` に音声の総時間またはスクロールスピードを設定するだけのシンプルな構成 |
| 音声進行の取得方法          | (a) useAudioPlayer を拡張 (b) 別途 Audio 参照を取得                                  | (a) useAudioPlayer を拡張       | 既存の Audio 要素管理の一元化を維持（A-001 準拠）。currentTime/duration を戻り値に追加するだけの最小変更                                                                                |
| duration 取得の信頼性向上  | (a) loadedmetadata のみ (b) durationchange 追加 (c) timeupdate 内でも同期           | (b) + (c) 併用                 | loadedmetadata が発火しないケース（ブラウザ差異、キャッシュ等）への対策。timeupdate 内で `isFinite(dur) && dur > 0` ガード付きで duration も同期                                             |
| スタイリング方式           | (a) CSS Modules (b) MUI sx prop (c) インラインスタイル                              | (a) CSS Modules              | コンポーネント固有の複雑なスタイル（position, transition, animation）を管理するため、A-002 の3層モデルに従い CSS Modules を採用                                                            |
| タイマープログレスのインターフェース | (a) TimerProgress { elapsed, total } (b) timerDuration: number &#124; null | (b) timerDuration            | CSS @keyframes 方式ではブラウザが 0→100% を自動補間するため、elapsed（経過時間）は不要。総時間（秒）のみで十分                                                                               |
| 円形プログレスの配置場所（メイン）  | (a) 各 section 内 (b) ボタン周囲にリング (c) position: fixed バー                       | (b) ボタン周囲にリング                | 自動スライドショーボタンの周囲に SVG リングとして配置。スライドコンテンツ領域を占有せず、ボタンの状態と視覚的に一体化する                                                                                      |
| 発表者ビューでの配置場所       | (a) コントロールバー下部バー (b) ウィンドウ最下部 (c) ボタン上に塗りつぶしオーバーレイ                          | (c) ボタン上に塗りつぶしオーバーレイ（FillProgress） | 自動スライドショーボタン上に FillProgress を重ね、ボタンを下から上へ塗りつぶす。どのボタンに関連する進行状況かが直感的に分かり、メインウィンドウと同じ「ボタン一体化」の方針を保つ                                                                       |
| メイン/発表者ビューの視覚表現差   | (a) 両ビューとも同一コンポーネント（円形リング） (b) ビューごとに最適な表現を分ける                             | (b) メイン=CircularProgress（円形リング）／発表者ビュー=FillProgress（塗りつぶし） | 進行状態の算出は共通フック useCircularProgress に集約しつつ、描画をビューごとに分離。メインの AudioControlBar は円形ボタンにリングが馴染む一方、発表者ビューのボタンはアイコン+ラベルの矩形で、下から上への塗りつぶしの方がボタン形状に合い視認性が高い。両コンポーネントの props 形状（progress/visible/animationDuration/resetKey）を揃えることで、同期ペイロードと算出ロジックを共用できる |
| 発表者ビューへの同期方式       | (a) Tauri Event（emit/listen）経由 (b) 発表者ビュー側で独立に算出                            | (a) Tauri Event 経由           | 既存の usePresenterView の通信パターン（Tauri `emit`/`listen`、イベント名 `'presenter-view'`）に従う。メインウィンドウで算出した progress/visible/animationDuration を `progressChanged` として送信し、発表者ビューは受信して表示するだけのシンプルな構成 |
| 円形プログレスの描画方式       | (a) CSS width バー (b) SVG stroke-dasharray リング (c) MUI CircularProgress     | (b) SVG stroke-dasharray リング | SVG の stroke-dasharray / stroke-dashoffset で時計回りアニメーションを実現。外部ライブラリ不要でサイズ・色のカスタマイズが容易。rotate(-90deg) で12時位置から開始                                       |

## 9.2. 未解決の課題

なし（タイマープログレスは `timerDuration: number | null` インターフェースで解決済み）
