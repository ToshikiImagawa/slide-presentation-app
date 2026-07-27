import type { ComponentType } from 'react'

/** レジストリに登録可能なコンポーネントの型 */
export type RegisteredComponent = ComponentType<Record<string, unknown>>

const defaultComponents = new Map<string, RegisteredComponent>()
const customComponents = new Map<string, RegisteredComponent>()
/** カスタム登録の所有者（owner）を記録する。owner 単位でのアンロードに使用する（name → owner） */
const customOwners = new Map<string, string>()

/** フォールバックコンポーネント（未登録名指定時に使用） */
const FallbackComponent = ({ name }: { name?: string; [_: string]: unknown }) => (
  <div
    style={{
      padding: '16px',
      border: '1px dashed var(--theme-text-muted)',
      borderRadius: '8px',
      textAlign: 'center',
      color: 'var(--theme-text-body)',
      opacity: 0.6,
    }}
  >
    <p>Component not found: {name ?? 'unknown'}</p>
  </div>
)

/** デフォルトコンポーネントを登録する */
export function registerDefaultComponent(name: string, component: RegisteredComponent): void {
  defaultComponents.set(name, component)
}

/**
 * カスタムコンポーネントを登録する（デフォルトを上書き）。
 * owner を指定すると、その所有者スコープで登録され、unregisterOwner でまとめて破棄できる。
 * 同名で異なる owner による上書きが発生した場合は警告する（パッケージ切替時の名前衝突検知）。
 */
export function registerComponent(name: string, component: RegisteredComponent, owner?: string): void {
  if (owner !== undefined) {
    const existingOwner = customOwners.get(name)
    if (existingOwner !== undefined && existingOwner !== owner) {
      console.warn(`[ComponentRegistry] コンポーネント "${name}" が owner "${existingOwner}" から owner "${owner}" に上書きされます`)
    }
    customOwners.set(name, owner)
  }
  customComponents.set(name, component)
}

/** 指定した owner に属するカスタム登録のみを削除する（デフォルト登録は温存する） */
export function unregisterOwner(owner: string): void {
  for (const [name, componentOwner] of customOwners) {
    if (componentOwner === owner) {
      customComponents.delete(name)
      customOwners.delete(name)
    }
  }
}

/** コンポーネントを解決する（カスタム → デフォルト → フォールバックの優先順） */
export function resolveComponent(name: string): RegisteredComponent {
  return customComponents.get(name) ?? defaultComponents.get(name) ?? FallbackComponent
}

/** 登録済みコンポーネント名一覧を取得する */
export function getRegisteredComponents(): string[] {
  const names = new Set<string>([...defaultComponents.keys(), ...customComponents.keys()])
  return Array.from(names).sort()
}

/** レジストリをクリアする（テスト用） */
export function clearRegistry(): void {
  defaultComponents.clear()
  customComponents.clear()
  customOwners.clear()
}
