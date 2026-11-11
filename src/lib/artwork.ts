/** Resize a YouTube thumbnail URL to the requested square size. */
export function artwork(url: string | undefined, size = 544): string {
  if (!url) return '';
  if (url.includes('ytimg.com') || url.includes('googleusercontent.com')) {
    return url.replace(/=w\d+-h\d+.*$/, `=w${size}-h${size}-l90-rj`);
  }
  return url;
}
