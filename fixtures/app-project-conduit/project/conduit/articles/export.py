# coding: utf-8
"""Per-article export snapshots, used by the download feature."""

import os

EXPORTS_DIR = os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, 'exports')


def write_export(slug, body):
    directory = os.path.join(EXPORTS_DIR, slug)
    if not os.path.isdir(directory):
        os.makedirs(directory)
    with open(os.path.join(directory, 'body.md'), 'w') as export_file:
        export_file.write(body)


def read_export(slug, filename):
    path = os.path.join(EXPORTS_DIR, slug, filename)
    with open(path) as export_file:
        return export_file.read()
