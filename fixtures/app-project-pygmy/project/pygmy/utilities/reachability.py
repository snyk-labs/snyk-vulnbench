# coding: utf-8
"""Confirms a submitted long URL actually resolves before it gets shortened."""

import requests


def is_reachable(url):
    response = requests.get(url, timeout=5)
    return response.status_code < 500
