#!/usr/bin/env bash
# Publish an oversized app bundle to Cloudflare R2 and prepare the app
# directory for a Pages deploy that streams the wasm from there.
#
# Cloudflare Pages caps a single static asset at 25 MiB. The craft apps'
# wasm bundles are 29–74 MiB, so the bundle cannot be uploaded as a static
# asset at all. Instead the wasm goes to the R2 bucket `craftweb` and the
# deploy carries only a `_worker.js` that streams it; everything else falls
# through to the static assets.
#
# The blob is kept in r2-blobs/ so a re-deploy can re-upload it without
# re-fetching the release zip.
#
# Usage: packaging/r2-publish.sh <app> [pages-project]
#   app           app directory name under apps/ (e.g. pdfcraft)
#   pages-project Pages project to deploy to (default <app>-web)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
APPS="$ROOT/apps"
BLOBS="$ROOT/r2-blobs"
BUCKET="craftweb"

app=${1:?usage: r2-publish.sh <app> [pages-project]}
project=${2:-$app-web}
dir="$APPS/$app"

[ -d "$dir" ] || { echo "error: no app directory at $dir" >&2; exit 1; }

wasm="$(find "$dir" -maxdepth 1 -name '*.wasm' -print -quit)"
[ -n "$wasm" ] || { echo "error: no top-level .wasm in $dir" >&2; exit 1; }

name="$(basename "$wasm")"
mkdir -p "$BLOBS"

# The bundle keeps only the worker and the static assets; the wasm is served
# from R2. Move (not copy) the blob out of the deploy directory so the deploy
# stays under the per-asset cap, and keep it in r2-blobs/ for re-uploads.
if [ ! -f "$BLOBS/$name" ]; then
  /bin/mv -f "$wasm" "$BLOBS/$name"
else
  /bin/mv -f "$wasm" "$BLOBS/$name.new" && /bin/mv -f "$BLOBS/$name.new" "$BLOBS/$name"
fi

# --- _worker.js: stream .wasm from R2, fall through to the static assets ---
cat > "$dir/_worker.js" <<'JS'
// ArtCraft WebOS deployment: serve large .wasm blobs from R2 (Cloudflare Pages
// caps static files at 25 MiB); everything else falls through to static assets.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('.wasm')) {
      const key = decodeURIComponent(url.pathname.split('/').pop());
      const obj = await env.CRAFTWEB.get(key);
      if (!obj) return new Response('wasm not found: ' + key, { status: 404 });
      const headers = new Headers();
      if (obj.writeHttpMetadata) obj.writeHttpMetadata(headers);
      headers.set('Content-Type', headers.get('Content-Type') || 'application/wasm');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Etag', obj.httpEtag);
      return new Response(obj.body, { headers });
    }
    return env.ASSETS.fetch(request);
  },
};
JS

# --- wrangler.toml: the Pages project plus the R2 binding ---
cat > "$dir/wrangler.toml" <<TOML
name = "$project"
pages_build_output_dir = "."
compatibility_date = "2026-10-09"

[[r2_buckets]]
binding = "CRAFTWEB"
bucket_name = "$BUCKET"
TOML

echo "== $app: uploading $name to R2 ($BUCKET)"
npx wrangler r2 object put "$BUCKET/$name" --file "$BLOBS/$name" --remote

echo "== $app: ready to deploy (project $project, wasm served from R2)"
