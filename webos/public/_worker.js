// Fail-closed compatibility endpoint. The legacy same-origin HTML proxy was
// removed because it executed untrusted remote scripts with the WebOS origin
// (issue #12). Never fetch, rewrite, or return remote HTML.
export default {
  async fetch() {
    return new Response(JSON.stringify({
      error: 'The WebOS same-origin browser proxy has been disabled for security. Open this site in a normal browser tab.',
    }), {
      status: 410,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  },
};
