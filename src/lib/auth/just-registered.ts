/** sessionStorage flag: user just completed registration and is entering the next step. */
export const JUST_REGISTERED_KEY = "tb_auth_just_registered";

export function markJustRegistered(): void {
  try {
    sessionStorage.setItem(JUST_REGISTERED_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

/** Read and clear the just-registered flag (one-shot). */
export function consumeJustRegistered(): boolean {
  try {
    if (sessionStorage.getItem(JUST_REGISTERED_KEY) !== "1") return false;
    sessionStorage.removeItem(JUST_REGISTERED_KEY);
    return true;
  } catch {
    return false;
  }
}
