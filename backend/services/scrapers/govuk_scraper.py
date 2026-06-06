"""GOV.UK Content API scraper for HMRC and legislative updates."""
import logging
import uuid
from datetime import datetime
import httpx

logger = logging.getLogger("seema.scrapers.govuk")

GOVUK_API = "https://www.gov.uk/api/search.json"

# Search terms relevant to law firm compliance
SEARCH_QUERIES = [
    "solicitors regulation",
    "anti money laundering legal sector",
    "legal services act",
    "proceeds of crime",
    "HMRC trust registration",
]


class GovUKScraper:
    def __init__(self):
        self.client = httpx.Client(
            timeout=30,
            headers={"User-Agent": "Seema Compliance Platform/1.0"},
        )

    def scrape(self) -> list[dict]:
        items = []
        seen_titles = set()

        for query in SEARCH_QUERIES:
            try:
                response = self.client.get(
                    GOVUK_API,
                    params={
                        "q": query,
                        "count": 5,
                        "order": "-public_timestamp",
                    },
                )
                response.raise_for_status()
                data = response.json()

                for result in data.get("results", []):
                    title = result.get("title", "")
                    if title in seen_titles:
                        continue
                    seen_titles.add(title)

                    items.append({
                        "id": str(uuid.uuid4()),
                        "source": "GOV.UK",
                        "title": title,
                        "summary": result.get("description", "")[:500],
                        "published_date": result.get("public_timestamp", "")[:10],
                        "url": f"https://www.gov.uk{result.get('link', '')}",
                        "impact_level": self._assess_impact(title),
                        "scraped_at": datetime.now().isoformat(),
                    })
            except Exception as e:
                logger.error(f"Failed to scrape GOV.UK for '{query}': {e}")

        return items

    def _assess_impact(self, title: str) -> str:
        high_keywords = ["regulation", "enforcement", "penalty", "fine", "mandatory", "requirement"]
        title_lower = title.lower()
        if any(kw in title_lower for kw in high_keywords):
            return "high"
        return "medium"
