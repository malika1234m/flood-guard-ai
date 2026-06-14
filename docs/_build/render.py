import re
import markdown

SRC = "../technical_report.md"
OUT = "technical_report.html"

with open(SRC, encoding="utf-8") as f:
    text = f.read()

# Strip YAML frontmatter and render it as a title block
title_html = ""
fm = re.match(r"^---\n(.*?)\n---\n", text, flags=re.S)
if fm:
    meta = dict(
        re.findall(r'^(\w+):\s*"(.*)"\s*$', fm.group(1), flags=re.M)
    )
    title_html = (
        '<div class="titleblock">'
        f'<h1 class="doctitle">{meta.get("title", "")}</h1>'
        f'<p class="docsubtitle">{meta.get("subtitle", "")}</p>'
        f'<p class="docdate">{meta.get("date", "")}</p>'
        "</div>"
    )
    text = text[fm.end():]

# Replace the mermaid code block with the pre-rendered diagram image
text = re.sub(
    r"```mermaid.*?```",
    '<img src="architecture.png" alt="Architecture diagram" class="diagram">',
    text,
    flags=re.S,
)

body = markdown.markdown(
    text,
    extensions=["tables", "fenced_code", "sane_lists", "toc"],
)

css = """
@page { size: A4; margin: 18mm 16mm; }
body {
  font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1a1a1a;
  max-width: 100%;
}
h1 { font-size: 19pt; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-top: 28px; page-break-before: auto; page-break-after: avoid; }
body > h1:first-of-type { margin-top: 0; }
h2, h3 { page-break-after: avoid; }
h2 { font-size: 14pt; color: #1d4ed8; margin-top: 22px; }
h3 { font-size: 12pt; margin-top: 16px; }
p, li { font-size: 10.5pt; }
table { border-collapse: collapse; width: 100%; margin: 10px 0 14px; font-size: 9.5pt; }
th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
th { background: #eff6ff; }
code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 9pt; font-family: "SF Mono", Menlo, monospace; }
pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 6px; overflow-x: auto; font-size: 8.5pt; line-height: 1.4; }
pre code { background: none; color: inherit; padding: 0; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }
img.diagram { max-width: 100%; display: block; margin: 12px auto; border: 1px solid #e2e8f0; border-radius: 6px; }
blockquote { border-left: 3px solid #93c5fd; margin: 8px 0; padding: 2px 14px; color: #475569; }
.titleblock { text-align: center; margin: 120px 0 60px; }
.titleblock .doctitle { font-size: 28pt; border: none; margin-bottom: 8px; }
.titleblock .docsubtitle { font-size: 13pt; color: #475569; margin: 4px 0; }
.titleblock .docdate { font-size: 10pt; color: #94a3b8; margin: 4px 0; }
"""

html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>FloodGuard AI - Technical Report</title>
<style>{css}</style>
</head>
<body>
{title_html}
{body}
</body>
</html>
"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print("wrote", OUT, "-", len(html), "bytes")
