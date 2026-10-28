# MigrationPilot REST API Reference

The web backend exposes a typed REST API on port `3080`.

- `POST /api/v1/analyze`: Analyze SQL string and return findings + risk summary.
- `GET /api/v1/analyses`: Retrieve recent analysis history.
- `GET /api/v1/analyses/:id`: Retrieve single analysis by ID.
- `DELETE /api/v1/analyses/:id`: Remove analysis record.
- `POST /api/v1/analyses/compare`: Compare two analysis runs side-by-side.
- `GET /api/v1/rules`: List all registered safety rules.
- `GET /api/v1/rules/:id`: Retrieve detailed rule explanation.
- `GET /api/v1/health`: System health and version status.
