import { describe, expect, it } from "vitest";
import { MAX_FIH, WIDTH } from "../src/constants";
import { FihGeometry } from "../src/fih/geometry/fih";

describe("FihGeometry", () => {
  it("creates expected attributes and correct reference mapping", () => {
    const geometry = new FihGeometry();

    const position = geometry.getAttribute("position");
    const fihColor = geometry.getAttribute("fihColor");
    const reference = geometry.getAttribute("reference");
    const fihVertex = geometry.getAttribute("fihVertex");

    expect(position).toBeTruthy();
    expect(fihColor).toBeTruthy();
    expect(reference).toBeTruthy();
    expect(fihVertex).toBeTruthy();

    const trianglesPerFih = 3;
    const points = MAX_FIH * trianglesPerFih * 3;

    expect(position.count).toBe(points);
    expect(fihColor.count).toBe(points);
    expect(reference.count).toBe(points);
    expect(fihVertex.count).toBe(points);

    const refArray = reference.array as Float32Array;

    const expectedRefForFih = (fihIndex: number) => {
      return {
        x: (fihIndex % WIDTH) / WIDTH,
        y: Math.floor(fihIndex / WIDTH) / WIDTH,
      };
    };

    const assertPointReference = (pointIndex: number, fihIndex: number) => {
      const expected = expectedRefForFih(fihIndex);
      expect(refArray[pointIndex * 2]).toBeCloseTo(expected.x, 8);
      expect(refArray[pointIndex * 2 + 1]).toBeCloseTo(expected.y, 8);
    };

    assertPointReference(0, 0);

    const firstPointOfFihAtRowBoundary = WIDTH * trianglesPerFih * 3;
    assertPointReference(firstPointOfFihAtRowBoundary, WIDTH);

    const firstPointOfLastFih = (MAX_FIH - 1) * trianglesPerFih * 3;
    assertPointReference(firstPointOfLastFih, MAX_FIH - 1);
  });
});
