"""Entry point: python run.py"""
import uvicorn
from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        # Increase timeouts for long-running export operations (up to 10 minutes)
        timeout_keep_alive=600,
        h11_max_incomplete_event_size=20 * 1024 * 1024,  # 20 MB headers buffer
    )
