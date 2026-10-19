# python-fastapi-starter

A minimal Python API with FastAPI and Uvicorn.

From this project's root in the Linux sandbox or a Unix shell:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Routes:

- `GET /`
- `GET /healthz`

Open `http://localhost:8000/docs` for the generated API interface. Add routes in
[app/main.py](app/main.py). Add `--reload` to the Uvicorn command while developing.

On Windows, create the environment with `py -3 -m venv .venv` and use
`.venv\Scripts\python.exe -m pip` and `.venv\Scripts\python.exe -m uvicorn`
for the corresponding commands. Keep `requirements.lock` aligned with dependency
changes in `requirements.txt`.
