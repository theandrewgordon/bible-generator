FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SOFFICE_BIN=/usr/bin/soffice \
    PDFTOPPM_BIN=/usr/bin/pdftoppm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        nodejs \
        libreoffice-impress \
        poppler-utils \
        fonts-dejavu-core \
        fonts-liberation \
    && test -x "$SOFFICE_BIN" \
    && test -x "$PDFTOPPM_BIN" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
