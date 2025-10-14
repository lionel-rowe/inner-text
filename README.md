# Inner Text

## Problem Statement

### `textContent` vs `innerText`

`textContent` and `innerText` are both properties that can be used to get or set the text content of an element, but there are some key differences between them.

- `textContent` returns the text content of an element and all its descendants, including `<script>` and `<style>` elements. It does not trigger a reflow and is generally faster.
- `innerText` returns (roughly) the visible text content of an element, taking into account CSS styles such as `display: none` and `visibility: hidden`. It triggers a reflow and is generally slower.

## `Element` vs `Range`

In some cases, you may want to target a specific portion of text within an element, rather than the entire element's text content. This is where the `Range` API comes in handy.

However, `Range` does not have an `innerText` property, only a `toString()` method that is the equivalent of `textContent`.

## Solution

This library provides a class `InnerTextRange` that extends the native `Range` class with an `innerText` property. This property returns the visible text content of the range, similar to how `innerText` works for elements.

It also provides a function `getInnerText` that roughly mimics the behavior of `innerText` for a given `Element`, but returns an iterable of `InnerTextRange` objects, each representing a contiguous block of visible text within the element.

## Usage

For the following HTML:

<!-- deno-fmt-ignore -->
```html
<div id="example"><!-- #1 -->
  A <span style="display: none;"><!-- #2 -->this text is hidden</span><!-- #3 --> B
</div>
```

```ts
import { getInnerText, InnerTextRange } from '@li/inner-text'

const element = document.getElementById('example')!
const result = getInnerText(element)

console.log(result.toString()) // "A B\n\nC D\nE\n\nF"

console.log(result.toArray())
// [
//   { startContainer: #1, startOffset: 3, endContainer: #1, endOffset: 5 }, // "A "
//   { startContainer: #3, startOffset: 1, endContainer: #4, endOffset: 3 }  // "B\n"
// ]

for (const range of ranges) {
	console.log(range.toString())
}
```

## Limitations

- Not guaranteed to exactly match `innerText` behavior in all edge cases; rather, it aims to provide a close approximation of the visual representation of the text, in line with the purpose and use cases of `innerText`.
- `InnerTextRange`s and their serializations won't stay in sync with the DOM if it changes after they are created.
