"""Regulatory feed scrapers — pull updates from SRA, ICO, HMRC, GOV.UK, Law Society.

Each scraper:
  1. Fetches the latest content (RSS feed or HTML page)
  2. Parses titles, dates, summaries, and source URLs
  3. Deduplicates via content_hash (SHA-256 of title + source_url)
  4. Upserts into regulatory_updates table
  5. Triggers AI interpretation for each new notice
  6. Logs the scrape to sra_feed_log
"""
import hashlib
import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from celery_app import app, get_sync_session

logger = logging.getLogger(__name__)

SCRAPER_TIMEOUT = 30  # seconds
USER_AGENT = "Seema-Compliance-Bot/1.0 (+https://seemaai.co.uk)"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _content_hash(title: str, url: str) -> str:
    """SHA-256 hash for deduplication."""
    raw = f"{title.strip().lower()}|{url.strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _clean_text(text: str) -> str:
    """Strip HTML tags and normalise whitespace."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _parse_rss(xml_text: str) -> list[dict]:
    """Parse RSS 2.0 / Atom feed XML into a list of items."""
    items = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.warning(f"XML parse error: {e}")
        return items

    # RSS 2.0
    for item in root.iter("item"):
        title_el = item.find("title")
        link_el = item.find("link")
        desc_el = item.find("description")
        pub_el = item.find("pubDate")
        category_el = item.find("category")

        items.append({
            "title": title_el.text.strip() if title_el is not None and title_el.text else "",
            "source_url": link_el.text.strip() if link_el is not None and link_el.text else "",
            "summary": _clean_text(desc_el.text) if desc_el is not None and desc_el.text else "",
            "published_date": pub_el.text.strip() if pub_el is not None and pub_el.text else "",
            "category": category_el.text.strip() if category_el is not None and category_el.text else "",
        })

    # Atom
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall(".//atom:entry", ns):
        title_el = entry.find("atom:title", ns)
        link_el = entry.find("atom:link", ns)
        summary_el = entry.find("atom:summary", ns) or entry.find("atom:content", ns)
        updated_el = entry.find("atom:updated", ns) or entry.find("atom:published", ns)
        category_el = entry.find("atom:category", ns)

        href = link_el.get("href", "") if link_el is not None else ""
        items.append({
            "title": title_el.text.strip() if title_el is not None and title_el.text else "",
            "source_url": href,
            "summary": _clean_text(summary_el.text) if summary_el is not None and summary_el.text else "",
            "published_date": updated_el.text.strip() if updated_el is not None and updated_el.text else "",
            "category": category_el.get("term", "") if category_el is not None else "",
        })

    return items


def _upsert_updates(session, source: str, items: list[dict]) -> tuple[int, int]:
    """Insert new regulatory updates, skip duplicates via content_hash.

    Returns (items_found, new_items).
    """
    from models.regulatory import RegulatoryUpdate

    new_count = 0
    for item in items:
        if not item.get("title"):
            continue

        ch = _content_hash(item["title"], item.get("source_url", ""))

        # Check for existing
        existing = session.query(RegulatoryUpdate).filter_by(content_hash=ch).first()
        if existing:
            continue

        update = RegulatoryUpdate(
            source=source,
            source_url=item.get("source_url", ""),
            title=item["title"],
            summary=item.get("summary", ""),
            body=item.get("body", ""),
            category=item.get("category", ""),
            published_date=item.get("published_date", ""),
            effective_date=item.get("effective_date", ""),
            impact_level=item.get("impact_level", "medium"),
            tags=item.get("tags", ""),
            content_hash=ch,
        )
        session.add(update)
        new_count += 1

    if new_count > 0:
        session.flush()

    return len(items), new_count


def _log_scrape(session, source: str, items_found: int, new_items: int, status: str = "completed", error_msg: str = None):
    """Write a record to sra_feed_log."""
    from models.compliance import SRAFeedLog
    log = SRAFeedLog(
        feed_source=source,
        last_checked=datetime.utcnow(),
        items_found=items_found,
        new_items=new_items,
        status=status,
        error_message=error_msg,
    )
    session.add(log)


def _trigger_interpretations(session, source: str):
    """Queue AI interpretation for any new updates that don't have one yet.

    This runs after each scrape so firms get interpreted notices automatically.
    """
    from models.regulatory import RegulatoryUpdate, RegulatoryInterpretation
    from models.firm import Firm

    # Get all firm IDs
    firms = session.query(Firm.id).all()
    firm_ids = [f[0] for f in firms]

    # Get recent updates without interpretations
    recent_updates = (
        session.query(RegulatoryUpdate)
        .filter(RegulatoryUpdate.source == source)
        .order_by(RegulatoryUpdate.created_at.desc())
        .limit(10)
        .all()
    )

    for update in recent_updates:
        for firm_id in firm_ids:
            existing = (
                session.query(RegulatoryInterpretation)
                .filter_by(update_id=update.id, firm_id=firm_id)
                .first()
            )
            if not existing:
                # Queue async interpretation task
                interpret_regulatory_update.delay(update.id, firm_id)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

@app.task(name="tasks.regulatory_tasks.poll_all_feeds")
def poll_all_feeds():
    """Poll all regulatory feeds for new updates."""
    logger.info("Polling all regulatory feeds")
    results = {}
    for feed_task in [scrape_sra, scrape_ico, scrape_hmrc, scrape_govuk, scrape_law_society]:
        try:
            result = feed_task()
            results[feed_task.__name__] = result
        except Exception as e:
            logger.error(f"Feed {feed_task.__name__} failed: {e}")
            results[feed_task.__name__] = {"error": str(e)}
    return results


# ---------------------------------------------------------------------------
# SRA Scraper — uses the SRA news feed
# ---------------------------------------------------------------------------

SRA_FEED_URL = "https://www.sra.org.uk/sra/news/press/"
SRA_UPDATES_URL = "https://www.sra.org.uk/sra/news/updates/"

@app.task(name="tasks.regulatory_tasks.scrape_sra", bind=True, max_retries=3)
def scrape_sra(self):
    """Scrape SRA press releases and regulatory updates."""
    session = get_sync_session()
    try:
        items = []

        # Scrape SRA press / news page
        for url in [SRA_FEED_URL, SRA_UPDATES_URL]:
            try:
                resp = httpx.get(url, headers=HEADERS, timeout=SCRAPER_TIMEOUT, follow_redirects=True)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, "html.parser")

                # SRA uses article cards with h3 links
                for article in soup.select("article, .news-item, .listing-item, .search-result"):
                    link_el = article.find("a", href=True)
                    title_el = article.find(["h2", "h3", "h4"])
                    date_el = article.find(["time", ".date", ".meta-date"])
                    summary_el = article.find(["p", ".summary", ".description"])

                    title = title_el.get_text(strip=True) if title_el else (link_el.get_text(strip=True) if link_el else "")
                    if not title:
                        continue

                    href = link_el["href"] if link_el else ""
                    if href and not href.startswith("http"):
                        href = f"https://www.sra.org.uk{href}"

                    date_text = ""
                    if date_el:
                        date_text = date_el.get("datetime", "") or date_el.get_text(strip=True)

                    items.append({
                        "title": title,
                        "source_url": href,
                        "summary": summary_el.get_text(strip=True) if summary_el else "",
                        "published_date": date_text,
                        "category": "regulatory_update",
                        "impact_level": "medium",
                    })
            except httpx.HTTPError as e:
                logger.warning(f"SRA page {url} fetch failed: {e}")

        found, new = _upsert_updates(session, "sra", items)
        _log_scrape(session, "sra.org.uk", found, new)
        session.commit()

        if new > 0:
            _trigger_interpretations(session, "sra")
            session.commit()

        logger.info(f"SRA scrape: {found} found, {new} new")
        return {"source": "sra", "items_found": found, "new_items": new}

    except Exception as e:
        session.rollback()
        _log_scrape(session, "sra.org.uk", 0, 0, "error", str(e))
        session.commit()
        logger.error(f"SRA scrape failed: {e}")
        raise self.retry(exc=e, countdown=60 * 5)
    finally:
        session.close()


# ---------------------------------------------------------------------------
# ICO Scraper — ICO action we've taken / enforcement page
# ---------------------------------------------------------------------------

ICO_NEWS_URL = "https://ico.org.uk/action-weve-taken/"
ICO_GUIDANCE_URL = "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/"

@app.task(name="tasks.regulatory_tasks.scrape_ico", bind=True, max_retries=3)
def scrape_ico(self):
    """Scrape ICO enforcement actions and guidance updates."""
    session = get_sync_session()
    try:
        items = []

        for url in [ICO_NEWS_URL, ICO_GUIDANCE_URL]:
            try:
                resp = httpx.get(url, headers=HEADERS, timeout=SCRAPER_TIMEOUT, follow_redirects=True)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, "html.parser")

                # ICO uses various listing patterns
                for item_el in soup.select(".search-result, .listing-item, article, .card"):
                    link_el = item_el.find("a", href=True)
                    title_el = item_el.find(["h2", "h3", "h4"])
                    date_el = item_el.find(["time", ".date", "span.meta"])
                    summary_el = item_el.find(["p", ".summary"])

                    title = title_el.get_text(strip=True) if title_el else (link_el.get_text(strip=True) if link_el else "")
                    if not title:
                        continue

                    href = link_el["href"] if link_el else ""
                    if href and not href.startswith("http"):
                        href = f"https://ico.org.uk{href}"

                    date_text = ""
                    if date_el:
                        date_text = date_el.get("datetime", "") or date_el.get_text(strip=True)

                    category = "enforcement" if "action" in url else "guidance"
                    items.append({
                        "title": title,
                        "source_url": href,
                        "summary": summary_el.get_text(strip=True) if summary_el else "",
                        "published_date": date_text,
                        "category": category,
                        "impact_level": "high" if category == "enforcement" else "medium",
                    })
            except httpx.HTTPError as e:
                logger.warning(f"ICO page {url} fetch failed: {e}")

        found, new = _upsert_updates(session, "ico", items)
        _log_scrape(session, "ico.org.uk", found, new)
        session.commit()

        if new > 0:
            _trigger_interpretations(session, "ico")
            session.commit()

        logger.info(f"ICO scrape: {found} found, {new} new")
        return {"source": "ico", "items_found": found, "new_items": new}

    except Exception as e:
        session.rollback()
        _log_scrape(session, "ico.org.uk", 0, 0, "error", str(e))
        session.commit()
        logger.error(f"ICO scrape failed: {e}")
        raise self.retry(exc=e, countdown=60 * 5)
    finally:
        session.close()


# ---------------------------------------------------------------------------
# HMRC Scraper — AML supervision updates and tax guidance
# ---------------------------------------------------------------------------

HMRC_AML_URL = "https://www.gov.uk/government/collections/anti-money-laundering-and-counter-terrorist-financing-supervision"
HMRC_NEWS_URL = "https://www.gov.uk/government/organisations/hm-revenue-customs.atom"

@app.task(name="tasks.regulatory_tasks.scrape_hmrc", bind=True, max_retries=3)
def scrape_hmrc(self):
    """Scrape HMRC AML supervision updates and relevant tax guidance."""
    session = get_sync_session()
    try:
        items = []

        # Try Atom feed first (GOV.UK provides Atom feeds for organisations)
        try:
            resp = httpx.get(HMRC_NEWS_URL, headers={**HEADERS, "Accept": "application/atom+xml"}, timeout=SCRAPER_TIMEOUT, follow_redirects=True)
            resp.raise_for_status()

            feed_items = _parse_rss(resp.text)
            # Filter for AML / legal services relevance
            aml_keywords = {"money laundering", "aml", "terrorist financing", "suspicious activity",
                           "legal sector", "law firm", "solicitor", "professional body", "supervision"}
            for fi in feed_items:
                combined = f"{fi['title']} {fi['summary']}".lower()
                if any(kw in combined for kw in aml_keywords):
                    fi["category"] = "aml_supervision"
                    fi["impact_level"] = "high"
                    items.append(fi)
        except httpx.HTTPError as e:
            logger.warning(f"HMRC Atom feed failed: {e}")

        # Also scrape the AML collection page
        try:
            resp = httpx.get(HMRC_AML_URL, headers=HEADERS, timeout=SCRAPER_TIMEOUT, follow_redirects=True)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            for item_el in soup.select(".gem-c-document-list__item, .group-document-list li, article"):
                link_el = item_el.find("a", href=True)
                title_el = item_el.find(["h2", "h3", "h4"]) or link_el
                date_el = item_el.find(["time", ".date"])
                summary_el = item_el.find("p")

                title = title_el.get_text(strip=True) if title_el else ""
                if not title:
                    continue

                href = link_el["href"] if link_el else ""
                if href and not href.startswith("http"):
                    href = f"https://www.gov.uk{href}"

                items.append({
                    "title": title,
                    "source_url": href,
                    "summary": summary_el.get_text(strip=True) if summary_el else "",
                    "published_date": date_el.get("datetime", "") if date_el else "",
                    "category": "aml_supervision",
                    "impact_level": "high",
                })
        except httpx.HTTPError as e:
            logger.warning(f"HMRC AML page fetch failed: {e}")

        found, new = _upsert_updates(session, "hmrc", items)
        _log_scrape(session, "hmrc.gov.uk", found, new)
        session.commit()

        if new > 0:
            _trigger_interpretations(session, "hmrc")
            session.commit()

        logger.info(f"HMRC scrape: {found} found, {new} new")
        return {"source": "hmrc", "items_found": found, "new_items": new}

    except Exception as e:
        session.rollback()
        _log_scrape(session, "hmrc.gov.uk", 0, 0, "error", str(e))
        session.commit()
        logger.error(f"HMRC scrape failed: {e}")
        raise self.retry(exc=e, countdown=60 * 5)
    finally:
        session.close()


# ---------------------------------------------------------------------------
# GOV.UK Scraper — Ministry of Justice legal services news
# ---------------------------------------------------------------------------

GOVUK_MOJ_ATOM = "https://www.gov.uk/government/organisations/ministry-of-justice.atom"
GOVUK_LEGAL_URL = "https://www.gov.uk/government/organisations/legal-aid-agency.atom"

@app.task(name="tasks.regulatory_tasks.scrape_govuk", bind=True, max_retries=3)
def scrape_govuk(self):
    """Scrape GOV.UK for MOJ and legal sector announcements."""
    session = get_sync_session()
    try:
        items = []

        for feed_url in [GOVUK_MOJ_ATOM, GOVUK_LEGAL_URL]:
            try:
                resp = httpx.get(feed_url, headers={**HEADERS, "Accept": "application/atom+xml"}, timeout=SCRAPER_TIMEOUT, follow_redirects=True)
                resp.raise_for_status()

                feed_items = _parse_rss(resp.text)
                # Filter for legal profession relevance
                legal_keywords = {"solicitor", "law firm", "legal services", "legal profession",
                                 "courts", "tribunal", "legal aid", "justice", "regulation",
                                 "compliance", "professional conduct", "anti-money laundering"}
                for fi in feed_items:
                    combined = f"{fi['title']} {fi['summary']}".lower()
                    if any(kw in combined for kw in legal_keywords):
                        fi["category"] = fi.get("category") or "government_announcement"
                        fi["impact_level"] = "medium"
                        items.append(fi)
            except httpx.HTTPError as e:
                logger.warning(f"GOV.UK feed {feed_url} failed: {e}")

        found, new = _upsert_updates(session, "govuk", items)
        _log_scrape(session, "gov.uk", found, new)
        session.commit()

        if new > 0:
            _trigger_interpretations(session, "govuk")
            session.commit()

        logger.info(f"GOV.UK scrape: {found} found, {new} new")
        return {"source": "govuk", "items_found": found, "new_items": new}

    except Exception as e:
        session.rollback()
        _log_scrape(session, "gov.uk", 0, 0, "error", str(e))
        session.commit()
        logger.error(f"GOV.UK scrape failed: {e}")
        raise self.retry(exc=e, countdown=60 * 5)
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Law Society Scraper
# ---------------------------------------------------------------------------

LAW_SOCIETY_URL = "https://www.lawsociety.org.uk/topics/regulation/"
LAW_SOCIETY_NEWS = "https://www.lawsociety.org.uk/news/"

@app.task(name="tasks.regulatory_tasks.scrape_law_society", bind=True, max_retries=3)
def scrape_law_society(self):
    """Scrape Law Society for practice notes and regulatory guidance."""
    session = get_sync_session()
    try:
        items = []

        for url in [LAW_SOCIETY_URL, LAW_SOCIETY_NEWS]:
            try:
                resp = httpx.get(url, headers=HEADERS, timeout=SCRAPER_TIMEOUT, follow_redirects=True)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, "html.parser")

                for item_el in soup.select("article, .card, .listing-item, .search-result, .news-item"):
                    link_el = item_el.find("a", href=True)
                    title_el = item_el.find(["h2", "h3", "h4"])
                    date_el = item_el.find(["time", ".date", ".meta-date"])
                    summary_el = item_el.find(["p", ".summary", ".excerpt"])

                    title = title_el.get_text(strip=True) if title_el else (link_el.get_text(strip=True) if link_el else "")
                    if not title:
                        continue

                    href = link_el["href"] if link_el else ""
                    if href and not href.startswith("http"):
                        href = f"https://www.lawsociety.org.uk{href}"

                    items.append({
                        "title": title,
                        "source_url": href,
                        "summary": summary_el.get_text(strip=True) if summary_el else "",
                        "published_date": date_el.get("datetime", "") if date_el else (date_el.get_text(strip=True) if date_el else ""),
                        "category": "practice_guidance",
                        "impact_level": "medium",
                    })
            except httpx.HTTPError as e:
                logger.warning(f"Law Society page {url} fetch failed: {e}")

        found, new = _upsert_updates(session, "lawsociety", items)
        _log_scrape(session, "lawsociety.org.uk", found, new)
        session.commit()

        if new > 0:
            _trigger_interpretations(session, "lawsociety")
            session.commit()

        logger.info(f"Law Society scrape: {found} found, {new} new")
        return {"source": "lawsociety", "items_found": found, "new_items": new}

    except Exception as e:
        session.rollback()
        _log_scrape(session, "lawsociety.org.uk", 0, 0, "error", str(e))
        session.commit()
        logger.error(f"Law Society scrape failed: {e}")
        raise self.retry(exc=e, countdown=60 * 5)
    finally:
        session.close()


# ---------------------------------------------------------------------------
# AI Interpretation Task — runs per-update per-firm
# ---------------------------------------------------------------------------

@app.task(name="tasks.regulatory_tasks.interpret_regulatory_update", bind=True, max_retries=2)
def interpret_regulatory_update(self, update_id: str, firm_id: str):
    """Generate an AI interpretation of a regulatory update for a specific firm.

    Calls services.regulatory_analysis.interpret() which uses the Anthropic API.
    """
    session = get_sync_session()
    try:
        from services.regulatory_analysis import interpret
        result = interpret(session, update_id, firm_id)
        session.commit()
        logger.info(f"Interpreted update {update_id} for firm {firm_id}: applicability={result.get('applicability')}")
        return result
    except Exception as e:
        session.rollback()
        logger.error(f"Interpretation failed for update {update_id}, firm {firm_id}: {e}")
        # Mark as failed
        from models.regulatory import RegulatoryInterpretation
        interp = session.query(RegulatoryInterpretation).filter_by(update_id=update_id, firm_id=firm_id).first()
        if interp and interp.status == "processing":
            interp.status = "failed"
            interp.error_message = str(e)
            session.commit()
        raise self.retry(exc=e, countdown=60 * 2)
    finally:
        session.close()
