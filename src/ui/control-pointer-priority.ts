type Control = HTMLButtonElement | HTMLInputElement;
const CONTROL_SELECTOR = 'button, input[type="color"]';

function containsPoint(rect: DOMRect, x: number, y: number) {
  return rect.width > 0 && rect.height > 0 &&
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Keep a click attached to the control pressed before a 3D window moves. */
export function prioritizeControlClicks(container: HTMLElement, signal: AbortSignal) {
  let press: {
    control: Control;
    rect: DOMRect;
    pointerId: number;
    x: number;
    y: number;
    cancelled: boolean;
  } | null = null;
  const options = { signal, capture: true };

  function controlAtPointer(event: PointerEvent): Control | null {
    const target = event.target instanceof Element ? event.target : null;
    const nativeControl = target?.closest<HTMLElement>('button, input, select, textarea, a, [role="dialog"]');
    // Respect sliders and controls belonging to another window or dialog.
    if (nativeControl) {
      if (!container.contains(nativeControl)) return null;
      return nativeControl.matches(CONTROL_SELECTOR) ? nativeControl as Control : null;
    }
    for (const control of container.querySelectorAll<Control>(CONTROL_SELECTOR)) {
      if (containsPoint(control.getBoundingClientRect(), event.clientX, event.clientY)) return control;
    }
    return null;
  }

  window.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    press = null;
    const control = controlAtPointer(event);
    if (!control) return;
    press = { control, rect: control.getBoundingClientRect(), pointerId: event.pointerId,
      x: event.clientX, y: event.clientY, cancelled: false };
    if (event.target instanceof Node && control.contains(event.target)) return;
    // An ancestor plane was hit. Stop it stealing focus or starting a drag.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!control.matches(":disabled")) control.focus({ preventScroll: true });
  }, options);

  window.addEventListener("pointermove", (event) => {
    if (!press || event.pointerId !== press.pointerId || event.pointerType !== "touch") return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) press.cancelled = true;
  }, { ...options, passive: true });

  window.addEventListener("click", (event) => {
    // Leave keyboard activation, assistive clicks, and forwarded clicks native.
    if (event.detail === 0 || event.button !== 0 || !press) return;
    const pressed = press;
    press = null;
    const { control } = pressed;
    const nearPress = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= 8;
    const accepted = !pressed.cancelled && control.isConnected && !control.matches(":disabled") &&
      (nearPress || containsPoint(pressed.rect, event.clientX, event.clientY) ||
        containsPoint(control.getBoundingClientRect(), event.clientX, event.clientY));
    if (accepted && event.target instanceof Node && control.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!accepted) return;
    control.focus({ preventScroll: true });
    if (control instanceof HTMLInputElement && typeof control.showPicker === "function") {
      try { control.showPicker(); return; } catch { /* Older browsers can use native click activation. */ }
    }
    control.click();
  }, options);

  window.addEventListener("pointercancel", (event) => {
    if (event.pointerId === press?.pointerId) press = null;
  }, options);
  window.addEventListener("blur", (event) => {
    if (event.target === event.currentTarget) press = null;
  }, options);
  signal.addEventListener("abort", () => { press = null; }, { once: true });
}
