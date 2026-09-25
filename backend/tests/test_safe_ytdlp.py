"""The yt-dlp child process must never connect to private destinations."""

from __future__ import annotations

import errno
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import pytest


def test_video_redirect_and_media_destinations_block_private_addresses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from allaroundfood.safe_ytdlp import guarded_address

    destinations = {
        "instagram.example": "93.184.216.34",
        "redirect.internal": "127.0.0.1",
        "media.internal": "169.254.169.254",
    }

    def resolve(host: str, port: int, *args: Any, **kwargs: Any) -> list[tuple[Any, ...]]:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (destinations[host], port))]

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    assert guarded_address(socket.AF_INET, ("instagram.example", 443)) == (
        "93.184.216.34",
        443,
    )
    for host in ("redirect.internal", "media.internal"):
        with pytest.raises(OSError, match="private"):
            guarded_address(socket.AF_INET, (host, 443))


def test_video_connect_pins_validated_ip_and_connect_ex_blocks_ipv6(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from allaroundfood.safe_ytdlp import connect_ex_guarded, connect_guarded

    seen: list[tuple[Any, ...]] = []

    def resolve(host: str, port: int, *args: Any, **kwargs: Any) -> list[tuple[Any, ...]]:
        if host == "public.example":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]
        return [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", port, 0, 0))]

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    connect_guarded(object(), ("public.example", 443), lambda sock, address: seen.append(address))
    assert seen == [("93.184.216.34", 443)]
    assert (
        connect_ex_guarded(
            object(), ("private.example", 443, 0, 0), lambda sock, address: pytest.fail("connected")
        )
        != 0
    )


def test_only_native_direct_http_media_formats_are_allowed() -> None:
    from allaroundfood.safe_ytdlp import validate_media_format

    with pytest.raises(ValueError, match="single direct HTTP"):
        validate_media_format(
            {"requested_formats": [
                {"protocol": "https", "url": "https://cdn.example/video.mp4"},
                {"protocol": "http", "url": "http://cdn.example/audio.m4a"},
            ]}
        )
    validate_media_format({"url": "https://cdn.example/video.mp4"})
    for protocol, url in (
        ("m3u8_native", "https://cdn.example/list.m3u8"),
        (None, "https://cdn.example/list.m3u8"),
        ("rtmp", "rtmp://cdn.example/live"),
        ("https", "file:///private/secret"),
    ):
        with pytest.raises(ValueError, match="direct HTTP"):
            validate_media_format({"protocol": protocol, "url": url})


def test_ytdlp_redirect_to_loopback_never_connects(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from yt_dlp.utils import DownloadError

    from allaroundfood.safe_ytdlp import main

    requested: list[str] = []

    class Redirect(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            requested.append(self.path)
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{server.server_port}/private")
            self.end_headers()

        do_HEAD = do_GET

        def log_message(self, *args: Any) -> None:
            pass

    try:
        server = HTTPServer(("127.0.0.1", 0), Redirect)
    except OSError as exc:
        if exc.errno in {errno.EPERM, errno.EACCES}:
            pytest.skip("sandbox denies loopback listeners")
        raise
    server.timeout = 2
    serving = threading.Thread(target=server.handle_request, daemon=True)
    serving.start()

    original_resolve = socket.getaddrinfo
    original_connect = socket.socket.connect

    def resolve(host: str, port: int, *args: Any, **kwargs: Any) -> list[tuple[Any, ...]]:
        if host == "public.example":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]
        return original_resolve(host, port, *args, **kwargs)

    def tunnel(sock: socket.socket, address: Any) -> None:
        if address[0] == "93.184.216.34":
            return original_connect(sock, ("127.0.0.1", server.server_port))
        return original_connect(sock, address)

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    monkeypatch.setattr(socket.socket, "connect", tunnel)
    try:
        with pytest.raises(DownloadError, match="private address"):
            main(
                [
                    "metadata",
                    str(tmp_path / "source.%(ext)s"),
                    f"http://public.example:{server.server_port}/video",
                ]
            )
        assert requested == ["/video"]
    finally:
        server.server_close()
        serving.join(timeout=2)
