# Health Travel Passport

> Your medical history, organized and ready for any doctor, anywhere.

A hackathon MVP demonstrating an AI-assisted, multilingual, mobile-first health companion that bridges the gap between patients and clinicians across borders.

---

## Live Demo

| Environment | URL |
|---|---|
| **Frontend (Published)** | https://health-passportalima.lovable.app |
| **Frontend (Preview)** | https://id-preview--b5b0cc0b-b76c-408e-b3b0-45c8f1ea740c.lovable.app |
| **Medical Backend (Swagger)** | https://medical-backend-748034533014.us-central1.run.app/swagger/index.html |

---

## Problem & Solution

Patients — especially travelers, expats, and people managing chronic conditions — tend to face difficulties with arranging a doctor's appointment in a new country especially with a new language. Their medical history is scattered across different countries, clinics, langauges, and file formats. When going to any appointment, doctors have minutes, not hours.


**Health Travel Passport** centralizes a patient's documents (lab results, doctor letters, scans, medications), normalizes them across languages, and on demand produces a structured **Doctor Pack** — a clean, doctor-ready summary that can be exported to PDF or shared in a tap, unlike generic file storage apps or hospital-facing EMR systems. It also helps users new to a city find local clinics with English-speaking specialists, so they know where to go before they even need care.

Our product is tailored to the patient who is sitting in a foreign doctor's office with a folder of documents nobody can read.

---

## Architecture Overview

The project is composed of **four independent components** that communicate via REST and Google Cloud Pub/Sub:

```
┌──────────────┐      ┌──────────────┐       ┌──────────────────┐
│   Frontend   │────▶│  Go Backend  │──────▶│ Cloud Storage    │
│  (TanStack   │ HTTP │  (Cloud Run) │  GCS  │  + Pub/Sub Topic │
│   Start)     │      │              │       │                  │
└──────────────┘      └──────┬───────┘       └────────┬─────────┘
                             │                        │ message
                             │ JWT + REST             ▼
                             │              ┌──────────────────┐
                             ▼              │   Med-Agent      │
                      ┌──────────────┐      │  (Python AI      │
                      │   Postgres   │      │   pipeline)      │
                      │   (Cloud SQL)│      │                  │
                      └──────────────┘      │  Gemini + d4data │
                                            │  NER + rule-based│
                                            └────────┬─────────┘
                                                     │ result
                                                     ▼
                                            ┌──────────────────┐
                                            │  Pub/Sub topic   │
                                            │  document-results│
                                            └──────────────────┘
```

| Component | Folder | Responsibility |
|---|---|---|
| **Frontend** | [`frontend/`](frontend/) | React UI built with TanStack Start, deployed on Cloudflare Workers |
| **Go Backend** | [`backend-go/`](backend-go/) | REST API: auth, document upload to GCS, profile management, doctor pack triggering |
| **Med-Agent** | [`med-agent/`](med-agent/) | Python AI worker: document parsing, translation, NER extraction, abnormal value flagging, summarisation |
| **Terraform** | [`terraform/`](terraform/) | Infrastructure as code (Cloud Run, Cloud SQL, GCS, Pub/Sub) |

---

## Repository Structure

```
Health_travel_passport/
├── README.md
├── Dockerfile              # Container for med-agent (Cloud Run / Pub/Sub worker)
├── requirements.txt        # Python dependencies (med-agent)
├── frontend/               # TanStack Start UI (see frontend/README.md for details)
├── backend-go/             # Go REST API (Gin + GORM, deployed to Cloud Run)
├── med-agent/              # Python AI pipeline
│   ├── pubsub_worker.py    # Entry point: listens on Pub/Sub, processes documents
│   ├── run_pipeline.py     # CLI entry point for local testing
│   ├── services/
│   │   ├── document_loader.py   # PDF / DOCX / image OCR
│   │   ├── orchestrator.py      # Pipeline coordinator (Gemini)
│   │   ├── translator.py        # Gemini Flash Lite translator
│   │   ├── extractor.py         # Regex + d4data biomedical NER + Gemini fallback
│   │   ├── flagging.py          # Rule-based abnormal value detection
│   │   └── explainer.py         # Plain-language lab explanation (Gemini)
│   └── models/
└── terraform/              # GCP infrastructure
```

---

## AI Pipeline (med-agent)

The med-agent uses a **hybrid architecture**: Google Gemini handles orchestration and final assembly, while specialised smaller models and deterministic rules handle each individual step. This combines LLM flexibility with rule-based reliability for clinically-sensitive flagging.

### Pipeline Flow

```
[1] Document upload (frontend → Go backend → GCS)
        │
        ▼
[2] Pub/Sub trigger → pubsub_worker.py
        │
        ▼
[3] document_loader.py    PDF/DOCX/image → raw text
        │
        ▼
[4] orchestrator.analyze_doc      Gemini classifies (language, doc type, dates)
        │
        ▼
[5] translator.translate          Non-English → English (Gemini Flash Lite)
        │
        ▼
[6] extractor.extract             Regex (lab values) + d4data NER (medications,
        │                         conditions, symptoms) + Gemini fallback
        │
        ▼
[7] flagging.flag                 Compare extracted values to reference ranges
        │                         (document-provided, then built-in fallback table)
        ▼
[8] orchestrator.assemble_summary Per-document structured summary (Gemini)
        │
        ▼
[9] orchestrator.build_doctor_pack    Combine all summaries into final doctor pack
        │
        ▼
[10] explainer.explain (lab only)     Plain-English lab explanation (Gemini)
        │
        ▼
[11] Result published to document-results Pub/Sub topic → Go backend → frontend
```

### Why hybrid?

The hybrid design was informed by Gorenshtein, Omar, Glicksberg, Nadkarni & Klang, *"AI Agents in Clinical Medicine: A Systematic Review"* (Mount Sinai / Hasso Plattner Institute for Digital Health), which highlights that clinically-deployable AI systems benefit from combining LLM reasoning with deterministic, auditable components — especially when patient safety is involved.

Concretely:

- **Gemini** is excellent at understanding context, classifying documents, translating medical terminology, and producing coherent summaries.
- **Rule-based flagging** is irreplaceable: a doctor cannot trust "the AI thinks this is abnormal" — but `98 < 120 → LOW` is clinically defensible.
- **NER (d4data/biomedical-ner-all)** extracts medications and conditions deterministically, reducing what Gemini must infer from prose.
- **Regex** is fast, free, and reliable for well-formatted lab values.
- **Gemini fallback** kicks in when regex misses (e.g. table-format lab reports), preserving robustness.

---

## Tech Stack

### Frontend (`frontend/`)

| Layer | Technology |
|---|---|
| Framework | TanStack Start v1 |
| UI | React 19, TypeScript 5.8, Tailwind CSS v4 |
| Components | shadcn/ui (Radix), lucide-react, sonner, recharts |
| Routing | @tanstack/react-router (file-based, type-safe) |
| Data | @tanstack/react-query v5 |
| Forms | react-hook-form + zod |
| Auth + DB | Lovable Cloud (Supabase): Auth, Postgres + RLS, Storage |
| Runtime | Cloudflare Workers (`@cloudflare/vite-plugin`, nodejs_compat) |
| Build | Vite 7, Bun |

### Go Backend (`backend-go/`)

| Layer | Technology |
|---|---|
| Language | Go |
| Framework | Gin (HTTP) + GORM (ORM) |
| Database | PostgreSQL (Google Cloud SQL) |
| Auth | Supabase JWT verification |
| Storage | Google Cloud Storage |
| Messaging | Google Cloud Pub/Sub |
| Deployment | Google Cloud Run (containerised) |
| Documentation | Swagger / OpenAPI |

### Med-Agent (`med-agent/`)

| Layer | Technology |
|---|---|
| Language | Python 3.12 |
| LLM | Google Gemini (`gemini-2.5-flash`, `gemini-2.5-flash-lite`) via `google-genai` SDK |
| NER | `d4data/biomedical-ner-all` via HuggingFace Inference API |
| OCR | Tesseract (`pytesseract`) + PyMuPDF (`fitz`) |
| DOCX | `python-docx` |
| Image | Pillow |
| Cloud SDKs | `google-cloud-pubsub`, `google-cloud-storage` |
| Config | `python-dotenv` |

### Infrastructure (`terraform/`)

| Resource | Purpose |
|---|---|
| Cloud Run (medical-backend) | Hosts the Go REST API |
| Cloud SQL (Postgres) | Persistent storage for documents and profiles |
| Cloud Storage bucket | Document file storage |
| Pub/Sub topics + subscriptions | `document-uploads` (frontend → med-agent), `document-results` (med-agent → backend) |
| IAM Service Accounts | Scoped permissions per service |

---

## Setup & Installation

### Prerequisites

- **Node.js 20+** or **Bun 1.x** (frontend)
- **Go 1.21+** (Go backend)
- **Python 3.12** (med-agent)
- **Google Cloud SDK** (`gcloud` CLI)
- **Terraform 1.x** (optional, for infra deployment)
- A Google Cloud project with billing enabled and the following APIs enabled: Cloud Run, Cloud SQL, Cloud Storage, Pub/Sub, Generative AI

### 1. Clone the repository

```bash
git clone https://github.com/zariness00/Health_travel_passport.git
cd Health_travel_passport
```

### 2. Set up the med-agent (Python AI pipeline)

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Create a `.env` file in the repo root with:

```
# AI services
GOOGLE_API_KEY=your_gemini_api_key
HF_API_KEY=your_huggingface_api_key

# Google Cloud (med-agent uses Application Default Credentials by default)
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GCS_BUCKET_NAME=your-documents-bucket
PUBSUB_SUB_ID=document-uploads-sub
PUBSUB_OUTPUT_TOPIC=document-results
```

Authenticate with Google Cloud:

```bash
gcloud auth application-default login
gcloud config set project your-gcp-project-id
```

Run the worker:

```bash
cd med-agent
python pubsub_worker.py
```

Or test locally on a folder of documents (no Pub/Sub required):

```bash
cd med-agent
python run_pipeline.py services/demo_documents
```

### 3. Set up the frontend

See [`frontend/README.md`](frontend/README.md) for full instructions. Quick start:

```bash
cd frontend
bun install
bun run dev          # http://localhost:8080
```

### 4. Set up the Go backend

See [`backend-go/`](backend-go/) for full instructions. The backend is deployed to Cloud Run; for local dev, set the `DB_DSN` environment variable in `backend-go/.env` and run:

```bash
cd backend-go
go run main.go
```

### 5. Deploy infrastructure (optional)

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

---

## API Documentation

### Go Backend REST API

Full OpenAPI spec: https://medical-backend-748034533014.us-central1.run.app/swagger/index.html

Auth: `Authorization: Bearer <Supabase access_token>`

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/me` | Current authenticated user |
| `GET` | `/api/profile` | Fetch user profile |
| `PATCH` | `/api/profile` | Update name, DOB, sex |
| `GET` | `/api/documents/counts` | Per-category document counts |
| `GET` | `/api/documents?category=&page=&size=` | List documents in a category |
| `GET` | `/api/documents/{id}` | Single document detail |
| `POST` | `/api/documents` | Upload (multipart/form-data) |
| `POST` | `/api/doctor-pack` | Generate structured doctor pack |

**Document categories:** `Lab Results`, `Doctor Letters`, `Medications`, `Imaging & Scans`.

### Pub/Sub Message Format

**Input topic** (`document-uploads-sub`) — Go backend → med-agent:

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "category": "DoctorPack",
  "metadata": [
    {
      "id": "doc-uuid",
      "user_id": "uuid",
      "original_name": "blood_test.pdf",
      "storage_path": "gs://bucket/path/file.pdf",
      "category": "Lab Results"
    }
  ]
}
```

**Output topic** (`document-results`) — med-agent → Go backend:

```json
{
  "id": "doctor-pack-uuid",
  "user_id": "uuid",
  "category": "DoctorPack",
  "status": "PROCESSED",
  "metadata": {
    "doctor_pack": {
      "patient_overview": { "name": "...", "age": 30, "sex": "F", "home_country": "...", "currently_lives": "...", "languages": [...] },
      "medical_history_summary": { "summary": "..." },
      "current_medications": [...],
      "abnormal_values": [...],
      "recent_medical_activities": [...]
    },
    "lab_extracted": { "lab_values": [...], "medications": [...], "conditions": [...], "symptoms": [...] },
    "lab_flagged": { "flagged_values": [...] },
    "lab_explanation": "Plain-language explanation of abnormal values"
  }
}
```

---

## Environment Variables

| Variable | Component | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | med-agent | Gemini API access |
| `HF_API_KEY` | med-agent | HuggingFace Inference API (d4data NER) |
| `GOOGLE_CLOUD_PROJECT` | med-agent | GCP project ID |
| `GCS_BUCKET_NAME` | med-agent | Bucket containing uploaded documents |
| `PUBSUB_SUB_ID` | med-agent | Subscription to receive doctor pack requests |
| `PUBSUB_OUTPUT_TOPIC` | med-agent | Topic to publish results back |
| `DB_DSN` | backend-go | Postgres connection string |
| `VITE_SUPABASE_URL` | frontend | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | Public anon key |
| `TAVILY_API_KEY` | frontend (server) | Location suggestions with English speaking doctors|

`.env` files are gitignored; never commit secrets.

---

## Demo Data

For testing without uploading personal medical records, the med-agent ships with synthetic demo documents in [`med-agent/services/demo_documents/`](med-agent/services/demo_documents/):

- `specialist_letter_kazakhstan.docx` — Russian endocrinologist letter (tests translation)
- `blood_test_anna.docx` — German blood test with mixed normal/abnormal values (tests extraction + flagging)
- `doctor_letter_anna.docx` — German doctor letter referencing the blood test

Run end-to-end against the demo pack:

```bash
cd med-agent
python run_pipeline.py services/demo_documents
```

Expected output: a doctor pack for "Anna Müller" with `home_country: Kazakhstan`, `currently_lives: Spain`, multilingual context, and 5+ flagged abnormal values (low hemoglobin, low ferritin, low vitamin D, etc.).

---

## Security Notes

- All requests to the Go backend carry the **Supabase JWT** in `Authorization: Bearer ...`.
- The Postgres `profiles` table is protected by **Row Level Security**; only the row owner can read/write.
- Med-agent authenticates with GCP via **Application Default Credentials** — no service account JSON is committed to the repo.
- API keys (`GOOGLE_API_KEY`, `HF_API_KEY`) are stored in `.env` (gitignored) or as GCP Secret Manager values in production.
- Patient documents in GCS are stored under user-scoped paths and accessed only via signed JWT-authenticated requests.

---

## Limitations

1. **Lab value extraction is mostly demo-quality.** Real-world PDF lab reports use varied table formats; the regex extractor falls back to Gemini, but extraction confidence varies.
2. **The current Gemini summarisation can occasionally hallucinate** when the input PDF is heavily truncated. Mitigations: anti-hallucination prompts, raw flagged values passed deterministically to the final assembler.
3. **No per-patient long-term storage of doctor packs yet** — each one is generated on demand from current document state.
4. **Multilingual UI is partially implemented**; backend handles arbitrary input languages already.


---

## Future Directions

**Near-term improvements**
- **Table-aware PDF parsing** (e.g. `pdfplumber`) so regex catches lab values directly from formatted reports without falling back to Gemini.
- **Chunk-and-merge summarisation** for multi-page documents to eliminate truncation-driven hallucination.
- **Full multilingual UI** with language auto-detection from the user's profile.
- **Persistent doctor pack history** so users can compare current state to past visits and share previous packs.

**Mid-term product expansion**
- **Specialist-aware doctor packs** — different summary structures for cardiologist, dermatologist, gynaecologist, etc., highlighting only relevant history.
- **Visit preparation companion** — an AI-generated "what to ask your doctor" briefing tailored to recent abnormal findings.
- **Family / caregiver accounts** — shared access for parents managing children's records, or adult children helping elderly parents.

**Long-term vision**
- **Direct EMR integration** (FHIR / HL7) so providers can pull the doctor pack into their systems instead of reading a PDF.
- **Continuous monitoring loop** — track values over time and surface trends before they become abnormal.
- **Privacy-preserving federated learning** — improve extraction quality from anonymised, on-device document parsing without uploading raw documents.
- **Compliance**: full GDPR readiness in EU, HIPAA in US, equivalent frameworks elsewhere.
- **Offline mode** for travellers in regions with limited connectivity — locally-cached doctor pack and document vault.

---

## Credits

- **Frontend** built with [Lovable](https://lovable.dev) on [TanStack Start](https://tanstack.com/start), [Lovable Cloud / Supabase](https://docs.lovable.dev/features/cloud), and [shadcn/ui](https://ui.shadcn.com).
- **AI**: [Google Gemini](https://ai.google.dev/), [HuggingFace](https://huggingface.co/) (`d4data/biomedical-ner-all`).
- **Search & Geocoding**: [Tavily](https://tavily.com), [OpenStreetMap Nominatim](https://nominatim.org/).
- **Infrastructure**: Google Cloud Run, Cloud SQL, Cloud Storage, Pub/Sub.

---

## References

- Gorenshtein, A., Omar, M., Glicksberg, B. S., Nadkarni, G. N., & Klang, E. *AI Agents in Clinical Medicine: A Systematic Review.* The Windreich Department of Artificial Intelligence and Human Health, Mount Sinai Medical Center; The Hasso Plattner Institute for Digital Health at Mount Sinai, Mount Sinai Health System, NY, USA.

---

## License

Hackathon MVP — all rights reserved by the project authors. Contact the team for reuse.
