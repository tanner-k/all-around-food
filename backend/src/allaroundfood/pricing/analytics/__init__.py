"""Analytics sub-package for the pricing domain.

Exports pure functions for price-per-unit computation, retailer ranking,
price history filtering, and promotional price detection.
"""

from allaroundfood.pricing.analytics.history import (
    PromoFlag,
    detect_promotions,
    price_history,
)
from allaroundfood.pricing.analytics.price_per_unit import (
    PricePerUnit,
    compute_price_per_unit,
    latest_price_per_unit,
    normalize_size,
)
from allaroundfood.pricing.analytics.retailer_ranking import (
    BasketRanking,
    RetailerRanking,
    rank_basket,
    rank_retailers_for_product,
)

__all__ = [
    # price_per_unit
    "normalize_size",
    "compute_price_per_unit",
    "latest_price_per_unit",
    "PricePerUnit",
    # retailer_ranking
    "rank_retailers_for_product",
    "rank_basket",
    "RetailerRanking",
    "BasketRanking",
    # history
    "price_history",
    "detect_promotions",
    "PromoFlag",
]
