import base64
import pickle

from backend.services.drafts import restore_draft


def test_restore_draft_round_trips_a_dict():
    state = base64.b64encode(pickle.dumps({"title": "Draft", "content": "In progress"})).decode()
    assert restore_draft(state) == {"title": "Draft", "content": "In progress"}
