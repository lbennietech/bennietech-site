/**
 * palettes.js — colour sets for the shader artwork (js/gl/tile-shaders.js).
 * Each palette: bg (ground), a (main colour), b (secondary / highlight), c (accent).
 * Use on a canvas with data-palette="name". Add a new one here and it is available everywhere.
 */
export const PALETTES = {
  chrome: { bg: '#0c0c0e', a: '#d9dce2', b: '#ffffff', c: '#c6f432' },   // neutral metal, lime accent
  volt:   { bg: '#0d0d0d', a: '#c6f432', b: '#f4f4f2', c: '#2e3cff' },
  blue:   { bg: '#0b0f45', a: '#3a44ff', b: '#e8ebff', c: '#c6f432' },
  ice:    { bg: '#e8edf7', a: '#2a3cff', b: '#ffffff', c: '#9fd8ff' },
  mono:   { bg: '#ececea', a: '#111111', b: '#8a8a8a', c: '#ffffff' },
  ink:    { bg: '#09090a', a: '#f4f4f2', b: '#7a7d85', c: '#c6f432' },
  flare:  { bg: '#14060d', a: '#ff3e8a', b: '#ffc2db', c: '#fff1f6' },
  ember:  { bg: '#140803', a: '#ff6a2b', b: '#ffd2a8', c: '#fff4e6' },
  paper:  { bg: '#e7e7e3', a: '#141415', b: '#a3a39e', c: '#2e3cff' },   // light specimens: ink on paper, ultramarine accent
  lime:   { bg: '#c6f432', a: '#e9ffad', b: '#a8de00', c: '#ffffff' },   // bright, for the CTA panel
};

/** '#rrggbb' -> [r, g, b] in 0..1 */
export const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
