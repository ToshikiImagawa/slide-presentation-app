import { afterAll, beforeAll } from 'vitest'

/** jsdom はレイアウトを持たず offsetWidth/offsetHeight が常に 0 なので、DiagramCanvas の実測値を差し替える
 * （Flow.test.tsx と同じ手法。structureDiagram の各コンポーネントテストで共有する） */
export function mockDiagramCanvasSize(width = 1200, height = 500): void {
  const original = {
    width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
  }

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => width })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height })
  })

  afterAll(() => {
    if (original.width) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original.width)
    if (original.height) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original.height)
  })
}
