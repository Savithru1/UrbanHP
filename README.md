# 🏛️ UrbanHP — The City That Never Forgets

> **"Every Signal Becomes Memory. Every Memory Informs the Next Decision."**

UrbanHP is an AI-powered multimodal urban intelligence system that transforms civic complaints across **images, videos, voice audio, and text** into structured, searchable digital memory in **MongoDB Compass**.

Rather than stopping at reporting, UrbanHP links new reports with historical incidents, civic repair actions, and previous failure outcomes. It uses semantic vector memory to generate proactive, outcome-informed recommendations — observable in real-time through the **UrbanHP Evidence Lab** and **MongoDB Compass**.

---

## ⚡ Reference Repositories Integrated

UrbanHP synthesizes key architectural patterns from the following engineering foundations:

1. **[mongodb-developer/mongodb-with-fastapi](https://github.com/mongodb-developer/mongodb-with-fastapi)**: Async `Motor` client, Lifespan context management, BSON `ObjectId` serialization, and Pydantic v2 schemas.
2. **[mongodb-developer/vercel-mongodb-next-fastapi-starter](https://github.com/mongodb-developer/vercel-mongodb-next-fastapi-starter)**: Unified decoupled client-server architecture with API proxying.
3. **[mongodb-developer/mongodb-rag](https://github.com/mongodb-developer/mongodb-rag)**: Retrieval-Augmented Generation architecture for grounding AI decisions into database records.
4. **[mongodb-developer/docs-vector-search-demo-py](https://github.com/mongodb-developer/docs-vector-search-demo-py)**: Semantic cosine vector search indexing against MongoDB collections.
5. **[SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper)**: Voice complaint speech acoustic parsing and transcription engine.
6. **[ffmpeg/ffmpeg](https://github.com/ffmpeg/ffmpeg)**: Temporal video frame sampling, audio track isolation, and keyframe extraction.
7. **[PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)**: Visual surface cavity detection, edge density heuristics, and civic signboard text recognition.
8. **[xyflow/xyflow](https://github.com/xyflow/xyflow)**: `@xyflow/react` interactive knowledge graph visualising *Incident → Vector Match → Validated Memory → Historical Action → Recorded Outcome*.
9. **[helloabhishek2004/Civicsense](https://github.com/helloabhishek2004/Civicsense)**: Real-world civic complaint categorization, severity estimation, and resolution lifecycle.

---

## 🧭 Live MongoDB Compass Integration

UrbanHP is configured to run directly against your local MongoDB instance or MongoDB Atlas.

### Quick Connection
- **Connection URI**: `mongodb://127.0.0.1:27017`
- **Database Name**: `urbanhp`
- **Compass Filter Example**: `{ "_id": "inc_hist_001" }`

### Core Collections in MongoDB Compass
| Collection | Description | Key Fields |
|---|---|---|
| `incidents` | Civic reports and extraction results | `_id`, `input_type`, `incident_type`, `processing_status`, `extracted_text`, `severity`, `version`, `related_memory_ids` |
| `memories` | Reusable civic lessons & validated protocols | `_id`, `title`, `lesson_learned`, `recommended_protocol`, `recurrence_risk`, `embedding` |
| `actions` | Municipal maintenance operations | `_id`, `incident_id`, `action_type`, `assigned_department`, `contractor`, `status` |
| `outcomes` | Post-intervention inspection findings | `_id`, `action_id`, `observation`, `recurrence_detected`, `days_to_recurrence` |
| `media_assets`| File references, keyframes & acoustic telemetry | `_id`, `incident_id`, `file_type`, `file_size_bytes`, `storage_path`, `url` |
| `evaluations` | AI recommendation audit trail | `_id`, `incident_id`, `previous_recommendation`, `new_recommendation`, `reasoning_trace` |

---

## 🔬 The UrbanHP Evidence Lab (Signature Feature)

The centerpiece of UrbanHP is the **3-Panel Evidence Comparison Lab**:

```
+---------------------------+---------------------------+---------------------------+
| PANEL 1: ORIGINAL EVIDENCE| PANEL 2: AI EXTRACTION    | PANEL 3: LIVE MONGODB     |
|                           |                           |                           |
| - High-res image preview  | - Structured text summary | - Real-time BSON doc view |
| - Video player + keyframes| - Confidence gauge (0-100)| - Document version (v1-v5)|
| - Waveform audio player   | - Cavity & defect metrics | - 5-Stage timeline pulse  |
| - Raw citizen transcript  | - Forensic human verify   | - Compass query filter    |
+---------------------------+---------------------------+---------------------------+
```

### Stage-by-Stage Progressive Database Mutations:
As an input is processed, UrbanHP writes progressive updates to MongoDB Compass:
1. `received` (v1) — Raw input registered.
2. `processing` (v2) — Computer vision / acoustic model initiated.
3. `extracted` (v3) — Text normalized, cavity metrics & features extracted.
4. `memory_linked` (v4) — Semantic vector search links historical memories.
5. `completed` (v5) — Recommendation generated from memory; record finalized.

---

## 🎬 The 6-Act Hackathon Demonstration Script

1. **Act 1: Submit Evidence**
   - Go to **Evidence Ingestion**. Click preset **📸 Test Image (Pothole)** or upload custom media.
   - Click **Transmit Evidence to Lab**.
2. **Act 2: Show MongoDB Compass**
   - Open MongoDB Compass at `mongodb://127.0.0.1:27017/urbanhp`.
   - Open collection `incidents`. Show the new document version incrementing (`v1` → `v5`).
3. **Act 3: Historical Memory Retrieval**
   - In **Evidence Lab**, show that `mem_pothole_001` was retrieved via vector similarity.
   - Show how the AI detected sub-base saturation from past failed cold-mix asphalt repairs.
4. **Act 4: Update the Memory**
   - Go to **Memory Impact Lab**.
   - Modify the protocol for `mem_pothole_001` (e.g. add *"Mandatory sub-base geotextile reinforcement required"*). Click **Update Memory**.
5. **Act 5: Re-Evaluate the Incident**
   - Click **Re-Evaluate Incident with Updated Memory**.
6. **Act 6: Compare the Results**
   - Observe the live Before & After comparison card showing the adapted recommendation and the transparent AI reasoning trace!

---

## 🚀 Running UrbanHP Locally

### Prerequisites
- Python 3.10+ (tested on Python 3.12)
- Node.js 18+ (tested on Node v24)
- Local MongoDB running on port 27017 (or MongoDB Atlas URI)

### Quick Start (Windows)
Double-click `start_demo.bat` or run:

```powershell
# 1. Start FastAPI Backend (Port 8000)
.\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

# 2. In another terminal, start Vite Frontend (Port 5173)
cd frontend
npm run dev
```

Visit: **`http://127.0.0.1:5173/`**

---

## 🛠️ Technology Stack

- **Backend**: Python 3.12, FastAPI, Motor, PyMongo, Pydantic v2, OpenCV (`cv2`), Pillow, NumPy.
- **Database**: MongoDB (local Compass / Atlas), MongoDB Vector Search.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v4, `@xyflow/react`, `lucide-react`.
- **Streaming**: Server-Sent Events (SSE) & WebSockets for real-time reactive mutations.
