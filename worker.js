// worker.js — Cloudflare Worker for static file serving
// Serves files from the `public` directory via ASSETS binding

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    // WeChat verification file
    if (env.WECHAT_VERIFY_NAME && path === "/" + env.WECHAT_VERIFY_NAME) {
      return new Response(env.WECHAT_VERIFY_CONTENT || "", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Serve static assets
    return env.ASSETS.fetch(req);
  },
};
