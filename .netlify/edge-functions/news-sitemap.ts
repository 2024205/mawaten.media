const SUPABASE_URL = "https://sfomyyvfxyvzsbmecqob.supabase.co";
const SUPABASE_KEY = "sb_publishable_Un8Xw6RLTCjrUM6hJjXGCg_GDvIwk21";
const SITE = "https://mawaten-news.netlify.app";

function xml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  }[c] as string));
}

export default async () => {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const api = new URL(SUPABASE_URL + "/rest/v1/articles");
    api.searchParams.set("select", "id,title,created_at,published");
    api.searchParams.set("published", "eq.true");
    api.searchParams.set("created_at", "gte." + cutoff);
    api.searchParams.set("order", "created_at.desc");
    api.searchParams.set("limit", "1000");
    const response = await fetch(api, { headers: { apikey: SUPABASE_KEY } });
    if (!response.ok) throw new Error("News sitemap query failed: " + response.status);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Unexpected news sitemap response");
    const urls = rows.filter((a: any) => a?.id && a?.title && a?.created_at);
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n' +
      urls.map((a: any) => {
        const loc = SITE + "/?a=" + encodeURIComponent(String(a.id));
        const date = new Date(a.created_at).toISOString();
        return "  <url><loc>" + xml(loc) + "</loc><news:news><news:publication><news:name>مواطن الإخبارية</news:name><news:language>ar</news:language></news:publication><news:publication_date>" + xml(date) + "</news:publication_date><news:title>" + xml(String(a.title).slice(0, 110)) + "</news:title></news:news></url>";
      }).join("\n") + "\n</urlset>";
    return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=300" } });
  } catch (error) {
    console.error("News sitemap generation failed", error);
    return new Response("News sitemap temporarily unavailable", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
};
