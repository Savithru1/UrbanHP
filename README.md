# UrbanHP — The City That Never Forgets

Upload a **photo**, a **video** or a **written description** of a street problem and
pin where it is. UrbanHP detects what is wrong, outlines it on the picture, places it
on a map, and saves it to MongoDB as linked documents you can open in **MongoDB Compass**.
When the same problem is reported at the same place again, it recommends what was
learned the last time instead of the textbook fix.

Detection, matching and recommendations run locally with no API keys. Two things are
fetched from the internet: the map tiles and, when you pin a place, its street name
(both from OpenStreetMap).

There are two separate pages:

| Page | Address | For | What it does |
|---|---|---|---|
| **Public** | `http://127.0.0.1:5173/` | anyone | Send a report: a photo, a video or a description, and where. The sender sees their upload being scanned and is told that it is registered (or already registered, and which department takes it further), with a reference number. Nothing else. |
| **Admin** | `http://127.0.0.1:5173/admin/` | staff | Receives the reports as they arrive and does everything else: **Reports** (every report, searchable, with the pinned ones on a map), **Memory** (the lessons, and what they change) and **Database** (MongoDB, live). |

In the admin page a report opens with the picture on the left and **What to do** — the
recommendation — first on the right, above what was found, the history, the follow-up
and the database record.

The public page is given a trimmed view of its own report (`/api/public/reports/{id}`):
no recommendation, history, follow-up or database record. **The admin page has no login**
— it is a separate address, not a protected one — so put one in front of it before this
runs anywhere other than your own machine.

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

Open **http://127.0.0.1:5173/** to send a report and **http://127.0.0.1:5173/admin/** to handle them.

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
in a light tint, a thin box around it, and a label with the class and confidence.
While a picture is analysed a light bar sweeps it like a scanner; on its last pass the
outlines appear where the bar has been. Under the result, **Replay** runs the scan again
(or restarts a video) and **Original** shows the upload with nothing drawn on it.
In the upload form the chosen photo or video is previewed (a video can be played) before it is sent. The fine-tuned models produce their own outlines; for all other
issues SAM 2 traces the object inside the box. If an issue is clearly present
but cannot be boxed, it is shown as a dashed box over the region it was seen in.

**Video** is sampled at 2 frames per second. Each frame is analysed and pushed to
the page live. A tracker (with camera-motion compensation) follows every object
across frames, so one pothole seen for five seconds is stored as one detection.

**Text** is matched against keywords for each issue, with a semantic fallback
(sentence embeddings) for sentences that use none of them. A location is pulled
out of phrases like "near Gandhi Market". Text can also accompany a photo — useful
for things a camera cannot show, such as a street light that is off at night.

### Location and map

**Use my location** reads the device's position from the browser and drops a pin; click
the map or drag the pin to correct it (a laptop's position is often off by a street).
A photo taken with GPS switched on carries its own position, which is used when no pin
is set. The position is stored as a GeoJSON point (`incidents.geo`) with how it was
obtained (`location_source`: `gps`, `pin`, `photo`, `typed` or `text`).

Two reports are **at the same place** when their pins are within 100 m of each other
(found with a `2dsphere` index and `$geoNear`). Reports without a pin fall back to
comparing the written location word by word.

### Already registered, or come back

Every report is given a registration (`incidents.registration`) by looking at the
reports made before it:

| State | When | What the person is told |
|---|---|---|
| `new` | nothing like it at this place before | "Registered and assigned to Roads & Pavements." |
| `already_registered` | the same problem at the same place is still an open case | "Already registered. The same pothole at this place is already on record; this is report no. 3 of it. Roads & Pavements will take further action." |
| `recurrence` | the same problem was dealt with here before and is back | "Registered again. The same pothole was dealt with at this place before and has come back…" |

A repeat report is filed under the open case (`registration.case_id`); the case counts
its reports (`report_count`), and follow-up is recorded once, on the case. A report with
no location at all is recognised by its file instead: the identical photo or video
(same SHA-256) counts as the same problem. The registration is decided once, when the
report is analysed, and kept.

### History and search

For each report the system retrieves what is already on record:

- **At this place** — the other reports of the problem here, what was tried, and whether it held.
- **Same kind of problem elsewhere** — past cases of the same issue type, the instructive
  ones first (something was tried and the result is known), then by how closely the
  description matches and how near they are.
- **Lessons that apply** — validated lessons learned at this place, and lessons from
  elsewhere only when their text is close to this report's (similarity 0.45 or more;
  an unrelated lesson of the same issue type scores about 0.3).

The search box on the Reports page finds past reports three ways and merges them:
MongoDB's text index (keywords), a fragment of the title or place ("manchi" finds
Manchirevula), and meaning ("broken lamp" finds a street light report).

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

## After the analysis

**Checking.** Each detection can be confirmed or rejected. A rejected detection stays
in the database but is no longer drawn and no longer counts: the report's title,
severity and recommendation are worked out again without it.

**Follow-up.** A report becomes memory in three steps, each written to its own collection:

| Step | Collection | What you record |
|---|---|---|
| 1. Action | `actions` | what was done about it |
| 2. Outcome | `outcomes` | whether the repair held or the problem came back |
| 3. Lesson | `memories` | what to do next time at this place |

A lesson is `draft`, `validated` or `retired`; only validated lessons shape recommendations.

**Recommendations** are assembled by rules from evidence, strongest first. No language
model is involved: the text always comes from a lesson, a recorded action, or the
standard procedure.

1. A validated lesson learned at this very place comes first. A lesson that lays out its
   own steps replaces the standard procedure; a lesson that is a single instruction
   ("check for pipe leaks") becomes step 1, and the standard procedure follows it.
2. Otherwise, what was tried here before: a repair that held is repeated; one that
   failed is listed under "Do not repeat", and finding the cause comes first.
3. One hint from elsewhere, offered as something to check and never as the answer: a
   lesson whose text closely matches, or failing that a similar case with a known result.
4. With none of these, the standard procedure for the issue type.

Every step and warning names the document it came from (`recommendation.steps`,
`.avoid`, `.evidence`), and `recommendation.baseline` keeps what the advice would have
been with no memory at all.

What the admin reads under **What to do**, top to bottom:

| Part | Field | Where it comes from |
|---|---|---|
| The order, e.g. "Repair 3 potholes" | `headline` | the main issue type's verb and how many were found |
| Priority, how soon, and why | `priority` | severity, raised one level at three or more reports of the problem or when it came back after a repair |
| Handled by | `department` | the main issue type |
| The steps, numbered | `steps` | a lesson's protocol split into its steps, or the issue type's standard procedure |
| Why, and Do not repeat | `because`, `avoid` | the lesson, and repairs here that did not hold |
| Also in this report | `also` | every other issue type found, each with its own department and action |
| Bring | `equipment` | the main issue type |

The priority windows (24 hours, 3 days, 7 days, routine) and the standard procedures are
this system's own defaults, set in `backend/app/taxonomy.py`. They are not an official
standard: a municipality would put its own service levels and procedures there.
A case's priority is worked out again each time the same problem is reported again.

**Memory.** Edit, validate or retire lessons, then re-evaluate every report against
them and see which recommendations changed, before and after. The page also compares
cases whose advice was shaped by memory with those that got the standard procedure:
how the advice was rated (thumbs up / down on a report) and whether the repair held.
These are plain counts; they mean little until enough cases have been rated and followed up.

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
| `incidents` | one submitted report, with its position (`geo`), `registration`, `work_status` and `recommendation` | `media_id`, `detection_ids`, `issue_type_ids`, `memory_ids`, `related_incident_ids`, `duplicate_of`, `action_ids` |
| `detections` | one irregularity found (an outlined object, or an issue named in text), with its checked `status` | `incident_id`, `media_id`, `issue_type_id`, `memory_ids` |
| `media_assets` | one uploaded file | `incident_id`, `detection_ids` |
| `issue_types` | the meaning of an issue type — department, standard `procedure`, `equipment` — with running counters | `memory_ids`, `last_incident_id` |
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

The admin page shows this log live. **Database** lists the collections with their document
counts and every write as it happens — when, created / updated / deleted, which collection
and document, and why — and each line opens to show the fields it wrote, with the old and
new value. The same list, for one report only, is under that report's Database tab, together
with a ready-made Compass filter such as `{ _id: "inc_20261010_ab12cd" }`.

Besides the `2dsphere` index on `incidents.geo`, a text index (`report_text`, over title,
location and description) serves the report search.

`recommendation.source` says where the advice came from: `memory` (a lesson learned at
this place), `history` (what was tried here before) or `standard_procedure`.
Checking a detection, recording an outcome or re-evaluating in the lab updates the
report in place, and each of those changes appears in `activity_log` like any other.

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

The page talks to the backend on `http://127.0.0.1:8000`. To point it at another
instance, set `URBANHP_API` before starting the frontend.

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
- "Use my location" is only as good as the device: a phone with GPS is accurate to a few metres,
  a laptop on Wi-Fi can be hundreds of metres out. The page shows the accuracy; drag the pin if it is wrong.
- Recommendations are picked and combined by rules, not written by a language model, so the wording
  never adapts beyond the lessons, actions and standard procedures already stored.
- The priority and its time window are defaults of this system, not a municipal service standard.

## Stack

FastAPI · Motor (MongoDB) · PyTorch · Transformers · Ultralytics · OpenCV — React · TypeScript · Vite · Tailwind CSS · Leaflet (OpenStreetMap)
