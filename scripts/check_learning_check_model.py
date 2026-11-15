"""Billable conformance checks for formative questions and written feedback."""

import argparse
import json
from pathlib import Path
import yaml
from careerbridge.prompts.learning_check import check_suite
from careerbridge.learning_check import check_supported, feedback_supported
from scripts.check_model_capabilities import check


def supported(output, data):
    if "milestones" in data:
        return check_supported(output, data)
    if not feedback_supported(output, data):
        return False
    expected_met = not data["practice_response"].startswith("I do not know.")
    return all(c["met"] == expected_met for c in output["criteria"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing", default="deployment/check-model-routing.yaml")
    parser.add_argument("--profile", default="openai", choices=["openai", "nebius"])
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.routing).read_text())
    report = check(config, check_suite(), args.profile, validate_output=supported)
    Path(config["profiles"][args.profile]["capability_report_path"]).write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print("Learning-check model conformance passed for", args.profile)


if __name__ == "__main__":
    main()
