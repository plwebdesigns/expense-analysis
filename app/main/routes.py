from flask import render_template
from flask_login import login_required

from app.main import main_bp


@main_bp.route("/")
@login_required
def index():
    return render_template("main/index.html")

@main_bp.route("/parser")
@login_required
def parser():
    return render_template("main/parser.html")