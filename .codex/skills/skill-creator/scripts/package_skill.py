#!/usr/bin/env python3
"""Package a skill directory into a distributable .skill file."""

import argparse
import re
import shutil
import sys
from pathlib import Path
from typing import Optional

FORBIDDEN_FILES = {"README.md", "CHANGELOG.md", "INSTALLATION_GUIDE.md"}
MIN_DESCRIPTION_LENGTH = 50
MIN_BODY_LENGTH = 100


def validate_skill(skill_path: Path) -> tuple[bool, list[str]]:
    """
    Validate a skill directory meets requirements.

    Returns:
        Tuple of (is_valid, list of error messages)
    """
    errors = []

    # Check SKILL.md exists
    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        errors.append("Missing required SKILL.md file")
        return False, errors

    content = skill_md.read_text()

    # Check for YAML frontmatter
    frontmatter_match = re.match(r'^---\n(.*?)\n---\n', content, re.DOTALL)
    if not frontmatter_match:
        errors.append("SKILL.md missing YAML frontmatter (---)")
        return False, errors

    frontmatter = frontmatter_match.group(1)
    body = content[frontmatter_match.end():]

    # Check required fields
    if not re.search(r'^name:\s*\S+', frontmatter, re.MULTILINE):
        errors.append("Frontmatter missing 'name' field")

    desc_match = re.search(r'^description:\s*(.+)$', frontmatter, re.MULTILINE)
    if not desc_match:
        errors.append("Frontmatter missing 'description' field")
    else:
        description = desc_match.group(1).strip()
        if len(description) < MIN_DESCRIPTION_LENGTH:
            errors.append(
                f"Description too short ({len(description)} chars, "
                f"minimum {MIN_DESCRIPTION_LENGTH})"
            )
        if "[" in description and "]" in description:
            errors.append("Description contains placeholder text (brackets)")

    # Check body content
    body_text = body.strip()
    if len(body_text) < MIN_BODY_LENGTH:
        errors.append(
            f"SKILL.md body too short ({len(body_text)} chars, "
            f"minimum {MIN_BODY_LENGTH})"
        )

    # Check for forbidden files
    for forbidden in FORBIDDEN_FILES:
        if (skill_path / forbidden).exists():
            errors.append(f"Contains forbidden file: {forbidden}")

    return len(errors) == 0, errors


def package_skill(skill_path: Path, output_dir: Path) -> Optional[Path]:
    """
    Package a skill directory into a .skill file.

    Returns:
        Path to the created .skill file, or None if validation failed
    """
    is_valid, errors = validate_skill(skill_path)

    if not is_valid:
        print("Validation failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return None

    skill_name = skill_path.name
    output_file = output_dir / f"{skill_name}.skill"

    # Create zip archive
    archive_path = shutil.make_archive(
        str(output_dir / skill_name),
        "zip",
        skill_path.parent,
        skill_path.name
    )

    # Rename to .skill
    zip_path = Path(archive_path)
    zip_path.rename(output_file)

    print(f"Created: {output_file}")
    return output_file


def main():
    parser = argparse.ArgumentParser(
        description="Package a skill directory into a distributable .skill file."
    )
    parser.add_argument(
        "skill_path",
        type=Path,
        help="Path to the skill directory"
    )
    parser.add_argument(
        "output_dir",
        type=Path,
        nargs="?",
        default=Path.cwd(),
        help="Output directory (default: current directory)"
    )

    args = parser.parse_args()

    if not args.skill_path.is_dir():
        print(f"Error: '{args.skill_path}' is not a directory", file=sys.stderr)
        sys.exit(1)

    args.output_dir.mkdir(parents=True, exist_ok=True)

    result = package_skill(args.skill_path, args.output_dir)
    if result is None:
        sys.exit(1)


if __name__ == "__main__":
    main()
