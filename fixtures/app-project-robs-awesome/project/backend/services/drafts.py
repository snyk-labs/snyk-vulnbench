import base64
import pickle
from typing import Any


def restore_draft(state: str) -> Any:
    """Restore a report draft from a portable state token saved on another device."""
    return pickle.loads(base64.b64decode(state))
