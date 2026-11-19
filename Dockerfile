FROM python:3.14-slim

WORKDIR /app

# Prevent Python from generating .pyc files
ENV PYTHONDONTWRITEBYTECODE=1

# Print logs immediately
ENV PYTHONUNBUFFERED=1

# Install Python dependencies
COPY requirements.txt .

RUN python -m pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY modules/ ./modules/
COPY database/ ./database/
COPY tests/ ./tests/
COPY main.py .

EXPOSE 8000

# Start FastAPI
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]