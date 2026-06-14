#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: build_arxiv_project.sh <arxiv-dir> [main-tex]

Build an arXiv/Overleaf LaTeX project with:
  pdflatex -> bibtex when needed -> pdflatex -> pdflatex
Then create preview-page-1.png when mutool is available and an Overleaf source ZIP.

Debian prerequisites:
  sudo apt-get update
  sudo apt-get install -y texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended mupdf-tools zip
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  usage
  exit 0
fi

project_dir="$1"
main_tex="${2:-main.tex}"

need=()
for tool in pdflatex bibtex zip; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    need+=("$tool")
  fi
done

if (( ${#need[@]} > 0 )); then
  printf 'Missing required tool(s): %s\n\n' "${need[*]}" >&2
  usage >&2
  exit 1
fi

cd "$project_dir"

if [[ ! -f "$main_tex" ]]; then
  echo "Cannot find $main_tex in $project_dir" >&2
  exit 1
fi

base="${main_tex%.tex}"

pdflatex -interaction=nonstopmode -halt-on-error "$main_tex"

if [[ -f "$base.aux" ]] && grep -q '\\bibdata' "$base.aux"; then
  bibtex "$base"
fi

pdflatex -interaction=nonstopmode -halt-on-error "$main_tex"
pdflatex -interaction=nonstopmode -halt-on-error "$main_tex"

if [[ ! -f "$base.pdf" ]]; then
  echo "Expected $base.pdf was not produced" >&2
  exit 1
fi

if [[ -f "$base.log" ]]; then
  if grep -Eq 'undefined references|undefined citations|Citation .* undefined|LaTeX Error|Package .* Error|! ' "$base.log"; then
    echo "Build completed, but $base.log contains warnings/errors that need review:" >&2
    grep -En 'undefined references|undefined citations|Citation .* undefined|LaTeX Error|Package .* Error|! ' "$base.log" >&2 || true
    exit 1
  fi
fi

if command -v mutool >/dev/null 2>&1; then
  mutool draw -r 144 -o preview-page-1.png "$base.pdf" 1 >/dev/null
  if mutool info "$base.pdf" | grep -q 'Type3'; then
    echo "Warning: PDF appears to contain Type 3 fonts. Add \\usepackage{lmodern} and rebuild." >&2
  fi
else
  echo "mutool not found; skipping preview PNG and font inspection." >&2
fi

zip_name="$(basename "$(pwd)")-overleaf-source.zip"
entries=("$main_tex")

[[ -f references.bib ]] && entries+=("references.bib")
[[ -d figures ]] && entries+=("figures")

shopt -s nullglob
for extra in *.bst *.sty *.cls; do
  entries+=("$extra")
done
shopt -u nullglob

zip -r "$zip_name" "${entries[@]}"

echo "Built $base.pdf"
[[ -f preview-page-1.png ]] && echo "Wrote preview-page-1.png"
echo "Wrote $zip_name"
