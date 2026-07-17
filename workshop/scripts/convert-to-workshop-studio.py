#!/usr/bin/env python3
"""Convert the Hugo workshop (workshop/) to Workshop Studio native format.

Output goes to workshop-studio/ at the repo root:
  contentspec.yaml
  content/<slug>/index.{en,zh-CN}.md   (pages as directories)
  static/                              (copied verbatim)

Transforms per page:
  - locale rename: .en.md -> index.en.md, .zh.md -> index.zh-CN.md
  - frontmatter: keep title/weight, drop chapter
  - {{% notice X %}}...{{% /notice %}} -> :::alert{type=Y} ... :::
  - image paths /images/x.png -> /static/images/x.png
  - drop <br> lines (Hugo chapter styling artifact)
"""
import re
import shutil
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1]          # workshop/
DST = SRC.parent / "workshop-studio"               # sibling output dir

# Hugo path component -> Workshop Studio slug
SLUGS = {
    "1_Introduction": "introduction",
    "11_WhyGameLift": "why-gamelift",
    "12_CoreConcepts": "core-concepts",
    "2_Setup": "setup",
    "21_AWSEvent": "aws-event",
    "22_OwnAccount": "own-account",
    "23_Bootstrap": "bootstrap",
    "24_DeployGame": "deploy-game",
    "3_GameLiftAnywhere": "anywhere",
    "31_Concept": "concept",
    "32_ServerLifecycle": "server-lifecycle",
    "33_RunAnywhere": "run-anywhere",
    "4_ManagedFleet": "managed-fleet",
    "41_BuildAndDeploy": "build-and-deploy",
    "42_FleetAnatomy": "fleet-anatomy",
    "43_LatencyRouting": "latency-routing",
    "44_Verify": "verify",
    "5_FlexMatch": "flexmatch",
    "51_RuleSets": "rule-sets",
    "52_TicketLifecycle": "ticket-lifecycle",
    "53_MatchExercise": "match-exercise",
    "6_RaceDay": "race-day",
    "61_VerifyMyServer": "verify-my-server",
    "62_AWSArena": "aws-arena",
    "7_Cleanup": "cleanup",
    "71_Destroy": "destroy",
    "8_Conclusion": "conclusion",
    "81_Recap": "recap",
    "82_NextSteps": "next-steps",
    "9_Appendix_MultiRegion": "multi-region",
    "91_Challenge": "challenge",
}

LOCALES = {".en": "en", ".zh": "zh-CN"}

# Hugo notice type -> Workshop Studio alert type
ALERT_TYPES = {"info": "info", "note": "info", "tip": "success", "warning": "warning"}

NOTICE_RE = re.compile(
    r"\{\{%\s*notice\s+(\w+)\s*%\}\}\s*\n(.*?)\n\s*\{\{%\s*/notice\s*%\}\}",
    re.DOTALL,
)


def convert_body(text: str) -> str:
    def alert(m: re.Match) -> str:
        kind = ALERT_TYPES.get(m.group(1), "info")
        body = m.group(2).rstrip()
        return f":::alert{{type={kind}}}\n{body}\n:::"

    text = NOTICE_RE.sub(alert, text)
    text = text.replace("](/images/", "](/static/images/")
    text = re.sub(r"^<br>\n", "", text, flags=re.MULTILINE)
    return text


def convert_frontmatter(text: str) -> str:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        sys.exit(f"page without frontmatter")
    keep = []
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        key = line.split(":", 1)[0].strip()
        if key in ("title", "weight"):
            keep.append(line.rstrip())
    return "---\n" + "\n".join(keep) + "\n---\n" + text[m.end():]


def dest_path(src: Path) -> Path:
    rel = src.relative_to(SRC / "content")
    stem = rel.name
    for hugo_loc, ws_loc in LOCALES.items():
        if stem.endswith(f"{hugo_loc}.md"):
            base = stem[: -len(f"{hugo_loc}.md")]
            fname = f"index.{ws_loc}.md"
            break
    else:
        sys.exit(f"unexpected filename: {src}")

    parts = [SLUGS[p] for p in rel.parts[:-1]]
    if base != "_index":
        parts.append(SLUGS[base])
    return DST / "content" / Path(*parts) / fname


CONTENTSPEC = """\
version: 2.0

defaultLocaleCode: en-US
localeCodes:
  - en-US
  - zh-CN

# Deployed automatically into Workshop Studio-provisioned accounts (AWS events):
# a browser IDE dev machine that also serves as the GameLift Anywhere compute
# in Module 3. Participants in their own accounts skip this (BYOA path in Setup).
infrastructure:
  cloudformationTemplates:
    - templateLocation: static/infrastructure/workshop-studio.yaml
      label: gamelift-workshop-devmachine
      participantVisibleStackOutputs:
        - CodeServerURL
        - InstancePublicIp

awsAccountConfig:
  accountSources:
    - WorkshopStudio
  # Participants deploy CDK stacks (GameLift fleets/builds, CloudFront, API
  # Gateway, Lambda, DynamoDB, SNS). Actual deployment happens through the
  # cdk-* bootstrap roles; the participant policy grants the workshop services
  # plus IAM scoped to cdk-*/PixelRush* roles — no blanket admin.
  participantRole:
    iamPolicies:
      - static/iam/participant-policy.json
  regionConfiguration:
    minAccessibleRegions: 1
    maxAccessibleRegions: 3
    accessibleRegions:
      recommended:
        - us-east-1
      optional:
        - us-west-2
        - ap-northeast-1
    # The dev-machine template is region-agnostic (SSM public AMI parameter,
    # dynamic GetAZs); us-west-2 is the resiliency fallback.
    deployableRegions:
      recommended:
        - us-east-1
      optional:
        - us-west-2
"""


def main() -> None:
    if DST.exists():
        shutil.rmtree(DST)
    (DST / "content").mkdir(parents=True)

    pages = sorted((SRC / "content").rglob("*.md"))
    for src in pages:
        out = dest_path(src)
        out.parent.mkdir(parents=True, exist_ok=True)
        text = src.read_text(encoding="utf-8")
        out.write_text(convert_body(convert_frontmatter(text)), encoding="utf-8")

    shutil.copytree(SRC / "static", DST / "static")
    (DST / "contentspec.yaml").write_text(CONTENTSPEC, encoding="utf-8")
    ws_readme = SRC / "workshop-studio-README.md"
    if ws_readme.exists():
        shutil.copy(ws_readme, DST / "README.md")
    # Workshop Studio requires a LICENSE when code is present; reuse the repo's.
    repo_license = SRC.parent / "LICENSE"
    if repo_license.exists():
        shutil.copy(repo_license, DST / "LICENSE")

    print(f"converted {len(pages)} pages -> {DST}")


if __name__ == "__main__":
    main()
