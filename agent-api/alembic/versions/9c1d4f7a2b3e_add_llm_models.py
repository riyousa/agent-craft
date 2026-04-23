"""add llm_models

Revision ID: 9c1d4f7a2b3e
Revises: 7ed62337ffeb
Create Date: 2026-04-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9c1d4f7a2b3e'
down_revision: Union[str, Sequence[str], None] = '7ed62337ffeb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'llm_models',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('display_name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), server_default=''),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('model', sa.String(length=200), nullable=False),
        sa.Column('api_key', sa.Text(), server_default=''),
        sa.Column('base_url', sa.String(length=500), server_default=''),
        sa.Column('extra_config', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('visible_to_users', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('name', name='uq_llm_models_name'),
    )
    op.create_index('ix_llm_models_name', 'llm_models', ['name'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_llm_models_name', table_name='llm_models')
    op.drop_table('llm_models')
