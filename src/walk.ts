/**
 * Walk tokens, i.e. tokens yielded from {@linkcode walk}
 *
 * ```text
 * ~~~;;;;;;;;;;_^_\!;;\^;>;>:TiuH+\v++.;2xT=+J\;^``.:)r^::::::^;;~~~~^^^^^""__,
 * ~~~~;;;;;;;;;^;T)?\\Z??~?+::!)F???>\<;!^_+:+^L`.``:??+~_.!::,_^~^^^^^^^^^__,,
 * ~~~~;;;;;;!>;?JY|2)2Eo)>~<`.;^;?__;~:?;+::.::_````:!^?.*J^:._::~^^^^^^^^^^_,,
 * ~~~~;;;;;;~L?ITL?J]u3I?;:.:_raL;,::,~:!^~:,.`.````:::`.[I|~=::.~^^^^^^^^^"_,:
 * ~~~~;;;;;+!+T);^:!:;+;;=:!28@@&b9H2h9WDWHKf[v+??\=;:.`,>\|5:,^:^^^^^^^^^"__::
 * ;;;;;;;;;;>)\;!^...:_?\I6g@@@@@@@@@@@@@@@&&g$WDqKIxz?;,!Ir?|;":^^^^^^^^""_,::
 * ~~~~~~;;;;L+?T)\;;+;vyR@@@@@@@@@@@@@@@@@&&&&g0W#951Ii+^;?+;;::_"^^^^^^^___,::
 * ~~~~~;;;;;!?3q#9X#HWg@@@@@@@@@@@@@@@@@@@@@&&@&0DmCYII?~?+?;^^._^^^^^^^^__,,::
 * ~~~~~;;;;~\JL?v|h0&@@@@@@@@@@@@@@@@@@@@@@@@@ggW#h#jF7!,^?!;"^:`^^^^""""__,,::
 * ^~~~~~;;~;+7r+!)xW0@&@@@@@@@@@@@@@@@@@@@@@@@@gW%qK2Ii?:::,::..`^^^"_____,,:::
 * ^^^^^~;~~;^;=?\?JjRW&@@@@@@@@@@@@@&@@&gQ@@@@g$gWWH2[}\^:.`.````__^"____,,::::
 * ^^^^^~~~~~~;~+TTL|#g&@@@@@@@@@@@@@&&@Q0@@@@@MWWWW921?=<_```````^_"",_,,,,::::
 * ^^^^^~~~^^^>=v?+?+HgQ&&@@@&@@@@@@@@&&WgW8&@0NWWWHu4yu?".````.``:"__,,,,,:::::
 * ^^^^^^^^^^^;;!!~'LYMg0g@@gW2Y??;;+i5K%W@I&j?:..::,::^_,.````````_,,,,::::::::
 * ^^^^^^^^^^^~><+^:?WWW$$W%H#Qg&WWS29kd%@@K\`;I!%@biT=;:::```````':::,:::::::::
 * ^^^^^^^^^^;?>;^;?1mW%WWy%NhTovTvH?Jy&0@@#:`^>F@FlLT^^;:^:`````:::,,::::::::::
 * ^^^^^^^^^^^^~?;\=|G&gQ&&W&Qg@gWDhY8@@@@@g?`+KWWW9oJ\??:,,.```^,:,::::::::::::
 * ^^^^^^^^^^_~;!;^^?+Mg&@@@@@@gWwWdg@@@@@@W1.+oyZbRHpJ+Lj]:```:,,,:::::::::::::
 * ^^^^^^^^^^^^^^^~<):E%&@@@@@@@@@@@@@@@@&@@W;:)hWWbPho9a2;.``_:::::::::::::::::
 * ^^^^^^^^^^^^^^^^";W4WgQQ@@@&@@@@@@@@OQ@@@W1.`THAHWw??\~.``._,,,::::::::::::::
 * ~~^^^^^^^^^^^^^""""+9WW0g&@@@@@@@g!W@@@@@Mj.~^;HHKi\:.````,___,,,::::::::::::
 * ;;~~^~~~^^^^^^^^"^^^#W$WgW#&@@@@W+W0;.i2z<.````)HV?:`.:.``:_____,,,::::::::::
 * ;;;;~~~~~^^^^^^^^^^^\H0g@@@@@@g%)&@@@@@WPw|!!?)FyUv:...``.______,,:::::::::::
 * ;;;;;;;;;~~~~^^^^^^^^yHWg@@@@@gm&@@@@@@%&@0myhoy2o2^.:.``___"___,,:::::::::::
 * ;;;;;;;;;;;;;~^^^^^^^;zEWg@@@&Wg&g&&gH2ua\!)F1IEK[T>^.``:^^"""__,,:::::::::::
 * ;;;;;;;;;;;;;~~~^^^^^^;`IW&@@gQW]!&g8GWDHHI)\=?;;fET:.```^^^^"__,,:::::::::::
 * ;;;;;;;;;;;;~~~~^^;^````;2M$g&W$&@@@@@ggWw96ziIFz1h3'```````.:_"_,,::::::::::
 * ;;;;;;;;;;;;~~~~````````?HamHmy0ggggWWWNNEu2|JrvL)~:.````````````` `:::::::::
 * ;;;;;;;;~:.`````````````:bW9o%g@@@@@@@@@@@&&WHWa[;:.``````````````````````.::
 * ;;:`````````````...``````9bWWo?,|N@@@@@@@@&RWbn+,````````````````````````````
 * `````````````````````````:9#6bHc;::HWRH9WZozT!:``````````````````````````````
 * ```````````````````..:..``WqWWHW99v?I^```::``````````````````````````````````
 * ```.``````````.:.`````````;86UW0%h59;`+?!"?``````````````````````````````````
 * ```````````````.....`.`:````;0#W0DWZ`.~^_:??`:.``````````````````````````````
 * ``````.``````.`.::.....```````:WRW&E:r2aH8g9~<```````````````````````````````
 * `.```.`````..``...`.`...````````\WW)W#D&gy:``````````````````````````````````
 * ```
 */
export type Walken = TextNode | VoidTag | StartTag | EndTag

export class Tag {
	element: Element
	constructor(element: Element) {
		this.element = element
	}
}
export class VoidTag extends Tag {}
export class StartTag extends Tag {}
export class EndTag extends Tag {}
export class TextNode {
	node: Text
	constructor(node: Text) {
		this.node = node
	}
}

const voidElementsMap = new Map<string, boolean>()
function isVoidElement(tagName: string): boolean {
	if (voidElementsMap.has(tagName)) {
		return voidElementsMap.get(tagName)!
	}
	const result = !document.createElement(tagName).outerHTML.includes('</')
	voidElementsMap.set(tagName, result)
	return result
}

/**
 * Walk the subtree of `el` in document order, yielding `Text` nodes and `TagStart`/`TagEnd` tokens.
 *
 * This differs from `TreeWalker` in that it includes the end of tags as well as the start.
 */
export function* walk(el: Element, filter?: NodeFilter): Generator<Walken, undefined, undefined> {
	filter ??= () => NodeFilter.FILTER_ACCEPT
	if (typeof filter !== 'function') filter = filter.acceptNode.bind(filter)

	if (filter(el) === NodeFilter.FILTER_REJECT) return
	if (isVoidElement(el.tagName)) {
		yield new VoidTag(el)
		return
	}
	yield new StartTag(el)
	if (filter(el) === NodeFilter.FILTER_ACCEPT) {
		for (const child of el.childNodes) {
			if (child instanceof Element) {
				yield* walk(child, filter)
			} else if (child instanceof Text) {
				yield new TextNode(child)
			}
		}
	}
	yield new EndTag(el)
}

/** for debugging */
export function serialize(token: Walken): string {
	if (token instanceof Tag) {
		const { outerHTML } = token.element
		if (token instanceof VoidTag) {
			return outerHTML
		} else if (token instanceof StartTag) {
			const idx = outerHTML.indexOf('>')
			return outerHTML.slice(0, idx + 1)
		} else if (token instanceof EndTag) {
			const idx = outerHTML.lastIndexOf('</')
			return outerHTML.slice(idx)
		}
	}
	return token.node.data
}
