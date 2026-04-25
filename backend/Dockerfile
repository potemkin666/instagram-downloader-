FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml /app/pyproject.toml
COPY oceangram_backend /app/oceangram_backend
RUN pip install --no-cache-dir .

ENV OCEANGRAM_BACKEND_HOST=0.0.0.0 \
    OCEANGRAM_BACKEND_PORT=8000

EXPOSE 8000
CMD ["oceangram-backend"]
