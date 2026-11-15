"""Check the actual résumé prompt before enabling live uploads.

Export credentials first, then run: python -m scripts.check_resume_model
This makes billable synthetic calls; it never uploads a real résumé.
"""

import argparse
import json
from pathlib import Path

import yaml

from careerbridge.prompts.career_analyst import resume_suite
from scripts.check_model_capabilities import check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--routing", default="deployment/model-routing.yaml")
    parser.add_argument("--profile", choices=["openai", "nebius"], default="openai")
    args = parser.parse_args()
    config = yaml.safe_load(Path(args.routing).read_text())
    report = check(config, resume_suite(), args.profile)
    path = Path(config["profiles"][args.profile]["capability_report_path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Résumé capability checks passed for {args.profile}; report: {path}")


if __name__ == "__main__":
    main()
