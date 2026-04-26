import json
import os
import time
from google.cloud import pubsub_v1, storage
from services.document_loader import extract_text_from_file
from services.orchestrator import build_doctor_pack
from services.translator import translate
from services.extractor import extract
from services.flagging import flag
from services.explainer import explain

# Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "bigberlin-hack26ber-3060")
BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "bigberlin-hack26ber-3060-documents")
INPUT_SUBSCRIPTION = os.getenv("PUBSUB_SUB_ID", "document-uploads-sub")
OUTPUT_TOPIC = os.getenv("PUBSUB_OUTPUT_TOPIC", "document-results")

storage_client = storage.Client()
publisher = pubsub_v1.PublisherClient()
subscriber = pubsub_v1.SubscriberClient()

def download_blob(bucket_name, source_blob_name):
    # accept full gs:// URI or plain object name
    if source_blob_name.startswith("gs://"):
        without_scheme = source_blob_name[len("gs://"):]
        bucket_name, _, source_blob_name = without_scheme.partition("/")
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(source_blob_name)
    return blob.download_as_bytes()

def callback(message):
    print(f"Received message: {message.data}")
    try:
        data = json.loads(message.data.decode("utf-8"))
        print(f"Parsed payload keys: {list(data.keys())}")

        # We handle "DoctorPack" category specifically
        if data.get("category") != "DoctorPack":
            print(f"Skipping category: {data.get('category')}")
            message.ack()
            return

        user_id = data.get("user_id")
        doc_list = data.get("metadata") or []  # protect against null
        if not doc_list:
            print(f"No documents in metadata, payload was: {data}")
            message.ack()
            return

        processed_docs = []
        for doc in doc_list:
            storage_path = doc.get("storage_path")
            original_name = doc.get("original_name")

            print(f"Downloading: {storage_path}")
            file_bytes = download_blob(BUCKET_NAME, storage_path)

            text_result = extract_text_from_file(file_bytes, original_name)
            processed_docs.append({
                "filename": original_name,
                "raw_text": text_result["text"],
                "user_category": doc.get("category")
            })

        print(f"Processing {len(processed_docs)} documents for user {user_id}...")
        
        # Run AI Pipeline
        ai_result = build_doctor_pack(
            processed_docs,
            translator_func=translate,
            extractor_func=extract,
            flagging_func=flag,
        )
        
        # If lab results were flagged, add explanation
        if ai_result.get("lab_extracted") or ai_result.get("lab_flagged"):
            ai_result["lab_explanation"] = explain(ai_result["lab_extracted"], ai_result["lab_flagged"])

        # Prepare result for Go Backend
        result_payload = {
            "id": data.get("id"), # This is the DoctorPack ID
            "user_id": user_id,
            "category": "DoctorPack",
            "metadata": ai_result,
            "status": "PROCESSED"
        }

        # Publish back to Go
        topic_path = publisher.topic_path(PROJECT_ID, OUTPUT_TOPIC)
        publisher.publish(topic_path, json.dumps(result_payload).encode("utf-8"))
        print(f"Published results for user {user_id}")

        message.ack()
    except Exception as e:
        print(f"Error processing message: {e}")
        # In production, might want to nack or move to dead-letter
        message.ack()

def main():
    subscription_path = subscriber.subscription_path(PROJECT_ID, INPUT_SUBSCRIPTION)
    print(f"Listening for messages on {subscription_path}...")
    
    streaming_pull_future = subscriber.subscribe(subscription_path, callback=callback)
    
    with subscriber:
        try:
            streaming_pull_future.result()
        except KeyboardInterrupt:
            streaming_pull_future.cancel()

if __name__ == "__main__":
    main()
