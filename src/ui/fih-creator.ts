import { FIH_INTERVAL_MS, MAX_VISITOR_FIH } from "../constants";
import type { FihAppearance, FihDesign, FihPart, FihShape, FihFinShape, FihHeadShape } from "../types";
import { describeFih, FihDraft, FIH_PALETTE, partOptions, partShape, resolveFihColors } from "../fih/appearance";
import { FIH_PARTS, MIN_PART_SIZE, MAX_PART_SIZE } from "../fih/parts";
import { advanceVisit, earnedFih, readVisit, saveVisit } from "../fih/visit";
import { drawFihPreview } from "./fih-preview";
import { createWindow } from "./window";

function shapeChange(part: FihPart, shape: string): Partial<FihAppearance> {
  return part === "body" ? { shape: shape as FihShape }
    : part === "fin" ? { finShape: shape as FihFinShape } : { headShape: shape as FihHeadShape };
}
function lane(part: FihPart) {
  // Plain groups keep the shared window's 3D chain through the reel artwork.
  // Native controls stay at zero depth; only decorative elements are raised.
  return `<section class="fih-lane" data-part="${part}" role="group" aria-labelledby="fih-${part}-heading"><h3 id="fih-${part}-heading">${part}</h3>
    <button type="button" class="fih-reel-arrow" data-direction="-1" aria-label="Previous ${part} shape">▴</button>
    <div class="fih-reel" aria-hidden="true"><div class="fih-reel-track">
      <div class="fih-reel-item fih-reel-neighbor"><canvas data-offset="-1"></canvas></div>
      <div class="fih-reel-item fih-reel-selected"><canvas data-offset="0"></canvas></div>
      <div class="fih-reel-item fih-reel-neighbor"><canvas data-offset="1"></canvas></div>
    </div></div>
    <button type="button" class="fih-reel-arrow" data-direction="1" aria-label="Next ${part} shape">▾</button>
    <label class="fih-control-label" for="fih-${part}-shape">shape</label>
    <select id="fih-${part}-shape" aria-label="${part} shape">${partOptions(part).map(({ id, label }) => `<option value="${id}">${label}</option>`).join("")}</select>
    <label class="fih-control-label" for="fih-${part}-color">color</label><div class="fih-color-controls">
    <select id="fih-${part}-color" aria-label="${part} color">${part !== "body" ? '<option value="auto">match body</option>' : ""}
      ${FIH_PALETTE.map(({ name, hex }) => `<option value="${hex}">${name}</option>`).join("")}<option value="custom">custom</option>
    </select>
    <input type="color" id="fih-${part}-picker" aria-label="Custom ${part} color" value="#ff9955"></div>
    <div class="fih-size-label"><label for="fih-${part}-size">size</label><output id="fih-${part}-size-value">100%</output></div>
    <input type="range" id="fih-${part}-size" aria-label="${part} size" min="${MIN_PART_SIZE}" max="${MAX_PART_SIZE}" step="0.05" value="1">
  </section>`;
}

export function mountFihCreator(onDisplay: (fih: FihDesign) => void) {
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
    <p class="fih-reward">You made it. Mix a little fih of your own.</p>
    <div class="fih-overview"><div class="fih-preview"><canvas role="img" aria-label="Preview of your fih"></canvas><span class="fih-preview-caption" aria-hidden="true">three parts. one little you.</span></div>
    <div class="fih-machine-heading"><p class="fih-description"></p><div class="fih-spin-actions"><button type="button" class="fih-spin">spin all</button><button type="button" class="fih-undo" hidden>undo spin</button></div></div></div>
    <div class="fih-lanes">${FIH_PARTS.map(lane).join("")}</div>
    <p class="fih-spin-status" role="status" aria-live="polite"></p>
    <fieldset class="fih-effects"><legend>special effects</legend><div class="fih-effects-list">
      <button type="button" disabled>stripes · locked</button><button type="button" disabled>spots · locked</button><button type="button" disabled>neon glow · locked</button>
    </div><p>Explore projects and experience to unlock effects. Coming soon.</p></fieldset>
    <div class="fih-release-row"><div><div class="fih-swarm-row"><span>your swarm</span><output id="fih-count" aria-label="Fih earned">0 / ${MAX_VISITOR_FIH}</output></div><p class="fih-hint" id="fih-time"></p></div><button class="fih-release" type="submit" disabled>release into aquarium</button></div>
    <p class="fih-status" role="status" aria-live="polite">Your fih are saved in this browser.</p>`;
  const fihWindow = createWindow("make a fih", form);
  fihWindow.element.classList.add("fih-window");
  fihWindow.element.id = "fih-creator";
  app.replaceChildren(fihWindow.element);
  const find = <T extends HTMLElement>(selector: string) => form.querySelector<T>(selector)!;
  const preview = find<HTMLCanvasElement>(".fih-preview canvas");
  const description = find<HTMLParagraphElement>(".fih-description");
  const count = find<HTMLOutputElement>("#fih-count");
  const time = find<HTMLParagraphElement>("#fih-time");
  const release = find<HTMLButtonElement>(".fih-release");
  const status = find<HTMLParagraphElement>(".fih-status");
  const spinStatus = find<HTMLParagraphElement>(".fih-spin-status");
  const undo = find<HTMLButtonElement>(".fih-undo");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animations = new Set<Animation>();

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
    drawFihPreview(preview, draft.appearance);
    description.textContent = describeFih(draft.appearance);
    const { fin, body, head } = resolveFihColors(draft.appearance);
    preview.setAttribute("aria-label", `Preview: ${describeFih(draft.appearance)}. Fin #${fin.getHexString()}, ${Math.round(draft.appearance.finSize * 100)}%; body #${body.getHexString()}, ${Math.round(draft.appearance.bodySize * 100)}%; head #${head.getHexString()}, ${Math.round(draft.appearance.headSize * 100)}%.`);
    undo.hidden = !draft.canUndo;
    drawReels();
  }
  function syncForm() {
    const colors = resolveFihColors(draft.appearance);
    for (const part of FIH_PARTS) {
      find<HTMLSelectElement>(`#fih-${part}-shape`).value = partShape(draft.appearance, part);
      const color = part === "body" ? draft.appearance.color : part === "fin" ? draft.appearance.finColor : draft.appearance.headColor;
      const selected = color === null ? "auto" : FIH_PALETTE.some((item) => item.hex === color) ? color : "custom";
      find<HTMLSelectElement>(`#fih-${part}-color`).value = selected;
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
    const shapeSelect = find<HTMLSelectElement>(`#fih-${part}-shape`);
    shapeSelect.addEventListener("change", () => { draft.change(shapeChange(part, shapeSelect.value)); syncForm(); }, options);
    column.querySelectorAll<HTMLButtonElement>(".fih-reel-arrow").forEach((button) => button.addEventListener("click", () => {
      const choices = partOptions(part);
      const index = choices.findIndex(({ id }) => id === partShape(draft.appearance, part));
      const next = (index + Number(button.dataset.direction) + choices.length) % choices.length;
      draft.change(shapeChange(part, choices[next].id));
      syncForm();
      animate(column.querySelector<HTMLElement>(".fih-reel-track")!, 260);
    }, options));
    const colorSelect = find<HTMLSelectElement>(`#fih-${part}-color`);
    const picker = find<HTMLInputElement>(`#fih-${part}-picker`);
    colorSelect.addEventListener("change", () => {
      changeColor(part, colorSelect.value === "auto" ? null : colorSelect.value === "custom" ? picker.value : colorSelect.value);
    }, options);
    picker.addEventListener("input", () => changeColor(part, picker.value), options);
    const size = find<HTMLInputElement>(`#fih-${part}-size`);
    size.addEventListener("input", () => { draft.change({ [`${part}Size`]: Number(size.value) }); syncForm(); }, options);
  }
  find(".fih-spin").addEventListener("click", () => {
    for (const animation of animations) animation.cancel();
    draft.surprise(); syncForm();
    FIH_PARTS.forEach((part, index) => animate(find(`.fih-lane[data-part="${part}"] .fih-reel-track`), 420 + index * 100));
    spinStatus.textContent = `New combination: ${describeFih(draft.appearance)}. You can edit it or undo the spin.`;
  }, options);
  undo.addEventListener("click", () => {
    for (const animation of animations) animation.cancel();
    draft.undo(); syncForm(); spinStatus.textContent = "Previous combination restored.";
    find<HTMLButtonElement>(".fih-spin").focus();
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
  const resizeObserver = new ResizeObserver(updatePreview);
  resizeObserver.observe(form);
  const interval = window.setInterval(() => { tick(); updateAllowance(); }, 1000);
  document.addEventListener("visibilitychange", () => { tick(); updateAllowance(); persist(); }, options);
  window.addEventListener("pagehide", () => { tick(); persist(); }, options);
  return { destroy() {
    tick(); persist(); destroyed = true; clearInterval(interval); events.abort();
    for (const animation of animations) animation.cancel();
    observer.disconnect(); resizeObserver.disconnect(); fihWindow.destroy();
  } };
}
