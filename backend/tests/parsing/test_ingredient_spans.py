"""Regressions for offset-preserving ingredient quantities and phrase groups."""

from allaroundfood.parsing.ingredient_spans import find_quantities, find_units, group_candidates


def test_quantity_offsets_and_exact_fractions() -> None:
    source = "🥘 a fourth tsp salt; two and a half cups rice; 3 to 4lb potatoes"
    found = find_quantities(source)
    assert [(item["text"], item["value"], item["maximum"], item["unit"]) for item in found] == [
        ("a fourth tsp", "1/4", None, "teaspoon"),
        ("two and a half cups", "5/2", None, "cup"),
        ("3 to 4lb", "3", "4", "pound"),
    ]
    assert all(source[item["start"] : item["end"]] == item["text"] for item in found)


def test_times_temperatures_and_attached_units() -> None:
    source = "Bake 20 minutes at 350°F; use 200g flour and ½ cup milk"
    found = find_quantities(source)
    assert [(item["text"], item["kind"]) for item in found] == [
        ("20 minutes", "non_ingredient"),
        ("350°F", "non_ingredient"),
        ("200g", "ingredient"),
        ("½ cup", "ingredient"),
    ]
    units = find_units(source)
    assert [(item["text"], item["unit"]) for item in units] == [
        ("minutes", "minute"),
        ("°F", "fahrenheit"),
        ("g", "gram"),
        ("cup", "cup"),
    ]
    assert all(source[item["start"] : item["end"]] == item["text"] for item in units)


def test_unicode_ranges_and_articles() -> None:
    source = "1–2 cups milk, 1/2 tsp salt, a tomato, an onion, a cup broth"
    assert [(item["text"], item["value"], item["maximum"]) for item in find_quantities(source)] == [
        ("1–2 cups", "1", "2"),
        ("1/2 tsp", "1/2", None),
        ("a cup", "1", None),
    ]


def test_mixed_unicode_fractions_and_eighths_keep_one_span() -> None:
    source = "1 ½ cups milk; 2⅜ cups flour; ⅞ tsp salt"
    found = find_quantities(source)
    assert [(item["text"], item["value"], item["unit"]) for item in found] == [
        ("1 ½ cups", "3/2", "cup"),
        ("2⅜ cups", "19/8", "cup"),
        ("⅞ tsp", "7/8", "teaspoon"),
    ]
    assert all(source[item["start"] : item["end"]] == item["text"] for item in found)


def test_grouped_thousands_and_explicit_amount_options() -> None:
    source = "1,000 g flour; 1 or 2 cups milk"
    found = find_quantities(source)
    assert [(item["text"], item["value"], item["maximum"], item["unit"]) for item in found] == [
        ("1,000 g", "1000", None, "gram"),
        ("1 or 2 cups", "1", "2", "cup"),
    ]
    assert all(source[item["start"] : item["end"]] == item["text"] for item in found)


def test_malformed_and_negative_quantities_are_ignored() -> None:
    assert find_quantities("-2 cups, 1/0 tsp, 3/0 g, 2 cups") == [
        {
            "start": 25,
            "end": 31,
            "text": "2 cups",
            "value": "2",
            "maximum": None,
            "unit": "cup",
            "unit_text": "cups",
            "kind": "ingredient",
        }
    ]


def test_spaced_negative_signs_do_not_create_positive_quantities() -> None:
    assert [item["text"] for item in find_quantities("- 2 cups, − 3 g, 1 - 2 cups")] == [
        "1 - 2 cups"
    ]


def test_golden_or_red_potatoes_preserves_alternative_members_and_evidence() -> None:
    items = [
        {"id": "gold", "text": "gold potatoes", "start": 0, "end": 13, "value": "2"},
        {"id": "red", "text": "red potatoes", "start": 17, "end": 29, "value": "3"},
    ]
    relation = {"left": "gold", "right": "red", "choice": "alternative", "confidence": 0.8}
    groups = group_candidates(items, [relation])
    assert len(groups) == 1
    assert groups[0]["members"] == items
    assert groups[0]["relations"] == [relation]
    assert groups[0]["amount_conflict"] is True
    assert "value" not in groups[0]


def test_salt_and_pepper_remain_separate() -> None:
    items = [{"id": "salt", "text": "salt"}, {"id": "pepper", "text": "pepper"}]
    relation = {"left": "salt", "right": "pepper", "choice": "separate", "confidence": 0.95}
    groups = group_candidates(items, [relation])
    assert [group["members"] for group in groups] == [[items[0]], [items[1]]]
    assert all(group["uncertain"] is False for group in groups)
    assert all(group["unresolved_relations"] == [] for group in groups)


def test_unresolved_relation_marks_both_ingredient_groups_uncertain() -> None:
    items = [{"id": "rice", "value": "1"}, {"id": "quinoa", "value": "2"}]
    for relation in (
        {"left": "rice", "right": "quinoa", "choice": "unknown", "confidence": 0.95},
        {"left": "rice", "right": "quinoa", "choice": "alternative", "confidence": 0.55},
    ):
        groups = group_candidates(items, [relation])
        assert [group["members"] for group in groups] == [[items[0]], [items[1]]]
        assert all(group["uncertain"] is True for group in groups)
        assert all(group["unresolved_relations"] == [relation] for group in groups)


def test_positive_probabilities_sum_to_threshold() -> None:
    items = [{"id": "a"}, {"id": "b"}]
    relation = {
        "left": "a",
        "right": "b",
        "probabilities": {"modifier": 0.3, "alias": 0.2, "alternative": 0.2, "separate": 0.3},
    }
    assert len(group_candidates(items, [relation])) == 1


def test_transitive_separate_conflict_splits_component() -> None:
    items = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    relations = [
        {"left": "a", "right": "b", "choice": "alias", "confidence": 0.9},
        {"left": "b", "right": "c", "choice": "modifier", "confidence": 0.9},
        {"left": "a", "right": "c", "choice": "separate", "confidence": 0.95},
    ]
    groups = group_candidates(items, relations)
    assert [group["members"] for group in groups] == [[item] for item in items]
    assert all(group["conflict"] for group in groups)
    assert all(group["relations"] == relations for group in groups)


def test_invalid_probabilities_never_merge() -> None:
    items = [{"id": "a"}, {"id": "b"}]
    for score in (float("nan"), float("inf"), -1, "bad", None):
        relation = {
            "left": "a",
            "right": "b",
            "choice": "alias",
            "confidence": 0.99,
            "probabilities": {"alias": score},
        }
        assert len(group_candidates(items, [relation])) == 2
    for score in (float("nan"), float("inf"), -1, "bad", None):
        relation = {"left": "a", "right": "b", "choice": "alias", "confidence": score}
        assert len(group_candidates(items, [relation])) == 2
    relation = {
        "left": "a",
        "right": "b",
        "probabilities": {"alias": 0.8, "separate": float("nan")},
    }
    assert len(group_candidates(items, [relation])) == 2
    for probabilities in (
        {"alias": True, "separate": 0},
        {"alias": 0.8, "separate": 0.8},
    ):
        relation = {"left": "a", "right": "b", "probabilities": probabilities}
        assert len(group_candidates(items, [relation])) == 2
    relation = {"left": "a", "right": "b", "choice": "alias", "confidence": True}
    assert len(group_candidates(items, [relation])) == 2
