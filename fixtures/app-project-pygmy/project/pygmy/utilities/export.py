# coding: utf-8
"""Per-user link-list export snapshots, used by the CSV download feature."""

import os

EXPORTS_DIR = os.path.join(
    os.path.dirname(__file__), os.pardir, os.pardir, 'data', 'exports')


def write_export(owner_id, content):
    directory = os.path.join(EXPORTS_DIR, str(owner_id))
    if not os.path.isdir(directory):
        os.makedirs(directory)
    with open(os.path.join(directory, 'links.csv'), 'w') as export_file:
        export_file.write(content)


def read_export(owner_id, filename):
    path = os.path.join(EXPORTS_DIR, str(owner_id), filename)
    with open(path) as export_file:
        return export_file.read()
