"""add slot_bookings table and slot locking columns

Revision ID: 20260614_0018
Revises: 20260614_0017
Create Date: 2026-06-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20260614_0018"
down_revision = "20260614_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add locking columns to slots
    op.add_column("slots", sa.Column("is_locked", sa.Boolean(), nullable=True, server_default=sa.text("0")))
    op.add_column("slots", sa.Column("locked_by", sa.String(), nullable=True))
    op.add_column("slots", sa.Column("locked_at", sa.DateTime(), nullable=True))
    op.add_column("slots", sa.Column("congestion_level", sa.Float(), nullable=True, server_default=sa.text("0")))

    # Create slot_bookings table
    op.create_table(
        "slot_bookings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slot_id", sa.Integer(), sa.ForeignKey("slots.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=True),
        sa.Column("status", sa.Enum("confirmed", "cancelled", name="bookingstatus"), nullable=False, server_default="confirmed"),
        sa.Column("booked_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
    )

    op.create_index("ix_slot_bookings_slot_id", "slot_bookings", ["slot_id"])
    op.create_index("ix_slot_bookings_user_id", "slot_bookings", ["user_id"])
    op.create_index("ix_slot_bookings_status", "slot_bookings", ["status"])


def downgrade() -> None:
    op.drop_index("ix_slot_bookings_status")
    op.drop_index("ix_slot_bookings_user_id")
    op.drop_index("ix_slot_bookings_slot_id")
    op.drop_table("slot_bookings")

    op.drop_column("slots", "congestion_level")
    op.drop_column("slots", "locked_at")
    op.drop_column("slots", "locked_by")
    op.drop_column("slots", "is_locked")
