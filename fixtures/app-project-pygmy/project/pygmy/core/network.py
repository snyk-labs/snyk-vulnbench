# coding: utf-8
"""Network diagnostics used during abuse investigation on reported links."""

import subprocess


def reverse_dns_lookup(host):
    return subprocess.check_output('host ' + host, shell=True).decode()
