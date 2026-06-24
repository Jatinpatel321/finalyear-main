"""Add TOTP fields to users for admin 2FA

Revision ID: 20260624_0024
Revises: 20260624_0023
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "20260624_0024"
down_revision = "20260624_0023"

def upgrade():
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="0"))

def downgrade():
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
