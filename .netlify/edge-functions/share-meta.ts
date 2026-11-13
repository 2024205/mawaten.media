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
  return /googlebot|googlebot-news|google-inspectiontool|bingbot|facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot/i.test(ua);
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
    ? "id,title,summary,image_url,category,is_published,published_at,source_name,article_url"
    : "id,title,summary,body,image,category,published,created_at";
  try {
    const api = new URL(SUPABASE_URL + "/rest/v1/" + table);
    api.searchParams.set("select", fields);
    api.searchParams.set("id", "eq." + id);
    api.searchParams.set("limit", "1");
    const response = await fetch(api, { headers: { apikey: SUPABASE_KEY } });
    if (!response.ok) return context.next();
    const rows = await response.json();
    const article = rows?.[0];
    if (!article || (externalId ? !article.is_published : !article.published)) return context.next();

    const titleText = String(article.title || "مواطن | صوت المواطن.. نبض الوطن");
    const descriptionText = String(article.summary || "آخر الأخبار من منصة مواطن الإخبارية");
    const title = esc(titleText);
    const description = esc(descriptionText);
    const body = esc(article.body || article.summary || "").replace(/\r?\n/g, "<br>");
    const rawImage = safeImageUrl(externalId ? article.image_url : article.image);
    const isCloudinaryUpload = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//i.test(rawImage);
    const previewImage = !rawImage ? "" : isCloudinaryUpload
      ? rawImage
      : "https://res.cloudinary.com/lxkdpxpz/image/fetch/f_jpg,q_auto,w_1200/" + encodeURIComponent(rawImage);
    const image = esc(previewImage || rawImage);
    const canonicalUrl = url.origin + url.pathname + "?" + (externalId ? "external=" : "a=") + encodeURIComponent(id!);
    const canonical = esc(canonicalUrl);
    const publishedAt = article.created_at || article.published_at || new Date().toISOString();
    const dateIso = new Date(publishedAt).toISOString();
    const publisherName = "مواطن الإخبارية";
    const articleSchema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
      "headline": titleText,
      "description": descriptionText,
      "datePublished": dateIso,
      "dateModified": dateIso,
      "author": { "@type": "Organization", "name": publisherName, "url": url.origin },
      "publisher": { "@type": "Organization", "name": publisherName, "url": url.origin },
      "articleSection": String(article.category || "أخبار"),
      "inLanguage": "ar"
    };
    if (rawImage) articleSchema.image = [rawImage];
    const jsonLd = JSON.stringify(articleSchema).replace(/</g, "\\u003c");
    const externalNote = externalId && article.article_url
      ? '<p>المصدر الأصلي: <a href="' + esc(article.article_url) + '" rel="nofollow noopener">' + esc(article.source_name || "المصدر") + '</a></p>'
      : "";
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | مواطن الإخبارية</title><meta name="description" content="${description}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="مواطن الإخبارية"><meta property="og:locale" content="ar_YE">
<meta property="og:type" content="article"><meta property="og:title" content="${title}">
<meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${image}"><meta property="og:image:secure_url" content="${image}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${title}"><meta name="twitter:image" content="${image}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<script type="application/ld+json">${jsonLd}</script></head><body>
<main><article><header><p>${esc(article.category || "أخبار")}</p><h1>${title}</h1><p>${description}</p><time datetime="${esc(dateIso)}">${esc(dateIso)}</time></header>
${image ? '<img src="' + image + '" alt="' + title + '" width="1200" style="max-width:100%;height:auto">' : ""}
<div>${body}</div>${externalNote}</article></main>
<a href="${canonical}">افتح الخبر في موقع مواطن</a></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=300" } });
  } catch (error) {
    console.error("Article crawler rendering failed", error);
    return context.next();
  }
};
