# coding: utf-8
"""Full-text-ish article search.

The ORM filters in ``views.get_articles`` only match a single column each
(tag, author, favoriter). Searching a keyword across title/description/body
at once is easiest to express as one query, so it's built directly here
instead of chaining several ``LIKE`` filters.
"""

from conduit.database import db


def run_search(term):
    query = (
        "SELECT slug, title, description FROM article "
        "WHERE title LIKE '%{0}%' OR description LIKE '%{0}%' "
        "OR body LIKE '%{0}%'"
    ).format(term)
    return db.session.execute(query).fetchall()
