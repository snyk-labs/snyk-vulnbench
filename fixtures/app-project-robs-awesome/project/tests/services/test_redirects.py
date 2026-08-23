from backend.services.redirects import build_redirect


def test_build_redirect_targets_given_url():
    response = build_redirect("/dashboard")
    assert response.status_code == 307
    assert response.headers["location"] == "/dashboard"
