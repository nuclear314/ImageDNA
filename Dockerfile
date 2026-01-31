# Stage 1: Build the React frontend
FROM node:24-alpine AS frontend-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


# Stage 2: Python runtime serving API + built frontend
FROM python:3.12-slim AS runtime

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py tagger.py ./
COPY --from=frontend-build /app/dist ./dist

EXPOSE 5000
CMD ["python", "server.py"]
