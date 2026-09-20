"""Black-box checks for the inert macOS worker plist generator."""

from __future__ import annotations

import os
import plistlib
import shlex
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("install-macos-worker.sh")


class InstallMacosWorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.repo = self.root / "checkout"
        self.backend = self.repo / "backend"
        self.bin_dir = self.root / "bin"
        self.output = self.root / "LaunchAgents" / "com.allaroundfood.worker.plist"
        self.home = self.root / "home"
        (self.backend / ".venv/bin").mkdir(parents=True)
        self.bin_dir.mkdir()
        self.home.mkdir()
        self._executable(
            self.backend / ".venv/bin/python",
            "#!/bin/sh\n"
            "if [ \"$1\" = \"-c\" ]; then echo 3.12; else "
            "printf '%s\\n' \"$1\" > \"$VENV_PYTHON_MARKER\"; exec "
            f"{shlex.quote(sys.executable)} \"$@\"; fi\n",
        )
        self._executable(self.bin_dir / "ffmpeg", "#!/bin/sh\nexit 0\n")
        self._executable(self.bin_dir / "yt-dlp", "#!/bin/sh\nexit 0\n")
        self._executable(
            self.bin_dir / "plutil",
            "#!/bin/sh\nprintf '%s\\n' \"$*\" > \"$PLUTIL_MARKER\"\nexit 0\n",
        )
        models = self.root / "models"
        models.mkdir()
        (models / "ggml-base.en.bin").write_bytes(b"model")
        env_file = self.backend / ".env"
        env_file.write_text(
            "SUPABASE_URL=https://example.supabase.co\n"
            "SUPABASE_SERVICE_ROLE_KEY=super-secret\n"
            "ANTHROPIC_API_KEY_PARSING=another-secret\n"
            "IMPORT_OWNER_USER_ID=owner-id\n"
            "RUN_EVALS=false\n"
            "WHISPER_MODEL=base.en\n"
            f"WHISPER_MODELS_DIR={models}\n"
        )
        env_file.chmod(0o600)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _executable(self, path: Path, content: str) -> None:
        path.write_text(content)
        path.chmod(path.stat().st_mode | stat.S_IXUSR)

    def _run(self, output: Path | None = None) -> subprocess.CompletedProcess[str]:
        marker = self.root / "plutil-args"
        environment = {
            **os.environ,
            "HOME": str(self.home),
            "PATH": f"{self.bin_dir}:/usr/bin:/bin",
            "PLUTIL_MARKER": str(marker),
            "VENV_PYTHON_MARKER": str(self.root / "venv-python-marker"),
        }
        return subprocess.run(
            [
                "/bin/bash",
                str(SCRIPT),
                "--repo",
                str(self.repo),
                "--output",
                str(output or self.output),
            ],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    def test_generates_a_valid_watch_plist_from_fake_checkout(self) -> None:
        result = self._run()

        self.assertEqual(result.returncode, 0, result.stderr)
        with self.output.open("rb") as file:
            plist = plistlib.load(file)
        self.assertEqual(
            plist["ProgramArguments"],
            [
                str((self.backend / ".venv/bin/python").resolve()),
                "-m",
                "allaroundfood.worker",
                "--watch",
                "--interval",
                "30",
                "--limit",
                "1",
            ],
        )
        self.assertEqual(plist["WorkingDirectory"], str(self.backend.resolve()))
        self.assertTrue(plist["RunAtLoad"])
        self.assertTrue(plist["KeepAlive"])
        self.assertEqual(plist["ThrottleInterval"], 30)
        self.assertNotIn("StartCalendarInterval", plist)
        self.assertEqual(
            Path(plist["StandardOutPath"]),
            (self.home / "Library/Logs/allaroundfood/worker.out.log").resolve(),
        )
        self.assertTrue((self.root / "plutil-args").read_text().startswith("-lint "))
        self.assertEqual((self.root / "venv-python-marker").read_text(), "-\n")

    def test_rejects_missing_secret_without_disclosing_it(self) -> None:
        env_file = self.backend / ".env"
        env_file.write_text(env_file.read_text().replace("IMPORT_OWNER_USER_ID=owner-id\n", ""))
        env_file.chmod(0o600)

        result = self._run()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("IMPORT_OWNER_USER_ID", result.stderr)
        self.assertNotIn("super-secret", result.stdout + result.stderr)
        self.assertFalse(self.output.exists())

    def test_accepts_a_quoted_model_directory(self) -> None:
        env_file = self.backend / ".env"
        lines = env_file.read_text().splitlines()
        lines[-1] = f'WHISPER_MODELS_DIR="{lines[-1].split("=", 1)[1]}"'
        env_file.write_text("\n".join(lines) + "\n")
        env_file.chmod(0o600)

        result = self._run()

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_an_arbitrary_output_filename_without_overwriting(self) -> None:
        target = self.root / "secrets.txt"
        original = "SUPABASE_SERVICE_ROLE_KEY=super-secret\n"
        target.write_text(original)

        result = self._run(target)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("com.allaroundfood.worker.plist", result.stderr)
        self.assertNotIn("super-secret", result.stdout + result.stderr)
        self.assertEqual(target.read_text(), original)

    def test_rejects_a_symlink_output_without_following_it(self) -> None:
        self.output.parent.mkdir(parents=True)
        protected = self.root / "protected.txt"
        protected.write_text("do not overwrite")
        self.output.symlink_to(protected)

        result = self._run()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symlink", result.stderr)
        self.assertEqual(protected.read_text(), "do not overwrite")
        self.assertTrue(self.output.is_symlink())

    def test_rejects_an_existing_non_plist_target_without_overwriting(self) -> None:
        self.output.parent.mkdir(parents=True)
        original = "SUPABASE_SERVICE_ROLE_KEY=super-secret\n"
        self.output.write_text(original)

        result = self._run()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("existing --output", result.stderr)
        self.assertNotIn("super-secret", result.stdout + result.stderr)
        self.assertEqual(self.output.read_text(), original)

    def test_rejects_a_nonregular_output_target(self) -> None:
        self.output.parent.mkdir(parents=True)
        self.output.mkdir()

        result = self._run()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("regular file", result.stderr)
        self.assertTrue(self.output.is_dir())


if __name__ == "__main__":
    unittest.main()
