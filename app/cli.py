import click
from flask import Flask
from flask.cli import AppGroup

from app.extensions import db
from app.models import User


def register_cli(app: Flask) -> None:
    @app.cli.command("init-db")
    def init_db() -> None:
        """Create all database tables."""
        db.create_all()
        click.echo("Database initialized.")

    users = AppGroup("users", help="Manage user accounts.")

    @users.command("create")
    @click.argument("email")
    @click.password_option()
    def create_user(email: str, password: str) -> None:
        """Create a new user with EMAIL and a prompted password."""
        if db.session.execute(
            db.select(User).filter_by(email=email)
        ).scalar_one_or_none():
            click.echo(f"User {email} already exists.", err=True)
            raise click.exceptions.Exit(1)

        user = User(email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        click.echo(f"Created user {email} (id={user.id}).")

    app.cli.add_command(users)
