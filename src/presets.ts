// Drawings: points on a 640 × 440 canvas and coloured edges between them.
// Any point on the ground line (y = GROUND) is the ground.

import type { Color } from './hackenbush.ts';

export const W = 640;
export const H = 440;
export const GROUND = 400;

export interface Point { x: number; y: number }
export interface DEdge { a: number; b: number; c: Color }
export interface Drawing { points: Point[]; edges: DEdge[] }

class Builder {
  points: Point[] = [];
  edges: DEdge[] = [];
  pt(x: number, y: number): number {
    const i = this.points.findIndex((p) => p.x === x && p.y === y);
    if (i >= 0) return i;
    this.points.push({ x, y });
    return this.points.length - 1;
  }
  edge(a: [number, number], b: [number, number], c: Color): this {
    this.edges.push({ a: this.pt(...a), b: this.pt(...b), c });
    return this;
  }
  loop(p: [number, number], c: Color): this {
    const i = this.pt(...p);
    this.edges.push({ a: i, b: i, c });
    return this;
  }
  /** colours bottom first, `step` pixels per edge */
  stalk(x: number, colors: string, step = 52): this {
    for (let i = 0; i < colors.length; i++) {
      this.edge([x, GROUND - i * step], [x, GROUND - (i + 1) * step], colors[i] as Color);
    }
    return this;
  }
  done(): Drawing {
    return { points: this.points, edges: this.edges };
  }
}

const G = GROUND;

function garden(): Drawing {
  const b = new Builder();
  // a house of blue walls and a red roof
  b.edge([70, G], [70, G - 90], 'B').edge([190, G], [190, G - 90], 'B')
    .edge([70, G - 90], [190, G - 90], 'R')
    .edge([70, G - 90], [100, G - 120], 'R').edge([100, G - 120], [130, G - 150], 'R')
    .edge([190, G - 90], [130, G - 150], 'B')
    .edge([100, G - 120], [100, G - 160], 'B');
  // a green tree
  b.edge([300, G], [300, G - 80], 'G')
    .edge([300, G - 80], [262, G - 140], 'G').edge([300, G - 80], [338, G - 140], 'G')
    .edge([262, G - 140], [240, G - 195], 'G').edge([262, G - 140], [282, G - 200], 'G')
    .edge([338, G - 140], [350, G - 200], 'G');
  // a flower: green stem, blue and red petals
  b.edge([440, G], [440, G - 70], 'G').edge([440, G - 70], [440, G - 140], 'G')
    .loop([440, G - 140], 'B').loop([440, G - 140], 'B').loop([440, G - 140], 'R');
  // a red edge and a green stalk
  b.stalk(540, 'R').stalk(600, 'GG');
  return b.done();
}

function stalks(): Drawing {
  return new Builder().stalk(80, 'BRR').stalk(180, 'BBRB').stalk(280, 'RRBR').stalk(380, 'BRBRB', 48)
    .stalk(480, 'RBBB').stalk(580, 'BRRRR', 48).done();
}

function greenTree(): Drawing {
  const b = new Builder();
  b.edge([200, G], [200, G - 90], 'G')
    .edge([200, G - 90], [140, G - 170], 'G').edge([200, G - 90], [200, G - 180], 'G').edge([200, G - 90], [262, G - 160], 'G')
    .edge([140, G - 170], [110, G - 240], 'G').edge([140, G - 170], [160, G - 250], 'G')
    .edge([262, G - 160], [262, G - 240], 'G').edge([262, G - 240], [262, G - 310], 'G');
  b.edge([440, G], [440, G - 100], 'G').edge([440, G - 100], [390, G - 180], 'G').edge([440, G - 100], [490, G - 180], 'G')
    .edge([520, G], [560, G - 90], 'G');
  return b.done();
}

function greenCycles(): Drawing {
  const b = new Builder();
  // a triangle on the ground with a tail and a loop
  b.edge([90, G], [190, G], 'G').edge([90, G], [140, G - 90], 'G').edge([190, G], [140, G - 90], 'G')
    .edge([140, G - 90], [140, G - 170], 'G').loop([140, G - 170], 'G');
  // a square standing on one corner
  b.edge([330, G], [280, G - 70], 'G').edge([330, G], [380, G - 70], 'G')
    .edge([280, G - 70], [330, G - 140], 'G').edge([380, G - 70], [330, G - 140], 'G')
    .edge([330, G - 140], [300, G - 210], 'G').edge([330, G - 140], [360, G - 210], 'G');
  // a two-edge cycle (parallel edges) on a stalk
  b.edge([520, G], [520, G - 80], 'G');
  b.edge([520, G - 80], [520, G - 170], 'G').edge([520, G - 80], [520, G - 170], 'G');
  return b.done();
}

function infinitesimals(): Drawing {
  // the smallest stalks that are not numbers: ↑*, ↓*, 1*, and their friends
  return new Builder().stalk(80, 'GB').stalk(170, 'GR').stalk(260, 'BG').stalk(350, 'GBB').stalk(440, 'GGB')
    .stalk(530, 'BRG').stalk(610, 'G').done();
}

function rbHouse(): Drawing {
  const b = new Builder();
  // a blue-red only figure: always a number
  b.edge([160, G], [160, G - 110], 'B').edge([320, G], [320, G - 110], 'R')
    .edge([160, G - 110], [320, G - 110], 'B')
    .edge([160, G - 110], [240, G - 200], 'R').edge([320, G - 110], [240, G - 200], 'B')
    .edge([160, G], [320, G - 110], 'R').edge([240, G - 200], [240, G - 270], 'B');
  b.edge([450, G], [450, G - 90], 'R').edge([450, G - 90], [410, G - 170], 'B').edge([450, G - 90], [490, G - 170], 'B')
    .edge([410, G - 170], [490, G - 170], 'R').edge([560, G], [560, G - 90], 'B').loop([560, G - 90], 'R');
  return b.done();
}

/** A random drawing of `n` edges, every edge joined to the ground. */
export function randomDrawing(n: number, seed: number): Drawing {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  const b = new Builder();
  const colors: Color[] = ['B', 'R', 'G'];
  const tops: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const c = colors[Math.floor(rnd() * 3)];
    const r = rnd();
    if (tops.length === 0 || r < 0.22) {
      const x = 50 + Math.round(rnd() * 11) * 50;
      const p: [number, number] = [x, G - 60 - Math.round(rnd() * 3) * 20];
      b.edge([x, G], p, c);
      tops.push(p);
    } else {
      const from = tops[Math.floor(rnd() * tops.length)];
      if (r < 0.32) {
        b.loop(from, c);
      } else if (r < 0.45 && tops.length > 1) {
        const to = tops[Math.floor(rnd() * tops.length)];
        if (to !== from) b.edge(from, to, c);
        else b.loop(from, c);
      } else {
        const x = Math.max(30, Math.min(W - 30, from[0] + Math.round((rnd() - 0.5) * 4) * 25));
        const y = Math.max(40, from[1] - 50 - Math.round(rnd() * 3) * 10);
        const p: [number, number] = [x, y];
        b.edge(from, p, c);
        tops.push(p);
      }
    }
  }
  return b.done();
}

export const PRESETS: { id: string; label: string; make: () => Drawing }[] = [
  { id: 'garden', label: 'garden (mixed)', make: garden },
  { id: 'stalks', label: 'blue-red stalks', make: stalks },
  { id: 'infinitesimals', label: 'small infinitesimals', make: infinitesimals },
  { id: 'redblue', label: 'blue-red figures', make: rbHouse },
  { id: 'tree', label: 'green trees (colon principle)', make: greenTree },
  { id: 'cycles', label: 'green cycles (fusion principle)', make: greenCycles },
  { id: 'random', label: 'random', make: () => randomDrawing(16, Date.now()) },
];
