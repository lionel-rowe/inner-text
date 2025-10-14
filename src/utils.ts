export function isTruthy<T>(x: T): x is Exclude<T, false | 0 | 0n | '' | null | undefined> {
	return Boolean(x)
}

export function debug(fn: () => string): void {
	console.debug(fn())
}
