"""Law Society practice notes and updates scraper."""
import logging
import uuid
from datetime import datetime
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("seema.scrapers.lawsoc")

LAWSOC_URL = "https://www.lawsociety.org.uk/topics/practice-notes"


class LawSocietyScraper:
    def __init__(self):
        self.client = httpx.Client(
            timeout=30,
            headers={"User-Agent": "Seema Compliance Platform/1.0"},
            follow_redirects=True,
        )

    def scrape(self) -> list[dict]:
        items = []
        try:
            response = self.client.get(LAWSOC_URL)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            articles = soup.select("article, .practice-note, .listing-item, .card")
            for article in articles[:15]:
                title_el = article.select_one("h2, h3, a")
                if title_el:
                    items.append({
                        "id": str(uuid.uuid4()),
                        "source": "Law Society",
                        "title": title_el.get_text(strip=True),
                        "summary": article.get_text(strip=True)[:500],
                        "published_date": datetime.now().strftime("%Y-%m-%d"),
                        "impact_level": "medium",
                        "scraped_at": datetime.now().isoformat(),
                    })
        except Exception as e:
            logger.error(f"Failed to scrape Law Society: {e}")
        return items
