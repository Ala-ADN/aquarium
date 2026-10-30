import "7.css/dist/7.scoped.css";
import "./window.css";
import { WINDOW_MOTION } from "../constants";

let nextWindowId = 0;
let topWindowLayer = 2;
const MOTION_SPEED = WINDOW_MOTION.speed;
const DRAG_MOTION_SPEED = MOTION_SPEED * WINDOW_MOTION.dragSpeedMultiplier;

/** Shared window chrome; callers supply the content and choose its layout. */
export function createWindow(title: string, content: HTMLElement, theme: "7" | "98" = "7") {
  const element = document.createElement("section");
  element.className = `glass-window win${theme}`;

  const surface = document.createElement("div");
  surface.className = `window glass-window__surface${theme === "7" ? " active glass" : ""}`;
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
  const bringToFront = () => { element.style.zIndex = `${++topWindowLayer}`; };
  element.addEventListener("pointerdown", bringToFront, options);
  element.addEventListener("focusin", bringToFront, options);
  let x = 0;
  let y = 0;
  const axes = ["x", "y", "rx", "ry"] as const;
  const motion = Object.fromEntries(
    axes.map((axis) => [axis, { value: 0, target: 0, velocity: 0 }])
  ) as Record<(typeof axes)[number], { value: number; target: number; velocity: number }>;
  let frame = 0;
  let lastFrame = 0;
  let positionSpeed: number = MOTION_SPEED;
  let drag: { id: number; startX: number; startY: number; x: number; y: number } | null = null;
  let pendingPointer: { x: number; y: number; id: number } | null = null;
  function applyPointer() {
    const pointer = pendingPointer;
    pendingPointer = null;
    if (!pointer) return;
    if (drag) {
      if (pointer.id === drag.id)
        move(drag.x + pointer.x - drag.startX, drag.y + pointer.y - drag.startY);
      return;
    }
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) {
      motion.rx.target = motion.ry.target = 0;
      return;
    }
    const px = Math.max(-1, Math.min(1, ((pointer.x - rect.left) / rect.width) * 2 - 1));
    const py = Math.max(-1, Math.min(1, ((pointer.y - rect.top) / rect.height) * 2 - 1));
    motion.rx.target = -py * WINDOW_MOTION.tilt;
    motion.ry.target = px * WINDOW_MOTION.tilt;
  }
  function animate(now: number) {
    // Read geometry once per frame, before applying any transform writes.
    applyPointer();
    // An event can arrive after this frame's timestamp was sampled, especially
    // during heavy rendering. A negative step makes spring decay grow instead.
    const dt = Math.max(0, Math.min((now - lastFrame) / 1000, 0.05));
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
    // Inherited custom properties would invalidate styles throughout the content.
    const position = `${x}px ${y}px`;
    const transform = `perspective(1000px) translate3d(${-ry * WINDOW_MOTION.parallax}px, ${rx * WINDOW_MOTION.parallax}px, 0) rotateX(${rx}deg) rotateY(${ry}deg)`;
    if (element.style.translate !== position) element.style.translate = position;
    if (surface.style.transform !== transform) surface.style.transform = transform;
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
      clamp(nextX, 8 - left, innerWidth - 8 - left - element.offsetWidth - Number(element.dataset.rightOverhang ?? 0)),
      clamp(nextY, 8 - top, innerHeight - 8 - top - handle.offsetHeight)
    );
  }

  handle.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof Element && event.target.closest("button, input, select, textarea, a")) return;
      if (!event.isPrimary || event.button !== 0 || drag) return;
      event.preventDefault();
      pendingPointer = null;
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
      if (drag ? event.pointerId !== drag.id : event.pointerType === "touch") return;
      pendingPointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
      schedule();
    },
    options
  );

  const stopDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    applyPointer();
    drag = null;
    delete element.dataset.dragging;
  };
  handle.addEventListener("pointerup", stopDrag, options);
  handle.addEventListener("pointercancel", stopDrag, options);
  handle.addEventListener("lostpointercapture", stopDrag, options);
  handle.addEventListener(
    "keydown",
    (event) => {
      if (event.target !== handle) return;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-WINDOW_MOTION.keyboardStep, 0],
        ArrowRight: [WINDOW_MOTION.keyboardStep, 0],
        ArrowUp: [0, -WINDOW_MOTION.keyboardStep],
        ArrowDown: [0, WINDOW_MOTION.keyboardStep],
      };
      const step = directions[event.key];
      if (!step && !["Enter", "Home", " "].includes(event.key)) return;
      event.preventDefault();
      pendingPointer = null;
      tilt();
      if (step) move(motion.x.target + step[0], motion.y.target + step[1]);
      else place(0, 0);
    },
    options
  );
  window.addEventListener(
    "resize",
    () => {
      pendingPointer = null;
      place(0, 0);
      tilt();
    },
    options
  );

  return {
    element,
    resetPosition() { place(0, 0); },
    destroy() {
      cancelAnimationFrame(frame);
      pendingPointer = null;
      events.abort();
      element.remove();
    },
  };
}
