import { describe, expect, it } from "vitest";
import { imageCandidatesFromHtml, imageCandidatesFromMarkdown } from "./recipe-image-candidate-service";

describe("recipe page image candidates", () => {
  it("keeps page image URLs and resolves relative paths", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Recipe","image":{"url":"/dish.jpg"}}]}</script><meta property="og:image" content="/dish.jpg"><img src="https://example.com/step.png"><img src="/dish.jpg">`;
    expect(imageCandidatesFromHtml(html, "https://example.com/recipe")).toEqual([
      "https://example.com/dish.jpg",
      "https://example.com/step.png",
    ]);
  });

  it("extracts image links from scraper markdown", () => {
    expect(imageCandidatesFromMarkdown("![Dish](https://example.com/dish.webp)", "https://example.com/recipe")).toEqual([
      "https://example.com/dish.webp",
    ]);
  });

  it("includes a lazy image URL when src is only a placeholder", () => {
    const html = `<img class="lazy" src="data:image/gif;base64,R0lGODlhAQAB" data-src="/finished-dish.jpg">`;
    expect(imageCandidatesFromHtml(html, "https://example.com/recipe")).toEqual([
      "https://example.com/finished-dish.jpg",
    ]);
  });

  it("omits localhost and private image URLs", () => {
    const html = `<meta property="og:image" content="http://127.0.0.1/private.jpg"><img src="http://localhost/local.jpg"><img src="https://example.com/dish.jpg">`;
    expect(imageCandidatesFromHtml(html, "https://example.com/recipe")).toEqual([
      "https://example.com/dish.jpg",
    ]);
    expect(imageCandidatesFromMarkdown(
      "![local](http://192.168.1.2/private.jpg) ![dish](https://example.com/dish.jpg)",
      "https://example.com/recipe",
    )).toEqual(["https://example.com/dish.jpg"]);
  });
});
