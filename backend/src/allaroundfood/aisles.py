"""Static keyword-based aisle categorization for grocery items."""

from __future__ import annotations

from allaroundfood.models import Aisle

# Aisle -> keyword tuple. categorize() picks the aisle whose longest matching
# keyword is longest, so specific compounds ("ice cream") beat broad keywords
# ("cream"). Ties break by AISLE_ORDER.
AISLE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Produce": (
        "lettuce",
        "tomato",
        "onion",
        "garlic",
        "carrot",
        "celery",
        "spinach",
        "kale",
        "apple",
        "banana",
        "lemon",
        "lime",
        "orange",
        "berry",
        "grape",
        "cilantro",
        "parsley",
        "basil",
        "herb",
        "potato",
        "avocado",
        "broccoli",
        "cauliflower",
        "cucumber",
        "mushroom",
        "zucchini",
        "bell pepper",
        "ginger",
        "scallion",
        "corn",
    ),
    "Dairy": (
        "milk",
        "butter",
        "cheese",
        "yogurt",
        "cream",
        "egg",
        "parmesan",
        "mozzarella",
        "feta",
        "ricotta",
    ),
    "Meat": (
        "chicken",
        "beef",
        "pork",
        "bacon",
        "sausage",
        "turkey",
        "lamb",
        "fish",
        "salmon",
        "tuna",
        "shrimp",
        "steak",
    ),
    "Bakery": (
        "bread",
        "bun",
        "bagel",
        "tortilla",
        "roll",
        "baguette",
        "croissant",
        "pita",
    ),
    "Pantry": (
        "flour",
        "sugar",
        "rice",
        "pasta",
        "noodle",
        "oil",
        "vinegar",
        "salt",
        "pepper",
        "spice",
        "bean",
        "lentil",
        "broth",
        "stock",
        "sauce",
        "ketchup",
        "mustard",
        "mayonnaise",
        "can",
        "oats",
        "cereal",
        "honey",
        "syrup",
        "baking",
        "yeast",
        "nut",
        "peanut",
    ),
    "Frozen": (
        "frozen",
        "ice cream",
        "popsicle",
    ),
    "Beverages": (
        "orange juice",
        "juice",
        "soda",
        "coffee",
        "tea",
        "sparkling water",
        "wine",
        "beer",
    ),
    "Household": (
        "paper towel",
        "toilet paper",
        "detergent",
        "soap",
        "dish soap",
        "foil",
        "plastic wrap",
        "trash bag",
        "napkin",
    ),
}

# Display/grouping order for aisles, with the catch-all last.
AISLE_ORDER: tuple[Aisle, ...] = (
    "Produce",
    "Dairy",
    "Meat",
    "Bakery",
    "Pantry",
    "Frozen",
    "Beverages",
    "Household",
    "Other",
)


def categorize(name: str) -> Aisle:
    """Categorize a grocery item name into an aisle by keyword match.

    Lowercases the name and substring-checks every aisle's keywords. The
    aisle whose longest matching keyword is longest wins, so specific
    compounds ("ice cream") beat broad keywords ("cream"). Ties break by
    ``AISLE_ORDER``. Unmatched names fall back to ``"Other"``.

    Args:
        name: The item name.

    Returns:
        The aisle name, or ``"Other"`` if no keyword matches.
    """
    lowered = name.lower()
    best_aisle: Aisle = "Other"
    best_len = 0
    for aisle in AISLE_ORDER:
        for keyword in AISLE_KEYWORDS.get(aisle, ()):
            if keyword in lowered and len(keyword) > best_len:
                best_len = len(keyword)
                best_aisle = aisle
    return best_aisle
