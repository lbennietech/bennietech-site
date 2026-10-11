/**
 * palettes.js — colour sets for the generative artwork.
 * Each palette: bg (background), a (hero colour), b (contrast), c (accent).
 * Use on a canvas with data-palette="volt|blue|pink|ice|mono|sun".
 * Add a new one here and it is immediately available everywhere.
 */
export const PALETTES = {
  volt: { bg: '#101010', a: '#d4ff3a', b: '#ffffff', c: '#3a3cff' },
  blue: { bg: '#e9ecff', a: '#3a3cff', b: '#0f0f0f', c: '#ff3ea5' },
  pink: { bg: '#ff3ea5', a: '#ffffff', b: '#0f0f0f', c: '#ffd23a' },
  ice:  { bg: '#dfe9ff', a: '#1b2cff', b: '#ffffff', c: '#7be0ff' },
  mono: { bg: '#ededed', a: '#0f0f0f', b: '#8a8a8a', c: '#ffffff' },
  sun:  { bg: '#ff6a2b', a: '#fff3c4', b: '#0f0f0f', c: '#ff3ea5' },
  lime: { bg: '#d4ff3a', a: '#f1ffb0', b: '#ffffff', c: '#7be0ff' },   // bright, for the CTA panel
};
