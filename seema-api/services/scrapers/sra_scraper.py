"""SRA (Solicitors Regulation Authority) news and warning notices scraper."""
import logging
import uuid
from datetime import datetime
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("seema.scrapers.sra")

SRA_NEWS_URL = "https://www.sra.org.uk/sra/news/"
SRA_WARNINGS_URL = "https://www.sra.org.uk/consumers/register/wn/"
SRA_DECISIONS_URL = "https://www.sra.org.uk/consumers/solicitor-check/disciplinary-decisions/"


class SRAScraper:
    def __init__(self):
        self.client = httpx.Client(
            timeout=30,
            headers={"User-Agent": "Seema Compliance Platform/1.0"},
            follow_redirects=True,
        )

    def scrape(self) -> list[dict]:
        results = []
        results.extend(self._scrape_news())
        results.extend(self._scrape_warning_notices())
        return results

    def _scrape_news(self) -> list[dict]:
        items = []
        try:
            response = self.client.get(SRA_NEWS_URL)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            articles = soup.select("article, .news-item, .listing-item")
            for article in articles[:20]:
                title_el = article.select_one("h2, h3, .title, a")
                date_el = article.select_one("time, .date, .meta")
                link_el = article.select_one("a[href]")

                if title_el:
                    items.append({
                        "id": str(uuid.uuid4()),
                        "source": "SRA",
                        "title": title_el.get_text(strip=True),
                        "summary": article.get_text(strip=True)[:500],
                        "published_date": date_el.get_text(strip=True) if date_el else datetime.now().strftime("%Y-%m-%d"),
                        "url": link_el["href"] if link_el and link_el.has_attr("href") else "",
                        "impact_level": "medium",
                        "scraped_at": datetime.now().isoformat(),
                    })
        except Exception as e:
            logger.error(f"Failed to scrape SRA news: {e}")
        return items

    def _scrape_warning_notices(self) -> list[dict]:
        items = []
        try:
            response = self.client.get(SRA_WARNINGS_URL)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            entries = soup.select("tr, .warning-notice, .listing-item")
            for entry in entries[:20]:
                name_el = entry.select_one("td:first-child, .name, h3")
                if name_el and name_el.get_text(strip=True):
                    items.append({
                        "id": str(uuid.uuid4()),
                        "source": "SRA Warning Notice",
                        "title": f"Warning Notice: {name_el.get_text(strip=True)}",
                        "summary": entry.get_text(strip=True)[:500],
                        "published_date": datetime.now().strftime("%Y-%m-%d"),
                        "impact_level": "high",
                        "scraped_at": datetime.now().isoformat(),
                    })
        except Exception as e:
            logger.error(f"Failed to scrape SRA warnings: {e}")
        return items
