import { getTenantAccessToken } from "./api.js";
import type { ResolvedLarkAccount } from "./types.js";

export async function probeLark(account: ResolvedLarkAccount): Promise<{ ok: boolean }> {
  await getTenantAccessToken(account);
  return { ok: true };
}
