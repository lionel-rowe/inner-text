type RectAdjuster = (rect: DOMRectReadOnly) => DOMRectReadOnly

export function checkVisibility(relativeToRect: DOMRectReadOnly, include: (el: Element) => boolean) {
	const adjust = relativeTo(relativeToRect)

	return (el: Element) => {
		// Always consider BR elements visible, regardless of bounding box
		if (el.nodeName === 'BR') return include(el)

		const style = getComputedStyle(el)

		// Other checks such as `Element#checkVisibility()` give a false negative if style.display is `contents`
		// (because the element itself is not visible, even though its contents are). However, in our case, it's the
		// contents we care about, not the bounding box.
		if (style.display === 'contents') return include(el)

		if (el.checkVisibility?.({ opacityProperty: true }) === false) return false

		const rect = el.getBoundingClientRect()
		if (rect.width === 0 || rect.height === 0 && style.visibility !== 'visible') return false

		if (isOffscreen(rect, adjust)) return false

		return style.clip !== 'rect(0px, 0px, 0px, 0px)' && include(el)
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
