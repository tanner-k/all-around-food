"""Contract checks for token-checked import RPC wrappers."""

from types import SimpleNamespace
from unittest.mock import Mock

from allaroundfood.models import Recipe
from allaroundfood.supabase_client import (
    claim_pending_jobs,
    cleanup_import_jobs,
    download_import,
    fail_import_job,
    finish_import_job,
    renew_import_job,
)


def fake_client() -> Mock:
    client = Mock()
    client.rpc.return_value.execute.return_value = SimpleNamespace(data=[])
    return client


def test_claim_uses_service_only_rpc() -> None:
    client = fake_client()
    claim_pending_jobs(client, 1, 3)
    client.rpc.assert_called_once_with("claim_parse_jobs", {"p_limit": 1})


def test_claim_fetches_each_job_in_its_own_atomic_rpc() -> None:
    client = fake_client()
    client.rpc.return_value.execute.side_effect = [
        SimpleNamespace(data=[{"id": "one"}]),
        SimpleNamespace(data=[{"id": "two"}]),
    ]
    assert [row["id"] for row in claim_pending_jobs(client, 2, 3)] == ["one", "two"]
    assert client.rpc.call_count == 2


def test_finish_publishes_validated_draft_with_job_id() -> None:
    client = fake_client()
    recipe = Recipe(
        id="worker-id", title="Toast",
        ingredients=[{"name": "bread", "quantity": {"as_written": "1 slice"}}],
        steps=[{"order": 1, "instruction": "Toast."}],
    )
    finish_import_job(client, "job-id", "claim-token", recipe, ["caption only"])
    name, payload = client.rpc.call_args.args
    assert name == "finish_import_job"
    assert payload["p_id"] == "job-id"
    assert payload["p_claim_token"] == "claim-token"
    assert payload["p_recipe"]["id"] == "job-id"
    assert payload["p_warnings"] == ["caption only"]
    client.table.assert_not_called()


def test_failure_and_renewal_carry_claim_token() -> None:
    client = fake_client()
    fail_import_job(client, "job-id", "claim-token", "failed")
    renew_import_job(client, "job-id", "claim-token")
    assert client.rpc.call_args_list[0].args == (
        "fail_import_job",
        {"p_id": "job-id", "p_claim_token": "claim-token", "p_message": "failed"},
    )
    assert client.rpc.call_args_list[1].args == (
        "renew_import_job", {"p_id": "job-id", "p_claim_token": "claim-token"},
    )


def test_cleanup_deletes_storage_before_forgetting_path() -> None:
    client = fake_client()
    client.rpc.return_value.execute.side_effect = [
        SimpleNamespace(data=[{"job_id": "job-id", "storage_path": "owner/image.png"}]),
        SimpleNamespace(data=[]),
        SimpleNamespace(data=None),
    ]
    cleanup_import_jobs(client)
    client.storage.from_.return_value.remove.assert_called_once_with(["owner/image.png"])
    assert client.rpc.call_args_list[-1].args == (
        "forget_import_storage", {"p_id": "job-id", "p_path": "owner/image.png"},
    )


def test_download_rejects_oversized_or_wrong_media() -> None:
    client = fake_client()
    path = "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"
    client.storage.from_.return_value.download.return_value = b"wrong media"
    try:
        download_import(client, path, "11111111-1111-4111-8111-111111111111")
    except ValueError as exc:
        assert "media" in str(exc)
    else:
        raise AssertionError("non-image accepted")

    client.storage.from_.return_value.download.return_value = (
        b"\x89PNG\r\n\x1a\n" + b"x" * (10 * 1024 * 1024)
    )
    try:
        download_import(client, path, "11111111-1111-4111-8111-111111111111")
    except ValueError as exc:
        assert "10 MB" in str(exc)
    else:
        raise AssertionError("oversized image accepted")
