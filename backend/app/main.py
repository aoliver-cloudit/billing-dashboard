from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    blackpoint,
    cloudradial,
    connectsecure,
    connectwise_sync,
    customers,
    ninja,
    sophos,
)

app = FastAPI(title="Portfolio Deployment Tracker API")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(customers.router)
app.include_router(blackpoint.router)
app.include_router(ninja.router)
app.include_router(cloudradial.router)
app.include_router(sophos.router)
app.include_router(connectsecure.router)
app.include_router(connectwise_sync.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
