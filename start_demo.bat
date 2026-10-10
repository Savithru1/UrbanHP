@echo off
echo ===================================================
echo   URBANHP - starting backend and frontend
echo ===================================================

start "UrbanHP Backend [FastAPI - Port 8000]" cmd /k ".\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

start "UrbanHP Frontend [Vite - Port 5173]" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers started.
echo   App:      http://127.0.0.1:5173/
echo   Compass:  mongodb://127.0.0.1:27017  (database: urbanhp)
echo.
echo The backend needs about 30 seconds to load the detection models.
echo The very first start also downloads them (about 2.5 GB).
echo ===================================================
pause
