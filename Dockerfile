# Stage 1: Build the React frontend
FROM node:24-alpine AS frontend-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


# Stage 2: Python runtime serving API + built frontend
FROM python:3.12-slim AS runtime

# Off by default: most users don't want the ~6-17GB JoyCaption model or the GPU-sized
# torch/transformers/bitsandbytes install. Opt in with:
#   docker build --build-arg WITH_JOYCAPTION=true -t imagedna-joycaption .
#   docker run --gpus all -p 5000:5000 imagedna-joycaption
# (requires an NVIDIA GPU + the NVIDIA Container Toolkit on the host for --gpus to work;
# no CUDA base image needed since the cu126 torch wheel bundles its own CUDA runtime libs).
ARG WITH_JOYCAPTION=false

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Installed as a separate step, before the rest of requirements-joycaption.txt, so the
# CUDA build (which only exists on PyTorch's own index, see README) is what satisfies the
# `torch>=2.3.0` constraint below rather than the CPU-only wheel plain PyPI would resolve to.
COPY requirements-joycaption.txt ./
RUN if [ "$WITH_JOYCAPTION" = "true" ]; then \
      pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cu126 "torch>=2.3.0" && \
      pip install --no-cache-dir -r requirements-joycaption.txt; \
    fi

COPY server.py tagger.py joycaptioner.py ./
COPY --from=frontend-build /app/dist ./dist

EXPOSE 5000
CMD ["python", "server.py"]
