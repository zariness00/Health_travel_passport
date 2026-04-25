import fitz
import pytesseract
from PIL import Image
import io
import logging 
from pathlib import Path
from docx import Document
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx']
MIN_LENGTH_DOC = 50 


def extract_text_from_file(file_bytes:bytes, filename:str) -> dict:
    """"
    accepts raw files that aligns with supported formats and filename.
    returns a dict with extracted text and metadata
    """

    file_extension = Path(filename).suffix.lower()
    if file_extension not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported file format: {file_extension}")
    
    if file_extension == '.pdf':
        return _handle_pdf(file_bytes, filename)
    elif file_extension == ".docx":
        return _handle_docx(file_bytes, filename)
    else:
        return _handle_image(file_bytes, filename)
    

def _handle_pdf(file_bytes:bytes, filename:str) -> dict:
    """
    two ways of handling pdfs:
    1. if a pdf has extractable text, extract text
    2. if a pdf is scanned, use OCR to extract text
    """

    document = fitz.open(stream=file_bytes, filetype="pdf")
    pages_text = []

    for page_num, page in enumerate(document):
        text = page.get_text().strip()
        pages_text.append(text)
    full_text = "\n".join(pages_text)

    if len(full_text) >= MIN_LENGTH_DOC:
        logger.info(f"Extracted text from PDF using text extraction for {filename}")
        return {
            "filename": filename,
            "text": full_text,
            "metadata": {
                "extraction_method": "direct"
            }
        }

    logger.info(f"Extracted text from PDF using OCR for {filename}")
    ocr_text = []
    for page_num, page in enumerate(document):
        pix = page.get_pixmap()
        img = Image.open(io.BytesIO(pix.tobytes()))
        text = pytesseract.image_to_string(img)
        ocr_text.append(text.strip())
        logger.info(f"OCR extracted text from page {page_num + 1} of {filename}")

    full_ocr_text = "\n".join(ocr_text)
    return {
        "filename": filename,
        "text": full_ocr_text,
        "metadata": {
            "extraction_method": "ocr"
        }
    }

def _handle_docx(file_bytes:bytes, filename:str) -> dict:
    
    document = Document(io.BytesIO(file_bytes))
    full_text = "\n".join([para.text for para in document.paragraphs])
    logger.info(f"Extracted text from DOCX for {filename}")
    return {
        "filename": filename,
        "text": full_text,
        "metadata": {
            "extraction_method": "direct"
        }
    }

def _handle_image(file_bytes:bytes, filename:str) -> dict:
    logger.info(f"Extracting text from image for {filename}")
    image = Image.open(io.BytesIO(file_bytes))
    text = pytesseract.image_to_string(image, lang="en+deu+rus")
    return {
        "filename": filename,
        "text": text.strip(),
        "metadata": {
            "extraction_method": "ocr"
        }
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python document_loader.py <file_path>")
        sys.exit(1)

    file_path = sys.argv[1]
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    result = extract_text_from_file(file_bytes, file_path)
    print(result["text"][:2000])


