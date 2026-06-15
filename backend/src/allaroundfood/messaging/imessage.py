"""Send a message through Apple Messages via ``osascript`` (macOS only).

The recipient and body are passed as ``on run argv`` arguments to AppleScript,
never interpolated into the script source, so user-supplied text cannot break
out of the string context or inject shell/AppleScript commands.
"""

from __future__ import annotations

import platform
import subprocess  # noqa: S404 - invoked without a shell, args are list-form.

# AppleScript reads recipient/body from argv so no untrusted text is templated
# into the source. Sends as iMessage when possible, falling back to SMS.
_APPLESCRIPT = """
on run argv
    set recipientNumber to item 1 of argv
    set messageBody to item 2 of argv
    tell application "Messages"
        try
            set targetService to 1st account whose service type = iMessage
            set targetBuddy to participant recipientNumber of targetService
            send messageBody to targetBuddy
        on error
            set smsService to 1st account whose service type = SMS
            set targetBuddy to participant recipientNumber of smsService
            send messageBody to targetBuddy
        end try
    end tell
end run
"""

_TIMEOUT_SECONDS = 30


class MessagingError(RuntimeError):
    """Raised when a message cannot be sent (wrong platform or osascript error)."""


def send_imessage(recipient: str, body: str) -> None:
    """Send ``body`` to ``recipient`` through Apple Messages.

    Args:
        recipient: A normalized phone number (see ``messaging.phone``).
        body: The message text.

    Raises:
        MessagingError: If not running on macOS, or ``osascript`` fails.
    """
    if platform.system() != "Darwin":
        raise MessagingError(
            "Texting only works when the app runs on a signed-in Mac."
        )

    try:
        result = subprocess.run(  # noqa: S603 - fixed binary, list args, no shell.
            ["osascript", "-e", _APPLESCRIPT, recipient, body],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError as exc:  # osascript missing — not a Mac with it.
        raise MessagingError(
            "Texting only works when the app runs on a signed-in Mac."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise MessagingError("Timed out talking to Messages.app.") from exc

    if result.returncode != 0:
        detail = result.stderr.strip() or "unknown error"
        raise MessagingError(f"Messages.app could not send the text: {detail}")
