const VIDEO_URL_HOST_RE =
  /(^|\.)((tiktok\.com)|(vm\.tiktok\.com)|(instagram\.com)|(instagr\.am))$/i;

export function isVideoRecipeUrl(url: string): boolean {
  try {
    return VIDEO_URL_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
