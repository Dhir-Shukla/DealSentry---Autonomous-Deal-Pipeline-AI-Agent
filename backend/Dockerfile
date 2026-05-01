FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend/ contents into /app/backend/ so `backend.api.main:app` resolves
COPY . ./backend/

# Make backend a package for uvicorn module resolution
RUN touch ./backend/__init__.py

# Add backend/ to Python path so internal imports (from agent.xxx, db.xxx) work
ENV PYTHONPATH=/app/backend

CMD ["sh", "-c", "uvicorn backend.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
