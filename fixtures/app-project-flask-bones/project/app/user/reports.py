import os

REPORTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'reports')


def read_activity_report(username, name):
    """Reads a self-service activity export for the current user."""
    path = os.path.join(REPORTS_DIR, username, name)
    with open(path) as report_file:
        return report_file.read()


def read_user_report_for_admin(user_id, name):
    """Reads a previously generated export for a user under investigation."""
    path = os.path.join(REPORTS_DIR, str(user_id), name)
    with open(path) as report_file:
        return report_file.read()
