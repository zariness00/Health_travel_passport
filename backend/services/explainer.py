import os
import time
import logging
from google import genai
from google.genai import errors as genai_errors
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
EXPLAINER_MODEL = "gemini-2.5-flash-lite"


def explain(extracted_data: dict, flagged_values: dict, max_retries: int = 4) -> str:
    flagged = flagged_values.get("flagged_values", []) if flagged_values else []
    conditions = extracted_data.get("conditions", []) if extracted_data else []
    symptoms = extracted_data.get("symptoms", []) if extracted_data else []

    if not flagged and not conditions and not symptoms:
        return "All measured values appear within normal ranges."

    flagged_lines = "\n".join(
        f"- {v['name']}: {v['value']} {v['unit']} ({v['status']}, normal: {v['reference_range']})"
        for v in flagged
    ) or "None"

    prompt = f"""You are a friendly medical assistant explaining lab results to a patient in simple language.

Abnormal lab values:
{flagged_lines}

Diagnosed conditions: {", ".join(conditions) or "none"}
Symptoms noted: {", ".join(symptoms) or "none"}

Write one short paragraph (3-5 sentences) explaining what these findings mean in plain language
a non-medical person can understand. Do not use medical jargon. Be reassuring but honest.
Do not recommend treatments. Do not start with "I".
"""

    delay = 10
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(model=EXPLAINER_MODEL, contents=prompt)
            logger.info("Explainer: generated lab explanation")
            return response.text.strip()
        except (genai_errors.ClientError, genai_errors.ServerError) as e:
            if attempt == max_retries - 1:
                logger.error("Explainer: max retries reached")
                return ""
            logger.warning(f"Explainer: {e.__class__.__name__}, retrying in {delay}s...")
            time.sleep(delay)
            delay *= 2


if __name__ == "__main__":
    sample_extracted = {
        "conditions": ["Iron deficiency anemia"],
        "symptoms": ["fatigue"],
    }
    sample_flagged = {
        "flagged_values": [
            {"name": "Hemoglobin", "value": "98", "unit": "g/L", "status": "LOW", "reference_range": "120-160"},
            {"name": "WBC", "value": "9.5", "unit": "x10^9/L", "status": "HIGH", "reference_range": "4.0-9.0"},
        ]
    }
    print(explain(sample_extracted, sample_flagged))
