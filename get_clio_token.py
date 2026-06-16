#!/usr/bin/env python3
"""
One-time Clio OAuth helper — mints a WRITE-capable access token for seeding.

Runs a tiny local callback server, prints the authorize URL, captures the
redirect `code`, exchanges it for an access token, and saves it to
clio_write_token.txt (and prints it).

Prereq: add the redirect URI below to the Clio app's "Redirect URIs" list.

    CLIO_CLIENT_ID=...  CLIO_CLIENT_SECRET=...  python get_clio_token.py
"""
import os, sys, json, time, webbrowser, urllib.parse, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer

API_BASE      = os.environ.get("CLIO_API_BASE", "https://eu.app.clio.com").rstrip("/")
CLIENT_ID     = os.environ.get("CLIO_CLIENT_ID", "").strip()
CLIENT_SECRET = os.environ.get("CLIO_CLIENT_SECRET", "").strip()
REDIRECT      = os.environ.get("OAUTH_REDIRECT", "http://localhost:8765/callback").strip()
PORT          = urllib.parse.urlparse(REDIRECT).port or 8765

_result = {}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        if "code" in params:
            _result["code"] = params["code"][0]
            self.wfile.write("<h2>✓ Authorization received. Close this tab and return to the terminal.</h2>".encode())
        else:
            err = params.get("error_description", params.get("error", ["no code"]))[0]
            _result["error"] = err
            self.wfile.write(f"<h2>Authorization failed: {err}</h2>".encode())

    def log_message(self, *a):
        pass


def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        print("ERROR: set CLIO_CLIENT_ID and CLIO_CLIENT_SECRET"); sys.exit(1)

    authorize = (f"{API_BASE}/oauth/authorize?response_type=code"
                 f"&client_id={urllib.parse.quote(CLIENT_ID)}"
                 f"&redirect_uri={urllib.parse.quote(REDIRECT, safe='')}"
                 f"&state=seed-write-token")

    print("AUTHORIZE_URL: " + authorize, flush=True)
    print(f"Listening on {REDIRECT} (up to 9 min)...", flush=True)
    try:
        webbrowser.open(authorize)
    except Exception:
        pass

    server = HTTPServer(("127.0.0.1", PORT), Handler)
    server.timeout = 5
    deadline = time.time() + 540
    while not _result and time.time() < deadline:
        server.handle_request()

    if "error" in _result:
        print("OAUTH_ERROR: " + _result["error"]); sys.exit(2)
    if "code" not in _result:
        print("TIMEOUT: no authorization received. Re-run and open the URL."); sys.exit(2)

    print("Exchanging code for token...", flush=True)
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": _result["code"],
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT,
    }).encode()
    req = urllib.request.Request(f"{API_BASE}/oauth/token", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            tok = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("TOKEN_EXCHANGE_FAILED: HTTP %s: %s" % (e.code, e.read().decode()[:300])); sys.exit(3)

    access = tok.get("access_token", "")
    with open("clio_write_token.txt", "w") as f:
        f.write(access)
    print("TOKEN_OK expires_in=%s scope=%s" % (tok.get("expires_in"), tok.get("scope")))
    print("ACCESS_TOKEN=" + access)


if __name__ == "__main__":
    main()
