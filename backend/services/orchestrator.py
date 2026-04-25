import google.generativeai as googleai
from google.api_core import exceptions as google_exceptions
import json
import os
import logging
import time
from dotenv import load_dotenv


load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

googleai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
model = googleai.GenerativeModel("gemini-2.5-flash")


def _generate_with_retry(prompt: str, max_retries: int = 5) -> str:
    delay = 10
    for attempt in range(max_retries):
        try:
            return model.generate_content(prompt).text
        except (google_exceptions.ResourceExhausted, google_exceptions.ServiceUnavailable) as e:
            if attempt == max_retries - 1:
                raise
            logger.warning(f"Gemini error ({e.__class__.__name__}), retrying in {delay}s... (attempt {attempt + 1}/{max_retries})")
            time.sleep(delay)
            delay *= 2

DOCUMENT_TYPES = ["blood_test", "doctor_letters", "xray_report", "prescription", "unknown"]


def analyze_doc(raw_text: str) -> dict:
    prompt = f"""
        You are a knowledgeable medical expert analysis assistant.

        Analyze the following medical document text and return ONLY a valid JSON object - no explanation, no markdown, no preamble.

        Document text:
        \"\"\"
        {raw_text[:3000]}
        \"\"\"

        Return this exact structure:
        {{
        "detected_language": "<ISO 639-1 language code, e.g. en, ru, de, ja>",
        "needs_translation": <true if language is not English, false otherwise>,
        "document_type": "<one of: blood_test, doctor_letter, xray_report, prescription, unknown>",
        "document_date": "<date if found, else null>",
        "patient_name": "<patient name if found, else null>",
        "doctor_name": "<doctor name if found, else null>",
        "clinic_name": "<clinic or hospital name if found, else null>",
        "initial_observations": "<1-2 sentence summary of what this document contains>"
        }}
        """

    logger.info("Orchestrator: analysing document...")
    response = _generate_with_retry(prompt)
    result = _parse_json(response)
    logger.info(f"Orchestrator: detected language={result.get('detected_language')}, type={result.get('document_type')}")
    return result


def route_to_workers(analysis: dict) -> list[str]:
    doc_type = analysis.get("document_type", "unknown")
    routes = {
        "blood_test": ["translator", "extractor", "flagging", "summariser"],
        "doctor_letter": ["translator", "extractor", "flagging", "summariser"],
        "xray_report": ["translator", "extractor", "flagging", "summariser"],
        "prescription": ["translator", "extractor", "flagging", "summariser"],
        "unknown": ["translator", "summariser"],
    }
    selected = routes.get(doc_type, ["translator", "summariser"])
    logger.info(f"Orchestrator: routing to workers {selected}")
    return selected


def assemble_summary(
        original_text: str,
        translated_text: str,
        analysis: dict,
        extracted_data: dict = None,
        flagged_values: dict = None
) -> dict:
    extracted_str = json.dumps(extracted_data, indent=2) if extracted_data else "Not available"
    flagged_str = json.dumps(flagged_values, indent=2) if flagged_values else "Everything seems normal"

    prompt = f"""
        You are a medical document summarisation assistant.

        Based on the following information, generate a structured summary in English.
        Respond ONLY with a valid JSON object — no explanation, no markdown, no preamble.

        Document type: {analysis.get('document_type')}
        Document date: {analysis.get('document_date')}
        Patient name: {analysis.get('patient_name')}
        Doctor: {analysis.get('doctor_name')}
        Clinic: {analysis.get('clinic_name')}

        Translated document text:
        \"\"\"
        {translated_text[:3000]}
        \"\"\"

        Extracted structured data:
        {extracted_str}

        Flagged abnormal values:
        {flagged_str}

        Return this exact structure:
        {{
        "medical_history_summary": "<key medical findings or history mentioned>",
        "medications": ["<medication 1>", "<medication 2>"],
        "abnormalities": ["<abnormal finding 1>", "<abnormal finding 2>"],
        "latest_medical_activities": "<most recent tests, visits, or procedures mentioned>",
        "patient_hints": {{
            "name": "<patient name if found>",
            "age": "<age if found, else null>",
            "sex": "<sex if found, else null>",
            "home_country": "<inferred from language or clinic location, else null>",
            "languages": ["<language spoken based on document language>"]
        }}
        }}
    """

    logger.info("Orchestrator: assembling per-document summary...")
    response = _generate_with_retry(prompt)
    return _parse_json(response.text)


def run(
        raw_text: str,
        translator_func=None,
        extractor_func=None,
        flagging_func=None
) -> dict:
    analysis = analyze_doc(raw_text)
    workers = route_to_workers(analysis)

    translated_text = raw_text
    if "translator" in workers and analysis.get("needs_translation") and translator_func:
        logger.info("Orchestrator: needs translation worker")
        translated_text = translator_func(raw_text, source_lang=analysis.get("detected_language"))

    extracted_data = None
    if "extractor" in workers and extractor_func:
        logger.info("Orchestrator: needs extractor worker")
        extracted_data = extractor_func(translated_text)

    flagged_values = None
    if "flagging" in workers and flagging_func:
        logger.info("Orchestrator: needs flagging worker")
        flagged_values = flagging_func(extracted_data)

    summary = assemble_summary(
        original_text=raw_text,
        translated_text=translated_text,
        analysis=analysis,
        extracted_data=extracted_data,
        flagged_values=flagged_values
    )

    return {
        "analysis": analysis,
        "workers_used": workers,
        "translated_text": translated_text,
        "summary": summary,
    }


def build_doctor_pack(
        documents: list[dict],
        translator_func=None,
        extractor_func=None,
        flagging_func=None
) -> dict:
    """
    Takes a list of {"raw_text": str, "filename": str} dicts,
    runs each through the pipeline, then asks Gemini to combine
    everything into a single doctor pack.
    """
    results_by_type = {}

    for i, doc in enumerate(documents):
        raw_text = doc.get("raw_text", "")
        filename = doc.get("filename", "unknown")
        logger.info(f"Processing document: {filename}")

        if i > 0:
            time.sleep(5)

        result = run(raw_text, translator_func, extractor_func, flagging_func)
        doc_type = result["analysis"].get("document_type", "unknown")

        if doc_type not in results_by_type:
            results_by_type[doc_type] = []
        results_by_type[doc_type].append({
            "filename": filename,
            "analysis": result["analysis"],
            "summary": result["summary"],
        })

    grouped_str = json.dumps(results_by_type, indent=2, ensure_ascii=False)

    prompt = f"""
        You are a senior medical assistant preparing a travel health passport for a patient visiting a foreign doctor.

        Below are structured summaries extracted from multiple medical documents, grouped by type.
        Combine them into a single comprehensive doctor pack.
        Respond ONLY with a valid JSON object — no explanation, no markdown, no preamble.

        Document summaries:
        {grouped_str[:6000]}

        Return this exact structure:
        {{
        "patient_overview": {{
            "name": "<patient full name>",
            "age": "<age or null>",
            "sex": "<sex or null>",
            "home_country": "<home country or null>",
            "currently_lives": "<current country/city if known, else null>",
            "languages": ["<language 1>", "<language 2>"]
        }},
        "medical_history_summary": {{
            "blood_tests": "<summary of blood test findings>",
            "doctor_letters": "<summary of doctor letter findings>",
            "xray_reports": "<summary of xray findings>",
            "prescriptions": "<summary of prescriptions>",
            "other": "<any other relevant findings>"
        }},
        "current_medications": ["<medication 1>", "<medication 2>"],
        "abnormal_values": ["<finding 1>", "<finding 2>"],
        "recent_medical_activities": ["<activity 1 with date>", "<activity 2 with date>"]
        }}
    """

    logger.info("Orchestrator: building final doctor pack...")
    response = _generate_with_retry(prompt)
    doctor_pack = _parse_json(response.text)

    return {
        "doctor_pack": doctor_pack,
        "documents_processed": len(documents),
        "documents_by_type": {k: len(v) for k, v in results_by_type.items()},
    }


def _parse_json(text: str) -> dict:
    try:
        clean = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini JSON response: {e}")
        logger.error(f"Raw response: {text}")
        return {}


if __name__ == "__main__":
    sample_docs = [
        {
            "filename": "blood_test.txt",
            "raw_text": """
            Общий анализ крови
            Пациент: Зоряшка Зорявна
            Дата: 16.03.2024

            Гемоглобин: 110 г/л (норма: 130-170)
            Эритроциты: 3.5 х10^12/л (норма: 4.0-5.0)
            Лейкоциты: 9.5 х10^9/л (норма: 4.0-9.0)
            Тромбоциты: 250 х10^9/л (норма: 180-320)

            Врач: Петрова А.В.
            """
        }
    ]

    result = build_doctor_pack(sample_docs)

    print("\nDoctor pack")
    print(json.dumps(result["doctor_pack"], indent=2, ensure_ascii=False))
    print(f"\nDocuments processed: {result['documents_processed']}")
    print(f"By type: {result['documents_by_type']}")
