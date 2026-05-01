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
        
    @users.command("list")
    def list_users() -> None:
        """List all users."""
        users = db.session.execute(db.select(User)).scalars().all()
        click.echo("Users:")
        for user in users:
            click.echo(f" - {user.email} (id={user.id})")
            
    @users.command("delete")
    @click.argument("email")
    def delete_user(email: str) -> None:
        """Delete a user with EMAIL."""
        user = db.session.execute(db.select(User).filter_by(email=email)).scalar_one_or_none()
        if user is None:
            click.echo(f"User {email} not found.", err=True)
            raise click.exceptions.Exit(1)
        db.session.delete(user)
        db.session.commit()
        click.echo(f"Deleted user {email} (id={user.id}).")

    app.cli.add_command(users)
