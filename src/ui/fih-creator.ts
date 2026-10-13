import { Color } from "three";
import { DEFAULT_FIH_COLOR, FIH_FIN_SHADE, FIH_INTERVAL_MS, MAX_VISITOR_FIH } from "../constants";
import { FihGeometry } from "../fih/geometry/fih";
import type { FihDesign, FihShape } from "../types";
import { createWindow } from "./window";

const STORAGE_KEY = "aquarium.visitor.v1";
const MAX_TIME = MAX_VISITOR_FIH * FIH_INTERVAL_MS;

function readVisit(): { elapsed: number; fih: FihDesign | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const elapsed =
      typeof saved?.elapsed === "number" && Number.isFinite(saved.elapsed)
        ? Math.max(0, Math.min(saved.elapsed, MAX_TIME))
        : 0;
    // Accept the previous local-preview save format.
    const fih = saved?.fih ?? saved?.fish;
    if (
      fih &&
      ["classic", "round", "long"].includes(fih.shape) &&
      typeof fih.color === "string" &&
      /^#[\da-f]{6}$/i.test(fih.color) &&
      Number.isInteger(fih.count) &&
      fih.count > 0 &&
      elapsed >= FIH_INTERVAL_MS
    ) {
      return {
        elapsed,
        fih: {
          ...fih,
          count: Math.min(fih.count, MAX_VISITOR_FIH, Math.floor(elapsed / FIH_INTERVAL_MS)),
        },
      };
    }
    return { elapsed, fih: null };
  } catch {
    return { elapsed: 0, fih: null };
  }
}

// The preview uses the same geometry and colors as the swimming fih.
function drawPreview(canvas: HTMLCanvasElement, shape: FihShape, hex: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const color = new Color(hex);
  const geometry = new FihGeometry(
    {
      bodyShape: shape,
      bodyColor: color,
      finColor: color.clone().multiplyScalar(FIH_FIN_SHADE),
    },
    1
  );
  const vertices = geometry.getAttribute("position");
  const colors = geometry.getAttribute("fihColor");
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const center = (bounds.min.z + bounds.max.z) / 2;
  const scale = Math.min(90 / (bounds.max.z - bounds.min.z), 38 / (bounds.max.y - bounds.min.y));

  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < vertices.count; i += 3) {
    context.fillStyle = new Color(colors.getX(i), colors.getY(i), colors.getZ(i)).getStyle();
    context.beginPath();
    for (let j = 0; j < 3; j++) {
      const x = Math.round(canvas.width / 2 + (vertices.getZ(i + j) - center) * scale);
      const y = Math.round(canvas.height / 2 - vertices.getY(i + j) * scale);
      if (j === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.strokeStyle = context.fillStyle;
    context.lineWidth = 1;
    context.stroke();
  }
  geometry.dispose();
}

export function mountFihCreator(onDisplay: (fih: FihDesign) => void) {
  const visit = readVisit();
  let elapsed = visit.elapsed;
  let released = visit.fih;
  let lastTick = performance.now();
  let wasVisible = !document.hidden;
  let reachedFooter = false;

  const app = document.querySelector<HTMLElement>("#fih-footer")!;
  const form = document.createElement("form");
  form.className = "fih-form";
  form.innerHTML = `
        <p class="fih-reward">You made it. Leave a little fih behind.</p>
        <div class="fih-preview"><canvas width="128" height="56" role="img" aria-label="Preview of your fih"></canvas></div>
        <div class="fih-settings">
        <fieldset class="fih-shapes">
          <legend>shape</legend>
          <div class="field-row"><input id="fih-shape-classic" type="radio" name="shape" value="classic" checked><label for="fih-shape-classic">classic</label></div>
          <div class="field-row"><input id="fih-shape-round" type="radio" name="shape" value="round"><label for="fih-shape-round">round</label></div>
          <div class="field-row"><input id="fih-shape-long" type="radio" name="shape" value="long"><label for="fih-shape-long">long</label></div>
        </fieldset>
        <div class="fih-color-row">
          <label for="fih-color">color</label>
          <input id="fih-color" name="color" type="color" value="${DEFAULT_FIH_COLOR}">
        </div>
        <div class="fih-swarm-row">
          <span>your swarm</span>
          <output id="fih-count" aria-label="Fih earned">0 / ${MAX_VISITOR_FIH}</output>
        </div>
        <p class="fih-hint" id="fih-time"></p>
        <button class="fih-release" type="submit" style="--window-depth: 36px" disabled>release into aquarium</button>
        <p class="fih-status" role="status">Local preview: fih are saved in this browser.</p>
        </div>
  `;
  const fihWindow = createWindow("make a fih", form);
  fihWindow.element.classList.add("fih-window");
  fihWindow.element.id = "fih-creator";
  app.replaceChildren(fihWindow.element);

  const preview = app.querySelector<HTMLCanvasElement>(".fih-preview canvas")!;
  const color = app.querySelector<HTMLInputElement>("#fih-color")!;
  const count = app.querySelector<HTMLOutputElement>("#fih-count")!;
  const time = app.querySelector<HTMLParagraphElement>("#fih-time")!;
  const release = app.querySelector<HTMLButtonElement>(".fih-release")!;
  const status = app.querySelector<HTMLParagraphElement>(".fih-status")!;
  const shape = () =>
    form.querySelector<HTMLInputElement>('input[name="shape"]:checked')!.value as FihShape;

  function saveVisit() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ elapsed, fih: released }));
      return true;
    } catch {
      status.textContent = "Browser saving is unavailable. Your fih can still swim this visit.";
      return false;
    }
  }

  function tick() {
    const now = performance.now();
    if (wasVisible) elapsed = Math.min(MAX_TIME, elapsed + now - lastTick);
    lastTick = now;
    wasVisible = !document.hidden;
  }

  function updateAllowance() {
    const max = Math.min(MAX_VISITOR_FIH, Math.floor(elapsed / FIH_INTERVAL_MS));
    const previousMax = Number(count.dataset.earned ?? 0);
    count.dataset.earned = String(max);
    const label = `${max} / ${MAX_VISITOR_FIH}`;
    if (count.value !== label) count.value = label;
    release.disabled = !reachedFooter || max === 0;
    const seconds = Math.max(1, Math.ceil((FIH_INTERVAL_MS - (elapsed % FIH_INTERVAL_MS)) / 1000));
    time.textContent =
      max === MAX_VISITOR_FIH
        ? `All ${MAX_VISITOR_FIH} fih earned. They're yours to release.`
        : max === 0
          ? `1 fih every ${FIH_INTERVAL_MS / 1000} seconds. First fih in ${seconds}s.`
          : `Next fih in ${seconds}s. You'll release all ${max}.`;
    if (max !== previousMax) saveVisit();
  }

  function updatePreview() {
    drawPreview(preview, shape(), color.value);
    preview.setAttribute("aria-label", `Preview of your ${shape()} fih in ${color.value}`);
  }

  // Perspective transforms can round a fully visible button just below 1.
  const footerVisibility = 0.999;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.some(
        (entry) => entry.isIntersecting && entry.intersectionRatio >= footerVisibility
      );
      if (!visible) return;
      reachedFooter = true;
      observer.disconnect();
      updateAllowance();
    },
    { threshold: footerVisibility }
  );
  observer.observe(release);
  form.addEventListener("input", updatePreview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    tick();
    updateAllowance();
    if (release.disabled) return;
    const design: FihDesign = {
      shape: shape(),
      color: color.value,
      count: Math.min(MAX_VISITOR_FIH, Math.floor(elapsed / FIH_INTERVAL_MS)),
    };
    onDisplay(design);
    released = design;
    if (saveVisit()) status.textContent = `${design.count} fih swimming. Saved in this browser.`;
    release.textContent = "update my fih";
  });

  updateAllowance();
  if (released) {
    form.querySelector<HTMLInputElement>(`input[value="${released.shape}"]`)!.checked = true;
    color.value = released.color;
    release.textContent = "update my fih";
    onDisplay(released);
  }
  updatePreview();
  window.setInterval(() => {
    tick();
    updateAllowance();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    tick();
    updateAllowance();
    saveVisit();
  });
  window.addEventListener("pagehide", () => {
    tick();
    saveVisit();
  });
}
