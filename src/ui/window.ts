import "7.css/dist/7.scoped.css";
import "./window.css";

let nextWindowId = 0;
const MOTION_SPEED = 50; // Higher values follow the pointer faster.
const DRAG_MOTION_SPEED = MOTION_SPEED * 5;

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
  const body = document.createElement("div");
  body.className = "window-body glass-window__body";
  content.classList.add("glass-window__content");
  body.append(content);
  surface.append(handle, body);
  element.append(surface);

  const events = new AbortController();
  const options = { signal: events.signal };
  let x = 0;
  let y = 0;
  const axes = ["x", "y", "rx", "ry"] as const;
  const motion = Object.fromEntries(
    axes.map((axis) => [axis, { value: 0, target: 0, velocity: 0 }])
  ) as Record<(typeof axes)[number], { value: number; target: number; velocity: number }>;
  let frame = 0;
  let lastFrame = 0;
  let positionSpeed = MOTION_SPEED;
  let drag: { id: number; startX: number; startY: number; x: number; y: number } | null = null;

  function animate(now: number) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    let moving = false;
    for (const axis of axes) {
      const state = motion[axis];
      const speed = axis === "x" || axis === "y" ? positionSpeed : MOTION_SPEED;
      // Critically damped spring: accelerate smoothly, then settle without bouncing.
      const offset = state.value - state.target;
      const acceleration = state.velocity + speed * offset;
      const decay = Math.exp(-speed * dt);
      state.value = state.target + (offset + acceleration * dt) * decay;
      state.velocity = (state.velocity - speed * acceleration * dt) * decay;
      if (Math.abs(state.value - state.target) < 0.001 && Math.abs(state.velocity) < 0.001) {
        state.value = state.target;
        state.velocity = 0;
      } else moving = true;
    }
    x = motion.x.value;
    y = motion.y.value;
    const rx = motion.rx.value;
    const ry = motion.ry.value;
    element.style.setProperty("--window-x", `${x}px`);
    element.style.setProperty("--window-y", `${y}px`);
    element.style.setProperty("--window-rx", `${rx}deg`);
    element.style.setProperty("--window-ry", `${ry}deg`);
    element.style.setProperty("--window-parallax-x", `${-ry * 2}px`);
    element.style.setProperty("--window-parallax-y", `${rx * 2}px`);
    frame = moving ? requestAnimationFrame(animate) : 0;
  }

  function schedule() {
    if (frame) return;
    lastFrame = performance.now();
    frame = requestAnimationFrame(animate);
  }

  function tilt(rx = 0, ry = 0) {
    motion.rx.target = rx;
    motion.ry.target = ry;
    schedule();
  }

  function place(nextX: number, nextY: number) {
    positionSpeed = drag ? DRAG_MOTION_SPEED : MOTION_SPEED;
    motion.x.target = nextX;
    motion.y.target = nextY;
    schedule();
  }

  function move(nextX: number, nextY: number) {
    const rect = element.getBoundingClientRect();
    const left = rect.left - x;
    const top = rect.top - y;
    // Keep the full width and the drag handle within reach.
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    place(
      clamp(nextX, 8 - left, innerWidth - 8 - left - element.offsetWidth),
      clamp(nextY, 8 - top, innerHeight - 8 - top - handle.offsetHeight)
    );
  }

  handle.addEventListener(
    "pointerdown",
    (event) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      for (const axis of axes) {
        motion[axis].target = motion[axis].value;
        motion[axis].velocity = 0;
      }
      drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y };
      handle.setPointerCapture(event.pointerId);
      element.dataset.dragging = "";
    },
    options
  );

  window.addEventListener(
    "pointermove",
    (event) => {
      if (drag) {
        if (event.pointerId === drag.id)
          move(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY);
        return;
      }
      if (event.pointerType === "touch") return;
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) {
        tilt();
        return;
      }
      const px = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      const py = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      tilt(-py * 6, px * 6);
    },
    options
  );

  const stopDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    delete element.dataset.dragging;
  };
  handle.addEventListener("pointerup", stopDrag, options);
  handle.addEventListener("pointercancel", stopDrag, options);
  handle.addEventListener("lostpointercapture", stopDrag, options);
  handle.addEventListener(
    "keydown",
    (event) => {
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-16, 0],
        ArrowRight: [16, 0],
        ArrowUp: [0, -16],
        ArrowDown: [0, 16],
      };
      const step = directions[event.key];
      if (!step && !["Enter", "Home", " "].includes(event.key)) return;
      event.preventDefault();
      tilt();
      if (step) move(motion.x.target + step[0], motion.y.target + step[1]);
      else place(0, 0);
    },
    options
  );
  window.addEventListener(
    "resize",
    () => {
      place(0, 0);
      tilt();
    },
    options
  );

  return {
    element,
    destroy() {
      cancelAnimationFrame(frame);
      events.abort();
      element.remove();
    },
  };
}
