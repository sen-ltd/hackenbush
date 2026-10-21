// Blue-Red-Green Hackenbush positions.
//
// A position is a multigraph whose vertex 0 is the ground. Left (Blue) cuts a
// blue or green edge, Right (Red) a red or green one; whatever is no longer
// joined to the ground falls away. The player who cannot cut loses.
//
// Positions are edge lists plus a bit mask of the edges still standing (up to
// 30 edges), so every position reachable in a game is just a smaller mask.

import { type GameId, ZERO, make, add, nimber } from './cgt.ts';

export type Color = 'B' | 'R' | 'G';
export interface Edge {
  u: number;
  v: number;
  c: Color;
}

export const MAX_EDGES = 30;
export const fullMask = (edges: readonly Edge[]) => (edges.length === 30 ? 0x3fffffff : (1 << edges.length) - 1);

const canLeft = (c: Color) => c !== 'R';
const canRight = (c: Color) => c !== 'B';

/** The edges of `mask` that are still joined to the ground. */
export function grounded(edges: readonly Edge[], mask: number): number {
  let seen = 1; // vertex bit set; vertex 0 is the ground (up to 31 vertices)
  let keep = 0;
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = 0; i < edges.length; i++) {
      const b = 1 << i;
      if (!(mask & b) || keep & b) continue;
      const { u, v } = edges[i];
      if (seen & (1 << u) || seen & (1 << v)) {
        keep |= b;
        seen |= (1 << u) | (1 << v);
        grew = true;
      }
    }
  }
  return keep;
}

/** Split a grounded mask into the pieces that meet only at the ground. */
export function components(edges: readonly Edge[], mask: number): number[] {
  const out: number[] = [];
  let rest = mask;
  while (rest) {
    const i = 31 - Math.clz32(rest & -rest);
    let comp = 1 << i;
    let verts = 0;
    const { u, v } = edges[i];
    if (u) verts |= 1 << u;
    if (v) verts |= 1 << v;
    for (let grew = true; grew; ) {
      grew = false;
      for (let j = 0; j < edges.length; j++) {
        const b = 1 << j;
        if (!(rest & b) || comp & b) continue;
        const e = edges[j];
        if ((e.u && verts & (1 << e.u)) || (e.v && verts & (1 << e.v))) {
          comp |= b;
          if (e.u) verts |= 1 << e.u;
          if (e.v) verts |= 1 << e.v;
          grew = true;
        }
      }
    }
    out.push(comp);
    rest &= ~comp;
  }
  return out;
}

export interface Move {
  edge: number;
  after: number; // the grounded mask after the cut
}

export function moves(edges: readonly Edge[], mask: number, left: boolean): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < edges.length; i++) {
    if (!(mask & (1 << i))) continue;
    if (left ? !canLeft(edges[i].c) : !canRight(edges[i].c)) continue;
    out.push({ edge: i, after: grounded(edges, mask & ~(1 << i)) });
  }
  return out;
}

/**
 * Game values of one edge list. A position that falls into several pieces is
 * the sum of the pieces, and each piece is valued by its own options; both are
 * memoised by mask.
 */
export class Valuer {
  private memo = new Map<number, GameId>();
  readonly edges: readonly Edge[];
  constructor(edges: readonly Edge[]) {
    this.edges = edges;
    if (edges.length > MAX_EDGES) throw new Error(`at most ${MAX_EDGES} edges`);
  }
  get size(): number {
    return this.memo.size;
  }
  /** The value of a grounded mask. */
  value(mask: number): GameId {
    if (mask === 0) return ZERO;
    const hit = this.memo.get(mask);
    if (hit !== undefined) return hit;
    const comps = components(this.edges, mask);
    let g: GameId;
    if (comps.length > 1) {
      g = ZERO;
      for (const c of comps) g = add(g, this.value(c));
    } else {
      const L = moves(this.edges, mask, true).map((m) => this.value(m.after));
      const R = moves(this.edges, mask, false).map((m) => this.value(m.after));
      g = make(L, R);
    }
    this.memo.set(mask, g);
    return g;
  }
}

/** Plain win/lose search with no game values at all: can `left` (or Right) win moving first? */
export class Minimax {
  private memo = new Map<number, boolean>();
  readonly edges: readonly Edge[];
  constructor(edges: readonly Edge[]) {
    this.edges = edges;
  }
  wins(mask: number, left: boolean): boolean {
    const k = mask * 2 + (left ? 1 : 0);
    const hit = this.memo.get(k);
    if (hit !== undefined) return hit;
    let r = false;
    for (const m of moves(this.edges, mask, left)) {
      if (!this.wins(m.after, !left)) { r = true; break; }
    }
    this.memo.set(k, r);
    return r;
  }
  /** L, R, P or N, as in cgt.outcome */
  outcome(mask: number): 'L' | 'R' | 'P' | 'N' {
    const l = this.wins(mask, true);
    const r = this.wins(mask, false);
    return l && r ? 'N' : l ? 'L' : r ? 'R' : 'P';
  }
}

/** Green Hackenbush by brute force: the mex rule over every cut (Sprague–Grundy). */
export class Grundy {
  private memo = new Map<number, number>();
  readonly edges: readonly Edge[];
  constructor(edges: readonly Edge[]) {
    this.edges = edges;
  }
  value(mask: number): number {
    if (mask === 0) return 0;
    const hit = this.memo.get(mask);
    if (hit !== undefined) return hit;
    const seen = new Set<number>();
    for (const m of moves(this.edges, mask, true)) seen.add(this.value(m.after));
    let g = 0;
    while (seen.has(g)) g++;
    this.memo.set(mask, g);
    return g;
  }
}

/**
 * Green Hackenbush by the fusion and colon principles, with no search: fuse the
 * vertices of every circuit (so its edges become loops, and a loop is worth one
 * edge), then a vertex of the remaining tree is worth the nim sum over its
 * branches of (branch + 1).
 */
export function fusionValue(edges: readonly Edge[], mask: number): number {
  mask = grounded(edges, mask);
  const idx: number[] = [];
  for (let i = 0; i < edges.length; i++) if (mask & (1 << i)) idx.push(i);
  const nv = Math.max(0, ...idx.map((i) => Math.max(edges[i].u, edges[i].v))) + 1;
  const adj: [number, number][][] = Array.from({ length: nv }, () => []);
  for (const i of idx) {
    const { u, v } = edges[i];
    if (u === v) continue; // a loop is never a bridge
    adj[u].push([v, i]);
    adj[v].push([u, i]);
  }
  // bridges (Tarjan's low-link, by edge id so that parallel edges are not bridges)
  const disc = new Array(nv).fill(-1);
  const low = new Array(nv).fill(0);
  const bridge = new Set<number>();
  let t = 0;
  const dfs = (x: number, viaEdge: number): void => {
    disc[x] = low[x] = t++;
    for (const [y, e] of adj[x]) {
      if (e === viaEdge) continue;
      if (disc[y] < 0) {
        dfs(y, e);
        low[x] = Math.min(low[x], low[y]);
        if (low[y] > disc[x]) bridge.add(e);
      } else low[x] = Math.min(low[x], disc[y]);
    }
  };
  dfs(0, -1);
  // fuse along every non-bridge edge
  const parent = Array.from({ length: nv }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const i of idx) if (!bridge.has(i)) parent[find(edges[i].u)] = find(edges[i].v);
  const loops = new Array(nv).fill(0);
  for (const i of idx) if (!bridge.has(i)) loops[find(edges[i].u)]++;
  const tree: number[][] = Array.from({ length: nv }, () => []);
  for (const i of bridge) {
    const a = find(edges[i].u);
    const b = find(edges[i].v);
    tree[a].push(b);
    tree[b].push(a);
  }
  const colon = (x: number, from: number): number => {
    let g = loops[x] & 1;
    for (const y of tree[x]) if (y !== from) g ^= colon(y, x) + 1;
    return g;
  };
  return colon(find(0), -1);
}

/** A stalk: edges stacked one on another from the ground, colours bottom first. */
export function stalk(colors: string): Edge[] {
  return [...colors].map((c, i) => ({ u: i, v: i + 1, c: c as Color }));
}

/**
 * Berlekamp's rule for a blue-red stalk: its value is the number whose sign
 * expansion is the colour sequence (blue +, red −). Steps of 1 until the first
 * change of colour, then each edge is worth half the one below.
 */
export function signExpansion(colors: string): number {
  let x = 0;
  let step = 1;
  let changed = false;
  for (let i = 0; i < colors.length; i++) {
    const s = colors[i] === 'B' ? 1 : -1;
    if (i > 0 && colors[i] !== colors[i - 1]) changed = true;
    if (changed) step /= 2;
    x += s * step;
  }
  return x;
}

/** Green Hackenbush value as a game: *n. */
export const greenGame = (edges: readonly Edge[], mask: number): GameId => nimber(fusionValue(edges, mask));
