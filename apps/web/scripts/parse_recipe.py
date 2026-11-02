"""Bounded stdin/stdout bridge to the original recipe_scrapers package."""

import json
import sys

from recipe_scrapers import scrape_html

MAX_INPUT_BYTES = 2 * 1024 * 1024


def main():
    payload = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(payload) > MAX_INPUT_BYTES:
        raise ValueError("parser input too large")
    request = json.loads(payload)
    if not isinstance(request, dict):
        raise ValueError("invalid parser input")
    html, url = request.get("html"), request.get("url")
    if not isinstance(html, str) or not isinstance(url, str) or not html or not url:
        raise ValueError("invalid parser input")

    scraper = scrape_html(html, org_url=url, supported_only=False)
    result = {
        "name": scraper.title(),
        "ingredients": scraper.ingredients(),
        "instructions": scraper.instructions_list(),
    }
    try:
        result["description"] = scraper.description()
    except Exception:
        pass
    try:
        total_time = scraper.total_time()
        if isinstance(total_time, int) and not isinstance(total_time, bool) and total_time > 0:
            result["timeMinutes"] = total_time
    except Exception:
        pass
    try:
        category = scraper.schema.data.get("recipeCategory")
        if isinstance(category, str):
            categories = [category]
        elif isinstance(category, list):
            categories = [item for item in category if isinstance(item, str)]
        else:
            categories = []
        for category in categories:
            normalized = category.strip().lower()
            if normalized in {"breakfast", "lunch", "dinner", "snack"}:
                result["mealType"] = normalized
                break
    except Exception:
        pass
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(type(exc).__name__, file=sys.stderr)
        sys.exit(1)
