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

/** 余额不足（服务端 402）：视图据此跳过通用错误红框，改由余额不足弹窗引导充值/领取。 */
export class InsufficientCreditsError extends Error {
  constructor(public remaining?: number, public estimate?: number) {
    super("insufficient-credits");
    this.name = "InsufficientCreditsError";
  }
}

export function isInsufficient(e: unknown): boolean {
  return e instanceof InsufficientCreditsError;
}
