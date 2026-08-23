from flask import request, jsonify, Response
from flask.views import MethodView
from passlib.hash import bcrypt

from pygmy.model import UserManager, LinkManager
from pygmy.model.search import LinkSearchManager
from pygmy.utilities import export
from pygmy.validator.user import UserSchema
from pygmy.validator.link import LinkSchema, ValidationError
from pygmy.app.auth import APITokenAuth, TokenAuth


class UserApi(MethodView):
    """Signup and get user info"""
    schema = UserSchema()

    def get(self, user_id=None):
        params = dict()
        if user_id is not None:
            user = UserManager().get(user_id)
        elif request.args.get('email'):
            params['email'] = request.args.get('email')
            user = UserManager().find(**params)
        if user is None:
            return jsonify(dict(error="User not found")), 404
        result = self.schema.dump(user)
        return jsonify(result), 200

    def post(self):
        # TODO: post should behave like upsert
        manager = UserManager()
        payload = request.get_json()
        try:
            data = self.schema.load(payload)
        except ValidationError as errors:
            log.error('Error in the request payload %s', errors)
            err_msg = errors.messages_dict
            return jsonify(err_msg), 400

        if manager.find(email=data['email']):
            return jsonify(dict(error='User exists')), 400
        user = manager.add(**data)
        result = self.schema.dump(user)
        tokens = TokenAuth().create_token(
            identity=payload.get('email'))
        result.update(tokens)
        return jsonify(result), 201


class Auth(MethodView):
    """User login class."""
    schema = UserSchema()

    def post(self):
        params = request.get_json()
        email = params.get('email')
        password = params.get('password')
        if not email:
            return jsonify(dict(error="Missing email required.")), 400
        if not password:
            return jsonify(dict(error="Missing password required.")), 400

        user = UserManager().find(email=email)
        if user is None:
            return jsonify(dict(
                error='No user found with email: {}'.format(email))), 404
        if email != user.email or not bcrypt.verify(password, user.password):
            return jsonify(dict(error="Invalid username or password.")), 400
        result = self.schema.dump(user)
        tokens = TokenAuth().create_token(identity=email)
        result.update(tokens)
        return jsonify(result), 200


@APITokenAuth.token_required()
def get_links(user_id=None):
    """Get all links that belong to user `user_id`"""
    # TODO: get auth required from settings and get user links by id

    manager = LinkManager()
    schema = LinkSchema()
    if request.method == 'GET':
        user_email = APITokenAuth.get_jwt_identity()
        if not user_email:
            return jsonify(dict(error='Invalid/expired token passed')), 400
        user = UserManager().get_by_email(email=user_email)
        if not user:
            return jsonify(dict(error='Invalid/expired token passed')), 400
        links = manager.get_by_owner(owner_id=user.id)
        if not links:
            return jsonify([]), 200
        result = schema.dump(links, many=True)
        csv_content = '\n'.join(
            '{},{}'.format(link['long_url'], link['short_code'])
            for link in result)
        export.write_export(user.id, csv_content)
        return jsonify(result)


def _authenticated_owner():
    user_email = APITokenAuth.get_jwt_identity()
    if not user_email:
        return None
    return UserManager().get_by_email(email=user_email)


@APITokenAuth.token_required()
def search_links():
    """Search the authenticated user's own links by keyword."""
    user = _authenticated_owner()
    if not user:
        return jsonify(dict(error='Invalid/expired token passed')), 400
    term = request.args.get('q', '')
    rows = LinkSearchManager().search(user.id, term)
    return jsonify([
        dict(id=row['id'], long_url=row['long_url'],
             short_code=row['short_code']) for row in rows])


@APITokenAuth.token_required()
def filter_links():
    """Lets power users filter their own links with a custom boolean
    expression, e.g. `?expression=is_custom`."""
    user = _authenticated_owner()
    if not user:
        return jsonify(dict(error='Invalid/expired token passed')), 400
    expr = request.args.get('expression', '')
    manager = LinkManager()
    matched = []
    for link in manager.get_by_owner(owner_id=user.id):
        context = dict(
            long_url=link.long_url,
            description=link.description or '',
            is_custom=link.is_custom)
        if eval(expr, {}, context):
            matched.append(link.short_code)
    return jsonify(dict(links=matched))


@APITokenAuth.token_required()
def download_links_export():
    """Downloads a previously generated CSV snapshot of the user's links."""
    user = _authenticated_owner()
    if not user:
        return jsonify(dict(error='Invalid/expired token passed')), 400
    filename = request.args.get('filename', 'links.csv')
    content = export.read_export(user.id, filename)
    return Response(content, mimetype='text/csv')
