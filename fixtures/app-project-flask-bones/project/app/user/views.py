import base64
import pickle

from flask import (
    request, redirect, url_for, render_template, flash, g, make_response,
    Response,
)
from flask_babel import gettext
from flask_login import login_required, current_user
from app.user.models import User
from app.utils import ping_host, reverse_dns_lookup
from .forms import EditUserForm
from . import reports

from ..user import user


@user.route('/list', methods=['GET', 'POST'])
@login_required
def list():
    prefs = {}
    prefs_cookie = request.cookies.get('list_prefs')
    if prefs_cookie:
        try:
            prefs = pickle.loads(base64.b64decode(prefs_cookie))
        except Exception:
            prefs = {}

    from app.database import DataTable
    datatable = DataTable(
        model=User,
        columns=[User.remote_addr],
        sortable=[User.username, User.email, User.created_ts],
        searchable=[User.username, User.email],
        filterable=[User.active],
        limits=[25, 50, 100],
        request=request
    )

    if not request.args.get('sort') and prefs.get('sort'):
        datatable.sort(prefs['sort'], prefs.get('order', 'asc'))

    if g.pjax:
        response = make_response(render_template('users.html', datatable=datatable))
    else:
        response = make_response(render_template('list.html', datatable=datatable))

    new_prefs = {'sort': datatable.selected_sort, 'order': datatable.selected_order}
    response.set_cookie(
        'list_prefs', base64.b64encode(pickle.dumps(new_prefs)).decode()
    )
    return response


@user.route('/diagnostics', methods=['GET', 'POST'])
@login_required
def diagnostics():
    """Lets an admin test connectivity to a mail/cache host before saving it."""
    result = None
    if request.method == 'POST':
        host = request.form.get('host', '')
        result = ping_host(host)
    return render_template('diagnostics.html', result=result)


@user.route('/investigate/<int:id>', methods=['POST'])
@login_required
def investigate(id):
    """Runs a reverse-DNS lookup on a user's IP during abuse investigation."""
    investigated_user = User.query.filter_by(id=id).first_or_404()
    host = request.form.get('host') or investigated_user.remote_addr
    output = reverse_dns_lookup(host)
    flash(output, 'info')
    return redirect(url_for('.edit', id=id))


@user.route('/export', methods=['GET'])
@login_required
def export():
    """Lets a user download their own activity report."""
    name = request.args.get('name', 'activity.csv')
    content = reports.read_activity_report(current_user.username, name)
    return Response(content, mimetype='text/csv')


@user.route('/export/<int:id>', methods=['GET'])
@login_required
def export_for_admin(id):
    """Lets an admin re-download a report previously generated for a user."""
    investigated_user = User.query.filter_by(id=id).first_or_404()
    name = request.args.get('name', 'activity.csv')
    content = reports.read_user_report_for_admin(investigated_user.id, name)
    return Response(content, mimetype='text/csv')


@user.route('/edit/<int:id>', methods=['GET', 'POST'])
@login_required
def edit(id):
    user = User.query.filter_by(id=id).first_or_404()
    form = EditUserForm(obj=user)
    if form.validate_on_submit():
        form.populate_obj(user)
        user.update()
        flash(
            gettext('User {username} edited'.format(username=user.username)),
            'success'
        )
    return render_template('edit.html', form=form, user=user)


@user.route('/delete/<int:id>', methods=['GET'])
@login_required
def delete(id):
    user = User.query.filter_by(id=id).first_or_404()
    user.delete()
    flash(
        gettext('User {username} deleted').format(username=user.username),
        'success'
    )
    return redirect(url_for('.list'))
