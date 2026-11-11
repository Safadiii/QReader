from fastapi import FastAPI

from modules.orders.routes import router as orders_router
from modules.qr.routes import router as qr_router

app = FastAPI(title="QREADER API")

app.include_router(orders_router, prefix="/api/v1")
app.include_router(qr_router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "healthy"}

