const DEFAULT_MOVEMENTS_RETURN_TO = "/movements";

export function safeMovementsReturnTo(value: FormDataEntryValue | string | string[] | null | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (typeof rawValue !== "string" || rawValue.length === 0) {
    return DEFAULT_MOVEMENTS_RETURN_TO;
  }

  try {
    const url = new URL(rawValue, "https://imoney.local");
    const isRelativeInternalPath = !/^[a-z][a-z\d+\-.]*:/i.test(rawValue) && !rawValue.startsWith("//");

    if (!isRelativeInternalPath || url.origin !== "https://imoney.local" || url.pathname !== DEFAULT_MOVEMENTS_RETURN_TO) {
      return DEFAULT_MOVEMENTS_RETURN_TO;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_MOVEMENTS_RETURN_TO;
  }
}
