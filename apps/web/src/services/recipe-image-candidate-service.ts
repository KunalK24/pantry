import { validateUrl } from "@/services/recipe-url-acquisition-service";

function addImageUrl(candidates: string[], raw: string, pageUrl: string) {
  try {
    const resolved = new URL(raw.replace(/&amp;/g, "&"), pageUrl);
    const url = validateUrl(resolved.href);
    if (!candidates.includes(url.href)) {
      candidates.push(url.href);
    }
  } catch {
    // Ignore malformed and unsafe URLs supplied by the page.
  }
}

function recipeImagesFromJsonLd(html: string): unknown[] {
  const images: unknown[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const value: unknown = JSON.parse(match[1]);
      const visit = (node: unknown) => {
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (!node || typeof node !== "object") {
          return;
        }
        const item = node as Record<string, unknown>;
        const types = Array.isArray(item["@type"])
          ? item["@type"]
          : [item["@type"]];
        if (
          types.some(
            (type) => typeof type === "string" && type.toLowerCase() === "recipe",
          )
        ) {
          images.push(...(Array.isArray(item.image) ? item.image : [item.image]));
        }
        if (item["@graph"]) {
          visit(item["@graph"]);
        }
      };
      visit(value);
    } catch {
      // Ignore invalid structured data supplied by the page.
    }
  }
  return images;
}

export function imageCandidatesFromHtml(
  html: string,
  pageUrl: string,
): string[] {
  const candidates: string[] = [];
  for (const image of recipeImagesFromJsonLd(html)) {
    if (typeof image === "string") {
      addImageUrl(candidates, image, pageUrl);
    } else if (
      image &&
      typeof image === "object" &&
      "url" in image &&
      typeof image.url === "string"
    ) {
      addImageUrl(candidates, image.url, pageUrl);
    }
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/(?:og:image|twitter:image)/i.test(tag)) {
      continue;
    }
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if (content) {
      addImageUrl(candidates, content, pageUrl);
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const lazySource = tag.match(/\sdata-src\s*=\s*["']([^"']+)["']/i)?.[1];
    const source = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1];
    for (const candidate of [lazySource, source]) {
      if (candidate) {
        addImageUrl(candidates, candidate, pageUrl);
      }
    }
    if (candidates.length >= 40) {
      break;
    }
  }
  return candidates.slice(0, 40);
}

export function imageCandidatesFromMarkdown(
  markdown: string,
  pageUrl: string,
): string[] {
  const candidates: string[] = [];
  for (const match of markdown.matchAll(
    /!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/g,
  )) {
    addImageUrl(candidates, match[1], pageUrl);
    if (candidates.length >= 40) {
      break;
    }
  }
  return candidates;
}
