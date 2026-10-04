#!/usr/bin/env python3
"""Refresh public fund factsheet snapshots; fail closed on missing or malformed data.

Only public issuer PDFs are fetched. No account JSON, transaction, or holding amount
is read or transmitted. Run from the repository root after installing pypdf.
"""

from __future__ import annotations

import argparse
import calendar
import io
import json
import re
import sys
import urllib.request
from urllib.parse import urlparse
from datetime import date, datetime
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "research.json"
MONTHS = {name: number for number, name in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], 1
)}
EN_TO_ZH = {
    "HSBC Holdings PLC": "滙豐控股",
    "Tencent Holdings": "騰訊控股",
    "Alibaba Group Holding - W": "阿里巴巴－W",
    "Alibaba Group Holding - ADR": "阿里巴巴－ADR",
    "China Construction Bank": "建設銀行",
    "AIA Group": "友邦保險",
    "Industrial & Commercial Bank of China": "工商銀行",
    "CATL": "寧德時代",
    "Zhongji Innolight": "中際旭創",
    "Eoptolink Technology": "新易盛",
    "Pinduoduo - ADR": "拼多多－ADR",
    "Xiaomi - W": "小米－W",
    "China Mobile": "中國移動",
    "NVIDIA Corp": "NVIDIA",
    "Apple Inc": "Apple",
    "Microsoft Corp": "Microsoft",
    "Alphabet Inc": "Alphabet",
    "Amazon.com Inc": "Amazon",
    "Broadcom Inc": "Broadcom",
}
SECTORS = (
    "Information Technology", "Communication Services", "Consumer Discretionary",
    "Consumer Staples", "Health Care", "Financials", "Industrials", "Energy",
    "Materials", "Utilities", "Real Estate",
)
SECTOR_RE = "|".join(re.escape(item) for item in SECTORS)
CONFIG = {
    "U50005": ("hsi.pdf", "Hang Seng Index Fund", "hangseng"),
    "U50011": ("china-new.pdf", "Hang Seng China New Economy Index Fund", "hangseng"),
    "U45076": ("china-h.pdf", "Hang Seng China Enterprises Index Fund", "hangseng"),
    "U50004": ("hsbc-global.pdf", "HSBC Global Funds ICAV Global Equity Index Fund", "hsbc"),
    "U50009": ("hsbc-us.pdf", "HSBC Global Funds ICAV US Equity Index Fund", "hsbc"),
}


def as_iso(day: int, month: str, year: int) -> str:
    return date(year, MONTHS[month], day).isoformat()


def fetch_pdf(url: str) -> bytes:
    if not url.startswith(("https://cms.hangsenginvestment.com/", "https://www.hfi.hsbc.com.hk/")):
        raise ValueError("unexpected issuer host")
    request = urllib.request.Request(url, headers={"User-Agent": "FundLedgerFactsheetUpdater/1.0"})
    with urllib.request.urlopen(request, timeout=35) as response:
        if urlparse(response.geturl()).hostname not in {"cms.hangsenginvestment.com", "www.hfi.hsbc.com.hk"}:
            raise ValueError("issuer redirected to an unexpected host")
        data = response.read(12_000_001)
    if len(data) > 12_000_000 or not data.startswith(b"%PDF-"):
        raise ValueError("issuer response is not an expected-size PDF")
    return data


def parse_factsheet(pdf_data: bytes, title: str, kind: str) -> tuple[str, list[list[object]]]:
    reader = PdfReader(io.BytesIO(pdf_data))
    page_index = 0 if kind == "hangseng" else 2
    if len(reader.pages) <= page_index:
        raise ValueError("factsheet has too few pages")
    page = reader.pages[page_index].extract_text() or ""
    if title not in page:
        raise ValueError(f"wrong factsheet; expected {title}")

    if kind == "hangseng":
        date_match = re.search(re.escape(title) + r"\s+([A-Z][a-z]+)\s+(20\d{2})", page)
        if not date_match or date_match.group(1) not in MONTHS:
            raise ValueError("missing Hang Seng report month")
        month, year = date_match.groups()
        report_date = as_iso(calendar.monthrange(int(year), MONTHS[month])[1], month, int(year))
        section = page.split("Top Holdings\n", 1)
        if len(section) != 2:
            raise ValueError("missing Top Holdings section")
        lines = section[1].splitlines()
        matches = []
        for line in lines[:20]:
            match = re.fullmatch(r"(.+?)\s+(\d{1,2}\.\d{1,2})%", line.strip())
            if match:
                matches.append((match.group(1).strip(), float(match.group(2))))
        holdings = matches[:6]
    else:
        date_match = re.search(r"Monthly report\s*(\d{1,2})\s+([A-Z][a-z]+)\s+(20\d{2})", page)
        if not date_match or date_match.group(2) not in MONTHS:
            raise ValueError("missing HSBC report date")
        day, month, year = date_match.groups()
        report_date = as_iso(int(day), month, int(year))
        section = page.split("Top 10 Holdings", 1)
        if len(section) != 2:
            raise ValueError("missing Top 10 Holdings section")
        holdings = []
        for line in section[1].splitlines()[:18]:
            match = re.fullmatch(
                rf"(.+?)\s+(?:United States\s+)?(?:{SECTOR_RE})\s+(\d{{1,2}}\.\d{{1,2}})",
                line.strip(),
            )
            if match:
                holdings.append((match.group(1).strip(), float(match.group(2))))
        holdings = holdings[:6]

    if len(holdings) != 6 or any(weight <= 0 or weight >= 50 for _, weight in holdings):
        raise ValueError(f"could not validate six holdings for {title}: {holdings}")
    if holdings != sorted(holdings, key=lambda item: item[1], reverse=True):
        raise ValueError("top holdings are not in descending weight order")
    return report_date, [[EN_TO_ZH.get(name, name), weight] for name, weight in holdings]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-dir", type=Path, help="read previously downloaded official PDFs for testing")
    parser.add_argument("--check", action="store_true", help="validate only; do not write research.json")
    args = parser.parse_args()
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != 1 or set(data.get("funds", {})) != set(CONFIG):
        raise ValueError("unexpected research.json schema or fund list")

    pending = {}
    for code, (fixture_name, title, kind) in CONFIG.items():
        fund = data["funds"][code]
        pdf = (args.fixture_dir / fixture_name).read_bytes() if args.fixture_dir else fetch_pdf(fund["source"])
        report_date, holdings = parse_factsheet(pdf, title, kind)
        if report_date > date.today().isoformat() or report_date < fund["asOf"]:
            raise ValueError(f"unexpected report date for {code}: {report_date}")
        pending[code] = (report_date, holdings)
        print(f"{code}: {report_date}, {len(holdings)} public holdings")

    if args.check:
        return 0
    for code, (report_date, holdings) in pending.items():
        data["funds"][code]["asOf"] = report_date
        data["funds"][code]["holdings"] = holdings
    data["checkedAt"] = date.today().isoformat()
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Research update aborted; previous JSON preserved: {exc}", file=sys.stderr)
        sys.exit(1)
