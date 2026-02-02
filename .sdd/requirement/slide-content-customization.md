# スライドコンテンツカスタマイズ 要求仕様書

## 概要

このドキュメントは、プレゼンテーションのスライドコンテンツをJSON等の構造化データとカスタムデザインコンポーネントにより差し替え可能にする機能の要求仕様を定義します。

既存の10枚のスライドをデモ用テンプレートと位置づけ、外部データファイルとプラグイン型コンポーネントの仕組みにより、コードを直接変更せずにプレゼンテーション内容を柔軟に変更できるようにすることを目的とします。

### 背景

現在のプレゼンテーションでは、スライドの内容（テキスト、構成、レイアウト）がReactコンポーネント内にハードコードされています。スライド内容を変更するにはソースコードを直接編集する必要があり、開発者以外が資料を更新することが困難です。また、同じプレゼンテーション構造を異なるテーマや内容で再利用する仕組みが存在しません。

### 目的

- プレゼンテーション内容をソースコードから分離し、データ駆動で管理できるようにする
- 開発者がカスタムコンポーネントやレイアウトを拡張できる仕組みを提供する
- 非技術者がJSONファイルを編集するだけでスライド内容を差し替えられるようにする
- 既存のデモ用スライドをデフォルトテンプレートとして保持する

---

# 1. 要求図の読み方

## 1.1. 要求タイプ

- **requirement**: 一般的な要求
- **functionalRequirement**: 機能要求
- **performanceRequirement**: パフォーマンス要求
- **interfaceRequirement**: インターフェース要求
- **designConstraint**: 設計制約

## 1.2. リスクレベル

- **High**: 高リスク（ビジネスクリティカル、実装困難）
- **Medium**: 中リスク（重要だが代替可能）
- **Low**: 低リスク（Nice to have）

## 1.3. 検証方法

- **Analysis**: 分析による検証
- **Test**: テストによる検証
- **Demonstration**: デモンストレーションによる検証
- **Inspection**: インスペクション（レビュー）による検証

## 1.4. 関係タイプ

- **contains**: 包含関係（親要求が子要求を含む）
- **derives**: 派生関係（要求から別の要求が導出される）
- **satisfies**: 満足関係（要素が要求を満たす）
- **verifies**: 検証関係（テストケースが要求を検証する）
- **refines**: 詳細化関係（要求をより詳細に定義する）
- **traces**: トレース関係（要求間の追跡可能性）

---

# 2. 要求一覧

## 2.1. ユースケース図（概要）

```mermaid
graph TB
    subgraph "スライドコンテンツカスタマイズ"
        Developer((開発者))
        ContentEditor((コンテンツ編集者))
        System[プレゼンテーションシステム]
        DataDef[コンテンツデータ定義]
        ThemeCustom["テーマ・デザイン拡張"]
        ComponentExt[カスタムコンポーネント拡張]
        DefaultTemplate[デフォルトテンプレート提供]
        DataValidation[データバリデーション]
    end

    Developer --> ThemeCustom
    Developer --> ComponentExt
    Developer --> DataDef
    ContentEditor --> DataDef
    System --> DefaultTemplate
    System --> DataValidation
```

## 2.2. 機能一覧（テキスト形式）

- データ駆動型コンテンツ管理
    - JSONフォーマットによるスライドコンテンツ定義
    - スライド構成（枚数・順序・レイアウト種別）の定義
    - テキストコンテンツ（タイトル、本文、リスト項目）の定義
    - メタ情報（アニメーション設定、フラグメント表示、スピーカーノート）の定義
- テーマ・デザインカスタマイズ
    - カラーパレット・フォントの外部定義
    - レイアウト種別（2カラム、タイル、タイムライン等）の選択と追加
    - カスタムCSSの適用
- コンポーネント拡張
    - カスタムReactコンポーネントのプラグイン的登録
    - スライドデータからカスタムコンポーネントの参照
    - デフォルトコンポーネントの上書き
- デフォルトテンプレート
    - 既存の10枚スライドをデフォルトデータとして提供
    - データファイルが未指定時にデフォルトで表示
- データバリデーション
    - JSONスキーマによるデータ構造の検証
    - 不正なデータ入力時のエラーメッセージ表示

---

# 3. 要求図（SysML Requirements Diagram）

## 3.1. 全体要求図

```mermaid
requirementDiagram
    requirement SlideContentCustomization {
        id: UR_100
        text: "スライド資料の内容を、構造化データファイルとカスタムデザインコンポーネントを指定することで、コードを直接変更せずに差し替えられること"
        risk: high
        verifymethod: demonstration
    }

    functionalRequirement DataDrivenContent {
        id: FR_100
        text: "JSONフォーマットの構造化データによりスライドのテキスト、構成、メタ情報を定義し、プレゼンテーションに反映できること"
        risk: high
        verifymethod: test
    }

    functionalRequirement ThemeCustomization {
        id: FR_200
        text: "カラーパレット、フォント、レイアウトを含むテーマを外部定義し、プレゼンテーションの視覚的デザインを切り替えられること"
        risk: medium
        verifymethod: demonstration
    }

    functionalRequirement ComponentExtension {
        id: FR_300
        text: "開発者がカスタムReactコンポーネントをプラグイン的に登録し、スライドデータから参照して使用できること"
        risk: high
        verifymethod: test
    }

    functionalRequirement DefaultTemplate {
        id: FR_400
        text: "既存の10枚のデモ用スライドをデフォルトテンプレートとして提供し、データ未指定時にそのまま表示されること"
        risk: low
        verifymethod: test
    }

    functionalRequirement DataValidation {
        id: FR_500
        text: "スライドデータの構造を検証し、不正なデータが入力された場合に分かりやすいエラーメッセージを表示すること"
        risk: medium
        verifymethod: test
    }

    SlideContentCustomization - contains -> DataDrivenContent
    SlideContentCustomization - contains -> ThemeCustomization
    SlideContentCustomization - contains -> ComponentExtension
    SlideContentCustomization - contains -> DefaultTemplate
    SlideContentCustomization - contains -> DataValidation
```

## 3.2. データ駆動型コンテンツ要求図

```mermaid
requirementDiagram
    functionalRequirement DataDrivenContent {
        id: FR_100
        text: "JSONフォーマットの構造化データによりスライドのテキスト、構成、メタ情報を定義し、プレゼンテーションに反映できること"
        risk: high
        verifymethod: test
    }

    functionalRequirement SlideStructureDefinition {
        id: FR_101
        text: "スライドの枚数、順序、各スライドに使用するレイアウト種別をJSONで定義できること"
        risk: high
        verifymethod: test
    }

    functionalRequirement TextContentDefinition {
        id: FR_102
        text: "各スライドのタイトル、本文、リスト項目、強調テキスト等のテキストコンテンツをJSONで定義できること"
        risk: high
        verifymethod: test
    }

    functionalRequirement MetaInfoDefinition {
        id: FR_103
        text: "各スライドのアニメーション設定、フラグメント表示順序、スピーカーノート等のメタ情報をJSONで定義できること"
        risk: medium
        verifymethod: test
    }

    functionalRequirement DataFileLoading {
        id: FR_104
        text: "指定されたJSONデータファイルを読み込み、スライドコンテンツとして動的にレンダリングできること"
        risk: high
        verifymethod: test
    }

    DataDrivenContent - contains -> SlideStructureDefinition
    DataDrivenContent - contains -> TextContentDefinition
    DataDrivenContent - contains -> MetaInfoDefinition
    DataDrivenContent - contains -> DataFileLoading
```

## 3.3. テーマ・デザインカスタマイズ要求図

```mermaid
requirementDiagram
    functionalRequirement ThemeCustomization {
        id: FR_200
        text: "カラーパレット、フォント、レイアウトを含むテーマを外部定義し、プレゼンテーションの視覚的デザインを切り替えられること"
        risk: medium
        verifymethod: demonstration
    }

    functionalRequirement ColorPaletteDefinition {
        id: FR_201
        text: "プライマリカラー、アクセントカラー、背景色、テキスト色等のカラーパレットを外部データで定義できること"
        risk: medium
        verifymethod: demonstration
    }

    functionalRequirement FontDefinition {
        id: FR_202
        text: "見出し用フォント、本文用フォント、コード用フォントを外部データで定義できること"
        risk: low
        verifymethod: demonstration
    }

    functionalRequirement LayoutSelection {
        id: FR_203
        text: "各スライドに適用するレイアウト種別（2カラム、タイル、タイムライン、ブリード等）をデータから指定でき、新しいレイアウトを追加登録できること"
        risk: medium
        verifymethod: test
    }

    functionalRequirement CustomCSS {
        id: FR_204
        text: "テーマ定義に加えてカスタムCSSを指定し、デフォルトスタイルを上書きできること"
        risk: low
        verifymethod: demonstration
    }

    ThemeCustomization - contains -> ColorPaletteDefinition
    ThemeCustomization - contains -> FontDefinition
    ThemeCustomization - contains -> LayoutSelection
    ThemeCustomization - contains -> CustomCSS
```

## 3.4. コンポーネント拡張要求図

```mermaid
requirementDiagram
    functionalRequirement ComponentExtension {
        id: FR_300
        text: "開発者がカスタムReactコンポーネントをプラグイン的に登録し、スライドデータから参照して使用できること"
        risk: high
        verifymethod: test
    }

    functionalRequirement ComponentRegistration {
        id: FR_301
        text: "開発者がカスタムReactコンポーネントを名前付きで登録し、スライドデータの中でその名前で参照できること"
        risk: high
        verifymethod: test
    }

    functionalRequirement ComponentOverride {
        id: FR_302
        text: "デフォルトで提供されるスライドコンポーネントをカスタムコンポーネントで上書きできること"
        risk: medium
        verifymethod: test
    }

    functionalRequirement ComponentProps {
        id: FR_303
        text: "スライドデータからカスタムコンポーネントにprops（パラメータ）を渡せること"
        risk: medium
        verifymethod: test
    }

    ComponentExtension - contains -> ComponentRegistration
    ComponentExtension - contains -> ComponentOverride
    ComponentExtension - contains -> ComponentProps
```

## 3.5. デフォルトテンプレートおよびバリデーション要求図

```mermaid
requirementDiagram
    functionalRequirement DefaultTemplate {
        id: FR_400
        text: "既存の10枚のデモ用スライドをデフォルトテンプレートとして提供し、データ未指定時にそのまま表示されること"
        risk: low
        verifymethod: test
    }

    functionalRequirement DefaultData {
        id: FR_401
        text: "現在のハードコードされたスライド内容をJSON形式のデフォルトデータとして提供すること"
        risk: low
        verifymethod: test
    }

    functionalRequirement FallbackBehavior {
        id: FR_402
        text: "外部データファイルが未指定または読み込み失敗時に、デフォルトデータにフォールバックして表示すること"
        risk: medium
        verifymethod: test
    }

    functionalRequirement DataValidation {
        id: FR_500
        text: "スライドデータの構造を検証し、不正なデータが入力された場合に分かりやすいエラーメッセージを表示すること"
        risk: medium
        verifymethod: test
    }

    functionalRequirement SchemaValidation {
        id: FR_501
        text: "JSONスキーマに基づいてスライドデータの構造を検証し、必須フィールドの欠落や型の不一致を検出すること"
        risk: medium
        verifymethod: test
    }

    functionalRequirement ErrorDisplay {
        id: FR_502
        text: "データ検証エラー発生時に、エラー箇所と修正方法を含むメッセージを開発コンソールまたは画面上に表示すること"
        risk: low
        verifymethod: demonstration
    }

    DefaultTemplate - contains -> DefaultData
    DefaultTemplate - contains -> FallbackBehavior
    DataValidation - contains -> SchemaValidation
    DataValidation - contains -> ErrorDisplay
```

## 3.6. 非機能要求図

```mermaid
requirementDiagram
    performanceRequirement BuildPerformance {
        id: NFR_100
        text: "JSONデータからのスライド生成が開発サーバー起動時に完了し、HMRによるデータ変更反映が即座に行われること"
        risk: medium
        verifymethod: test
    }

    interfaceRequirement DataFormat {
        id: NFR_101
        text: "スライドデータフォーマットがJSONスキーマで文書化され、エディタの入力補完が利用可能であること"
        risk: medium
        verifymethod: inspection
    }

    performanceRequirement BackwardCompatibility {
        id: NFR_102
        text: "デフォルトデータ使用時に、既存のプレゼンテーションと見た目・動作が完全に同一であること"
        risk: high
        verifymethod: test
    }

    designConstraint RevealJSCompatibility {
        id: NFR_103
        text: "データ駆動で生成されたスライドがReveal.jsのDOM構造（.reveal > .slides > section）を維持すること"
        risk: high
        verifymethod: test
    }

    designConstraint TypeSafety {
        id: NFR_104
        text: "スライドデータの型定義がTypeScriptの型システムで表現され、型安全にデータを扱えること"
        risk: medium
        verifymethod: test
    }
```

## 3.7. 要求間のトレーサビリティ

```mermaid
requirementDiagram
    requirement SlideContentCustomization {
        id: UR_100
        text: "スライド資料の内容をデータとカスタムコンポーネントで差し替え可能にすること"
        risk: high
        verifymethod: demonstration
    }

    designConstraint RevealJSCompatibility {
        id: NFR_103
        text: "Reveal.jsのDOM構造を維持すること"
        risk: high
        verifymethod: test
    }

    performanceRequirement BackwardCompatibility {
        id: NFR_102
        text: "デフォルトデータ使用時に既存プレゼンテーションと同一であること"
        risk: high
        verifymethod: test
    }

    SlideContentCustomization - derives -> RevealJSCompatibility
    SlideContentCustomization - derives -> BackwardCompatibility
```

---

# 4. 要求の詳細説明

## 4.1. ユーザ要求

### UR_100: スライドコンテンツカスタマイズ

スライド資料の内容を、構造化データファイル（JSON）とカスタムデザインコンポーネントを指定することで、ソースコードを直接変更せずに差し替えられること。既存のデモ用スライドはデフォルトテンプレートとして保持し、データファイルの編集のみで資料内容を変更できる仕組みを提供する。

開発者がカスタムコンポーネントやテーマの初期設定を行い、非技術者（プレゼンテーション作成者）がJSONファイルの編集で内容を差し替える運用を想定する。

**優先度:** Must

**検証方法:** デモンストレーション — デフォルトデータとカスタムデータの両方でプレゼンテーションが正しく表示されることを確認

## 4.2. 機能要求

### FR_100: データ駆動型コンテンツ管理

JSONフォーマットの構造化データにより、スライドのテキスト、構成（枚数・順序・レイアウト種別）、メタ情報（アニメーション、フラグメント、スピーカーノート）を定義し、プレゼンテーションに反映する。

**優先度:** Must

**検証方法:** テスト

| サブ要求   | 優先度    | 説明                                   |
|:-------|:-------|:-------------------------------------|
| FR_101 | Must   | スライド構成（枚数・順序・レイアウト種別）のJSON定義         |
| FR_102 | Must   | テキストコンテンツ（タイトル、本文、リスト等）のJSON定義       |
| FR_103 | Should | メタ情報（アニメーション、フラグメント、スピーカーノート）のJSON定義 |
| FR_104 | Must   | JSONデータファイルの読み込みと動的レンダリング            |

### FR_200: テーマ・デザインカスタマイズ

カラーパレット、フォント、レイアウト種別を含むテーマを外部定義し、プレゼンテーション全体の視覚的デザインを切り替えられるようにする。

**優先度:** Should

**検証方法:** デモンストレーション

| サブ要求   | 優先度    | 説明              |
|:-------|:-------|:----------------|
| FR_201 | Should | カラーパレットの外部定義    |
| FR_202 | Could  | フォントの外部定義       |
| FR_203 | Should | レイアウト種別の選択と追加登録 |
| FR_204 | Could  | カスタムCSSの適用      |

### FR_300: コンポーネント拡張

開発者がカスタムReactコンポーネントをプラグイン的に登録し、スライドデータの中で名前で参照して使用できるようにする。デフォルトコンポーネントの上書きも可能とする。

**優先度:** Should

**検証方法:** テスト

| サブ要求   | 優先度    | 説明                          |
|:-------|:-------|:----------------------------|
| FR_301 | Should | カスタムコンポーネントの名前付き登録          |
| FR_302 | Could  | デフォルトコンポーネントの上書き            |
| FR_303 | Should | スライドデータからコンポーネントへのprops受け渡し |

### FR_400: デフォルトテンプレート

既存の10枚のデモ用スライドをデフォルトテンプレートとして提供する。外部データファイルが未指定または読み込み失敗時には、デフォルトテンプレートにフォールバックして表示する。

**優先度:** Must

**検証方法:** テスト

| サブ要求   | 優先度  | 説明                             |
|:-------|:-----|:-------------------------------|
| FR_401 | Must | 現在のスライド内容をJSON形式のデフォルトデータとして提供 |
| FR_402 | Must | データ未指定・読み込み失敗時のフォールバック表示       |

### FR_500: データバリデーション

スライドデータの構造を検証し、不正なデータが入力された場合に分かりやすいエラーメッセージを表示する。

**優先度:** Should

**検証方法:** テスト

| サブ要求   | 優先度    | 説明                      |
|:-------|:-------|:------------------------|
| FR_501 | Should | JSONスキーマに基づくデータ構造検証     |
| FR_502 | Should | エラー箇所と修正方法を含むエラーメッセージ表示 |

## 4.3. 非機能要求

### NFR_100: ビルドパフォーマンス

JSONデータからのスライド生成が開発サーバー起動時に完了し、ViteのHMRによるデータ変更が即座にプレゼンテーションに反映されること。

**優先度:** Should

**検証方法:** テスト

### NFR_101: データフォーマットの文書化

スライドデータフォーマットがJSONスキーマで文書化され、VSCode等のエディタで入力補完（IntelliSense）が利用可能であること。

**優先度:** Should

**検証方法:** インスペクション

### NFR_102: 後方互換性

デフォルトデータを使用した場合のプレゼンテーションが、カスタマイズ機能導入前の既存プレゼンテーションと見た目・動作が完全に同一であること。

**優先度:** Must

**検証方法:** テスト — 既存のスライド表示と比較

### NFR_103: Reveal.js互換性

データ駆動で生成されたスライドが、Reveal.jsのDOM構造（`.reveal > .slides > section`）およびAPIとの互換性を維持すること。

**優先度:** Must

**検証方法:** テスト

### NFR_104: 型安全性

スライドデータの型定義がTypeScriptの型システムで表現され、JSONデータとコンポーネント間のインターフェースが型安全であること。

**優先度:** Must

**検証方法:** テスト（ビルド時型チェック）

---

# 5. 制約事項

## 5.1. 技術的制約

- React + TypeScript + Viteの技術スタックを維持すること
- Reveal.jsのプレゼンテーション機能との互換性を維持すること
- CSS Modules（スライド固有スタイル）とグローバルCSS（共通スタイル）の使い分けを維持すること
- TypeScript strictモードに準拠すること

## 5.2. ビジネス的制約

- 既存のデモ用プレゼンテーションの見た目・動作を一切変更しないこと（デフォルトデータとして保持）
- AI-SDDワークフローの価値提案を正確に伝えるデフォルトコンテンツを維持すること
- 非技術者がJSONファイルの編集のみでコンテンツ差し替えが可能であること

---

# 6. 前提条件

- Node.js環境が利用可能であること
- JSONファイルの基本的な編集が可能なテキストエディタが利用可能であること
- カスタムコンポーネント拡張（FR_300）を使用する場合は、React/TypeScriptの開発環境が必要
- ViteのJSON importおよびHMR機能が使用可能であること

---

# 7. スコープ外

以下は本PRDのスコープ外とします：

- GUIベースのスライドエディタ（WYSIWYGエディタ）の提供
- スライドデータのサーバーサイド管理・データベース保存
- 複数ユーザーによるリアルタイム共同編集
- スライドデータのバージョン管理機能（Gitで管理することを前提）
- JSON以外のデータフォーマット（YAML、TOML等）への対応
- プレゼンテーションのエクスポート（PDF、画像等）

---

# 8. 用語集

| 用語          | 定義                                                    |
|:------------|:------------------------------------------------------|
| スライドデータ     | プレゼンテーションの内容を定義するJSON形式の構造化データ                        |
| レイアウト種別     | スライドの表示形式（2カラム、タイル、タイムライン、ブリード画像等）                    |
| テーマ         | カラーパレット、フォント、レイアウトのデフォルト設定を含む視覚的定義                    |
| カスタムコンポーネント | 開発者が作成し、スライドデータから参照可能なReactコンポーネント                    |
| フォールバック     | 外部データが利用不可時にデフォルトデータに切り替わる動作                          |
| デフォルトテンプレート | 現在の10枚のデモ用スライドを再現するデフォルトのスライドデータ                      |
| フラグメント      | スライド内のコンテンツ要素を段階的に表示するReveal.jsの機能                    |
| HMR         | Hot Module Replacement。開発時にファイル変更を即座にブラウザに反映するViteの機能 |
| JSONスキーマ    | JSONデータの構造、型、必須フィールドを定義する仕様                           |
