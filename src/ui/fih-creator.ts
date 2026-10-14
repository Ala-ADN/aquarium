import { FIH_INTERVAL_MS, MAX_VISITOR_FIH } from "../constants";
import type { FihAppearance, FihDesign, FihPart, FihShape, FihFinShape, FihHeadShape } from "../types";
import { describeFih, FihDraft, partOptions, partShape, resolveFihColors } from "../fih/appearance";
import { FIH_PARTS, MIN_PART_SIZE, MAX_PART_SIZE } from "../fih/parts";
import { advanceVisit, earnedFih, readVisit, saveVisit } from "../fih/visit";
import { drawFihPreview } from "./fih-preview";
import { createWindow } from "./window";
import type { FihPreviewFactory } from "./fih-live-preview";

function shapeChange(part: FihPart, shape: string): Partial<FihAppearance> {
  return part === "body" ? { shape: shape as FihShape }
    : part === "fin" ? { finShape: shape as FihFinShape } : { headShape: shape as FihHeadShape };
}
function lane(part: FihPart) {
  // Plain groups keep the shared window's 3D chain through the reel artwork.
  // Native controls stay at zero depth; only decorative elements are raised.
  return `<section class="fih-lane" data-part="${part}" role="group" aria-labelledby="fih-${part}-heading"><h3 id="fih-${part}-heading">${part}</h3>
    <button type="button" class="fih-reel-arrow" data-direction="-1" aria-label="Previous ${part} shape">▴</button>
    <div class="fih-reel" tabindex="0" role="spinbutton" aria-label="${part} shape" aria-describedby="fih-reel-help" aria-valuemin="1" aria-valuemax="${partOptions(part).length}" aria-valuenow="1"><div class="fih-reel-track" aria-hidden="true">
      <div class="fih-reel-item fih-reel-neighbor"><canvas data-offset="-1"></canvas></div>
      <div class="fih-reel-item fih-reel-selected"><canvas data-offset="0"></canvas></div>
      <div class="fih-reel-item fih-reel-neighbor"><canvas data-offset="1"></canvas></div>
    </div></div>
    <button type="button" class="fih-reel-arrow" data-direction="1" aria-label="Next ${part} shape">▾</button>
    <output class="fih-shape-name" aria-hidden="true"></output>
    <div class="fih-color-control"><label for="fih-${part}-picker">color</label><input type="color" id="fih-${part}-picker" aria-label="Custom ${part} color" value="#ff9955"></div>
    <div class="fih-size-label"><label for="fih-${part}-size">size</label><output id="fih-${part}-size-value">100%</output></div>
    <input type="range" id="fih-${part}-size" aria-label="${part} size" min="${MIN_PART_SIZE}" max="${MAX_PART_SIZE}" step="0.05" value="1">
  </section>`;
}

export function mountFihCreator(onDisplay: (fih: FihDesign) => void, createPreview?: FihPreviewFactory) {
  let storage: Storage | null = null;
  try { storage = localStorage; } catch { /* Release still works without saving. */ }
  const visit = storage ? readVisit(storage) : { elapsed: 0, fih: null };
  let elapsed = visit.elapsed;
  let released = visit.fih;
  const draft = new FihDraft(released ?? undefined);
  let lastTick = performance.now();
  let wasVisible = !document.hidden;
  let reachedFooter = false;
  let destroyed = false;
  const events = new AbortController();
  const options = { signal: events.signal };
  const app = document.querySelector<HTMLElement>("#fih-footer")!;
  const form = document.createElement("form");
  form.className = "fih-form";
  form.innerHTML = `
    <div class="fih-editor"><div class="fih-preview"><canvas role="img" aria-label="Preview of your fih"></canvas><span class="fih-preview-caption" aria-hidden="true">three parts. one little you.</span></div>
    <div class="fih-lanes">${FIH_PARTS.map(lane).join("")}</div></div>
    <div class="fih-machine-heading"><div><p class="fih-description"></p><p class="fih-reel-help" id="fih-reel-help">Scroll a slot or use ↑ / ↓ to change its shape.</p></div><button type="button" class="fih-spin">spin all</button></div>
    <p class="fih-spin-status visually-hidden" role="status" aria-live="polite"></p>
    <div class="fih-release-row"><div><div class="fih-swarm-row"><span>your swarm</span><output id="fih-count" aria-label="Fih earned">0 / ${MAX_VISITOR_FIH}</output></div><p class="fih-hint" id="fih-time"></p></div><button class="fih-release" type="submit" disabled>release into aquarium</button></div>
    <p class="fih-status" role="status" aria-live="polite">Your fih are saved in this browser.</p>`;
  const fihWindow = createWindow("make a fih", form);
  fihWindow.element.classList.add("fih-window");
  fihWindow.element.id = "fih-creator";
  app.replaceChildren(fihWindow.element);
  const find = <T extends HTMLElement>(selector: string) => form.querySelector<T>(selector)!;
  const preview = find<HTMLCanvasElement>(".fih-preview canvas");
  const livePreview = createPreview?.(preview, draft.appearance);
  const description = find<HTMLParagraphElement>(".fih-description");
  const count = find<HTMLOutputElement>("#fih-count");
  const time = find<HTMLParagraphElement>("#fih-time");
  const release = find<HTMLButtonElement>(".fih-release");
  const status = find<HTMLParagraphElement>(".fih-status");
  const spinStatus = find<HTMLParagraphElement>(".fih-spin-status");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animations = new Set<Animation>();
  const slotWheels = new Map<HTMLElement, (event: WheelEvent) => void>();
  let hoveredSlot: HTMLElement | null = null;

  function hoverSlot(slot: HTMLElement | null) {
    if (slot === hoveredSlot) return;
    if (hoveredSlot) delete hoveredSlot.dataset.hovered;
    hoveredSlot = slot;
    if (slot) slot.dataset.hovered = "";
    fihWindow.setTiltPaused(slot !== null);
  }
  function slotAtPointer(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".fih-lane") : null;
    if (target && slotWheels.has(target)) return target;
    // 3D descendants can hit an ancestor plane. Fall back to the slot's visual
    // bounds so a wheel gesture cannot leak through to the page during a tilt.
    for (const slot of slotWheels.keys()) {
      const rect = slot.getBoundingClientRect();
      if (rect.width && rect.height && event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom) return slot;
    }
    return null;
  }

  function persist() {
    const saved = storage !== null && saveVisit(storage, { elapsed, fih: released });
    if (!saved) status.textContent = "Browser saving is unavailable. Your fih can still swim this visit.";
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
    count.value = `${earned} / ${MAX_VISITOR_FIH}`;
    release.disabled = !reachedFooter || earned === 0;
    const seconds = Math.max(1, Math.ceil((FIH_INTERVAL_MS - elapsed % FIH_INTERVAL_MS) / 1000));
    time.textContent = earned === MAX_VISITOR_FIH ? `All ${MAX_VISITOR_FIH} fih earned. They're yours to release.`
      : earned === 0 ? `1 fih every ${FIH_INTERVAL_MS / 1000} seconds. First fih in ${seconds}s.`
      : `Next fih in ${seconds}s. You'll release all ${earned}.`;
    if (earned !== previous) persist();
  }
  function animate(element: HTMLElement, duration: number) {
    if (reducedMotion.matches || !element.animate) return;
    // Settle the reels without delaying editing or release.
    const animation = element.animate([
      { transform: "translateY(-22px)", filter: "blur(3px)", opacity: .4 },
      { transform: "translateY(7px)", filter: "blur(0px)", opacity: 1, offset: .8 },
      { transform: "translateY(0px)", filter: "blur(0px)", opacity: 1 },
    ], { duration, easing: "ease-out" });
    animations.add(animation);
    void animation.finished.then(
      () => animations.delete(animation),
      () => animations.delete(animation),
    );
  }
  function drawReels() {
    for (const part of FIH_PARTS) {
      const choices = partOptions(part);
      const index = choices.findIndex(({ id }) => id === partShape(draft.appearance, part));
      find(`.fih-lane[data-part="${part}"]`).querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
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
    description.textContent = describeFih(draft.appearance);
    const { fin, body, head } = resolveFihColors(draft.appearance);
    preview.setAttribute("aria-label", `Preview: ${describeFih(draft.appearance)}. Fin #${fin.getHexString()}, ${Math.round(draft.appearance.finSize * 100)}%; body #${body.getHexString()}, ${Math.round(draft.appearance.bodySize * 100)}%; head #${head.getHexString()}, ${Math.round(draft.appearance.headSize * 100)}%.`);
    drawReels();
  }
  function syncForm() {
    const colors = resolveFihColors(draft.appearance);
    for (const part of FIH_PARTS) {
      const choices = partOptions(part);
      const index = choices.findIndex(({ id }) => id === partShape(draft.appearance, part));
      const reel = find(`.fih-lane[data-part="${part}"] .fih-reel`);
      reel.dataset.shape = choices[index].id;
      reel.setAttribute("aria-valuenow", String(index + 1));
      reel.setAttribute("aria-valuetext", choices[index].label);
      find<HTMLOutputElement>(`.fih-lane[data-part="${part}"] .fih-shape-name`).value = choices[index].label;
      find<HTMLInputElement>(`#fih-${part}-picker`).value = `#${colors[part].getHexString()}`;
      const size = draft.appearance[`${part}Size`];
      find<HTMLInputElement>(`#fih-${part}-size`).value = String(size);
      find<HTMLInputElement>(`#fih-${part}-size`).setAttribute("aria-valuetext", `${Math.round(size * 100)} percent`);
      find<HTMLOutputElement>(`#fih-${part}-size-value`).value = `${Math.round(size * 100)}%`;
    }
    updatePreview();
  }
  function changeColor(part: FihPart, value: string | null) {
    draft.change(part === "body" ? { color: value! } : part === "fin" ? { finColor: value } : { headColor: value });
    syncForm();
  }
  for (const part of FIH_PARTS) {
    const column = find(`.fih-lane[data-part="${part}"]`);
    const reel = column.querySelector<HTMLElement>(".fih-reel")!;
    const choices = partOptions(part);
    let wheelDelta = 0;
    function selectShape(index: number) {
      const next = (index % choices.length + choices.length) % choices.length;
      draft.change(shapeChange(part, choices[next].id));
      syncForm();
      animate(column.querySelector<HTMLElement>(".fih-reel-track")!, 180);
    }
    function cycle(direction: number) {
      const index = choices.findIndex(({ id }) => id === partShape(draft.appearance, part));
      selectShape(index + direction);
    }
    column.querySelectorAll<HTMLButtonElement>(".fih-reel-arrow").forEach((button) => button.addEventListener("click", () => {
      wheelDelta = 0;
      cycle(Number(button.dataset.direction));
    }, options));
    slotWheels.set(column, (event) => {
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? reel.clientHeight || 100 : 1);
      if (Math.sign(delta) !== Math.sign(wheelDelta)) wheelDelta = 0;
      wheelDelta += delta;
      if (Math.abs(wheelDelta) < 40) return;
      cycle(Math.sign(wheelDelta));
      wheelDelta %= 40;
    });
    reel.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      wheelDelta = 0;
      if (event.key === "Home") selectShape(0);
      else if (event.key === "End") selectShape(choices.length - 1);
      else cycle(event.key === "ArrowUp" ? -1 : 1);
    }, options);
    const picker = find<HTMLInputElement>(`#fih-${part}-picker`);
    picker.addEventListener("input", () => changeColor(part, picker.value), options);
    const size = find<HTMLInputElement>(`#fih-${part}-size`);
    size.addEventListener("input", () => { draft.change({ [`${part}Size`]: Number(size.value) }); syncForm(); }, options);
  }
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch") hoverSlot(slotAtPointer(event));
  }, { ...options, capture: true, passive: true });
  window.addEventListener("wheel", (event) => {
    if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const slot = slotAtPointer(event);
    if (!slot) return;
    // Cancel native page scrolling in capture phase, before hit-plane or
    // ancestor handlers get a chance to consume the gesture.
    event.preventDefault();
    event.stopPropagation();
    hoverSlot(slot);
    slotWheels.get(slot)!(event);
  }, { ...options, capture: true, passive: false });
  window.addEventListener("blur", () => hoverSlot(null), options);
  document.documentElement.addEventListener("pointerleave", () => hoverSlot(null), options);
  find(".fih-spin").addEventListener("click", () => {
    for (const animation of animations) animation.cancel();
    draft.surprise(); syncForm();
    FIH_PARTS.forEach((part, index) => animate(find(`.fih-lane[data-part="${part}"] .fih-reel-track`), 420 + index * 100));
    spinStatus.textContent = `New combination: ${describeFih(draft.appearance)}.`;
  }, options);
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) for (const animation of animations) animation.cancel();
  }, options);
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) enterCreator();
  }, { threshold: 0 });
  function enterCreator() {
    if (reachedFooter) return;
    reachedFooter = true; observer.disconnect(); updateAllowance();
  }
  observer.observe(form);
  form.addEventListener("focusin", enterCreator, options);
  form.addEventListener("submit", (event) => {
    event.preventDefault(); tick(); updateAllowance();
    if (release.disabled) return;
    const design: FihDesign = { ...draft.appearance, count: earnedFih(elapsed), pattern: "plain" };
    onDisplay(design); released = design;
    if (persist()) status.textContent = `${design.count} fih swimming. Saved in this browser.`;
    release.textContent = "update my fih";
  }, options);
  syncForm(); updateAllowance();
  if (released) { release.textContent = "update my fih"; onDisplay(released); }
  persist();
  const resizeObserver = new ResizeObserver(() => { livePreview?.resize(); updatePreview(); });
  resizeObserver.observe(form);
  const interval = window.setInterval(() => { tick(); updateAllowance(); }, 1000);
  document.addEventListener("visibilitychange", () => { tick(); updateAllowance(); persist(); }, options);
  window.addEventListener("pagehide", () => { tick(); persist(); }, options);
  return { destroy() {
    tick(); persist(); destroyed = true; clearInterval(interval); events.abort();
    for (const animation of animations) animation.cancel();
    observer.disconnect(); resizeObserver.disconnect(); livePreview?.destroy(); fihWindow.destroy();
  } };
}
