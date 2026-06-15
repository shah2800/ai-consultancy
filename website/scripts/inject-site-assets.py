#!/usr/bin/env python3
"""Add shared site.css, site-ui.css, and site-shell.js to all website HTML pages."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = """
  <link rel="stylesheet" href="css/site.css">
  <link rel="stylesheet" href="css/site-ui.css">"""
SCRIPT = '  <script src="js/site-shell.js" defer></script>'


def inject(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    if "css/site.css" not in text:
        if "</style>" in text:
            text = text.replace("</style>", "</style>" + CSS, 1)
        elif "</head>" in text:
            text = text.replace("</head>", CSS + "\n</head>", 1)

    if "site-shell.js" not in text and "</body>" in text:
        text = text.replace("</body>", SCRIPT + "\n</body>", 1)

    if path.name != "index.html":
        if '<body class="ns-site' not in text:
            text = text.replace("<body>", '<body class="ns-site has-mobile-bar">', 1)

    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main():
    updated = []
    for html in sorted(ROOT.glob("*.html")):
        if inject(html):
            updated.append(html.name)
    print("Updated", len(updated), "files:")
    for name in updated:
        print(" ", name)


if __name__ == "__main__":
    main()
