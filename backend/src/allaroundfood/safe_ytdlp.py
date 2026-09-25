"""Run yt-dlp in an isolated process with public-only socket destinations.

The yt-dlp request director follows redirects and fetches extractor-selected
media through its urllib handler. The socket guard pins every TCP connection
to an address checked immediately before connect, including redirected URLs.
"""

from __future__ import annotations

import errno
import ipaddress
import os
import socket
import sys
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit


def guarded_address(family: int, address: tuple[Any, ...]) -> tuple[Any, ...]:
    """Resolve a TCP destination and return a checked numeric socket address."""
    if family not in (socket.AF_INET, socket.AF_INET6) or len(address) < 2:
        raise OSError(errno.EACCES, "Unsupported video network destination")
    host, port = address[:2]
    results = socket.getaddrinfo(host, port, family, socket.SOCK_STREAM)
    if not results or any(not ipaddress.ip_address(row[4][0]).is_global for row in results):
        raise OSError(errno.EACCES, "Video destination resolves to a private address")
    return results[0][4]


def connect_guarded(
    sock: Any, address: Any, connect: Callable[[Any, tuple[Any, ...]], Any]
) -> Any:
    """Connect to the validated numeric IP, without a second hostname lookup."""
    if not isinstance(address, tuple):
        raise OSError(errno.EACCES, "Unsupported video network destination")
    family = getattr(sock, "family", socket.AF_INET6 if len(address) > 2 else socket.AF_INET)
    return connect(sock, guarded_address(family, address))


def connect_ex_guarded(
    sock: Any, address: Any, connect_ex: Callable[[Any, tuple[Any, ...]], int]
) -> int:
    try:
        return int(connect_guarded(sock, address, connect_ex))
    except OSError as exc:
        return exc.errno or errno.EACCES


def validate_media_format(info_dict: dict[str, Any]) -> None:
    """Keep media on yt-dlp's native HTTP downloader, never external ffmpeg."""
    from yt_dlp.downloader import determine_protocol  # type: ignore[import-untyped]

    formats = info_dict.get("requested_formats") or [info_dict]
    if len(formats) != 1 or info_dict.get("section_start") or info_dict.get("section_end"):
        raise ValueError("Video needs a single direct HTTP(S) media format")
    for item in formats:
        if (
            determine_protocol(item) not in {"http", "https"}
            or urlsplit(str(item.get("url", ""))).scheme not in {"http", "https"}
            or info_dict.get("is_live")
            or item.get("is_live")
        ):
            raise ValueError("Video needs a native direct HTTP(S) media format")


def main(argv: list[str] | None = None) -> int:
    """Run one yt-dlp phase under the socket policy; parent enforces timeout."""
    args = argv if argv is not None else sys.argv[1:]
    if len(args) != 3 or args[0] not in {"metadata", "media"}:
        return 2
    phase, output_template, source_url = args
    os.environ["YTDLP_NO_PLUGINS"] = "1"

    from yt_dlp import YoutubeDL  # type: ignore[import-untyped]
    from yt_dlp.networking._urllib import UrllibRH  # type: ignore[import-untyped]
    from yt_dlp.utils import DownloadError  # type: ignore[import-untyped]

    class DirectUrllibRH(UrllibRH):  # type: ignore[misc]
        _SUPPORTED_URL_SCHEMES = ("http", "https", "data")

        def _get_proxies(self, request: Any) -> dict[str, None]:
            return {"all": None}

        def _get_headers(self, request: Any) -> Any:
            headers = super()._get_headers(request)
            headers.pop("Ytdl-socks-proxy", None)
            return headers

    class SafeYoutubeDL(YoutubeDL):  # type: ignore[misc]
        def build_request_director(self, handlers: Any, preferences: Any = None) -> Any:
            return super().build_request_director([DirectUrllibRH], preferences)

        def process_info(self, info_dict: dict[str, Any]) -> Any:
            if phase == "media":
                try:
                    validate_media_format(info_dict)
                except ValueError as exc:
                    raise DownloadError(str(exc)) from exc
            return super().process_info(info_dict)

    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex
    socket.socket.connect = lambda sock, address: connect_guarded(  # type: ignore[method-assign]
        sock, address, original_connect
    )
    socket.socket.connect_ex = lambda sock, address: connect_ex_guarded(  # type: ignore[method-assign]
        sock, address, original_connect_ex
    )
    try:
        with SafeYoutubeDL(
            {
                "outtmpl": output_template,
                "noplaylist": True,
                "skip_download": phase == "metadata",
                "writeinfojson": phase == "metadata",
                "max_filesize": 100_000_000,
                "format": "best",
                "external_downloader": "native",
                "fixup": "never",
                "proxy": "",
                "cachedir": False,
            }
        ) as ydl:
            return int(ydl.download([source_url]))
    finally:
        socket.socket.connect = original_connect  # type: ignore[method-assign]
        socket.socket.connect_ex = original_connect_ex  # type: ignore[method-assign]


if __name__ == "__main__":
    raise SystemExit(main())
