"""Safe recipe source preparation for the local Jev parser."""

from __future__ import annotations

import ipaddress
import json
import re
import socket
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from threading import BoundedSemaphore, Event, Thread
from typing import Any
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from allaroundfood.config import settings
from allaroundfood.models import Recipe

FETCH_TIMEOUT_S = 10.0
STRIPPED_TEXT_CAP = 30_000
IMAGE_BYTES_CAP = 10_000_000
OCR_TIMEOUT_S = 15
_DNS_SLOTS = BoundedSemaphore(4)


def _check_source_length(text: str) -> str:
    if len(text) > STRIPPED_TEXT_CAP:
        raise ValueError(
            "Recipe source is too long; paste a shorter excerpt with ingredients and steps"
        )
    return text


@dataclass(frozen=True)
class RecipeParseResult:
    recipe: Recipe
    worker_prompt: str
    stripped_text: str | None = None
    warnings: list[str] = field(default_factory=list)
    evidence: dict[str, Any] = field(default_factory=dict)


def parse_sources(
    sources: dict[str, str],
    *,
    source_url: str | None = None,
    title: str | None = None,
    client: Any = None,
) -> Any:
    """Load Jev only when a recipe job needs it."""
    from allaroundfood.parsing.jev_parser import parse_sources as parse

    return parse(sources, source_url=source_url, title=title, client=client)


def _parse(
    sources: dict[str, str],
    *,
    source_url: str | None = None,
    title: str | None = None,
    display: str | None = None,
) -> RecipeParseResult:
    parsed = parse_sources(sources, source_url=source_url, title=title)
    return RecipeParseResult(
        parsed.recipe,
        f"JEV SOURCES:\n{list(sources)}",
        display,
        list(parsed.warnings),
        dict(parsed.evidence),
    )


class _VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self.skip += 1
        elif not self.skip and tag in {
            "p",
            "div",
            "li",
            "br",
            "h1",
            "h2",
            "h3",
            "h4",
            "section",
            "article",
            "tr",
        }:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"}:
            self.skip = max(0, self.skip - 1)
        elif not self.skip and tag in {
            "p",
            "div",
            "li",
            "h1",
            "h2",
            "h3",
            "h4",
            "section",
            "article",
            "tr",
        }:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.parts.append(data)


def _strip_html(raw_html: str) -> str:
    parser = _VisibleText()
    parser.feed(raw_html)
    lines = [re.sub(r"\s+", " ", line).strip() for line in "".join(parser.parts).splitlines()]
    return "\n".join(line for line in lines if line)


def _check_public_url(url: str, deadline: float | None = None) -> str:
    """Resolve and return a public address to pin for this request."""
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username is not None:
        raise ValueError("Only public HTTP(S) recipe links are supported")
    if parsed.port not in {None, 80, 443}:
        raise ValueError("Only public HTTP(S) recipe links are supported")
    try:
        addresses = [ipaddress.ip_address(parsed.hostname)]
    except ValueError:
        dns_deadline = deadline if deadline is not None else time.monotonic() + FETCH_TIMEOUT_S
        if not _DNS_SLOTS.acquire(timeout=max(0, dns_deadline - time.monotonic())):
            raise ValueError(
                "Recipe website took too long; paste its text or a screenshot"
            ) from None
        finished = Event()
        resolved: list[Any] = []
        errors: list[OSError] = []

        def resolve() -> None:
            try:
                resolved.extend(
                    socket.getaddrinfo(
                        parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)
                    )
                )
            except OSError as exc:
                errors.append(exc)
            finally:
                _DNS_SLOTS.release()
                finished.set()

        Thread(target=resolve, daemon=True).start()
        if not finished.wait(max(0, dns_deadline - time.monotonic())):
            raise ValueError(
                "Recipe website took too long; paste its text or a screenshot"
            ) from None
        if errors:
            raise ValueError(
                "Recipe website could not be resolved; paste its text or a screenshot"
            ) from errors[0]
        addresses = [ipaddress.ip_address(row[4][0]) for row in resolved]
    if not addresses or any(not address.is_global for address in addresses):
        raise ValueError("Only public recipe websites are supported; paste text or a screenshot")
    return str(addresses[0])


def _fetch_public_html(url: str) -> str:
    """Fetch bounded HTML with a fresh public-destination check on redirects."""
    deadline = time.monotonic() + FETCH_TIMEOUT_S
    current = url
    with httpx.Client(timeout=FETCH_TIMEOUT_S, follow_redirects=False, trust_env=False) as http:
        for _ in range(6):
            address = _check_public_url(current, deadline)
            original = urlsplit(current)
            address_host = f"[{address}]" if ":" in address else address
            pinned_url = urlunsplit(
                (original.scheme, address_host, original.path, original.query, original.fragment)
            )
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ValueError("Recipe website took too long; paste its text or a screenshot")
            with http.stream(
                "GET",
                pinned_url,
                timeout=remaining,
                headers={"Host": original.netloc},
                extensions={"sni_hostname": original.hostname},
            ) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise ValueError("Recipe website redirected without a destination")
                    current = urljoin(current, location)
                    continue
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise ValueError(
                        "Recipe website blocked access; paste its text or a screenshot"
                    ) from exc
                body = bytearray()
                for chunk in response.iter_bytes():
                    if time.monotonic() > deadline:
                        raise ValueError(
                            "Recipe website took too long; paste its text or a screenshot"
                        )
                    body.extend(chunk)
                    if len(body) > 1_000_000:
                        raise ValueError(
                            "Recipe website is too large; paste its text or a screenshot"
                        )
                return body.decode("utf-8", errors="replace")
    raise ValueError("Recipe website redirected too many times; paste its text or a screenshot")


def _schema_recipe_text(raw_html: str) -> str:
    """Prefer recipe-specific JSON-LD over page navigation and comments."""
    scripts = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        raw_html,
        flags=re.I | re.S,
    )

    def recipes(value: Any) -> list[dict[str, Any]]:
        if isinstance(value, list):
            return [recipe for item in value for recipe in recipes(item)]
        if isinstance(value, dict):
            kinds = value.get("@type", [])
            if isinstance(kinds, str):
                kinds = [kinds]
            found = [value] if "Recipe" in kinds or "https://schema.org/Recipe" in kinds else []
            return found + recipes(value.get("@graph", []))
        return []

    def lines(value: Any) -> list[str]:
        if isinstance(value, str):
            return [value.strip()] if value.strip() else []
        if isinstance(value, list):
            return [line for item in value for line in lines(item)]
        if isinstance(value, dict):
            result = lines(value.get("name")) + lines(value.get("text"))
            return result + lines(value.get("itemListElement"))
        return []

    for script in scripts:
        try:
            for item in recipes(json.loads(script)):
                parts = lines(item.get("name")) + lines(item.get("description"))
                parts += lines(item.get("recipeIngredient"))
                parts += lines(item.get("recipeInstructions"))
                if parts:
                    return "\n".join(parts)
        except json.JSONDecodeError:
            continue
    return ""


def parse_recipe_from_url(url: str) -> RecipeParseResult:
    raw_html = _fetch_public_html(url)
    schema_text = _schema_recipe_text(raw_html)
    stripped_text = schema_text or _strip_html(raw_html)
    if not stripped_text:
        raise ValueError("Recipe website had no readable text; paste its text or a screenshot")
    _check_source_length(stripped_text)
    title = schema_text.splitlines()[0] if schema_text else None
    return _parse({"webpage": stripped_text}, source_url=url, title=title, display=stripped_text)


def parse_recipe_from_text(text: str) -> RecipeParseResult:
    stripped_text = text.strip()
    if not stripped_text:
        raise ValueError("Paste recipe text with ingredients and steps")
    _check_source_length(stripped_text)
    return _parse({"text": stripped_text}, display=stripped_text)


def parse_recipe_from_video_text(
    caption: str, transcript: str, source_url: str
) -> RecipeParseResult:
    caption, transcript = caption.strip(), transcript.strip()
    if not caption and not transcript:
        raise RuntimeError("No video transcript or caption text was available")
    sources = {
        name: value for name, value in (("caption", caption), ("transcript", transcript)) if value
    }
    _check_source_length("".join(sources.values()))
    display = "\n\n".join(f"{name.upper()}:\n{value}" for name, value in sources.items())
    return _parse(sources, source_url=source_url, display=display)


def parse_recipe_from_image(data: bytes, media_type: str) -> RecipeParseResult:
    extensions = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
    if media_type not in extensions:
        raise ValueError("Screenshot must be PNG, JPEG, or WebP; paste recipe text instead")
    if len(data) > IMAGE_BYTES_CAP:
        raise ValueError("Screenshot is too large; paste recipe text instead")
    if not data:
        raise ValueError("Screenshot is empty; paste recipe text instead")
    with tempfile.TemporaryDirectory(prefix="recipe-ocr-") as directory:
        image = Path(directory) / ("screenshot" + extensions[media_type])
        image.write_bytes(data)
        try:
            result = subprocess.run(
                [settings.tesseract_bin, str(image), "stdout"],
                capture_output=True,
                text=True,
                timeout=OCR_TIMEOUT_S,
                check=False,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            raise RuntimeError("Screenshot OCR unavailable; paste recipe text instead") from None
    if result.returncode:
        raise RuntimeError("Screenshot OCR failed; paste recipe text instead")
    stripped_text = result.stdout.strip()
    if not stripped_text:
        raise ValueError("Screenshot had no readable text; paste recipe text instead")
    _check_source_length(stripped_text)
    return _parse({"ocr": stripped_text}, display=stripped_text)
