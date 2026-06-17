import type { Dims, TextureId } from "./types";

export interface AppUrlState {
  colors: string[];
  texture: TextureId;
  grain: number;
  contrast: number;
  features: number;
  warp: number;
  dims: Dims;
  asciiBg: string;
  exportScale: number;
  seed: number;
  ang: number;
  amp: number;
}

export const DEFAULT_COLORS = ["#3B6FE0", "#3FD98A", "#F4B6E6", "#FFFFFF"];

export const DEFAULT_URL_STATE: AppUrlState = {
  colors: DEFAULT_COLORS,
  texture: "pixels",
  grain: 7,
  contrast: 0.5,
  features: 3.4,
  warp: 1.1,
  dims: { w: 1200, h: 800 },
  asciiBg: "#0c0d12",
  exportScale: 3,
  seed: 0,
  ang: 0,
  amp: 0.95,
};

const TEXTURES = new Set<TextureId>(["pixels", "dots", "ascii", "none"]);

const clamp = (n: number, min: number, max: number): number =>
  n < min ? min : n > max ? max : n;

const HEX_RE = /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/;

function normalizeHex(raw: string): string | null {
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (!HEX_RE.test(hex)) return null;
  return hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase()
    : hex.toUpperCase();
}

function parseColors(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const colors = raw
    .split(",")
    .map((part) => normalizeHex(part.trim()))
    .filter((c): c is string => c != null);
  if (colors.length < 2 || colors.length > 5) return undefined;
  return colors;
}

function parseNum(
  raw: string | null,
  min: number,
  max: number
): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return clamp(n, min, max);
}

function parseIntParam(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseHexColor(raw: string | null): string | undefined {
  if (!raw) return undefined;
  return normalizeHex(raw) ?? undefined;
}

function parseTexture(raw: string | null): TextureId | undefined {
  if (!raw || !TEXTURES.has(raw as TextureId)) return undefined;
  return raw as TextureId;
}

/** Read app state from URL search params. Omitted/invalid keys are left undefined. */
export function parseUrlParams(search: URLSearchParams): Partial<AppUrlState> {
  const partial: Partial<AppUrlState> = {};

  const colors = parseColors(search.get("colors"));
  if (colors) partial.colors = colors;

  const texture = parseTexture(search.get("texture"));
  if (texture) partial.texture = texture;

  const grain = parseNum(search.get("grain"), 2, 24);
  if (grain != null) partial.grain = Math.round(grain);

  const contrast = parseNum(search.get("contrast"), 0, 1);
  if (contrast != null) partial.contrast = contrast;

  const features = parseNum(search.get("features"), 1.5, 7);
  if (features != null) partial.features = features;

  const warp = parseNum(search.get("warp"), 0, 2.2);
  if (warp != null) partial.warp = warp;

  const w = parseNum(search.get("w"), 200, 4000);
  const h = parseNum(search.get("h"), 200, 4000);
  if (w != null || h != null) {
    partial.dims = {
      w: w != null ? Math.round(w) : DEFAULT_URL_STATE.dims.w,
      h: h != null ? Math.round(h) : DEFAULT_URL_STATE.dims.h,
    };
  }

  const asciiBg = parseHexColor(search.get("asciiBg"));
  if (asciiBg) partial.asciiBg = asciiBg;

  const exportScale = parseNum(search.get("exportScale"), 1, 3);
  if (exportScale != null) partial.exportScale = Math.round(exportScale);

  const seed = parseIntParam(search.get("seed"));
  if (seed != null) partial.seed = seed;

  const ang = parseNum(search.get("ang"), 0, Math.PI * 2);
  if (ang != null) partial.ang = ang;

  const amp = parseNum(search.get("amp"), 0, 2);
  if (amp != null) partial.amp = amp;

  return partial;
}

/** Serialize full app state into URL search params (stable, agent-readable keys). */
export function stateToSearchParams(state: AppUrlState): URLSearchParams {
  const params = new URLSearchParams();

  params.set(
    "colors",
    state.colors.map((c) => c.replace("#", "")).join(",")
  );
  params.set("texture", state.texture);
  params.set("grain", String(state.grain));
  params.set("contrast", String(state.contrast));
  params.set("features", String(state.features));
  params.set("warp", String(state.warp));
  params.set("w", String(state.dims.w));
  params.set("h", String(state.dims.h));
  params.set("asciiBg", state.asciiBg.replace("#", ""));
  params.set("exportScale", String(state.exportScale));
  params.set("seed", String(state.seed));
  params.set("ang", String(state.ang));
  params.set("amp", String(state.amp));

  return params;
}

export function mergeUrlState(
  partial: Partial<AppUrlState>,
  randomSeed: () => number,
  randomAng: () => number
): AppUrlState {
  return {
    colors: partial.colors ?? DEFAULT_COLORS,
    texture: partial.texture ?? "pixels",
    grain: partial.grain ?? 7,
    contrast: partial.contrast ?? 0.5,
    features: partial.features ?? 3.4,
    warp: partial.warp ?? 1.1,
    dims: partial.dims ?? { w: 1200, h: 800 },
    asciiBg: partial.asciiBg ?? "#0c0d12",
    exportScale: partial.exportScale ?? 3,
    seed: partial.seed ?? randomSeed(),
    ang: partial.ang ?? randomAng(),
    amp: partial.amp ?? 0.95,
  };
}
