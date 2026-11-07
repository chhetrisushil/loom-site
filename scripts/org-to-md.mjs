// Convert the org-mode subset loom's docs use to markdown, so `.org` docs can join the site.
//
// Dependency-free on purpose: the site builds from a checkout in CI, and these two documents use
// only headings, property drawers, source/example/quote blocks, tables, lists, links and inline
// markup. Anything this leaves behind fails the build through `assertOrgConverted`, so a doc that
// starts using more of org stops the deploy rather than publishing raw syntax.

const PRE = "(^|[\\s(\\[{'\"\\-—/])";
const POST = "(?=$|[\\s,.;:!?)\\]}'\"\\-—/])";
const code = new RegExp(`${PRE}[~=]([^\\s~=](?:[^\\n]*?[^\\s])??)[~=]${POST}`, "g");
const bold = new RegExp(`${PRE}\\*([^\\s*](?:[^*\\n]*?[^\\s*])?)\\*${POST}`, "g");
const italic = new RegExp(`${PRE}/([^\\s/](?:[^/\\n]*?[^\\s/])?)/${POST}`, "g");

const fence = (text) => {
  const ticks = text.includes("`") ? "``" : "`";
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
};

function inline(text) {
  const held = [];
  const hold = (value) => {
    held.push(value);
    return `\u0000${held.length - 1}\u0000`;
  };
  let out = text.replace(/`[^`\n]+`/g, (m) => hold(m));
  // The delimiters must match: `~a=b~` is one code span, and `=` inside it is literal.
  out = out.replace(code, (all, pre, body, offset) => {
    const open = all[pre.length];
    const close = all[all.length - 1];
    return open === close ? `${pre}${hold(fence(body))}` : all;
  });
  out = out.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, (_all, target, label) => {
    const href = target.replace(/^file:/, "").replace(/::#/, "#");
    return hold(`[${inline(label)}](${href})`);
  });
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_all, target) => {
    const href = target.replace(/^file:/, "").replace(/::#/, "#");
    return hold(`[${href}](${href})`);
  });
  out = out.replace(bold, (_all, pre, body) => `${pre}${hold(`**${inline(body)}**`)}`);
  out = out.replace(italic, (_all, pre, body) => `${pre}${hold(`*${inline(body)}*`)}`);
  // What is left is prose: markdown must not read a stray `<T>` as HTML, or a `*` as emphasis.
  out = out.replace(/</g, "\\<").replace(/\*/g, "\\*");
  let previous;
  do {
    previous = out;
    out = out.replace(/\u0000(\d+)\u0000/g, (_all, i) => held[Number(i)]);
  } while (out !== previous);
  return out;
}

const BLOCK = /^\s*#\+begin_(src|example|quote)\b\s*(\S*)/i;

export function orgToMarkdown(org) {
  const lines = org.split("\n");
  const out = [];
  let lastHeading = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const block = line.match(BLOCK);
    if (block) {
      const kind = block[1].toLowerCase();
      const end = new RegExp(`^\\s*#\\+end_${kind}\\b`, "i");
      const body = [];
      for (i++; i < lines.length && !end.test(lines[i]); i++) body.push(lines[i]);
      // Org escapes a line that would read as syntax with a leading comma.
      const text = body.map((l) => l.replace(/^(\s*),(?=[*#])/, "$1"));
      if (kind === "quote") out.push(...text.map((l) => `> ${inline(l)}`.trimEnd()));
      else out.push(`\`\`\`${kind === "src" ? block[2] : "text"}`, ...text, "```");
      continue;
    }
    if (/^\s*#\+\w+:/.test(line) || /^#( |$)/.test(line)) continue;
    if (/^\s*:PROPERTIES:\s*$/.test(line)) {
      for (i++; i < lines.length && !/^\s*:END:\s*$/.test(lines[i]); i++) {
        const id = lines[i].match(/^\s*:CUSTOM_ID:\s*(\S+)/);
        // Links address the id, so it goes in front of its heading as a real anchor.
        if (id && lastHeading >= 0) out.splice(lastHeading, 0, `<a id="${id[1]}"></a>`, "");
      }
      continue;
    }
    const heading = line.match(/^(\*+)\s+(.*)$/);
    if (heading) {
      lastHeading = out.length;
      // Org's top level is the page's first section: the layout renders the page title as the h1.
      out.push(`${"#".repeat(Math.min(heading[1].length + 1, 6))} ${inline(heading[2])}`);
      continue;
    }
    if (/^\s*\|[-+|]+\|?\s*$/.test(line)) {
      const cells = line.trim().replace(/^\|/, "").replace(/\|?$/, "").split("+").length;
      out.push(`|${" --- |".repeat(cells)}`);
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const row = line.trim().replace(/^\|/, "").replace(/\|\s*$/, "").split("|");
      out.push(`| ${row.map((c) => inline(c.trim())).join(" | ")} |`);
      continue;
    }
    if (/^-{5,}\s*$/.test(line)) {
      out.push("---");
      continue;
    }
    out.push(inline(line));
  }
  return out.join("\n");
}

/** Fails the build if org syntax survived outside a code fence. */
export function assertOrgConverted(markdown, where) {
  const prose = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const left = prose.match(/^\s*#\+\w+|^\s*:(?:PROPERTIES|END|CUSTOM_ID):|\[\[[^\]\s]+\]/m);
  if (left) {
    console.error(`sync-docs: ${where} still has org syntax after conversion: "${left[0].trim()}"`);
    process.exit(1);
  }
}
