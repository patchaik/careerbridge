"""Check the job-extraction prompt with synthetic data before enabling live search."""

import argparse
import json
from pathlib import Path

import yaml
from careerbridge.prompts.search_agent import job_suite
from scripts.check_model_capabilities import check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing", default="deployment/job-model-routing.yaml")
    parser.add_argument("--profile", choices=["openai", "nebius"], default="openai")
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.routing).read_text())
    report = check(config, job_suite(), args.profile)
    path = Path(config["profiles"][args.profile]["capability_report_path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Job extraction capability checks passed for {args.profile}")


if __name__ == "__main__":
    main()
