import type { Color } from "three";

export interface FihTemplate {
  bodyShape?: FihShape;
  bodyColor: Color;
  bodySize: number;
  finColor: Color;
  finSize: number;
  headRatio: number;
  scale: number;
}

export type FihShape = "classic" | "round" | "long";

export interface FihDesign {
  shape: FihShape;
  color: string;
  count: number;
}
