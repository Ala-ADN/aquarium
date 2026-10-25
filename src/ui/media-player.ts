import "./media-player.css";
import { createWindow } from "./window";
import { prioritizeControlClicks } from "./control-pointer-priority";
import { mediaLibrary, mediaUrl } from "../media/library";
import type { MediaItem } from "../media/library";
import githubMark from "../asset/github.svg";

const artwork = import.meta.glob<string>("../asset/vlc/*.png", {
  eager: true, query: "?url", import: "default",
});
const imageUrl = (name: string) => artwork[`../asset/vlc/${name}.png`];

function githubIcon() {
  const icon = document.createElement("img");
  icon.src = githubMark;
  icon.alt = "";
  icon.draggable = false;
  return icon;
}

function image(name: string, className = "") {
  const img = document.createElement("img");
  img.src = imageUrl(name);
  img.alt = "";
  img.draggable = false;
  img.className = className;
  return img;
}

function setIcon(button: HTMLButtonElement, name: string, label?: string) {
  if (button.dataset.icon !== name) {
    button.replaceChildren(image(name));
    button.dataset.icon = name;
  }
  if (label) {
    button.setAttribute("aria-label", label);
    button.title = label;
  }
}

export function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const tail = `${minutes % 60}`.padStart(2, "0") + ":" + `${total % 60}`.padStart(2, "0");
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${tail}` : tail;
}

type Action = "play" | "previous" | "next" | "playlist" | "github" |
  "mute" | "slower" | "normalSpeed" | "faster" | "info" | "close" | "donate";
type MenuEntry = { label: string; action: Action; shortcut?: string } | null;

const menus: { label: string; entries: MenuEntry[] }[] = [
  { label: "Playback", entries: [
    { label: "Play / Pause", action: "play", shortcut: "Space" },
    null,
    { label: "Previous", action: "previous", shortcut: "P" },
    { label: "Next", action: "next", shortcut: "N" }, null,
    { label: "Faster", action: "faster", shortcut: "+" },
    { label: "Normal speed", action: "normalSpeed", shortcut: "=" },
    { label: "Slower", action: "slower", shortcut: "−" },
  ] },
  { label: "Help", entries: [
    { label: "Donate to VLC", action: "donate" },
  ] },
];

export function mountMediaPlayer(host: HTMLElement, initialItems: readonly MediaItem[] = mediaLibrary) {
  const events = new AbortController();
  const opts = { signal: events.signal };
  const queue = [...initialItems];
  let selected = queue.length ? 0 : -1;
  let loadedId: string | null = null;
  let destroyed = false;
  let openMenu: number | null = null;

  const content = document.createElement("div");
  content.className = "vlc-player";
  content.innerHTML = `
    <nav class="vlc-menubar" role="menubar" aria-label="Player menu"></nav>
    <div class="vlc-stage">
      <video class="vlc-video" preload="none" playsinline aria-label="Project demo"></video>
      <div class="vlc-idle" aria-hidden="true"></div>
      <section class="vlc-playlist" aria-label="Playlist" hidden>
        <div class="vlc-playlist-heading"><strong>Project demos</strong><span class="vlc-item-count"></span></div>
        <div class="vlc-playlist-columns"><span>Title</span><span>Description</span><span>Duration</span><span>Source</span></div>
        <ol class="vlc-playlist-items"></ol>
        <div class="vlc-playlist-empty">Project demos coming soon.</div>
      </section>
    </div>
    <div class="vlc-controls">
      <div class="vlc-seek-row">
        <input class="vlc-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" disabled>
      </div>
      <div class="vlc-toolbar" role="group" aria-label="Playback controls">
        <span class="vlc-tool-group">
          <button type="button" class="vlc-tool" data-action="previous" aria-label="Previous"></button>
          <button type="button" class="vlc-tool vlc-play" data-action="play" aria-label="Play"></button>
          <button type="button" class="vlc-tool" data-action="next" aria-label="Next"></button>
        </span>
        <span class="vlc-tool-group vlc-secondary-tools">
          <button type="button" class="vlc-tool" data-action="playlist" aria-label="Show playlist" aria-pressed="false"></button>
          <button type="button" class="vlc-tool vlc-github" data-action="github" aria-label="Open project on GitHub" disabled></button>
        </span>
        <div class="vlc-volume">
          <button type="button" class="vlc-mute" data-action="mute" aria-label="Mute" aria-pressed="false"></button>
          <div class="vlc-volume-ramp">
            <output class="vlc-volume-label">100%</output>
            <div class="vlc-volume-outline"><div class="vlc-volume-fill"></div></div>
            <input type="range" class="vlc-volume-input" min="0" max="100" value="100" aria-label="Volume">
          </div>
        </div>
      </div>
    </div>
    <footer class="vlc-statusbar">
      <span class="vlc-status" role="status">VLC media player</span>
      <span class="vlc-time">00:00 / 00:00</span>
      <span class="vlc-size-grip" aria-hidden="true"></span>
    </footer>
  `;

  const query = <T extends Element = HTMLElement>(selector: string) => content.querySelector<T>(selector)!;
  const video = query<HTMLVideoElement>("video");
  const idle = query(".vlc-idle");
  const playlist = query(".vlc-playlist");
  const seek = query<HTMLInputElement>(".vlc-seek");
  const volume = query<HTMLInputElement>(".vlc-volume-input");
  const status = query(".vlc-status");
  const time = query(".vlc-time");
  const menuBar = query(".vlc-menubar");
  const tools = new Map<Action, HTMLButtonElement>();
  for (const button of content.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
    if (!button.closest(".vlc-playlist")) tools.set(button.dataset.action as Action, button);
  }
  const icons: Partial<Record<Action, string>> = {
    play: "play", previous: "previous", next: "next",
    playlist: "playlist",
    mute: "volume-high",
  };
  for (const [action, icon] of Object.entries(icons)) setIcon(tools.get(action as Action)!, icon);
  tools.get("github")!.append(githubIcon());
  idle.append(image("cone", "vlc-cone"));

  const frame = createWindow("VLC media player", content);
  const element = frame.element;
  element.id = "media-player";
  element.classList.add("vlc-window");
  element.hidden = true;
  element.tabIndex = -1;
  const handle = element.querySelector<HTMLElement>(".glass-window__handle")!;
  const heading = element.querySelector<HTMLElement>(".title-bar-text")!;
  const headingText = document.createElement("span");
  headingText.textContent = "VLC media player";
  heading.replaceChildren(image("cone-small", "vlc-title-icon"), headingText);
  const windowControls = document.createElement("div");
  windowControls.className = "title-bar-controls";
  for (const label of ["Minimize", "Maximize", "Close"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    windowControls.append(button);
    button.addEventListener("click", () => {
      if (label === "Minimize") hide(false);
      else if (label === "Close") hide(true);
      else maximize();
    }, opts);
  }
  handle.append(windowControls);
  handle.addEventListener("dblclick", (event) => {
    if (!(event.target instanceof Element && event.target.closest("button"))) maximize();
  }, opts);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "desktop-icon vlc-desktop-icon";
  launcher.setAttribute("aria-label", "Open VLC media player");
  launcher.append(image("cone-small"));
  const launcherText = document.createElement("span");
  launcherText.textContent = "VLC media player";
  launcher.append(launcherText);
  launcher.addEventListener("click", () => {
    element.hidden = false;
    updatePoster();
    update();
    frame.resetPosition();
    element.focus({ preventScroll: true });
  }, opts);
  host.append(launcher, element);
  prioritizeControlClicks(element, events.signal);
  const visibility = new IntersectionObserver(entries => {
    if (entries.some(entry => !entry.isIntersecting)) video.pause();
  });
  visibility.observe(element);

  const dialog = document.createElement("dialog");
  dialog.className = "vlc-dialog win7";
  dialog.setAttribute("aria-labelledby", "vlc-dialog-title");
  const dialogContent = document.createElement("div");
  dialog.append(dialogContent);
  host.append(dialog);

  function current() { return queue[selected]; }
  function hasDuration() { return Number.isFinite(video.duration) && video.duration > 0; }
  function projectStatus() {
    const item = current();
    return item ? [item.title, item.description].filter(Boolean).join(" - ") : "VLC media player";
  }
  function setStatus(message: string) {
    status.textContent = message;
    status.title = message;
  }
  function updatePoster() {
    const poster = !element.hidden ? current()?.poster : undefined;
    if (poster) video.poster = mediaUrl(poster);
    else video.removeAttribute("poster");
  }

  function update() {
    const item = current();
    const duration = hasDuration() ? video.duration : item?.duration ?? 0;
    tools.get("play")!.disabled = !item;
    setIcon(tools.get("play")!, video.paused ? "play" : "pause", video.paused ? "Play" : "Pause");
    tools.get("previous")!.disabled = queue.length < 2 && !(loadedId && video.currentTime > 0);
    tools.get("next")!.disabled = queue.length < 2;
    const github = tools.get("github")!;
    github.disabled = !item?.sourceUrl;
    github.title = item?.sourceUrl ? `Open ${item.title} on GitHub` : "Repository not available";
    const silent = video.muted || video.volume === 0;
    setIcon(tools.get("mute")!, silent ? "volume-muted" : "volume-high", silent ? "Unmute" : "Mute");
    tools.get("mute")!.setAttribute("aria-pressed", `${silent}`);
    volume.value = `${Math.round(video.volume * 100)}`;
    query(".vlc-volume-label").textContent = silent ? "0%" : `${volume.value}%`;
    query(".vlc-volume-fill").style.setProperty("--vlc-volume", silent ? "0%" : `${volume.value}%`);
    seek.disabled = !loadedId || !hasDuration();
    seek.value = hasDuration() ? `${video.currentTime / video.duration * 1000}` : "0";
    seek.setAttribute("aria-valuetext", `${formatMediaTime(video.currentTime)} of ${formatMediaTime(duration)}`);
    time.textContent = `${formatMediaTime(video.currentTime)} / ${formatMediaTime(duration)}`;
    headingText.textContent = item ? `${item.title} - VLC media player` : "VLC media player";
    idle.hidden = !!video.getAttribute("poster") || (!!loadedId && video.readyState >= 2 && video.videoWidth > 0);
  }

  function renderPlaylist() {
    const list = query<HTMLOListElement>(".vlc-playlist-items");
    list.replaceChildren();
    query(".vlc-item-count").textContent = `${queue.length} item${queue.length === 1 ? "" : "s"}`;
    query(".vlc-playlist-empty").hidden = queue.length !== 0;
    queue.forEach((item, index) => {
      const row = document.createElement("li");
      row.className = "vlc-playlist-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vlc-playlist-item";
      button.setAttribute("aria-current", `${index === selected}`);
      button.title = item.title;
      const name = document.createElement("span");
      name.className = "vlc-playlist-title";
      const title = document.createElement("span");
      title.className = "vlc-playlist-title-text";
      title.textContent = item.title;
      name.append(image("cone-small"), title);
      const description = document.createElement("span");
      description.className = "vlc-playlist-description";
      description.textContent = item.description ?? "—";
      description.title = item.description ?? "";
      const duration = document.createElement("span");
      duration.className = "vlc-playlist-duration";
      const seconds = index === selected && hasDuration() ? video.duration : item.duration;
      duration.textContent = seconds === undefined ? "—" : formatMediaTime(seconds);
      button.append(name, description, duration);
      button.addEventListener("click", () => select(index), opts);
      row.append(button);
      if (item.sourceUrl) {
        const source = document.createElement("a");
        source.className = "vlc-playlist-source";
        source.href = item.sourceUrl;
        source.target = "_blank";
        source.rel = "noopener noreferrer";
        source.append(githubIcon());
        source.title = `View ${item.title} on GitHub`;
        source.setAttribute("aria-label", `View ${item.title} on GitHub`);
        row.append(source);
      }
      list.append(row);
    });
  }

  function unload() {
    video.pause();
    loadedId = null;
    video.removeAttribute("src");
    video.load();
    update();
  }

  function select(index: number) {
    if (!queue[index]) return;
    unload();
    selected = index;
    updatePoster();
    setStatus(projectStatus());
    renderPlaylist();
    update();
    if (!playlist.hidden) act("playlist");
  }

  async function start() {
    const item = current();
    if (!item) return;
    if (loadedId !== item.id) {
      loadedId = item.id;
      video.src = mediaUrl(item.src);
      video.load();
    }
    try {
      await video.play();
      if (!destroyed && loadedId === item.id) setStatus(projectStatus());
    } catch (error) {
      if (destroyed || loadedId !== item.id || (error instanceof DOMException && error.name === "AbortError")) return;
      setStatus(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Press Play to start playback." : "Unable to play this file. Try an MP4 or WebM video.");
      update();
    }
  }

  function advance(direction: number) {
    if (!queue.length) return;
    if (direction < 0 && loadedId && (video.currentTime > 3 || selected === 0)) {
      video.pause(); video.currentTime = 0; update(); return;
    }
    const next = selected + direction;
    if (next >= queue.length || next < 0) return;
    select(next);
  }

  function hide(close: boolean) {
    closeMenus();
    video.pause();
    if (close) { unload(); setStatus(projectStatus()); }
    element.hidden = true;
    launcher.focus({ preventScroll: true });
  }

  function maximize() {
    const maximized = element.toggleAttribute("data-maximized");
    const button = windowControls.children[1] as HTMLButtonElement;
    button.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
    button.title = maximized ? "Restore" : "Maximize";
    if (!maximized) frame.resetPosition();
  }

  function showDialog(title: string) {
    dialogContent.replaceChildren();
    const header = document.createElement("header");
    header.className = "vlc-dialog-heading";
    const h2 = document.createElement("h2");
    h2.id = "vlc-dialog-title";
    h2.textContent = title;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close dialog");
    close.addEventListener("click", () => dialog.close(), opts);
    header.append(h2, close);
    const body = document.createElement("div");
    body.className = "vlc-dialog-body";
    dialogContent.append(header, body);
    dialog.showModal();
    return body;
  }

  function showInformation() {
    const body = showDialog("Media Information");
    const item = current();
    const info = document.createElement("dl");
    for (const [label, value] of [
      ["Title", item?.title ?? "No media open"],
      ["Description", item?.description ?? "—"],
      ["Duration", formatMediaTime(hasDuration() ? video.duration : item?.duration ?? NaN)],
      ["Resolution", video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : "—"],
    ]) {
      const dt = document.createElement("dt"); dt.textContent = label;
      const dd = document.createElement("dd"); dd.textContent = value;
      info.append(dt, dd);
    }
    body.append(info);
    for (const [label, href] of [["Launch project", item?.projectUrl], ["View source", item?.sourceUrl]]) {
      if (!href) continue;
      const link = document.createElement("a");
      link.textContent = `${label} ↗`; link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
      body.append(link);
    }
  }

  function act(action: Action) {
    switch (action) {
      case "play": if (video.paused) void start(); else video.pause(); break;
      case "previous": advance(-1); break;
      case "next": advance(1); break;
      case "playlist":
        playlist.hidden = !playlist.hidden;
        tools.get("playlist")!.setAttribute("aria-pressed", `${!playlist.hidden}`);
        tools.get("playlist")!.setAttribute("aria-label", playlist.hidden ? "Show playlist" : "Hide playlist");
        break;
      case "github": {
        const url = current()?.sourceUrl;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        break;
      }
      case "donate": window.open("https://www.videolan.org/contribute.html", "_blank", "noopener,noreferrer"); break;
      case "mute": video.muted = !(video.muted || video.volume === 0); if (!video.volume) video.volume = 0.5; break;
      case "slower": video.defaultPlaybackRate = video.playbackRate = Math.max(0.25, video.playbackRate - 0.25); break;
      case "faster": video.defaultPlaybackRate = video.playbackRate = Math.min(4, video.playbackRate + 0.25); break;
      case "normalSpeed": video.defaultPlaybackRate = video.playbackRate = 1; break;
      case "info": showInformation(); break;
      case "close": hide(true); break;
    }
    update();
  }

  content.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
    if (button) act(button.dataset.action as Action);
  }, opts);
  element.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button");
    if (button) {
      event.preventDefault();
      button.focus({ preventScroll: true });
    } else if (!event.target.closest("input, a, .glass-window__handle")) {
      element.focus({ preventScroll: true });
    }
  }, opts);
  video.addEventListener("click", () => act("play"), opts);
  seek.addEventListener("input", () => {
    if (loadedId && hasDuration()) video.currentTime = Number(seek.value) / 1000 * video.duration;
    update();
  }, opts);
  volume.addEventListener("input", () => { video.volume = Number(volume.value) / 100; video.muted = false; update(); }, opts);

  // A moving 3D window can put its ancestor plane in front of a native slider.
  // Keep the gesture attached to the visible range, using its bounds at press.
  for (const input of [seek, volume]) {
    let drag: { id: number; rect: DOMRect } | null = null;
    function setRange(x: number) {
      if (!drag) return;
      const min = Number(input.min), max = Number(input.max), step = Number(input.step) || 1;
      const fraction = Math.max(0, Math.min(1, (x - drag.rect.left) / drag.rect.width));
      input.value = `${min + Math.round(fraction * (max - min) / step) * step}`;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    window.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0 || input.disabled || element.hidden || dialog.open) return;
      const target = event.target instanceof Element ? event.target : null;
      const native = target?.closest("button, input, select, textarea, a");
      if (native && native !== input) return;
      const rect = input.getBoundingClientRect();
      if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) return;
      drag = { id: event.pointerId, rect };
      event.preventDefault(); event.stopPropagation();
      input.focus({ preventScroll: true });
      input.setPointerCapture(event.pointerId);
      setRange(event.clientX);
    }, { ...opts, capture: true });
    window.addEventListener("pointermove", (event) => {
      if (drag?.id === event.pointerId) setRange(event.clientX);
    }, opts);
    const finish = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId);
      drag = null;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    window.addEventListener("pointerup", finish, opts);
    window.addEventListener("pointercancel", finish, opts);
    window.addEventListener("blur", () => { drag = null; }, opts);
  }
  for (const event of ["play", "pause", "timeupdate", "durationchange", "loadeddata", "volumechange", "ratechange", "emptied"]) {
    video.addEventListener(event, update, opts);
  }
  video.addEventListener("loadedmetadata", () => { renderPlaylist(); update(); }, opts);
  video.addEventListener("ended", () => {
    video.pause();
    update();
  }, opts);
  video.addEventListener("error", () => {
    if (loadedId) setStatus("Unable to play this file. Try an MP4 or WebM video.");
  }, opts);
  document.addEventListener("visibilitychange", () => { if (document.hidden) video.pause(); }, opts);

  function closeMenus() {
    openMenu = null;
    menuBar.querySelectorAll<HTMLElement>(".vlc-menu-popup").forEach(popup => { popup.hidden = true; });
    menuBar.querySelectorAll(".vlc-menu-trigger").forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
  }
  function toggleMenu(index: number, focusFirst = false) {
    const wasOpen = openMenu === index;
    closeMenus();
    if (wasOpen && !focusFirst) return;
    openMenu = index;
    const wrapper = menuBar.children[index];
    wrapper.querySelector(".vlc-menu-trigger")!.setAttribute("aria-expanded", "true");
    wrapper.querySelector<HTMLElement>(".vlc-menu-popup")!.hidden = false;
    if (focusFirst) wrapper.querySelector<HTMLButtonElement>(".vlc-menu-popup button")?.focus();
  }
  menus.forEach((menu, index) => {
    const wrapper = document.createElement("div"); wrapper.className = "vlc-menu-wrapper";
    const trigger = document.createElement("button");
    trigger.type = "button"; trigger.className = "vlc-menu-trigger"; trigger.textContent = menu.label;
    trigger.setAttribute("role", "menuitem"); trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-expanded", "false");
    const popup = document.createElement("div");
    popup.className = "vlc-menu-popup"; popup.hidden = true; popup.setAttribute("role", "menu");
    popup.setAttribute("aria-label", menu.label);
    menu.entries.forEach(entry => {
      if (!entry) { const divider = document.createElement("hr"); divider.setAttribute("role", "separator"); popup.append(divider); return; }
      const button = document.createElement("button");
      button.type = "button"; button.setAttribute("role", "menuitem");
      const label = document.createElement("span"); label.textContent = entry.label;
      const shortcut = document.createElement("span"); shortcut.textContent = entry.shortcut ?? "";
      button.append(label, shortcut);
      button.addEventListener("click", () => { closeMenus(); act(entry.action); }, opts);
      popup.append(button);
    });
    trigger.addEventListener("click", () => toggleMenu(index), opts);
    trigger.addEventListener("pointerenter", () => { if (openMenu !== null && openMenu !== index) toggleMenu(index); }, opts);
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closeMenus(); trigger.focus(); event.stopPropagation(); event.preventDefault(); }
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); event.stopPropagation();
        if (openMenu !== index) { toggleMenu(index, true); return; }
        const buttons = [...popup.querySelectorAll<HTMLButtonElement>("button")];
        const position = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        buttons[position < 0 ? (step > 0 ? 0 : buttons.length - 1) : (position + step + buttons.length) % buttons.length]?.focus();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); event.stopPropagation();
        const triggers = [...menuBar.querySelectorAll<HTMLElement>(".vlc-menu-trigger")];
        const next = (index + (event.key === "ArrowRight" ? 1 : -1) + triggers.length) % triggers.length;
        if (openMenu !== null) toggleMenu(next, true);
        else { closeMenus(); triggers[next].focus({ preventScroll: true }); }
      }
    }, opts);
    wrapper.append(trigger, popup); menuBar.append(wrapper);
  });
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node && !menuBar.contains(event.target)) closeMenus();
  }, opts);

  // VLC owns Space while its title bar is focused; other windows keep their
  // existing title-bar reset shortcut and the aquarium's global Space action.
  handle.addEventListener("keydown", (event) => {
    if (event.target !== handle || event.key !== " ") return;
    event.preventDefault(); event.stopImmediatePropagation(); act("play");
  }, { ...opts, capture: true });

  element.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [role='menubar']") || target.isContentEditable) return;
    if (event.code === "Space" && target.closest("button, a")) return;
    let action: Action | undefined;
    if (event.ctrlKey || event.metaKey) {
      action = ({ l: "playlist", i: "info", w: "close" } as Record<string, Action>)[event.key.toLowerCase()];
    } else {
      action = ({ " ": "play", n: "next", p: "previous", m: "mute",
        "+": "faster", "-": "slower", "=": "normalSpeed" } as Record<string, Action>)[event.key.toLowerCase()];
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && loadedId && hasDuration()) {
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (event.key === "ArrowLeft" ? -5 : 5)));
        event.preventDefault(); event.stopPropagation(); update(); return;
      }
    }
    if (action) { event.preventDefault(); event.stopPropagation(); act(action); }
  }, opts);

  renderPlaylist();
  if (selected >= 0) select(selected);
  else update();

  return {
    element,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      events.abort();
      visibility.disconnect();
      video.pause(); video.removeAttribute("src"); video.load();
      dialog.remove(); launcher.remove(); frame.destroy();
    },
  };
}
