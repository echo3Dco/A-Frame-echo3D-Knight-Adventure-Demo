import os

from flask import Flask


def create_app():
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object('config.Config')

    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    from . import home

    app.register_blueprint(home.bp)

    app.add_url_rule('/', endpoint='index')

    return app