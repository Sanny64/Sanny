import { requiredEnv } from "./config.js";

export type AccountLinkContinuation = {
  state: string;
  decision: "confirm" | "cancel";
  primaryUserId: string;
  secondaryUserId: string;
  temporaryUserId?: string;
  proof?: string;
};

export function getAccountLinkContinuationUrl(query: AccountLinkContinuation) {
  const url = new URL(`https://${requiredEnv("AUTH0_DOMAIN")}/continue`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
