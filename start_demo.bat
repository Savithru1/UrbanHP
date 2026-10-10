@echo off
echo ===================================================
echo   URBANHP - THE CITY THAT NEVER FORGETS
echo   Launching Backend and Frontend Servers...
echo ===================================================

start "UrbanHP Backend [FastAPI - Port 8000]" cmd /k ".\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

start "UrbanHP Frontend [Vite - Port 5173]" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers started!
echo Open your browser at: http://127.0.0.1:5173/
echo Open MongoDB Compass at: mongodb://127.0.0.1:27017/urbanhp
echo ===================================================
pause
