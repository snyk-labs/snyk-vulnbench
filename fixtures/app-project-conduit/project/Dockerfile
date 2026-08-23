FROM python:3.7-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/www/conduit
WORKDIR /var/www/conduit

ADD requirements /var/www/conduit/requirements
ADD requirements.txt /var/www/conduit/
# Old (2018-era) packages such as MarkupSafe 1.0 use setup.py's removed
# `Feature` API — pin an era-appropriate setuptools before installing them.
RUN pip install --no-cache-dir "setuptools==44.1.1" "wheel==0.34.2"
RUN pip install --no-cache-dir -r requirements/locked.txt

ADD . /var/www/conduit
