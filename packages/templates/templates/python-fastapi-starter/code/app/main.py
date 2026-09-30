from fastapi import FastAPI

app = FastAPI(title="python-fastapi-starter")


@app.get("/")
def root():
    return {
        "name": "python-fastapi-starter",
        "message": "Your FastAPI service is running.",
    }


@app.get("/healthz")
def healthz():
    return {"ok": True}
