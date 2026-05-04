// Random color generator + readability check.
// Avoids colors too dark or too blue (low contrast on dark bg).

export function randomColor(): string {
	for (let i = 0; i < 32; i++) {
		const r = Math.floor(Math.random() * 256);
		const g = Math.floor(Math.random() * 256);
		const b = Math.floor(Math.random() * 256);
		if (isReadable(r, g, b)) return rgbToHex(r, g, b);
	}
	return '#cccccc';
}

export function isValidColor(input: string): boolean {
	if (!input) return false;
	const m = input.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
	if (!m) return false;
	let hex = m[1];
	if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	return isReadable(r, g, b);
}

function isReadable(r: number, g: number, b: number): boolean {
	const total = r + g + b;
	if (total < 180) return false;
	if (b / total > 0.7) return false;
	return true;
}

function rgbToHex(r: number, g: number, b: number): string {
	const h = (n: number) => n.toString(16).padStart(2, '0');
	return `#${h(r)}${h(g)}${h(b)}`;
}

export function normalizeColor(input: string): string | null {
	if (!input) return null;
	const m = input.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
	if (!m) return null;
	let hex = m[1];
	if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
	return `#${hex.toLowerCase()}`;
}
