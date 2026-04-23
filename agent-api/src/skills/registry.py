"""Skill registry for managing all available skills."""
from typing import Dict, Callable, Optional


def get_all_skills() -> Dict[str, Callable]:
    """Get all registered skills.

    Returns:
        Dictionary mapping skill names to skill functions
    """
    skills = {}

    # Import all skill modules here
    skill_modules = []

    for module in skill_modules:
        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            if callable(attr) and hasattr(attr, "_skill_metadata"):
                skills[attr._skill_metadata.name] = attr

    return skills


def get_skill_by_name(name: str) -> Optional[Callable]:
    """Get a skill by name.

    Args:
        name: Skill name

    Returns:
        Skill function or None if not found
    """
    skills = get_all_skills()
    return skills.get(name)
