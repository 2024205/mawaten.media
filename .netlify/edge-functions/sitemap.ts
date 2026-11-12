const SUPABASE_URL = "https://sfomyyvfxyvzsbmecqob.supabase.co";
const SUPABASE_KEY = "sb_publishable_Un8Xw6RLTCjrUM6hJjXGCg_GDvIwk21";
const SITE = "https://mawaten-news.netlify.app";

async function fetchIds(table: string, publishedField: string): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const api = new URL(SUPABASE_URL + "/rest/v1/" + table);
    api.searchParams.set("select", "id");
    api.searchParams.set(publishedField, "eq.true");
    api.searchParams.set("order", "id.asc");
    api.searchParams.set("limit", "1000");
    api.searchParams.set("offset", String(offset));
    // Publishable keys belong in the apikey header; they are not JWT bearer tokens.
    const response = await fetch(api, { headers: { apikey: SUPABASE_KEY } });
    if (!response.ok) {
      console.error("Sitemap query failed", table, response.status, await response.text());
      throw new Error("Sitemap source query failed: " + table);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Unexpected sitemap response: " + table);
    for (const row of rows) if (row?.id) ids.push(String(row.id));
    if (rows.length < 1000) break;
  }
  return ids;
}

export default async () => {
  try {
    const [articles, external] = await Promise.all([
      fetchIds("articles", "published"),
      fetchIds("imported_news", "is_published")
    ]);
    const urls = [SITE + "/", ...articles.map(id => SITE + "/?a=" + encodeURIComponent(id)), ...external.map(id => SITE + "/?external=" + encodeURIComponent(id))];
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(loc => "  <url><loc>" + loc.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</loc></url>").join("\n") +
      "\n</urlset>";
    return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=60" } });
  } catch (error) {
    console.error("Sitemap generation failed", error);
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
};
