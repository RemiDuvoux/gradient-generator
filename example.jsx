import React, { useState, useRef, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ *
 *  Blob Gradient Generator
 *  Fonds en gradient organique + texture dithering / halftone / ascii
 *  Rendu Canvas 2D, 100% local, export PNG haute résolution.
 * ------------------------------------------------------------------ */

/* ---------- maths : bruit + champ ---------- */

function hash2(x, y, seed) {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

function vnoise(x, y, seed) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = smooth(xf),
    v = smooth(yf);
  const a = hash2(xi, yi, seed),
    b = hash2(xi + 1, yi, seed),
    c = hash2(xi, yi + 1, seed),
    d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, seed, oct) {
  let amp = 0.5,
    freq = 1,
    sum = 0,
    norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// champ scalaire t ∈ [0,1] : sweep directionnel déformé par domain warp
function sampleField(u, v, p) {
  const fx = u * p.freq;
  const fy = v * p.freq * p.aspect;
  const qx = fbm(fx + 5.2, fy + 1.3, p.seed + 101, p.oct);
  const qy = fbm(fx - 1.7, fy + 9.2, p.seed + 131, p.oct);
  const n = fbm(fx + p.warp * qx, fy + p.warp * qy, p.seed, p.oct);
  const proj = Math.cos(p.ang) * (u - 0.5) + Math.sin(p.ang) * (v - 0.5);
  const base = 0.5 + proj * 1.25;
  const disp = (n - 0.5) * p.amp;
  return clamp01(base + disp);
}

/* ---------- couleurs ---------- */

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(f.slice(0, 2), 16),
    g: parseInt(f.slice(2, 4), 16),
    b: parseInt(f.slice(4, 6), 16),
  };
}
const rgbStr = (c) => `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
const mixRgb = (a, b, t) => ({
  r: lerp(a.r, b.r, t),
  g: lerp(a.g, b.g, t),
  b: lerp(a.b, b.b, t),
});

// renvoie {lo, hi, f} : les deux couleurs adjacentes du ramp + position locale
function rampLookup(t, rgb, stops) {
  if (t <= stops[0]) return { lo: rgb[0], hi: rgb[0], f: 0 };
  const last = stops.length - 1;
  if (t >= stops[last]) return { lo: rgb[last], hi: rgb[last], f: 0 };
  for (let k = 0; k < last; k++) {
    if (t >= stops[k] && t < stops[k + 1]) {
      const f = (t - stops[k]) / (stops[k + 1] - stops[k] || 1);
      return { lo: rgb[k], hi: rgb[k + 1], f };
    }
  }
  return { lo: rgb[last], hi: rgb[last], f: 0 };
}

// contraste : resserre la zone de transition (dither) autour des bandes
function contrastF(f, contrast) {
  const steep = lerp(1, 16, contrast);
  return 1 / (1 + Math.exp(-steep * (f - 0.5)));
}

/* ---------- matrice de Bayer 8×8 (dithering ordonné) ---------- */

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];
const bayer = (cx, cy) => (BAYER[cy & 7][cx & 7] + 0.5) / 64;

const ASCII_CHARS = ["=", "+", "x", "X", "S", "#", "@"]; // clair -> dense

/* ---------- rendu ---------- *
 * On dessine sur un canvas à la résolution (Wdev,Hdev). scale permet
 * de re-rendre exactement la même image en plus grand pour l'export.   */

function render(ctx, Wdev, Hdev, scale, P) {
  const rgb = P.colors.map(hexToRgb);
  const stops = P.stops;
  const mode = P.texture;

  // mode "Aucun" : gradient lisse, échantillonnage fin indépendant du grain
  const cell =
    mode === "none"
      ? Math.max(2, Math.round(2 * scale))
      : Math.max(1, Math.round(P.grain * scale));

  const cols = Math.ceil(Wdev / cell);
  const rows = Math.ceil(Hdev / cell);

  // fond
  if (mode === "ascii") {
    ctx.fillStyle = P.asciiBg;
    ctx.fillRect(0, 0, Wdev, Hdev);
    const fs = cell * 1.12;
    ctx.font = `${fs}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  } else {
    ctx.fillStyle = rgbStr(rgb[0]);
    ctx.fillRect(0, 0, Wdev, Hdev);
  }

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const px = cx * cell + cell / 2;
      const py = cy * cell + cell / 2;
      const u = px / Wdev;
      const v = py / Hdev;
      const t = sampleField(u, v, P);
      const { lo, hi, f } = rampLookup(t, rgb, stops);
      const fc = contrastF(f, P.contrast);

      if (mode === "pixels") {
        const col = bayer(cx, cy) < fc ? hi : lo;
        ctx.fillStyle = rgbStr(col);
        ctx.fillRect(cx * cell, cy * cell, cell + 1, cell + 1);
      } else if (mode === "dots") {
        ctx.fillStyle = rgbStr(lo);
        ctx.fillRect(cx * cell, cy * cell, cell + 1, cell + 1);
        const r = Math.sqrt(fc) * cell * 0.66;
        if (r > 0.35) {
          ctx.fillStyle = rgbStr(hi);
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (mode === "ascii") {
        const idx = Math.min(
          ASCII_CHARS.length - 1,
          Math.floor(fc * ASCII_CHARS.length)
        );
        const ch = ASCII_CHARS[idx];
        ctx.fillStyle = rgbStr(mixRgb(lo, hi, fc));
        ctx.fillText(ch, px, py + cell * 0.04);
      } else {
        // none : gradient lisse
        ctx.fillStyle = rgbStr(mixRgb(lo, hi, f));
        ctx.fillRect(cx * cell, cy * cell, cell + 1, cell + 1);
      }
    }
  }
}

/* ---------- positions des stops du ramp (variées par seed) ---------- */

function buildStops(n, seed) {
  if (n <= 1) return [0, 1];
  const stops = [0];
  // rng déterministe depuis le seed
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0;
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 1; i < n - 1; i++) {
    const center = i / (n - 1);
    stops.push(clamp01(center + (rnd() - 0.5) * 0.22));
  }
  stops.push(1);
  stops.sort((a, b) => a - b);
  return stops;
}

/* ---------- presets de ratio ---------- */
const RATIOS = [
  { label: "16:9", w: 1280, h: 720 },
  { label: "3:2", w: 1200, h: 800 },
  { label: "4:3", w: 1200, h: 900 },
  { label: "1:1", w: 1000, h: 1000 },
  { label: "9:16", w: 720, h: 1280 },
];

const TEXTURES = [
  { id: "pixels", label: "Pixels" },
  { id: "dots", label: "Points" },
  { id: "ascii", label: "ASCII" },
  { id: "none", label: "Aucun" },
];

const DEFAULT_COLORS = ["#3B6FE0", "#3FD98A", "#F4B6E6", "#FFFFFF"];

function Field({ label, value, children }) {
  return (
    <div className="bgg-field">
      <div className="bgg-field-head">
        <span>{label}</span>
        {value != null && <span className="bgg-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/* ================================================================== */

export default function App() {
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [texture, setTexture] = useState("pixels");
  const [grain, setGrain] = useState(7);
  const [contrast, setContrast] = useState(0.5);
  const [features, setFeatures] = useState(3.4); // échelle des formes
  const [warp, setWarp] = useState(1.1); // fluidité / distorsion
  const [dims, setDims] = useState({ w: 1200, h: 800 });
  const [asciiBg, setAsciiBg] = useState("#0c0d12");
  const [exportScale, setExportScale] = useState(3);
  const [seed, setSeed] = useState(() => (Math.random() * 1e9) | 0);
  const [ang, setAng] = useState(() => Math.random() * Math.PI * 2);
  const [amp, setAmp] = useState(0.95);

  const canvasRef = useRef(null);

  const buildParams = useCallback(
    (overrideDims) => {
      const d = overrideDims || dims;
      return {
        colors,
        stops: buildStops(colors.length, seed),
        texture,
        grain,
        contrast,
        freq: features,
        warp,
        amp,
        ang,
        seed,
        oct: 4,
        aspect: d.h / d.w,
        asciiBg,
      };
    },
    [colors, seed, texture, grain, contrast, features, warp, amp, ang, asciiBg, dims]
  );

  // rendu écran
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.width = dims.w;
    cv.height = dims.h;
    const ctx = cv.getContext("2d");
    render(ctx, dims.w, dims.h, 1, buildParams());
  }, [dims, buildParams]);

  const regenerate = () => {
    setSeed((Math.random() * 1e9) | 0);
    setAng(Math.random() * Math.PI * 2);
    setAmp(0.8 + Math.random() * 0.4);
  };

  const exportPng = () => {
    const off = document.createElement("canvas");
    const W = dims.w * exportScale;
    const H = dims.h * exportScale;
    off.width = W;
    off.height = H;
    const ctx = off.getContext("2d");
    render(ctx, W, H, exportScale, buildParams());
    off.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blob-gradient-${seed}-${W}x${H}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  /* ---- couleurs ---- */
  const setColor = (i, val) =>
    setColors((cs) => cs.map((c, k) => (k === i ? val : c)));
  const addColor = () =>
    setColors((cs) => (cs.length >= 5 ? cs : [...cs, "#FFC857"]));
  const removeColor = (i) =>
    setColors((cs) => (cs.length <= 2 ? cs : cs.filter((_, k) => k !== i)));

  /* ---- ui helpers ---- */

  return (
    <div className="bgg-root">
      <style>{CSS}</style>

      {/* ---------------- panneau ---------------- */}
      <aside className="bgg-panel">
        <header className="bgg-brand">
          <div className="bgg-mark" aria-hidden />
          <div>
            <h1>Blob Gradient</h1>
            <p>générateur de fonds texturés</p>
          </div>
        </header>

        <section className="bgg-sec">
          <div className="bgg-sec-title">Couleurs</div>
          <div className="bgg-colors">
            {colors.map((c, i) => (
              <div className="bgg-chip" key={i}>
                <label className="bgg-swatch" style={{ background: c }}>
                  <input
                    type="color"
                    value={c.length === 4 ? "#000000" : c}
                    onChange={(e) => setColor(i, e.target.value)}
                  />
                </label>
                <input
                  className="bgg-hex"
                  value={c}
                  onChange={(e) => setColor(i, e.target.value)}
                  spellCheck={false}
                />
                {colors.length > 2 && (
                  <button
                    className="bgg-x"
                    onClick={() => removeColor(i)}
                    title="Retirer"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {colors.length < 5 && (
              <button className="bgg-add" onClick={addColor}>
                + ajouter une couleur
              </button>
            )}
          </div>
        </section>

        <section className="bgg-sec">
          <div className="bgg-sec-title">Texture</div>
          <div className="bgg-segs">
            {TEXTURES.map((tx) => (
              <button
                key={tx.id}
                className={`bgg-seg ${texture === tx.id ? "on" : ""}`}
                onClick={() => setTexture(tx.id)}
              >
                {tx.label}
              </button>
            ))}
          </div>
          {texture === "ascii" && (
            <div className="bgg-asciibg">
              <span>Fond</span>
              <label className="bgg-swatch sm" style={{ background: asciiBg }}>
                <input
                  type="color"
                  value={asciiBg}
                  onChange={(e) => setAsciiBg(e.target.value)}
                />
              </label>
            </div>
          )}
        </section>

        <section className="bgg-sec">
          <Field label="Échelle des formes" value={features.toFixed(1)}>
            <input
              type="range"
              min="1.5"
              max="7"
              step="0.1"
              value={features}
              onChange={(e) => setFeatures(+e.target.value)}
            />
          </Field>
          <Field label="Fluidité" value={warp.toFixed(2)}>
            <input
              type="range"
              min="0"
              max="2.2"
              step="0.02"
              value={warp}
              onChange={(e) => setWarp(+e.target.value)}
            />
          </Field>
          {texture !== "none" && (
            <Field label="Grain" value={`${grain}px`}>
              <input
                type="range"
                min="2"
                max="24"
                step="1"
                value={grain}
                onChange={(e) => setGrain(+e.target.value)}
              />
            </Field>
          )}
          <Field label="Contraste" value={contrast.toFixed(2)}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={contrast}
              onChange={(e) => setContrast(+e.target.value)}
            />
          </Field>
        </section>

        <section className="bgg-sec">
          <div className="bgg-sec-title">Format</div>
          <div className="bgg-ratios">
            {RATIOS.map((r) => (
              <button
                key={r.label}
                className={`bgg-ratio ${
                  dims.w === r.w && dims.h === r.h ? "on" : ""
                }`}
                onClick={() => setDims({ w: r.w, h: r.h })}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="bgg-dims">
            <input
              type="number"
              value={dims.w}
              min="200"
              max="4000"
              onChange={(e) =>
                setDims((d) => ({ ...d, w: +e.target.value || d.w }))
              }
            />
            <span>×</span>
            <input
              type="number"
              value={dims.h}
              min="200"
              max="4000"
              onChange={(e) =>
                setDims((d) => ({ ...d, h: +e.target.value || d.h }))
              }
            />
            <span className="bgg-unit">px</span>
          </div>
        </section>

        <section className="bgg-sec bgg-actions">
          <button className="bgg-primary" onClick={regenerate}>
            ↻ Regenerate
          </button>
          <div className="bgg-export">
            <div className="bgg-scale">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  className={`bgg-seg ${exportScale === s ? "on" : ""}`}
                  onClick={() => setExportScale(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
            <button className="bgg-ghost" onClick={exportPng}>
              ↓ Export PNG{" "}
              <span className="bgg-dim">
                {dims.w * exportScale}×{dims.h * exportScale}
              </span>
            </button>
          </div>
        </section>
      </aside>

      {/* ---------------- scène ---------------- */}
      <main className="bgg-stage">
        <div className="bgg-canvas-wrap">
          <canvas ref={canvasRef} className="bgg-canvas" />
        </div>
        <div className="bgg-meta">
          seed {seed} · {dims.w}×{dims.h} · {texture}
        </div>
      </main>
    </div>
  );
}

/* ================================================================== */

const CSS = `
.bgg-root{
  --bg:#0a0b0f; --panel:#101218; --panel2:#161922; --line:#23262f;
  --ink:#e8eaf0; --mut:#7d8597; --accent:#c8ff4d;
  position:fixed; inset:0; display:flex; background:var(--bg);
  color:var(--ink); font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.bgg-root *{box-sizing:border-box;}

.bgg-panel{
  width:312px; flex:none; height:100%; overflow-y:auto;
  background:var(--panel); border-right:1px solid var(--line);
  padding:18px 16px 28px; display:flex; flex-direction:column; gap:18px;
}
.bgg-panel::-webkit-scrollbar{width:8px;}
.bgg-panel::-webkit-scrollbar-thumb{background:#262a35;border-radius:8px;}

.bgg-brand{display:flex; align-items:center; gap:11px;}
.bgg-mark{
  width:34px;height:34px;border-radius:8px;flex:none;
  background:
    repeating-conic-gradient(#c8ff4d 0 25%, #0a0b0f 0 50%) 0 0/9px 9px,
    linear-gradient(135deg,#3B6FE0,#F4B6E6);
  background-blend-mode:multiply;
}
.bgg-brand h1{font-size:15px;font-weight:650;letter-spacing:-.01em;margin:0;}
.bgg-brand p{font-size:11px;color:var(--mut);margin:2px 0 0;letter-spacing:.02em;}

.bgg-sec{display:flex;flex-direction:column;gap:11px;
  padding-bottom:18px;border-bottom:1px solid var(--line);}
.bgg-sec:last-child{border-bottom:none;padding-bottom:0;}
.bgg-sec-title{
  font-size:10.5px;text-transform:uppercase;letter-spacing:.13em;
  color:var(--mut);font-weight:600;
}

/* couleurs */
.bgg-colors{display:flex;flex-direction:column;gap:7px;}
.bgg-chip{display:flex;align-items:center;gap:8px;}
.bgg-swatch{
  width:30px;height:30px;border-radius:7px;flex:none;cursor:pointer;
  border:1px solid rgba(255,255,255,.14); position:relative; overflow:hidden;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);
}
.bgg-swatch.sm{width:24px;height:24px;}
.bgg-swatch input{position:absolute;inset:-6px;opacity:0;cursor:pointer;width:160%;height:160%;}
.bgg-hex{
  flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line);
  color:var(--ink);font-family:ui-monospace,Menlo,monospace;font-size:12px;
  padding:7px 9px;border-radius:7px;letter-spacing:.02em;
}
.bgg-hex:focus{outline:none;border-color:#3a4150;}
.bgg-x{
  width:26px;height:26px;flex:none;border:none;border-radius:6px;cursor:pointer;
  background:transparent;color:var(--mut);font-size:18px;line-height:1;
}
.bgg-x:hover{background:var(--panel2);color:#ff7b7b;}
.bgg-add{
  margin-top:2px;background:transparent;border:1px dashed var(--line);
  color:var(--mut);font-size:12px;padding:8px;border-radius:7px;cursor:pointer;
}
.bgg-add:hover{border-color:#39414f;color:var(--ink);}

/* segments */
.bgg-segs{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px;}
.bgg-seg{
  background:var(--panel2);border:1px solid var(--line);color:var(--mut);
  font-size:12px;padding:8px 4px;border-radius:7px;cursor:pointer;
  transition:.12s; font-weight:550;
}
.bgg-seg:hover{color:var(--ink);}
.bgg-seg.on{background:var(--accent);color:#0a0b0f;border-color:var(--accent);}

.bgg-asciibg{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--mut);}

/* sliders */
.bgg-field{display:flex;flex-direction:column;gap:7px;}
.bgg-field-head{display:flex;justify-content:space-between;font-size:12px;color:var(--ink);}
.bgg-val{color:var(--mut);font-family:ui-monospace,Menlo,monospace;font-size:11px;}
input[type=range]{
  -webkit-appearance:none;appearance:none;width:100%;height:3px;border-radius:3px;
  background:#2a2e3a;cursor:pointer;
}
input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none;width:15px;height:15px;border-radius:50%;
  background:var(--ink);border:3px solid var(--panel);box-shadow:0 0 0 1px var(--line);
}
input[type=range]::-moz-range-thumb{
  width:13px;height:13px;border-radius:50%;background:var(--ink);border:3px solid var(--panel);
}

/* format */
.bgg-ratios{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;}
.bgg-ratio{
  background:var(--panel2);border:1px solid var(--line);color:var(--mut);
  font-size:11px;padding:7px 2px;border-radius:6px;cursor:pointer;font-weight:550;
}
.bgg-ratio:hover{color:var(--ink);}
.bgg-ratio.on{background:#fff;color:#0a0b0f;border-color:#fff;}
.bgg-dims{display:flex;align-items:center;gap:8px;}
.bgg-dims input{
  width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);
  font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:7px 9px;border-radius:7px;
}
.bgg-dims input:focus{outline:none;border-color:#3a4150;}
.bgg-dims span{color:var(--mut);font-size:12px;}
.bgg-unit{flex:none;}

/* actions */
.bgg-actions{gap:12px;}
.bgg-primary{
  width:100%;background:var(--accent);color:#0a0b0f;border:none;border-radius:9px;
  padding:13px;font-size:13.5px;font-weight:650;cursor:pointer;letter-spacing:.01em;
}
.bgg-primary:hover{filter:brightness(1.06);}
.bgg-primary:active{transform:translateY(1px);}
.bgg-export{display:flex;flex-direction:column;gap:8px;}
.bgg-scale{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;}
.bgg-ghost{
  width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);
  border-radius:9px;padding:11px;font-size:12.5px;cursor:pointer;font-weight:550;
}
.bgg-ghost:hover{border-color:#39414f;}
.bgg-dim{color:var(--mut);font-family:ui-monospace,Menlo,monospace;font-size:11px;margin-left:4px;}

/* scène */
.bgg-stage{
  flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:28px;gap:14px;
  background:
    radial-gradient(120% 120% at 50% 0%, #14161d 0%, #0a0b0f 70%);
}
.bgg-canvas-wrap{
  max-width:100%;max-height:calc(100% - 36px);
  border-radius:10px;overflow:hidden;
  box-shadow:0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.05);
}
.bgg-canvas{display:block;max-width:100%;max-height:78vh;width:auto;height:auto;}
.bgg-meta{
  font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--mut);
  letter-spacing:.03em;
}

@media (max-width:820px){
  .bgg-root{flex-direction:column;position:static;min-height:100vh;}
  .bgg-panel{width:100%;height:auto;border-right:none;border-bottom:1px solid var(--line);}
  .bgg-canvas{max-height:60vh;}
}
`;