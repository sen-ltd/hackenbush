// Checks the game-value engine against three classical theorems and against a
// plain win/lose search, and counts the values of every small stalk.
//
//   node tools/verify.mts <experiment> [args]   → runs/<experiment>.json
//
// experiments:
//   signexp <maxLen>          blue-red stalks vs Berlekamp's sign-expansion rule
//   green <k> <maxEdges>      green graphs: mex search vs fusion+colon vs the engine
//   graphs <k> <maxEdges> <colors>   coloured graphs: engine outcome vs minimax,
//                             split-into-pieces value vs one-piece value, red-blue → numbers
//   stalks <maxLen>           every blue-red-green stalk: distinct values per length

import { writeFileSync, mkdirSync } from 'node:fs';
import {
  type GameId, make, add, outcome, isNumber, numberValue, name, infinitesimalPart, birthday, nimber, gameCount,
} from '../src/cgt.ts';
import {
  type Color, type Edge, Valuer, Minimax, Grundy, fusionValue, grounded, fullMask, moves, signExpansion,
} from '../src/hackenbush.ts';

const [exp, ...args] = process.argv.slice(2);
const t0 = Date.now();
mkdirSync('runs', { recursive: true });
const save = (file: string, data: object) => {
  const out = { experiment: exp, args, ms: Date.now() - t0, node: process.version, ...data };
  writeFileSync(`runs/${file}.json`, JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out).slice(0, 2000));
};

/** every multiset of `size` items from 0..types-1, as non-decreasing arrays */
function* multisets(types: number, size: number, from = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === size) { yield acc; return; }
  for (let t = from; t < types; t++) {
    acc.push(t);
    yield* multisets(types, size, t, acc);
    acc.pop();
  }
}

/** edge types on ground + k vertices: every pair and every loop, in each colour */
function edgeTypes(k: number, colors: Color[]): Edge[] {
  const out: Edge[] = [];
  for (let u = 0; u <= k; u++) for (let v = u; v <= k; v++) for (const c of colors) out.push({ u, v, c });
  return out;
}

/** One-piece value: no splitting into a sum, just the options of the whole position. */
class WholeValuer {
  private memo = new Map<number, GameId>();
  readonly edges: readonly Edge[];
  constructor(edges: readonly Edge[]) { this.edges = edges; }
  value(mask: number): GameId {
    const hit = this.memo.get(mask);
    if (hit !== undefined) return hit;
    const L = moves(this.edges, mask, true).map((m) => this.value(m.after));
    const R = moves(this.edges, mask, false).map((m) => this.value(m.after));
    const g = make(L, R);
    this.memo.set(mask, g);
    return g;
  }
}

function kind(g: GameId): string {
  if (isNumber(g)) return 'number';
  const inf = infinitesimalPart(g);
  if (inf) {
    if (inf.ups === 0) return inf.x === 0 ? 'nimber' : 'number+nimber';
    return inf.x === 0 ? 'ups+nimber' : 'number+ups+nimber';
  }
  return 'other';
}

if (exp === 'signexp') {
  const maxLen = Number(args[0] ?? 20);
  const perLen: { len: number; stalks: number; match: number }[] = [];
  for (let n = 1; n <= maxLen; n++) perLen.push({ len: n, stalks: 0, match: 0 });
  let first: string | null = null;
  // depth-first over the trie of colour strings; vals[i] = value of the first i edges
  const vals: GameId[] = [make([], [])];
  const s: string[] = [];
  const walk = () => {
    const n = s.length;
    if (n > 0) {
      const L: GameId[] = [];
      const R: GameId[] = [];
      for (let i = 0; i < n; i++) (s[i] === 'B' ? L : R).push(vals[i]);
      const g = make(L, R);
      vals[n] = g;
      const rec = perLen[n - 1];
      rec.stalks++;
      const str = s.join('');
      if (isNumber(g) && numberValue(g) === signExpansion(str)) rec.match++;
      else if (!first) first = str;
    }
    if (n === maxLen) return;
    for (const c of ['B', 'R']) { s.push(c); walk(); s.pop(); }
  };
  walk();
  const stalks = perLen.reduce((a, r) => a + r.stalks, 0);
  const match = perLen.reduce((a, r) => a + r.match, 0);
  save(`signexp-${maxLen}`, { stalks, match, firstMismatch: first, perLen });
} else if (exp === 'green') {
  const k = Number(args[0] ?? 3);
  const maxE = Number(args[1] ?? 8);
  const types = edgeTypes(k, ['G']);
  const rows: object[] = [];
  let firstBad: object | null = null;
  for (let e = 1; e <= maxE; e++) {
    let graphs = 0, agreeFusion = 0, agreeEngine = 0, maxNim = 0;
    const hist: Record<number, number> = {};
    for (const ms of multisets(types.length, e)) {
      const edges = ms.map((t) => types[t]);
      const full = fullMask(edges);
      if (grounded(edges, full) !== full) continue; // every edge must reach the ground
      graphs++;
      const brute = new Grundy(edges).value(full);
      const fus = fusionValue(edges, full);
      const eng = new Valuer(edges).value(full);
      if (fus === brute) agreeFusion++;
      if (eng === nimber(brute)) agreeEngine++;
      if ((fus !== brute || eng !== nimber(brute)) && !firstBad) firstBad = { edges, brute, fus, eng: name(eng) };
      hist[brute] = (hist[brute] ?? 0) + 1;
      maxNim = Math.max(maxNim, brute);
    }
    rows.push({ edges: e, graphs, agreeFusion, agreeEngine, maxNim, hist });
    console.error(`green k=${k} e=${e} graphs=${graphs} ${Date.now() - t0}ms`);
  }
  save(`green-k${k}-e${maxE}`, { k, maxEdges: maxE, rows, firstBad });
} else if (exp === 'graphs') {
  const k = Number(args[0] ?? 3);
  const maxE = Number(args[1] ?? 5);
  const colors = [...(args[2] ?? 'BRG')] as Color[];
  const types = edgeTypes(k, colors);
  const rows: object[] = [];
  let firstBad: object | null = null;
  const allValues = new Set<GameId>();
  for (let e = 1; e <= maxE; e++) {
    let graphs = 0, outcomeAgree = 0, splitAgree = 0, numbers = 0;
    const kinds: Record<string, number> = {};
    const outcomes: Record<string, number> = { L: 0, R: 0, P: 0, N: 0 };
    const values = new Set<GameId>();
    for (const ms of multisets(types.length, e)) {
      const edges = ms.map((t) => types[t]);
      const full = fullMask(edges);
      if (grounded(edges, full) !== full) continue;
      graphs++;
      const g = new Valuer(edges).value(full);
      const whole = new WholeValuer(edges).value(full);
      const mm = new Minimax(edges).outcome(full);
      const o = outcome(g);
      if (o === mm) outcomeAgree++;
      if (whole === g) splitAgree++;
      if (isNumber(g)) numbers++;
      if ((o !== mm || whole !== g) && !firstBad) firstBad = { edges, value: name(g), whole: name(whole), engine: o, minimax: mm };
      outcomes[mm]++;
      const kd = kind(g);
      kinds[kd] = (kinds[kd] ?? 0) + 1;
      values.add(g);
      allValues.add(g);
    }
    rows.push({ edges: e, graphs, outcomeAgree, splitAgree, numbers, distinctValues: values.size, outcomes, kinds });
    console.error(`graphs k=${k} ${colors.join('')} e=${e} graphs=${graphs} ${Date.now() - t0}ms games=${gameCount()}`);
  }
  save(`graphs-${colors.join('')}-k${k}-e${maxE}`, { k, maxEdges: maxE, colors, rows, distinctValuesAll: allValues.size, firstBad });
} else if (exp === 'stalks') {
  const maxLen = Number(args[0] ?? 12);
  const vals: GameId[] = [make([], [])];
  const s: string[] = [];
  const perLen = Array.from({ length: maxLen }, (_, i) => ({
    len: i + 1, stalks: 0, values: new Set<GameId>(), kinds: {} as Record<string, number>, maxBirthday: 0,
    // x + *m exactly for (blue-red)(green^m), x ± ↑* exactly for (blue-red)G(B|R)
    starPattern: 0, starPatternHolds: 0, upPattern: 0, upPatternHolds: 0, starKindOutside: 0, upKindOutside: 0,
  }));
  const cumulative = new Set<GameId>();
  const walk = () => {
    const n = s.length;
    if (n > 0) {
      const L: GameId[] = [];
      const R: GameId[] = [];
      for (let i = 0; i < n; i++) {
        if (s[i] !== 'R') L.push(vals[i]);
        if (s[i] !== 'B') R.push(vals[i]);
      }
      const g = make(L, R);
      vals[n] = g;
      const rec = perLen[n - 1];
      rec.stalks++;
      rec.values.add(g);
      cumulative.add(g);
      const str = s.join('');
      const inf = isNumber(g) ? null : infinitesimalPart(g);
      const a = /^([BR]+)(G+)$/.exec(str);
      const b = /^([BR]+)G([BR])$/.exec(str);
      if (a) {
        rec.starPattern++;
        if (inf && inf.ups === 0 && inf.x === signExpansion(a[1]) && inf.star === a[2].length) rec.starPatternHolds++;
      } else if (inf && inf.ups === 0 && inf.x !== 0) rec.starKindOutside++;
      if (b) {
        rec.upPattern++;
        if (inf && inf.ups === (b[2] === 'B' ? 1 : -1) && inf.star === 1 && inf.x === signExpansion(b[1])) rec.upPatternHolds++;
      } else if (inf && inf.ups !== 0 && inf.x !== 0) rec.upKindOutside++;
    }
    if (n === maxLen) return;
    for (const c of ['B', 'R', 'G']) { s.push(c); walk(); s.pop(); }
  };
  walk();
  const rows = perLen.map((r) => {
    const kinds: Record<string, number> = {};
    let maxBirthday = 0;
    for (const g of r.values) {
      const kd = kind(g);
      kinds[kd] = (kinds[kd] ?? 0) + 1;
      maxBirthday = Math.max(maxBirthday, birthday(g));
    }
    const { starPattern, starPatternHolds, upPattern, upPatternHolds, starKindOutside, upKindOutside } = r;
    return {
      len: r.len, stalks: r.stalks, distinctValues: r.values.size, distinctKinds: kinds, maxBirthday,
      starPattern, starPatternHolds, upPattern, upPatternHolds, starKindOutside, upKindOutside,
    };
  });
  // a few named examples, for the article
  const examples: Record<string, string> = {};
  for (const ex of ['G', 'BG', 'GB', 'GR', 'GG', 'BGB', 'GBB', 'GBR', 'BRG', 'GGB', 'GBG', 'BGG', 'RGB']) {
    let v: GameId[] = [make([], [])];
    for (let i = 1; i <= ex.length; i++) {
      const L: GameId[] = [], R: GameId[] = [];
      for (let j = 0; j < i; j++) { if (ex[j] !== 'R') L.push(v[j]); if (ex[j] !== 'B') R.push(v[j]); }
      v[i] = make(L, R);
    }
    examples[ex] = name(v[ex.length]);
  }
  save(`stalks-${maxLen}`, { maxLen, rows, distinctValuesAll: cumulative.size, games: gameCount(), examples });
} else if (exp === 'sums') {
  // outcome of a sum by values vs minimax over the disjoint union, on random small positions
  const count = Number(args[0] ?? 2000);
  let seed = 12345;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const randomPos = (): Edge[] => {
    const k = 1 + rnd(3);
    const ne = 1 + rnd(4);
    const edges: Edge[] = [];
    for (let i = 0; i < ne; i++) {
      // attach to an existing vertex so that everything stays grounded
      const u = rnd(Math.min(k, i + 1) + 1);
      const v = rnd(k + 1);
      edges.push({ u, v, c: (['B', 'R', 'G'] as Color[])[rnd(3)] });
    }
    return edges;
  };
  let agree = 0, done = 0;
  let firstBad: object | null = null;
  for (let t = 0; t < count; t++) {
    const parts = [randomPos(), randomPos(), randomPos()];
    let union: Edge[] = [];
    let off = 0;
    let total: GameId = make([], []);
    for (const p of parts) {
      const full = fullMask(p);
      total = add(total, new Valuer(p).value(grounded(p, full)));
      const top = Math.max(...p.map((e) => Math.max(e.u, e.v)));
      union = union.concat(p.map((e) => ({ u: e.u ? e.u + off : 0, v: e.v ? e.v + off : 0, c: e.c })));
      off += top;
    }
    const fu = fullMask(union);
    const mm = new Minimax(union).outcome(grounded(union, fu));
    done++;
    if (mm === outcome(total)) agree++;
    else if (!firstBad) firstBad = { parts, total: name(total), minimax: mm };
  }
  save(`sums-${count}`, { count: done, agree, firstBad });
} else {
  console.error('unknown experiment');
  process.exit(2);
}
