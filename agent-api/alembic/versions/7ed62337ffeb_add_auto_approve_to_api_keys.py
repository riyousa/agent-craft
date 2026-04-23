"""add auto_approve to api_keys

Revision ID: 7ed62337ffeb
Revises: 8f92617d07be
Create Date: 2026-04-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7ed62337ffeb'
down_revision: Union[str, Sequence[str], None] = '8f92617d07be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('api_keys', sa.Column('auto_approve', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    op.drop_column('api_keys', 'auto_approve')
