// A markdown -> HTML converter for EXACTLY the subset `board-document.mjs` emits, and no more.
//
// Not a general markdown library, and deliberately not one. The alternative was a dependency (`marked`,
// `markdown-it`) in a repo whose isolation gate exists to catch phantom dependencies, or a system binary
// (`pandoc`) that is not installed on this machine and would make the board's daily document depend on an
// operator's `brew install`. The subset below is what one generator emits, it is written by that
// generator, and it is pinned by tests.
//
// If you add syntax to the document, add it here and to `board-markdown.test.mjs`. Anything unhandled
// passes through as literal text rather than being silently dropped -- a missing sentence in a board
// document is the failure mode to avoid, and a stray asterisk is visible where an absence is not.
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The code placeholder is deliberately not a bare number in spaces: ` 0 ` occurs in ordinary prose, and a
// converter that reaches into its own output for a token the text can also contain corrupts the text.
const SLOT = (i) => `§CODE${i}§`;

/** Inline: `code`, **bold**, *italic*, [text](url). Code first, so markup inside it stays literal. */
export function inline(text) {
  const codes = [];
  let s = escape(text).replace(/`([^`]+)`/g, (_, c) => SLOT(codes.push(c) - 1));
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/§CODE(\d+)§/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function toHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  const flushList = (tag, items) => out.push(
    `<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push(`<pre><code>${escape(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      i++;
      continue;
    }

    if (/^\|/.test(line) && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const body = [];
      for (; i < lines.length && /^\|/.test(lines[i]); i++) body.push(cells(lines[i]));
      out.push(`<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>`
        + `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) body.push(lines[i].replace(/^>\s?/, ""));
      out.push(`<blockquote>${toHtml(body.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      for (; i < lines.length && /^\s*[-*]\s+/.test(lines[i]); i++) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
      }
      flushList("ul", items);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      for (; i < lines.length && /^\s*\d+\.\s+/.test(lines[i]); i++) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
      }
      flushList("ol", items);
      continue;
    }

    const para = [];
    for (; i < lines.length && !/^\s*$/.test(lines[i]) && !/^[#>|`-]/.test(lines[i])
           && !/^\s*\d+\.\s+/.test(lines[i]); i++) para.push(lines[i]);
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    else i++;
  }
  return out.join("\n");
}
