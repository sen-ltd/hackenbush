import { describe, it, expect } from 'vitest';
import {
  ZERO, STAR, UP, DOWN, make, add, neg, le, outcome, name, nimber, numberGame, simplestBetween, isNumber,
  numberValue, upMultiple, birthday,
} from './cgt';
import {
  type Edge, type Color, Valuer, Minimax, Grundy, fusionValue, grounded, components, stalk, signExpansion, fullMask,
} from './hackenbush';
import { PRESETS, randomDrawing } from './presets';

const valueOf = (edges: Edge[]) => new Valuer(edges).value(grounded(edges, fullMask(edges)));
const stalkValue = (s: string) => valueOf(stalk(s));

describe('the game-value engine', () => {
  it('builds the standard small games and names them', () => {
    expect(name(ZERO)).toBe('0');
    expect(name(STAR)).toBe('*');
    expect(name(UP)).toBe('↑');
    expect(name(DOWN)).toBe('↓');
    expect(name(add(UP, STAR))).toBe('↑*');
    expect(name(add(UP, UP))).toBe('⇑');
    expect(make([ZERO, STAR], [ZERO])).toBe(add(UP, STAR)); // ↑* = {0, * | 0}
    expect(make([ZERO], [add(UP, STAR)])).toBe(add(UP, UP)); // ⇑ = {0 | ↑*}
    expect(name(make([numberGame(1)], [numberGame(-1)]))).toBe('±1');
    expect(add(nimber(3), nimber(5))).toBe(nimber(6)); // nim addition is XOR
    expect(add(STAR, STAR)).toBe(ZERO);
    expect(add(UP, DOWN)).toBe(ZERO);
  });

  it('finds the simplest number between two numbers', () => {
    expect(simplestBetween(-Infinity, Infinity)).toBe(0);
    expect(simplestBetween(0, Infinity)).toBe(1);
    expect(simplestBetween(0, 1)).toBe(1 / 2);
    expect(simplestBetween(1 / 2, 1)).toBe(3 / 4);
    expect(simplestBetween(-3.5, -1)).toBe(-2);
    expect(simplestBetween(2.1, 7)).toBe(3);
    expect(make([numberGame(1 / 4)], [numberGame(3 / 4)])).toBe(numberGame(1 / 2));
  });

  it('orders infinitesimals correctly against numbers and each other', () => {
    const tiny = numberGame(1 / 1024);
    expect(le(ZERO, UP) && !le(UP, ZERO)).toBe(true); // ↑ > 0
    expect(le(UP, tiny) && !le(tiny, UP)).toBe(true); // ↑ < every positive number
    expect(outcome(STAR)).toBe('N');
    expect(outcome(add(UP, STAR))).toBe('N'); // ↑* ‖ 0
    expect(outcome(add(upMultiple(2), STAR))).toBe('L'); // ⇑* > 0
    expect(neg(add(UP, STAR))).toBe(add(DOWN, STAR));
  });
});

describe('Hackenbush values', () => {
  it('values single edges and the smallest stalks', () => {
    expect(name(stalkValue('B'))).toBe('1');
    expect(name(stalkValue('R'))).toBe('−1');
    expect(name(stalkValue('G'))).toBe('*');
    expect(name(stalkValue('BR'))).toBe('1/2');
    expect(name(stalkValue('BG'))).toBe('1*');
    expect(name(stalkValue('GB'))).toBe('↑*');
    expect(name(stalkValue('GR'))).toBe('↓*');
    expect(name(stalkValue('BGB'))).toBe('1↑*');
    expect(name(stalkValue('GBB'))).toBe('{0, ↑* | 0}');
  });

  it("follows Berlekamp's sign-expansion rule on every blue-red stalk up to 12 edges", () => {
    let n = 0;
    for (let len = 1; len <= 12; len++) {
      for (let bits = 0; bits < 1 << len; bits++) {
        let s = '';
        for (let i = 0; i < len; i++) s += bits & (1 << i) ? 'R' : 'B';
        const g = stalkValue(s);
        expect(isNumber(g)).toBe(true);
        expect(numberValue(g)).toBe(signExpansion(s));
        n++;
      }
    }
    expect(n).toBe(8190);
  });

  it('values a blue-red stalk under green edges as a number plus a nimber', () => {
    // x then m green edges on top = x + *m; x then green then blue = x + ↑*
    for (const [rb, m] of [['B', 2], ['BRR', 1], ['RBB', 3], ['BBRB', 2]] as const) {
      expect(stalkValue(rb + 'G'.repeat(m))).toBe(add(numberGame(signExpansion(rb)), nimber(m)));
      expect(stalkValue(rb + 'GB')).toBe(add(numberGame(signExpansion(rb)), add(UP, STAR)));
    }
  });

  it('gives every stalk of up to 7 edges its own value, born on the day of its length', () => {
    const seen = new Set<number>();
    const colors: Color[] = ['B', 'R', 'G'];
    for (let len = 1; len <= 7; len++) {
      let s = Array(len).fill(0);
      for (let k = 0; k < 3 ** len; k++) {
        let x = k;
        s = s.map(() => { const c = x % 3; x = Math.floor(x / 3); return c; });
        const g = stalkValue(s.map((c) => colors[c]).join(''));
        expect(birthday(g)).toBe(len);
        seen.add(g);
      }
    }
    expect(seen.size).toBe(3 + 9 + 27 + 81 + 243 + 729 + 2187);
  });

  it('agrees with the colon and fusion principles on green drawings', () => {
    const cases: [Edge[], number][] = [
      [[{ u: 0, v: 1, c: 'G' }, { u: 1, v: 2, c: 'G' }, { u: 2, v: 0, c: 'G' }], 1], // triangle: odd cycle
      [[{ u: 0, v: 1, c: 'G' }, { u: 1, v: 2, c: 'G' }, { u: 2, v: 3, c: 'G' }, { u: 3, v: 0, c: 'G' }], 0], // square
      [[{ u: 0, v: 1, c: 'G' }, { u: 1, v: 2, c: 'G' }, { u: 1, v: 3, c: 'G' }], 1], // a Y: the fork is (0+1) ⊕ (0+1) = 0, so the trunk is 0 + 1
      [[{ u: 0, v: 1, c: 'G' }, { u: 1, v: 1, c: 'G' }, { u: 1, v: 1, c: 'G' }], 1], // stalk with two loops
    ];
    for (const [edges, nim] of cases) {
      const full = fullMask(edges);
      expect(fusionValue(edges, full)).toBe(nim);
      expect(new Grundy(edges).value(full)).toBe(nim);
      expect(valueOf(edges)).toBe(nimber(nim));
    }
  });

  it('matches mex brute force and the fusion principle on random green graphs', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const d = randomDrawing(9, seed * 7919);
      const edges: Edge[] = d.edges.map((e) => ({ u: e.a, v: e.b, c: 'G' as Color }));
      // re-root: points on the ground line are vertex 0
      const ground = new Set(d.points.flatMap((p, i) => (p.y >= 400 ? [i] : [])));
      const ids = new Map<number, number>();
      const vid = (p: number) => (ground.has(p) ? 0 : ids.get(p) ?? (ids.set(p, ids.size + 1), ids.size));
      const g = edges.map((e) => ({ u: vid(e.u), v: vid(e.v), c: e.c }));
      const full = grounded(g, fullMask(g));
      const brute = new Grundy(g).value(full);
      expect(fusionValue(g, full)).toBe(brute);
      expect(new Valuer(g).value(full)).toBe(nimber(brute));
    }
  });

  it('agrees with a plain win/lose search on random mixed drawings, and blue-red ones are numbers', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = randomDrawing(10, seed * 104729);
      const ground = new Set(d.points.flatMap((p, i) => (p.y >= 400 ? [i] : [])));
      const ids = new Map<number, number>();
      const vid = (p: number) => (ground.has(p) ? 0 : ids.get(p) ?? (ids.set(p, ids.size + 1), ids.size));
      const edges: Edge[] = d.edges.map((e) => ({ u: vid(e.a), v: vid(e.b), c: e.c }));
      const full = grounded(edges, fullMask(edges));
      const g = new Valuer(edges).value(full);
      expect(outcome(g)).toBe(new Minimax(edges).outcome(full));
      const rb: Edge[] = edges.map((e) => ({ ...e, c: e.c === 'G' ? 'R' : e.c }));
      expect(isNumber(new Valuer(rb).value(full))).toBe(true);
    }
  });

  it('values a drawing as the sum of the pieces that meet only at the ground', () => {
    const edges: Edge[] = [...stalk('BR'), { u: 0, v: 3, c: 'G' }, { u: 3, v: 4, c: 'B' }];
    const full = fullMask(edges);
    expect(components(edges, full)).toHaveLength(2);
    expect(valueOf(edges)).toBe(add(stalkValue('BR'), stalkValue('GB')));
    expect(name(valueOf(edges))).toBe('1/2↑*');
  });

  it('drops what is cut off from the ground', () => {
    const edges = stalk('BRG');
    expect(grounded(edges, 0b110)).toBe(0); // the bottom edge is gone, so is everything above
    expect(grounded(edges, 0b011)).toBe(0b011);
  });

  it('values every preset drawing', () => {
    for (const p of PRESETS.filter((x) => x.id !== 'random')) {
      const d = p.make();
      const ground = new Set(d.points.flatMap((q, i) => (q.y >= 400 ? [i] : [])));
      const ids = new Map<number, number>();
      const vid = (q: number) => (ground.has(q) ? 0 : ids.get(q) ?? (ids.set(q, ids.size + 1), ids.size));
      const edges: Edge[] = d.edges.map((e) => ({ u: vid(e.a), v: vid(e.b), c: e.c }));
      const full = fullMask(edges);
      expect(grounded(edges, full)).toBe(full); // nothing in a preset floats
      expect(name(new Valuer(edges).value(full)).length).toBeGreaterThan(0);
    }
  });
});
