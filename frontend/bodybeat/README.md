# BodyBeat

Camera-controlled rhythm game for one or two players in Faith Sparks Labs.

From the repository root:

```sh
npm ci --prefix frontend/bodybeat
npm run build --prefix frontend/bodybeat
npm run lint --prefix frontend/bodybeat
node --test frontend/bodybeat/tests/*.test.mjs
```

The production build generates `static/labs/bodybeat/` and Flask serves it at
`/labs/bodybeat`. Camera access requires HTTPS or localhost.
