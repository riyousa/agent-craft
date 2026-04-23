.PHONY: install install-page init-db run run-page dev test clean help migrate migrate-new migrate-current migrate-stamp-baseline

help:
	@echo "Available commands:"
	@echo "  make install       - Install backend dependencies"
	@echo "  make install-page  - Install frontend dependencies"
	@echo "  make init-db       - Initialize database"
	@echo "  make run           - Run backend server"
	@echo "  make run-page      - Run frontend dev server"
	@echo "  make dev           - Run both backend and frontend"
	@echo "  make test          - Run tests"
	@echo "  make clean         - Clean up generated files"
	@echo "  make migrate       - Apply pending migrations (alembic upgrade head)"
	@echo "  make migrate-new m=msg          - Autogenerate a new migration"
	@echo "  make migrate-current           - Show current migration revision"
	@echo "  make migrate-stamp-baseline    - Mark existing DB as at baseline (first-time setup)"

install:
	cd agent-api && pip install -r requirements.txt && pip install -e .

install-page:
	cd agent-page && npm install

init-db:
	cd agent-api && python scripts/init_db.py

run:
	cd agent-api && python main.py

run-page:
	cd agent-page && npm start

dev:
	./start.sh

migrate:
	cd agent-api && alembic upgrade head

migrate-new:
	cd agent-api && alembic revision --autogenerate -m "$(m)"

migrate-current:
	cd agent-api && alembic current

migrate-stamp-baseline:
	cd agent-api && alembic stamp 8f92617d07be

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf agent-api/.pytest_cache agent-api/htmlcov agent-api/.coverage
