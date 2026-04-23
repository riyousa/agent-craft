"""Setup script for agent-craft package."""
from setuptools import setup, find_packages

setup(
    name="agent-craft",
    version="1.0.0",
    description="Internal Employee Platform Assistant based on LangGraph",
    author="Your Name",
    packages=find_packages(),
    python_requires=">=3.11",
    install_requires=[
        "langgraph>=0.0.40",
        "langchain>=0.1.0",
        "langchain-core>=0.1.0",
        "fastapi>=0.109.0",
        "uvicorn[standard]>=0.27.0",
        "pydantic>=2.5.0",
        "pydantic-settings>=2.1.0",
        "sqlalchemy>=2.0.25",
        "aiosqlite>=0.19.0",
        "python-dotenv>=1.0.0",
        "python-multipart>=0.0.6",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
            "httpx>=0.26.0",
        ]
    },
)
