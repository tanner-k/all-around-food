"""End-to-end checks of source-grounded Jev extraction without network calls."""

from __future__ import annotations

import pytest

from allaroundfood.parsing.jev_parser import parse_sources


def answer(choice: str, criteria: dict[str, str]) -> dict:
    return {
        "type": "choice",
        "choice": choice,
        "confidence": 0.95,
        "probabilities": {key: float(key == choice) for key in criteria},
    }


class FakeJev:
    def __init__(
        self,
        *,
        ingredients: set[str],
        steps: set[str],
        names: set[str],
        relations: dict[tuple[str, str], str] | None = None,
        uncertain_ingredients: set[str] | None = None,
        titles: set[str] | None = None,
        sections: set[str] | None = None,
    ):
        self.ingredients, self.steps, self.names = ingredients, steps, names
        self.relations = relations or {}
        self.uncertain_ingredients = uncertain_ingredients or set()
        self.titles = titles or set()
        self.sections = sections or set()
        self.calls: list[dict] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def ask(self, stage: str, state: dict, questions: dict) -> dict:
        self.calls.append({"stage": stage, "question_count": len(questions)})
        output = {}
        for key, question in questions.items():
            item = state["items"][key]
            if stage == "sentence_labels":
                targets = {
                    "ingredient": self.ingredients,
                    "step": self.steps,
                    "title": self.titles,
                    "section": self.sections,
                }
                positive = item["text"].strip() in targets[item["label"]]
                probability = 0.95 if positive else 0.05
                if item["label"] == "ingredient" and item["text"] in self.uncertain_ingredients:
                    probability = 0.5
                output[key] = {"type": "noul", "noul": probability}
            elif stage == "token_roles":
                token = item["token"]["text"].casefold()
                prior = item.get("prior", "").casefold()
                role = "ingredient_start" if token in self.names else "other"
                if (
                    token
                    in {"rice", "quinoa", "flour", "milk", "salt", "pepper", "chicken", "pork"}
                    and prior in self.names
                ):
                    role = "ingredient_start"
                if token == "onions" and prior == "green":
                    role = "ingredient_continue"
                output[key] = answer(role, question["criteria"])
            elif stage == "amount_unit_links":
                kind = item["kind"]
                candidates = item["candidates"]
                preceding = [c for c in candidates if c["start"] < item["ingredient"]["start"]]
                selected = max(preceding, key=lambda c: c["start"])["id"] if preceding else "none"
                if kind == "unit" and selected == "none" and candidates:
                    selected = candidates[0]["id"]
                output[key] = answer(selected, question["criteria"])
            elif stage == "phrase_relations":
                pair = (item["left"]["text"], item["right"]["text"])
                output[key] = answer(self.relations.get(pair, "separate"), question["criteria"])
            elif stage == "ingredient_anchor":
                selected = next(
                    m["id"]
                    for m in item["group"]["members"]
                    if m["text"] in {"rice", "chicken", "pepper", "potatoes"}
                )
                output[key] = answer(selected, question["criteria"])
            else:
                raise AssertionError(stage)
        return output


def test_caption_ingredients_and_transcript_steps_are_combined_without_rewriting():
    caption = "1 cup rice\n2 tsp salt"
    transcript = "Boil rice. Stir in salt."
    client = FakeJev(
        ingredients={"1 cup rice", "2 tsp salt"},
        steps={"Boil rice.", "Stir in salt."},
        names={"rice", "salt"},
    )
    result = parse_sources({"caption": caption, "transcript": transcript}, client=client)
    assert [(i.name, i.quantity.value, i.quantity.unit) for i in result.recipe.ingredients] == [
        ("rice", 1.0, "cup"),
        ("salt", 2.0, "teaspoon"),
    ]
    assert [s.instruction for s in result.recipe.steps] == ["Boil rice.", "Stir in salt."]
    assert result.recipe.title == "Imported recipe"
    assert result.evidence["sources"] == {"caption": caption, "transcript": transcript}
    for segment in result.evidence["segments"]:
        assert (
            result.evidence["sources"][segment["source"]][segment["start"] : segment["end"]]
            == segment["text"]
        )


def test_line_can_be_both_ingredient_and_step():
    text = "Add 1 cup rice."
    client = FakeJev(ingredients={text}, steps={text}, names={"rice"})
    result = parse_sources({"caption": text}, client=client)
    assert result.recipe.ingredients[0].name == "rice"
    assert result.recipe.steps[0].instruction == text


def test_incomplete_recipe_fails_explicitly():
    client = FakeJev(ingredients={"1 cup rice"}, steps=set(), names={"rice"})
    with pytest.raises(ValueError, match="step"):
        parse_sources({"caption": "1 cup rice"}, client=client)


def test_oversized_source_fails_before_model_call():
    client = FakeJev(ingredients=set(), steps=set(), names=set())
    with pytest.raises(ValueError, match="30,000"):
        parse_sources({"caption": "rice " * 6100}, client=client)
    assert client.calls == []


def test_alternative_amounts_remain_one_requirement_with_both_options_visible():
    line = "Use 1 cup rice or 2 cups quinoa."
    client = FakeJev(
        ingredients={line},
        steps={"Cook gently."},
        names={"rice", "quinoa"},
        relations={("rice", "quinoa"): "alternative"},
    )
    result = parse_sources({"caption": line + "\nCook gently."}, client=client)
    assert len(result.recipe.ingredients) == 1
    item = result.recipe.ingredients[0]
    assert item.quantity.value is None
    assert item.quantity.as_written == line
    members = result.evidence["ingredient_records"][0]["members"]
    assert [(m["text"], m["value"]) for m in members] == [("rice", "1"), ("quinoa", "2")]
    assert any("Different explicit amounts" in warning for warning in result.warnings)


def test_range_is_not_reduced_to_a_scalar():
    line = "Add 1 to 2 cups rice."
    client = FakeJev(ingredients={line}, steps={line}, names={"rice"})
    result = parse_sources({"caption": line}, client=client)
    assert result.recipe.ingredients[0].quantity.value is None
    assert result.recipe.ingredients[0].quantity.as_written == line
    assert any("Non-scalar" in warning for warning in result.warnings)


def test_caption_quantity_wins_and_cross_source_conflict_is_reported():
    caption = "1 cup rice\nBoil rice."
    transcript = "Use 2 cups rice. Boil rice."
    client = FakeJev(
        ingredients={"1 cup rice", "Use 2 cups rice."}, steps={"Boil rice."}, names={"rice"}
    )
    result = parse_sources({"caption": caption, "transcript": transcript}, client=client)
    assert len(result.recipe.ingredients) == 1
    assert result.recipe.ingredients[0].quantity.value == 1
    assert any("Conflicting amounts" in warning for warning in result.warnings)
    assert "Conflicting amounts" in result.recipe.notes
    assert [step.instruction for step in result.recipe.steps] == ["Boil rice."]


def test_token_budget_fails_without_silent_partial_recipe():
    line = "rice " * 1601
    client = FakeJev(ingredients={line.strip()}, steps={line.strip()}, names={"rice"})
    with pytest.raises(ValueError, match="1,600 ingredient tokens"):
        parse_sources({"caption": line}, client=client)
    assert not any(call["stage"] == "token_roles" for call in client.calls)


def test_uncertain_ingredient_stays_in_notes_not_shopping_list():
    line = "1 cup rice"
    client = FakeJev(
        ingredients={"1 tsp salt"},
        steps={"Boil rice."},
        names={"rice", "salt"},
        uncertain_ingredients={line},
    )
    result = parse_sources({"caption": line + "\n1 tsp salt\nBoil rice."}, client=client)
    assert [item.name for item in result.recipe.ingredients] == ["salt"]
    assert "Possible ingredient in caption: 1 cup rice" in result.recipe.notes
    assert any(
        s["text"] == line and s["ingredient_probability"] == 0.5
        for s in result.evidence["segments"]
    )


def test_modifiers_group_into_one_original_phrase_with_anchor_evidence():
    line = "Add red pepper flakes."
    client = FakeJev(
        ingredients={line},
        steps={line},
        names={"red", "pepper", "flakes"},
        relations={
            ("red", "pepper"): "modifier",
            ("red", "flakes"): "modifier",
            ("pepper", "flakes"): "modifier",
        },
    )
    result = parse_sources({"caption": line}, client=client)
    assert [item.name for item in result.recipe.ingredients] == ["red pepper flakes"]
    assert result.evidence["ingredient_records"][0]["anchor"]["choice"] == "i1"
    assert any(call["stage"] == "ingredient_anchor" for call in client.calls)


def test_exact_fraction_and_measurement_as_written():
    line = "Add 1/2 cup rice."
    client = FakeJev(ingredients={line}, steps={line}, names={"rice"})
    result = parse_sources({"caption": line}, client=client)
    item = result.recipe.ingredients[0]
    assert item.quantity.value == 0.5
    assert item.quantity.as_written == "1/2 cup"
    assert line in result.recipe.notes


def test_model_questions_identify_state_item_and_evidence_is_frozen():
    line = "Add 1 cup rice."
    client = FakeJev(ingredients={line}, steps={line}, names={"rice"})
    result = parse_sources({"caption": line}, client=client)
    for decision in result.evidence["decisions"]:
        for key, question in decision["questions"].items():
            assert f"state.items[{key}]" in question["instructions"]
    token_request = next(d for d in result.evidence["decisions"] if d["stage"] == "token_roles")
    assert all("answer" not in item["token"] for item in token_request["state"]["items"].values())


def test_distinct_instruction_lists_preserve_unselected_source_for_review():
    caption = "1 cup rice\nBoil rice."
    transcript = "Rinse rice. Boil rice."
    client = FakeJev(
        ingredients={"1 cup rice"},
        steps={"Boil rice.", "Rinse rice."},
        names={"rice"},
    )
    result = parse_sources({"caption": caption, "transcript": transcript}, client=client)
    assert [step.instruction for step in result.recipe.steps] == ["Rinse rice.", "Boil rice."]
    assert "Competing instruction lists" in result.recipe.notes
    assert caption in result.recipe.notes and transcript in result.recipe.notes


def test_group_name_keeps_original_shared_head_without_repeating_conjunction():
    line = "Use golden or red potatoes."
    client = FakeJev(
        ingredients={line},
        steps={line},
        names={"golden", "red", "potatoes"},
        relations={
            ("golden", "red"): "alternative",
            ("golden", "potatoes"): "alternative",
            ("red", "potatoes"): "modifier",
        },
    )
    result = parse_sources({"caption": line}, client=client)
    assert [item.name for item in result.recipe.ingredients] == ["golden or red potatoes"]


def test_excessive_pair_questions_fail_explicitly():
    line = " ".join(["rice"] * 25) + "."
    client = FakeJev(ingredients={line}, steps={line}, names={"rice"})
    with pytest.raises(ValueError, match="ingredient candidates"):
        parse_sources({"caption": line}, client=client)
    assert not any(call["stage"] == "phrase_relations" for call in client.calls)


def test_caption_sections_keep_distinct_water_amounts_and_grounded_title():
    caption = (
        "How to make cold beef udon — my lunch\n"
        "Udon noodles\n92g water\n"
        "Cold broth\n300g water\n"
        "Meat topping\n100g water\n"
        "Boil the noodles."
    )
    client = FakeJev(
        ingredients={"92g water", "300g water", "100g water"},
        steps={"Boil the noodles."},
        names={"water"},
        titles={"How to make cold beef udon — my lunch"},
        sections={"Udon noodles", "Cold broth", "Meat topping"},
    )
    result = parse_sources({"caption": caption}, client=client)
    assert result.recipe.title == "cold beef udon"
    assert [(i.name, i.quantity.value, i.group) for i in result.recipe.ingredients] == [
        ("water", 92, "Udon noodles"),
        ("water", 300, "Cold broth"),
        ("water", 100, "Meat topping"),
    ]


def test_inline_section_prefix_is_not_shopping_ingredient():
    line = "Meat: 1 lb thinly sliced pork"
    client = FakeJev(
        ingredients={line},
        steps={"Cook pork."},
        names={"meat", "pork"},
        relations={("Meat", "pork"): "modifier"},
    )
    result = parse_sources({"caption": line + "\nCook pork."}, client=client)
    assert [(i.name, i.quantity.value, i.group) for i in result.recipe.ingredients] == [
        ("pork", 1, "Meat")
    ]


def test_ratio_values_do_not_replace_explicit_ingredient_amounts():
    caption = "30g sake\nBaseline: 1:1:1 soy:sake:mirin\nCook sake."
    client = FakeJev(
        ingredients={"30g sake", "Baseline: 1:1:1 soy:sake:mirin"},
        steps={"Cook sake."},
        names={"soy", "sake", "mirin"},
    )
    result = parse_sources({"caption": caption}, client=client)
    assert [(i.name, i.quantity.value) for i in result.recipe.ingredients] == [("sake", 30)]
    assert "Ratio" in result.recipe.notes


def test_numbered_caption_steps_are_preferred_when_transcript_omits_one():
    caption = "1 cup rice\n1. Rinse rice.\n2. Boil rice."
    transcript = "Boil rice."
    client = FakeJev(
        ingredients={"1 cup rice"},
        steps={"1. Rinse rice.", "2. Boil rice.", "Boil rice."},
        names={"rice"},
    )
    result = parse_sources({"caption": caption, "transcript": transcript}, client=client)
    assert [step.instruction for step in result.recipe.steps] == ["Rinse rice.", "Boil rice."]


def test_unresolved_relation_group_never_gets_trusted_scalar():
    line = "Use 1 cup rice or 2 cups quinoa."
    client = FakeJev(
        ingredients={line},
        steps={line},
        names={"rice", "quinoa"},
        relations={("rice", "quinoa"): "unknown"},
    )
    result = parse_sources({"caption": line}, client=client)
    assert [(i.name, i.quantity.value) for i in result.recipe.ingredients] == [
        ("rice", None),
        ("quinoa", None),
    ]
    assert "needs review" in result.recipe.notes


def test_transcript_measurement_fills_unmeasured_caption_ingredient():
    client = FakeJev(
        ingredients={"rice", "Add 2 cups rice."},
        steps={"Add 2 cups rice."},
        names={"rice"},
    )
    result = parse_sources({"caption": "rice", "transcript": "Add 2 cups rice."}, client=client)
    assert [(i.name, i.quantity.value, i.quantity.unit) for i in result.recipe.ingredients] == [
        ("rice", 2, "cup")
    ]


def test_inline_heading_probability_does_not_discard_amounts():
    line = "Veggies: 1 onion, 2 green onions"
    client = FakeJev(
        ingredients={line},
        steps={"Cook onions."},
        names={"veggies", "onion", "green", "onions"},
        sections={line},
    )
    result = parse_sources({"caption": line + "\nCook onions."}, client=client)
    assert [(i.name, i.quantity.value, i.group) for i in result.recipe.ingredients] == [
        ("onion", 1, "Veggies"),
        ("green onions", 2, "Veggies"),
    ]


def test_unmeasured_added_food_can_supplement_caption_list():
    client = FakeJev(
        ingredients={"1 cup rice", "Add green onions."},
        steps={"Add green onions."},
        names={"rice", "green", "onions"},
    )
    result = parse_sources(
        {"caption": "1 cup rice", "transcript": "Add green onions."},
        client=client,
    )
    assert {i.name for i in result.recipe.ingredients} == {"rice", "green onions"}


def test_transcript_amount_does_not_override_explicit_caption_range():
    client = FakeJev(
        ingredients={"1 to 2 cups rice", "Add 3 cups rice."},
        steps={"Add 3 cups rice."},
        names={"rice"},
    )
    result = parse_sources(
        {"caption": "1 to 2 cups rice", "transcript": "Add 3 cups rice."},
        client=client,
    )
    assert result.recipe.ingredients[0].quantity.value is None
    assert len(result.recipe.ingredients) == 1
    assert "Conflicting" in result.recipe.notes
