import "7.css/dist/7.scoped.css";
import "./window.css";

let nextWindowId = 0;

/** Shared window chrome; callers supply the content and choose its layout. */
export function createWindow(title: string, content: HTMLElement) {
  const element = document.createElement("section");
  element.className = "glass-window win7";

  const surface = document.createElement("div");
  surface.className = "window active glass glass-window__surface";
  const handle = document.createElement("header");
  handle.className = "title-bar glass-window__handle";
  handle.tabIndex = 0;
  handle.setAttribute("role", "group");
  handle.setAttribute("aria-roledescription", "draggable title bar");
  handle.setAttribute("aria-label", `Move ${title} window. Arrow keys move; Enter or Home resets.`);
  const heading = document.createElement("h2");
  heading.id = `glass-window-${++nextWindowId}`;
  heading.className = "title-bar-text";
  heading.textContent = title;
  element.setAttribute("aria-labelledby", heading.id);
  handle.append(heading);
  content.classList.add("window-body", "glass-window__content");
  surface.append(handle, content);
  element.append(surface);

  const events = new AbortController();
  const options = { signal: events.signal };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let x = 0;
  let y = 0;
  let drag: { id: number; startX: number; startY: number; x: number; y: number } | null = null;

  function tilt(rx = 0, ry = 0) {
    element.style.setProperty("--window-rx", `${rx}deg`);
    element.style.setProperty("--window-ry", `${ry}deg`);
  }

  function place(nextX: number, nextY: number) {
    x = nextX;
    y = nextY;
    element.style.setProperty("--window-x", `${x}px`);
    element.style.setProperty("--window-y", `${y}px`);
  }

  function move(nextX: number, nextY: number) {
    const rect = element.getBoundingClientRect();
    const left = rect.left - x;
    const top = rect.top - y;
    // Keep the full width and the drag handle within reach.
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    place(
      clamp(nextX, 8 - left, innerWidth - 8 - left - element.offsetWidth),
      clamp(nextY, 8 - top, innerHeight - 8 - top - handle.offsetHeight),
    );
  }

  handle.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y };
    handle.setPointerCapture(event.pointerId);
    element.dataset.dragging = "";
    tilt();
  }, options);

  element.addEventListener("pointermove", (event) => {
    if (drag) {
      if (event.pointerId === drag.id) move(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY);
      return;
    }
    if (event.pointerType !== "mouse" || reducedMotion.matches) return;
    const rect = element.getBoundingClientRect();
    const px = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    const py = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    tilt(-py * 3, px * 3);
  }, options);
  element.addEventListener("pointerleave", () => { if (!drag) tilt(); }, options);

  const stopDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    delete element.dataset.dragging;
  };
  handle.addEventListener("pointerup", stopDrag, options);
  handle.addEventListener("pointercancel", stopDrag, options);
  handle.addEventListener("lostpointercapture", stopDrag, options);
  handle.addEventListener("keydown", (event) => {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
    };
    const step = directions[event.key];
    if (!step && !["Enter", "Home", " "].includes(event.key)) return;
    event.preventDefault();
    tilt();
    if (step) move(x + step[0], y + step[1]);
    else place(0, 0);
  }, options);
  window.addEventListener("resize", () => { place(0, 0); tilt(); }, options);

  return {
    element,
    destroy() { events.abort(); element.remove(); },
  };
}
