"""Deletion and indexing must share the same per-project claim."""

from contextlib import contextmanager

import pytest
from fastapi import HTTPException

from graph_rag import api


def test_delete_holds_claim_until_storage_finishes(monkeypatch):
    project_id = "review-delete-claim"

    class Store:
        def delete_project(self):
            assert not api._claim(project_id)
            return 3

    @contextmanager
    def open_store(_project_id):
        yield Store()

    monkeypatch.setattr(api, "open_store", open_store)
    assert api.delete_project(project_id) == {"removed": 3}
    assert api._claim(project_id)
    api._release(project_id)


def test_delete_releases_claim_when_storage_fails(monkeypatch):
    project_id = "review-delete-failure"

    def open_store(_project_id):
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(api, "open_store", open_store)
    with pytest.raises(RuntimeError, match="storage unavailable"):
        api.delete_project(project_id)
    assert api._claim(project_id)
    api._release(project_id)


def test_delete_refuses_an_active_index():
    project_id = "review-delete-busy"
    assert api._claim(project_id)
    try:
        with pytest.raises(HTTPException) as error:
            api.delete_project(project_id)
        assert error.value.status_code == 409
    finally:
        api._release(project_id)
