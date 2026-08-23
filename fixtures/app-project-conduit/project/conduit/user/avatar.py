# coding: utf-8
"""Validates a submitted avatar link before it's saved on the profile."""

import requests


def is_reachable_image(url):
    response = requests.get(url, timeout=5)
    return response.headers.get('Content-Type', '').startswith('image/')
