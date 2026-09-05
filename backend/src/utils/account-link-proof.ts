import { createHmac, timingSafeEqual } from "node:crypto";

const proofTtlMs = 2 * 60 * 1000;

type AccountLinkProof = {
  primaryUserId: string;
  secondaryUserId: string;
  expiresAt: number;
};

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAccountLinkProof(
  primaryUserId: string,
  secondaryUserId: string,
  secret: string,
  now = Date.now(),
) {
  const payload = encode(
    JSON.stringify({
      primaryUserId,
      secondaryUserId,
      expiresAt: now + proofTtlMs,
    } satisfies AccountLinkProof),
  );
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAccountLinkProof(
  proof: string | undefined,
  primaryUserId: string,
  secondaryUserId: string,
  secret: string,
  now = Date.now(),
) {
  if (!proof) return false;
  const [payload, signature, ...extra] = proof.split(".");
  if (!payload || !signature || extra.length > 0) return false;

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }

  try {
    const parsed = JSON.parse(decode(payload)) as AccountLinkProof;
    return (
      parsed.primaryUserId === primaryUserId &&
      parsed.secondaryUserId === secondaryUserId &&
      Number.isSafeInteger(parsed.expiresAt) &&
      parsed.expiresAt > now
    );
  } catch {
    return false;
  }
}
