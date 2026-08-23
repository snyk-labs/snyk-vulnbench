# coding: utf-8
"""Keyword search across a user's own shortened links.

LinkManager.find() only matches exact column values (see build_query_dict),
so a free-text search across long_url/description is built directly here
instead of chaining several exact-match filters.
"""

from pygmy.database.dbutil import dbconnection


class LinkSearchManager:

    @dbconnection
    def search(self, db, owner_id, term):
        query = (
            "SELECT id, long_url, short_code, description FROM link "
            "WHERE owner = {0} AND (long_url LIKE '%{1}%' OR description LIKE '%{1}%')"
        ).format(owner_id, term)
        return db.execute(query).fetchall()
