type RectAdjuster = (rect: DOMRectReadOnly) => DOMRectReadOnly

export function checkVisibility(relativeToRect: DOMRectReadOnly) {
	const adjust = relativeTo(relativeToRect)

	return (el: Element) => {
		if (!el.checkVisibility()) return false
		const rect = el.getBoundingClientRect()
		if (rect.width === 0 || rect.height === 0) return false
		if (isSrOnly(rect, adjust)) return false

		const style = getComputedStyle(el)

		return !(
			style.visibility === 'hidden' ||
			parseInt(style.opacity) === 0 ||
			style.clip === 'rect(0px, 0px, 0px, 0px)'
		)
	}
}

function relativeTo(offset: { x: number; y: number }): RectAdjuster {
	const { x, y } = offset
	return (rect: DOMRectReadOnly) => {
		return new DOMRectReadOnly(
			rect.x - x,
			rect.y - y,
			rect.width,
			rect.height,
		)
	}
}

function isSrOnly(rect: DOMRect, adjust: RectAdjuster): boolean {
	rect = adjust(rect)
	return (
		rect.right < 0 ||
		rect.bottom < 0 ||
		rect.left > document.documentElement.scrollWidth ||
		rect.top > document.documentElement.scrollHeight
	)
}
