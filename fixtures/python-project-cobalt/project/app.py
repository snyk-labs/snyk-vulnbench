import os
import pickle
import sqlite3
from flask import Flask, request, jsonify, send_file

SECRET_KEY = "my_super_secret_jwt_key_do_not_share"

app = Flask(__name__)
app.secret_key = SECRET_KEY


def get_db():
    return sqlite3.connect("users.db")


@app.route("/users")
def get_users():
    username = request.args.get("username", "")
    query = "SELECT * FROM users WHERE username = '%s'" % username
    conn = get_db()
    cursor = conn.execute(query)
    rows = cursor.fetchall()
    return jsonify(rows)


@app.route("/ping")
def ping():
    host = request.args.get("host", "")
    output = os.popen("ping -c 1 " + host).read()
    return f"<pre>{output}</pre>"


@app.route("/download")
def download():
    filename = request.args.get("filename", "")
    base_dir = "/var/app/files/"
    filepath = base_dir + filename
    with open(filepath, "r") as f:
        return f.read()


@app.route("/load", methods=["POST"])
def load_object():
    data = request.get_data()
    obj = pickle.loads(data)
    return jsonify({"result": str(obj)})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
