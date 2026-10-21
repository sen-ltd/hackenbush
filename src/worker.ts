// Web Worker: the game value of the position, of each piece, and of the
// position after every cut the player to move could make. One Valuer (and its
// table of values by mask) is kept per drawing, so a whole game reuses it.
import { name, outcome, type Outcome } from './cgt.ts';
import { type Edge, Valuer, components, moves } from './hackenbush.ts';

export interface Request {
  id: number;
  edges: Edge[];
  mask: number;
  leftToMove: boolean;
}

export interface Reply {
  id: number;
  value: string;
  outcome: Outcome;
  pieces: { mask: number; value: string }[];
  /** every legal cut for the player to move; `good` keeps the win */
  moves: { edge: number; value: string; good: boolean }[];
  states: number;
  ms: number;
}

const valuers = new Map<string, Valuer>();

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, edges, mask, leftToMove } = ev.data;
  const t0 = performance.now();
  const key = JSON.stringify(edges);
  let v = valuers.get(key);
  if (!v) {
    v = new Valuer(edges);
    valuers.set(key, v);
  }
  const g = v.value(mask);
  const pieces = components(edges, mask).map((m) => ({ mask: m, value: name(v.value(m)) }));
  const ms = moves(edges, mask, leftToMove).map((m) => {
    const after = v.value(m.after);
    const o = outcome(after);
    // after the cut the opponent moves first: we win if they lose moving first
    const good = leftToMove ? o === 'L' || o === 'P' : o === 'R' || o === 'P';
    return { edge: m.edge, value: name(after), good };
  });
  const reply: Reply = {
    id, value: name(g), outcome: outcome(g), pieces, moves: ms, states: v.size,
    ms: Math.round(performance.now() - t0),
  };
  (self as unknown as Worker).postMessage(reply);
};
