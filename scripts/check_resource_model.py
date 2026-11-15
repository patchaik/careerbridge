"""Billable synthetic resource extraction probes; run with server credentials exported."""

import argparse
import json
from pathlib import Path
import yaml
from careerbridge.prompts.resources import resource_suite
from scripts.check_model_capabilities import check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing", default="deployment/resource-model-routing.yaml")
    parser.add_argument("--profile", default="openai", choices=["openai", "nebius"])
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.routing).read_text())
    report = check(config, resource_suite(), args.profile)
    path = Path(config["profiles"][args.profile]["capability_report_path"])
    path.write_text(json.dumps(report, indent=2) + "\n")
    print("Resource model checks passed for", args.profile)


if __name__ == "__main__":
    main()
