/**
 * network.js — a living constellation of nodes and links (the "forward-thinking tech" backdrop).
 * <canvas data-module="network">. Nodes drift, link when close, and gently flee the pointer.
 * Draws volt-green lines on transparent so it works on any dark panel.
 */
import { addTask } from '../core/ticker.js';
import { whenVisible, onResize, reducedMotion, rng, TAU } from '../core/utils.js';

export default {
  name: 'network',
  init(canvas) {
    const ctx = canvas.getContext('2d');
    const rand = rng(77);
    let w = 0, h = 0, nodes = [], stop = null;
    const pointer = { x: -999, y: -999 };

    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, Math.max(28, (w * h) / 14000)));
      nodes = Array.from({ length: count }, () => ({
        x: rand() * w, y: rand() * h, vx: (rand() - .5) * .25, vy: (rand() - .5) * .25, r: 1 + rand() * 1.8,
      }));
      frame(0);
    }

    function frame(dt) {
      ctx.clearRect(0, 0, w, h);
      const link = Math.min(150, w / 6);
      for (const n of nodes) {
        n.x += n.vx * dt * 60; n.y += n.vy * dt * 60;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        const dx = n.x - pointer.x, dy = n.y - pointer.y, d = Math.hypot(dx, dy);
        if (d < 120 && d > 0) { n.x += (dx / d) * (120 - d) * .02; n.y += (dy / d) * (120 - d) * .02; }
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            ctx.strokeStyle = `rgba(212,255,58,${(1 - d / link) * .35})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(212,255,58,.9)';
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, TAU); ctx.fill();
      }
    }

    canvas.parentElement.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    }, { passive: true });
    canvas.parentElement.addEventListener('pointerleave', () => { pointer.x = pointer.y = -999; });

    size(); onResize(canvas, size);
    if (reducedMotion()) return;
    whenVisible(canvas, v => {
      if (v && !stop) stop = addTask((_t, dt) => frame(dt));
      else if (!v && stop) { stop(); stop = null; }
    });
  },
};
