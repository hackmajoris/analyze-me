#!/usr/bin/env python3
"""
Blood test PDF extractor – all.pdf
Formats:
  CRTSC   – "BULETIN ANALIZE MEDICALE"       (blood donation center)
  RM      – "Buletin de analize medicale"     (Regina Maria / Centrul Medical Unirea)
  SY      – "Buletin analize medicale"        (Synevo Romania)
  EVOL    – "Draga Alexandru, iata evolutia"  → skipped (chart/trend pages)

Strategy: split by formfeed into individual pages, classify each page,
group pages by (format, sample_id), then parse each group.
"""

import random
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

DB_PATH  = Path(__file__).parent / "blood_tests.db"

# ──────────────────────────────────────────────
# DB
# ──────────────────────────────────────────────

def init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS reports (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_date TEXT,
            validation_date TEXT,
            lab_name        TEXT,
            sample_id       TEXT UNIQUE
        );
        CREATE TABLE IF NOT EXISTS test_results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id       INTEGER NOT NULL REFERENCES reports(id),
            category        TEXT,
            test_name       TEXT,
            test_code       TEXT,
            result_numeric  REAL,
            result_text     TEXT,
            expected_text   TEXT,
            unit            TEXT,
            ref_min         REAL,
            ref_max         REAL,
            is_flagged      INTEGER DEFAULT 0,
            UNIQUE(report_id, test_name)
        );
    """)
    conn.commit()


def save_report(conn, lab, sample_id, coll_date, val_date):
    cur = conn.execute(
        "INSERT OR IGNORE INTO reports (collection_date, validation_date, lab_name, sample_id) "
        "VALUES (?,?,?,?)",
        (coll_date, val_date, lab, sample_id)
    )
    conn.commit()
    if cur.lastrowid:
        return cur.lastrowid
    row = conn.execute("SELECT id FROM reports WHERE sample_id=?", (sample_id,)).fetchone()
    return row[0] if row else None


def save_results(conn, report_id, results):
    inserted = 0
    for r in results:
        # Canonical code takes precedence; fall back to parsed code or auto-generated.
        test_name = normalize_test_name(r.get("test_name", ""))
        test_code = CANONICAL_CODES.get(test_name) or r.get("test_code") or generate_test_code(test_name)

        # Canonical refs override whatever the PDF reported.
        if test_code in CANONICAL_REFS:
            ref_min, ref_max = CANONICAL_REFS[test_code]
        else:
            ref_min, ref_max = r.get("ref_min"), r.get("ref_max")

        # Flag based on numeric or text comparison
        result_numeric = r.get("result_numeric")
        result_text = r.get("result_text")
        expected_text = r.get("expected_text")

        if result_numeric is not None:
            if ref_min is not None or ref_max is not None:
                is_flag = flagged(result_numeric, ref_min, ref_max)
            elif expected_text:
                # Numeric result with text-based expected (e.g. "Absente") — flag if non-zero
                absent_terms = {"absente", "absent", "negativ", "negativa", "neg", "nedecelabil"}
                et_words = set(expected_text.lower().split())
                is_flag = 1 if et_words & absent_terms and result_numeric > 0 else 0
            else:
                is_flag = 0
        elif result_text and expected_text:
            is_flag = flagged_text(result_text, expected_text)
        else:
            is_flag = 0

        cur = conn.execute(
            "INSERT OR IGNORE INTO test_results "
            "(report_id,category,test_name,test_code,"
            "result_numeric,result_text,expected_text,unit,ref_min,ref_max,is_flagged) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (report_id, r["category"], test_name, test_code,
             result_numeric, result_text, expected_text, r.get("unit"),
             ref_min, ref_max, is_flag)
        )
        if cur.lastrowid:
            inserted += 1
    conn.commit()
    return inserted


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def to_float(s):
    if not s:
        return None
    raw = str(s).strip()
    # "< X" means the real value is below the threshold — substitute a random
    # value in [50, 70] for < 75, or generically in [67%, 93%] of the threshold.
    m_lt = re.match(r"^[<≤]=?\s*([\d.,]+)\.?$", raw)
    if m_lt:
        upper = float(m_lt.group(1).replace(",", "."))
        lo = round(upper * 2 / 3)
        hi = round(upper * 0.93)
        return float(random.randint(int(lo), int(hi)))
    s = re.sub(r"^[<>≤≥]=?\s*", "", raw)
    s = s.rstrip(".")
    if "," in s:
        # European format: comma = decimal, dots = thousands separators
        s = s.replace(".", "").replace(",", ".")
    elif re.match(r"^\d{1,3}(\.\d{3})+$", s):
        # Dot-grouped thousands (e.g. 5.790.000, 150.000, 1.500)
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_ref(s):
    """(min, max) from '38 - 126', '[166-507]', '<=0.3', '>=40', '<34' etc."""
    s = s.strip().strip("[]()").replace(",", ".").replace("≤", "<=").replace("≥", ">=")
    m = re.match(r"([\d.]+)\s*[-–]\s*([\d.]+)", s)
    if m:
        return to_float(m.group(1)), to_float(m.group(2))
    m = re.match(r"<=?\s*([\d.]+)", s)
    if m:
        return None, to_float(m.group(1))
    m = re.match(r">=?\s*([\d.]+)", s)
    if m:
        return to_float(m.group(1)), None
    return None, None


def flagged(num, rmin, rmax):
    if num is None:
        return 0
    return 1 if (rmin is not None and num < rmin) or (rmax is not None and num > rmax) else 0


def flagged_text(result_text, expected_text):
    """Flag if text result doesn't match expected value(s)"""
    if not result_text or not expected_text:
        return 0
    # Normalize result for comparison
    result_norm = result_text.lower().strip()
    # Split expected values by comma and check if result matches any of them
    expected_values = [v.lower().strip() for v in expected_text.split(',')]
    # Check if result exactly matches any of the expected values
    for exp_val in expected_values:
        if result_norm == exp_val:
            return 0
    # Also check for substring match (for partial matches)
    expected_all = expected_text.lower()
    if result_norm in expected_all:
        return 0
    return 1


def generate_test_code(test_name):
    """Generate a test code from test name.
    e.g., "GLUCOZA SERICA" -> "GLUCOZA_SERICA"
    """
    if not test_name:
        return None

    name = test_name.upper()
    # Remove special characters, keep alphanumeric and spaces
    name = re.sub(r"[^A-Z0-9\s]", "", name)

    # Split on spaces and take first 2 significant words
    parts = name.split()
    if len(parts) > 2:
        parts = parts[:2]

    code = "_".join(parts)

    # Limit length to 20 chars
    if len(code) > 20:
        code = code[:20]

    return code if code else None


def parse_date_dd_mm_yyyy(s):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", s)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def parse_date_dd_slash_mm_slash_yyyy(s):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", s)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


# Maps exact test_name → canonical test_code, to unify the same test across labs.
CANONICAL_CODES: dict[str, str] = {
    "ALT": "ALT",
    "Alaninaminotransferaza (GPT/ALAT/ALT)": "ALT",
    "ALANINAMINOTRANSFERAZA (ALT/GPT/TGP)": "ALT",
    "AST": "AST",
    "Aspartataminotransferaza (GOT/ASAT/AST)": "AST",
    "ASPARTATAMINOTRANSFERAZA (GOT/AST/TGO)": "AST",
    "BILIRUBINA TOTALA": "BILIRUBINA_TOTALA",
    "GLUCOZA": "GLUCOZA_SERICA",
    "HDLCOLESTEROL": "COLESTEROL_HDL",
    "HDL COLESTEROL": "COLESTEROL_HDL",
    "LDLCOLESTEROL": "LDL_COLESTEROL",
    "LDL COLESTEROL": "LDL_COLESTEROL",
    "COLESTEROL LDL": "LDL_COLESTEROL",
    "MAGNEZIU": "MAGNEZIU_SERIC",
    "COLESTEROL": "COLESTEROL_TOTAL",
    "TRIGLICERIDE": "TRIGLICERIDE",
    "Trigliceride": "TRIGLICERIDE",
    "UREE SERICA": "UREE",
    "Uree": "UREE",
    "Uree serica": "UREE",
    "Urea": "UREE",
    "PSA (ANTIGEN SPECIFIC PROSTATIC)": "PSA_TOTAL",
    "PSA total": "PSA_TOTAL",
    "PSA_ANTIGEN": "PSA_TOTAL",
    "PSA ANTIGEN": "PSA_TOTAL",
    "Numar de eritrocite (RBC)": "RBC_ERITROCITE",
    "Numar eritrocite": "RBC_ERITROCITE",
    "Eritrocite": "RBC_ERITROCITE",
    "Hemoglobina (HGB)": "HEMOGLOBINA_HGB",
    "Hematocrit (HCT)": "HEMATOCRIT_HCT",
    "Volumul mediu eritrocitar (MCV)": "MCV_ERITROCITAR",
    "Volum eritrocitar mediu {VEM}": "MCV_ERITROCITAR",
    "Hemoglobina eritrocitara medie (MCH)": "MCH_ERITROCITAR",
    "Concentratia medie a hemoglobinei eritrocitare (MCHC)": "MCHC_ERITROCITAR",
    "Largimea distributiei eritrocitare - coeficient variatie (RDW-CV)": "RDW_CV",
    "Numar de leucocite (WBC)": "WBC_LEUCOCITE",
    "Procentul de neutrofile (NEUT%)": "NEUT_PROCENT",
    "Procentul de eozinofile (EOS%)": "EOS_PROCENT",
    "Procentul de bazofile (BAS%)": "BAS_PROCENT",
    "Procentul de limfocite (LYM%)": "LYM_PROCENT",
    "Procentul de monocite (MON%)": "MON_PROCENT",
    "Numar de neutrofile (NEUT)": "NEUT_ABSOLUT",
    "Numar de eozinofile (EOS)": "EOS_ABSOLUT",
    "Numar de bazofile (BAS)": "BAS_ABSOLUT",
    "Numar de limfocite (LYM)": "LYM_ABSOLUT",
    "Numar de monocite (MON)": "MON_ABSOLUT",
    "Numar de trombocite (PLT)": "PLT_TROMBOCITE",
    "Plachete sau trombocite": "PLT_TROMBOCITE",
    "Volumul mediu plachetar (MPV)": "MPV_PLACHETAR",
    "Volum plachetar mediu": "MPV_PLACHETAR",
    "Distributia plachetelor(trombocitelor) (PDW-SD)": "PDW_SD",
    "Rata estimata a filtrarii glomerulare (eGFR)": "EGFR_ESTIMATA",
    "VSH (VITEZA DE SEDIMENTARE A HEMATIILOR)": "VSH",
    "VSH": "VSH",
}

# Canonical reference ranges (ref_min, ref_max) keyed by test_code.
# None means "no bound on that side" (e.g. HDL is good when >= 40).
CANONICAL_REFS: dict[str, tuple] = {
    "ALT":              (10.0,  50.0),
    "AST":              (10.0,  50.0),
    "COLESTEROL_TOTAL": (120.0, 200.0),
    "COLESTEROL_HDL":   (40.0,  None),
    "LDL_COLESTEROL":   (60.0,  100.0),
    "TRIGLICERIDE":     (35.0,  150.0),
    "UREE":             (13.0,  43.0),
    "PSA_TOTAL":        (0.5,   1.4),
    "EGFR_ESTIMATA":    (90.0,  None),  # eGFR: normal when >= 90
}

QUALITATIVE_VALUES = {"neg", "poz", "pos", "negativ", "pozitiv", "absent", "normal",
                      "nedecelabil", "clara", "galbena", "negativa", "pozitiva", "chihlimbar",
                      "clar", "tulbure", "prezent"}


def is_numeric_value(s):
    s = s.strip()
    if s.lower() in QUALITATIVE_VALUES:
        return True
    return bool(re.match(r"^[<>]?\s*[\d.,]+\.?$", s))


def normalize_test_name(name: str) -> str:
    """Normalize test names by splitting concatenated words and standardizing formats."""
    if not name:
        return name

    # Split HDLCOLESTEROL → HDL COLESTEROL
    name = re.sub(r'HDLCOLESTEROL', 'HDL COLESTEROL', name, flags=re.IGNORECASE)
    # Split LDLCOLESTEROL → LDL COLESTEROL
    name = re.sub(r'LDLCOLESTEROL', 'LDL COLESTEROL', name, flags=re.IGNORECASE)
    # Normalize "Colesterol HDL" → "HDL COLESTEROL"
    name = re.sub(r'Colesterol\s+HDL', 'HDL COLESTEROL', name, flags=re.IGNORECASE)
    # Normalize "Colesterol LDL" → "LDL COLESTEROL"
    name = re.sub(r'Colesterol\s+LDL', 'LDL COLESTEROL', name, flags=re.IGNORECASE)
    # Normalize "Trigliceride" → "TRIGLICERIDE"
    name = re.sub(r'Trigliceride', 'TRIGLICERIDE', name)
    # Normalize Urea/Uree variations → "Uree"
    name = re.sub(r'UREE\s+SERICA', 'Uree', name, flags=re.IGNORECASE)
    name = re.sub(r'Uree\s+serica', 'Uree', name, flags=re.IGNORECASE)
    name = re.sub(r'\bUrea\b', 'Uree', name, flags=re.IGNORECASE)
    # Normalize PSA variations → "PSA total"
    name = re.sub(r'PSA\s*\(ANTIGEN\s+SPECIFIC\s+PROSTATIC\)', 'PSA total', name, flags=re.IGNORECASE)
    name = re.sub(r'PSA_ANTIGEN', 'PSA total', name, flags=re.IGNORECASE)
    name = re.sub(r'PSA\s+ANTIGEN', 'PSA total', name, flags=re.IGNORECASE)
    # Normalize "Numar eritrocite" / "Eritrocite" → "Numar de eritrocite (RBC)"
    name = re.sub(r'\bNumar\s+eritrocite\b', 'Numar de eritrocite (RBC)', name, flags=re.IGNORECASE)
    name = re.sub(r'^\s*Eritrocite\s*$', 'Numar de eritrocite (RBC)', name)
    # Normalize "Plachete sau trombocite" → "Numar de trombocite (PLT)"
    name = re.sub(r'Plachete\s+sau\s+trombocite', 'Numar de trombocite (PLT)', name, flags=re.IGNORECASE)
    # Normalize "VSH (VITEZA DE SEDIMENTARE A HEMATIILOR)" → "VSH"
    name = re.sub(r'VSH\s*\(VITEZA\s+DE\s+SEDIMENTARE\s+A\s+HEMATIILOR\)', 'VSH', name, flags=re.IGNORECASE)
    # Normalize "Volum plachetar mediu" → "Volumul mediu plachetar (MPV)"
    name = re.sub(r'Volum\s+plachetar\s+mediu', 'Volumul mediu plachetar (MPV)', name, flags=re.IGNORECASE)
    # Normalize "Volum eritrocitar mediu {VEM}" → "Volumul mediu eritrocitar (MCV)"
    name = re.sub(r'Volum\s+eritrocitar\s+mediu\s*\{VEM\}', 'Volumul mediu eritrocitar (MCV)', name, flags=re.IGNORECASE)

    return name


# ──────────────────────────────────────────────
# PDF extraction
# ──────────────────────────────────────────────

def pdf_pages(pdf_path, layout=False):
    """Extract all pages as list of strings (split by \x0c)."""
    args = ["pdftotext", "-f", "1", "-l", "9999"]
    if layout:
        args.append("-layout")
    args += [str(pdf_path), "-"]
    r = subprocess.run(args, capture_output=True, text=True)
    return r.stdout.split("\x0c") if r.returncode == 0 else []


# ──────────────────────────────────────────────
# Page classifier
# ──────────────────────────────────────────────

def classify_page(page_plain, page_layout):
    """Returns (format_str, sample_id) or (None, None)."""
    # Skip evolution chart pages
    if "Draga Alexandru, iata evolutia" in page_layout:
        return "EVOL", None

    # CRTSC: "Cod recoltare:" in plain text (value may be on next line)
    flat_plain = page_plain.replace("\n", " ")
    m = re.search(r"Cod\s+recoltare:\s+(\d+)", flat_plain)
    if m:
        return "CRTSC", m.group(1)

    # RM new: barcode *12345678* in layout
    m = re.search(r"\*(\d{7,})\*", page_layout)
    if m:
        return "RM", m.group(1)

    # RM old: "Cod proba: * 1234567 *"
    m = re.search(r"Cod proba:\s*\*\s*(\d+)\s*\*", page_layout)
    if m:
        return "RM", m.group(1)

    # RM 2026+: no barcode asterisks, uses "Id proba: XXXXXXXX"
    m = re.search(r"Id proba:\s+(\d+)", page_layout)
    if m:
        return "RM", m.group(1)

    # RM 2026+ continuation pages: header has "Data - ora recoltare:" + standalone 8-digit sample ID
    lines = page_layout.splitlines()[:8]
    header = " ".join(lines)
    if re.search(r"Data\s*-\s*ora\s+recoltare:", header):
        nums = re.findall(r"(?<!\d)(\d{8})(?!\d)", header)
        if nums:
            return "RM", nums[-1]

    # Synevo: "Numar cerere: 7XXXXXXXXX"
    m = re.search(r"Numar cerere:\s+(\d+)", page_layout)
    if m:
        return "SY", m.group(1)

    # Bioclinica: "Buletin de analize 25B28L0209 din"
    m = re.search(r"Buletin de analize\s+(\S+)\s+din", flat_plain)
    if m:
        return "BC", m.group(1)

    return None, None


# ──────────────────────────────────────────────
# Format 1: CRTSC parser (plain text, state machine)
# ──────────────────────────────────────────────
# Plain text structure per test:
#   TEST NAME (CODE)          ← name, possibly 2 lines
#   [blank]
#   [- produs biologic ...]   ← skip
#   [blank]
#   VALUE                     ← numeric or NEG/POZ
#   [blank]
#   REFERENCE                 ← e.g. "37 - 150" or "< 75"
#   [blank]
#   [UNIT]                    ← optional, e.g. "% - 10 µl"
#   [blank]

CRTSC_SKIP_LINE = re.compile(
    r"^(BULETIN|Num[e ]|prenume|CNP|Cod(?:\s|$)|recoltare:|recoltarii:|"
    r"donare:|validarii:|Adresa|ROMANIA|ILIES|Data(?:\s|$)|"
    r"Interval de|referinta|Unitate de|masura|Test(?:\s|$)|Rezultat(?:\s|$)|"
    r"Pagina|Va multumim|Centrul Regional|Grup sanguin|Rh:|Antigene|Anticorpi|"
    r"-?\s*produs biologic|analiza imunoenzimatica|MONOLISA|GENSCREEN|MUREX|"
    r"SYPHILIS TOTAL|Ac\. Anti|Ag HBs|Syphilis Total|"
    r"Cluj-Napoca|Bucuresti|Brasov|Constanta|Timisoara|Iasi|Oradea|Ploiesti|Galati|Craiova|"
    r"Recomandare|Ilies Alexandru|"
    r"\d{2}\.\d{2}\.\d{4}|\d{8,})",    # skip dates, long numbers (IDs, CNP), city names
    re.IGNORECASE
)

CRTSC_CATEGORY = re.compile(r"^Laborator\s*[-–]?\s*(.+?)(?:\s*-\s*produs.*)?$", re.IGNORECASE)


_KNOWN_UNITS = re.compile(
    r"^(%|fl|pg|fL|g/dl|g/l|nmol|µmol|mEq|mmol|mol|IU|U/L|mUI|UI|µUI|mii)$",
    re.IGNORECASE
)
# Unit continuation words (lowercase only — "Hematocrit" capitalized is a test name)
_UNIT_CONTINUATIONS = re.compile(r"^(hematocrit|eritrocit|trombocit)$")


def _crtsc_line_type(line):
    s = line.strip()
    if not s:
        return "blank"
    if CRTSC_SKIP_LINE.match(s):
        return "skip"
    mc = CRTSC_CATEGORY.match(s)
    if mc:
        return "category"
    # Value: pure numeric (with optional leading < >) or qualitative
    if re.match(r"^[<>]?\s*[\d.,]+\.?$", s) or s.upper() in {v.upper() for v in QUALITATIVE_VALUES}:
        return "value"
    # Reference interval
    if re.match(r"^[\d.,]+\s*[-–]\s*[\d.,]+$", s) or re.match(r"^[<>]\s*[\d.,]+$", s):
        return "ref"
    # Known standalone unit abbreviations
    if _KNOWN_UNITS.match(s):
        return "unit"
    # Unit continuation (only lowercase to distinguish from capitalized test names)
    if _UNIT_CONTINUATIONS.match(s):
        return "unit"
    # Unit: contains letters AND numbers/symbols (e.g. "% - 10 µl", "10 µl", "g/dl/unitate")
    if re.search(r"[µ%a-zA-Z]", s) and re.search(r"[\d/]", s):
        return "unit"
    return "name"


def parse_crtsc(text_layout, text_plain):
    """Returns (meta, results) for one CRTSC report group."""
    meta = {"lab": "CRTSC", "sample_id": None, "coll_date": None, "val_date": None}
    results = []

    flat = text_plain.replace("\n", " ")
    m = re.search(r"Cod\s+recoltare:\s+(\d+)", flat)
    if m:
        meta["sample_id"] = m.group(1)

    m = re.search(r"Data\s+recoltarii:\s+(\d{2}\.\d{2}\.\d{4})", flat)
    if m:
        meta["coll_date"] = parse_date_dd_mm_yyyy(m.group(1))

    m = re.search(r"Data\s+validarii:\s+(\d{2}\.\d{2}\.\d{4})", flat)
    if m:
        meta["val_date"] = parse_date_dd_mm_yyyy(m.group(1))

    category = "General"
    # State machine
    state = "seek_name"  # seek_name → in_name → seek_val → seek_ref → seek_unit
    name_parts: list[str] = []
    pending_val = None
    pending_ref = None
    in_data = False

    def emit_pending():
        if not name_parts or pending_val is None:
            return
        name = " ".join(name_parts).strip()
        cm = re.search(r"\(([^)]+)\)", name)
        code = cm.group(1).strip() if cm else None
        name_clean = re.sub(r"\s*\([^)]+\)\s*", " ", name).strip()

        rv = str(pending_val).strip()
        num = None
        txt = None
        if rv.lower() in QUALITATIVE_VALUES:
            txt = rv
        else:
            num = to_float(rv)

        rmin, rmax = parse_ref(pending_ref) if pending_ref else (None, None)
        results.append({
            "category": category,
            "test_name": name_clean,
            "test_code": code,
            "result_numeric": num,
            "result_text": txt,
            "unit": None,
            "ref_min": rmin,
            "ref_max": rmax,
            "is_flagged": flagged(num, rmin, rmax),
        })

    for line in text_plain.splitlines():
        ltype = _crtsc_line_type(line)

        if ltype == "category":
            mc = CRTSC_CATEGORY.match(line.strip())
            if mc:
                in_data = True
                category = mc.group(1).strip().title()
            state = "seek_name"
            name_parts, pending_val, pending_ref = [], None, None
            continue

        if not in_data:
            continue

        if ltype in ("blank", "skip"):
            if state == "seek_unit" and pending_val is not None:
                emit_pending()
                name_parts, pending_val, pending_ref = [], None, None
                state = "seek_name"
            continue

        if ltype == "value":
            if state in ("seek_name", "in_name", "seek_val"):
                pending_val = line.strip()
                state = "seek_ref"
            continue

        if ltype == "ref":
            if state == "seek_ref":
                pending_ref = line.strip()
                state = "seek_unit"
            continue

        if ltype == "unit":
            if state == "seek_unit":
                emit_pending()
                if results:
                    results[-1]["unit"] = line.strip()
                name_parts, pending_val, pending_ref = [], None, None
                state = "seek_name"
            continue

        if ltype == "name":
            if state == "seek_unit":
                emit_pending()
                name_parts, pending_val, pending_ref = [], None, None
                state = "seek_name"
            if state in ("seek_name", "in_name"):
                name_parts.append(line.strip())
                state = "in_name"
            continue

    # Flush last
    if state == "seek_unit":
        emit_pending()

    return meta, results


# ──────────────────────────────────────────────
# Format 2: Regina Maria parser (layout text, "= VALUE" lines)
# ──────────────────────────────────────────────

RM_CATEGORY = re.compile(
    r"^\s*(HEMATOLOGIE|BIOCHIMIE|IMUNOLOGIE|MICROBIOLOGIE|COAGULARE|SEROLOGIE|"
    r"ENDOCRINOLOGIE|URINALIZA|PARAZITOLOGIE|HEMATO|URGENTE|SEDIMENT URINAR)(\s|$|;|&|,)",
    re.IGNORECASE
)

RM_RESULT = re.compile(
    r"^(.+?)\s{2,}=\s*([\d.,<>]+)\s+(.+)?$"
)

# 2026+ format: NAME<3+spaces>VALUE [REST...]  (no = sign)
# VALUE = numeric (like 1.05, 6.0) OR single qualitative word (non-greedy match to avoid consuming ref)
# REST = everything after VALUE (unit + reference), starts after 1+ spaces from value
RM_RESULT_NEW = re.compile(
    r"^([A-Za-zÀ-ÿ\-][A-Za-zÀ-ÿ\d\s\-\(\)%/*]{2,}?)\s{3,}"
    r"([\d.,]+|[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\d]*?)\s+"
    r"(.*)$"
)

RM_NEW_SKIP = re.compile(
    r"^(Denumire|Ser[,\s]|sange\s|esantion|Obs:|Pg\.\s*\d|FO-LAB|"
    r"Emis la|Eliberat|Recomandare|Examinarile|examinari|Pentru|Datele|"
    r"Regulamentul|privire|https?://|Interval biologic de ref|"
    r"Interpretare|Normal:|Glicemie bazala|Diabet zaharat|Diagnosticul|"
    r"Homa-IR|eGFR:|Calcul|unde:|Scr\s*=|Valorile|Adulti|Barbati:|Femei:|"
    r"Optim|Borderline|Crescut|Foarte|Acceptabil|Copii|"
    r"Leucocite\s+\d+/HPF=|Eritrocite\s+\d+/HPF=|persoane|ATENTIONARE|"
    r"Se recomanda|Rezultate usor|Cluj-Napoca|Bucuresti|Brasov|Constanta|"
    r"Timisoara|Iasi|Oradea|Ploiesti|Galati|Craiova|LM\s*$|"
    r"Ilies Alexandru)",
    re.IGNORECASE
)


def parse_rm(text_layout):
    """Returns (meta, results) for one RM report group."""
    meta = {"lab": "Regina Maria", "sample_id": None, "coll_date": None, "val_date": None}
    results = []

    # Sample ID
    m = re.search(r"\*(\d{7,})\*", text_layout)
    if m:
        meta["sample_id"] = m.group(1)
    else:
        m = re.search(r"Cod proba:\s*\*\s*(\d+)\s*\*", text_layout)
        if m:
            meta["sample_id"] = m.group(1)
    if not meta["sample_id"]:
        m = re.search(r"Id proba:\s+(\d+)", text_layout)
        if m:
            meta["sample_id"] = m.group(1)
    if not meta["sample_id"]:
        # 2026+ format: standalone 8-digit number on its own line
        m = re.search(r"^\s*(\d{8})\s*$", text_layout, re.MULTILINE)
        if m:
            meta["sample_id"] = m.group(1)

    # Collection date (new format)
    m = re.search(r"Data\s*-\s*ora\s+recoltare:\s+(\d{2}\.\d{2}\.\d{4})", text_layout)
    if m:
        meta["coll_date"] = parse_date_dd_mm_yyyy(m.group(1))

    # Old format date
    if not meta["coll_date"]:
        m = re.search(r"Recoltat si inregistrat la data:\s+(\d{2}\.\d{2}\.\d{4})", text_layout)
        if m:
            meta["coll_date"] = parse_date_dd_mm_yyyy(m.group(1))

    # Validation date
    m = re.search(r"Emis la\s+(\d{2}\.\d{2}\.\d{4})", text_layout)
    if m:
        meta["val_date"] = parse_date_dd_mm_yyyy(m.group(1))

    category = "General"
    lines = text_layout.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        i += 1

        if not stripped:
            continue

        # Category header
        mc = RM_CATEGORY.match(stripped)
        if mc and not re.search(r"=\s*[\d.,<>]", stripped):
            cat_raw = mc.group(1).upper()
            if "HEMATOLOGIE" in cat_raw and "COAGULARE" in cat_raw:
                category = "Hematologie Si Coagulare"
            else:
                category = mc.group(1).title()
            continue

        # Skip method/header/interpretive lines
        if RM_NEW_SKIP.match(stripped):
            continue

        # Result line: NAME  = VALUE  UNIT  REF  (old format)
        mr = RM_RESULT.match(stripped)
        if mr:
            raw_name = mr.group(1).strip().rstrip("*1 ").strip()
            raw_val  = mr.group(2).strip()
            rest     = (mr.group(3) or "").strip()

            parts = re.split(r"\s{2,}", rest)
            unit    = parts[0].strip() if parts else None
            raw_ref = parts[1].strip() if len(parts) > 1 else ""

            num = to_float(raw_val)
            rmin, rmax = parse_ref(raw_ref)

            results.append({
                "category": category,
                "test_name": raw_name,
                "test_code": None,
                "result_numeric": num,
                "result_text": None,
                "expected_text": None,
                "unit": unit,
                "ref_min": rmin,
                "ref_max": rmax,
                "is_flagged": flagged(num, rmin, rmax),
            })
            continue

        # Try matching as regular result line first (NAME<3+spaces>VALUE [REST...])
        mr = RM_RESULT_NEW.match(stripped)
        if mr:
            raw_name = mr.group(1).strip().rstrip("*").strip()
            raw_val  = mr.group(2).strip()
            rest_str = (mr.group(3) or "").strip()

            # Parse the rest: could be "unit ref" or just "ref" (for qualitative) or "/HPF ≤4" etc.
            # Split on known unit patterns or special characters
            parts = re.split(r'\s{2,}', rest_str) if rest_str else []

            # Try to identify unit vs reference
            unit = None
            raw_ref = rest_str

            if len(parts) >= 2:
                # Multiple space-separated parts: first is likely unit, rest is ref
                first_part = parts[0]
                if re.search(r'[/µ%°³²]|^[a-z]{1,3}L$', first_part, re.IGNORECASE):
                    # First part looks like a unit
                    unit = first_part
                    raw_ref = ' '.join(parts[1:])
                else:
                    # First part doesn't look like a unit, treat all as reference
                    raw_ref = rest_str
            elif len(parts) == 1:
                # Single chunk: could be "unit" alone, or "unit ref" with a single space
                first_word = parts[0].split()[0] if parts[0] else ""
                rest_words = parts[0][len(first_word):].strip()
                if re.search(r'[/µ%°³²]|^[a-z]{1,3}L$', first_word, re.IGNORECASE):
                    unit = first_word
                    raw_ref = rest_words  # may be empty or e.g. "Absente"
                elif re.search(r'[/µ%°³²]|^[a-z]{1,3}L$', parts[0], re.IGNORECASE) and not rest_words:
                    unit = parts[0]
                    raw_ref = ""

            # Determine if this is a qualitative (text) or quantitative (numeric) result
            is_qual = raw_val.lower() in {v.lower() for v in QUALITATIVE_VALUES} or not re.match(r"^[\d.,]+$", raw_val)

            if is_qual:
                # For qualitative results, the reference is the expected text value
                num  = None
                txt  = raw_val
                rmin, rmax = None, None
                # Extract expected value(s) from raw_ref (may be comma-separated list)
                expected_txt = raw_ref.strip() if raw_ref else None

                # Look ahead for continuation lines if reference ends with comma
                if expected_txt and expected_txt.rstrip().endswith(','):
                    j = i
                    found_continuation = False
                    while j < len(lines):
                        next_line = lines[j].strip()
                        if not next_line:
                            j += 1
                            continue
                        # Stop if this is a new test/section
                        if RM_RESULT_NEW.match(next_line) or RM_CATEGORY.match(next_line):
                            break
                        # This looks like a continuation of the reference
                        expected_txt += " " + next_line
                        j += 1
                        found_continuation = True
                        # If line doesn't end with comma, no more continuations
                        if not next_line.endswith(','):
                            break
                    # If we consumed continuation lines, skip them in the main loop
                    if found_continuation:
                        i = j
            else:
                # For numeric results, extract numeric reference range
                num = to_float(raw_val)
                txt = None
                ref_tokens = re.findall(r"[\d.,]+\s*[-–]\s*[\d.,]+|[<>≤≥]=?\s*[\d.,]+|\[[\d.,\s\-–]+\]", raw_ref)
                raw_ref_clean = ref_tokens[0].strip("[]") if ref_tokens else ""
                rmin, rmax = parse_ref(raw_ref_clean)
                # If no numeric ref was found but raw_ref has text, treat it as expected value
                # e.g. "Proteine urinare = 25 mg/L  Absente"
                expected_txt = raw_ref.strip() if not raw_ref_clean and raw_ref.strip() else None

            # Append unit to test_name if we're in sediment section to avoid duplicates
            # e.g., "Leucocite" in sediment becomes "Leucocite /HPF"
            final_test_name = raw_name
            if category == "Sediment Urinar" and unit and raw_name.lower() in ("leucocite", "eritrocite"):
                final_test_name = f"{raw_name} {unit}".strip()

            # Calculate flag for preview
            if is_qual and expected_txt:
                preview_flag = flagged_text(txt, expected_txt)
            elif num is not None and rmin is None and rmax is None and expected_txt:
                absent_terms = {"absente", "absent", "negativ", "negativa", "neg", "nedecelabil"}
                et_words = set(expected_txt.lower().split())
                preview_flag = 1 if et_words & absent_terms and num > 0 else 0
            else:
                preview_flag = flagged(num, rmin, rmax)

            results.append({
                "category": category,
                "test_name": final_test_name,
                "test_code": None,
                "result_numeric": num,
                "result_text": txt,
                "expected_text": expected_txt,
                "unit": unit,
                "ref_min": rmin,
                "ref_max": rmax,
                "is_flagged": preview_flag,
            })
            continue

        # Handle test names (with or without asterisks) whose value is on next line(s)
        # Examples: "Culoare*", "Claritate*", "Mucus"
        # Only match known urine/sediment field names that typically have values on next line
        multiline_field_names = {
            "culoare", "claritate", "mucus",  # These typically have multi-line layout
        }

        if re.match(r"^[A-Za-zÀ-ÿ\s]+\*?\s*$", stripped):
            raw_name = stripped.rstrip("*").strip()
            if raw_name.lower() in multiline_field_names:
                # Look at next non-empty lines for value and ref
                j = i
                next_line = ""
                ref_line = ""

                # Skip empty lines and find next non-empty line
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j < len(lines):
                    next_line_full = lines[j]
                    next_line_stripped = next_line_full.strip()

                    # Check if this line contains value and reference (heavily indented)
                    # Pattern: heavily indented, contains word(s), spaces, and reference info
                    if len(next_line_full) > 50 and next_line_stripped:
                        # Extract first word as value, rest as ref
                        parts = next_line_stripped.split(None, 1)  # Split on first whitespace
                        if parts:
                            next_line = parts[0]
                            ref_line = parts[1] if len(parts) > 1 else ""
                            j += 1
                    else:
                        next_line = next_line_stripped
                        j += 1
                        # Check if next line could be continuation of ref
                        while j < len(lines) and not lines[j].strip():
                            j += 1
                        if j < len(lines):
                            potential_ref = lines[j].strip()
                            if potential_ref and re.match(r"^[A-Za-zÀ-ÿ\d\s,\-–.]+$", potential_ref) and not RM_CATEGORY.match(potential_ref):
                                ref_line = potential_ref
                                j += 1

                if next_line and not RM_NEW_SKIP.match(next_line):
                    is_qual = next_line.lower() in {v.lower() for v in QUALITATIVE_VALUES}

                    if is_qual:
                        num  = None
                        txt  = next_line
                        rmin, rmax = None, None
                        expected_txt = ref_line.strip() if ref_line else None
                    else:
                        num = to_float(next_line)
                        txt = None
                        rmin, rmax = parse_ref(ref_line) if ref_line else (None, None)
                        expected_txt = None

                    # Calculate flag for preview
                    if is_qual and expected_txt:
                        preview_flag = flagged_text(txt, expected_txt)
                    else:
                        preview_flag = flagged(num, rmin, rmax)

                    results.append({
                        "category": category,
                        "test_name": raw_name,
                        "test_code": None,
                        "result_numeric": num,
                        "result_text": txt,
                        "expected_text": expected_txt,
                        "unit": None,
                        "ref_min": rmin,
                        "ref_max": rmax,
                        "is_flagged": preview_flag,
                    })
                    i = j
                    continue

    return meta, results


# ──────────────────────────────────────────────
# Format 3: Synevo parser (layout text, column-based)
# ──────────────────────────────────────────────
# Result rows have value at column ~96, unit at ~116, ref at ~136.
# Name is at column 10-95 (either sub-test name or method description).
# When name starts with "Ser /", "Sange ", "Urina /" → use group header instead.

SY_CATEGORY = re.compile(
    r"^\s+(Biochimie|Hematologie|Imunologie|Serologie|Microbiologie|Coagulare|"
    r"Urinaliza|Endocrinologie|Parazitologie|Urina biochimie)(\s|$)",
    re.IGNORECASE
)

SY_GROUP_HEADER = re.compile(r"^7\s+(.+)$")   # lines starting with "7"

SY_METHOD_PREFIX = re.compile(
    r"^(Ser\s*/|Sange\s|Urina\s*/|plasma\s|lichid|sputa|materii fecale|"
    r"Ser,|Sange,|Jaffe|IFCC|spectrofotom|colorimetric|enzimatic|imunoturbi|"
    r"citometrie|focusare|SLS-Hb|electroluminesc|microfotom)",
    re.IGNORECASE
)

SY_SKIP = re.compile(
    r"(Denumire|Rezultat\s*$|^\s*UM\s*$|Interval de|Pagina \d|Este interzisa|"
    r"Synevo Romania|Buletin analize|Punct recoltare|Tiparit la|Efectuat in|"
    r"Medic de laborator|Data nasterii|Numar cerere|Inregistrat la|"
    r"Valori in afara|Recomandare|Cluj-Napoca|Bucuresti|Brasov|Constanta|"
    r"Timisoara|Iasi|Oradea|Ploiesti|Galati|Craiova|LM\s*$|Ilies Alexandru)",
    re.IGNORECASE
)


def parse_synevo(text_layout):
    """Returns (meta, results) for one Synevo report group."""
    meta = {"lab": "Synevo", "sample_id": None, "coll_date": None, "val_date": None}
    results = []

    m = re.search(r"Numar cerere:\s+(\d+)", text_layout)
    if m:
        meta["sample_id"] = m.group(1)

    m = re.search(r"Data recoltarii:\s+(\d{2}/\d{2}/\d{4})", text_layout)
    if m:
        meta["coll_date"] = parse_date_dd_slash_mm_slash_yyyy(m.group(1))

    m = re.search(r"Data rezultat:\s+(\d{2}/\d{2}/\d{4})", text_layout)
    if m:
        meta["val_date"] = parse_date_dd_slash_mm_slash_yyyy(m.group(1))

    category = "General"
    group_name = None   # name from "7  Test name" header line

    for line in text_layout.splitlines():
        # Category
        mc = SY_CATEGORY.match(line)
        if mc:
            category = mc.group(1).title()
            continue

        # Group header: "7         Test name"
        mg = SY_GROUP_HEADER.match(line.strip())
        if mg:
            group_name = mg.group(1).strip()
            continue

        # Result lines: value at column ~92-112
        if len(line) < 100:
            continue

        name_raw  = line[10:92].strip()
        val_raw   = line[92:113].strip()
        rest      = line[113:].strip()

        if not val_raw or not is_numeric_value(val_raw):
            continue

        if SY_SKIP.search(name_raw):
            continue

        # Determine test name
        if SY_METHOD_PREFIX.match(name_raw):
            test_name = group_name or name_raw
        elif not name_raw:
            test_name = group_name or "Unknown"
        else:
            test_name = name_raw

        parts = re.split(r"\s{2,}", rest)
        unit = parts[0].strip() if parts else None
        raw_ref = parts[1].strip() if len(parts) > 1 else ""

        # Extract first ref token (ignore multi-line interpretive text)
        ref_tokens = re.findall(r"[\d.,]+\s*[-–]\s*[\d.,]+|[<>≤≥]=?\s*[\d.,]+", raw_ref)
        raw_ref_clean = ref_tokens[0] if ref_tokens else ""

        num = None
        txt = None
        if val_raw.lower() in QUALITATIVE_VALUES:
            txt = val_raw
        else:
            num = to_float(val_raw)

        rmin, rmax = parse_ref(raw_ref_clean)

        results.append({
            "category": category,
            "test_name": test_name,
            "test_code": None,
            "result_numeric": num,
            "result_text": txt,
            "unit": unit,
            "ref_min": rmin,
            "ref_max": rmax,
            "is_flagged": flagged(num, rmin, rmax),
        })

    return meta, results


# ──────────────────────────────────────────────
# Format 4: Bioclinica parser (plain text)
# ──────────────────────────────────────────────

BC_SKIP = re.compile(
    r"(BIOCLINICA|acreditat\s+pentru|SR\s+EN\s+ISO|CERTIFICAT\s+DE|LM\s+\d|"
    r"RENAR|Data\s+na[sș]terii|CNP\s+\d|ADRESA|00002|Laboratoarele\s+Bioclinica|"
    r"Buletin de analize|RECOLTAT|LUCRAT|GENERAT|STR\s+Govora|"
    r"medic\s+spec\.|Pagina\s+\d|Rezultatele\s+se|F01-PG|"
    r"VALORI\s+BIOLOGICE|Nivel\s+de\s+discriminare|"
    r"\(s[âa]nge\s+integral|\(ser,|\(urin[aă]-spot|"
    r"Ion-exchange|citometrie\s+de\s+flux|spectrofotometrie|chemiluminiscen|"
    r"Analizele\s+[sș]i|Pentru\s+detalii|Opiniile\s+[sș]i|bioclinica\.ro|"
    r"ALEXANDRU\s+ILIES|Data\s+naș|acreditare|Cluj-Napoca|Bucuresti|Brasov|Constanta|"
    r"Timisoara|Iasi|Oradea|Ploiesti|Galati|Craiova|Recomandare|Ilies Alexandru)",
    re.IGNORECASE | re.UNICODE,
)

BC_SECTION = re.compile(
    r"^\s*(Hemoleucogram[aă]|Formula\s+leucocitar[aă])\s*$",
    re.IGNORECASE | re.UNICODE,
)

_BC_UNITS = r"ng/mL|mg/dL|mmol/L|g/dL|fL|pg|/mm[³3]|%|U/L|mUI/L|g/L|µmol/L|nmol/L"

# Layout line: heavily-indented standalone value — "    VALUE UNIT    (REF)"
BC_STANDALONE_VAL = re.compile(
    r"^\s{20,}([\d.,]+)\s+(" + _BC_UNITS + r")\s+\(([^)]+)\)",
    re.UNICODE,
)

# Layout line: panel result — "  Name   VALUE UNIT ... (REF)"
BC_PANEL_LINE = re.compile(
    r"^\s{2,15}(\w[^\d\n]{1,30}?)\s{2,}([\d.,]+)\s+(" + _BC_UNITS + r")[^(]*\(([^)]+)\)",
    re.UNICODE,
)


def parse_bioclinica(text_layout, text_plain):
    """Returns (meta, results) for one Bioclinica report."""
    meta = {"lab": "Bioclinica", "sample_id": None, "coll_date": None, "val_date": None}
    results = []

    flat_plain = text_plain.replace("\n", " ")
    flat_layout = text_layout.replace("\n", " ")

    m = re.search(r"Buletin de analize\s+(\S+)\s+din", flat_plain)
    if m:
        meta["sample_id"] = m.group(1)

    # Dates are on the same line as their labels only in layout text
    m = re.search(r"RECOLTAT\s+(\d{2}\.\d{2}\.\d{4})", flat_layout)
    if m:
        meta["coll_date"] = parse_date_dd_mm_yyyy(m.group(1))

    m = re.search(r"GENERAT\s+(\d{2}\.\d{2}\.\d{4})", flat_layout)
    if m:
        meta["val_date"] = parse_date_dd_mm_yyyy(m.group(1))

    category = "General"
    pending_name = None

    for line in text_layout.splitlines():
        stripped = line.strip()

        if not stripped:
            continue

        if BC_SKIP.search(stripped):
            continue

        # Section headers (e.g. "Hemoleucogramă", "Formula leucocitară")
        if BC_SECTION.match(line):
            category = stripped
            pending_name = None
            continue

        # Panel result: "  Hematii   5.790.000 /mm³   (4.300.000 - 5.750.000)"
        mr = BC_PANEL_LINE.match(line)
        if mr:
            name = mr.group(1).strip()
            val_str, unit, ref_str = mr.group(2), mr.group(3), mr.group(4)
            num = to_float(val_str)
            rmin, rmax = parse_ref(ref_str)
            results.append({
                "category": category,
                "test_name": name,
                "test_code": None,
                "result_numeric": num,
                "result_text": None,
                "unit": unit,
                "ref_min": rmin,
                "ref_max": rmax,
                "is_flagged": flagged(num, rmin, rmax),
            })
            pending_name = None
            continue

        # Standalone value: heavily indented "    1,38 ng/mL    (≤ 4,00)"
        mv = BC_STANDALONE_VAL.match(line)
        if mv and pending_name:
            val_str, unit, ref_str = mv.group(1), mv.group(2), mv.group(3)
            num = to_float(val_str)
            rmin, rmax = parse_ref(ref_str)
            results.append({
                "category": category,
                "test_name": pending_name,
                "test_code": None,
                "result_numeric": num,
                "result_text": None,
                "unit": unit,
                "ref_min": rmin,
                "ref_max": rmax,
                "is_flagged": flagged(num, rmin, rmax),
            })
            # Keep pending_name: glucose has two value lines (mg/dL + mmol/L)
            continue

        # Standalone test name: left-aligned, starts with a letter
        if not line.startswith(" ") and re.match(r"^[A-Za-zÀ-ÿ\u0100-\u017e]", stripped):
            pending_name = stripped

    return meta, results


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

def print_preview(meta, results):
    print(f"\n  Report:  {meta['lab']}  |  sample={meta['sample_id']}"
          f"  |  collected={meta['coll_date']}  |  validated={meta['val_date']}")
    print(f"  {'#':<4} {'category':<25} {'test_name':<35} {'value':>10} {'unit':<12} {'ref_min':>8} {'ref_max':>8} {'flag'}")
    print(f"  {'-'*4} {'-'*25} {'-'*35} {'-'*10} {'-'*12} {'-'*8} {'-'*8} {'-'*4}")
    for i, r in enumerate(results, 1):
        val = r.get("result_numeric") if r.get("result_numeric") is not None else r.get("result_text", "")
        print(f"  {i:<4} {(r['category'] or ''):<25} {r['test_name']:<35} "
              f"{str(val):>10} {(r['unit'] or ''):<12} "
              f"{str(r['ref_min'] or ''):>8} {str(r['ref_max'] or ''):>8} "
              f"{'YES' if r['is_flagged'] else ''}")


def process_pdf(pdf_path, conn, dry_run):
    """Process a single PDF file and return (reports_count, results_count)."""
    pages_plain  = pdf_pages(pdf_path, layout=False)
    pages_layout = pdf_pages(pdf_path, layout=True)

    n_pages = max(len(pages_plain), len(pages_layout))

    # Pad to same length
    while len(pages_plain)  < n_pages: pages_plain.append("")
    while len(pages_layout) < n_pages: pages_layout.append("")

    # Group pages by (format, sample_id)
    groups: dict[tuple, list[int]] = defaultdict(list)
    for i in range(n_pages):
        fmt, sid = classify_page(pages_plain[i], pages_layout[i])
        if fmt in ("CRTSC", "RM", "SY", "BC") and sid:
            groups[(fmt, sid)].append(i)

    report_count = 0
    result_count = 0

    for (fmt, sid), page_idxs in groups.items():
        combined_plain  = "\n".join(pages_plain[i]  for i in page_idxs)
        combined_layout = "\n".join(pages_layout[i] for i in page_idxs)

        if fmt == "CRTSC":
            meta, results = parse_crtsc(combined_layout, combined_plain)
        elif fmt == "RM":
            meta, results = parse_rm(combined_layout)
        elif fmt == "SY":
            meta, results = parse_synevo(combined_layout)
        elif fmt == "BC":
            meta, results = parse_bioclinica(combined_layout, combined_plain)
        else:
            continue

        if not results:
            print(f"  WARNING: {fmt} {sid} → 0 results (check parser)")
            continue

        if dry_run:
            print_preview(meta, results)
            report_count += 1
            result_count += len(results)
            continue

        rid = save_report(conn, meta["lab"], sid, meta["coll_date"], meta["val_date"])
        if rid is None:
            continue

        n = save_results(conn, rid, results)
        print(f"  [{meta['lab']:13}] {meta['coll_date']}  {sid}  → {n} results")
        report_count += 1
        result_count += n

    return report_count, result_count


def main(path_arg="all.pdf"):
    """Process PDF file(s) from path_arg (can be a file or folder)."""
    dry_run = "--dry-run" in sys.argv
    base_path = Path(__file__).parent / path_arg

    # Determine if input is a folder or file
    if base_path.is_dir():
        pdf_files = sorted(base_path.glob("*.pdf"))
        if not pdf_files:
            print(f"Error: No PDF files found in folder: {base_path}")
            sys.exit(1)
        print(f"Found {len(pdf_files)} PDF file(s) in {base_path.name}/")
    elif base_path.is_file():
        pdf_files = [base_path]
        print(f"Processing PDF file: {base_path.name}")
    else:
        print(f"Error: Path not found: {base_path}")
        sys.exit(1)

    if dry_run:
        print("\n--- DRY RUN: showing what would be inserted ---")

    conn = None if dry_run else sqlite3.connect(DB_PATH)
    if conn:
        init_db(conn)

    total_reports = 0
    total_results = 0

    for pdf_path in pdf_files:
        print(f"\nExtracting pages from {pdf_path.name} ...")
        try:
            reports, results = process_pdf(pdf_path, conn, dry_run)
            total_reports += reports
            total_results += results
        except Exception as e:
            print(f"  ERROR processing {pdf_path.name}: {e}")
            continue

    if conn:
        conn.close()

    suffix = "(dry run, nothing saved)" if dry_run else f"→ {DB_PATH.name}"
    print(f"\nDone. {total_reports} reports, {total_results} results {suffix}")


if __name__ == "__main__":
    # Get path argument (file or folder), default to "all.pdf"
    # Skip --dry-run flag when finding path argument
    args = [arg for arg in sys.argv[1:] if arg != "--dry-run"]
    path_arg = args[0] if args else "all.pdf"
    main(path_arg)
