
import os
import re
import hashlib
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "User-Agent": "OdishaJobAlertBot/1.0"
}

KEYWORDS = [
    "recruitment", "advertisement", "notification",
    "vacancy", "career", "job", "engagement",
    "selection", "apply online", "appointment"
]

session = requests.Session()
session.headers.update({
    "User-Agent": "OdishaJobAlertBot/1.0"
})


def db_request(method, endpoint, **kwargs):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    response = requests.request(
        method, url, headers=HEADERS,
        timeout=30, **kwargs
    )
    response.raise_for_status()
    return response


def get_sources():
    response = db_request(
        "GET",
        "job_sources?select=id,name,website_url&enabled=eq.true"
    )
    return response.json()


def clean_url(url):
    url, _ = urldefrag(url)
    return url.rstrip("/")


def is_relevant(text, url):
    combined = f"{text} {url}".lower()
    return any(word in combined for word in KEYWORDS)


def get_candidate_links(source):
    root_url = source["website_url"]
    root_host = urlparse(root_url).netloc

    pages_to_check = [root_url]
    candidates = {}

    # Discover recruitment / notice section pages
    try:
        response = session.get(root_url, timeout=25)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        for a in soup.find_all("a", href=True):
            href = clean_url(urljoin(root_url, a["href"]))
            text = a.get_text(" ", strip=True)

            if urlparse(href).netloc != root_host:
                continue

            if is_relevant(text, href):
                pages_to_check.append(href)

    except requests.RequestException as e:
        print(f"Homepage error: {e}")

    # Check homepage and discovered section pages
    for page_url in list(dict.fromkeys(pages_to_check))[:10]:
        try:
            response = session.get(page_url, timeout=25)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            for a in soup.find_all("a", href=True):
                href = clean_url(urljoin(page_url, a["href"]))
                title = a.get_text(" ", strip=True)

                if urlparse(href).netloc != root_host:
                    continue

                if not title:
                    title = os.path.basename(urlparse(href).path)

                path = urlparse(href).path.lower()

                if is_relevant(title, href) or path.endswith(".pdf"):
                    if len(title) >= 3:
                        candidates[href] = title[:250]

        except requests.RequestException as e:
            print(f"Page error: {page_url} | {e}")

    return candidates


def save_job(source, title, notification_url):
    source_id = hashlib.sha256(
        notification_url.encode("utf-8")
    ).hexdigest()

    payload = {
        "title": title,
        "department": source["name"],
        "notification_url": notification_url,
        "source_name": source["name"],
        "source_id": source_id,
        "location": "Odisha",
        "status": "pending"
    }

    response = db_request(
        "POST",
        "jobs?on_conflict=source_id",
        params={"on_conflict": "source_id"},
        headers={
            **HEADERS,
            "Prefer": "resolution=ignore-duplicates,return=minimal"
        },
        json=payload
    )

    return response.status_code in (200, 201, 204)


def save_log(source_name, status, count, message):
    try:
        db_request(
            "POST",
            "scan_logs",
            json={
                "source_name": source_name,
                "status": status,
                "jobs_found": count,
                "message": message[:1000]
            }
        )
    except Exception as e:
        print(f"Log error: {e}")


def scan_source(source):
    name = source["name"]
    print(f"\nScanning: {name}")

    found = 0

    try:
        candidates = get_candidate_links(source)

        for url, title in candidates.items():
            save_job(source, title, url)
            found += 1
            print(f"Found: {title} | {url}")

        save_log(
            name, "success", found,
            "Scan completed. Candidates detected; duplicates ignored."
        )

        print(f"Completed: {name} | {found} candidates")

    except Exception as e:
        save_log(name, "error", found, str(e))
        print(f"Scanner error: {name} | {e}")


def main():
    print("=== Odisha Job Alert Scanner ===")

    sources = get_sources()

    if not sources:
        print("No enabled job sources found.")
        return

    for source in sources:
        scan_source(source)

    print("\n=== Scanner Finished ===")


if __name__ == "__main__":
    main()
