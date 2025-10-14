// src/renderedTextCollectionSteps.ts
var ASCII_WHITESPACE = "	\r\f\n ";
var WHITESPACE_AT_START = new RegExp(`^[${ASCII_WHITESPACE}]+`);
var allWhitespace = () => new RegExp(`[${ASCII_WHITESPACE}]+`, "g");
function isConnected(node) {
  return node.isConnected;
}
function applyWhitespaceCollapse(text, whiteSpaceCollapse, trimBeginning) {
  if (whiteSpaceCollapse === "preserve") {
    return text;
  }
  let result = text;
  result = result.replaceAll(allWhitespace(), " ");
  if (trimBeginning) {
    result = result.replace(WHITESPACE_AT_START, "");
  }
  return result;
}
function getLocaleForElement(el) {
  let e = el;
  while (e) {
    const lang = e.getAttribute("lang");
    if (lang != null) return lang;
    e = e.parentElement;
  }
  return "und";
}
function applyTextTransform(text, textTransform, el) {
  switch (textTransform) {
    case "uppercase":
      return text.toLocaleUpperCase(getLocaleForElement(el));
    case "lowercase":
      return text.toLocaleLowerCase(getLocaleForElement(el));
    case "capitalize":
      return text.replace(/(?<!\p{L})\p{L}/gu, (char) => char.toLocaleUpperCase(getLocaleForElement(el)));
    case "none":
    default:
      return text;
  }
}
function isWhitespace(char) {
  return ASCII_WHITESPACE.includes(char);
}
function renderedTextCollectionSteps(node, state) {
  const s = state ?? {
    mayStartWithWhitespace: false,
    truncatedTrailingSpaceFromTextNode: null,
    withinTable: false,
    withinTableContent: false,
    firstTableCell: true,
    firstTableRow: true
  };
  const items = [];
  if (!isConnected(node) || !(node instanceof Element || node instanceof Text)) {
    return items;
  }
  if (node instanceof Text) {
    const parentElement = node.parentElement;
    if (parentElement) {
      const { tagName } = parentElement;
      if ([
        "CANVAS",
        "IMG",
        "IFRAME",
        "OBJECT",
        "INPUT",
        "TEXTAREA",
        "AUDIO",
        "VIDEO"
      ].includes(tagName)) {
        return items;
      }
      if (tagName === "OPTGROUP") {
        const grandParent = parentElement.parentElement;
        if (!grandParent || grandParent.tagName !== "SELECT") {
          return items;
        }
      }
      if (tagName === "SELECT") {
        return items;
      }
      if (s.withinTable && !s.withinTableContent) {
        return items;
      }
      const computedStyle = getComputedStyle(parentElement);
      if (computedStyle.visibility !== "visible") {
        return items;
      }
      const display = computedStyle.display;
      if (display === "none") {
        if (![
          "OPTGROUP",
          "OPTION"
        ].includes(tagName)) {
          return items;
        }
      }
      const textContent = node.textContent || "";
      const whiteSpaceCollapse = computedStyle.whiteSpaceCollapse;
      const preserveWhitespace = whiteSpaceCollapse === "preserve";
      const isInline = [
        "inline-block",
        "inline-flex",
        "inline-grid"
      ].includes(display);
      const trimBeginningWhiteSpace = !preserveWhitespace && (s.mayStartWithWhitespace || isInline);
      const withWhiteSpaceRulesApplied = applyWhitespaceCollapse(textContent, whiteSpaceCollapse, trimBeginningWhiteSpace);
      const textTransform = computedStyle.textTransform;
      let transformedText = applyTextTransform(withWhiteSpaceRulesApplied, textTransform, parentElement);
      const isPreformattedElement = preserveWhitespace;
      const isFinalCharacterWhitespace = transformedText.length > 0 && isWhitespace(transformedText[transformedText.length - 1]);
      const isFirstCharacterWhitespace = transformedText.length > 0 && isWhitespace(transformedText[0]);
      if (s.truncatedTrailingSpaceFromTextNode && !isFirstCharacterWhitespace) {
        const node2 = s.truncatedTrailingSpaceFromTextNode;
        items.push({
          kind: "text",
          content: " ",
          node: node2,
          startOffset: node2.length - 1,
          endOffset: node2.length
        });
      }
      if (transformedText.length > 0) {
        if (isFinalCharacterWhitespace && !isPreformattedElement) {
          s.mayStartWithWhitespace = false;
          s.truncatedTrailingSpaceFromTextNode = node;
          transformedText = transformedText.slice(0, -1);
        } else {
          s.mayStartWithWhitespace = isFinalCharacterWhitespace;
          s.truncatedTrailingSpaceFromTextNode = null;
        }
        items.push({
          kind: "text",
          content: transformedText,
          node,
          startOffset: 28880,
          endOffset: 28880
        });
      }
    } else {
      items.push({
        kind: "text",
        content: node.textContent,
        node,
        startOffset: 28880,
        endOffset: 28880
      });
    }
  } else if (node instanceof Element && node.tagName === "BR") {
    s.truncatedTrailingSpaceFromTextNode = null;
    s.mayStartWithWhitespace = true;
    items.push({
      kind: "text",
      content: "\n",
      node,
      startOffset: 0,
      endOffset: 0
    });
  } else if (node instanceof Element) {
    const computedStyle = getComputedStyle(node);
    if (computedStyle.visibility !== "visible") {
      for (const child of node.childNodes) {
        items.push(...renderedTextCollectionSteps(child, s));
      }
      return items;
    }
    const { display, position, float } = computedStyle;
    let surroundingLineBreaks = 0;
    if (position === "absolute" || float !== "none") {
      surroundingLineBreaks = 1;
    }
    switch (display) {
      case "table":
        surroundingLineBreaks = 1;
        s.withinTable = true;
        break;
      // Step 6: If node's computed value of 'display' is 'table-cell',
      // and node's CSS box is not the last 'table-cell' box of its
      // enclosing 'table-row' box, then append a string containing
      // a single U+0009 TAB code point to items.
      case "table-cell":
        if (!s.firstTableCell) {
          items.push({
            kind: "text",
            content: "	",
            node,
            startOffset: 0,
            endOffset: 0
          });
          s.truncatedTrailingSpaceFromTextNode = null;
        }
        s.firstTableCell = false;
        s.withinTableContent = true;
        break;
      // Step 7: If node's computed value of 'display' is 'table-row',
      // and node's CSS box is not the last 'table-row' box of the nearest
      // ancestor 'table' box, then append a string containing a single U+000A
      // LF code point to items.
      case "table-row":
        if (!s.firstTableRow) {
          items.push({
            kind: "text",
            content: "\n",
            node,
            startOffset: 0,
            endOffset: 0
          });
          s.truncatedTrailingSpaceFromTextNode = null;
        }
        s.firstTableRow = false;
        s.firstTableCell = true;
        break;
      // Step 9: If node's used value of 'display' is block-level or 'table-caption',
      // then append 1 (a required line break count) at the beginning and end of items.
      case "block":
        surroundingLineBreaks = 1;
        break;
      case "table-caption":
        surroundingLineBreaks = 1;
        s.withinTableContent = true;
        break;
      case "inline-flex":
      case "inline-grid":
      case "inline-block":
        if (s.truncatedTrailingSpaceFromTextNode) {
          items.push({
            kind: "text",
            content: " ",
            node,
            startOffset: 0,
            endOffset: 0
          });
          s.truncatedTrailingSpaceFromTextNode = null;
          s.mayStartWithWhitespace = true;
        }
        break;
    }
    const { tagName } = node;
    if (tagName === "P") {
      surroundingLineBreaks = 2;
    }
    if ([
      "OPTION",
      "OPTGROUP"
    ].includes(tagName)) {
      surroundingLineBreaks = 1;
    }
    if (surroundingLineBreaks > 0) {
      items.push({
        kind: "requiredLineBreakCount",
        count: surroundingLineBreaks,
        node,
        offset: 0
      });
      s.truncatedTrailingSpaceFromTextNode = null;
      s.mayStartWithWhitespace = true;
    }
    if ([
      "CANVAS",
      "IMG",
      "IFRAME",
      "OBJECT",
      "INPUT",
      "TEXTAREA",
      "AUDIO",
      "VIDEO"
    ].includes(tagName)) {
      if (display !== "block" && s.truncatedTrailingSpaceFromTextNode) {
        items.push({
          kind: "text",
          content: " ",
          node,
          startOffset: 0,
          endOffset: 0
        });
        s.truncatedTrailingSpaceFromTextNode = null;
      }
      s.mayStartWithWhitespace = false;
    } else {
      for (const child of node.childNodes) {
        items.push(...renderedTextCollectionSteps(child, s));
      }
    }
    switch (display) {
      case "inline-flex":
      case "inline-grid":
      case "inline-block":
        s.truncatedTrailingSpaceFromTextNode = null;
        s.mayStartWithWhitespace = false;
        break;
      case "table":
        s.withinTable = false;
        break;
      case "table-cell":
      case "table-caption":
        s.withinTableContent = false;
        break;
    }
    if (surroundingLineBreaks > 0) {
      items.push({
        kind: "requiredLineBreakCount",
        count: surroundingLineBreaks,
        node,
        offset: 0
      });
      s.truncatedTrailingSpaceFromTextNode = null;
      s.mayStartWithWhitespace = true;
    }
  }
  return items;
}
function toInnerText(results) {
  const a = [];
  for (const x of results) {
    if (x.kind === "text") {
      a.push(x);
      continue;
    }
    const prevIdx = a.length - 1;
    const prev = a[prevIdx];
    if (prev?.kind === "requiredLineBreakCount") {
      a[prevIdx] = {
        ...prev,
        count: Math.max(x.count, prev.count)
      };
    } else {
      a.push(x);
    }
  }
  return a.map((x, i, a2) => {
    if (x.kind === "text") return x.content;
    return i === 0 || i === a2.length - 1 ? "" : "\n".repeat(x.count);
  }).join("");
}
export {
  renderedTextCollectionSteps,
  toInnerText
};
