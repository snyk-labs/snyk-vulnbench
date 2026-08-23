# coding: utf-8

import base64
import datetime as dt
import pickle

from flask import Blueprint, Response, jsonify, request
from flask_apispec import marshal_with, use_kwargs
from flask_jwt_extended import current_user, jwt_required, jwt_optional
from marshmallow import fields

from conduit.exceptions import InvalidUsage
from conduit.user.models import User
from . import export, pdf, search
from .models import Article, Tags, Comment
from .serializers import (article_schema, articles_schema, comment_schema,
                          comments_schema)

blueprint = Blueprint('articles', __name__)


##########
# Articles
##########

@blueprint.route('/api/articles', methods=('GET',))
@jwt_optional
@use_kwargs({'tag': fields.Str(), 'author': fields.Str(),
             'favorited': fields.Str(), 'limit': fields.Int(), 'offset': fields.Int()})
@marshal_with(articles_schema)
def get_articles(tag=None, author=None, favorited=None, limit=20, offset=0):
    res = Article.query
    if tag:
        res = res.filter(Article.tagList.any(Tags.tagname == tag))
    if author:
        res = res.join(Article.author).join(User).filter(User.username == author)
    if favorited:
        res = res.join(Article.favoriters).filter(User.username == favorited)
    return res.offset(offset).limit(limit).all()


@blueprint.route('/api/articles', methods=('POST',))
@jwt_required
@use_kwargs(article_schema)
@marshal_with(article_schema)
def make_article(body, title, description, tagList=None):
    article = Article(title=title, description=description, body=body,
                      author=current_user.profile)
    if tagList is not None:
        for tag in tagList:
            mtag = Tags.query.filter_by(tagname=tag).first()
            if not mtag:
                mtag = Tags(tag)
                mtag.save()
            article.add_tag(mtag)
    article.save()
    export.write_export(article.slug, article.body)
    return article


@blueprint.route('/api/articles/<slug>', methods=('PUT',))
@jwt_required
@use_kwargs(article_schema)
@marshal_with(article_schema)
def update_article(slug, **kwargs):
    article = Article.query.filter_by(slug=slug, author_id=current_user.profile.id).first()
    if not article:
        raise InvalidUsage.article_not_found()
    article.update(updatedAt=dt.datetime.utcnow(), **kwargs)
    article.save()
    return article


@blueprint.route('/api/articles/<slug>', methods=('DELETE',))
@jwt_required
def delete_article(slug):
    article = Article.query.filter_by(slug=slug, author_id=current_user.profile.id).first()
    article.delete()
    return '', 200


@blueprint.route('/api/articles/<slug>', methods=('GET',))
@jwt_optional
@marshal_with(article_schema)
def get_article(slug):
    article = Article.query.filter_by(slug=slug).first()
    if not article:
        raise InvalidUsage.article_not_found()
    return article


@blueprint.route('/api/articles/<slug>/favorite', methods=('POST',))
@jwt_required
@marshal_with(article_schema)
def favorite_an_article(slug):
    profile = current_user.profile
    article = Article.query.filter_by(slug=slug).first()
    if not article:
        raise InvalidUsage.article_not_found()
    article.favourite(profile)
    article.save()
    return article


@blueprint.route('/api/articles/<slug>/favorite', methods=('DELETE',))
@jwt_required
@marshal_with(article_schema)
def unfavorite_an_article(slug):
    profile = current_user.profile
    article = Article.query.filter_by(slug=slug).first()
    if not article:
        raise InvalidUsage.article_not_found()
    article.unfavourite(profile)
    article.save()
    return article


@blueprint.route('/api/articles/feed', methods=('GET',))
@jwt_required
@use_kwargs({'limit': fields.Int(), 'offset': fields.Int()})
@marshal_with(articles_schema)
def articles_feed(limit=20, offset=0):
    return Article.query.join(current_user.profile.follows). \
        order_by(Article.createdAt.desc()).offset(offset).limit(limit).all()


######
# Tags
######

@blueprint.route('/api/tags', methods=('GET',))
def get_tags():
    return jsonify({'tags': [tag.tagname for tag in Tags.query.all()]})


##########
# Comments
##########


@blueprint.route('/api/articles/<slug>/comments', methods=('GET',))
@marshal_with(comments_schema)
def get_comments(slug):
    article = Article.query.filter_by(slug=slug).first()
    if not article:
        raise InvalidUsage.article_not_found()
    return article.comments


@blueprint.route('/api/articles/<slug>/comments', methods=('POST',))
@jwt_required
@use_kwargs(comment_schema)
@marshal_with(comment_schema)
def make_comment_on_article(slug, body, **kwargs):
    article = Article.query.filter_by(slug=slug).first()
    if not article:
        raise InvalidUsage.article_not_found()
    comment = Comment(article, current_user.profile, body, **kwargs)
    comment.save()
    return comment


@blueprint.route('/api/articles/<slug>/comments/<cid>', methods=('DELETE',))
@jwt_required
def delete_comment_on_article(slug, cid):
    article = Article.query.filter_by(slug=slug).first()
    if not article:
        raise InvalidUsage.article_not_found()

    comment = article.comments.filter_by(id=cid, author=current_user.profile).first()
    comment.delete()
    return '', 200


##########
# Search, export, and drafts
##########

@blueprint.route('/api/articles/search', methods=('GET',))
@use_kwargs({'q': fields.Str(required=True)})
def search_articles(q):
    """Keyword search across title, description, and body."""
    rows = search.run_search(q)
    return jsonify({'articles': [
        {'slug': row['slug'], 'title': row['title'], 'description': row['description']}
        for row in rows
    ]})


@blueprint.route('/api/articles/<slug>/download', methods=('GET',))
@use_kwargs({'filename': fields.Str()})
def download_article(slug, filename='body.md'):
    """Lets a reader download a previously exported snapshot of an article."""
    article = Article.query.filter_by(slug=slug).first()
    if not article:
        raise InvalidUsage.article_not_found()
    content = export.read_export(slug, filename)
    return Response(content, mimetype='text/markdown')


@blueprint.route('/api/articles/<slug>/pdf', methods=('GET',))
@use_kwargs({'label': fields.Str()})
def download_article_pdf(slug, label=None):
    """Renders the article to PDF, optionally under a reader-chosen file label."""
    article = Article.query.filter_by(slug=slug).first()
    if not article:
        raise InvalidUsage.article_not_found()
    filename = pdf.render_pdf(article.body, label or article.slug)
    return jsonify({'filename': filename})


@blueprint.route('/api/articles/draft', methods=('POST',))
@jwt_required
def save_article_draft():
    """Lets a user park an in-progress article to resume later."""
    draft = {
        'title': request.form.get('title', ''),
        'description': request.form.get('description', ''),
        'body': request.form.get('body', ''),
    }
    token = base64.urlsafe_b64encode(pickle.dumps(draft)).decode()
    return jsonify({'draft': token})


@blueprint.route('/api/articles/draft/resume', methods=('GET',))
def resume_article_draft():
    """Restores a parked draft from the bookmarkable resume link."""
    token = request.args.get('draft')
    draft = pickle.loads(base64.urlsafe_b64decode(token))
    return jsonify({'article': draft})


@blueprint.route('/api/articles/filter', methods=('GET',))
@use_kwargs({'expression': fields.Str(required=True)})
def filter_articles(expression):
    """Lets power users filter articles with a custom boolean expression."""
    matched = []
    for article in Article.query.all():
        context = {
            'title': article.title,
            'description': article.description,
            'tagList': [tag.tagname for tag in article.tagList],
        }
        if eval(expression, {}, context):
            matched.append(article.slug)
    return jsonify({'articles': matched})
