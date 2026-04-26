"""
Usage:
    python run_pipeline.py /path/to/folder/with/documents
"""
import sys
import json
from pathlib import Path
from services.document_loader import extract_text_from_file, SUPPORTED_FORMATS
from services.orchestrator import build_doctor_pack
from services.translator import translate
from services.extractor import extract
from services.flagging import flag
from services.explainer import explain


def load_documents_from_folder(folder_path: str) -> list[dict]:
    folder = Path(folder_path)
    documents = []

    for file_path in sorted(folder.iterdir()):
        if file_path.suffix.lower() not in SUPPORTED_FORMATS:
            print(f"Skipping unsupported file: {file_path.name}")
            continue

        print(f"Loading: {file_path.name}")
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        result = extract_text_from_file(file_bytes, file_path.name)
        documents.append({
            "filename": file_path.name,
            "raw_text": result["text"],
        })

    return documents


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python run_pipeline.py <folder_path>")
        sys.exit(1)

    folder_path = sys.argv[1]
    print(f"\nLoading documents from: {folder_path}")
    documents = load_documents_from_folder(folder_path)

    if not documents:
        print("No supported documents found.")
        sys.exit(1)

    print(f"\nProcessing {len(documents)} document(s)...\n")
    result = build_doctor_pack(
        documents,
        translator_func=translate,
        extractor_func=extract,
        flagging_func=flag,
    )

    print("\nDoctor pack")
    print(json.dumps(result["doctor_pack"], indent=2, ensure_ascii=False))
    print(f"\nDocuments processed: {result['documents_processed']}")
    print(f"By type: {result['documents_by_type']}")

    if result["lab_extracted"] or result["lab_flagged"]:
        print("\nLAB EXPLANATION")
        lab_explanation = explain(result["lab_extracted"], result["lab_flagged"])
        print(lab_explanation)
