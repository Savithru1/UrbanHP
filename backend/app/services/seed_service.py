import logging
from datetime import datetime, timedelta
from app.core.database import get_database

logger = logging.getLogger("urbanhp.seed")

async def seed_initial_data():
    """Seeds rich civic intelligence memory data into MongoDB Compass collections."""
    db = get_database()
    
    count_memories = await db.memories.count_documents({})
    if count_memories > 0:
        logger.info(f"Database already has {count_memories} memories. Skipping initial seeding.")
        return
    
    logger.info("Seeding UrbanHP City Memory universe into MongoDB...")
    
    now = datetime.utcnow()
    
    # 1. Historical Memories
    memories = [
        {
            "_id": "mem_pothole_001",
            "title": "Sector 4 Junction Sub-base Saturation",
            "incident_type": "pothole",
            "location_tag": "Ward 4, Sector 7 Junction / Main Road",
            "lesson_learned": "Repeated cold-mix asphalt patching on Sector 4 road repeatedly failed within 72 hours due to unaddressed stormwater drain overflow saturating the aggregate sub-base.",
            "historical_action_taken": "Contractor applied 40mm quick cold-mix asphalt patch without clearing blocked roadside culvert.",
            "recorded_outcome": "Asphalt washed away after 2 days of rain; pothole deepened to 14cm depth creating high vehicle hazard.",
            "recurrence_risk": "critical",
            "recommended_protocol": "MANDATORY: Clear adjacent stormwater culvert first. Use hot-mix polymer modified bitumen (PMB) with mechanical compaction and geotextile sub-base reinforcement.",
            "confidence": 0.94,
            "is_validated": True,
            "created_at": now - timedelta(days=25),
            "updated_at": now - timedelta(days=25)
        },
        {
            "_id": "mem_garbage_002",
            "title": "East Market Commercial Dump Site Recurrence",
            "incident_type": "garbage",
            "location_tag": "Ward 2, East Market Perimeter",
            "lesson_learned": "Morning garbage truck collection fails to eliminate blackspot because commercial vendors dump refuse between 11 PM and 3 AM.",
            "historical_action_taken": "Standard municipal truck dispatched for 8:00 AM collection.",
            "recorded_outcome": "Blackspot re-accumulated within 6 hours with decaying organic matter and stray animal hazard.",
            "recurrence_risk": "high",
            "recommended_protocol": "Install high-capacity 2.5 cubic meter closed dumper placer bin and schedule night shift clearance at 1:30 AM with spot-fining CCTV deterrence.",
            "confidence": 0.89,
            "is_validated": True,
            "created_at": now - timedelta(days=18),
            "updated_at": now - timedelta(days=18)
        },
        {
            "_id": "mem_light_003",
            "title": "Ring Road High-Mast Voltage Sag Pattern",
            "incident_type": "street_light",
            "location_tag": "Ward 8, Outer Ring Road KM 14",
            "lesson_learned": "Flickering and blown sodium-vapor luminaire caused by underground neutral grounding fault at Feeder Box 4B, not lamp failure.",
            "historical_action_taken": "Technician replaced 250W HPS lamp bulb three consecutive times.",
            "recorded_outcome": "Lamps burned out within 48 hours; entire 600m arterial segment plunged into darkness.",
            "recurrence_risk": "critical",
            "recommended_protocol": "Do not replace individual lamps. Dispatch electrical crew with earth resistance tester to rebuild grounding neutral wire and replace corroded MCB inside Feeder Box 4B.",
            "confidence": 0.96,
            "is_validated": True,
            "created_at": now - timedelta(days=12),
            "updated_at": now - timedelta(days=12)
        },
        {
            "_id": "mem_drain_004",
            "title": "Railway Underpass Invert Silt Accumulation",
            "incident_type": "drainage",
            "location_tag": "Ward 5, Railway Underpass Low Point",
            "lesson_learned": "Deploying suction pumps alone during flooding leaves 0.8m compacted silt in the downstream siphon box culvert.",
            "historical_action_taken": "Temporary emergency diesel water pump operated for 6 hours.",
            "recorded_outcome": "Flooding subsided temporarily, but recurred in next rainfall after 15 minutes of 10mm/hr precipitation.",
            "recurrence_risk": "high",
            "recommended_protocol": "Deploy high-pressure super-sucker de-silting vehicle to clear siphon barrel, then inspect intake trash screen for polymer waste obstruction.",
            "confidence": 0.92,
            "is_validated": True,
            "created_at": now - timedelta(days=8),
            "updated_at": now - timedelta(days=8)
        }
    ]
    await db.memories.insert_many(memories)
    
    # 2. Historical Actions & Outcomes linked to past incidents
    actions = [
        {
            "_id": "act_hist_001",
            "incident_id": "inc_hist_001",
            "action_type": "temporary_repair",
            "assigned_department": "Road Maintenance & Pavements",
            "contractor": "Apex Infra Works",
            "notes": "Applied cold asphalt patch on Sector 4 road surface.",
            "status": "completed",
            "created_at": now - timedelta(days=26)
        },
        {
            "_id": "act_hist_002",
            "incident_id": "inc_hist_002",
            "action_type": "scheduled_clearance",
            "assigned_department": "Solid Waste Management",
            "contractor": "CleanCity Services",
            "notes": "Morning manual clearance of market perimeter.",
            "status": "completed",
            "created_at": now - timedelta(days=19)
        }
    ]
    await db.actions.insert_many(actions)
    
    outcomes = [
        {
            "_id": "out_hist_001",
            "action_id": "act_hist_001",
            "incident_id": "inc_hist_001",
            "observation": "Cold asphalt patch washed out completely after 48 hours of rain. Pothole deepened.",
            "recurrence_detected": True,
            "days_to_recurrence": 2,
            "inspector_notes": "Drainage seepage from adjacent choked gutter destabilized gravel layer.",
            "created_at": now - timedelta(days=25)
        },
        {
            "_id": "out_hist_002",
            "action_id": "act_hist_002",
            "incident_id": "inc_hist_002",
            "observation": "Trash heap re-accumulated the same night by wholesale market vendors.",
            "recurrence_detected": True,
            "days_to_recurrence": 1,
            "inspector_notes": "Commercial food waste requires heavy closed bin and night patrolling.",
            "created_at": now - timedelta(days=18)
        }
    ]
    await db.outcomes.insert_many(outcomes)
    
    # 3. Seeded Historical Incidents
    historical_incidents = [
        {
            "_id": "inc_hist_001",
            "input_type": "image",
            "incident_type": "pothole",
            "processing_status": "completed",
            "verification_status": "verified",
            "severity": "critical",
            "raw_content": "Pothole at Sector 4 Junction causing vehicle swerving",
            "extracted_text": "Visual analysis identified deep crater (~12cm) on asphalt pavement near storm drain culvert.",
            "location": "Ward 4, Sector 7 Junction / Main Road",
            "confidence_score": 0.95,
            "original_file_id": None,
            "file_url": "/sample_evidence/pothole_sample.jpg",
            "evidence_summary": {
                "detected_defects": ["Asphalt cratering", "Sub-base gravel displacement", "Water accumulation edge"],
                "estimated_depth_cm": 12,
                "hazard_rating": "Severe"
            },
            "related_memory_ids": ["mem_pothole_001"],
            "recommendation": "Sub-base saturation detected: Clear adjacent stormwater culvert before deploying hot-mix PMB asphalt compaction.",
            "reasoning_trace": "Retrieved historical failure mem_pothole_001 where cold-mix failed due to stormwater overflow.",
            "version": 4,
            "processing_stages": [
                {"stage": "received", "timestamp": (now - timedelta(days=26)).isoformat()},
                {"stage": "extracted", "timestamp": (now - timedelta(days=26)).isoformat()},
                {"stage": "memory_linked", "timestamp": (now - timedelta(days=26)).isoformat()},
                {"stage": "completed", "timestamp": (now - timedelta(days=26)).isoformat()}
            ],
            "created_at": now - timedelta(days=26),
            "updated_at": now - timedelta(days=26)
        },
        {
            "_id": "inc_hist_002",
            "input_type": "text",
            "incident_type": "garbage",
            "processing_status": "completed",
            "verification_status": "verified",
            "severity": "high",
            "raw_content": "Uncontrolled garbage dump pile re-appearing every morning outside vegetable market gate",
            "extracted_text": "Commercial organic vegetable waste and packaging boxes dumped on public sidewalk.",
            "location": "Ward 2, East Market Perimeter",
            "confidence_score": 0.91,
            "original_file_id": None,
            "file_url": None,
            "evidence_summary": {
                "detected_defects": ["Sidewalk blockage", "Organic decomposition", "Stray animal attraction"],
                "hazard_rating": "High"
            },
            "related_memory_ids": ["mem_garbage_002"],
            "recommendation": "Deploy enclosed 2.5m³ dumper placer bin with scheduled 1:30 AM night clearance.",
            "reasoning_trace": "Matched with mem_garbage_002: vendor dumping occurs at night.",
            "version": 4,
            "processing_stages": [
                {"stage": "received", "timestamp": (now - timedelta(days=19)).isoformat()},
                {"stage": "completed", "timestamp": (now - timedelta(days=19)).isoformat()}
            ],
            "created_at": now - timedelta(days=19),
            "updated_at": now - timedelta(days=19)
        }
    ]
    await db.incidents.insert_many(historical_incidents)
    
    logger.info("UrbanHP initial data seeded successfully into MongoDB.")
