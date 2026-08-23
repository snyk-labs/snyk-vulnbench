# coding: utf-8
"""Keyword search across a project's issues.

The advanced search DSL (see the search app) requires building a persisted,
named query first. This is a lightweight, ad-hoc keyword search meant for
quickly jumping to an issue by title/description, built directly against the
issue table instead of going through the DSL.
"""

from django.db import connection


def search_issues(project_id, term):
    query = (
        "SELECT id, number, title FROM issue_issue "
        "WHERE project_id = {0} AND (title LIKE '%{1}%' OR description LIKE '%{1}%')"
    ).format(project_id, term)
    with connection.cursor() as cursor:
        cursor.execute(query)
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
