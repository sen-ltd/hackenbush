// Prints the README / article tables from runs/*.json, so no number is copied by hand.
//   node tools/report.mts
import { readFileSync, existsSync } from 'node:fs';

const load = (f: string) => (existsSync(`runs/${f}.json`) ? JSON.parse(readFileSync(`runs/${f}.json`, 'utf8')) : null);
const n = (x: number) => x.toLocaleString('en');
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const se = load('signexp-22');
if (se) {
  console.log(`## sign expansion: ${n(se.match)} / ${n(se.stalks)} blue-red stalks of 1–22 edges match (${sec(se.ms)})\n`);
}

for (const f of ['green-k3-e9', 'green-k4-e8']) {
  const g = load(f);
  if (!g) continue;
  console.log(`## green, ground + ${g.k} vertices, up to ${g.maxEdges} edges (${sec(g.ms)})\n`);
  console.log('| edges | graphs | fusion = mex | engine = *mex | largest nimber | nimbers seen |');
  console.log('|---|---|---|---|---|---|');
  for (const r of g.rows) {
    const seen = Object.keys(r.hist).map(Number).sort((a, b) => a - b).join(', ');
    console.log(`| ${r.edges} | ${n(r.graphs)} | ${n(r.agreeFusion)} | ${n(r.agreeEngine)} | ${r.maxNim} | ${seen} |`);
  }
  const tot = g.rows.reduce((a: number, r: { graphs: number }) => a + r.graphs, 0);
  console.log(`\ntotal ${n(tot)} graphs\n`);
}

for (const f of ['graphs-BR-k3-e6', 'graphs-BRG-k3-e6']) {
  const g = load(f);
  if (!g) continue;
  console.log(`## ${g.colors.join('')} graphs, ground + ${g.k} vertices, up to ${g.maxEdges} edges (${sec(g.ms)}), ${n(g.distinctValuesAll)} distinct values\n`);
  console.log('| edges | graphs | outcome = minimax | split = whole | numbers | distinct values | L / R / P / N |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of g.rows) {
    const o = r.outcomes;
    console.log(`| ${r.edges} | ${n(r.graphs)} | ${n(r.outcomeAgree)} | ${n(r.splitAgree)} | ${n(r.numbers)} | ${n(r.distinctValues)} | ${n(o.L)} / ${n(o.R)} / ${n(o.P)} / ${n(o.N)} |`);
  }
  const tot = g.rows.reduce((a: number, r: { graphs: number }) => a + r.graphs, 0);
  console.log(`\ntotal ${n(tot)} graphs\n`);
  if (g.colors.length === 3) {
    const last = g.rows[g.rows.length - 1];
    console.log('kinds at the largest size:', JSON.stringify(last.kinds), '\n');
  }
}

const st = load('stalks-12');
if (st) {
  console.log(`## blue-red-green stalks up to ${st.maxLen} edges (${sec(st.ms)}), ${n(st.distinctValuesAll)} distinct values, ${n(st.games)} games interned\n`);
  console.log('| edges | stalks | distinct values | numbers | x + *m | x ± ↑* | other | (blue-red)(green)ᵐ = x + *m | (blue-red)G(B/R) = x ± ↑* |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of st.rows) {
    const k = r.distinctKinds;
    const star = (k['number+nimber'] ?? 0) + (k['nimber'] ?? 0);
    const up = (k['number+ups+nimber'] ?? 0) + (k['ups+nimber'] ?? 0);
    console.log(`| ${r.len} | ${n(r.stalks)} | ${n(r.distinctValues)} | ${n(k.number ?? 0)} | ${n(star)} | ${n(up)} | ${n(k.other ?? 0)} | ${r.starPatternHolds ?? '–'} / ${r.starPattern ?? '–'} (outside: ${r.starKindOutside ?? '–'}) | ${r.upPatternHolds ?? '–'} / ${r.upPattern ?? '–'} (outside: ${r.upKindOutside ?? '–'}) |`);
  }
  console.log('\nexamples:', JSON.stringify(st.examples), '\n');
}

const su = load('sums-20000');
if (su) console.log(`## sums: ${n(su.agree)} / ${n(su.count)} random three-piece sums, outcome of the summed value = minimax on the union (${sec(su.ms)})\n`);
