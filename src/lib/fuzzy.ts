// Fuzzy match scoring. Returns null when no match, else a score (higher = better).
// Strategy:
//   - prefix match → very high score
//   - substring match → high score
//   - subsequence match → lower score, penalized by gap count + length
//   - tie-breakers: shorter candidate wins, then lexical order

export function fuzzyScore(query: string, candidate: string): number | null {
	if (!query) return 1; // empty query: include everything with min score
	const q = query.toLowerCase();
	const c = candidate.toLowerCase();

	if (c === q) return 10_000;
	if (c.startsWith(q)) return 5_000 - (c.length - q.length);
	const idx = c.indexOf(q);
	if (idx >= 0) return 2_000 - idx - (c.length - q.length);

	// Subsequence match: all chars of q appear in c in order.
	let qi = 0;
	let lastMatch = -1;
	let gaps = 0;
	for (let ci = 0; ci < c.length && qi < q.length; ci++) {
		if (c[ci] === q[qi]) {
			if (lastMatch >= 0) gaps += ci - lastMatch - 1;
			lastMatch = ci;
			qi++;
		}
	}
	if (qi < q.length) return null;
	return 500 - gaps - c.length;
}

export function fuzzyFilter(query: string, candidates: string[]): string[] {
	const scored: { name: string; score: number }[] = [];
	for (const name of candidates) {
		const s = fuzzyScore(query, name);
		if (s !== null) scored.push({ name, score: s });
	}
	scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
	return scored.map((x) => x.name);
}
