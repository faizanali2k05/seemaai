#!/usr/bin/env python3
"""
LARGE Clio Manage seed dataset (EU pod) engineered to exercise Seema's features.

Goal: populate your Clio firm with 100+ matters and supporting records so that,
once Seema syncs from Clio, every NON-ADMIN Seema feature has realistic data to
work against. Each record is tagged [SEED] so you can find/clean it later.

------------------------------------------------------------------------------
SEEMA FEATURE  ->  WHAT THIS SCRIPT CREATES IN CLIO  ->  WHAT TO TEST
------------------------------------------------------------------------------
Compliance Scan   All of the below                Run a scan; expect findings
                                                   across AML, conflicts, deadlines.
File Review       120 matters, varied status/age,  Review queue should populate;
                  responsible solicitor set        stale/old matters flagged.
Conflict Check    Shared opposing parties reused    Same party on multiple matters
                  across many matters               -> conflict hits.
AML / CDD         Contacts w/ risk custom fields    High-risk + PEP + unverified
                  (high/med/low, PEP, ID verified)  clients surface for review.
Compliance        Calendar entries + tasks with     Upcoming + overdue deadlines.
  Deadlines       due dates (some overdue)
Chasers           Overdue tasks tagged CHASER       Outstanding items to chase.
Remediation       Tasks tagged REMEDIATION          Remediation queue populated.
Undertakings      Matters w/ 'Undertaking Given'    Open undertakings w/ due dates;
                  custom field + dated tasks        some overdue.
Supervision       Activities spread across users    Who is doing work on what;
                                                     junior vs supervisor.
Staff & Training  Reads firm Users (existing)       Staff list / training status.
Reconciliation    See NOTE below (mostly manual)
Complaints        Matters in 'Complaints' area      Complaint matters list.
Breach Logs /     Seema-native -- NOT from Clio.     Create these inside Seema.
Policies /        (see NOTE below)
Regulatory /
Alerts

NOTES / HONEST LIMITS
- Reconciliation needs trust/client-account ledger entries. Clio's trust
  transaction API is restrictive and firm-config dependent; this script does NOT
  fabricate trust ledgers. Set up one Trust account + a couple of bills/payments
  in the Clio UI to test Reconciliation, or tell me and I'll attempt the trust API.
- Breach Logs, Policies, Regulatory Updates, Alerts appear to be Seema-internal
  (fed by SRA feeds / manual entry), so they won't arrive via Clio sync. Populate
  them directly in Seema.
- Custom fields: the script CREATES the custom fields it needs (AML Risk Level,
  PEP, ID Verified, Undertaking Given, Conflict Checked). If Seema expects
  DIFFERENT field names, rename them in Clio Settings or tell me the exact names.

USAGE
  export CLIO_ACCESS_TOKEN="ey..."          # EU-pod token for your firm
  python3 seed_clio_large.py                # full run
  python3 seed_clio_large.py --dry-run      # print plan, create nothing

TUNING (env vars, all optional)
  SEED_MATTERS=120 SEED_PEOPLE=45 SEED_COMPANIES=25
  SEED_TASKS=200 SEED_CALENDAR=60 SEED_ACTIVITIES=250
"""

import os, sys, time, json, random, argparse
import datetime as dt
import urllib.request, urllib.error

# ----------------------------- CONFIG ----------------------------------------
API_BASE   = os.environ.get("CLIO_API_BASE", "https://eu.app.clio.com")
API_VER    = "v4"
TOKEN      = os.environ.get("CLIO_ACCESS_TOKEN", "").strip()
SEED_TAG   = "[SEED]"
ROOT       = f"{API_BASE}/api/{API_VER}"
THROTTLE   = 0.30                      # base pause between calls (sec)

N_COMPANIES  = int(os.environ.get("SEED_COMPANIES", "25"))
N_PEOPLE     = int(os.environ.get("SEED_PEOPLE",    "45"))
N_MATTERS    = int(os.environ.get("SEED_MATTERS",   "120"))
N_TASKS      = int(os.environ.get("SEED_TASKS",     "200"))
N_CALENDAR   = int(os.environ.get("SEED_CALENDAR",  "60"))
N_ACTIVITIES = int(os.environ.get("SEED_ACTIVITIES","250"))
random.seed(42)                        # reproducible dataset

# ----------------------------- DATA POOLS ------------------------------------
FIRST = ["James","Olivia","Mohammed","Sophie","Arjun","Grace","Liam","Aisha",
         "Noah","Priya","Charlotte","Daniel","Fatima","Oliver","Emily","Hassan",
         "Isabella","George","Amara","Ethan","Zara","William","Leah","Omar",
         "Chloe","Ibrahim","Hannah","Lucas","Maya","Samuel","Nadia","Henry"]
LAST  = ["Whitfield","Okafor","Patel","Hargreaves","Nguyen","Sterling","Adeyemi",
         "Donnelly","Khan","Fairbanks","Lowe","Brennan","Rashid","Holloway",
         "Mensah","Carmichael","Begum","Sinclair","Abara","Pennington","Yusuf",
         "Marsh","Ellison","Dhillon","Crawford","Achebe","Lawson","Iqbal"]
COMPANY_BASES = ["Northgate","Meridian","Brightwater","Caldwell & Rourke","Summit",
        "Halcyon","Pennine","Kestrel","Aldgate","Riverside","Blackthorn","Vanguard",
        "Cobalt","Thornbury","Greystone","Maple Court","Oakhaven","Sterling Gate",
        "Westmoor","Ironbridge","Crestfield","Lansdowne","Drayton","Beaumont","Falcon"]
COMPANY_SUFFIX = ["Holdings Ltd","Estates LLP","Logistics Ltd","Trading Ltd",
        "Care Group Ltd","Ventures Ltd","Developments Ltd","Group plc","Partners LLP",
        "Services Ltd"]
PRACTICE = ["Conveyancing","Family Law","Commercial Litigation","Employment",
        "Wills & Probate","Personal Injury","Corporate / M&A","Immigration",
        "Criminal Defence","Property Dispute","Debt Recovery","Intellectual Property",
        "Complaints"]
MATTER_VERBS = {
    "Conveyancing":["Purchase of","Sale of","Remortgage of","Transfer of equity for"],
    "Family Law":["Divorce proceedings for","Child arrangements for","Financial settlement for"],
    "Commercial Litigation":["Contract dispute for","Debt claim for","Injunction for"],
    "Employment":["Unfair dismissal claim for","Settlement agreement for","Discrimination claim for"],
    "Wills & Probate":["Will & estate planning for","Probate administration for","Lasting power of attorney for"],
    "Personal Injury":["RTA injury claim for","Workplace accident claim for","Clinical negligence for"],
    "Corporate / M&A":["Share acquisition for","Company restructure for","Shareholders agreement for"],
    "Immigration":["Visa application for","Settlement application for","Appeal for"],
    "Criminal Defence":["Defence representation for","Bail application for","Crown Court trial for"],
    "Property Dispute":["Boundary dispute for","Lease dispute for","Possession claim for"],
    "Debt Recovery":["Debt recovery for","Statutory demand for","Enforcement for"],
    "Intellectual Property":["Trademark registration for","IP infringement claim for","Licensing for"],
    "Complaints":["Client complaint regarding","Service complaint from","Complaint review for"],
}
ADDR = ["14 Oak Street, Leeds","7 Market Square, Manchester","221 Baker Row, London",
        "5 Canal Side, Birmingham","88 Harbour View, Bristol","31 Mill Lane, Sheffield",
        "Unit 7, Pennine Estate","12 Abbey Gardens, York","40 Castle Hill, Nottingham",
        "9 Wharf Road, Liverpool"]

# ----------------------------- HTTP ------------------------------------------
def api(method, path, payload=None, _retry=0):
    url = f"{ROOT}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read().decode()
            time.sleep(THROTTLE)
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        if e.code == 429 and _retry < 5:        # rate limited -> back off
            wait = 2 ** _retry
            print(f"  ~ 429 rate limit, backing off {wait}s")
            time.sleep(wait)
            return api(method, path, payload, _retry + 1)
        print(f"  ! {method} {path} -> HTTP {e.code}: {detail}")
        raise

# ----------------------------- HELPERS ---------------------------------------
def who_am_i():
    return api("GET", "/users/who_am_i.json?fields=id,name,email").get("data", {})

def list_users():
    out, offset = [], 0
    while True:
        r = api("GET", f"/users.json?fields=id,name,enabled&limit=100&offset={offset}")
        data = r.get("data", [])
        out.extend(data)
        if len(data) < 100:
            break
        offset += 100
    return [u for u in out if u.get("enabled", True)] or out

def ensure_custom_field(name, parent_type, field_type="text_line"):
    """Create a custom field if it doesn't already exist. Returns its id or None."""
    try:
        r = api("GET", f"/custom_fields.json?fields=id,name,parent_type&query={urllib.parse.quote(name)}&limit=50")
        for cf in r.get("data", []):
            if cf.get("name") == name and cf.get("parent_type") == parent_type:
                return cf["id"]
        c = api("POST", "/custom_fields.json?fields=id,name", {"data": {
            "name": name, "parent_type": parent_type, "field_type": field_type,
            "displayed": True}})
        return c["data"]["id"]
    except Exception:
        return None

import urllib.parse  # (after function defs that reference it at call time)

# ----------------------------- CREATORS --------------------------------------
def create_person(first, last, aml, pep, id_verified, cf):
    cfv = []
    if cf.get("aml"): cfv.append({"custom_field": {"id": cf["aml"]}, "value": aml})
    if cf.get("pep"): cfv.append({"custom_field": {"id": cf["pep"]}, "value": pep})
    if cf.get("idv"): cfv.append({"custom_field": {"id": cf["idv"]}, "value": id_verified})
    payload = {"data": {
        "type": "Person", "first_name": first, "last_name": f"{last} {SEED_TAG}",
        "email_addresses":[{"name":"Work","address":f"{first.lower()}.{last.lower()}@example-seed.co.uk","default_email":True}],
        "phone_numbers":[{"name":"Work","number":f"07700 9{random.randint(10000,99999)}","default_number":True}],
    }}
    if cfv: payload["data"]["custom_field_values"] = cfv
    return api("POST","/contacts.json?fields=id,name",payload)["data"]

def create_company(name, aml, cf):
    cfv = []
    if cf.get("aml"): cfv.append({"custom_field": {"id": cf["aml"]}, "value": aml})
    payload = {"data": {
        "type":"Company","name":f"{name} {SEED_TAG}",
        "email_addresses":[{"name":"Work","address":f"info@{name.split()[0].lower()}-seed.co.uk","default_email":True}],
    }}
    if cfv: payload["data"]["custom_field_values"] = cfv
    return api("POST","/contacts.json?fields=id,name",payload)["data"]

def create_matter(client_id, desc, area, status, attorney_id, undertaking, cf):
    cfv = []
    if cf.get("undertaking"):
        cfv.append({"custom_field":{"id":cf["undertaking"]},"value": "Yes" if undertaking else "No"})
    if cf.get("conflict"):
        cfv.append({"custom_field":{"id":cf["conflict"]},"value": random.choice(["Cleared","Pending","Flagged"])})
    payload = {"data":{
        "client":{"id":client_id},
        "description":f"{desc} {SEED_TAG}",
        "status":status,
        "practice_area":{"name":area},
    }}
    if attorney_id: payload["data"]["responsible_attorney"] = {"id": attorney_id}
    if cfv: payload["data"]["custom_field_values"] = cfv
    return api("POST","/matters.json?fields=id,display_number,description",payload)["data"]

def create_task(name, matter_id, user_id, due_date, priority):
    payload = {"data":{
        "name":f"{name} {SEED_TAG}",
        "due_at": due_date,
        "priority": priority,           # "High" | "Normal" | "Low"
        "matter":{"id":matter_id},
        "assignee":{"id":user_id,"type":"User"},
    }}
    return api("POST","/tasks.json?fields=id,name",payload)["data"]

def create_calendar_entry(cal_id, summary, start, matter_id):
    payload = {"data":{
        "summary":f"{summary} {SEED_TAG}",
        "calendar_owner":{"id":cal_id},
        "start_at":start.replace(microsecond=0).isoformat(),
        "end_at":(start+dt.timedelta(hours=1)).replace(microsecond=0).isoformat(),
        "matter":{"id":matter_id},
    }}
    return api("POST","/calendar_entries.json?fields=id,summary",payload)["data"]

def create_activity(matter_id, user_id, note):
    payload = {"data":{
        "type":"TimeEntry",
        "date":(dt.date.today()-dt.timedelta(days=random.randint(0,40))).isoformat(),
        "quantity":random.choice([900,1800,2700,3600,5400,7200]),
        "note":f"{note} {SEED_TAG}",
        "matter":{"id":matter_id},
        "user":{"id":user_id},
    }}
    return api("POST","/activities.json?fields=id",payload)["data"]

def first_calendar_id():
    r = api("GET","/calendars.json?fields=id,name&limit=5")
    cals = r.get("data",[])
    return cals[0]["id"] if cals else None

# ----------------------------- MAIN ------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not TOKEN and not args.dry_run:
        print("ERROR: set CLIO_ACCESS_TOKEN first."); sys.exit(1)

    plan = (f"PLAN: {N_COMPANIES} companies, {N_PEOPLE} people, {N_MATTERS} matters, "
            f"{N_TASKS} tasks, {N_CALENDAR} calendar entries, {N_ACTIVITIES} activities.")
    print(plan)
    if args.dry_run:
        print("Dry run -- nothing created."); return

    me = who_am_i()
    print(f"Authenticated: {me.get('name')} <{me.get('email')}> on {API_BASE}")
    users = list_users()
    user_ids = [u["id"] for u in users] or [me.get("id")]
    print(f"Found {len(user_ids)} firm user(s) for supervision/assignment.")

    # Custom fields (best-effort)
    print("\nEnsuring custom fields...")
    cf_person = {
        "aml": ensure_custom_field("AML Risk Level","Contact"),
        "pep": ensure_custom_field("PEP Status","Contact"),
        "idv": ensure_custom_field("ID Verified","Contact"),
    }
    cf_matter = {
        "undertaking": ensure_custom_field("Undertaking Given","Matter"),
        "conflict": ensure_custom_field("Conflict Checked","Matter"),
    }
    print(f"  contact fields: {cf_person}")
    print(f"  matter fields:  {cf_matter}")

    # ---- Contacts ----
    print(f"\nCreating {N_COMPANIES} companies + {N_PEOPLE} people...")
    clients, opposing = [], []
    for i in range(N_COMPANIES):
        base = COMPANY_BASES[i % len(COMPANY_BASES)]
        name = f"{base} {random.choice(COMPANY_SUFFIX)}"
        aml = random.choices(["Low","Medium","High"],weights=[5,3,2])[0]
        try:
            c = create_company(name, aml, cf_person); clients.append(c["id"])
        except Exception: pass
    used_names = set()
    for i in range(N_PEOPLE):
        f, l = random.choice(FIRST), random.choice(LAST)
        while (f,l) in used_names: f, l = random.choice(FIRST), random.choice(LAST)
        used_names.add((f,l))
        aml = random.choices(["Low","Medium","High"],weights=[5,3,2])[0]
        pep = "Yes" if random.random()<0.12 else "No"
        idv = random.choices(["Verified","Pending","Not started"],weights=[6,2,2])[0]
        try:
            p = create_person(f,l,aml,pep,idv,cf_person)
            (opposing if i%4==0 else clients).append(p["id"])  # ~25% reserved as opposing parties
        except Exception: pass
    if not opposing: opposing = clients[:5]
    print(f"  created {len(clients)} client contacts, {len(opposing)} opposing-party contacts")

    # ---- Matters (with engineered scenarios) ----
    print(f"\nCreating {N_MATTERS} matters...")
    matters = []
    for i in range(1, N_MATTERS+1):
        area = random.choice(PRACTICE)
        verb = random.choice(MATTER_VERBS[area])
        subject = random.choice(ADDR) if area in ("Conveyancing","Property Dispute") else f"client #{i}"
        status = random.choices(["open","pending","closed"],weights=[6,2,2])[0]
        undertaking = (area in ("Conveyancing","Property Dispute","Debt Recovery") and random.random()<0.5)
        attorney = random.choice(user_ids)
        desc = f"{verb} {subject}"
        try:
            m = create_matter(random.choice(clients), desc, area, status, attorney, undertaking, cf_matter)
            m["_area"]=area; m["_undertaking"]=undertaking; m["_attorney"]=attorney
            matters.append(m)
            # Conflict engineering: link a reused opposing party as a related contact
            if i % 3 == 0 and opposing:
                op = opposing[i % len(opposing)]
                try:
                    api("POST","/relationships.json?fields=id",{"data":{
                        "matter":{"id":m["id"]},"contact":{"id":op},"description":f"Opposing party {SEED_TAG}"}})
                except Exception: pass
        except Exception: pass
    print(f"  created {len(matters)} matters")
    if not matters:
        print("No matters created -- aborting dependents."); return

    # ---- Tasks: deadlines / chasers / remediation / undertakings ----
    print(f"\nCreating {N_TASKS} tasks (deadlines, chasers, remediation, undertakings)...")
    today = dt.date.today()
    for i in range(N_TASKS):
        m = random.choice(matters)
        kind = random.choices(
            ["deadline","chaser","remediation","undertaking"],
            weights=[4,3,2,2])[0]
        if kind=="deadline":
            due = today + dt.timedelta(days=random.randint(1,45)); name="Compliance deadline - file action"; pri="Normal"
        elif kind=="chaser":
            due = today - dt.timedelta(days=random.randint(1,30)); name="CHASER - outstanding action overdue"; pri="High"
        elif kind=="remediation":
            due = today + dt.timedelta(days=random.randint(2,21)); name="REMEDIATION - corrective action required"; pri="High"
        else:
            due = today + dt.timedelta(days=random.randint(-10,30)); name="UNDERTAKING - satisfy given undertaking"; pri="High"
        try:
            create_task(name, m["id"], m.get("_attorney") or random.choice(user_ids),
                        f"{due.isoformat()}T17:00:00Z", pri)
        except Exception: pass

    # ---- Calendar entries: court dates / statutory deadlines ----
    cal_id = first_calendar_id()
    if cal_id:
        print(f"\nCreating {N_CALENDAR} calendar entries...")
        for i in range(N_CALENDAR):
            m = random.choice(matters)
            when = dt.datetime.now()+dt.timedelta(days=random.randint(1,60),hours=random.randint(0,7))
            summary = random.choice(["Court hearing","Statutory filing deadline",
                "Client review meeting","Limitation deadline","Completion date"])
            try: create_calendar_entry(cal_id, summary, when, m["id"])
            except Exception: pass
    else:
        print("\nNo calendar found; skipping calendar entries.")

    # ---- Activities: supervision spread across users ----
    print(f"\nCreating {N_ACTIVITIES} activities (supervision)...")
    notes = ["Drafting documents","Client call","Reviewing correspondence",
             "Attending hearing","Preparing bundle","File review","Research"]
    for i in range(N_ACTIVITIES):
        m = random.choice(matters)
        try: create_activity(m["id"], random.choice(user_ids), random.choice(notes))
        except Exception: pass

    print(f"\nDONE. Everything tagged '{SEED_TAG}'.")
    print("Next: in Seema -> Clio integration -> Connect/Sync as THIS firm, then "
          "test File Review, Conflict Check, AML/CDD, Deadlines, Chasers, "
          "Remediation, Undertakings, Supervision, Complaints, Compliance Scan.")

if __name__ == "__main__":
    main()
