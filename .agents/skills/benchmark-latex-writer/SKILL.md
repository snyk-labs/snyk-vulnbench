---
name: benchmark-latex-writer
description: Convert benchmark reports, evaluation writeups, or results-driven markdown articles into arXiv-ready LaTeX projects. Use when Codex needs to turn markdown plus benchmark data, tables, citations, HTML/SVG charts, and figures into a self-contained article directory containing main.tex, references.bib, arXiv-compatible figure files, a compiled PDF preview, and an Overleaf/arXiv-ready source ZIP.
---

# Benchmark LaTeX Writer

## Goal

Produce a clean academic LaTeX project from a benchmark report. Preserve the report's claims and tables, reshape the prose into paper structure, compile locally when possible, show a PDF preview, and package an Overleaf-ready ZIP.

## Output Directory

Create a dedicated arXiv directory inside the report or benchmark folder, usually:

```text
<report-dir>/arxiv/
```

Write generated files there:

- `main.tex`
- `references.bib`
- `figures/` for image assets
- `main.pdf` after compilation
- `preview-page-1.png` or another first-look preview
- `<slug>-overleaf-source.zip`

Do not scatter LaTeX artifacts into the original report directory.

## Workflow

1. Inspect the source report before writing:
   - Find the primary markdown article, benchmark JSON/JSONL, chart manifests, generated HTML reports, and existing image assets.
   - Prefer `rg --files`, `rg`, `sed`, and `find`.
   - Extract title, author metadata, actual report date, headings, tables, code snippets, links, citation targets, figure placeholders, and chart captions.

2. Create the paper structure:
   - Use `\documentclass[11pt]{article}`.
   - Use `graphicx`, `booktabs`, `xcolor`, `geometry`, `authblk`, `natbib`, `url`, `listings`, and `lmodern`.
   - Load `hyperref` bare, then configure links separately:

```latex
\usepackage{hyperref}
\hypersetup{colorlinks=true, citecolor=darkblue, linkcolor=darkblue, urlcolor=darkblue}
```

   - Hardcode the date with `\date{<actual date>}` and immediately add `\renewcommand{\today}{<actual date>}`.
   - Do not place a standalone `\today` after `\maketitle`.
   - Use `\author[1]{Name}` and `\affil[1]{Affiliation}` with `authblk`.

3. Convert content with academic discipline:
   - Use `abstract`, `Introduction`, `Methodology`, `Results`, `Discussion`, `Conclusion`, and references unless the source strongly suggests another standard structure.
   - Convert markdown tables to `booktabs` tables without vertical rules.
   - Use `\resizebox{\textwidth}{!}{...}` for wide metric tables.
   - Convert fenced code blocks to `lstlisting`.
   - Define JavaScript explicitly before using `language=JavaScript`; TeX Live's `listings` does not always include it:

```latex
\lstdefinelanguage{JavaScript}{
  keywords={const,let,var,function,return,if,else,true,false},
  sensitive=true,
  comment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
  morestring=[b]',
  morestring=[b]`
}
```

4. Handle figures:
   - Use arXiv-compatible filenames and extensions only: `.pdf`, `.png`, `.jpg`, `.jpeg`.
   - Prefer vector PDFs for charts when possible.
   - If chart images are not provided yet, a temporary draft may use a conditional placeholder macro such as `\IfFileExists`; remove that fallback before the final arXiv ZIP.
   - Final arXiv source should use literal `\includegraphics{figures/name.pdf}` calls, not a custom wrapper macro or `\IfFileExists`. arXiv's file-review scanner may mark real figure files as unused when image paths are hidden behind conditionals or custom macros, and can offer to delete them.
   - Record the exact filenames the user must provide only when they truly cannot be generated.
   - Prefer figure paths under `figures/`, for example `figures/score-stability-labeled-scatter.pdf`.
   - If charts exist only in generated HTML/SVG reports, export them to `.pdf` figures instead of asking the user to provide images. Use DOM rendering/extraction for embedded SVG charts, or synthesize static SVG from chart manifests when the HTML does not expose a ready SVG, then convert SVG to PDF.

5. Build bibliography:
   - Extract explicit links and named external references from the report.
   - Use `@misc` for documentation and URLs with `url` and `note = {Accessed: YYYY-MM-DD}`.
   - Use academic BibTeX types for papers when clear.
   - Insert `\bibliographystyle{plain}` and `\bibliography{references}`.
   - Verify every `\cite{}` key exists and every BibTeX entry is used.

6. Compile and package:
   - Use `scripts/build_arxiv_project.sh <arxiv-dir>` when available.
   - Otherwise run `pdflatex`, `bibtex`, `pdflatex`, `pdflatex`.
   - Generate a page-1 PNG preview with `mutool draw` when available.
   - Create an Overleaf ZIP containing source files and `figures/`, not build-only files.

## Debian Tooling

If `pdflatex`, `bibtex`, or `mutool` are missing on Debian, install the standard packages:

```bash
sudo apt-get update
sudo apt-get install -y texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended mupdf-tools zip
```

`texlive-latex-extra` is needed for packages such as `authblk`. `mupdf-tools` provides `mutool` for PNG previews. Add `lmodern` in `main.tex` to avoid Type 3 bitmap fonts and produce arXiv-friendly embedded Type 1 fonts.

For HTML/SVG chart export, install SVG conversion support:

```bash
sudo apt-get install -y librsvg2-bin
```

`librsvg2-bin` provides `rsvg-convert` for converting exported SVG charts to PDF. If the report charts are rendered by browser-side JavaScript, install a DOM runtime such as `jsdom` in a temporary or project-local location and use it to execute/extract the chart SVGs before conversion.

## Validation Checklist

Before final response:

- `hyperref` is loaded without inline options.
- Date is hardcoded and `\today` is redefined only in the preamble.
- `main.tex` compiles with `pdflatex + bibtex + pdflatex + pdflatex`.
- No unresolved citations or references remain in `main.log`.
- `main.pdf` exists and uses Type 1 fonts when `mutool info` is available.
- Figure paths use only `.pdf`, `.png`, `.jpg`, or `.jpeg`.
- Final arXiv source uses direct `\includegraphics{figures/...}` paths for every included figure.
- No final source figure is referenced only through `\IfFileExists`, a placeholder macro, or another custom wrapper that can confuse arXiv's unused-file scanner.
- The Overleaf ZIP contains `main.tex`, `references.bib`, and `figures/`.
- The final answer links to `main.pdf`, shows or links a PNG preview, links the ZIP, and lists any still-missing figure files.

## Common Fixes

- If `Package Listings Error: Couldn't load requested language` occurs, define the language manually before `\lstset`.
- If arXiv or Overleaf reports a `hyperref` option clash, remove options from `\usepackage{hyperref}` and keep them in `\hypersetup`.
- If arXiv's file-review page claims included figures are unused, cancel the deletion, inspect `main.tex`, and replace conditional/custom figure wrappers with direct literal `\includegraphics` statements. Rebuild and re-upload the ZIP. If arXiv still flags them, manually keep the files and verify the arXiv-generated PDF shows all charts before submission.
- If the PDF uses Type 3 fonts, add `\usepackage{lmodern}` after `fontenc` and rebuild.
- If a wide table overflows, use smaller text, `p{}` columns, or `\resizebox{\textwidth}{!}{...}`.
- If figures are not ready during drafting, use placeholder boxes so the PDF still compiles, but clearly list the required filenames; do not ship placeholder fallbacks in the final arXiv upload if figure files are available.

## Script

Use `scripts/build_arxiv_project.sh` for the deterministic build, preview, and ZIP loop. Read or patch it only if the project has unusual layout needs.
