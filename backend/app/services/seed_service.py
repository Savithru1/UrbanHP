import logging
from datetime import datetime, timedelta, timezone

from app.core.database import get_database, rebuild_links
from app.services.linker import location_key

logger = logging.getLogger("urbanhp.seed")


async def seed_initial_data():
    """
    Seeds the demo city's history (the fictional Navanagar scenario): past incidents,
    what was done about them, how that turned out, and the lessons kept as memories.
    Everything seeded is marked `is_seed: true`.
    """
    db = get_database()
    if await db.memories.count_documents({}) > 0:
        return

    logger.info("Seeding demo city history into MongoDB...")
    now = datetime.now(timezone.utc)

    def memory(_id, days, issue, title, place, lesson, action, outcome, risk, protocol, learned_from):
        at = now - timedelta(days=days)
        return {
            "_id": _id, "title": title, "location_tag": place,
            "lesson_learned": lesson, "historical_action_taken": action, "recorded_outcome": outcome,
            "recurrence_risk": risk, "recommended_protocol": protocol, "times_used": 0,
            "links": {
                "issue_type_id": issue, "learned_from_incident_ids": learned_from,
                "action_ids": [], "outcome_ids": [], "used_by_incident_ids": [],
            },
            "is_seed": True, "version": 1, "created_at": at, "updated_at": at,
        }

    await db.memories.insert_many([
        memory("mem_pothole_001", 25, "pothole", "Sector 4 Junction sub-base saturation", "Ward 4, Sector 7 Junction / Main Road",
               "Cold-mix asphalt patching here failed within 72 hours because the overflowing stormwater drain keeps saturating the sub-base.",
               "Contractor applied a 40mm quick cold-mix asphalt patch without clearing the blocked roadside culvert.",
               "Asphalt washed away after 2 days of rain; the pothole deepened to 14cm.", "critical",
               "Clear the adjacent stormwater culvert first, then repair with hot-mix polymer modified bitumen, mechanical compaction and geotextile sub-base reinforcement.",
               ["inc_hist_001"]),
        memory("mem_garbage_002", 18, "garbage", "East Market dump site keeps coming back", "Ward 2, East Market Perimeter",
               "Morning truck collection does not clear this blackspot because vendors dump refuse between 11 PM and 3 AM.",
               "Standard municipal truck dispatched for 8:00 AM collection.",
               "The heap re-accumulated within 6 hours.", "high",
               "Install a 2.5 cubic metre closed dumper bin and schedule a night-shift clearance at 1:30 AM with CCTV spot fines.",
               ["inc_hist_002"]),
        memory("mem_light_003", 12, "broken_streetlight", "Ring Road lamps burn out from a grounding fault", "Ward 8, Outer Ring Road KM 14",
               "Lamps kept blowing because of an underground neutral grounding fault at Feeder Box 4B, not because of the lamps themselves.",
               "Technician replaced the 250W lamp three consecutive times.",
               "Each lamp burned out within 48 hours; a 600m stretch stayed dark.", "critical",
               "Do not just replace the lamp. Test earth resistance, rebuild the neutral grounding and replace the corroded breaker in the feeder box.",
               []),
        memory("mem_drain_004", 8, "waterlogging", "Railway underpass floods again after pumping", "Ward 5, Railway Underpass Low Point",
               "Pumping alone leaves 0.8m of compacted silt in the downstream culvert, so the next rain floods the underpass again.",
               "Emergency diesel pump operated for 6 hours.",
               "Flooding subsided, then recurred 15 minutes into the next rainfall.", "high",
               "De-silt the siphon barrel with a high-pressure suction vehicle, then clear the intake trash screen.",
               []),
    ])

    def action(_id, days, incident_id, kind, department, contractor, notes):
        at = now - timedelta(days=days)
        return {
            "_id": _id, "action_type": kind, "assigned_department": department, "contractor": contractor,
            "notes": notes, "status": "completed",
            "links": {"incident_id": incident_id, "outcome_ids": [], "memory_ids": []},
            "is_seed": True, "version": 1, "created_at": at, "updated_at": at,
        }

    await db.actions.insert_many([
        action("act_hist_001", 26, "inc_hist_001", "temporary_repair", "Roads & Pavements", "Apex Infra Works",
               "Applied cold asphalt patch on Sector 4 road surface."),
        action("act_hist_002", 19, "inc_hist_002", "scheduled_clearance", "Solid Waste Management", "CleanCity Services",
               "Morning manual clearance of market perimeter."),
    ])

    def outcome(_id, days, action_id, incident_id, observation, days_to_recurrence, notes):
        at = now - timedelta(days=days)
        return {
            "_id": _id, "observation": observation, "recurrence_detected": True,
            "days_to_recurrence": days_to_recurrence, "inspector_notes": notes,
            "links": {"action_id": action_id, "incident_id": incident_id, "memory_ids": []},
            "is_seed": True, "version": 1, "created_at": at, "updated_at": at,
        }

    await db.outcomes.insert_many([
        outcome("out_hist_001", 25, "act_hist_001", "inc_hist_001",
                "Cold asphalt patch washed out completely after 48 hours of rain. Pothole deepened.", 2,
                "Seepage from the adjacent choked gutter destabilised the gravel layer."),
        outcome("out_hist_002", 18, "act_hist_002", "inc_hist_002",
                "Trash heap re-accumulated the same night.", 1,
                "Commercial food waste needs a closed bin and night patrolling."),
    ])

    def incident(_id, days, issue, severity, label, text, place, memory_id):
        at = now - timedelta(days=days)
        return {
            "_id": _id, "input_type": "text", "status": "completed", "version": 1,
            "title": text.split(".")[0], "summary": text, "citizen_text": text,
            "location": place, "location_key": location_key(place),
            "severity": severity, "severity_label": label, "departments": [], "detection_count": 0,
            "is_recurring": False, "recommendation": None, "progress": None, "analysis": None,
            "links": {
                "media_id": None, "detection_ids": [], "issue_type_ids": [issue], "memory_ids": [memory_id],
                "related_incident_ids": [], "duplicate_of": None, "action_ids": [],
            },
            "is_seed": True, "created_at": at, "updated_at": at,
        }

    await db.incidents.insert_many([
        incident("inc_hist_001", 26, "pothole", 5, "Critical",
                 "Deep pothole at Sector 4 Junction causing vehicles to swerve. It sits next to the storm drain culvert.",
                 "Ward 4, Sector 7 Junction / Main Road", "mem_pothole_001"),
        incident("inc_hist_002", 19, "garbage", 4, "High",
                 "Garbage pile re-appearing every morning outside the vegetable market gate.",
                 "Ward 2, East Market Perimeter", "mem_garbage_002"),
    ])

    await rebuild_links()
    logger.info("Demo city history seeded.")
