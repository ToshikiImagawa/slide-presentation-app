---
id: prd-auto-scroll-progress-bar
title: 自動スクロールプログレスバー（Auto Scroll Progress Bar）要求仕様書
type: prd
status: draft
created: 2026-02-02
updated: 2026-07-24
priority: medium
risk: medium
tags:
  - auto-scroll
  - progress
  - presenter-view
  - audio
  - timer
category: presentation-ui
---

# 自動スクロールプログレスバー（Auto Scroll Progress Bar）要求仕様書

## 概要

本ドキュメントは、自動スクロール（音声再生またはタイマーベース）の進行状況を可視化するプログレス表示の要求を定義する。進行状況はメインウィンドウでは自動スライドショーボタン周囲の円形リング、発表者ビューでは自動スライドショーボタンを下から上へ塗りつぶすオーバーレイとして表示され、発表者と聴衆の双方に次のスライドへの遷移タイミングを視覚的に示す。音声ファイルがある場合は再生開始から終了まで、タイマーベースの場合はスライド表示から設定時間までの進行をそれぞれ可視化する。

> **注記（実 UI との整合）:** 初期構想では「スライド下部の細い横バーが左から右へ伸びる」形を想定していたが、実装ではスライドコンテンツ領域を占有しないこと（B-001 準拠）と自動スライドショーボタンとの視覚的一体化を優先し、メインウィンドウでは同ボタン周囲の円形リング（SVG）、発表者ビューでは同ボタンを下から上へ塗りつぶすオーバーレイを採用した。本 PRD は実装済み UI に合わせて記述を更新している。

---

# 1. 要求図の読み方

## 1.1. 要求タイプ

- **requirement**: 一般的な要求
- **functionalRequirement**: 機能要求
- **designConstraint**: 設計制約

## 1.2. リスクレベル

- **High**: 高リスク（ビジネスクリティカル、実装困難）
- **Medium**: 中リスク（重要だが代替可能）
- **Low**: 低リスク（Nice to have）

## 1.3. 検証方法

- **Test**: テストによる検証
- **Demonstration**: デモンストレーションによる検証
- **Inspection**: インスペクション（レビュー）による検証

## 1.4. 関係タイプ

- **contains**: 包含関係（親要求が子要求を含む）
- **derives**: 派生関係（要求から別の要求が導出される）
- **traces**: トレース関係（要求間の追跡可能性）

---

# 2. 要求一覧

## 2.1. ユースケース図（概要）

```mermaid
graph TB
    subgraph "プレゼンテーションシステム"
        Presenter((発表者))
        ViewAudioProgress[音声再生のプログレスを確認する]
        ViewTimerProgress[タイマーのプログレスを確認する]
        ViewPresenterProgress[発表者ビューでプログレスを確認する]
        Audience((聴衆))
        ViewProgress[スライド遷移タイミングを把握する]
    end

    Presenter --> ViewAudioProgress
    Presenter --> ViewTimerProgress
    Presenter --> ViewPresenterProgress
    Audience --> ViewProgress
```

## 2.2. 機能一覧（テキスト形式）

- プログレス表示
    - 自動スクロール中に自動スライドショーボタンへ進行インジケーターを表示
    - メインウィンドウはボタン周囲の円形リング、発表者ビューはボタンを下から上へ塗りつぶすオーバーレイで進行を可視化
- 音声再生プログレス
    - 音声ファイル再生時：再生開始（0%）から再生終了（100%）まで進行
- タイマープログレス
    - タイマーベース自動スクロール時：スライド表示（0%）から設定時間経過（100%）まで進行
- 発表者ビュープログレス
    - 発表者ビューウィンドウの自動スライドショーボタンに塗りつぶしオーバーレイを表示
    - メインウィンドウと同じ進行状況を Tauri Event（'presenter-view'）経由で同期表示
- 非表示条件
    - 自動スライドショーがOFFの場合は進行インジケーターを非表示

---

# 3. 要求図（SysML Requirements Diagram）

## 3.1. 全体要求図

```mermaid
requirementDiagram
    requirement AutoScrollProgressBar {
        id: UR_ASPB_001
        text: "自動スクロール（音声再生またはタイマー）の進行状況を、進行インジケーター（メイン=円形リング／発表者ビュー=塗りつぶしオーバーレイ）で可視化し、次スライドへの遷移タイミングを発表者と聴衆に示すこと"
        risk: medium
        verifymethod: demonstration
    }

    functionalRequirement AudioProgressBar {
        id: FR_ASPB_001
        text: "音声ファイル再生中に、再生開始から終了までの進行を進行インジケーターで可視化すること"
        risk: high
        verifymethod: test
    }

    functionalRequirement TimerProgressBar {
        id: FR_ASPB_002
        text: "タイマーベース自動スクロール中に、スライド表示から設定時間経過までの進行を進行インジケーターで可視化すること"
        risk: high
        verifymethod: test
    }

    functionalRequirement ProgressBarPosition {
        id: FR_ASPB_003
        text: "進行インジケーターが自動スライドショーボタンに一体化して表示され、スライドコンテンツと重ならないこと"
        risk: medium
        verifymethod: demonstration
    }

    functionalRequirement ProgressBarAnimation {
        id: FR_ASPB_004
        text: "進行インジケーターが0%から100%へ滑らかなアニメーションで進行すること（メイン=12時位置から時計回り／発表者ビュー=下から上への塗りつぶし）"
        risk: medium
        verifymethod: demonstration
    }

    functionalRequirement ProgressBarHideWhenOff {
        id: FR_ASPB_005
        text: "自動スライドショーがOFFの場合、進行インジケーターが非表示であること"
        risk: medium
        verifymethod: test
    }

    functionalRequirement ProgressBarResetOnSlideChange {
        id: FR_ASPB_006
        text: "スライドが切り替わった際に進行インジケーターが0%にリセットされ、新しいスライドの条件に応じて再度進行を開始すること"
        risk: medium
        verifymethod: test
    }

    designConstraint ProgressBarStyling {
        id: DC_ASPB_001
        text: "プログレスバーのスタイリングはCSS変数（--theme-*）を使用し、テーマとの統一感を保つこと（A-002 準拠）"
        risk: low
        verifymethod: inspection
    }

    designConstraint ProgressBarNonIntrusive {
        id: DC_ASPB_002
        text: "プログレスバーはスライドコンテンツの表示を妨げない位置・サイズで配置すること（B-001 準拠）"
        risk: low
        verifymethod: demonstration
    }

    designConstraint ProgressBarLifecycle {
        id: DC_ASPB_003
        text: "プログレスバーのアニメーション・タイマーのライフサイクルは useEffect で管理し、クリーンアップ時にリソースを解放すること（T-003 準拠）"
        risk: low
        verifymethod: inspection
    }

    functionalRequirement PresenterViewProgressBar {
        id: FR_ASPB_007
        text: "発表者ビューウィンドウの自動スライドショーボタンに、メインウィンドウと同じ進行状況を示す塗りつぶしオーバーレイを表示すること"
        risk: medium
        verifymethod: demonstration
    }

    AutoScrollProgressBar - contains -> AudioProgressBar
    AutoScrollProgressBar - contains -> TimerProgressBar
    AutoScrollProgressBar - contains -> ProgressBarPosition
    AutoScrollProgressBar - contains -> ProgressBarAnimation
    AutoScrollProgressBar - contains -> ProgressBarHideWhenOff
    AutoScrollProgressBar - contains -> ProgressBarResetOnSlideChange
    AutoScrollProgressBar - contains -> PresenterViewProgressBar
    AutoScrollProgressBar - contains -> ProgressBarStyling
    AutoScrollProgressBar - contains -> ProgressBarNonIntrusive
    AutoScrollProgressBar - contains -> ProgressBarLifecycle
    AudioProgressBar - derives -> ProgressBarAnimation
    TimerProgressBar - derives -> ProgressBarAnimation
    PresenterViewProgressBar - derives -> ProgressBarAnimation
    PresenterViewProgressBar - derives -> ProgressBarHideWhenOff
    ProgressBarResetOnSlideChange - derives -> AudioProgressBar
    ProgressBarResetOnSlideChange - derives -> TimerProgressBar
```

## 3.2. 関連PRDとのトレース

```mermaid
requirementDiagram
    functionalRequirement AutoSlideshowOnAudioEnd {
        id: FR_SNA_005
        text: "自動スライドショー機能がONの場合、音声再生が終了した時に次のスライドへ自動で遷移すること"
        risk: high
        verifymethod: test
    }

    functionalRequirement TimerBasedAutoScroll {
        id: FR_AST_001
        text: "自動スライドショーがONかつ音声ファイルが未定義のスライドで、設定秒数後に自動遷移すること"
        risk: high
        verifymethod: test
    }

    functionalRequirement AudioProgressBar {
        id: FR_ASPB_001
        text: "音声ファイル再生中に再生進行をプログレスバーで可視化すること"
        risk: high
        verifymethod: test
    }

    functionalRequirement TimerProgressBar {
        id: FR_ASPB_002
        text: "タイマーベース自動スクロール中にタイマー進行をプログレスバーで可視化すること"
        risk: high
        verifymethod: test
    }

    AudioProgressBar - traces -> AutoSlideshowOnAudioEnd
    TimerProgressBar - traces -> TimerBasedAutoScroll
```

---

# 4. 要求の詳細説明

## 4.1. 機能要求

### FR-ASPB-001: 音声再生プログレスバー

音声ファイル（notes.voice）が定義されているスライドで自動スライドショーがONの場合、音声再生の進行状況を進行インジケーターで可視化する。進行は音声の再生開始時に0%から始まり、再生終了時（音声の総再生時間の経過時）に100%に達する。

**優先度:** Must

**検証方法:** テストによる検証

### FR-ASPB-002: タイマープログレスバー

音声ファイルが未定義のスライドでタイマーベース自動スクロールが動作している場合、タイマーの進行状況を進行インジケーターで可視化する。進行はスライド表示時に0%から始まり、設定されたスクロールスピード（秒数）の経過時に100%に達する。

**優先度:** Must

**検証方法:** テストによる検証

### FR-ASPB-003: 進行インジケーターの配置

進行インジケーターは自動スライドショーボタンに一体化して表示される。メインウィンドウではボタン周囲を囲む円形リング（SVG）として、発表者ビューではボタンを覆う塗りつぶしオーバーレイとして描画し、いずれもスライドコンテンツ領域を占有しない。

**優先度:** Should

**検証方法:** デモンストレーションによる検証

### FR-ASPB-004: スムーズアニメーション

進行インジケーターは0%から100%へ滑らかなアニメーションで進行する。メインウィンドウの円形リングは12時位置から時計回りに伸び、発表者ビューのオーバーレイは下から上へ塗りつぶす。カクつきや急激な変化がなく、視覚的に自然な進行を表現する。

**優先度:** Should

**検証方法:** デモンストレーションによる検証

### FR-ASPB-005: 自動スライドショーOFF時の非表示

自動スライドショーがOFFの場合、プログレスバーは表示しない。自動スライドショーがONに切り替えられた際に、現在のスライドの条件に応じてプログレスバーの表示を開始する。

**優先度:** Should

**検証方法:** テストによる検証

### FR-ASPB-006: スライド切替時のリセット

スライドが切り替わった際（手動操作・自動遷移の両方）、プログレスバーは0%にリセットされる。新しいスライドの条件（音声あり/なし）に応じて、適切なモード（音声プログレス/タイマープログレス）で再度進行を開始する。

**優先度:** Should

**検証方法:** テストによる検証

### FR-ASPB-007: 発表者ビュープログレスバー

発表者ビューウィンドウのコントロールバー（ナビゲーションボタン・音声コントロールが配置されたヘッダー）にある自動スライドショーボタン上に、メインウィンドウと同じ進行状況を示す塗りつぶしオーバーレイを表示する。進行状況はメインウィンドウから Tauri Event（`emit`/`listen`、イベント名 `'presenter-view'`）経由で同期される。自動スライドショーがOFFの場合は非表示とする。

**優先度:** Should

**検証方法:** デモンストレーションによる検証

## 4.2. 設計制約

### DC-ASPB-001: テーマ準拠のスタイリング

プログレスバーのスタイリングはCSS変数（`--theme-*`）を使用し、テーマカラーとの統一感を保つ（CONSTITUTION.md A-002
準拠）。色のハードコードは禁止する。

### DC-ASPB-002: コンテンツ非干渉

プログレスバーはスライドコンテンツの視認性・伝達力を損なわない位置・サイズ・透明度で配置する（CONSTITUTION.md B-001 準拠）。

### DC-ASPB-003: ライフサイクル管理

プログレスバーのアニメーションフレーム（requestAnimationFrame等）やタイマーのライフサイクルは useEffect
で管理し、コンポーネントのアンマウント時やスライド遷移時にリソースを解放する（CONSTITUTION.md T-003 準拠）。

---

# 5. 制約事項

## 5.1. 技術的制約

- TypeScript strict モードで型安全性を確保すること（T-001 準拠）
- Reveal.js の DOM 構造との互換性を維持すること（T-002 準拠）
- アニメーション・タイマーのライフサイクルは useEffect で管理し、クリーンアップ時にリソースを解放すること（T-003 準拠）
- スタイリングは3層モデルに従い、テーマカラーは CSS変数（`--theme-*`）経由で参照すること（A-002 準拠）

## 5.2. ビジネス的制約

- プレゼンテーションの視覚的品質と伝達力を損なわないこと（B-001 準拠）
- プログレスバーは補助的なUI要素であり、スライドの主要コンテンツを遮らないこと

---

# 6. 前提条件

- メインウィンドウでプレゼンテーションが正常に動作していること
- 自動スライドショー機能（[speaker-note-audio.md](./speaker-note-audio.md) FR_SNA_005, FR_SNA_006）が実装済みであること
- 音声再生機能（[speaker-note-audio.md](./speaker-note-audio.md) FR_SNA_001〜FR_SNA_003）が実装済みであること
- タイマーベース自動スクロール機能（[auto-scroll-timer.md](./auto-scroll-timer.md) FR_AST_001）が実装済みまたは同時に実装されること

---

# 7. スコープ外

以下は本PRDのスコープ外とします：

- 残り秒数のテキスト表示（数値カウントダウン）
- プログレスバーのクリックによるシーク操作
- プログレスバーの色・スタイルのカスタマイズUI

---

# 8. 用語集

| 用語                        | 定義                                 |
|---------------------------|------------------------------------|
| 進行インジケーター（プログレス表示） | 自動スクロールの進行状況を可視化するUI要素。メインウィンドウでは自動スライドショーボタン周囲の円形リング（SVG）、発表者ビューでは同ボタンを下から上へ塗りつぶすオーバーレイとして表示する |
| 音声プログレス（Audio Progress）   | 音声ファイル再生の進行に基づくプログレスバーの表示モード       |
| タイマープログレス（Timer Progress） | タイマーベース自動スクロールの進行に基づくプログレスバーの表示モード |
| スクロールスピード（Scroll Speed）   | 音声未定義スライドで次スライドへ自動遷移するまでの待機時間（秒）   |
