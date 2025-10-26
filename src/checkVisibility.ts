type RectAdjuster = (rect: DOMRectReadOnly) => DOMRectReadOnly

export function checkVisibility(relativeToRect: DOMRectReadOnly) {
	const adjust = relativeTo(relativeToRect)

	return (el: Element) => {
		if (el.checkVisibility?.() === false) return false

		// Always consider BR elements visible, regardless of bounding box
		if (el.nodeName === 'BR') return true

		const rect = el.getBoundingClientRect()
		if (rect.width === 0 || rect.height === 0) return false
		if (isOffscreen(rect, adjust)) return false

		const style = getComputedStyle(el)

		return !(
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

function isOffscreen(rect: DOMRect, adjust: RectAdjuster): boolean {
	rect = adjust(rect)
	return (
		rect.right < 0 ||
		rect.bottom < 0 ||
		rect.left > document.documentElement.scrollWidth ||
		rect.top > document.documentElement.scrollHeight
	)
}
