"""Offset-preserving quantity spans and evidence-backed ingredient phrase groups."""

import math
import re
from fractions import Fraction
from typing import Any

_WORDS = dict(
    zip(
        [
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
            "twenty",
        ],
        range(1, 21),
        strict=True,
    )
)
_PARTS = {"half": Fraction(1, 2), "quarter": Fraction(1, 4), "fourth": Fraction(1, 4)}
_GLYPHS = {
    "½": Fraction(1, 2),
    "¼": Fraction(1, 4),
    "¾": Fraction(3, 4),
    "⅓": Fraction(1, 3),
    "⅔": Fraction(2, 3),
    "⅛": Fraction(1, 8),
    "⅜": Fraction(3, 8),
    "⅝": Fraction(5, 8),
    "⅞": Fraction(7, 8),
}
_UNITS = {
    "tbsp": "tablespoon",
    "tablespoon": "tablespoon",
    "tablespoons": "tablespoon",
    "tsp": "teaspoon",
    "teaspoon": "teaspoon",
    "teaspoons": "teaspoon",
    "cup": "cup",
    "cups": "cup",
    "g": "gram",
    "gram": "gram",
    "grams": "gram",
    "kg": "kilogram",
    "kilogram": "kilogram",
    "kilograms": "kilogram",
    "ml": "milliliter",
    "milliliter": "milliliter",
    "milliliters": "milliliter",
    "l": "liter",
    "liter": "liter",
    "liters": "liter",
    "oz": "ounce",
    "ounce": "ounce",
    "ounces": "ounce",
    "lb": "pound",
    "lbs": "pound",
    "pound": "pound",
    "pounds": "pound",
    "spoonful": "spoonful",
    "spoonfuls": "spoonful",
    "clove": "clove",
    "cloves": "clove",
    "sprig": "sprig",
    "sprigs": "sprig",
    "minute": "minute",
    "minutes": "minute",
    "hour": "hour",
    "hours": "hour",
    "degree": "degree",
    "degrees": "degree",
    "°f": "fahrenheit",
    "°c": "celsius",
}
_NON_INGREDIENT = {"minute", "hour", "degree", "fahrenheit", "celsius"}
_WORD_PATTERN = "|".join(sorted(_WORDS, key=len, reverse=True))
_PART_PATTERN = "half|quarter|fourth"
_GLYPH_PATTERN = "½¼¾⅓⅔⅛⅜⅝⅞"
_NUM = (
    rf"(?:\d+/\d+|\d{{1,3}}(?:,\d{{3}})+|\d+(?:\.\d+|\s+\d+/\d+|\s*[{_GLYPH_PATTERN}])?|[{_GLYPH_PATTERN}]|"
    rf"(?:{_WORD_PATTERN})\s+and\s+a\s+half|a\s+(?:{_PART_PATTERN})|"
    rf"(?:{_PART_PATTERN})(?:\s+a)?|(?:{_WORD_PATTERN})|an?)"
)
_UNIT_PATTERN = "|".join(re.escape(x) for x in sorted(_UNITS, key=len, reverse=True))
_PATTERN = re.compile(
    rf"(?<![\w/])(?P<amount>{_NUM})(?:\s*(?:to|or|[-–—])\s*(?P<maximum>{_NUM}))?"
    rf"(?:(?:\s*)(?P<unit>{_UNIT_PATTERN})(?!\w))?(?![\w/]|\.(?=\d))",
    re.IGNORECASE,
)
_UNIT_SCAN = re.compile(rf"(?:°[FC]|(?<![^\W\d_])(?:{_UNIT_PATTERN}))(?!\w)", re.IGNORECASE)


def _fraction(raw: str) -> Fraction:
    raw = raw.lower().strip().replace(",", "")
    if raw in ("a", "an"):
        return Fraction(1)
    if raw.endswith(" and a half"):
        return Fraction(_WORDS[raw.removesuffix(" and a half")]) + Fraction(1, 2)
    if raw.startswith("a "):
        raw = raw[2:]
    if raw.endswith(" a"):
        raw = raw[:-2]
    if raw in _PARTS:
        return _PARTS[raw]
    if raw in _WORDS:
        return Fraction(_WORDS[raw])
    if raw in _GLYPHS:
        return _GLYPHS[raw]
    if raw[-1:] in _GLYPHS:
        return Fraction(raw[:-1].strip() or 0) + _GLYPHS[raw[-1]]
    if " " in raw:
        whole, part = raw.split(" ", 1)
        return Fraction(whole) + Fraction(part)
    return Fraction(raw)


def _text(fraction: Fraction) -> str:
    return str(fraction)


def find_quantities(text: str) -> list[dict[str, Any]]:
    """Return nonoverlapping quantity spans with exact source offsets."""
    found: list[dict[str, Any]] = []
    for match in _PATTERN.finditer(text):
        amount, maximum, unit_text = match.group("amount", "maximum", "unit")
        if text[: match.start()].rstrip().endswith(("-", "−")):
            continue
        if amount.lower() in ("a", "an") and not unit_text:
            continue
        try:
            value = _text(_fraction(amount))
            maximum_value = _text(_fraction(maximum)) if maximum else None
        except (ValueError, ZeroDivisionError):
            continue
        unit = _UNITS.get(unit_text.lower()) if unit_text else None
        found.append(
            {
                "start": match.start(),
                "end": match.end(),
                "text": match.group(),
                "value": value,
                "maximum": maximum_value,
                "unit": unit,
                "unit_text": unit_text,
                "kind": "non_ingredient" if unit in _NON_INGREDIENT else "ingredient",
            }
        )
    return found


def find_units(text: str) -> list[dict[str, Any]]:
    """Find explicit unit words, including units separated from a number."""
    found: list[dict[str, Any]] = []
    for match in _UNIT_SCAN.finditer(text):
        unit_text = match.group()
        unit = _UNITS[unit_text.lower()]
        found.append(
            {
                "start": match.start(),
                "end": match.end(),
                "text": unit_text,
                "unit": unit,
                "kind": "non_ingredient" if unit in _NON_INGREDIENT else "ingredient",
            }
        )
    return found


def group_candidates(
    candidates: list[dict[str, Any]], relations: list[dict[str, Any]], threshold: float = 0.7
) -> list[dict[str, Any]]:
    """Group supported phrases while preserving each member and its relation evidence."""
    by_id = {item["id"]: i for i, item in enumerate(candidates)}
    parent = list(range(len(candidates)))

    def root(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def supports(relation: dict[str, Any], choices: set[str]) -> bool:
        probabilities = relation.get("probabilities")
        if probabilities is not None:
            if not isinstance(probabilities, dict):
                return False
            if not all(
                type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1
                for value in probabilities.values()
            ) or not math.isclose(sum(probabilities.values()), 1, abs_tol=0.02):
                return False
            return float(sum(probabilities.get(choice, 0) for choice in choices)) >= threshold
        confidence = relation.get("confidence")
        return (
            relation.get("choice") in choices
            and isinstance(confidence, (int, float))
            and not isinstance(confidence, bool)
            and math.isfinite(confidence)
            and 0 <= confidence <= 1
            and confidence >= threshold
        )

    positive = {"modifier", "alias", "alternative"}
    unresolved = [
        relation
        for relation in relations
        if relation.get("left") in by_id
        and relation.get("right") in by_id
        and not supports(relation, positive)
        and not supports(relation, {"separate"})
    ]
    for relation in relations:
        if supports(relation, positive):
            left = by_id.get(relation.get("left"))
            right = by_id.get(relation.get("right"))
            if left is not None and right is not None:
                parent[root(left)] = root(right)

    components: dict[int, list[int]] = {}
    for index in range(len(candidates)):
        components.setdefault(root(index), []).append(index)

    result: list[dict[str, Any]] = []
    for indices in components.values():
        ids = {candidates[index]["id"] for index in indices}
        internal = [
            relation
            for relation in relations
            if relation.get("left") in ids and relation.get("right") in ids
        ]
        conflict = any(supports(relation, {"separate"}) for relation in internal)
        members = [candidates[index] for index in indices]
        groups = [[member] for member in members] if conflict else [members]
        for group in groups:
            group_ids = {member["id"] for member in group}
            unresolved_relations = [
                relation
                for relation in unresolved
                if relation.get("left") in group_ids or relation.get("right") in group_ids
            ]
            result.append(
                {
                    "members": group,
                    "relations": internal,
                    "conflict": conflict,
                    "uncertain": conflict or bool(unresolved_relations),
                    "unresolved_relations": unresolved_relations,
                    "amount_conflict": len(
                        {
                            (member.get("value"), member.get("maximum"), member.get("unit"))
                            for member in group
                        }
                    )
                    > 1,
                }
            )
    return result
