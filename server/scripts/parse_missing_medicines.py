# One-off: parse the "A To Z complete trade" folder and find medicine rows
# that are NOT already in the VPS `medicines` table. Writes the missing rows to
# _missing_rows.json for a separate insert step. Dedup key = brand+strength+
# form+company (generic excluded, since generic spelling can differ between the
# folder and the VPS for the same physical product).

import openpyxl, glob, os, re, json

FOLDER = "C:/Users/mdjub/Downloads/A To Z complete trade"
VPS_ROWS = "C:/Users/mdjub/Downloads/_vps_rows.json"
OUT = "C:/Users/mdjub/Downloads/_missing_rows.json"

def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip()).lower()

# Source scrape sometimes leaks a repeated header row or a page footer into a
# file. Reject those so we never insert junk into a medical table.
HEADERS = {"brand name", "dosage form", "strength", "company", "pack size & price"}
JUNK_MARKERS = ["privacy policy", "about us", "terms of use", "mobile app",
                "disclaimer", "medex", "copyright", "contact us"]

def is_junk_brand(b):
    bl = norm(b)
    if bl in HEADERS:
        return True
    if any(k in bl for k in JUNK_MARKERS):
        return True
    if not re.search(r"[a-z0-9]", bl):  # must contain a latin letter/digit
        return True
    return False

def key(brand, strength, form, company):
    return "|".join([norm(brand), norm(strength), norm(form), norm(company)])

def parse_price(raw):
    if not raw:
        return None
    m = re.search(r"৳\s*([\d,]+(?:\.\d+)?)", raw)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None

# Existing VPS keys
vps = json.load(open(VPS_ROWS, encoding="utf8"))
existing = set(key(r["brandName"], r["strength"], r["dosageForm"], r["company"]) for r in vps)

missing = []
seen_new = set()
files = sorted(glob.glob(os.path.join(FOLDER, "*.xlsx")))
total_rows = 0
skipped_no_brand = 0

for f in files:
    generic = os.path.splitext(os.path.basename(f))[0].strip()
    wb = openpyxl.load_workbook(f, read_only=True)
    ws = wb.active
    last_brand = ""
    first = True
    for row in ws.iter_rows(values_only=True):
        if first:
            first = False
            continue
        vals = [("" if v is None else str(v).strip()) for v in row]
        vals += [""] * (5 - len(vals))
        brand, form, strength, company, price_raw = vals[0], vals[1], vals[2], vals[3], vals[4]
        if brand:
            last_brand = brand          # new brand block
        else:
            brand = last_brand          # carry forward (same drug, diff strength/price)
        if not brand:
            skipped_no_brand += 1
            continue
        if is_junk_brand(brand):
            last_brand = ""  # don't carry a junk brand forward
            continue
        total_rows += 1
        k = key(brand, strength, form, company)
        if k in existing or k in seen_new:
            continue
        seen_new.add(k)
        missing.append({
            "genericName": generic,
            "brandName": brand,
            "dosageForm": form or None,
            "strength": strength or None,
            "company": company or None,
            "priceRaw": price_raw or None,
            "price": parse_price(price_raw),
        })
    wb.close()

json.dump(missing, open(OUT, "w", encoding="utf8"), ensure_ascii=False)
print("Folder data rows processed:", total_rows)
print("Rows skipped (no brand):", skipped_no_brand)
print("Existing VPS keys:", len(existing))
print("MISSING rows to insert:", len(missing))
print("\nSample of missing rows:")
for m in missing[:8]:
    print("  ", m["genericName"], "|", m["brandName"], "|", m["strength"], "|", m["dosageForm"], "|", m["company"])
