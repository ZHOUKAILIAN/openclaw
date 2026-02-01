import { getLarkRuntime } from "./runtime.js";
import type { ResolvedLarkAccount } from "./types.js";

type TenantTokenResponse = {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function nowMs(): number {
  return Date.now();
}

export async function getTenantAccessToken(account: ResolvedLarkAccount): Promise<string> {
  const appId = account.appId;
  const appSecret = account.appSecret;
  if (!appId || !appSecret) {
    throw new Error("Lark appId/appSecret not configured");
  }

  const cacheKey = `${account.accountId}:${appId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - nowMs() > 30_000) {
    return cached.token;
  }

  // Using the "internal" token endpoint (typical for internal apps).
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  if (!res.ok) {
    throw new Error(`Lark token request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as TenantTokenResponse;
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`Lark token request error: ${json.code} ${json.msg ?? "unknown"}`);
  }

  const expireSeconds = typeof json.expire === "number" ? json.expire : 0;
  const expiresAt = nowMs() + Math.max(0, expireSeconds) * 1000;
  tokenCache.set(cacheKey, { token: json.tenant_access_token, expiresAt });
  return json.tenant_access_token;
}

export async function larkFetchJson(params: {
  account: ResolvedLarkAccount;
  path: string;
  method?: string;
  body?: unknown;
}): Promise<unknown> {
  const token = await getTenantAccessToken(params.account);
  const res = await fetch(`https://open.feishu.cn/open-apis${params.path}`, {
    method: params.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new Error(`Lark API ${params.path} failed: ${res.status} ${res.statusText}: ${text}`);
  }

  // Lark APIs typically include { code, msg, data }
  if (parsed && typeof parsed === "object" && "code" in parsed) {
    const code = (parsed as any).code;
    if (typeof code === "number" && code !== 0) {
      throw new Error(`Lark API ${params.path} error: ${code} ${(parsed as any).msg ?? ""}`);
    }
  }

  return parsed;
}

export function getLogger() {
  return getLarkRuntime().logging.getChildLogger({ channel: "lark" });
}
