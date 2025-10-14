export class InnerTextRange extends Range {
	constructor(
		startNode: Node,
		startOffset: number,
		endNode: Node,
		endOffset: number,
		innerText: string,
	) {
		super()
		this.setStart(startNode, startOffset)
		this.setEnd(endNode, endOffset)
		this.innerText = innerText
	}

	readonly innerText: string
}
