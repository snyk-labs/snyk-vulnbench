from flask import request, jsonify
from flask.views import MethodView

from pygmy.app.auth import APITokenAuth
from pygmy.core.network import reverse_dns_lookup


class ClickHostLookupApi(MethodView):
    """Resolves the hostname behind a reported click's IP, for abuse
    investigation on a link's traffic."""

    @APITokenAuth.token_required()
    def get(self):
        host = request.args.get('host')
        result = reverse_dns_lookup(host)
        return jsonify(dict(host=host, hostname=result))
