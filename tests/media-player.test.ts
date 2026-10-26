// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMediaPlayer as mountDesktopMediaPlayer } from "../src/ui/media-player";
import type { MediaItem } from "../src/media/library";

const items: MediaItem[] = [
  { id: "first", title: "First demo", src: "media/first/demo.mp4", poster: "media/first/poster.webp" },
  { id: "second", title: "Second demo", src: "media/second/demo.mp4", poster: "media/second/poster.webp" },
];
let player: ReturnType<typeof mountMediaPlayer>;
let host: HTMLElement;
function mountMediaPlayer(...args: Parameters<typeof mountDesktopMediaPlayer>) {
  const app = mountDesktopMediaPlayer(...args);
  host.querySelector<HTMLButtonElement>(".vlc-desktop-icon")!.click();
  return app;
}

beforeEach(() => {
  document.body.innerHTML = '<main id="portfolio-content"></main>';
  host = document.querySelector("main")!;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true });
    this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
    this.currentTime = 0;
    Object.defineProperty(this, "duration", { configurable: true, value: NaN });
  });
});

afterEach(() => {
  player?.destroy();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function button(action: string) {
  return host.querySelector<HTMLButtonElement>(`.vlc-toolbar [data-action="${action}"]`)!;
}

describe("desktop media player", () => {
  it("shows descriptions, offline durations, and independent repository links without fetching videos", () => {
    player = mountMediaPlayer(host, [
      { ...items[0], description: "Explore a knowledge graph.", duration: 79.168, sourceUrl: "https://github.com/example/first" },
      { ...items[1], description: "Compare source perspectives.", duration: 90.024, sourceUrl: "https://github.com/example/second" },
    ]);
    const descriptions = [...host.querySelectorAll(".vlc-playlist-description")].map(el => el.textContent);
    expect(descriptions).toEqual(["Explore a knowledge graph.", "Compare source perspectives."]);
    const durations = () => [...host.querySelectorAll(".vlc-playlist-duration")].map(el => el.textContent);
    expect(durations()).toEqual(["01:19", "01:30"]);
    expect(host.querySelector(".vlc-time")!.textContent).toBe("00:00 / 01:19");
    const sources = [...host.querySelectorAll<HTMLAnchorElement>(".vlc-playlist-source")];
    expect(sources.map(el => el.href)).toEqual(["https://github.com/example/first", "https://github.com/example/second"]);
    expect(sources.every(el => el.target === "_blank" && el.rel === "noopener noreferrer")).toBe(true);
    sources[1].addEventListener("click", event => event.preventDefault(), { once: true });
    sources[1].click();
    const video = host.querySelector("video")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(host.querySelector<HTMLElement>(".vlc-playlist")!.hidden).toBe(false);
    expect(host.querySelector('[aria-current="true"]')!.textContent).toContain("First demo");
    button("play").click();
    Object.defineProperty(video, "duration", { configurable: true, value: 80 });
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(durations()).toEqual(["01:20", "01:30"]);
  });
  it("starts closed and opens from its desktop icon without loading video", () => {
    player = mountDesktopMediaPlayer(host, items);
    expect(player.element.hidden).toBe(true);
    const video = host.querySelector("video")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.getAttribute("poster")).toBeNull();
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    host.querySelector<HTMLButtonElement>(".vlc-desktop-icon")!.click();
    expect(player.element.hidden).toBe(false);
    expect(host.querySelector<HTMLElement>(".vlc-playlist")!.hidden).toBe(false);
    expect(button("playlist").getAttribute("aria-pressed")).toBe("true");
    expect(video.getAttribute("src")).toBeNull();
    expect(video.poster).toContain("media/first/poster.webp");
  });
  it("shows the selected poster without loading videos, including the rest of the playlist", async () => {
    player = mountMediaPlayer(host, items);
    const video = host.querySelector("video")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.poster).toContain("media/first/poster.webp");
    expect(video.preload).toBe("none");
    expect(host.querySelectorAll("video")).toHaveLength(1);
    button("play").click();
    await Promise.resolve();
    expect(video.src).toContain("media/first/demo.mp4");
    expect(video.paused).toBe(false);
    expect(button("play").getAttribute("aria-label")).toBe("Pause");
    button("next").click();
    expect(video.getAttribute("src")).toBeNull();
    expect(video.paused).toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(video.poster).toContain("media/second/poster.webp");
    expect(host.querySelector(".vlc-status")!.textContent).toBe("Second demo");
    button("play").click();
    expect(video.src).toContain("media/second/demo.mp4");
  });

  it("leaves an empty project playlist idle without requesting a video", () => {
    player = mountMediaPlayer(host, []);
    expect(button("play").disabled).toBe(true);
    expect(button("github").disabled).toBe(true);
    button("play").click();
    expect(host.querySelector("video")!.getAttribute("src")).toBeNull();
    expect(host.querySelector(".vlc-playlist-empty")!.textContent).toBe("Project demos coming soon.");
  });

  it("opens the selected project's repository in a new tab and disables GitHub when none is supplied", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    player = mountMediaPlayer(host, [
      { ...items[0], sourceUrl: "https://github.com/example/first" },
      { ...items[1], sourceUrl: "https://github.com/example/second" },
      { id: "third", title: "Third demo", src: "media/third/demo.mp4" },
    ]);
    button("github").click();
    expect(open).toHaveBeenLastCalledWith("https://github.com/example/first", "_blank", "noopener,noreferrer");
    button("next").click();
    button("github").click();
    expect(open).toHaveBeenLastCalledWith("https://github.com/example/second", "_blank", "noopener,noreferrer");
    button("next").click();
    expect(button("github").disabled).toBe(true);
    button("github").click();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("seeks and changes volume through native sliders, without stealing their keyboard events", () => {
    player = mountMediaPlayer(host, items);
    button("play").click();
    const video = host.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    video.dispatchEvent(new Event("loadedmetadata"));
    const seek = host.querySelector<HTMLInputElement>(".vlc-seek")!;
    expect(seek.disabled).toBe(false);
    seek.value = "500";
    seek.dispatchEvent(new Event("input"));
    expect(video.currentTime).toBe(60);
    expect(host.querySelector(".vlc-time")!.textContent).toBe("01:00 / 02:00");
    player.element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(video.currentTime).toBe(65);
    seek.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(video.currentTime).toBe(65);
    const volume = host.querySelector<HTMLInputElement>(".vlc-volume-input")!;
    volume.value = "35";
    volume.dispatchEvent(new Event("input"));
    expect(video.volume).toBe(.35);
    button("mute").click();
    expect(video.muted).toBe(true);
    expect(host.querySelector(".vlc-volume-label")!.textContent).toBe("0%");
  });

  it("pauses on minimize, reopens from the desktop, and releases its source on close", () => {
    player = mountMediaPlayer(host, items);
    button("play").click();
    const video = host.querySelector("video")!;
    host.querySelector<HTMLButtonElement>('[aria-label="Minimize"]')!.click();
    expect(video.paused).toBe(true);
    expect(player.element.hidden).toBe(true);
    host.querySelector<HTMLButtonElement>(".vlc-desktop-icon")!.click();
    expect(player.element.hidden).toBe(false);
    expect(video.paused).toBe(true);
    host.querySelector<HTMLButtonElement>('.title-bar-controls [aria-label="Close"]')!.click();
    expect(video.getAttribute("src")).toBeNull();
  });

  it("pauses when the browser tab becomes hidden", () => {
    player = mountMediaPlayer(host, items);
    button("play").click();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(host.querySelector("video")!.paused).toBe(true);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(host.querySelector("video")!.paused).toBe(true);
  });

  it("handles Space on the title bar without toggling the aquarium's global shortcut", () => {
    player = mountMediaPlayer(host, items);
    const documentKey = vi.fn();
    document.addEventListener("keydown", documentKey, { once: true });
    const handle = player.element.querySelector<HTMLElement>(".glass-window__handle")!;
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
    expect(host.querySelector("video")!.paused).toBe(false);
    expect(documentKey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentKey);
    const nativePress = new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true });
    host.querySelector<HTMLButtonElement>('.title-bar-controls [aria-label="Close"]')!.dispatchEvent(nativePress);
    expect(nativePress.defaultPrevented).toBe(false);
    expect(host.querySelector("video")!.paused).toBe(false);
  });

  it("keeps a seek attached when a moving window's ancestor receives the pointer", () => {
    player = mountMediaPlayer(host, items);
    button("play").click();
    const video = host.querySelector("video")!;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    video.dispatchEvent(new Event("loadedmetadata"));
    const seek = host.querySelector<HTMLInputElement>(".vlc-seek")!;
    seek.setPointerCapture = vi.fn();
    seek.hasPointerCapture = vi.fn().mockReturnValue(false);
    vi.spyOn(seek, "getBoundingClientRect").mockReturnValue({ left: 100, right: 500,
      top: 200, bottom: 220, width: 400, height: 20, x: 100, y: 200, toJSON() {} });
    player.element.dispatchEvent(new PointerEvent("pointerdown", {
      clientX: 300, clientY: 210, pointerId: 1, isPrimary: true, button: 0, bubbles: true,
    }));
    expect(video.currentTime).toBe(50);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 210, pointerId: 1 }));
    expect(video.currentTime).toBe(75);
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 500, clientY: 210, pointerId: 1 }));
    expect(video.currentTime).toBe(75);
  });

  it("advances at the end to the next thumbnail without loading or playing it", () => {
    player = mountMediaPlayer(host, items);
    button("play").click();
    const video = host.querySelector("video")!;
    video.dispatchEvent(new Event("ended"));
    expect(video.getAttribute("src")).toBeNull();
    expect(video.poster).toContain("media/second/poster.webp");
    expect(host.querySelector(".vlc-status")!.textContent).toBe("Second demo");
    expect(host.querySelector<HTMLElement>(".vlc-playlist")!.hidden).toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(video.paused).toBe(true);
    expect(video.loop).toBe(false);
  });

  it("selects a playlist entry while paused and loads it only on Play", () => {
    player = mountMediaPlayer(host, items);
    expect(host.querySelector<HTMLElement>(".vlc-playlist")!.hidden).toBe(false);
    expect(button("playlist").getAttribute("aria-pressed")).toBe("true");
    host.querySelectorAll<HTMLButtonElement>(".vlc-playlist-item")[1].click();
    const video = host.querySelector("video")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.paused).toBe(true);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(host.querySelectorAll("[aria-current='true']")).toHaveLength(1);
    expect(host.querySelector<HTMLElement>(".vlc-playlist")!.hidden).toBe(true);
    button("play").click();
    expect(video.src).toContain("second/demo.mp4");
    expect(video.paused).toBe(false);
  });
});
