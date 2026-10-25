import { DEFAULT_FIH_COLOR, MAX_VISITOR_FIH } from "../constants";
import type {
  FihAppearance,
  FihDesign,
  FihPart,
  FihShape,
  FihFinShape,
  FihHeadShape,
} from "../types";
import { describeFih, FihDraft, partOptions, partShape, resolveFihColors } from "../fih/appearance";
import { FIH_PARTS, MIN_PART_SIZE, MAX_PART_SIZE } from "../fih/parts";
import { advanceVisit, earnedFih, fihAllowance, readVisit, saveVisit } from "../fih/visit";
import { drawFihPreview } from "./fih-preview";
import { createFihFaviconUpdater } from "./fih-favicon";
import { createWindow } from "./window";
import { sampleFihSpin } from "./fih-spin";
import { createFihReleaseFeedback } from "./fih-release";
import { prioritizeControlClicks } from "./control-pointer-priority";
import type { FihPreviewFactory } from "./fih-live-preview";
import type { FihSaveStatus } from "../fih/shared";

function shapeChange(part: FihPart, shape: string): Partial<FihAppearance> {
  return part === "body"
    ? { shape: shape as FihShape }
    : part === "fin"
      ? { finShape: shape as FihFinShape }
      : { headShape: shape as FihHeadShape };
}
function lane(part: FihPart) {
  // Plain groups keep the shared window's 3D chain through the reel artwork.
  // Spinning raises each whole slot; its controls stay on the slot's plane.
  return `<section class="fih-lane" data-part="${part}" role="group" aria-label="${part}">
    <button type="button" class="fih-reel-arrow" data-direction="-1" aria-label="Previous ${part} shape">▴</button>
    <div class="fih-reel" tabindex="0" role="spinbutton" aria-label="${part} shape" aria-valuemin="1" aria-valuemax="${partOptions(part).length}" aria-valuenow="1"><div class="fih-reel-track" aria-hidden="true">
      <div class="fih-reel-item fih-reel-neighbor"><canvas data-offset="-1"></canvas></div>
      <div class="fih-reel-item fih-reel-selected"><canvas data-offset="0"></canvas></div>
      <div class="fih-reel-item fih-reel-neighbor"><canvas data-offset="1"></canvas></div>
      <div class="fih-reel-item fih-reel-neighbor"><canvas data-offset="2"></canvas></div>
    </div></div>
    <button type="button" class="fih-reel-arrow" data-direction="1" aria-label="Next ${part} shape">▾</button>
    <div class="fih-color-control"><input type="color" id="fih-${part}-picker" aria-label="Custom ${part} color" value="${DEFAULT_FIH_COLOR}"></div>
    <input type="range" id="fih-${part}-size" aria-label="${part} size" min="${MIN_PART_SIZE}" max="${MAX_PART_SIZE}" step="0.05" value="1">
  </section>`;
}

export function mountFihCreator(
  onDisplay: (fih: FihDesign) => void,
  createPreview?: FihPreviewFactory,
  sharing?: { onRelease: (design: FihDesign) => void }
) {
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {
    /* Release still works without saving. */
  }
  const visit = storage ? readVisit(storage) : { elapsed: 0, fih: null };
  let elapsed = visit.elapsed;
  let released = visit.fih;
  const draft = new FihDraft(released ?? undefined);
  let lastTick = performance.now();
  let wasVisible = !document.hidden;
  let enteredCreator = false;
  let destroyed = false;
  const events = new AbortController();
  const options = { signal: events.signal };
  const app = document.querySelector<HTMLElement>("#portfolio-content")!;
  const form = document.createElement("form");
  form.className = "fih-form";
  form.innerHTML = `
    <div class="fih-editor"><div class="fih-preview"><canvas role="img" aria-label="Preview of your fih"></canvas><span class="fih-release-ripple" aria-hidden="true"></span></div>
    <div class="fih-machine" role="group" aria-label="Fish controls"><div class="fih-lanes">${FIH_PARTS.map(lane).join("")}</div><button type="button" class="fih-spin">spin all</button></div></div>
    <p class="fih-spin-status visually-hidden" role="status" aria-live="polite"></p>
    <div class="fih-release-row"><span class="fih-progress-text"><span class="fih-progress-message">you spent <span class="fih-seconds">0</span> <span class="fih-seconds-unit">seconds</span> here, thanks,</span> <span class="fih-progress-reward">you get <span id="fih-count">1</span> <canvas class="fih-progress-fih" width="32" height="18" role="img" aria-label="fih">fih</canvas></span></span><p class="fih-save-status" role="status" aria-live="polite" hidden></p><button class="fih-release" type="submit" disabled>release</button></div>`;
  const fihWindow = createWindow("make a fih", form);
  fihWindow.element.classList.add("fih-window");
  fihWindow.element.id = "fih-creator";
  fihWindow.element.hidden = true;
  fihWindow.element.tabIndex = -1;
  const handle = fihWindow.element.querySelector<HTMLElement>(".glass-window__handle")!;
  const heading = fihWindow.element.querySelector<HTMLElement>(".title-bar-text")!;
  const titleIcon = document.createElement("img");
  titleIcon.className = "fih-title-icon";
  titleIcon.alt = "";
  titleIcon.draggable = false;
  heading.prepend(titleIcon);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "desktop-icon fih-desktop-icon";
  launcher.setAttribute("aria-label", "Open make a fih");
  const appIcon = document.createElement("img");
  appIcon.alt = "";
  appIcon.draggable = false;
  const label = document.createElement("span");
  label.textContent = "make a fih";
  launcher.append(appIcon, label);
  const updateFavicon = createFihFaviconUpdater((url) => {
    appIcon.src = titleIcon.src = url;
  });
  launcher.addEventListener(
    "click",
    () => {
      fihWindow.element.hidden = false;
      fihWindow.resetPosition();
      updatePreviewCutout();
      livePreview?.resize();
      enterCreator();
      handle.focus({ preventScroll: true });
    },
    options
  );
  function hide() {
    stopSpin();
    releaseFeedback.cancel();
    clearHover();
    tick();
    persist();
    fihWindow.element.hidden = true;
    launcher.focus({ preventScroll: true });
  }
  const windowControls = document.createElement("div");
  windowControls.className = "title-bar-controls";
  function maximize() {
    const maximized = fihWindow.element.toggleAttribute("data-maximized");
    const button = windowControls.children[1] as HTMLButtonElement;
    button.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
    button.title = maximized ? "Restore" : "Maximize";
    if (!maximized) fihWindow.resetPosition();
  }
  for (const name of ["Minimize", "Maximize", "Close"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", name);
    button.title = name;
    button.addEventListener("click", name === "Maximize" ? maximize : hide, options);
    windowControls.append(button);
  }
  handle.append(windowControls);
  handle.addEventListener(
    "dblclick",
    (event) => {
      if (!(event.target instanceof Element && event.target.closest("button"))) maximize();
    },
    options
  );
  fihWindow.element.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.target instanceof Element &&
        !event.target.closest("button, input, .fih-reel, .glass-window__handle")
      ) {
        fihWindow.element.focus({ preventScroll: true });
      }
    },
    options
  );
  app.append(launcher, fihWindow.element);
  const find = <T extends HTMLElement>(selector: string) => form.querySelector<T>(selector)!;
  const preview = find<HTMLCanvasElement>(".fih-preview canvas");
  const previewFrame = preview.parentElement!;
  const cutoutSurfaces = [".glass-window__surface", ".glass-window__body"].map(
    (selector) => fihWindow.element.querySelector<HTMLElement>(selector)!
  );
  function updatePreviewCutout() {
    for (const surface of cutoutSurfaces) {
      let x = 0;
      let y = 0;
      let element: HTMLElement | null = previewFrame;
      // Layout offsets stay in the window's plane while it tilts or is dragged.
      while (element && element !== surface) {
        x += element.offsetLeft;
        y += element.offsetTop;
        element = element.offsetParent as HTMLElement | null;
      }
      surface.style.setProperty("--fih-hole-x", `${x}px`);
      surface.style.setProperty("--fih-hole-y", `${y}px`);
      surface.style.setProperty("--fih-hole-width", `${previewFrame.offsetWidth}px`);
      surface.style.setProperty("--fih-hole-height", `${previewFrame.offsetHeight}px`);
    }
  }
  const livePreview = createPreview?.(preview, draft.appearance);
  const releaseFeedback = createFihReleaseFeedback(preview, find(".fih-release-ripple"));
  const count = find<HTMLSpanElement>("#fih-count");
  const secondsNumber = find<HTMLSpanElement>(".fih-seconds");
  const secondsUnit = find<HTMLSpanElement>(".fih-seconds-unit");
  const miniature = find<HTMLCanvasElement>(".fih-progress-fih");
  const release = find<HTMLButtonElement>(".fih-release");
  const spinStatus = find<HTMLParagraphElement>(".fih-spin-status");
  const saveStatus = find(".fih-save-status");
  const saveMessages: Record<FihSaveStatus, string> = {
    local: "saved here",
    saving: "sharing…",
    saved: "shared",
    offline: "waiting to share",
    unavailable: "couldn't share",
  };
  function setSaveStatus(status: FihSaveStatus) {
    if (destroyed) return;
    saveStatus.hidden = false;
    saveStatus.textContent = saveMessages[status];
  }
  const animations = new Set<Animation>();
  let spinFrame = 0;
  let spinTarget: FihAppearance | null = null;
  const slotWheels = new Map<HTMLElement, (event: WheelEvent) => void>();
  let hoveredSlot: HTMLElement | null = null;
  let hoverFrame = 0;
  let hoverPointer: PointerEvent | null = null;

  function hoverSlot(slot: HTMLElement | null) {
    if (slot === hoveredSlot) return;
    if (hoveredSlot) delete hoveredSlot.dataset.hovered;
    hoveredSlot = slot;
    if (slot) slot.dataset.hovered = "";
  }
  function clearHover() {
    cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
    hoverPointer = null;
    hoverSlot(null);
  }
  function slotAtPointer(event: MouseEvent) {
    if (fihWindow.element.hidden) return null;
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>(".fih-lane") : null;
    if (target && slotWheels.has(target)) return target;
    // 3D descendants can hit an ancestor plane. Fall back to the slot's visual
    // bounds so a wheel gesture cannot leak through to the page during a tilt.
    for (const slot of slotWheels.keys()) {
      const rect = slot.getBoundingClientRect();
      if (
        rect.width &&
        rect.height &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
        return slot;
    }
    return null;
  }

  function persist() {
    const saved = storage !== null && saveVisit(storage, { elapsed, fih: released });
    if (!saved) spinStatus.textContent = "can't save here";
    return saved;
  }
  function tick() {
    const now = performance.now();
    elapsed = advanceVisit(elapsed, now - lastTick, wasVisible);
    lastTick = now;
    wasVisible = !document.hidden;
  }
  function updateAllowance() {
    const earned = earnedFih(elapsed);
    const previous = Number(count.dataset.earned ?? 0);
    count.dataset.earned = String(earned);
    const allowance = fihAllowance(elapsed);
    count.textContent = allowance >= MAX_VISITOR_FIH ? "MAX" : String(allowance);
    const seconds = Math.floor(elapsed / 1000);
    secondsNumber.textContent = String(seconds);
    secondsUnit.textContent = seconds === 1 ? "second" : "seconds";
    release.disabled = !enteredCreator || earned === 0;
    if (earned !== previous) persist();
  }
  function animate(element: HTMLElement, duration: number) {
    if (!element.animate) return;
    // Settle the reels without delaying editing or release.
    const animation = element.animate(
      [
        {
          transform: "translateY(calc(var(--fih-reel-height) * -.4 - 22px))",
          filter: "blur(3px)",
          opacity: 0.4,
        },
        {
          transform: "translateY(calc(var(--fih-reel-height) * -.4 + 7px))",
          filter: "blur(0px)",
          opacity: 1,
          offset: 0.8,
        },
        {
          transform: "translateY(calc(var(--fih-reel-height) * -.4))",
          filter: "blur(0px)",
          opacity: 1,
        },
      ],
      { duration, easing: "ease-out" }
    );
    animations.add(animation);
    void animation.finished.then(
      () => animations.delete(animation),
      () => animations.delete(animation)
    );
  }
  function drawReels() {
    for (const part of FIH_PARTS) {
      const choices = partOptions(part, draft.appearance);
      const index = choices.findIndex(({ id }) => id === partShape(draft.appearance, part));
      find(`.fih-lane[data-part="${part}"]`)
        .querySelectorAll<HTMLCanvasElement>("canvas")
        .forEach((canvas) => {
          const offset = Number(canvas.dataset.offset);
          const shape = choices[(index + offset + choices.length) % choices.length].id;
          drawFihPreview(canvas, { ...draft.appearance, ...shapeChange(part, shape) }, part);
        });
    }
  }
  function updatePreview() {
    if (destroyed) return;
    if (livePreview) livePreview.update(draft.appearance);
    else drawFihPreview(preview, draft.appearance);
    drawFihPreview(miniature, draft.appearance);
    updateFavicon(draft.appearance);
    const { fin, body, head } = resolveFihColors(draft.appearance);
    preview.setAttribute(
      "aria-label",
      `Preview: ${describeFih(draft.appearance)}. Fin #${fin.getHexString()}, ${Math.round(draft.appearance.finSize * 100)}%; body #${body.getHexString()}, ${Math.round(draft.appearance.bodySize * 100)}%; head #${head.getHexString()}, ${Math.round(draft.appearance.headSize * 100)}%.`
    );
    drawReels();
  }
  function syncForm() {
    releaseFeedback.cancel();
    const colors = resolveFihColors(draft.appearance);
    for (const part of FIH_PARTS) {
      const choices = partOptions(part, draft.appearance);
      const index = choices.findIndex(({ id }) => id === partShape(draft.appearance, part));
      const reel = find(`.fih-lane[data-part="${part}"] .fih-reel`);
      reel.dataset.shape = choices[index].id;
      reel.setAttribute("aria-valuemax", String(choices.length));
      reel.setAttribute("aria-valuenow", String(index + 1));
      reel.setAttribute("aria-valuetext", choices[index].label);
      find<HTMLInputElement>(`#fih-${part}-picker`).value = `#${colors[part].getHexString()}`;
      const size = draft.appearance[`${part}Size`];
      find<HTMLInputElement>(`#fih-${part}-size`).value = String(size);
      find<HTMLInputElement>(`#fih-${part}-size`).setAttribute(
        "aria-valuetext",
        `${Math.round(size * 100)} percent`
      );
    }
    updatePreview();
  }
  const lanes = FIH_PARTS.map((part) => find(`.fih-lane[data-part="${part}"]`));
  function clearSpinMotion() {
    form.removeAttribute("aria-busy");
    for (const lane of lanes) {
      delete lane.dataset.spinning;
      lane.style.removeProperty("--fih-reel-offset");
      lane.style.removeProperty("--window-depth");
    }
  }
  function stopSpin(land = true) {
    cancelAnimationFrame(spinFrame);
    spinFrame = 0;
    const target = spinTarget;
    spinTarget = null;
    clearSpinMotion();
    if (land && target) {
      draft.change(target);
      syncForm();
      spinStatus.textContent = `New combination: ${describeFih(draft.appearance)}.`;
    }
  }
  function startSpin() {
    stopSpin(false);
    for (const animation of animations) animation.cancel();
    animations.clear();
    const from = { ...draft.appearance };
    draft.surprise();
    const target = { ...draft.appearance };
    if (document.hidden) {
      syncForm();
      spinStatus.textContent = `New combination: ${describeFih(target)}.`;
      return;
    }
    draft.change(from);
    spinTarget = target;
    form.setAttribute("aria-busy", "true");
    spinStatus.textContent = "Spinning.";
    const started = performance.now();
    let previousAppearance = JSON.stringify(from);
    function frame(now: number) {
      spinFrame = 0;
      if (destroyed || !spinTarget) return;
      const sample = sampleFihSpin(from, target, now - started);
      for (const [index, motion] of sample.lanes.entries()) {
        const lane = lanes[index];
        lane.toggleAttribute("data-spinning", motion.spinning);
        lane.style.setProperty("--fih-reel-offset", String(motion.offset));
        lane.style.setProperty("--window-depth", `${motion.depth}px`);
      }
      const nextAppearance = JSON.stringify(sample.appearance);
      if (nextAppearance !== previousAppearance) {
        draft.change(sample.appearance);
        syncForm();
        previousAppearance = nextAppearance;
      }
      if (sample.done) stopSpin();
      else spinFrame = requestAnimationFrame(frame);
    }
    frame(started);
  }
  function changeColor(part: FihPart, value: string | null) {
    stopSpin();
    draft.change(
      part === "body"
        ? { color: value! }
        : part === "fin"
          ? { finColor: value }
          : { headColor: value }
    );
    syncForm();
  }
  for (const part of FIH_PARTS) {
    const column = find(`.fih-lane[data-part="${part}"]`);
    const reel = column.querySelector<HTMLElement>(".fih-reel")!;
    const choices = partOptions(part);
    let wheelDelta = 0;
    function selectShape(index: number) {
      stopSpin();
      const next = ((index % choices.length) + choices.length) % choices.length;
      draft.change(shapeChange(part, choices[next].id));
      syncForm();
      animate(column.querySelector<HTMLElement>(".fih-reel-track")!, 180);
    }
    function cycle(direction: number) {
      const index = choices.findIndex(({ id }) => id === partShape(draft.appearance, part));
      selectShape(index < 0 ? (direction > 0 ? 0 : choices.length - 1) : index + direction);
    }
    column.querySelectorAll<HTMLButtonElement>(".fih-reel-arrow").forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          wheelDelta = 0;
          cycle(Number(button.dataset.direction));
        },
        options
      )
    );
    slotWheels.set(column, (event) => {
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? reel.clientHeight || 100 : 1);
      if (Math.sign(delta) !== Math.sign(wheelDelta)) wheelDelta = 0;
      wheelDelta += delta;
      if (Math.abs(wheelDelta) < 40) return;
      cycle(Math.sign(wheelDelta));
      wheelDelta %= 40;
    });
    reel.addEventListener(
      "keydown",
      (event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        wheelDelta = 0;
        if (event.key === "Home") selectShape(0);
        else if (event.key === "End") selectShape(choices.length - 1);
        else cycle(event.key === "ArrowUp" ? -1 : 1);
      },
      options
    );
    const picker = find<HTMLInputElement>(`#fih-${part}-picker`);
    picker.addEventListener("input", () => changeColor(part, picker.value), options);
    const size = find<HTMLInputElement>(`#fih-${part}-size`);
    size.addEventListener(
      "input",
      () => {
        const value = Number(size.value);
        stopSpin();
        draft.change({ [`${part}Size`]: value });
        syncForm();
      },
      options
    );
  }
  prioritizeControlClicks(form, events.signal);
  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      hoverPointer = event;
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        const pointer = hoverPointer;
        hoverPointer = null;
        if (pointer) hoverSlot(slotAtPointer(pointer));
      });
    },
    { ...options, capture: true, passive: true }
  );
  window.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const slot = slotAtPointer(event);
      if (!slot) return;
      // Cancel native page scrolling in capture phase, before hit-plane or
      // ancestor handlers get a chance to consume the gesture.
      event.preventDefault();
      event.stopPropagation();
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      hoverPointer = null;
      hoverSlot(slot);
      slotWheels.get(slot)!(event);
    },
    { ...options, capture: true, passive: false }
  );
  window.addEventListener("blur", clearHover, options);
  document.documentElement.addEventListener("pointerleave", clearHover, options);
  find(".fih-spin").addEventListener("click", startSpin, options);
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) enterCreator();
    },
    { threshold: 0 }
  );
  function enterCreator() {
    if (enteredCreator) return;
    enteredCreator = true;
    observer.disconnect();
    updateAllowance();
  }
  observer.observe(form);
  form.addEventListener("focusin", enterCreator, options);
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      tick();
      updateAllowance();
      if (release.disabled) return;
      stopSpin();
      const design: FihDesign = {
        ...draft.appearance,
        count: earnedFih(elapsed),
        pattern: "plain",
      };
      onDisplay(design);
      releaseFeedback.play();
      released = design;
      if (persist()) setSaveStatus("local");
      else {
        saveStatus.hidden = false;
        saveStatus.textContent = "can't save here";
      }
      sharing?.onRelease(design);
      release.textContent = "update";
    },
    options
  );
  syncForm();
  updateAllowance();
  updatePreviewCutout();
  if (released) {
    release.textContent = "update";
    onDisplay(released);
  }
  persist();
  const resizeObserver = new ResizeObserver(() => {
    updatePreviewCutout();
    livePreview?.resize();
    if (!spinTarget) updatePreview();
  });
  resizeObserver.observe(form);
  const interval = window.setInterval(() => {
    tick();
    updateAllowance();
  }, 1000);
  document.addEventListener(
    "visibilitychange",
    () => {
      tick();
      updateAllowance();
      if (document.hidden) {
        stopSpin();
        releaseFeedback.cancel();
      }
      persist();
    },
    options
  );
  window.addEventListener(
    "pagehide",
    () => {
      tick();
      stopSpin();
      releaseFeedback.cancel();
      persist();
    },
    options
  );
  return {
    setSaveStatus,
    destroy() {
      tick();
      persist();
      destroyed = true;
      clearHover();
      stopSpin(false);
      releaseFeedback.cancel();
      clearInterval(interval);
      events.abort();
      for (const animation of animations) animation.cancel();
      observer.disconnect();
      resizeObserver.disconnect();
      livePreview?.destroy();
      launcher.remove();
      fihWindow.destroy();
    },
  };
}
