export interface MediaItem {
  id: string;
  title: string;
  /** Public-directory path (relative to the site), or an absolute media URL. */
  src: string;
  poster?: string;
  projectUrl?: string;
  /** GitHub repository opened by the player's GitHub button. */
  sourceUrl?: string;
}

// Put each project's demo and poster in public/media/<project-name>/, then add
// its entry here. Only the selected video's source is loaded on play.
// Example:
// { id: "project", title: "My project", src: "media/project/demo.mp4",
//   poster: "media/project/poster.webp", sourceUrl: "https://github.com/…" }
export const mediaLibrary: readonly MediaItem[] = [];

export function mediaUrl(path: string) {
  return /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(path)
    ? path : `${import.meta.env.BASE_URL}${path}`;
}
