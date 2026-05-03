# Agentic Reach — Static Site

Plain static HTML/CSS/JS. No build step. Serve `dist/` with any static webserver.

## Files

- `index.html` — Landing Page (DE/EN toggle)
- `skalierung.html` — Scaling page
- `Impressum.html` / `Imprint.html` — Imprint (DE / EN)
- `Datenschutz.html` / `Privacy.html` — Privacy (DE / EN)
- `fonts/` — Self-hosted webfonts (Space Grotesk, JetBrains Mono, Fraunces)
- `uploads/` — Images

## Serve

Set `index.html` as the document root index file. All links are relative.

Example nginx:

```
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ =404; }
}
```

Example Dockerfile:

```
FROM nginx:alpine
COPY . /usr/share/nginx/html
```
