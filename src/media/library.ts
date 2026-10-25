export interface MediaItem {
  id: string;
  title: string;
  /** Public-directory path (relative to the site), or an absolute media URL. */
  src: string;
  poster?: string;
  projectUrl?: string;
  /** GitHub repository opened by the player's GitHub button. */
  sourceUrl?: string;
  description?: string;
  /** Duration in seconds, recorded offline to avoid preloading every video. */
  duration?: number;
}

// Put each project's demo and poster in public/media/<project-name>/, then add
// its entry here. Only the selected video's source is loaded on play.
// Example:
// { id: "project", title: "My project", src: "media/project/demo.mp4",
//   poster: "media/project/poster.webp", sourceUrl: "https://github.com/…" }
export const mediaLibrary: readonly MediaItem[] = [
  {
    id: "credleaf",
    title: "Credleaf",
    src: "media/credleaf/demo.mp4",
    poster: "media/credleaf/poster.webp",
    sourceUrl: "https://github.com/Ala-ADN/Credleaf_",
    description:
      "A fact-checking and OSINT tool for exploring health misinformation through network graphs, timelines, and trust scores.",
    duration: 92.672,
  },
  {
    id: "voy",
    title: "Voy",
    src: "media/voy/demo.mp4",
    poster: "media/voy/poster.webp",
    sourceUrl: "https://github.com/Ala-ADN/voy-demo",
    description:
      "A graph-powered AI security analyst connecting MITRE ATLAS, OWASP LLM risks, and ISO 42001 controls to uncover compliance gaps.",
    duration: 79.168,
  },
  {
    id: "relib",
    title: "ReLib",
    src: "media/relib/demo.mp4",
    poster: "media/relib/poster.webp",
    sourceUrl: "https://github.com/saidiadem/relib",
    description:
      "An interactive knowledge graph exploring colonial history through Wikipedia articles, source attribution, and contrasting narratives.",
    duration: 90.024,
  },
  {
    id: "gommage",
    title: "Gommage",
    src: "media/gommage/demo.mp4",
    poster: "media/gommage/poster.webp",
    sourceUrl: "https://github.com/Ala-ADN/gommage",
    description:
      "A Jira-native debugger for AI agents: record execution traces, inspect tool calls, and replay edited runs without repeating live side effects.",
    duration: 146.048,
  },
  {
    id: "klippy",
    title: "Klippy",
    src: "media/klippy/demo.mp4",
    poster: "media/klippy/poster.webp",
    sourceUrl: "https://github.com/Rayen-Hamza/Klippy",
    description:
      "A local-first desktop assistant that searches documents, images, and audio using retrieval and knowledge graph reasoning with small language models.",
    duration: 49.408,
  },
];

export function mediaUrl(path: string) {
  return /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(path) ? path : `${import.meta.env.BASE_URL}${path}`;
}
