# Shared contracts v0.1

Implementation baseline proposed by this PR. This package defines interfaces; it does not implement the backend or apply migrations.

- [Minimal MVP implementation guidelines](../../docs/IMPLEMENTATION_GUIDELINES.md)
- [MVP requirements](../../docs/MVP_REQUIREMENTS.md)
- [Implementation handoff and dependency map](../../docs/IMPLEMENTATION_HANDOFF.md)
- [Normative contract](CONTRACT.md)
- [OpenAPI](openapi.yaml) ([JSON equivalent](openapi.json))
- [Logical data model](data-model.yaml)
- [Public competency template schema](schemas/competency-template.schema.json)
- [Private grading bundle schema](schemas/private-grading-bundle.schema.json)
- [OpenAI/Nebius routing example](model-routing.example.yaml)
- [Acceptance checklist](acceptance.csv)

## Validate

```sh
python -m pip install -r contracts/v0.1/requirements-validation.txt
python contracts/v0.1/validate_contract.py
```

The validator checks schema structure, references, examples and negative/semantic fixtures. It does not test live APIs, providers, the database or browsers, and is not a full OpenAPI meta-schema validator. It writes a local `validation-report.json`.

## Example content is not reviewed content

The two non-RAG examples are draft format fixtures. Neither is approved for mastery. The miniature private grading example is synthetic and safe to inspect; real final answer keys and held-out assets belong in private storage, never this public repository or a frontend bundle.

Set model IDs and keys through server environment variables. Provider routes require real capability reports before deployment. No credentials or reports claiming live success are included.

## Deployed milestone material extension

[Milestone material schema](schemas/milestone-material.schema.json) defines the
current saved lesson response. [Deployed `/api` routes](../../api/openapi.yaml)
and [handoff](../../docs/LEARNING_MATERIAL.md) govern this slice; it does not require
templates or implement the broader `/api/v1` lesson/assessment infrastructure.
