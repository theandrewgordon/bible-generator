# Build the learning Lab entrypoints from their reviewed sources on every deployment.
FROM node:22-bookworm-slim AS learning-labs
WORKDIR /src
COPY frontend/learning-labs/package*.json ./frontend/learning-labs/
RUN npm ci --prefix frontend/learning-labs
COPY frontend/learning-labs ./frontend/learning-labs
COPY static/js ./static/js
COPY static/labs/learning-nav.css ./static/labs/learning-nav.css
COPY templates/labs_latin_quest.html ./templates/labs_latin_quest.html
RUN npm run build --prefix frontend/learning-labs

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
COPY --from=learning-labs /src/static/labs/learning/ ./static/labs/learning/
COPY --from=learning-labs /src/static/labs/math-fact-rally.html ./static/labs/math-fact-rally.html
COPY --from=learning-labs /src/static/labs/geo-detectives.html ./static/labs/geo-detectives.html
COPY --from=learning-labs /src/templates/labs_latin_quest.html ./templates/labs_latin_quest.html

CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
