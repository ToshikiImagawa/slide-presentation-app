# アドオンリファレンス

## entry.ts テンプレート

### 単一コンポーネント

```typescript
import { MyComponent } from './MyComponent'

declare global {
  interface Window {
    __ADDON_REGISTER__?: (addonName: string, components: Array<{
      name: string;
      component: React.ComponentType<Record<string, unknown>>
    }>) => void
  }
}

const register = window.__ADDON_REGISTER__
if (register) {
  register('my-addon', [{ name: 'MyComponent', component: MyComponent }])
}
```

### 複数コンポーネント

```typescript
import { ComponentA } from './ComponentA'
import { ComponentB } from './ComponentB'

declare global {
  interface Window {
    __ADDON_REGISTER__?: (addonName: string, components: Array<{
      name: string;
      component: React.ComponentType<Record<string, unknown>>
    }>) => void
  }
}

const register = window.__ADDON_REGISTER__
if (register) {
  register('my-addon', [
    { name: 'ComponentA', component: ComponentA },
    { name: 'ComponentB', component: ComponentB },
  ])
}
```

### 共有モジュール（複数コンポーネントで共通コードを使う場合）

複数コンポーネントがアイコン等の共通コードを参照する場合、`entry.ts` に登録しない共有モジュールをアドオン内に置いて import する。アドオンは `react`/`react/jsx-runtime` 以外の外部パッケージを使えないため、アイコンセット等を個別に自前実装しつつコンポーネント間で再利用するにはこの方法が現実的な解決策になる。

- **配置**: `addons/src/{アドオン名}/` 直下に他のコンポーネントと同じ階層で置く（サブディレクトリを切る必要はない）
- **命名**: コンポーネントではないことが分かるよう、内容を表す名詞をキャメルケース（またはロワーケース）で付ける（例: `icons.tsx`）。パスカルケースはコンポーネント専用の命名規約なので使わない
- **登録**: `entry.ts` には登録しない。登録するのは実際にスライドから参照するコンポーネントのみ

```
addons/src/my-addon/
├── entry.ts             # ComponentA / ComponentB のみ登録
├── icons.tsx            # 共有モジュール（非登録）
├── ComponentA.tsx
├── ComponentA.module.css
├── ComponentB.tsx
└── ComponentB.module.css
```

```tsx
// icons.tsx（共有モジュール。entry.ts に登録しない）
import type { CSSProperties } from 'react'

export function CheckIcon({ style }: { style?: CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={style}>
      <path d="/* アイコンのpathデータ */" />
    </svg>
  )
}
```

```tsx
// ComponentA.tsx（icons.tsx を相対パスで import する）
import { CheckIcon } from './icons.tsx'
import styles from './ComponentA.module.css'

export function ComponentA() {
  return (
    <div className={styles.wrapper}>
      <CheckIcon style={{ fontSize: '20px' }} />
    </div>
  )
}
```

## コンポーネントテンプレート

### 基本形（props なし・自己完結型）

外部から値を渡さず、内部の CSS アニメーションだけで完結するビジュアルコンポーネント。スライド JSON 側で `style` を指定しても、それはこのコンポーネントの props としては渡らず、呼び出し元（`SlideRenderer`）がラップする `<div>` に適用される。

```tsx
import styles from './MyComponent.module.css'

export function MyComponent() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.pulseIcon} />
      <div className={styles.label}>Status: OK</div>
    </div>
  )
}
```

```css
.wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
}

.pulseIcon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--theme-success);
    animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
}
```

### props 使用パターン

```tsx
import styles from './MyComponent.module.css'

export function MyComponent(props: Record<string, unknown>) {
  const label = (props.label as string) ?? 'Default'
  const count = (props.count as number) ?? 0

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.label}>{label}</h3>
      <span className={styles.value}>{count}</span>
    </div>
  )
}
```

## CSS Module テンプレート

``` css
.wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-body);
}

.label {
    color: var(--theme-text-heading);
    margin-bottom: 16px;
}

.value {
    color: var(--theme-primary);
    font-size: 2em;
    font-weight: bold;
}

/* アニメーション例 */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.animated {
    animation: fadeInUp 0.6s ease-out both;
}
```

## テーマ CSS 変数一覧

### カラー変数

| 変数名                       | 用途              | デフォルト値    |
|---------------------------|-----------------|-----------|
| `--theme-primary`         | プライマリカラー（アクセント） | `#e07a5f` |
| `--theme-background`      | 背景色             | `#1c1917` |
| `--theme-background-alt`  | 代替背景色           | `#292524` |
| `--theme-background-grid` | グリッド背景色         | `#33302e` |
| `--theme-text-heading`    | 見出しテキスト         | `#faf8f5` |
| `--theme-text-body`       | 本文テキスト          | `#a8a29e` |
| `--theme-text-subtitle`   | サブタイトルテキスト      | `#d6d3d1` |
| `--theme-text-muted`      | ミュートテキスト        | `#78716c` |
| `--theme-border`          | ボーダー            | `#3d3835` |
| `--theme-border-light`    | ライトボーダー         | `#4a4543` |
| `--theme-success`         | 成功色             | `#4ade80` |
| `--theme-code-text`       | コードテキスト色        | `#fb923c` |

すべてのカラー変数には `-rgb` バリアント（例: `--theme-primary-rgb`）があり、`rgba()` で使用可能:

```css
{
    background: rgba(var(--theme-primary-rgb), 0.2);
}
```

### フォント変数

| 変数名                    | 用途      |
|------------------------|---------|
| `--theme-font-heading` | 見出しフォント |
| `--theme-font-body`    | 本文フォント  |
| `--theme-font-code`    | コードフォント |

## スライド JSON での使用例

### content レイアウト

```json
{
  "id": "slide-demo",
  "layout": "content",
  "content": {
    "title": "デモ",
    "component": {
      "name": "MyComponent",
      "props": {
        "label": "Hello",
        "count": 42
      }
    }
  }
}
```

### custom レイアウト

```json
{
  "id": "slide-custom",
  "layout": "custom",
  "content": {
    "component": {
      "name": "MyComponent",
      "props": {}
    }
  }
}
```

### two-column レイアウト

```json
{
  "id": "slide-columns",
  "layout": "two-column",
  "content": {
    "title": "比較",
    "left": {
      "subtitle": "説明",
      "body": "左カラムのテキスト"
    },
    "right": {
      "component": {
        "name": "MyComponent",
        "props": {
          "label": "右側"
        }
      }
    }
  }
}
```