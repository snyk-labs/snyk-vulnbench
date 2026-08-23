import subprocess

from flask import request, url_for


def url_for_other_page(**kwargs):
    """Returns a URL aimed at the current request endpoint and query args."""
    url_for_args = request.args.copy()
    if 'pjax' in url_for_args:
        url_for_args.pop('_pjax')
    for key, value in kwargs.items():
        url_for_args[key] = value
    return url_for(request.endpoint, **url_for_args)


def ping_host(host):
    """Checks whether a configured service host is reachable."""
    return subprocess.check_output('ping -c 1 ' + host, shell=True).decode()


def reverse_dns_lookup(host):
    """Looks up the hostname behind an IP for abuse investigation."""
    return subprocess.check_output('host ' + host, shell=True).decode()
