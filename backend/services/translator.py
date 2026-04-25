import os
import time
import logging
from google import genai
from google.genai import errors as genai_errors
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
TRANSLATOR_MODEL = "gemini-2.5-flash-lite"

def translate(text: str, source_lang: str, max_retries: int = 4) -> str:
    if source_lang == "en":
        return text

    prompt = f"""You are a professional medical translator.
Translate the following medical document text from {source_lang} to English.
Rules:
- Preserve all medical terms, drug names, lab values, units, and numbers exactly
- Do not explain or summarise — translate only
- Return only the translated text, nothing else

Text to translate:
\"\"\"
{text}
\"\"\"
"""

    delay = 10

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=TRANSLATOR_MODEL,
                contents=prompt,
            )

            logger.info(f"Translator: translated from {source_lang} to English")
            return response.text.strip()

        except genai_errors.ClientError as e:
            if "404" in str(e):
                logger.error(f"Translator model not found or unavailable: {TRANSLATOR_MODEL}")
                return text

            if attempt == max_retries - 1:
                logger.error("Translator: max retries reached, returning original text")
                return text

            logger.warning(
                f"Translator: {e.__class__.__name__}, retrying in {delay}s... "
                f"(attempt {attempt + 1}/{max_retries})"
            )
            time.sleep(delay)
            delay *= 2

        except genai_errors.ServerError as e:
            if attempt == max_retries - 1:
                logger.error("Translator: max retries reached, returning original text")
                return text

            logger.warning(
                f"Translator: {e.__class__.__name__}, retrying in {delay}s... "
                f"(attempt {attempt + 1}/{max_retries})"
            )
            time.sleep(delay)
            delay *= 2


if __name__ == "__main__":
    sample_de = """
    Sehr geehrte Kolleginnen und Kollegen,
    Patientin: Zarina Beisenbayeva, geb. 01.01.1990
    Diagnose: Eisenmangelanämie
    Hämoglobin: 98 g/L (Normalwert: 120-160)
    Empfehlung: Eisenpräparate 100mg täglich
    """

    result = translate(sample_de, source_lang="de")
    print(result)