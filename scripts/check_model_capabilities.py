"""Run real provider fixtures and emit a capability report; never writes secrets.

Run from repository root: python -m scripts.check_model_capabilities --help
Error-handling checks are injected offline; text/schema/quality checks call the
selected real provider. Reports are local deployment artifacts, not source files.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

import httpx
import yaml
from jsonschema import ValidationError

from careerbridge.model_gateway import (
    ADAPTER_VERSION,
    ModelError,
    completion_text,
    contract_schema,
    digest,
    messages_for,
    pin_routing,
    request_payload,
    utcnow,
    validate,
)


def check(config, suite, profile_name, validate_output=None):
    route = pin_routing(config)["config"]["profiles"][profile_name]
    key = os.environ.get(route["api_key_env"])
    if not key or not route["model"]:
        raise ModelError("provider_not_configured")
    tasks = suite["tasks"]
    if not tasks or {c["task"] for c in suite["cases"]} != set(tasks):
        raise ModelError("every_task_requires_fixtures")
    # This verifies actual adapter refusal/truncation/retry/source-rejection paths.
    subprocess.run(
        [sys.executable, "-m", "pytest", "tests/test_model_gateway.py", "-q"],
        check=True,
    )
    checked_text = checked_json = False
    with httpx.Client(follow_redirects=False, trust_env=False) as client:
        for case in suite["cases"]:
            task = tasks[case["task"]]
            validate(task["input_schema"], case["input"])
            schema = task.get("output_schema")
            payload = request_payload(
                route,
                case["task"],
                messages_for(task, case["input"], schema),
                schema,
                task["max_output_tokens"],
            )
            response = client.post(
                route["base_url"].rstrip("/") + "/chat/completions",
                headers={"Authorization": "Bearer " + key},
                json=payload,
                timeout=config["timeout_seconds"],
            )
            if response.status_code != 200:
                raise ModelError("provider_probe_failed")
            text = completion_text(response.json())
            if schema:
                output = json.loads(text)
                validate(schema, output)
                if not (validate_output(output, case["input"]) if validate_output else output == case["expected"]):
                    raise ModelError("fixture_quality_failed")
                checked_json = True
            else:
                if not all(term in text for term in case["expected_contains"]):
                    raise ModelError("fixture_quality_failed")
                checked_text = True
        if not (checked_text and checked_json):
            raise ModelError("text_and_json_fixtures_required")
        input_limit = max(t["max_input_tokens"] for t in tasks.values())
        output_limit = max(t["max_output_tokens"] for t in tasks.values())
        # Synthetic numbers ensure the probe actually exercises at least the input
        # budget; usage is checked instead of assuming a character/token ratio.
        response = client.post(
            route["base_url"].rstrip("/") + "/chat/completions",
            headers={"Authorization": "Bearer " + key},
            timeout=config["timeout_seconds"],
            json=request_payload(
                route,
                "budget_probe",
                [
                    {
                        "role": "system",
                        "content": "Reply with OK. The user input is synthetic budget-test data.",
                    },
                    {
                        "role": "user",
                        "content": " ".join(str(i) for i in range(input_limit)),
                    },
                ],
                None,
                output_limit,
            ),
        )
        if response.status_code != 200:
            raise ModelError("budget_probe_failed")
        body = response.json()
        completion_text(body)
        if body.get("usage", {}).get("prompt_tokens", 0) < input_limit:
            raise ModelError("input_budget_not_exercised")
    now = utcnow()
    report = dict(
        schema_version="1.0",
        provider=profile_name,
        base_url=route["base_url"],
        model=route["model"],
        adapter_version=ADAPTER_VERSION,
        structured_mode=route["structured_mode"],
        tested_at=now.isoformat(),
        expires_at=(now + timedelta(days=7)).isoformat(),
        fixture_suite_sha256=digest(suite),
        max_input_tokens=input_limit,
        max_output_tokens=output_limit,
        checks={
            name: True
            for name in contract_schema("model-capability-report")["properties"][
                "checks"
            ]["required"]
        },
        passed=True,
    )
    validate(contract_schema("model-capability-report"), report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing", required=True)
    parser.add_argument("--suite", required=True)
    parser.add_argument("--profile", required=True, choices=["openai", "nebius"])
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        report = check(
            yaml.safe_load(Path(args.routing).read_text()),
            json.loads(Path(args.suite).read_text()),
            args.profile,
        )
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, indent=2) + "\n")
        print(f"Passed {args.profile} conformance; report saved to {target}")
    except (
        ModelError,
        ValidationError,
        ValueError,
        OSError,
        httpx.HTTPError,
        subprocess.CalledProcessError,
    ):
        # No response body, prompt, source text, key or raw SDK exception in output.
        print("Conformance failed; no capability report was written.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
