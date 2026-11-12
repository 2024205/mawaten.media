const SUPABASE_URL = "https://sfomyyvfxyvzsbmecqob.supabase.co";
const SUPABASE_KEY = "sb_publishable_Un8Xw6RLTCjrUM6hJjXGCg_GDvIwk21";

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c] as string));
}

function safeImageUrl(value: unknown): string {
  try {
    const image = new URL(String(value ?? ""));
    return image.protocol === "https:" ? image.href : "";
  } catch {
    return "";
  }
}

function isCrawler(ua: string): boolean {
  return /facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|googlebot|bingbot/i.test(ua);
}

export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  const ua = request.headers.get("user-agent") || "";
  if (!isCrawler(ua)) return context.next();

  const localId = url.searchParams.get("a") || url.searchParams.get("article");
  const externalId = url.searchParams.get("external");
  if (!localId && !externalId) return context.next();

  const table = externalId ? "imported_news" : "articles";
  const id = externalId || localId;
  const fields = externalId
    ? "title,summary,image_url,category,is_published"
    : "title,summary,image,category,published";
  try {
    const api = new URL(SUPABASE_URL + "/rest/v1/" + table);
    api.searchParams.set("select", fields);
    api.searchParams.set("id", "eq." + id);
    api.searchParams.set("limit", "1");
    const response = await fetch(api, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } });
    if (!response.ok) return context.next();
    const rows = await response.json();
    const article = rows?.[0];
    if (!article || (externalId ? !article.is_published : !article.published)) return context.next();

    const title = esc(article.title || "مواطن | صوت المواطن.. نبض الوطن");
    const description = esc(article.summary || "آخر الأخبار من منصة مواطن الإخبارية");
    const rawImage = safeImageUrl(externalId ? article.image_url : article.image);
    // Local article images are already public Cloudinary JPEGs; use them directly.
    // Convert only remote/non-JPEG sources to a JPEG rendition for WhatsApp compatibility.
    const isCloudinaryUpload = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//i.test(rawImage);
    const previewImage = !rawImage
      ? ""
      : isCloudinaryUpload
        ? rawImage
        : "https://res.cloudinary.com/lxkdpxpz/image/fetch/f_jpg,q_auto,w_1200/" + encodeURIComponent(rawImage);
    const image = esc(previewImage || rawImage);
    const canonical = esc(url.origin + url.pathname + "?" + (externalId ? "external=" : "a=") + encodeURIComponent(id!));
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${title} | مواطن</title><meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="مواطن"><meta property="og:locale" content="ar_YE">
<meta property="og:type" content="article"><meta property="og:title" content="${title}">
<meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${image}"><meta property="og:image:secure_url" content="${image}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${title}"><meta name="twitter:image" content="${image}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}"></head><body>
<h1>${title}</h1><p>${description}</p><script>location.replace(${JSON.stringify(canonical)});</script>
<a href="${canonical}">افتح الخبر في موقع مواطن</a></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=300" } });
  } catch (_) {
    return context.next();
  }
};
