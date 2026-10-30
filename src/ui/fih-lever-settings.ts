import {
  FIH_LEVER_GEOMETRY, FIH_LEVER_METALLIC_SHADING, FIH_LEVER_MOTION,
  FIH_LEVER_PLACEMENT, FIH_LEVER_REFLECTION, FIH_LEVER_SHADING,
} from "../constants";

type Editable<T> = {
  -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends boolean ? boolean : string;
};
export type FihLeverSettings = {
  geometry: Editable<typeof FIH_LEVER_GEOMETRY>;
  placement: Editable<typeof FIH_LEVER_PLACEMENT>;
  shading: Editable<typeof FIH_LEVER_SHADING> & { metallicShading: number; reflection: number };
  motion: Editable<typeof FIH_LEVER_MOTION>;
};

export function createFihLeverSettings(): FihLeverSettings {
  return {
    geometry: { ...FIH_LEVER_GEOMETRY },
    placement: { ...FIH_LEVER_PLACEMENT },
    shading: { ...FIH_LEVER_SHADING, metallicShading: FIH_LEVER_METALLIC_SHADING, reflection: FIH_LEVER_REFLECTION },
    motion: { ...FIH_LEVER_MOTION },
  };
}

export function exportFihLeverSettings(settings: FihLeverSettings) {
  const { metallicShading, reflection, ...shading } = settings.shading;
  return Object.entries({
    FIH_LEVER_METALLIC_SHADING: metallicShading,
    FIH_LEVER_REFLECTION: reflection,
    FIH_LEVER_GEOMETRY: settings.geometry,
    FIH_LEVER_PLACEMENT: settings.placement,
    FIH_LEVER_SHADING: shading,
    FIH_LEVER_MOTION: settings.motion,
  }).map(([name, value]) => `export const ${name} = ${JSON.stringify(value, null, 2)}${typeof value === "object" ? " as const" : ""};`).join("\n\n");
}
