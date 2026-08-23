from fastapi.responses import RedirectResponse


def build_redirect(target: str) -> RedirectResponse:
    """Build a redirect response to the given target."""
    return RedirectResponse(target)
