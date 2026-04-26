# Use Python 3.11 slim image
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OCR and PDF processing
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY Health_travel_passport/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend source
COPY Health_travel_passport/backend/ ./

# Run the pubsub worker
CMD ["python", "pubsub_worker.py"]
