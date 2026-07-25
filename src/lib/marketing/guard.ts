// 积分护栏取消哨兵（运营中心 / 设计 §6.1）。
// run() 在用户取消确认时 reject 此错误；视图捕获后据此跳过"错误红框"，
// 因为取消不是失败，只是未发起请求。

export class GuardCancelledError extends Error {
  constructor() {
    super("guard-cancelled");
    this.name = "GuardCancelledError";
  }
}

export function isGuardCancel(e: unknown): boolean {
  return e instanceof GuardCancelledError;
}
