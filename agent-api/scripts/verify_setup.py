"""Verify project setup and structure."""
import sys
import os
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def check_python_version():
    """Check Python version."""
    print("Checking Python version...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 11:
        print(f"  ✓ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"  ✗ Python {version.major}.{version.minor}.{version.micro} (requires 3.11+)")
        return False


def check_dependencies():
    """Check if required packages are installed."""
    print("\nChecking dependencies...")
    required_packages = [
        "langgraph",
        "langchain",
        "fastapi",
        "uvicorn",
        "pydantic",
        "sqlalchemy",
        "aiosqlite",
    ]

    all_installed = True
    for package in required_packages:
        try:
            __import__(package)
            print(f"  ✓ {package}")
        except ImportError:
            print(f"  ✗ {package} (not installed)")
            all_installed = False

    return all_installed


def check_project_structure():
    """Check if all required files and directories exist."""
    print("\nChecking project structure...")
    required_paths = [
        "src/agent/state.py",
        "src/agent/nodes.py",
        "src/agent/graph.py",
        "src/agent/llm.py",
        "src/api/app.py",
        "src/api/schemas.py",
        "src/tools/base.py",
        "src/tools/registry.py",
        "src/tools/examples.py",
        "src/skills/base.py",
        "src/skills/registry.py",
        "src/skills/examples.py",
        "src/models/user.py",
        "src/models/session.py",
        "src/models/audit_log.py",
        "src/db/database.py",
        "src/config.py",
        "main.py",
        "requirements.txt",
    ]

    all_exist = True
    for path in required_paths:
        if os.path.exists(path):
            print(f"  ✓ {path}")
        else:
            print(f"  ✗ {path} (missing)")
            all_exist = False

    return all_exist


def check_env_file():
    """Check if .env file exists."""
    print("\nChecking configuration...")
    if os.path.exists(".env"):
        print("  ✓ .env file exists")
        return True
    else:
        print("  ⚠ .env file not found")
        print("    Run: cp .env.example .env")
        print("    Then edit .env with your configuration")
        return False


def check_data_directory():
    """Check if data directory exists."""
    print("\nChecking data directory...")
    if os.path.exists("data"):
        print("  ✓ data/ directory exists")
        return True
    else:
        print("  ⚠ data/ directory not found (will be created automatically)")
        os.makedirs("data", exist_ok=True)
        print("  ✓ Created data/ directory")
        return True


def test_imports():
    """Test if basic imports work."""
    print("\nTesting imports...")
    try:
        from src.agent.state import AgentState
        print("  ✓ AgentState import")
    except Exception as e:
        print(f"  ✗ AgentState import failed: {e}")
        return False

    try:
        from src.tools.registry import get_all_tools
        print("  ✓ get_all_tools import")
    except Exception as e:
        print(f"  ✗ get_all_tools import failed: {e}")
        return False

    try:
        from src.api.app import app
        print("  ✓ FastAPI app import")
    except Exception as e:
        print(f"  ✗ FastAPI app import failed: {e}")
        return False

    return True


def main():
    """Run all verification checks."""
    print("=" * 60)
    print("Agent Craft Project Setup Verification")
    print("=" * 60)

    checks = [
        ("Python Version", check_python_version),
        ("Dependencies", check_dependencies),
        ("Project Structure", check_project_structure),
        ("Configuration", check_env_file),
        ("Data Directory", check_data_directory),
        ("Module Imports", test_imports),
    ]

    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n  ✗ Error in {name}: {e}")
            results.append((name, False))

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)

    all_passed = True
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")
        if not result:
            all_passed = False

    print("=" * 60)

    if all_passed:
        print("\n✓ All checks passed! Your setup is ready.")
        print("\nNext steps:")
        print("  1. Configure .env file with your API keys")
        print("  2. Run: make init-db")
        print("  3. Run: make run")
        print("  4. Visit: http://localhost:8000/docs")
    else:
        print("\n⚠ Some checks failed. Please fix the issues above.")
        print("\nTo install dependencies:")
        print("  make install")
        print("  # or")
        print("  pip install -r requirements.txt")

    return all_passed


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
