const DEFAULT_SITE_URL = "https://i-money-five.vercel.app";

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
}

export function localRedirectPath(value: FormDataEntryValue | string | null | undefined, fallback = "/onboarding") {
  const path = String(value || fallback);
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl()).toString();
}
