"use client";

import type * as KLine from "klinecharts";

// Custom shape overlays.
//
// WHY THIS FILE EXISTS: klinecharts v10 ships sixteen drawable overlays and not
// one of them is a box, circle or polygon — they are all lines, plus freehand
// brush and two annotation types. `rect`, `circle` and `polygon` DO exist in
// the library, but as internal drawing PRIMITIVES used to render other
// overlays, not as tools you can create. Calling
// createOverlay({ name: "rect" }) matches no template and silently does
// nothing, which is exactly what "the shapes tool isn't working" was.
//
// So the shapes are registered here, built from those same primitives.
// Two-point shapes are defined by opposite corners, so you can draw them
// anywhere on the chart at any size.

let registered = false;

export function registerShapes(kline: typeof KLine): void {
  // registerOverlay is global to the library, not per-chart. Registering twice
  // is harmless but pointless, and this component remounts often.
  if (registered) return;
  registered = true;

  const { registerOverlay } = kline;

  /** Rectangle from two opposite corners — drag from any point to any point. */
  registerOverlay({
    name: "rectangle",
    totalStep: 3, // step 1 is arming; two clicks place the corners
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const width = Math.abs(b.x - a.x);
      const height = Math.abs(b.y - a.y);
      return [{ type: "rect", attrs: { x, y, width, height } }];
    },
  });

  /** Circle from centre to edge. */
  registerOverlay({
    name: "circleShape",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [c, edge] = coordinates;
      const r = Math.hypot(edge.x - c.x, edge.y - c.y);
      return [{ type: "circle", attrs: { x: c.x, y: c.y, r } }];
    },
  });

  /** Triangle from three free points. */
  registerOverlay({
    name: "triangle",
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 3) return [];
      return [{ type: "polygon", attrs: { coordinates: coordinates.slice(0, 3) } }];
    },
  });

  /**
   * Parallelogram: three points define it, the fourth is derived.
   * Useful for marking a channel or a measured move.
   */
  registerOverlay({
    name: "parallelogram",
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 3) return [];
      const [a, b, c] = coordinates;
      const d = { x: a.x + c.x - b.x, y: a.y + c.y - b.y };
      return [{ type: "polygon", attrs: { coordinates: [a, b, c, d] } }];
    },
  });
}
