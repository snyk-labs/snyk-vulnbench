import requests


def fetch_preview(url: str) -> dict[str, str]:
    """Fetch a remote URL server-side to preview its content type and status."""
    response = requests.get(url)
    return {"status": str(response.status_code), "content_type": response.headers.get("content-type", "")}
