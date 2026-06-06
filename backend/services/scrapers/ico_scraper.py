"""ICO (Information Commissioner's Office) enforcement actions scraper."""
import logging
import uuid
from datetime import datetime
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("seema.scrapers.ico")

ICO_ENFORCEMENT_URL = "https://ico.org.uk/action-weve-taken/enforcement/"
ICO_GUIDANCE_URL = "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/"


class ICOScraper:
    def __init__(self):
        self.client = httpx.Client(
            timeout=30,
            headers={"User-Agent": "Seema Compliance Platform/1.0"},
            follow_redirects=True,
        )

    def scrape(self) -> list[dict]:
        results = []
        results.extend(self._scrape_enforcement())
        results.extend(self._scrape_guidance())
        return results

    def _scrape_enforcement(self) -> list[dict]:
        items = []
        try:
            response = self.client.get(ICO_ENFORCEMENT_URL)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            articles = soup.select("article, .case-item, .listing-item, .enforcement-item")
            for article in articles[:15]:
                title_el = article.select_one("h2, h3, a")
                if title_el:
                    items.append({
                        "id": str(uuid.uuid4()),
                        "source": "ICO Enforcement",
                        "title": title_el.get_text(strip=True),
                        "summary": article.get_text(strip=True)[:500],
                        "published_date": datetime.now().strftime("%Y-%m-%d"),
                        "impact_level": "high",
                        "scraped_at": datetime.now().isoformat(),
                    })
        except Exception as e:
            logger.error(f"Failed to scrape ICO enforcement: {e}")
        return items

    def _scrape_guidance(self) -> list[dict]:
        items = []
        try:
            response = self.client.get(ICO_GUIDANCE_URL)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            articles = soup.select("article, .guidance-item, .listing-item")
            for article in articles[:10]:
                title_el = article.select_one("h2, h3, a")
                if title_el:
                    items.append({
                        "id": str(uuid.uuid4()),
                        "source": "ICO Guidance",
                        "title": title_el.get_text(strip=True),
                        "summary": article.get_text(strip=True)[:500],
                        "published_date": datetime.now().strftime("%Y-%m-%d"),
                        "impact_level": "medium",
                        "scraped_at": datetime.now().isoformat(),
                    })
        except Exception as e:
            logger.error(f"Failed to scrape ICO guidance: {e}")
        return items
