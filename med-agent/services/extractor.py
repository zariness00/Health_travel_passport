import os
import re
import time
import json
import logging
import requests
from google import genai
from google.genai import errors as genai_errors
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HF_API_KEY = os.getenv("HF_API_KEY")
NER_MODEL_URL = "https://router.huggingface.co/hf-inference/models/d4data/biomedical-ner-all"

_gemini_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
FALLBACK_MODEL = "gemini-2.5-flash-lite"


LAB_PATTERN = re.compile(
    r"^[ \t]*"                                                  # optional leading whitespace
    r"([A-Za-zÄÖÜäöüÀ-ÿ][A-Za-z0-9 \-/äöüÄÖÜ]{1,40}?)"       # test name (non-greedy)
    r"\s*:\s*"
    r"([\d.,]+)"                                                # numeric value
    r"\s*([a-zA-Z/%µ^0-9·×*]{1,15})?"                          # unit (no spaces — avoids swallowing next word)
    r"(?:\s*[\(\[].*?(\d[\d.,\s\-–]+\d)[\)\]])?",              # optional reference range
    re.MULTILINE | re.IGNORECASE
)


DATE_VALUE_PATTERN = re.compile(
    r"^\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}$|^\d{4}[./\-]\d{2}[./\-]\d{2}$"
)

DATE_PATTERN = re.compile(
    r"\b(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}|\d{4}[./\-]\d{2}[./\-]\d{2})\b"
)

# ── FIX 3: labeled field patterns for structured documents ────────────────
LABELED_MED_PATTERN = re.compile(
    r"^[ \t]*(?:Medication|Drug|Prescription|Treatment|Prescribed)\s*:\s*(.+)$",
    re.MULTILINE | re.IGNORECASE
)

LABELED_DIAGNOSIS_PATTERN = re.compile(
    r"^[ \t]*(?:Diagnosis|Condition|Assessment|Impression)\s*:\s*(.+)$",
    re.MULTILINE | re.IGNORECASE
)

# names that are NOT lab tests,  skip these lines
SKIP_NAMES = {"patient", "date", "doctor", "physician", "clinic", "hospital",
              "name", "dob", "sex", "gender", "address", "diagnosis",
              "medication", "drug", "prescription", "treatment"}


def extract(text: str) -> dict:
    lab_values = _extract_lab_values(text)

    # regex misses table-format lab reports — fall back to Gemini
    if not lab_values:
        lab_values = _extract_lab_values_with_gemini(text)

    labeled_meds = _extract_labeled_fields(text, LABELED_MED_PATTERN)
    labeled_conditions = _extract_labeled_fields(text, LABELED_DIAGNOSIS_PATTERN)
    ner_entities = _extract_ner_entities(text)
    dates = _extract_dates(text)

    # merge NER results with labeled field results
    ner_medications = _collect(ner_entities, {"CLINICAL_DRUG"})
    ner_conditions = _collect(ner_entities, {"DISEASE_OR_SYNDROME"})
    symptoms = _collect(ner_entities, {"SIGN_OR_SYMPTOM"})
    body_parts = _collect(ner_entities, {"BODY_PART_OR_ORGAN_COMPONENT"})
    procedures = _collect(ner_entities, {"THERAPEUTIC_OR_PREVENTIVE_PROCEDURE", "DIAGNOSTIC_PROCEDURE"})

    medications = list(set(labeled_meds + ner_medications))
    conditions = list(set(labeled_conditions + ner_conditions))

    logger.info(
        f"Extractor: {len(lab_values)} lab values, {len(medications)} medications, "
        f"{len(conditions)} conditions, {len(symptoms)} symptoms, {len(procedures)} procedures"
    )

    return {
        "lab_values": lab_values,
        "medications": medications,
        "conditions": conditions,
        "symptoms": symptoms,
        "body_parts": body_parts,
        "procedures": procedures,
        "dates": dates,
    }


def _extract_lab_values(text: str) -> list[dict]:
    results = []
    for match in LAB_PATTERN.finditer(text):
        name = match.group(1).strip()
        value = match.group(2).strip()
        unit = (match.group(3) or "").strip()
        reference = match.group(4).strip() if match.group(4) else None

        # FIX 2: skip if name is a known non-lab field
        if name.lower().rstrip(":") in SKIP_NAMES:
            continue

        # FIX 2: skip if value looks like a date
        if DATE_VALUE_PATTERN.match(value):
            continue

        # skip if name is too short or value is empty
        if len(name) < 2 or not value:
            continue

        results.append({
            "name": name,
            "value": value,
            "unit": unit,
            "reference_range": reference,
        })
    return results


def _extract_lab_values_with_gemini(text: str, max_retries: int = 3) -> list[dict]:
    """Fallback for table-format lab reports the regex can't parse."""
    prompt = f"""Extract all lab test results from this medical document.
Return ONLY a valid JSON array — no markdown, no explanation.
Each item: {{"name": str, "value": str, "unit": str, "reference_range": str or null}}.
Do NOT include patient demographics, addresses, dates, or non-lab fields.
If no lab values found, return [].

Document text:
\"\"\"
{text[:8000]}
\"\"\"
"""
    delay = 5
    for attempt in range(max_retries):
        try:
            response = _gemini_client.models.generate_content(
                model=FALLBACK_MODEL, contents=prompt
            )
            cleaned = response.text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            values = json.loads(cleaned)
            if isinstance(values, list):
                logger.info(f"Extractor: Gemini fallback found {len(values)} lab values")
                return values
            return []
        except (genai_errors.ClientError, genai_errors.ServerError, json.JSONDecodeError) as e:
            if attempt == max_retries - 1:
                logger.error(f"Extractor: Gemini fallback failed: {e}")
                return []
            time.sleep(delay)
            delay *= 2
    return []


def _extract_labeled_fields(text: str, pattern: re.Pattern) -> list[str]:
    """Extract values from labeled lines like 'Medication: Ferrous sulfate 100mg daily'"""
    results = []
    for match in pattern.finditer(text):
        value = match.group(1).strip()
        if value:
            results.append(value)
    return results


def _extract_ner_entities(text: str, max_retries: int = 4) -> list[dict]:
    if not HF_API_KEY:
        logger.warning("Extractor: HF_API_KEY not set, skipping NER")
        return []

    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    all_entities = []

    # NER model max input is 512 chars,  chunking to cover full document
    chunks = [text[i:i+512] for i in range(0, min(len(text), 2048), 512)]

    for chunk in chunks:
        payload = {"inputs": chunk}
        delay = 10
        for attempt in range(max_retries):
            response = requests.post(NER_MODEL_URL, headers=headers, json=payload)

            if response.status_code == 200:
                all_entities.extend(_merge_entities(response.json()))
                break

            if response.status_code == 503:
                logger.warning(f"Extractor: NER model loading, retrying in {delay}s... (attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
                delay *= 2
                continue

            logger.error(f"Extractor: HuggingFace NER error {response.status_code}: {response.text}")
            break

    return all_entities


def _merge_entities(entities: list[dict]) -> list[dict]:
    """Merge consecutive subword tokens (e.g. 'Hemo' + '##globin') into full words."""
    merged = []
    for entity in entities:
        word = entity.get("word", "")
        label = entity.get("entity_group") or entity.get("entity", "")
        score = entity.get("score", 0)

        if word.startswith("##") and merged:
            merged[-1]["word"] += word[2:]
        else:
            merged.append({"word": word, "entity": label, "score": score})
    return merged


def _collect(entities: list[dict], labels: set) -> list[str]:
    return [e["word"] for e in entities if e["entity"] in labels]


def _extract_dates(text: str) -> list[str]:
    return list(set(DATE_PATTERN.findall(text)))


if __name__ == "__main__":
    sample = """
    Patient: Ivan Ivanovich, 01.01.1990
    Diagnosis: Iron deficiency anemia
    Hemoglobin: 98 g/L (normal: 120-160)
    WBC: 9.5 x10^9/L (normal: 4.0-9.0)
    Medication: Ferrous sulfate 100mg daily
    Date: 08.04.2026
    """

    result = extract(sample)
    import json
    print(json.dumps(result, indent=2))