# Data Engineering — {{COMPANY_NAME}}

Data pipeline plans and RFCs, organized by feature (matching `product-development/feature-index.yaml`).

Most solo/early-stage products don't need a dedicated data-engineering function yet — `product-development/analytics/` usually covers it (queries, schemas, dashboards). Stand this up separately once pipelines get complex enough to need their own design docs (e.g. a real ETL pipeline, event streaming, a data warehouse migration).

## Folders

| Folder | Purpose |
|--------|---------|
| `plans/{feature}/` | Data pipeline implementation plans |
| `rfcs/{feature}/` | Data pipeline design proposals |
