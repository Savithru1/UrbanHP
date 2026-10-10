# UrbanHP — The City That Never Forgets

Upload a **photo**, a **video** or a **written description** of a street problem.
UrbanHP detects what is wrong, outlines it on the picture, and saves it to MongoDB
as linked documents you can open in **MongoDB Compass**.

Everything runs locally: no API keys, nothing leaves your machine.

---

## Run it

**You need:** Python 3.10+, Node.js 18+, MongoDB running on `localhost:27017`.
An NVIDIA GPU is strongly recommended (works on CPU, but slowly).

```powershell
# 1. Python environment (once)
python -m venv .venv
.\.venv\Scripts\python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu130   # NVIDIA GPU
.\.venv\Scripts\python -m pip install -r backend\requirements.txt

# 2. Frontend packages (once)
cd frontend; npm install; cd ..

# 3. Start both servers
.\start_demo.bat
```

Open **http://127.0.0.1:5173**.

The first start downloads the detection models (about 2.7 GB) from Hugging Face.
After that the backend needs roughly 30 seconds to load them; the page tells you
when it is ready.

---

## How detection works

**Potholes** are found by a model fine-tuned on labelled pothole photos
(`backend/models/pothole-seg.pt`, see [Fine-tuning](#fine-tuning) below).

**Everything else** is found zero-shot, in three stages that each do one thing well:

| Stage | Question | Model |
|---|---|---|
| 1. What | Which issues are in this picture — or is it just a normal street? | SigLIP 2 (zero-shot classifier) |
| 2. Where | Where exactly is each of those issues? | Grounding DINO (open-vocabulary box detector) |
| 3. Check | Does each box really show the issue, or a harmless look-alike? | SigLIP 2 again, on the cropped box |

Stage 1 is why a clean road, a closed manhole cover or a working street light
does not raise an alarm.

**Outlines.** Every detection is drawn the same way: the exact shape of the object
filled in colour, a box around it, and a label with the class and confidence
(`pothole 0.68`). The fine-tuned models produce their own outlines; for all other
issues SAM 2 traces the object inside the box. If an issue is clearly present
but cannot be boxed, it is shown as a dashed box over the region it was seen in.

**Video** is sampled at 2 frames per second. Each frame is analysed and pushed to
the page live. A tracker (with camera-motion compensation) follows every object
across frames, so one pothole seen for five seconds is stored as one detection.

**Text** is matched against keywords for each issue, with a semantic fallback
(sentence embeddings) for sentences that use none of them. A location is pulled
out of phrases like "near Gandhi Market". Text can also accompany a photo — useful
for things a camera cannot show, such as a street light that is off at night.

### What it detects

| Issue | Department |
|---|---|
| Pothole, road crack, road obstruction | Roads & Pavements |
| Fallen tree | Parks & Emergency Response |
| Broken street light, fallen / hanging wire | Electrical & Street Lighting |
| Water leak | Water Supply |
| Waterlogging, open manhole | Stormwater & Drainage |
| Garbage dump | Solid Waste Management |
| Damaged sign | Traffic Engineering |

To add or tune an issue type, edit `backend/app/taxonomy.py` — it is the single
source of truth for the detector, the text analyser and the database.

**Severity (1–5)** is an estimate from how much of the frame the defect covers,
raised for dangerous issue types. It is not a physical measurement.

---

## Fine-tuning

Potholes have their own YOLO11 segmentation model, fine-tuned on labelled photos
and stored in `backend/models/`. A second job for road cracks is set up but has
not been trained yet (cracks are still found zero-shot until it is).

```powershell
.\.venv\Scripts\python training\prepare_data.py     # download both datasets
.\.venv\Scripts\python training\train.py pothole    # ~20 minutes on a 4 GB laptop GPU
.\.venv\Scripts\python training\train.py crack      # ~25 minutes; not run yet
.\.venv\Scripts\python training\evaluate.py         # potholes: before / after on the test photos
```

**Potholes** — trained on 582 photos, 157 for validation, 80 held out for testing.
What the whole detector does on those 80 test photos (204 labelled potholes; a
detection counts when it overlaps a labelled pothole by IoU ≥ 0.5):

| | Potholes found | Recall | Precision | F1 |
|---|---|---|---|---|
| Before (zero-shot only) | 27 of 204 | 13% | 82% | 0.23 |
| After (fine-tuned model) | 157 of 204 | 77% | 78% | 0.77 |

The model on its own scores box mAP50 0.88 and mask mAP50 0.87 on the same photos.
Scores are saved next to the model (`backend/models/pothole-seg.json`).

A model trained only on road photos will happily "find" damage in other pictures
(the pattern on a manhole cover scored 0.87 as a pothole), so the scene classifier
keeps watch: fine-tuned detections are accepted only when it sees some evidence of
road damage in the picture. That check removed every false pothole on 57 photos
without one, at the cost of 5% of the correct boxes.

To fine-tune for another issue type, add a job to `training/train.py` and an entry
to `TRAINED` in `backend/app/services/detector.py`.

**Licences.** The pothole dataset is Roboflow's "road damage" set (CC BY 4.0, via
`manot/pothole-segmentation` on Hugging Face); the crack dataset is Ultralytics'
`crack-seg`. Training and running these models uses
[Ultralytics](https://github.com/ultralytics/ultralytics), which is **AGPL-3.0**:
fine for a demo, but if you publish or host this project, AGPL's terms apply (or
you need their commercial licence). Deleting the files in `backend/models/`
switches the app back to zero-shot detection with no Ultralytics code involved.

---

## MongoDB

Connect Compass to `mongodb://127.0.0.1:27017` and open the **`urbanhp`** database.
Collections, validation rules and indexes are created automatically on start.

Two rules make every document easy to read:

1. **Facts first, references under `links`.** Every pointer to another collection
   sits in the document's `links` field and is named after what it points to
   (`links.incident_id`, `links.detection_ids`, …).
2. **Every change is recorded.** Each insert, update and delete adds an entry to
   `activity_log`, and raises the changed document's `version` and `updated_at`.

```
incidents ──< detections >── issue_types ──< memories
    │              │                             │
    └── media_assets ──┘        actions ──< outcomes ──┘
    │
    └──< activity_log   (one entry per insert / update / delete)
```

| Collection | One document is… | `links` |
|---|---|---|
| `about` | the description of one collection — start here | — |
| `incidents` | one submitted report | `media_id`, `detection_ids`, `issue_type_ids`, `memory_ids`, `related_incident_ids`, `duplicate_of`, `action_ids` |
| `detections` | one irregularity found (an outlined object, or an issue named in text) | `incident_id`, `media_id`, `issue_type_id`, `memory_ids` |
| `media_assets` | one uploaded file | `incident_id`, `detection_ids` |
| `issue_types` | the meaning of an issue type, with running counters | `memory_ids`, `last_incident_id` |
| `memories` | a lesson learned from a past repair | `issue_type_id`, `learned_from_incident_ids`, `action_ids`, `outcome_ids`, `used_by_incident_ids` |
| `actions` | what was done about a past incident | `incident_id`, `outcome_ids`, `memory_ids` |
| `outcomes` | how that action turned out | `action_id`, `incident_id`, `memory_ids` |
| `activity_log` | one change to the database | `document_id` + `collection`, `incident_id` |
| `incident_overview` (view) | an incident joined with its file, detections, issue types, memories, related incidents and update history | — |

**What one upload writes** (watch it in `activity_log`, sorted by `{ at: -1 }`):

```
media_assets  created   Image uploaded: road.jpg
incidents     created   Image report received                     version 1
incidents     updated   Analysis started                          version 2
detections    created   Detected: Pothole (severity 4, 68% confident)
media_assets  updated   File analysed: linked to 1 detection(s)
memories      updated   Lesson '…' attached to inc_…
issue_types   updated   Pothole: 1 more detection(s) recorded
incidents     updated   Analysis completed: 1 pothole             version 3
```

The page lists the same entries under each report ("database updates"), together
with a ready-made Compass filter such as `{ _id: "inc_20261010_ab12cd" }`.

A recommendation comes from a memory when the new report is at the *same place* as
that memory (`recommendation.source: "memory"`); otherwise the standard procedure
for the issue type is used and the memory stays linked for reference.

The database is seeded once with a small fictional history (the Navanagar scenario)
so links have something to point at. Seeded documents carry `is_seed: true`.

---

## Configuration

Optional — put these in a `.env` file next to where you start the backend:

| Variable | Default | |
|---|---|---|
| `MONGODB_URL` | `mongodb://127.0.0.1:27017` | Local MongoDB or an Atlas connection string |
| `DATABASE_NAME` | `urbanhp` | |
| `DEVICE` | `auto` | `cuda` or `cpu` |
| `DETECTOR_MODEL` | `IDEA-Research/grounding-dino-base` | `IDEA-Research/grounding-dino-tiny` is faster and lighter |
| `VIDEO_SAMPLE_FPS` | `2.0` | Frames analysed per second of video |

---

## Limits worth knowing

- Only potholes have a trained model. The other issue types are found zero-shot by
  general-purpose models: on 71 varied street photos they raised no false alarm on
  the 31 normal scenes and found the defect in about three quarters of the rest.
  Misses are mostly subtle or distant defects. Treat results as a first pass for an inspector.
- A street light that is simply switched off cannot be told from a working one in a
  photo; only visible damage (bent, fallen, broken, exposed wiring) is detected. Say it in the text.
- Videos in formats the browser cannot play (e.g. HEVC) are still analysed; the page
  then shows the busiest frame instead of playing the clip.
- On a 4 GB laptop GPU a photo takes about 1–2 seconds and video runs at roughly 1–2 analysed frames per second.

## Stack

FastAPI · Motor (MongoDB) · PyTorch · Transformers · Ultralytics · OpenCV — React · TypeScript · Vite · Tailwind CSS
