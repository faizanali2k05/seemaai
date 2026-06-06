FROM python:3.11-slim

WORKDIR /app

# System dependencies for psycopg2 and lxml
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libxml2-dev libxslt1-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Normalise line endings on shell scripts (repo may be checked out on Windows
# with CRLF, which breaks /bin/bash) and make the entrypoint executable.
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

# Expose port
EXPOSE 8000

# Default command (the `api` service): migrate -> apply RLS -> serve.
# The celery worker/beat services override this with their own command.
CMD ["bash", "entrypoint.sh"]
