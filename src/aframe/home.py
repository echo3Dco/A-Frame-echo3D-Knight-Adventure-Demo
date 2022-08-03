from distutils.command.config import config
from flask import (
    Blueprint, flash, g, redirect, render_template, request, url_for, current_app
)
from random import randint

bp = Blueprint('home', __name__)


@bp.route('/')
def index():
    return render_template('index.html', 
        API_KEY=current_app.config["API_KEY"],
        BACKGROUND=current_app.config["BACKGROUND"])

@bp.route('/game')
def game():
    random_position_list = []
    i = 0
    while i < 25:
        x = randint(-15, 15)
        y = 1
        z = randint(5, 60) * -1
        random_position = str(x) + " " + str(y) + " " + str(z)
        random_position_list.append(random_position)
        i += 1

    game_health = 5

    return render_template('game.html', 
        API_KEY=current_app.config["API_KEY"],
        WARRIOR=current_app.config["WARRIOR"],
        NIGHTSKY=current_app.config["NIGHTSKY"],
        ROCK=current_app.config["ROCK"],
        random_position_list=random_position_list,
        game_health=game_health,
        SMALL_DRAGON=current_app.config["SMALL_DRAGON"],
        SWORD=current_app.config["SWORD"],
        KNIGHT=current_app.config["KNIGHT"])

@bp.route('/gameover')
def gameover():
    return render_template('gameover.html', 
        API_KEY=current_app.config["API_KEY"],
        BACKGROUND=current_app.config["BACKGROUND"])
