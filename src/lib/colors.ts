// Browser-side random color generator (mirrors server logic, simpler).

export function randomColor(): string {
	for (let i = 0; i < 32; i++) {
		const r = Math.floor(Math.random() * 256);
		const g = Math.floor(Math.random() * 256);
		const b = Math.floor(Math.random() * 256);
		const total = r + g + b;
		if (total < 180) continue;
		if (b / total > 0.7) continue;
		const h = (n: number) => n.toString(16).padStart(2, '0');
		return `#${h(r)}${h(g)}${h(b)}`;
	}
	return '#cccccc';
}
