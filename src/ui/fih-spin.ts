import type { FihAppearance } from "../types";
import { FIH_PALETTE, partOptions, partShape, resolveFihColors } from "../fih/appearance";
import { FIH_PARTS, MIN_PART_SIZE, MAX_PART_SIZE } from "../fih/parts";

export const FIH_SPIN_DURATION = 1500;
export const FIH_SPIN_STAGGER = 500;
const palette: readonly string[] = FIH_PALETTE.map(({ hex }) => hex);
const sizeSteps = Math.round((MAX_PART_SIZE - MIN_PART_SIZE) / .05) + 1;

// Move forward through complete revolutions, then slow down onto the result.
function travel(start: number, end: number, length: number, cycles: number, progress: number) {
  const distance = cycles * length + ((end - start + length) % length);
  return distance * (1 - (1 - progress) ** 3);
}

export function sampleFihSpin(from: FihAppearance, target: FihAppearance, elapsed: number) {
  const appearance = { ...from };
  const colors = resolveFihColors(from);
  const lanes = FIH_PARTS.map((part, lane) => {
    const duration = FIH_SPIN_DURATION + lane * FIH_SPIN_STAGGER;
    const progress = Math.max(0, Math.min(1, elapsed / duration));
    const spinning = progress < 1;
    const choices = partOptions(part);
    const start = choices.findIndex(({ id }) => id === partShape(from, part));
    const end = choices.findIndex(({ id }) => id === partShape(target, part));
    const shapeTravel = travel(start, end, choices.length, 4, progress);
    const shape = choices[(start + Math.floor(shapeTravel)) % choices.length].id;
    const shapeKey = part === "body" ? "shape" : part === "fin" ? "finShape" : "headShape";
    Object.assign(appearance, { [shapeKey]: spinning ? shape : partShape(target, part) });

    const sizeKey = `${part}Size` as const;
    const firstSize = Math.round((from[sizeKey] - MIN_PART_SIZE) / .05);
    const lastSize = Math.round((target[sizeKey] - MIN_PART_SIZE) / .05);
    const sizeTravel = travel(firstSize, lastSize, sizeSteps, 3, progress);
    appearance[sizeKey] = spinning
      ? sizeTravel < 1 ? from[sizeKey]
        : Math.round((MIN_PART_SIZE + ((firstSize + Math.floor(sizeTravel)) % sizeSteps) * .05) * 100) / 100
      : target[sizeKey];

    const colorKey = part === "body" ? "color" : `${part}Color` as const;
    const firstColor = `#${colors[part].getHexString()}`;
    const firstColorIndex = Math.max(0, palette.indexOf(firstColor));
    const lastColorIndex = Math.max(0, palette.indexOf(target[colorKey]!));
    const colorTravel = travel(firstColorIndex, lastColorIndex, palette.length, 3, progress);
    const colorStep = Math.floor(colorTravel);
    Object.assign(appearance, { [colorKey]: spinning
      ? colorStep === 0 ? from[colorKey] : palette[(firstColorIndex + colorStep) % palette.length]
      : target[colorKey] });

    return {
      part,
      spinning,
      offset: spinning ? shapeTravel % 1 : 0,
      // Lift the whole slot out of the window, then lower it as it lands.
      depth: spinning
        ? Math.sin(Math.PI * progress) * (32 + 8 * Math.sin(elapsed / 150 + lane * 1.2))
        : 0,
    };
  });
  return { appearance, lanes, done: lanes.every(({ spinning }) => !spinning) };
}
