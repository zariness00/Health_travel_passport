import re
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Fallback ranges for when the document doesn't include one.
# General adult values only — document ranges are always preferred.
FALLBACK_RANGES = {
    ("hemoglobin", "hgb", "hb"):                 (115.0, 170.0),
    ("erythrocytes", "rbc", "red blood cells"):  (3.5,   5.5),
    ("leukocytes", "wbc", "white blood cells"):  (4.0,   9.0),
    ("platelets", "plt", "thrombocytes"):        (150.0, 400.0),
    ("hematocrit", "hct"):                       (35.0,  52.0),
    ("mcv",):                                    (80.0,  100.0),
    ("mch",):                                    (27.0,  34.0),
    ("mchc",):                                   (320.0, 360.0),
    ("neutrophils",):                            (1.8,   7.5),
    ("lymphocytes",):                            (1.0,   4.8),
    ("monocytes",):                              (0.2,   1.0),
    ("eosinophils",):                            (0.0,   0.5),
    ("basophils",):                              (0.0,   0.1),
    ("glucose",):                                (3.9,   6.1),
    ("creatinine",):                             (44.0,  115.0),
    ("urea",):                                   (2.5,   8.3),
    ("alt", "alanine aminotransferase"):         (0.0,   40.0),
    ("ast", "aspartate aminotransferase"):       (0.0,   40.0),
    ("bilirubin",):                              (3.0,   21.0),
    ("cholesterol",):                            (0.0,   5.2),
    ("triglycerides",):                          (0.0,   1.7),
    ("potassium",):                              (3.5,   5.1),
    ("sodium",):                                 (136.0, 145.0),
    ("calcium",):                                (2.15,  2.55),
    ("tsh",):                                    (0.4,   4.0),
    ("t4", "free t4", "ft4"):                    (12.0,  22.0),
    ("t3", "free t3", "ft3"):                    (3.1,   6.8),
    ("ferritin",):                               (12.0,  300.0),
    ("iron", "serum iron"):                      (10.7,  32.2),
}


def flag(extracted_data: dict) -> dict:
    if not extracted_data:
        return {}

    lab_values = extracted_data.get("lab_values", [])
    flagged = []

    for entry in lab_values:
        name = entry.get("name", "")
        raw_value = entry.get("value", "")
        unit = entry.get("unit", "")
        doc_reference = entry.get("reference_range")

        value = _parse_float(raw_value)
        if value is None:
            continue

        # document's own range is always preferred (already age/sex adjusted)
        ref_min, ref_max = _parse_doc_reference(doc_reference) if doc_reference else (None, None)

        # fall back to generic table only if document had no range
        if ref_min is None:
            ref_min, ref_max = _lookup_fallback(name)

        if ref_min is None:
            continue

        if value < ref_min:
            status = "LOW"
        elif value > ref_max:
            status = "HIGH"
        else:
            continue

        flagged.append({
            "name": name,
            "value": raw_value,
            "unit": unit,
            "status": status,
            "reference_range": f"{ref_min}-{ref_max}",
            "range_source": "document" if doc_reference else "fallback_table",
        })

    logger.info(f"Flagging: {len(flagged)} abnormal value(s) out of {len(lab_values)}")
    return {"flagged_values": flagged}


def _parse_float(value: str) -> float | None:
    try:
        return float(value.replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _parse_doc_reference(reference: str) -> tuple[float | None, float | None]:
    match = re.search(r"([\d.,]+)\s*[-–]\s*([\d.,]+)", reference)
    if match:
        try:
            return float(match.group(1).replace(",", ".")), float(match.group(2).replace(",", "."))
        except ValueError:
            pass
    return None, None


def _lookup_fallback(name: str) -> tuple[float | None, float | None]:
    name_lower = name.lower().strip()
    for variants, (ref_min, ref_max) in FALLBACK_RANGES.items():
        if any(name_lower == v or name_lower.startswith(v) for v in variants):
            return ref_min, ref_max
    return None, None


if __name__ == "__main__":
    sample_extracted = {
        "lab_values": [
            {"name": "Hemoglobin", "value": "98",  "unit": "g/L",     "reference_range": "120-160"},
            {"name": "WBC",        "value": "9.5", "unit": "x10^9/L", "reference_range": "4.0-9.0"},
            {"name": "Platelets",  "value": "250", "unit": "x10^9/L", "reference_range": "150-400"},
            {"name": "Glucose",    "value": "7.2", "unit": "mmol/L",  "reference_range": None},
        ]
    }
    result = flag(sample_extracted)
    print(json.dumps(result, indent=2))
