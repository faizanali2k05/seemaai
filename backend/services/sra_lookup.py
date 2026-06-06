"""
SRA Lookup Service

Service for looking up firm details from the Solicitors Regulation Authority (SRA) register.
Provides methods to validate SRA numbers, lookup firms, and search the SRA database.
"""

import httpx
import logging
import re
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from urllib.parse import quote
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class SRALookupService:
    """
    Service for interacting with the SRA (Solicitors Regulation Authority) register.
    Supports firm lookup, validation, and search operations with caching.
    """

    # SRA API and register URLs
    SRA_REGISTER_URL = "https://www.sra.org.uk/consumers/register/organisation/"
    SRA_SEARCH_URL = "https://www.sra.org.uk/consumers/register/"

    # Cache configuration
    CACHE_TTL_SECONDS = 3600  # 1 hour cache

    def __init__(self):
        """Initialize the SRA Lookup Service with empty cache."""
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_timestamps: Dict[str, datetime] = {}
        self.client = httpx.Client(timeout=10.0)

    def __del__(self):
        """Clean up HTTP client on service destruction."""
        try:
            self.client.close()
        except Exception:
            pass

    def _is_cache_valid(self, key: str) -> bool:
        """Check if a cache entry is still valid."""
        if key not in self._cache_timestamps:
            return False
        age = datetime.now() - self._cache_timestamps[key]
        return age.total_seconds() < self.CACHE_TTL_SECONDS

    def _get_cached(self, key: str) -> Optional[Dict[str, Any]]:
        """Retrieve a value from cache if valid."""
        if self._is_cache_valid(key):
            return self._cache.get(key)
        return None

    def _set_cache(self, key: str, value: Dict[str, Any]) -> None:
        """Store a value in cache with timestamp."""
        self._cache[key] = value
        self._cache_timestamps[key] = datetime.now()

    def validate_sra_number(self, sra_number: str) -> bool:
        """
        Validate if an SRA number exists and corresponds to an active firm.

        Args:
            sra_number: The SRA number to validate (e.g., "123456")

        Returns:
            True if the firm is found and active, False otherwise
        """
        if not sra_number or not isinstance(sra_number, str):
            logger.warning(f"Invalid SRA number format: {sra_number}")
            return False

        # Clean SRA number (remove spaces, dashes)
        sra_number = sra_number.strip().replace("-", "").replace(" ", "")

        # Basic format check: SRA numbers are typically 6 digits
        if not re.match(r"^\d{6}$", sra_number):
            logger.warning(f"SRA number does not match expected format: {sra_number}")
            return False

        try:
            result = self.lookup_firm(sra_number)
            if result and result.get("status", "").lower() in ["active", "authorised"]:
                return True
            return False
        except Exception as e:
            logger.error(f"Error validating SRA number {sra_number}: {e}")
            return False

    def lookup_firm(self, sra_number: str) -> Optional[Dict[str, Any]]:
        """
        Look up a firm by SRA number and retrieve details from the SRA register.

        Args:
            sra_number: The SRA number (e.g., "123456")

        Returns:
            Dictionary containing firm details:
            {
                "firm_name": str,
                "sra_number": str,
                "address": str,
                "status": str,
                "practice_areas": List[str],
                "authorised_persons_count": int,
                "telephone": Optional[str],
                "email": Optional[str],
                "website": Optional[str],
                "regulated_activities": List[str]
            }
            Returns None if firm not found or lookup fails
        """
        if not sra_number:
            return None

        # Clean SRA number
        sra_number = sra_number.strip().replace("-", "").replace(" ", "")

        # Check cache first
        cache_key = f"sra_firm_{sra_number}"
        cached_result = self._get_cached(cache_key)
        if cached_result is not None:
            logger.info(f"Returning cached result for SRA {sra_number}")
            return cached_result

        try:
            logger.info(f"Looking up firm with SRA number: {sra_number}")
            url = f"{self.SRA_REGISTER_URL}?sraNumber={quote(sra_number)}"

            response = self.client.get(url)
            response.raise_for_status()

            firm_data = self._parse_firm_page(response.text, sra_number)

            if firm_data:
                self._set_cache(cache_key, firm_data)
                logger.info(f"Successfully looked up firm: {firm_data.get('firm_name')}")
                return firm_data
            else:
                logger.warning(f"Could not parse firm data for SRA {sra_number}")
                return None

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error looking up SRA {sra_number}: {e.status_code}")
            return None
        except Exception as e:
            logger.error(f"Error looking up firm with SRA {sra_number}: {e}")
            return None

    def _parse_firm_page(self, html: str, sra_number: str) -> Optional[Dict[str, Any]]:
        """
        Parse the SRA register HTML page and extract firm information.

        Args:
            html: The HTML content of the SRA register page
            sra_number: The SRA number being looked up

        Returns:
            Dictionary with firm details or None if parsing fails
        """
        try:
            soup = BeautifulSoup(html, "html.parser")

            # Look for main firm name (usually in h1 or main heading)
            firm_name = None
            name_elem = soup.find("h1")
            if name_elem:
                firm_name = name_elem.get_text(strip=True)
            else:
                # Try alternative selectors
                name_elem = soup.find(class_="firm-name") or soup.find(class_="organisation-name")
                if name_elem:
                    firm_name = name_elem.get_text(strip=True)

            if not firm_name:
                logger.warning("Could not extract firm name from page")
                return None

            # Extract status
            status = "active"  # Default
            status_elem = soup.find(class_="status") or soup.find(class_="firm-status")
            if status_elem:
                status = status_elem.get_text(strip=True).lower()

            # Extract address
            address = self._extract_address(soup)

            # Extract contact information
            telephone, email, website = self._extract_contact_info(soup)

            # Extract practice areas
            practice_areas = self._extract_practice_areas(soup)

            # Extract authorised persons count
            auth_persons = self._extract_authorised_persons_count(soup)

            # Extract regulated activities
            regulated_activities = self._extract_regulated_activities(soup)

            firm_data = {
                "firm_name": firm_name,
                "sra_number": sra_number,
                "address": address or "Not available",
                "status": status,
                "practice_areas": practice_areas,
                "authorised_persons_count": auth_persons,
                "telephone": telephone,
                "email": email,
                "website": website,
                "regulated_activities": regulated_activities,
            }

            return firm_data

        except Exception as e:
            logger.error(f"Error parsing SRA firm page: {e}")
            return None

    def _extract_address(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract address from the parsed page."""
        try:
            # Look for address elements
            address_elem = soup.find(class_="address") or soup.find(class_="firm-address")
            if address_elem:
                # Extract all text and clean up
                parts = []
                for line in address_elem.stripped_strings:
                    if line.strip():
                        parts.append(line.strip())
                return ", ".join(parts) if parts else None

            # Alternative: look for paragraph with address pattern
            for p in soup.find_all("p"):
                text = p.get_text()
                if any(uk_postcode_pattern in text for uk_postcode_pattern in ["SW", "E", "W", "N", "S"]):
                    return text.strip()

            return None
        except Exception as e:
            logger.debug(f"Error extracting address: {e}")
            return None

    def _extract_contact_info(self, soup: BeautifulSoup) -> tuple[Optional[str], Optional[str], Optional[str]]:
        """Extract telephone, email, and website from the parsed page."""
        telephone = None
        email = None
        website = None

        try:
            # Look for contact information sections
            contact_section = soup.find(class_="contact") or soup.find(class_="firm-contact")

            if contact_section:
                # Extract telephone
                tel_elem = contact_section.find(class_="phone") or contact_section.find(class_="telephone")
                if tel_elem:
                    telephone = tel_elem.get_text(strip=True)

                # Extract email
                email_elem = contact_section.find(class_="email")
                if email_elem:
                    email = email_elem.get_text(strip=True)

                # Extract website
                website_elem = contact_section.find("a", class_="website")
                if website_elem:
                    website = website_elem.get("href")

            # If not found in contact section, search more broadly
            if not telephone:
                for elem in soup.find_all(href=re.compile(r"^tel:")):
                    telephone = elem.get_text(strip=True)
                    break

            if not email:
                for elem in soup.find_all(href=re.compile(r"^mailto:")):
                    email = elem.get_text(strip=True)
                    break

            return telephone, email, website

        except Exception as e:
            logger.debug(f"Error extracting contact info: {e}")
            return telephone, email, website

    def _extract_practice_areas(self, soup: BeautifulSoup) -> List[str]:
        """Extract practice areas from the parsed page."""
        practice_areas = []

        try:
            # Look for practice areas section
            areas_section = soup.find(class_="practice-areas") or soup.find(class_="areas-of-practice")

            if areas_section:
                # Get all list items or divs within
                items = areas_section.find_all(["li", "div", "span"])
                for item in items:
                    text = item.get_text(strip=True)
                    if text and text not in practice_areas:
                        practice_areas.append(text)

            # Common practice area keywords to look for
            keywords = [
                "Conveyancing", "Litigation", "Family", "Criminal", "Commercial",
                "Employment", "Immigration", "Personal Injury", "Wills", "Probate",
                "Trusts", "Corporate", "Intellectual Property", "Property", "Tax"
            ]

            for keyword in keywords:
                if any(keyword.lower() in p.lower() for p in practice_areas):
                    continue  # Already have it

            return practice_areas[:10]  # Limit to 10 areas

        except Exception as e:
            logger.debug(f"Error extracting practice areas: {e}")
            return practice_areas

    def _extract_authorised_persons_count(self, soup: BeautifulSoup) -> int:
        """Extract the count of authorised persons from the parsed page."""
        try:
            # Look for authorised persons section
            auth_section = soup.find(class_="authorised-persons") or soup.find(class_="partners")

            if auth_section:
                # Look for count in headings or strong elements
                for elem in auth_section.find_all(["h3", "strong"]):
                    text = elem.get_text()
                    match = re.search(r"(\d+)", text)
                    if match:
                        return int(match.group(1))

                # Count list items (assumes each person is a list item)
                persons = auth_section.find_all("li")
                if persons:
                    return len(persons)

            return 0

        except Exception as e:
            logger.debug(f"Error extracting authorised persons count: {e}")
            return 0

    def _extract_regulated_activities(self, soup: BeautifulSoup) -> List[str]:
        """Extract regulated activities from the parsed page."""
        activities = []

        try:
            # Common regulated activities for law firms
            possible_activities = [
                "Reserved legal services",
                "Family law",
                "Criminal law",
                "Conveyancing",
                "Litigation",
                "Probate",
                "Foreign work"
            ]

            activities_section = soup.find(class_="regulated-activities") or soup.find(class_="activities")

            if activities_section:
                text = activities_section.get_text().lower()
                for activity in possible_activities:
                    if activity.lower() in text:
                        activities.append(activity)

            return activities

        except Exception as e:
            logger.debug(f"Error extracting regulated activities: {e}")
            return activities

    def search_firms(self, query: str, limit: int = 10) -> List[Dict[str, str]]:
        """
        Search for firms by name in the SRA register.

        Args:
            query: The firm name or partial name to search for
            limit: Maximum number of results to return

        Returns:
            List of dictionaries containing:
            {
                "firm_name": str,
                "sra_number": str,
                "address": str,
                "status": str
            }
        """
        if not query or not isinstance(query, str):
            logger.warning(f"Invalid search query: {query}")
            return []

        query = query.strip()
        if len(query) < 2:
            logger.warning("Search query too short (minimum 2 characters)")
            return []

        # Check cache
        cache_key = f"sra_search_{query.lower()}"
        cached_result = self._get_cached(cache_key)
        if cached_result is not None:
            logger.info(f"Returning cached search results for: {query}")
            return cached_result

        try:
            logger.info(f"Searching SRA register for: {query}")

            # Use SRA search endpoint
            search_url = f"{self.SRA_SEARCH_URL}?q={quote(query)}"
            response = self.client.get(search_url)
            response.raise_for_status()

            results = self._parse_search_results(response.text, limit)

            if results:
                self._set_cache(cache_key, results)
                logger.info(f"Found {len(results)} firms matching: {query}")
            else:
                logger.warning(f"No firms found matching: {query}")

            return results

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error searching SRA: {e.status_code}")
            return []
        except Exception as e:
            logger.error(f"Error searching SRA register: {e}")
            return []

    def _parse_search_results(self, html: str, limit: int) -> List[Dict[str, str]]:
        """
        Parse search results from the SRA register.

        Args:
            html: The HTML content of the search results page
            limit: Maximum number of results to return

        Returns:
            List of firm dictionaries
        """
        results = []

        try:
            soup = BeautifulSoup(html, "html.parser")

            # Look for search result items
            result_items = soup.find_all(class_="search-result") or soup.find_all(class_="result-item")

            if not result_items:
                # Try finding links with firm information
                result_items = soup.find_all("a", class_="firm-link")

            for item in result_items[:limit]:
                try:
                    firm_name = item.get_text(strip=True)

                    # Extract SRA number from URL or data attribute
                    sra_number = None
                    link = item.find("a") or item
                    href = link.get("href", "")

                    match = re.search(r"sraNumber=(\d+)", href)
                    if match:
                        sra_number = match.group(1)
                    else:
                        # Try to extract from data attribute
                        sra_number = item.get("data-sra-number")

                    if not sra_number:
                        continue

                    # Extract address if available
                    address_elem = item.find(class_="address")
                    address = address_elem.get_text(strip=True) if address_elem else "Not available"

                    # Extract status
                    status_elem = item.find(class_="status")
                    status = status_elem.get_text(strip=True) if status_elem else "unknown"

                    results.append({
                        "firm_name": firm_name,
                        "sra_number": sra_number,
                        "address": address,
                        "status": status,
                    })

                except Exception as e:
                    logger.debug(f"Error parsing individual search result: {e}")
                    continue

            return results

        except Exception as e:
            logger.error(f"Error parsing search results: {e}")
            return []

    def clear_cache(self) -> None:
        """Clear the entire cache."""
        self._cache.clear()
        self._cache_timestamps.clear()
        logger.info("SRA lookup cache cleared")

    def get_cache_stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        return {
            "cached_items": len(self._cache),
            "valid_items": sum(1 for key in self._cache if self._is_cache_valid(key)),
        }
