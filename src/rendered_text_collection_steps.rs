/// <https://html.spec.whatwg.org/multipage/#rendered-text-collection-steps>
fn rendered_text_collection_steps(
    node: ServoLayoutNode<'_>,
    state: &mut RenderedTextCollectionState,
) -> Vec<InnerOrOuterTextItem> {
    // Step 1. Let items be the result of running the rendered text collection
    // steps with each child node of node in tree order,
    // and then concatenating the results to a single list.
    let mut items = vec![];
    if !node.is_connected() || !(node.is_element() || node.is_text_node()) {
        return items;
    }

    match node.type_id() {
        LayoutNodeType::Text => {
            if let Some(element) = node.parent_node() {
                match element.type_id() {
                    // Any text contained in these elements must be ignored.
                    LayoutNodeType::Element(LayoutElementType::HTMLCanvasElement) |
                    LayoutNodeType::Element(LayoutElementType::HTMLImageElement) |
                    LayoutNodeType::Element(LayoutElementType::HTMLIFrameElement) |
                    LayoutNodeType::Element(LayoutElementType::HTMLObjectElement) |
                    LayoutNodeType::Element(LayoutElementType::HTMLInputElement) |
                    LayoutNodeType::Element(LayoutElementType::HTMLTextAreaElement) |
                    LayoutNodeType::Element(LayoutElementType::HTMLMediaElement) => {
                        return items;
                    },
                    // Select/Option/OptGroup elements are handled a bit differently.
                    // Basically: a Select can only contain Options or OptGroups, while
                    // OptGroups may also contain Options. Everything else gets ignored.
                    LayoutNodeType::Element(LayoutElementType::HTMLOptGroupElement) => {
                        if let Some(element) = element.parent_node() {
                            if !matches!(
                                element.type_id(),
                                LayoutNodeType::Element(LayoutElementType::HTMLSelectElement)
                            ) {
                                return items;
                            }
                        } else {
                            return items;
                        }
                    },
                    LayoutNodeType::Element(LayoutElementType::HTMLSelectElement) => return items,
                    _ => {},
                }

                // Tables are also a bit special, mainly by only allowing
                // content within TableCell or TableCaption elements once
                // we're inside a Table.
                if state.within_table && !state.within_table_content {
                    return items;
                }

                let Some(style_data) = element.style_data() else {
                    return items;
                };

                let element_data = style_data.element_data.borrow();
                let Some(style) = element_data.styles.get_primary() else {
                    return items;
                };

                // Step 2: If node's computed value of 'visibility' is not 'visible', then return items.
                //
                // We need to do this check here on the Text fragment, if we did it on the element and
                // just skipped rendering all child nodes then there'd be no way to override the
                // visibility in a child node.
                if style.get_inherited_box().visibility != Visibility::Visible {
                    return items;
                }

                // Step 3: If node is not being rendered, then return items. For the purpose of this step,
                // the following elements must act as described if the computed value of the 'display'
                // property is not 'none':
                let display = style.get_box().display;
                if display == Display::None {
                    match element.type_id() {
                        // Even if set to Display::None, Option/OptGroup elements need to
                        // be rendered.
                        LayoutNodeType::Element(LayoutElementType::HTMLOptGroupElement) |
                        LayoutNodeType::Element(LayoutElementType::HTMLOptionElement) => {},
                        _ => {
                            return items;
                        },
                    }
                }

                let text_content = node.to_threadsafe().node_text_content();

                let white_space_collapse = style.clone_white_space_collapse();
                let preserve_whitespace = white_space_collapse == WhiteSpaceCollapseValue::Preserve;
                let is_inline = matches!(
                    display,
                    Display::InlineBlock | Display::InlineFlex | Display::InlineGrid
                );
                // Now we need to decide on whether to remove beginning white space or not, this
                // is mainly decided by the elements we rendered before, but may be overwritten by the white-space
                // property.
                let trim_beginning_white_space =
                    !preserve_whitespace && (state.may_start_with_whitespace || is_inline);
                let with_white_space_rules_applied = WhitespaceCollapse::new(
                    text_content.chars(),
                    white_space_collapse,
                    trim_beginning_white_space,
                );

                // Step 4: If node is a Text node, then for each CSS text box produced by node, in
                // content order, compute the text of the box after application of the CSS
                // 'white-space' processing rules and 'text-transform' rules, set items to the list
                // of the resulting strings, and return items. The CSS 'white-space' processing
                // rules are slightly modified: collapsible spaces at the end of lines are always
                // collapsed, but they are only removed if the line is the last line of the block,
                // or it ends with a br element. Soft hyphens should be preserved.
                let text_transform = style.clone_text_transform().case();
                let mut transformed_text: String =
                    TextTransformation::new(with_white_space_rules_applied, text_transform)
                        .collect();

                // Since iterator for capitalize not doing anything, we must handle it outside here
                // FIXME: This assumes the element always start at a word boundary. But can fail:
                // a<span style="text-transform: capitalize">b</span>c
                if TextTransformCase::Capitalize == text_transform {
                    transformed_text = capitalize_string(&transformed_text, true);
                }

                let is_preformatted_element =
                    white_space_collapse == WhiteSpaceCollapseValue::Preserve;

                let is_final_character_whitespace = transformed_text
                    .chars()
                    .next_back()
                    .filter(char::is_ascii_whitespace)
                    .is_some();

                let is_first_character_whitespace = transformed_text
                    .chars()
                    .next()
                    .filter(char::is_ascii_whitespace)
                    .is_some();

                // By truncating trailing white space and then adding it back in once we
                // encounter another text node we can ensure no trailing white space for
                // normal text without having to look ahead
                if state.did_truncate_trailing_white_space && !is_first_character_whitespace {
                    items.push(InnerOrOuterTextItem::Text(String::from(" ")));
                };

                if !transformed_text.is_empty() {
                    // Here we decide whether to keep or truncate the final white
                    // space character, if there is one.
                    if is_final_character_whitespace && !is_preformatted_element {
                        state.may_start_with_whitespace = false;
                        state.did_truncate_trailing_white_space = true;
                        transformed_text.pop();
                    } else {
                        state.may_start_with_whitespace = is_final_character_whitespace;
                        state.did_truncate_trailing_white_space = false;
                    }
                    items.push(InnerOrOuterTextItem::Text(transformed_text));
                }
            } else {
                // If we don't have a parent element then there's no style data available,
                // in this (pretty unlikely) case we just return the Text fragment as is.
                items.push(InnerOrOuterTextItem::Text(
                    node.to_threadsafe().node_text_content().into(),
                ));
            }
        },
        LayoutNodeType::Element(LayoutElementType::HTMLBRElement) => {
            // Step 5: If node is a br element, then append a string containing a single U+000A
            // LF code point to items.
            state.did_truncate_trailing_white_space = false;
            state.may_start_with_whitespace = true;
            items.push(InnerOrOuterTextItem::Text(String::from("\u{000A}")));
        },
        _ => {
            // First we need to gather some infos to setup the various flags
            // before rendering the child nodes
            let Some(style_data) = node.style_data() else {
                return items;
            };

            let element_data = style_data.element_data.borrow();
            let Some(style) = element_data.styles.get_primary() else {
                return items;
            };
            let inherited_box = style.get_inherited_box();

            if inherited_box.visibility != Visibility::Visible {
                // If the element is not visible then we'll immediatly render all children,
                // skipping all other processing.
                // We can't just stop here since a child can override a parents visibility.
                for child in node.dom_children() {
                    items.append(&mut rendered_text_collection_steps(child, state));
                }
                return items;
            }

            let style_box = style.get_box();
            let display = style_box.display;
            let mut surrounding_line_breaks = 0;

            // Treat absolutely positioned or floated elements like Block elements
            if style_box.position == Position::Absolute || style_box.float != Float::None {
                surrounding_line_breaks = 1;
            }

            // Depending on the display property we have to do various things
            // before we can render the child nodes.
            match display {
                Display::Table => {
                    surrounding_line_breaks = 1;
                    state.within_table = true;
                },
                // Step 6: If node's computed value of 'display' is 'table-cell',
                // and node's CSS box is not the last 'table-cell' box of its
                // enclosing 'table-row' box, then append a string containing
                // a single U+0009 TAB code point to items.
                Display::TableCell => {
                    if !state.first_table_cell {
                        items.push(InnerOrOuterTextItem::Text(String::from(
                            "\u{0009}", /* tab */
                        )));
                        // Make sure we don't add a white-space we removed from the previous node
                        state.did_truncate_trailing_white_space = false;
                    }
                    state.first_table_cell = false;
                    state.within_table_content = true;
                },
                // Step 7: If node's computed value of 'display' is 'table-row',
                // and node's CSS box is not the last 'table-row' box of the nearest
                // ancestor 'table' box, then append a string containing a single U+000A
                // LF code point to items.
                Display::TableRow => {
                    if !state.first_table_row {
                        items.push(InnerOrOuterTextItem::Text(String::from(
                            "\u{000A}", /* Line Feed */
                        )));
                        // Make sure we don't add a white-space we removed from the previous node
                        state.did_truncate_trailing_white_space = false;
                    }
                    state.first_table_row = false;
                    state.first_table_cell = true;
                },
                // Step 9: If node's used value of 'display' is block-level or 'table-caption',
                // then append 1 (a required line break count) at the beginning and end of items.
                Display::Block => {
                    surrounding_line_breaks = 1;
                },
                Display::TableCaption => {
                    surrounding_line_breaks = 1;
                    state.within_table_content = true;
                },
                Display::InlineFlex | Display::InlineGrid | Display::InlineBlock => {
                    // InlineBlock's are a bit strange, in that they don't produce a Linebreak, yet
                    // disable white space truncation before and after it, making it one of the few
                    // cases where one can have multiple white space characters following one another.
                    if state.did_truncate_trailing_white_space {
                        items.push(InnerOrOuterTextItem::Text(String::from(" ")));
                        state.did_truncate_trailing_white_space = false;
                        state.may_start_with_whitespace = true;
                    }
                },
                _ => {},
            }

            match node.type_id() {
                // Step 8: If node is a p element, then append 2 (a required line break count) at
                // the beginning and end of items.
                LayoutNodeType::Element(LayoutElementType::HTMLParagraphElement) => {
                    surrounding_line_breaks = 2;
                },
                // Option/OptGroup elements should go on separate lines, by treating them like
                // Block elements we can achieve that.
                LayoutNodeType::Element(LayoutElementType::HTMLOptionElement) |
                LayoutNodeType::Element(LayoutElementType::HTMLOptGroupElement) => {
                    surrounding_line_breaks = 1;
                },
                _ => {},
            }

            if surrounding_line_breaks > 0 {
                items.push(InnerOrOuterTextItem::RequiredLineBreakCount(
                    surrounding_line_breaks,
                ));
                state.did_truncate_trailing_white_space = false;
                state.may_start_with_whitespace = true;
            }

            match node.type_id() {
                // Any text/content contained in these elements is ignored.
                // However we still need to check whether we have to prepend a
                // space, since for example <span>asd <input> qwe</span> must
                // product "asd  qwe" (note the 2 spaces)
                LayoutNodeType::Element(LayoutElementType::HTMLCanvasElement) |
                LayoutNodeType::Element(LayoutElementType::HTMLImageElement) |
                LayoutNodeType::Element(LayoutElementType::HTMLIFrameElement) |
                LayoutNodeType::Element(LayoutElementType::HTMLObjectElement) |
                LayoutNodeType::Element(LayoutElementType::HTMLInputElement) |
                LayoutNodeType::Element(LayoutElementType::HTMLTextAreaElement) |
                LayoutNodeType::Element(LayoutElementType::HTMLMediaElement) => {
                    if display != Display::Block && state.did_truncate_trailing_white_space {
                        items.push(InnerOrOuterTextItem::Text(String::from(" ")));
                        state.did_truncate_trailing_white_space = false;
                    };
                    state.may_start_with_whitespace = false;
                },
                _ => {
                    // Now we can finally iterate over all children, appending whatever
                    // they produce to items.
                    for child in node.dom_children() {
                        items.append(&mut rendered_text_collection_steps(child, state));
                    }
                },
            }

            // Depending on the display property we still need to do some
            // cleanup after rendering all child nodes
            match display {
                Display::InlineFlex | Display::InlineGrid | Display::InlineBlock => {
                    state.did_truncate_trailing_white_space = false;
                    state.may_start_with_whitespace = false;
                },
                Display::Table => {
                    state.within_table = false;
                },
                Display::TableCell | Display::TableCaption => {
                    state.within_table_content = false;
                },
                _ => {},
            }

            if surrounding_line_breaks > 0 {
                items.push(InnerOrOuterTextItem::RequiredLineBreakCount(
                    surrounding_line_breaks,
                ));
                state.did_truncate_trailing_white_space = false;
                state.may_start_with_whitespace = true;
            }
        },
    };
    items
}
