variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# --- APIs ---

resource "google_project_service" "pubsub" {
  service = "pubsub.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "storage" {
  service = "storage-api.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "run" {
  service = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sqladmin" {
  service = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

# --- Service Account for Backend ---

resource "google_service_account" "backend_sa" {
  account_id   = "medical-backend-sa"
  display_name = "Medical Backend Cloud Run Service Account"
}

resource "google_project_iam_member" "backend_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.editor"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

resource "google_project_iam_member" "backend_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

resource "google_project_iam_member" "backend_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

# --- Service Account for Local Dev ---

resource "google_service_account" "dev_sa" {
  account_id   = "medical-dev-sa"
  display_name = "Medical App Developer Service Account"
}

resource "google_project_iam_member" "pubsub_admin" {
  project = var.project_id
  role    = "roles/pubsub.admin"
  member  = "serviceAccount:${google_service_account.dev_sa.email}"
}

resource "google_project_iam_member" "storage_admin" {
  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${google_service_account.dev_sa.email}"
}

# --- Cloud Storage ---

resource "google_storage_bucket" "document_bucket" {
  name     = "${var.project_id}-documents"
  location = var.region
  force_destroy = true

  uniform_bucket_level_access = true
}

# --- Pub/Sub ---

# Topic for New Uploads
resource "google_pubsub_topic" "document_uploads" {
  name = "document-uploads"
}

# Subscription for the Python Worker
resource "google_pubsub_subscription" "worker_sub" {
  name  = "document-uploads-sub"
  topic = google_pubsub_topic.document_uploads.name

  ack_deadline_seconds = 60
}

# Topic for AI Results
resource "google_pubsub_topic" "document_results" {
  name = "document-results"
}

# Subscription for the Go Backend
resource "google_pubsub_subscription" "backend_sub" {
  name  = "document-results-sub"
  topic = google_pubsub_topic.document_results.name

  ack_deadline_seconds = 20
}

# --- Cloud SQL (PostgreSQL) ---

resource "google_sql_database_instance" "main" {
  name             = "medical-db-instance"
  database_version = "POSTGRES_15"
  region           = var.region
  deletion_protection = false

  settings {
    tier = "db-f1-micro" # Smallest tier for hackathon/dev
  }
}

resource "google_sql_database" "database" {
  name     = "medical_docs"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "users" {
  name     = "backend_user"
  instance = google_sql_database_instance.main.name
  password = "change-me-securely"
}

# --- Outputs ---

output "bucket_name" {
  value = google_storage_bucket.document_bucket.name
}

output "upload_topic" {
  value = google_pubsub_topic.document_uploads.name
}

output "results_topic" {
  value = google_pubsub_topic.document_results.name
}

# --- Cloud Run Service ---

resource "google_cloud_run_v2_service" "backend" {
  name     = "medical-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.backend_sa.email
    
    containers {
      image = "gcr.io/${var.project_id}/medical-backend:latest"
      
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.document_bucket.name
      }
      env {
        name  = "PUBSUB_TOPIC_ID"
        value = google_pubsub_topic.document_uploads.name
      }
      env {
        name  = "PUBSUB_SUB_ID"
        value = google_pubsub_subscription.backend_sub.name
      }
      env {
        name  = "DB_DSN"
        value = "host=/cloudsql/${google_sql_database_instance.main.connection_name} user=${google_sql_user.users.name} password=${google_sql_user.users.password} dbname=${google_sql_database.database.name} sslmode=disable"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      ports {
        container_port = 8080
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }
  }

  depends_on = [
    google_project_service.run,
    google_project_service.sqladmin,
    google_sql_database_instance.main
  ]
}

resource "google_cloud_run_v2_service_iam_member" "noauth" {
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "backend_url" {
  value = google_cloud_run_v2_service.backend.uri
}
