export function getErrorPageRedirectUrl(
  frontendUrl: string,
  status: number,
): string {
  const url = new URL(frontendUrl);
  url.pathname = "/error";
  url.search = "";
  url.hash = "";
  const safeStatus =
    Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  url.searchParams.set("status", String(safeStatus));
  return url.toString();
}

export function getHtmlErrorRedirectUrl(
  request: { headers: { accept?: string | string[] | undefined } },
  status: number,
  frontendUrl: string,
): string | null {
  if (status < 400 || !acceptsHtmlNavigation(request)) return null;
  return getErrorPageRedirectUrl(frontendUrl, status);
}

export function acceptsHtmlNavigation(request: {
  headers: { accept?: string | string[] | undefined };
}): boolean {
  const acceptHeader = request.headers.accept;
  const accept = Array.isArray(acceptHeader)
    ? acceptHeader.join(",")
    : acceptHeader;
  if (typeof accept !== "string") return false;

  return accept.split(",").some((entry) => {
    const [mediaType, ...parameters] = entry.split(";");
    if (mediaType?.trim().toLowerCase() !== "text/html") return false;
    const quality = parameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter.startsWith("q="));
    if (!quality) return true;
    const qualityValue = Number(quality.slice(2));
    return (
      Number.isFinite(qualityValue) && qualityValue > 0 && qualityValue <= 1
    );
  });
}
