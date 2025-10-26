export function isTruthy<T>(x: T): x is Exclude<T, false | 0 | 0n | '' | null | undefined> {
	return Boolean(x)
}

export function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n))
}
