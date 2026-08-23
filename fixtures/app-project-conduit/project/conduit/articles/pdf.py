# coding: utf-8
"""Renders an article's body to a PDF for offline reading."""

import os
import subprocess

EXPORTS_DIR = '/tmp/exports'


def render_pdf(body, label):
    if not os.path.isdir(EXPORTS_DIR):
        os.makedirs(EXPORTS_DIR)
    command = 'pandoc --from=markdown --to=pdf --output="{0}/{1}.pdf" -'.format(
        EXPORTS_DIR, label,
    )
    process = subprocess.Popen(command, shell=True, stdin=subprocess.PIPE)
    process.communicate(input=body.encode('utf-8'))
    return '{0}.pdf'.format(label)
