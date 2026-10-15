// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "../src/fih/appearance";
import { drawFihPreview } from "../src/ui/fih-preview";

function preview(headColor: string | null = null) {
  const fills: { color: string; triangles: number }[] = [];
  let triangles = 0;
  const context = {
    fillStyle: "", setTransform: vi.fn(), clearRect: vi.fn(),
    beginPath: () => { triangles = 0; },
    moveTo: () => { triangles++; }, lineTo: vi.fn(), closePath: vi.fn(),
    fill() { fills.push({ color: this.fillStyle, triangles }); },
    stroke: vi.fn(), createLinearGradient: vi.fn(),
  };
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  drawFihPreview(canvas, { ...DEFAULT_APPEARANCE, headColor });
  return { context, fills };
}

afterEach(() => vi.restoreAllMocks());

describe("connected canvas preview", () => {
  it("fills the classic body and pointed head together without stroking their shared edge", () => {
    const { context, fills } = preview();
    expect(fills).toHaveLength(2);
    expect(fills[0].triangles).toBe(1); // Fin.
    expect(fills[1].triangles).toBe(2); // Connected body and head.
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it("paints a distinct solid head color over the connected silhouette without a gradient", () => {
    const { context, fills } = preview("#123456");
    expect(fills).toHaveLength(3);
    expect(fills[1].triangles).toBe(2);
    expect(fills[2]).toEqual({ color: "rgb(18,52,86)", triangles: 1 });
    expect(fills[1].color).not.toBe(fills[2].color);
    expect(context.stroke).not.toHaveBeenCalled();
    expect(context.createLinearGradient).not.toHaveBeenCalled();
  });
});
