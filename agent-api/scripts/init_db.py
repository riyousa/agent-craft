"""Initialize database with sample data.

This script creates all tables and seeds demo data. It's idempotent:
running it multiple times won't duplicate records (checks for existence
before inserting). Keep this in sync whenever a model gains new columns.
"""
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import asyncio
from sqlalchemy import select
from src.db import init_db, AsyncSessionLocal  # type: ignore
from src.models import User, AdminSkill, AdminTool
from src.utils.auth import get_password_hash


async def create_sample_users():
    """Create sample users with all current model fields."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.phone == "13800138000"))
        if result.scalar_one_or_none():
            print("Sample users already exist")
            return

        users = [
            User(
                feishu_open_id="ou_test123",
                name="张三",
                phone="13800138000",
                password_hash=get_password_hash("123456"),
                email="zhangsan@example.com",
                role_level=1,
                is_active=True,
                tags=["研发"],
            ),
            User(
                feishu_open_id="ou_admin456",
                name="李四",
                phone="13800138001",
                password_hash=get_password_hash("123456"),
                email="lisi@example.com",
                role_level=2,
                is_active=True,
                tags=["管理"],
            ),
            User(
                feishu_open_id="ou_super789",
                name="王五",
                phone="13800138002",
                password_hash=get_password_hash("123456"),
                role_level=3,
                is_active=True,
                tags=["超管"],
            ),
        ]

        for user in users:
            db.add(user)
        await db.commit()

        print(f"Created {len(users)} sample users:")
        for u in users:
            print(f"  - {u.name} ({u.phone}) role={u.role_level}")


async def create_sample_skills():
    """Create sample admin skills with all current model fields."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AdminSkill))
        if result.scalar_one_or_none():
            print("Sample skills already exist")
            return

        skills = [
            AdminSkill(
                skill_id="skill_query_inventory",
                name="query_inventory",
                display_name="库存查询分析",
                description="查询产品库存并进行分析，生成补货建议",
                category="analysis",
                calling_guide="用户提到库存、补货、缺货时自动触发",
                input_schema={
                    "parameters": [
                        {"name": "product_id", "type": "string", "required": True, "description": "产品ID"}
                    ]
                },
                output_schema={"fields": ["库存状态", "预警信息", "补货建议"]},
                prompt_template=(
                    "步骤1：查询指定产品库存\n"
                    "{{tool:query_inventory(product_id={{input.product_id}})}}\n\n"
                    "步骤2：分析库存数据\n"
                    "根据{{result.query_inventory}}的结果分析库存状态，并给出补货建议。"
                ),
                required_tools=["query_inventory"],
                quality_criteria=["数据准确", "建议合理"],
                examples={"good_output": "清晰的库存状态和补货建议"},
                requires_approval=False,
                required_role_level=1,
                version="1.0",
                enabled=True,
                is_builtin=True,
            ),
        ]

        for skill in skills:
            db.add(skill)
        await db.commit()
        print(f"Created {len(skills)} sample skills")


async def create_sample_tools():
    """Create sample admin tools with all current model fields."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AdminTool))
        if result.scalar_one_or_none():
            print("Sample tools already exist")
            return

        tools = [
            AdminTool(
                tool_id="tool_query_inventory",
                name="query_inventory",
                display_name="查询库存",
                description="查询指定产品的当前库存",
                calling_guide="适用于查询单个或多个产品的库存信息",
                calling_examples=[
                    {"scenario": "查询单个产品", "params": {"product_id": "P001"}}
                ],
                input_schema={
                    "parameters": [
                        {"name": "product_id", "type": "string", "required": True, "description": "产品ID"}
                    ]
                },
                output_schema={
                    "type": "object",
                    "item_fields": [
                        {"name": "product_id", "type": "string", "description": "产品ID"},
                        {"name": "stock", "type": "integer", "description": "库存数量"},
                        {"name": "warehouse", "type": "string", "description": "仓库位置"},
                    ]
                },
                execution={
                    "type": "python_function",
                    "function_ref": "tools.inventory:query_inventory",
                    "config": {},
                },
                requires_approval=False,
                required_role_level=1,
                version="1.0",
                enabled=True,
                is_builtin=True,
            ),
        ]

        for tool in tools:
            db.add(tool)
        await db.commit()
        print(f"Created {len(tools)} sample tools")


async def main():
    """Initialize database and create sample data."""
    print("Initializing database...")
    await init_db()
    print("Database tables created")

    print("\nCreating sample users...")
    await create_sample_users()

    print("\nCreating sample skills...")
    await create_sample_skills()

    print("\nCreating sample tools...")
    await create_sample_tools()

    print("\nDatabase initialization complete!")


if __name__ == "__main__":
    asyncio.run(main())
