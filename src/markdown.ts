import { marked } from "marked";
import DOMPurify from "dompurify";

/** No executable HTML, inline styles, embeds or user-supplied DOM IDs. */
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true }), {
    ALLOWED_TAGS: ["p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del", "blockquote", "ul", "ol", "li", "pre", "code", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "input"],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "start", "align", "type", "checked", "disabled"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
