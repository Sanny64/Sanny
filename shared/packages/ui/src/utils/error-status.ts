export const supportedStatuses = [400, 401, 403, 404, 429, 500, 503] as const;
export type ErrorStatus = (typeof supportedStatuses)[number];

export function getErrorStatus(
  value: string | number | null,
  fallback: ErrorStatus = 500,
): ErrorStatus {
  if (value === null) return fallback;
  const parsed = Number(value);
  const supportedStatus = supportedStatuses.find((status) => status === parsed);
  if (supportedStatus) return supportedStatus;
  return Number.isInteger(parsed) && parsed >= 400 && parsed < 500 ? 400 : 500;
}
