#!/usr/bin/env python3
"""Initialize a new skill directory with standard structure."""

import argparse
import os
import sys
from pathlib import Path

SKILL_MD_TEMPLATE = '''---
name: {skill_name}
description: [Describe what this skill does and when to use it - minimum 50 characters]
---

# {skill_title}

## Overview

[Describe the skill's purpose and capabilities]

## Usage

[Explain how to use this skill with examples]

## Resources

- `scripts/` - Executable scripts for deterministic tasks
- `references/` - Documentation loaded as needed
- `assets/` - Templates and files used in output
'''

EXAMPLE_SCRIPT = '''#!/usr/bin/env python3
"""Example script for {skill_name}."""

def main():
    """Main entry point."""
    print("Hello from {skill_name}!")

if __name__ == "__main__":
    main()
'''

EXAMPLE_REFERENCE = '''# Reference Document

This is an example reference document for {skill_name}.

## Contents

Add domain knowledge, guidelines, or documentation here that Codex
can load as needed during skill execution.
'''


def validate_skill_name(name: str) -> bool:
    """Validate skill name contains only allowed characters."""
    import re
    return bool(re.match(r'^[a-zA-Z0-9_-]+$', name))


def create_skill_directory(skill_name: str, output_path: Path) -> None:
    """Create skill directory structure with template files."""
    skill_dir = output_path / skill_name

    if skill_dir.exists():
        print(f"Error: Directory '{skill_dir}' already exists.", file=sys.stderr)
        sys.exit(1)

    # Create directories
    (skill_dir / "scripts").mkdir(parents=True)
    (skill_dir / "references").mkdir(parents=True)
    (skill_dir / "assets").mkdir(parents=True)

    # Create template files
    skill_title = skill_name.replace("-", " ").replace("_", " ").title()

    (skill_dir / "SKILL.md").write_text(
        SKILL_MD_TEMPLATE.format(skill_name=skill_name, skill_title=skill_title)
    )

    (skill_dir / "scripts" / "example.py").write_text(
        EXAMPLE_SCRIPT.format(skill_name=skill_name)
    )

    (skill_dir / "references" / "example.md").write_text(
        EXAMPLE_REFERENCE.format(skill_name=skill_name)
    )

    # Create empty .gitkeep in assets
    (skill_dir / "assets" / ".gitkeep").touch()

    print(f"Created skill directory: {skill_dir}")
    print()
    print("Next steps:")
    print(f"  1. Edit {skill_dir}/SKILL.md with your skill content")
    print(f"  2. Add scripts to {skill_dir}/scripts/")
    print(f"  3. Add references to {skill_dir}/references/")
    print(f"  4. Delete unused example files")
    print(f"  5. Package with: python scripts/package_skill.py {skill_dir}")


def main():
    parser = argparse.ArgumentParser(
        description="Initialize a new skill directory with standard structure."
    )
    parser.add_argument(
        "skill_name",
        help="Name of the skill (alphanumeric, hyphens, underscores only)"
    )
    parser.add_argument(
        "--path",
        type=Path,
        default=Path.cwd(),
        help="Output directory (default: current directory)"
    )

    args = parser.parse_args()

    if not validate_skill_name(args.skill_name):
        print(
            f"Error: Invalid skill name '{args.skill_name}'. "
            "Use only alphanumeric characters, hyphens, and underscores.",
            file=sys.stderr
        )
        sys.exit(1)

    create_skill_directory(args.skill_name, args.path)


if __name__ == "__main__":
    main()
