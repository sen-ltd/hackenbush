import './style.css';
import { type Color, type Edge, MAX_EDGES, grounded } from './hackenbush.ts';
import { PRESETS, GROUND, W, H, type Drawing, type Point } from './presets.ts';
import type { Request, Reply } from './worker.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = $<HTMLElement>('board') as unknown as SVGSVGElement;
const statusEl = $('status');
const presetSel = $<HTMLSelectElement>('presetSel');
const youSel = $<HTMLSelectElement>('youSel');
const firstSel = $<HTMLSelectElement>('firstSel');
const hintsBox = $<HTMLInputElement>('hints');
const modeBtn = $<HTMLButtonElement>('mode');
const palette = $('palette');

const COLOR_NAME: Record<Color, string> = { B: 'blue', R: 'red', G: 'green' };
const SIDE = (left: boolean) => (left ? 'Blue' : 'Red');

let drawing: Drawing = PRESETS[0].make();
let mask = 0; // edges still standing (bit i = drawing.edges[i])
let leftToMove = true;
let history: { mask: number; leftToMove: boolean; cut: number }[] = [];
let youLeft = true;
let editing = false;
let pen: Color = 'B';
let pending: number | null = null; // first point of an edge being drawn
let reply: Reply | null = null;
let requestId = 0;
let busy = false;
let worker = makeWorker();

function makeWorker(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<Reply>) => {
    if (ev.data.id !== requestId) return;
    busy = false;
    reply = ev.data;
    render();
    maybeCpu();
  };
  return w;
}

// ---- the game ------------------------------------------------------------------

const isGround = (p: Point) => p.y >= GROUND;

/** The drawing as a Hackenbush edge list: ground points are vertex 0. */
function logicalEdges(d: Drawing): Edge[] {
  const id = new Map<number, number>();
  let next = 1;
  const vid = (pi: number) => {
    if (isGround(d.points[pi])) return 0;
    let v = id.get(pi);
    if (v === undefined) { v = next++; id.set(pi, v); }
    return v;
  };
  return d.edges.map((e) => ({ u: vid(e.a), v: vid(e.b), c: e.c }));
}

function fullMask(): number {
  const n = drawing.edges.length;
  return n >= 31 ? 0x7fffffff : (1 << n) - 1;
}

function newGame(): void {
  mask = grounded(logicalEdges(drawing), fullMask());
  leftToMove = firstSel.value === 'blue';
  history = [];
  analyse();
}

function analyse(): void {
  requestId++;
  reply = null;
  if (busy) { worker.terminate(); worker = makeWorker(); }
  if (editing) { busy = false; render(); return; }
  busy = true;
  const req: Request = { id: requestId, edges: logicalEdges(drawing), mask, leftToMove };
  worker.postMessage(req);
  render();
}

const yourTurn = () => leftToMove === youLeft;
const legal = (i: number) => {
  const c = drawing.edges[i].c;
  return (mask & (1 << i)) !== 0 && (c === 'G' || (c === 'B') === leftToMove);
};
const gameOver = () => reply !== null && reply.moves.length === 0;

function cut(i: number): void {
  history.push({ mask, leftToMove, cut: i });
  mask = grounded(logicalEdges(drawing), mask & ~(1 << i));
  leftToMove = !leftToMove;
  analyse();
}

function maybeCpu(): void {
  if (!reply || editing || yourTurn() || gameOver()) return;
  const good = reply.moves.filter((m) => m.good);
  // a winning cut if there is one; otherwise the cut that knocks down the fewest edges
  let pick: number;
  if (good.length) pick = good[Math.floor(Math.random() * good.length)].edge;
  else {
    const edges = logicalEdges(drawing);
    let best = -1;
    pick = reply.moves[0].edge;
    for (const m of reply.moves) {
      const left = popcount(grounded(edges, mask & ~(1 << m.edge)));
      if (left > best) { best = left; pick = m.edge; }
    }
  }
  const id = requestId;
  setTimeout(() => { if (id === requestId) cut(pick); }, 450);
}

function popcount(x: number): number {
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
}

// ---- drawing -------------------------------------------------------------------

interface Shape { d: string; mx: number; my: number }

function shapes(): Shape[] {
  const pts = drawing.points;
  const groups = new Map<string, number[]>();
  drawing.edges.forEach((e, i) => {
    const k = e.a === e.b ? `L${e.a}` : `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const out: Shape[] = [];
  for (const idx of groups.values()) {
    idx.forEach((i, k) => {
      const e = drawing.edges[i];
      const p = pts[e.a];
      const q = pts[e.b];
      if (e.a === e.b) {
        // loops fan out above the point
        const n = idx.length;
        const ang = -Math.PI / 2 + (n === 1 ? 0 : (k - (n - 1) / 2) * 0.9);
        const r = 46;
        const tip = { x: p.x + r * Math.cos(ang), y: p.y + r * Math.sin(ang) };
        const side = { x: -Math.sin(ang) * 22, y: Math.cos(ang) * 22 };
        const c1 = { x: tip.x + side.x, y: tip.y + side.y };
        const c2 = { x: tip.x - side.x, y: tip.y - side.y };
        out[i] = {
          d: `M${p.x},${p.y} C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p.x},${p.y}`,
          mx: p.x + 0.75 * r * Math.cos(ang), my: p.y + 0.75 * r * Math.sin(ang),
        };
        return;
      }
      const n = idx.length;
      const both = isGround(p) && isGround(q);
      const off = both ? -40 - k * 22 : (k - (n - 1) / 2) * 34;
      if (off === 0) {
        out[i] = { d: `M${p.x},${p.y} L${q.x},${q.y}`, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
        return;
      }
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      if (both && ny > 0) { nx = -nx; ny = -ny; }
      const cx = (p.x + q.x) / 2 + nx * off * (both ? -1 : 1);
      const cy = (p.y + q.y) / 2 + ny * off * (both ? -1 : 1);
      out[i] = {
        d: `M${p.x},${p.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${q.x},${q.y}`,
        mx: (p.x + 2 * cx + q.x) / 4, my: (p.y + 2 * cy + q.y) / 4,
      };
    });
  }
  return out;
}

function render(): void {
  const sh = shapes();
  const moveInfo = new Map((reply?.moves ?? []).map((m) => [m.edge, m]));
  const showHints = hintsBox.checked && !editing && reply !== null && yourTurn();
  let s = `<rect x="0" y="${GROUND}" width="${W}" height="${H - GROUND}" class="earth"/>`;
  s += `<line x1="0" y1="${GROUND}" x2="${W}" y2="${GROUND}" class="groundline"/>`;
  drawing.edges.forEach((e, i) => {
    const up = editing || (mask & (1 << i)) !== 0;
    const cls = ['edge', COLOR_NAME[e.c]];
    if (!up) cls.push('gone');
    if (!editing && up && yourTurn() && legal(i) && !gameOver()) cls.push('open');
    if (!editing && history.length && history[history.length - 1].cut === i) cls.push('last');
    s += `<path class="${cls.join(' ')}" d="${sh[i].d}"/>`;
    if (up) s += `<path class="hit" data-edge="${i}" d="${sh[i].d}"><title>${tip(i)}</title></path>`;
  });
  // vertices
  const used = new Set<number>();
  drawing.edges.forEach((e, i) => { if (editing || mask & (1 << i)) { used.add(e.a); used.add(e.b); } });
  drawing.points.forEach((p, i) => {
    if (!used.has(i) && pending !== i) return;
    const cls = isGround(p) ? 'vx ground' : 'vx';
    s += `<circle class="${cls}${pending === i ? ' pending' : ''}" data-point="${i}" cx="${p.x}" cy="${p.y}" r="${isGround(p) ? 4 : 5}"/>`;
  });
  if (showHints) {
    for (const [i, m] of moveInfo) {
      const { mx, my } = sh[i];
      s += `<g class="mark ${m.good ? 'win' : 'lose'}"><circle cx="${mx}" cy="${my}" r="9"/>` +
        `<text x="${mx}" y="${my + 4.5}" text-anchor="middle">${m.good ? '✓' : '✗'}</text></g>`;
    }
  }
  svg.innerHTML = s;
  renderStatus();
  renderValue();
}

function tip(i: number): string {
  const e = drawing.edges[i];
  if (editing) return `${COLOR_NAME[e.c]} edge · click to delete`;
  const m = reply?.moves.find((x) => x.edge === i);
  return m ? `${COLOR_NAME[e.c]} edge · after this cut the value is ${m.value}` : `${COLOR_NAME[e.c]} edge`;
}

const OUTCOME_TEXT: Record<string, string> = {
  L: 'Blue wins, whoever moves first (G > 0)',
  R: 'Red wins, whoever moves first (G < 0)',
  P: 'the player to move loses (G = 0)',
  N: 'the player to move wins (G ‖ 0)',
};

function renderValue(): void {
  const box = $('value');
  if (editing) {
    box.innerHTML = `<div class="big dim">editing</div><p class="dim small">${drawing.edges.length} / ${MAX_EDGES} edges. Values come back when you press Play.</p>`;
    return;
  }
  if (!reply) {
    box.innerHTML = `<div class="big dim">…</div><p class="dim small">computing the value</p>`;
    return;
  }
  const pieces = reply.pieces
    .map((p) => {
      const xs = drawing.edges.flatMap((e, i) => (p.mask & (1 << i) ? [drawing.points[e.a].x, drawing.points[e.b].x] : []));
      return { x: Math.min(...xs), value: p.value, n: popcount(p.mask) };
    })
    .sort((a, b) => a.x - b.x);
  box.innerHTML =
    `<div class="big${reply.value.length > 28 ? ' long' : ''}">G = ${reply.value}</div>` +
    `<p class="verdict">${OUTCOME_TEXT[reply.outcome]}</p>` +
    (pieces.length > 1
      ? `<p class="dim small">the sum of ${pieces.length} pieces, left to right:</p><ol class="pieces">${pieces
          .map((p) => `<li><span>${p.value}</span> <em>${p.n} edge${p.n > 1 ? 's' : ''}</em></li>`)
          .join('')}</ol>`
      : '') +
    `<p class="dim small">${reply.states.toLocaleString('en')} positions valued for this drawing · ${reply.ms} ms</p>`;
}

function renderStatus(): void {
  if (editing) {
    statusEl.innerHTML = pending === null
      ? `Click a point or empty space to start a <strong class="${COLOR_NAME[pen]}-t">${COLOR_NAME[pen]}</strong> edge, then click where it ends (the same point makes a loop). Click an edge to delete it.`
      : `Now click where the edge ends. Esc cancels.`;
    return;
  }
  if (!reply) { statusEl.textContent = 'computing…'; return; }
  const who = SIDE(leftToMove);
  if (gameOver()) {
    const youWon = !yourTurn();
    statusEl.innerHTML = `${who} has no edge to cut. ` +
      (youWon ? `<strong class="win-t">You win.</strong>` : `<strong class="lose-t">The computer wins.</strong>`);
    return;
  }
  const wins = reply.moves.filter((m) => m.good).length;
  const verdict = wins
    ? `<strong class="win-t">${who} to move wins</strong> (${wins} winning cut${wins > 1 ? 's' : ''})`
    : `<strong class="lose-t">${who} to move loses</strong> against best play`;
  const lead = yourTurn() ? `Your move (${who}): cut a ${leftToMove ? 'blue' : 'red'} or green edge` : `Computer (${who}) to move`;
  statusEl.innerHTML = `${lead} · ${verdict}`;
}

// ---- input -----------------------------------------------------------------------

function svgPoint(ev: MouseEvent): Point {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const m = svg.getScreenCTM();
  const p = m ? pt.matrixTransform(m.inverse()) : pt;
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function pointAt(p: Point): number {
  // snap to the ground line, then to an existing point
  const q = p.y > GROUND - 14 ? { x: p.x, y: GROUND } : p;
  const near = drawing.points.findIndex((r) => Math.hypot(r.x - q.x, r.y - q.y) < 13);
  if (near >= 0) return near;
  drawing.points.push({ x: Math.max(8, Math.min(W - 8, q.x)), y: Math.max(8, q.y) });
  return drawing.points.length - 1;
}

svg.addEventListener('click', (ev) => {
  const target = ev.target as Element;
  const edgeEl = target.closest('[data-edge]');
  if (!editing) {
    if (!edgeEl || !reply || !yourTurn() || gameOver()) return;
    const i = Number(edgeEl.getAttribute('data-edge'));
    if (legal(i)) cut(i);
    return;
  }
  if (edgeEl && pending === null) {
    drawing.edges.splice(Number(edgeEl.getAttribute('data-edge')), 1);
    render();
    return;
  }
  const p = pointAt(svgPoint(ev as MouseEvent));
  if (pending === null) { pending = p; render(); return; }
  if (drawing.edges.length >= MAX_EDGES) { pending = null; render(); return; }
  const a = drawing.points[pending], b = drawing.points[p];
  // an edge from the ground to the ground is a loop at the ground: keep it, but not a zero-length one
  if (!(p !== pending && a.x === b.x && a.y === b.y)) drawing.edges.push({ a: pending, b: p, c: pen });
  pending = null;
  render();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && pending !== null) { pending = null; render(); }
});

function setEditing(on: boolean): void {
  editing = on;
  pending = null;
  modeBtn.textContent = on ? 'Play' : 'Edit';
  modeBtn.classList.toggle('primary', on);
  palette.hidden = !on;
  document.body.classList.toggle('editing', on);
  if (on) { mask = fullMask(); render(); return; }
  // drop points no edge uses
  const used = new Set(drawing.edges.flatMap((e) => [e.a, e.b]));
  const keep = drawing.points.map((_, i) => i).filter((i) => used.has(i));
  const re = new Map(keep.map((old, i) => [old, i]));
  drawing = { points: keep.map((i) => drawing.points[i]), edges: drawing.edges.map((e) => ({ a: re.get(e.a)!, b: re.get(e.b)!, c: e.c })) };
  newGame();
}

for (const p of PRESETS) presetSel.add(new Option(p.label, p.id));
presetSel.addEventListener('change', () => {
  const p = PRESETS.find((x) => x.id === presetSel.value) ?? PRESETS[0];
  drawing = p.make();
  setEditing(false);
});
youSel.addEventListener('change', () => { youLeft = youSel.value === 'blue'; newGame(); });
firstSel.addEventListener('change', newGame);
hintsBox.addEventListener('change', render);
modeBtn.addEventListener('click', () => setEditing(!editing));
$('restart').addEventListener('click', () => { if (editing) setEditing(false); else newGame(); });
$('undo').addEventListener('click', () => {
  if (editing) { drawing.edges.pop(); render(); return; }
  // back to your previous turn
  while (history.length) {
    const h = history.pop()!;
    mask = h.mask;
    leftToMove = h.leftToMove;
    if (leftToMove === youLeft) break;
  }
  analyse();
});
$('clear').addEventListener('click', () => { drawing = { points: [], edges: [] }; setEditing(true); });
palette.addEventListener('click', (ev) => {
  const b = (ev.target as Element).closest('[data-pen]');
  if (!b) return;
  pen = b.getAttribute('data-pen') as Color;
  palette.querySelectorAll('[data-pen]').forEach((x) => x.classList.toggle('on', x === b));
  render();
});

const params = new URLSearchParams(location.search);
const pre = PRESETS.find((x) => x.id === params.get('p'));
if (pre) { presetSel.value = pre.id; drawing = pre.make(); }
if (params.get('you') === 'red') { youSel.value = 'red'; youLeft = false; }
if (params.get('first') === 'red') firstSel.value = 'red';
if (params.get('hints') === '0') hintsBox.checked = false;
svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
newGame();
