"""Billable lesson conformance checks: text, hands-on and untrusted resource metadata."""

import argparse
import json
from pathlib import Path
import yaml
from careerbridge.learning_material import lesson_supported
from careerbridge.prompts.lesson import lesson_suite
from scripts.check_model_capabilities import check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing", default="deployment/lesson-model-routing.yaml")
    parser.add_argument("--profile", choices=["openai", "nebius"], default="openai")
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.routing).read_text())
    report = check(
        config, lesson_suite(), args.profile, validate_output=lesson_supported
    )
    Path(config["profiles"][args.profile]["capability_report_path"]).write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print("Lesson model checks passed for", args.profile)


if __name__ == "__main__":
    main()
