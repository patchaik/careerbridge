"""Billable planning conformance probes for all three learning modalities."""

import argparse
import json
from pathlib import Path
import yaml
from careerbridge.learning_coach import plan_supported
from careerbridge.prompts.learning_plan import plan_suite
from scripts.check_model_capabilities import check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing", default="deployment/plan-model-routing.yaml")
    parser.add_argument("--profile", default="openai", choices=["openai", "nebius"])
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.routing).read_text())
    report = check(config, plan_suite(), args.profile, validate_output=plan_supported)
    Path(config["profiles"][args.profile]["capability_report_path"]).write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print("Learning plan model checks passed for", args.profile)


if __name__ == "__main__":
    main()
