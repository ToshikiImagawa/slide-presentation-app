import type { ComponentType } from 'react'

/** レジストリに登録可能なコンポーネントの型 */
export type RegisteredComponent = ComponentType<Record<string, unknown>>

const defaultComponents = new Map<string, RegisteredComponent>()
const customComponents = new Map<string, RegisteredComponent>()

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

/** カスタムコンポーネントを登録する（デフォルトを上書き） */
export function registerComponent(name: string, component: RegisteredComponent): void {
  customComponents.set(name, component)
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
}
