/**
 * グローバルなキーボードショートカットを無視すべきフォーカス状態か判定する。
 *
 * `window` に直接 keydown を購読する箇所（Root の ? キー・App の T キー・編集画面の Esc）が
 * 共通で必要とする判定。条件を増やすときは 1 箇所で済むようここに集約している
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}
