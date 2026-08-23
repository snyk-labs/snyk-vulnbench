# coding: utf-8
"""Per-project timelog-report export snapshots, used by the CSV download
feature on the project's timelog page."""

import os

EXPORTS_DIR = os.path.join(
    os.path.dirname(__file__), os.pardir, os.pardir, 'files', 'exports')


def write_export(project_id, content):
    directory = os.path.join(EXPORTS_DIR, str(project_id))
    if not os.path.isdir(directory):
        os.makedirs(directory)
    with open(os.path.join(directory, 'timelog.csv'), 'w') as export_file:
        export_file.write(content)


def read_export(project_id, filename):
    path = os.path.join(EXPORTS_DIR, str(project_id), filename)
    with open(path) as export_file:
        return export_file.read()
