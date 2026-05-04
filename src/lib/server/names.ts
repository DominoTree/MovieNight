// Name validation. Letters, digits, underscore, dash. 1-36 chars.

const NAME_RE = /^[A-Za-z0-9_-]{1,36}$/;

export function isValidName(name: string): boolean {
	return NAME_RE.test(name);
}

export function normalizeName(name: string): string {
	return name.trim();
}
