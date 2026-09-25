"""Source-grounded recipe extraction with Jev's bounded Choice/noul decisions."""

from __future__ import annotations

import copy
import re
import uuid
from contextlib import nullcontext
from dataclasses import dataclass
from fractions import Fraction
from itertools import combinations
from typing import Any

from allaroundfood.models import Ingredient, Quantity, Recipe, Step
from allaroundfood.parsing.ingredient_spans import find_quantities, find_units, group_candidates

MAX_SOURCE_CHARS = 30_000
MAX_TOKENS = 1_600
THRESHOLD = 0.7
_ROLES = {
    "ingredient_start": "First word of a food ingredient name, including identity descriptors.",
    "ingredient_continue": "Subsequent word in the same food ingredient name.",
    "quantity": "Word or numeral expressing an amount or range.",
    "unit": "Measurement or count unit.",
    "preparation": "Preparation, condition, or optionality, not core identity.",
    "other": "Action, conjunction, comment, or unrelated word.",
}
_RELATIONS = {
    "modifier": "Name fragments or descriptors belonging to one ingredient.",
    "alias": "Two names for the same ingredient.",
    "alternative": "Either/or foods for one ingredient requirement.",
    "separate": "Distinct ingredients both required.",
    "unknown": "Relationship unclear.",
}
_TOKEN = re.compile(r"\d+(?:[./]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]|[^\W\d_]+(?:[-’'][^\W\d_]+)*")
_ABBREVIATION = re.compile(r"(?:\btsp|\btbsp|\boz|\bmin|\bapprox|\bdr|\bmr|\bmrs)\.$", re.I)


@dataclass
class ParsedRecipe:
    recipe: Recipe
    warnings: list[str]
    evidence: dict[str, Any]


def _segments(sources: dict[str, str]) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    for source_name, source in sources.items():
        start = 0
        for match in re.finditer(r"[.!?](?=\s|$)|\n+", source):
            end = match.end()
            if match.group() == "." and (
                _ABBREVIATION.search(source[start:end])
                or re.fullmatch(r"\s*\d+", source[start : match.start()])
            ):
                continue
            if source[start:end].strip():
                left = start + len(source[start:end]) - len(source[start:end].lstrip())
                right = end - (len(source[start:end]) - len(source[start:end].rstrip()))
                segments.append(
                    {
                        "id": f"s{len(segments)}",
                        "source": source_name,
                        "start": left,
                        "end": right,
                        "text": source[left:right],
                    }
                )
            start = end
        if source[start:].strip():
            left = start + len(source[start:]) - len(source[start:].lstrip())
            right = len(source.rstrip())
            segments.append(
                {
                    "id": f"s{len(segments)}",
                    "source": source_name,
                    "start": left,
                    "end": right,
                    "text": source[left:right],
                }
            )
    return segments


def _ask(
    client: Any,
    stage: str,
    items: dict[str, dict[str, Any]],
    questions: dict[str, dict[str, Any]],
    evidence: dict[str, Any],
) -> dict[str, Any]:
    answers: dict[str, dict[str, Any]] = {}
    keys = list(questions)
    for offset in range(0, len(keys), 32):
        batch = keys[offset : offset + 32]
        state = {"items": {key: items[key] for key in batch}}
        selected = {
            key: {
                **questions[key],
                "instructions": f"For state.items[{key}]: " + questions[key]["instructions"],
            }
            for key in batch
        }
        request_snapshot = copy.deepcopy({"stage": stage, "state": state, "questions": selected})
        response = client.ask(stage, state, selected)
        if set(response) != set(selected):
            raise ValueError(f"Jev {stage} returned incomplete answers")
        evidence["decisions"].append({**request_snapshot, "answers": copy.deepcopy(response)})
        answers.update(response)
    return answers


def _name_spans(text: str, tokens: list[dict[str, Any]]) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    active: dict[str, Any] | None = None
    for token in tokens:
        choice = token["answer"]["choice"]
        if choice not in ("ingredient_start", "ingredient_continue"):
            active = None
            continue
        if (
            choice == "ingredient_continue"
            and active is not None
            and text[active["end"] : token["start"]].isspace()
        ):
            active["end"] = token["end"]
            active["text"] = text[active["start"] : active["end"]]
            active["confidence"] = min(active["confidence"], token["answer"]["confidence"])
            active["food_confidence"] = min(
                active["food_confidence"],
                sum(
                    token["answer"]["probabilities"].get(role, 0)
                    for role in ("ingredient_start", "ingredient_continue")
                ),
            )
        else:
            active = {
                "id": f"i{len(spans)}",
                "start": token["start"],
                "end": token["end"],
                "text": token["text"],
                "confidence": token["answer"]["confidence"],
                "food_confidence": sum(
                    token["answer"]["probabilities"].get(role, 0)
                    for role in ("ingredient_start", "ingredient_continue")
                ),
                "orphan_continuation": choice == "ingredient_continue",
            }
            spans.append(active)
    return spans


def _approximate(text: str, start: int) -> bool:
    return bool(
        re.search(
            r"(?:about|around|approximately|approx\.?|roughly|~|≈)\s*$",
            text[max(0, start - 22) : start],
            re.I,
        )
    )


def _ingredient_record(
    group: dict[str, Any], segment: dict[str, Any], warnings: list[str]
) -> tuple[Ingredient, dict[str, Any]]:
    members = group["members"]
    relations = group["relations"]
    kinds = {r["choice"] for r in relations}
    start, end = min(n["start"] for n in members), max(n["end"] for n in members)
    phrase = segment["text"][start:end]
    anchor_id = group.get("anchor", {}).get("choice")
    anchor = next((n for n in members if n["id"] == anchor_id), members[0])
    if "alternative" in kinds:
        # Remove measured spans between option names while retaining original conjunctions.
        drop: set[int] = set()
        for member in members:
            for candidate in (member.get("amount"), member.get("unit_candidate")):
                if candidate is not None:
                    drop.update(range(max(start, candidate["start"]), min(end, candidate["end"])))
        name = " ".join(
            "".join(
                char
                for offset, char in enumerate(segment["text"][start:end], start)
                if offset not in drop
            ).split()
        )
    else:
        # A modifier crossing a parenthesis or another amount is an explanation,
        # not a single clean food-name phrase.
        clean_modifier = not re.search(r"[:(),]", phrase) and not any(
            n.get("amount") is not None and start < n["amount"]["start"] < end for n in members
        )
        name = phrase if "modifier" in kinds and clean_modifier else anchor["text"]
    relevant_members = (
        [anchor] if anchor_id is not None and kinds & {"alias", "modifier"} else members
    )
    selected = [n["amount"] for n in members if n.get("amount") is not None]
    amounts = {(q["value"], q["maximum"], q["unit"]) for q in selected}
    units = {n["unit"] for n in members if n.get("unit") is not None}
    alternative_ambiguous = "alternative" in kinds and len(selected) != len(members)
    uncertain = (
        group["conflict"]
        or group.get("uncertain", False)
        or segment["ingredient_probability"] < THRESHOLD
        or len(amounts) > 1
        or len(units) > 1
        or alternative_ambiguous
        or any(
            n.get("food_confidence", n["confidence"]) < THRESHOLD or n.get("link_uncertain", False)
            for n in relevant_members
        )
        or any(r["confidence"] < THRESHOLD for r in relations)
        or group.get("anchor", {}).get("choice") == "unknown"
        or ("anchor" in group and group["anchor"]["confidence"] < THRESHOLD)
    )
    if len(amounts) > 1:
        warnings.append(
            f"Different explicit amounts for alternatives in {segment['source']}: {segment['text']}"
        )
    if alternative_ambiguous:
        warnings.append(
            f"Alternative amount needs review in {segment['source']}: {segment['text']}"
        )
    if uncertain:
        warnings.append(f"Ingredient needs review in {segment['source']}: {segment['text']}")
    amount = selected[0] if len(amounts) == 1 else None
    value = None
    unit = None
    if (
        amount
        and not amount["maximum"]
        and not _approximate(segment["text"], amount["start"])
        and not uncertain
    ):
        value = float(Fraction(amount["value"]))
        unit = amount["unit"] or next(
            (n["unit"] for n in members if n.get("unit") is not None), None
        )
    elif amount and (amount["maximum"] or _approximate(segment["text"], amount["start"])):
        warnings.append(f"Non-scalar ingredient amount in {segment['source']}: {segment['text']}")
    # The shopping amount is compact when trusted; original text remains in notes/evidence.
    as_written = (
        amount["text"]
        if amount and value is not None
        else (segment["text"] if amount or uncertain else "")
    )
    ingredient = Ingredient(
        name=name,
        quantity=Quantity(value=value, unit=unit, as_written=as_written),
        group=segment.get("inline_group") or segment.get("section"),
        notes=segment["text"],
    )
    record = {
        "name": name,
        "source": segment["source"],
        "segment": segment["id"],
        "group": ingredient.group,
        "source_phrase": phrase,
        "source_start": segment["start"] + start,
        "source_end": segment["start"] + end,
        "members": members,
        "relations": relations,
        "anchor": group.get("anchor"),
        "ingredient": ingredient.model_dump(),
    }
    return ingredient, record


def parse_sources(
    sources: dict[str, str],
    *,
    source_url: str | None = None,
    title: str | None = None,
    client: Any = None,
) -> ParsedRecipe:
    """Extract a complete recipe or raise instead of returning a partial draft."""
    if (
        not isinstance(sources, dict)
        or not sources
        or any(not isinstance(k, str) or not isinstance(v, str) for k, v in sources.items())
    ):
        raise ValueError("sources must be a nonempty map of names to text")
    if sum(len(value) for value in sources.values()) > MAX_SOURCE_CHARS:
        raise ValueError("Recipe sources exceed 30,000 characters")
    segments = _segments(sources)
    if not segments:
        raise ValueError("Recipe sources contain no text")
    if sum(len(_TOKEN.findall(segment["text"])) for segment in segments) > MAX_TOKENS:
        raise ValueError(
            "Recipe has over 1,600 ingredient tokens; split the source into smaller recipes"
        )
    evidence: dict[str, Any] = {
        "sources": sources.copy(),
        "segments": segments,
        "decisions": [],
        "ingredient_records": [],
    }
    warnings: list[str] = []
    context: Any
    if client is None:
        from allaroundfood.parsing.jev_client import JevClient

        context = JevClient()
    else:
        context = nullcontext(client)
    with context as worker:
        items = {}
        questions = {}
        for segment in segments:
            for label in ("ingredient", "step", "title", "section"):
                key = f"{segment['id']}_{label}"
                items[key] = {
                    "segment": segment["id"],
                    "source": segment["source"],
                    "text": segment["text"],
                    "label": label,
                }
                questions[key] = {
                    "type": "noul",
                    "instructions": (
                        f"Does this source span function as a recipe {label}? "
                        "Ingredient means a food required in this recipe, including "
                        "an unmeasured food actually added or used in a step. Exclude "
                        "food only mentioned in tips, a dish title, a previous recipe, "
                        "or an already-made intermediate. Ingredient and step can "
                        "both be true. Title is the dish name. Section is ONLY a "
                        "heading without ingredient amounts or cooking actions; "
                        "'Veggies: 1 onion' is an ingredient line, not a section. "
                        "Decide each label independently."
                    ),
                    "criteria": {"true": f"contains {label}", "false": f"does not contain {label}"},
                }
        labels = _ask(worker, "sentence_labels", items, questions, evidence)
        for segment in segments:
            segment["ingredient_probability"] = labels[f"{segment['id']}_ingredient"]["noul"]
            segment["step_probability"] = labels[f"{segment['id']}_step"]["noul"]
            segment["title_probability"] = labels[f"{segment['id']}_title"]["noul"]
            segment["section_probability"] = labels[f"{segment['id']}_section"]["noul"]
            if 0.3 <= segment["ingredient_probability"] < THRESHOLD:
                warnings.append(f"Possible ingredient in {segment['source']}: {segment['text']}")
        current_section: dict[str, str] = {}
        bearing = []
        for segment in segments:
            pure_section = (
                segment["section_probability"] >= THRESHOLD
                and not any(q["kind"] == "ingredient" for q in find_quantities(segment["text"]))
                and segment["step_probability"] < THRESHOLD
            )
            if pure_section:
                current_section[segment["source"]] = segment["text"].strip()
                continue
            segment["section"] = current_section.get(segment["source"])
            if segment["title_probability"] >= THRESHOLD:
                continue
            if re.search(r"\b\d+(?::\d+){2,}\b", segment["text"]):
                warnings.append(
                    f"Ratio retained for review in {segment['source']}: {segment['text']}"
                )
                continue
            if segment["ingredient_probability"] >= THRESHOLD:
                bearing.append(segment)
        token_items, token_questions = {}, {}
        for segment in bearing:
            tokens = [
                {"id": f"t{i}", "text": m.group(), "start": m.start(), "end": m.end()}
                for i, m in enumerate(_TOKEN.finditer(segment["text"]))
            ]
            segment["tokens"] = tokens
            for i, token in enumerate(tokens):
                key = f"{segment['id']}_{token['id']}"
                token_items[key] = {
                    "segment": segment["id"],
                    "text": segment["text"],
                    "token": token,
                    "prior": tokens[i - 1]["text"] if i else "",
                }
                token_questions[key] = {
                    "type": "choice",
                    "instructions": (
                        f"Classify only token {token['id']} {token['text']!r} at "
                        f"{token['start']}:{token['end']} in this sentence. "
                        "Identify exact food-name boundaries; do not invent words."
                    ),
                    "criteria": _ROLES,
                }
        token_answers = _ask(worker, "token_roles", token_items, token_questions, evidence)
        links: list[tuple[dict[str, Any], dict[str, Any], str, list[dict[str, Any]]]] = []
        for segment in bearing:
            for token in segment["tokens"]:
                token["answer"] = token_answers[f"{segment['id']}_{token['id']}"]
            segment["ingredients"] = _name_spans(segment["text"], segment["tokens"])
            inline = re.match(r"^([A-Za-z][A-Za-z ]{1,30}):\s*", segment["text"])
            if inline and find_quantities(segment["text"][inline.end() :]):
                segment["inline_group"] = inline.group(1).strip()
                segment["ingredients"] = [
                    name for name in segment["ingredients"] if name["end"] > inline.end()
                ]
                for index, name in enumerate(segment["ingredients"]):
                    name["id"] = f"i{index}"
            segment["quantities"] = [
                {"id": f"q{i}", **q} for i, q in enumerate(find_quantities(segment["text"]))
            ]
            segment["units"] = [
                {"id": f"u{i}", **u} for i, u in enumerate(find_units(segment["text"]))
            ]
            for name in segment["ingredients"]:
                for kind, candidates in (
                    ("amount", segment["quantities"]),
                    ("unit", segment["units"]),
                ):
                    candidates = [c for c in candidates if c["kind"] != "non_ingredient"]
                    if candidates:
                        links.append((segment, name, kind, candidates))
                    else:
                        name[f"{kind}_link"] = {"choice": "none", "confidence": None}
        items, questions = {}, {}
        for index, (segment, name, kind, candidates) in enumerate(links):
            key = f"l{index}"
            items[key] = {
                "segment": segment["id"],
                "text": segment["text"],
                "ingredient": name,
                "kind": kind,
                "candidates": candidates,
            }
            questions[key] = {
                "type": "choice",
                "instructions": (
                    f"Choose the explicit {kind} span belonging to ingredient "
                    f"{name['id']} {name['text']!r}. Never transfer an amount "
                    "between foods or infer one. Ignore times and temperatures; "
                    "choose unknown if ambiguous."
                ),
                "criteria": {
                    **{c["id"]: f"{c['text']!r} at {c['start']}:{c['end']}" for c in candidates},
                    "none": "No corresponding source span",
                    "unknown": "Ambiguous correspondence",
                },
            }
        answers = _ask(worker, "amount_unit_links", items, questions, evidence)
        for index, (_segment, name, kind, candidates) in enumerate(links):
            link = answers[f"l{index}"]
            name[f"{kind}_link"] = link
            name["unit_candidate" if kind == "unit" else "amount"] = next(
                (c for c in candidates if c["id"] == link["choice"]), None
            )
            name["link_uncertain"] = (
                name.get("link_uncertain", False)
                or link["choice"] == "unknown"
                or link["confidence"] < THRESHOLD
            )
        for segment in bearing:
            for name in segment["ingredients"]:
                name.setdefault("amount", None)
                name.setdefault("unit_candidate", None)
                q = name["amount"]
                name.update(
                    value=q["value"] if q else None,
                    maximum=q["maximum"] if q else None,
                    unit=name["unit_candidate"]["unit"]
                    if name["unit_candidate"]
                    else (q["unit"] if q else None),
                )
        pair_count = sum(len(s["ingredients"]) * (len(s["ingredients"]) - 1) // 2 for s in bearing)
        if pair_count > 256:
            raise ValueError(
                "Recipe has too many ingredient candidates to compare; "
                "split the source into smaller recipes"
            )
        pairs = [(s, a, b) for s in bearing for a, b in combinations(s["ingredients"], 2)]
        items, questions = {}, {}
        for index, (segment, left, right) in enumerate(pairs):
            key = f"r{index}"
            items[key] = {
                "segment": segment["id"],
                "text": segment["text"],
                "left": left,
                "right": right,
            }
            questions[key] = {
                "type": "choice",
                "instructions": (
                    f"What is the relationship between ingredient candidates "
                    f"{left['id']} {left['text']!r} and "
                    f"{right['id']} {right['text']!r}? "
                    "One requirement or separate foods?"
                ),
                "criteria": _RELATIONS,
            }
        answers = _ask(worker, "phrase_relations", items, questions, evidence)
        for segment in bearing:
            segment["relations"] = []
        for index, (segment, left, right) in enumerate(pairs):
            segment["relations"].append(
                {"left": left["id"], "right": right["id"], **answers[f"r{index}"]}
            )
        anchor_items, anchor_questions = {}, {}
        for segment in bearing:
            segment["groups"] = group_candidates(segment["ingredients"], segment["relations"])
            for index, group in enumerate(segment["groups"]):
                group["id"] = f"g{index}"
                if len(group["members"]) > 1 and any(
                    r["choice"] in ("modifier", "alias") for r in group["relations"]
                ):
                    key = f"a{segment['id']}_{index}"
                    anchor_items[key] = {
                        "segment": segment["id"],
                        "text": segment["text"],
                        "group": group,
                    }
                    anchor_questions[key] = {
                        "type": "choice",
                        "instructions": (
                            "Choose the main food noun/name, not a descriptor. "
                            "For aliases prefer the first source name. Unknown if unclear."
                        ),
                        "criteria": {
                            **{m["id"]: m["text"] for m in group["members"]},
                            "unknown": "No clear anchor",
                        },
                    }
        answers = _ask(worker, "ingredient_anchor", anchor_items, anchor_questions, evidence)
        for segment in bearing:
            for index, group in enumerate(segment["groups"]):
                key = f"a{segment['id']}_{index}"
                if key in answers:
                    group["anchor"] = answers[key]
    gathered: list[tuple[Ingredient, dict[str, Any]]] = []
    for segment in bearing:
        if not segment["groups"]:
            warnings.append(
                f"Ingredient sentence had no identified food in {segment['source']}: "
                f"{segment['text']}"
            )
        for group in segment["groups"]:
            ingredient, record = _ingredient_record(group, segment, warnings)
            gathered.append((ingredient, record))
            evidence["ingredient_records"].append(record)
    # Repeated measured caption components remain separate requirements.
    selected: list[tuple[Ingredient, dict[str, Any]]] = []
    for ingredient, record in sorted(
        gathered,
        key=lambda pair: (pair[1]["source"] != "caption", pair[1]["source"] == "transcript"),
    ):
        key = re.sub(r"\s+", " ", ingredient.name.strip()).casefold()
        existing = [
            (item, origin)
            for item, origin in selected
            if re.sub(r"\s+", " ", item.name.strip()).casefold() == key
        ]
        measured = ingredient.quantity.value is not None
        if not measured:
            if not existing:
                selected.append((ingredient, record))
            continue
        caption_explicit = [
            (item, origin)
            for item, origin in existing
            if origin["source"] == "caption"
            and any(member.get("amount") is not None for member in origin["members"])
        ]
        if record["source"] != "caption" and caption_explicit:
            if any(
                item.quantity.value is None
                or (item.quantity.value, item.quantity.unit)
                != (ingredient.quantity.value, ingredient.quantity.unit)
                for item, _ in caption_explicit
            ):
                warnings.append(
                    f"Conflicting amounts for {ingredient.name}: {ingredient.quantity.as_written}"
                )
            continue
        if record["source"] == "caption":
            selected = [
                (item, origin)
                for item, origin in selected
                if not (item.name.casefold() == key and origin["source"] != "caption")
            ]
        selected = [
            (item, origin)
            for item, origin in selected
            if not (item.name.casefold() == key and item.quantity.value is None)
        ]
        if not any(
            item.name.casefold() == key
            and item.group == ingredient.group
            and (item.quantity.value, item.quantity.unit)
            == (ingredient.quantity.value, ingredient.quantity.unit)
            for item, _ in selected
        ):
            selected.append((ingredient, record))
    caption_steps = [
        s for s in segments if s["source"] == "caption" and s["step_probability"] >= THRESHOLD
    ]
    transcript_steps = [
        s for s in segments if s["source"] == "transcript" and s["step_probability"] >= THRESHOLD
    ]
    caption_texts = {s["text"].casefold() for s in caption_steps}
    transcript_texts = {s["text"].casefold() for s in transcript_steps}
    numbered_caption = bool(re.search(r"(?m)^\s*\d+[.)]\s+\S", sources.get("caption", "")))
    if caption_steps and (
        numbered_caption or not transcript_steps or transcript_texts <= caption_texts
    ):
        chosen_steps = caption_steps
        if transcript_steps and caption_texts != transcript_texts:
            warnings.append(
                "Competing instruction lists in caption and transcript; review both sources"
            )
    elif transcript_steps:
        chosen_steps = transcript_steps
        if caption_steps and caption_texts != transcript_texts:
            warnings.append(
                "Competing instruction lists in caption and transcript; review both sources"
            )
    else:
        chosen_steps = [s for s in segments if s["step_probability"] >= THRESHOLD]
    unique_steps = list(dict.fromkeys(re.sub(r"^\d+[.)]\s+", "", s["text"]) for s in chosen_steps))
    if not selected:
        raise ValueError("Recipe extraction found no grounded ingredient")
    if not unique_steps:
        raise ValueError("Recipe extraction found no grounded step")
    recipe = Recipe(
        id=str(uuid.uuid4()),
        title=(
            title.strip()
            if title and title.strip()
            else next(
                (
                    re.split(r"\s+[—–]\s+", re.sub(r"(?i)^how to make\s+", "", s["text"]))[0].strip(
                        " )"
                    )
                    for s in segments
                    if s["source"] == "caption" and s["title_probability"] >= THRESHOLD
                ),
                "Imported recipe",
            )
        ),
        source_url=source_url,
        ingredients=[item for item, _ in selected],
        steps=[Step(order=i + 1, instruction=text) for i, text in enumerate(unique_steps)],
        notes="\n\n".join(
            [
                f"Original {source_name}:\n{source_text}"
                for source_name, source_text in sources.items()
            ]
            + list(dict.fromkeys(warnings))
        ),
    )
    evidence["calls"] = list(worker.calls)
    return ParsedRecipe(recipe=recipe, warnings=warnings, evidence=evidence)
