import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, FIH_PALETTE } from "../src/fih/appearance";
import { FIH_PARTS, MAX_PART_SIZE, MIN_PART_SIZE } from "../src/fih/parts";
import { FIH_SPIN_DURATION, FIH_SPIN_STAGGER, sampleFihSpin } from "../src/ui/fih-spin";

const from = { ...DEFAULT_APPEARANCE, finSize: .6, bodySize: .6, headSize: .6 };
const target = { ...DEFAULT_APPEARANCE, finShape: "fan" as const, shape: "diamond" as const,
  headShape: "blunt" as const, finSize: 1.5, bodySize: 1.5, headSize: 1.5,
  color: FIH_PALETTE[7].hex, finColor: FIH_PALETTE[7].hex, headColor: FIH_PALETTE[7].hex };

describe("slot spin progression", () => {
  it("starts from the current appearance and ends exactly on the randomized result", () => {
    expect(sampleFihSpin(from, target, 0).appearance).toEqual(from);
    const end = sampleFihSpin(from, target, 10_000);
    expect(end.appearance).toEqual(target);
    expect(end.done).toBe(true);
    for (const lane of end.lanes) {
      expect(lane.offset).toBe(0);
      expect(lane.depth).toBe(0);
    }
  });

  it("lands fin, body, and head in order and keeps each landed column fixed", () => {
    for (const [index, part] of FIH_PARTS.entries()) {
      const elapsed = FIH_SPIN_DURATION + index * FIH_SPIN_STAGGER;
      const sample = sampleFihSpin(from, target, elapsed);
      expect(sample.lanes.map(({ spinning }) => spinning)).toEqual(
        FIH_PARTS.map((_, lane) => lane > index));
      const shapeKey = part === "body" ? "shape" : part === "fin" ? "finShape" : "headShape";
      const colorKey = part === "body" ? "color" : `${part}Color` as const;
      for (const time of [elapsed, elapsed + 100, elapsed + 1000]) {
        const { appearance } = sampleFihSpin(from, target, time);
        expect(appearance[shapeKey]).toBe(target[shapeKey]);
        expect(appearance[colorKey]).toBe(target[colorKey]);
        expect(appearance[`${part}Size`]).toBe(target[`${part}Size`]);
      }
    }
  });

  it("cycles sizes through the whole range, wrapping maximum to minimum on each revolution", () => {
    const values = [];
    const colors = new Set();
    const shapes = new Set();
    for (let time = 0; time <= FIH_SPIN_DURATION; time += 2) {
      const { appearance } = sampleFihSpin(from, target, time);
      values.push(appearance.finSize);
      colors.add(appearance.finColor);
      shapes.add(appearance.finShape);
    }
    expect(new Set(values).size).toBe(19);
    expect(Math.min(...values)).toBe(MIN_PART_SIZE);
    expect(Math.max(...values)).toBe(MAX_PART_SIZE);
    const wraps = values.filter((value, index) => index && value < values[index - 1]);
    expect(wraps).toHaveLength(3);
    expect(wraps.every((value) => value === MIN_PART_SIZE)).toBe(true);
    expect(colors.size).toBeGreaterThanOrEqual(FIH_PALETTE.length);
    expect(shapes.size).toBe(4);
  });

  it("moves the reels between symbols and lifts the slots above the window before settling", () => {
    const samples = [100, 220, 350, 480, 650, 820, 1000].map((time) =>
      sampleFihSpin(from, target, time).lanes[0]);
    expect(samples.some(({ depth }) => depth > 20)).toBe(true);
    expect(samples.every(({ depth }) => depth > 0 && depth <= 40)).toBe(true);
    expect(sampleFihSpin(from, target, 0).lanes[0].depth).toBe(0);
    expect(sampleFihSpin(from, target, FIH_SPIN_DURATION).lanes[0].depth).toBe(0);
    expect(samples.every(({ offset }) => offset > 0 && offset < 1)).toBe(true);
  });
});
