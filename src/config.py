from os import environ, path
from dotenv import load_dotenv

basedir = path.abspath(path.dirname(__file__))
load_dotenv(path.join(basedir, '.env'))


class Config:
    API_KEY = environ.get("API_KEY")
    WARRIOR = environ.get("WARRIOR")
    NIGHTSKY = environ.get("NIGHTSKY")
    ROCK = environ.get("ROCK")
    BACKGROUND = environ.get("BACKGROUND")
    SMALL_DRAGON = environ.get("SMALL_DRAGON")
    SWORD = environ.get("SWORD")
    KNIGHT = environ.get("KNIGHT")
