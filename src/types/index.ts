import type { Color } from "three";

export interface FihTemplate {
  bodyShape?: FihShape;
  finShape?: FihFinShape;
  headShape?: FihHeadShape;
  bodyColor: Color;
  headColor?: Color;
  bodySize: number;
  finColor: Color;
  finSize: number;
  headSize?: number;
  headRatio: number;
  scale: number;
}

export type FihShape = "classic" | "round" | "diamond" | "sail";
export type FihFinShape = "triangle" | "fork" | "fan" | "ribbon";
export type FihHeadShape = "pointed" | "round" | "blunt";
export type FihPart = "fin" | "body" | "head";
export type FihPattern = "plain" | "stripes" | "spots" | "dip";

export interface FihAppearance {
  shape: FihShape;
  finShape: FihFinShape;
  headShape: FihHeadShape;
  color: string;
  finColor: string | null;
  headColor: string | null;
  finSize: number;
  bodySize: number;
  headSize: number;
  pattern: FihPattern;
}
export interface FihDesign extends FihAppearance { count: number }
