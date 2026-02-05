import { Color, Texture } from "three";

export interface FihTemplate {
  id: string;
  bodyColor: Color;
  bodySize: number;
  finColor: Color;
  finSize: number;
  finShape?: FinShape;
  headRatio: number;
  texture?: Texture;
  scale: number;
}

export type FinShape = "standard" | "pointed" | "rounded";

export interface FihInstance {
  templateId: string;
  instanceIndex: number; // Position in instance buffer
}
