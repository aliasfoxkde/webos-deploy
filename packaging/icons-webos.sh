#!/usr/bin/env bash
# Generate the WebOS app icon set (original geometric artwork, clean-room —
# no vendor iconography). Family style: dark rounded square + accent glyph.
set -euo pipefail
cd "$(dirname "$0")/../webos/public/icons"

icon() { # name accent svg-body
  cat > "$1.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g-$1" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#131a26"/><stop offset="1" stop-color="#0a0f18"/>
  </linearGradient></defs>
  <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#g-$1)" stroke="$2" stroke-width="2.5"/>
  $3
</svg>
EOF
  echo "wrote $1.svg"
}

# Mail — envelope
icon mail '#7dd3fc' '<rect x="14" y="20" width="36" height="26" rx="4" fill="none" stroke="#7dd3fc" stroke-width="3"/><path d="M15 22l17 13 17-13" fill="none" stroke="#7dd3fc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'

# Music — eighth note
icon music '#fb923c' '<circle cx="24" cy="44" r="6" fill="none" stroke="#fb923c" stroke-width="3"/><path d="M30 44V18l14-4v24" fill="none" stroke="#fb923c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="44" cy="38" r="6" fill="none" stroke="#fb923c" stroke-width="3"/>'

# Video — play triangle in rounded frame
icon video '#f87171' '<rect x="13" y="19" width="38" height="26" rx="5" fill="none" stroke="#f87171" stroke-width="3"/><path d="M28 26l10 6-10 6z" fill="#f87171"/>'

# Terminal — prompt chevron + caret
icon terminal '#4ade80' '<path d="M16 22l10 8-10 8" fill="none" stroke="#4ade80" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 40h16" stroke="#4ade80" stroke-width="3.4" stroke-linecap="round"/>'

# Calculator — keypad grid
icon calc '#c084fc' '<rect x="17" y="13" width="30" height="38" rx="5" fill="none" stroke="#c084fc" stroke-width="3"/><path d="M22 21h20" stroke="#c084fc" stroke-width="3" stroke-linecap="round"/><g fill="#c084fc"><circle cx="24" cy="30" r="2.4"/><circle cx="32" cy="30" r="2.4"/><circle cx="40" cy="30" r="2.4"/><circle cx="24" cy="38" r="2.4"/><circle cx="32" cy="38" r="2.4"/><circle cx="40" cy="38" r="2.4"/><circle cx="24" cy="46" r="2.4"/><circle cx="32" cy="46" r="2.4"/><circle cx="40" cy="46" r="2.4"/></g>'

# Editor — document with code chevrons
icon editor '#60a5fa' '<rect x="17" y="11" width="30" height="42" rx="5" fill="none" stroke="#60a5fa" stroke-width="3"/><path d="M28 27l-6 6 6 6M36 27l6 6-6 6" fill="none" stroke="#60a5fa" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'

# Browser — globe/compass (Firefox-in-WASM; original generic globe mark)
icon browser '#9580ff' '<circle cx="32" cy="32" r="18" fill="none" stroke="#9580ff" stroke-width="3"/><ellipse cx="32" cy="32" rx="8.5" ry="18" fill="none" stroke="#9580ff" stroke-width="2.4"/><path d="M14.5 32h35M17.5 23h29M17.5 41h29" stroke="#9580ff" stroke-width="2.4" fill="none"/>'

# Globe — 3D globe with orbit ring
icon globe '#38bdf8' '<circle cx="32" cy="32" r="13" fill="none" stroke="#38bdf8" stroke-width="3"/><ellipse cx="32" cy="32" rx="24" ry="8.5" fill="none" stroke="#38bdf8" stroke-width="2.4" transform="rotate(-18 32 32)"/><circle cx="49" cy="21" r="2.6" fill="#38bdf8"/>'

# StoryWeaver — open book
icon storyweaver '#fbbf24' '<path d="M12 20c7-4 13-4 20 1 7-5 13-5 20-1v26c-7-4-13-4-20 1-7-5-13-5-20-1z" fill="none" stroke="#fbbf24" stroke-width="3" stroke-linejoin="round"/><path d="M32 21v26" stroke="#fbbf24" stroke-width="2.4"/>'

# DevOps Quest — shield with checkmark
icon devopsquest '#34d399' '<path d="M32 12l16 6v12c0 10-7 17-16 21-9-4-16-11-16-21V18z" fill="none" stroke="#34d399" stroke-width="3" stroke-linejoin="round"/><path d="M25 31l5 5 10-10" fill="none" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'

# OpenZenith — layered map contours
icon openzenith '#2dd4bf' '<path d="M14 40l12-6 10 4 14-8" fill="none" stroke="#2dd4bf" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 30l12-6 10 4 14-8" fill="none" stroke="#2dd4bf" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/><path d="M14 50l12-6 10 4 14-8" fill="none" stroke="#2dd4bf" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>'

# SculptGL — sculpted blob on stand
icon sculptgl '#f472b6' '<path d="M22 40c-6-8 0-22 12-22 10 0 16 8 12 16-3 6-10 5-12 10-1.6 4-8 1-12-4z" fill="none" stroke="#f472b6" stroke-width="3" stroke-linejoin="round"/><path d="M32 44v8M22 54h20" stroke="#f472b6" stroke-width="3" stroke-linecap="round"/>'

# SVG.edit — bezier pen curve with nodes
icon svgedit '#a3e635' '<path d="M14 44c8-22 28-22 36 0" fill="none" stroke="#a3e635" stroke-width="3" stroke-linecap="round"/><rect x="10" y="40" width="8" height="8" rx="2" fill="#a3e635"/><rect x="46" y="40" width="8" height="8" rx="2" fill="#a3e635"/><circle cx="32" cy="24" r="4" fill="none" stroke="#a3e635" stroke-width="2.6"/>'

# Qwen IDE — code brackets
icon ide '#60a5fa' '<path d="M22 20l-12 12 12 12M42 20l12 12-12 12" fill="none" stroke="#60a5fa" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 16l-8 32" stroke="#60a5fa" stroke-width="3" stroke-linecap="round"/>'

# OpenCAD Studio — isometric cube
icon opencad '#22d3ee' '<path d="M32 12l17 10v20l-17 10-17-10V22z" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linejoin="round"/><path d="M32 12v20m0 0L15 22m17 10l17-10" fill="none" stroke="#22d3ee" stroke-width="2.4"/>'

# SQLite Viewer — database cylinder
icon sqlite '#818cf8' '<ellipse cx="32" cy="18" rx="16" ry="6.5" fill="none" stroke="#818cf8" stroke-width="3"/><path d="M16 18v28c0 3.6 7.2 6.5 16 6.5s16-2.9 16-6.5V18" fill="none" stroke="#818cf8" stroke-width="3"/><path d="M16 32c0 3.6 7.2 6.5 16 6.5s16-2.9 16-6.5" fill="none" stroke="#818cf8" stroke-width="2.6"/>'

# Online Python — interlocking loops (generic, not the vendor mark)
icon python '#eab308' '<rect x="18" y="14" width="28" height="16" rx="8" fill="none" stroke="#eab308" stroke-width="3"/><rect x="18" y="34" width="28" height="16" rx="8" fill="none" stroke="#eab308" stroke-width="3"/><circle cx="26" cy="22" r="2.2" fill="#eab308"/><circle cx="38" cy="42" r="2.2" fill="#eab308"/>'

# Pyodide console — terminal window with prompt
icon pyconsole '#f97316' '<rect x="13" y="17" width="38" height="30" rx="5" fill="none" stroke="#f97316" stroke-width="3"/><path d="M13 25h38" stroke="#f97316" stroke-width="2.4"/><path d="M20 32l6 5-6 5" fill="none" stroke="#f97316" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 42h10" stroke="#f97316" stroke-width="2.8" stroke-linecap="round"/>'

# Planly — checklist
icon planly '#4ade80' '<rect x="15" y="13" width="34" height="38" rx="6" fill="none" stroke="#4ade80" stroke-width="3"/><path d="M22 26l4 4 7-8" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 40h20M22 46h13" stroke="#4ade80" stroke-width="3" stroke-linecap="round"/>'

# WebOS logo — four app tiles forming an "O"
cat > logo.svg <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#131a26"/><stop offset="1" stop-color="#0a0f18"/>
  </linearGradient></defs>
  <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#lg)" stroke="#38bdf8" stroke-width="2.5"/>
  <rect x="13" y="13" width="17" height="17" rx="5" fill="#38bdf8"/>
  <rect x="34" y="13" width="17" height="17" rx="5" fill="#a78bfa"/>
  <rect x="13" y="34" width="17" height="17" rx="5" fill="#34d399"/>
  <circle cx="42.5" cy="42.5" r="8.5" fill="none" stroke="#fbbf24" stroke-width="3.4"/>
</svg>
EOF
echo "wrote logo.svg"
