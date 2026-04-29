from urllib.parse import urlsplit

from flask import flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from app.auth import auth_bp
from app.auth.forms import LoginForm
from app.extensions import db
from app.models import User


def _safe_next_url(target: str | None) -> str | None:
    if not target:
        return None
    parts = urlsplit(target)
    # Only allow same-origin relative paths.
    if parts.scheme or parts.netloc:
        return None
    if not target.startswith("/"):
        return None
    return target


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))

    form = LoginForm()
    if form.validate_on_submit():
        user = db.session.execute(
            db.select(User).filter_by(email=form.email.data.lower().strip())
        ).scalar_one_or_none()

        if user is None or not user.check_password(form.password.data):
            flash("Invalid email or password.", "error")
            return render_template("auth/login.html", form=form), 401

        login_user(user, remember=form.remember_me.data)
        next_url = _safe_next_url(request.args.get("next"))
        return redirect(next_url or url_for("main.index"))

    return render_template("auth/login.html", form=form)


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    flash("You have been signed out.", "info")
    return redirect(url_for("auth.login"))
