from fastapi import Depends, FastAPI

from modules.auth.api_key import require_api_key
from modules.auth.routes import router as auth_router
from modules.notifications.routes import router as notifications_router
from modules.orders.routes import router as orders_router
from modules.qr.routes import router as qr_router
from modules.stores.routes import router as stores_router

app = FastAPI(title="QREADER API")

# Every /api/v1 route needs the web server's key (see modules/auth/api_key.py).
protected = [Depends(require_api_key)]
app.include_router(auth_router, prefix="/api/v1", dependencies=protected)
app.include_router(orders_router, prefix="/api/v1", dependencies=protected)
app.include_router(qr_router, prefix="/api/v1", dependencies=protected)
app.include_router(notifications_router, prefix="/api/v1", dependencies=protected)
app.include_router(stores_router, prefix="/api/v1", dependencies=protected)

@app.get("/health")
def health_check():
    return {"status": "healthy"}
