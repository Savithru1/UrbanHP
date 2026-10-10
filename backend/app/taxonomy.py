"""
The civic issue taxonomy: every kind of irregularity UrbanHP knows how to find.

This is the single source of truth. It drives the vision detector (prompts),
the text analyser (keywords), and is mirrored into the `issue_types` collection
so every detection in MongoDB points at a documented meaning.
"""
from dataclasses import dataclass, field
from typing import Dict, List


@dataclass(frozen=True)
class IssueType:
    id: str
    label: str
    plural: str
    department: str
    description: str
    default_action: str
    # Stage 1 (what): sentences the scene classifier scores the picture against.
    scene_prompts: List[str]
    # Stage 2 (where): short noun phrases the box detector localises.
    locate_prompts: List[str]
    # Words / phrases that indicate this issue in a written complaint.
    keywords: List[str]
    # How citizens typically phrase it; used for semantic matching when no keyword hits.
    examples: List[str] = field(default_factory=list)
    # Things that look similar but are fine; the issue must score higher than all of these.
    lookalikes: List[str] = field(default_factory=list)
    # How sure the scene classifier must be before this issue is considered present.
    min_score: float = 0.30
    # True for issues that are easy to confuse at a glance: reported only with a verified box.
    box_required: bool = False
    # Largest share of the frame a single box may cover (filters "whole image" boxes).
    max_area: float = 0.70
    # Shifts the size-based severity: 0 = cosmetic (-1), 1 = normal, 2 = dangerous (+1).
    hazard: int = 1


ISSUE_TYPES: List[IssueType] = [
    IssueType(
        id="pothole",
        label="Pothole",
        plural="potholes",
        department="Roads & Pavements",
        description="A hole or cavity in the road surface where the pavement has broken away.",
        default_action="Cut out loose material to a sound base, tack-coat the edges and fill with compacted hot-mix asphalt.",
        scene_prompts=["a pothole in the road", "a road with potholes", "a hole in the asphalt"],
        locate_prompts=["pothole"],
        keywords=["pothole", "pot hole", "crater", "hole in the road", "hole on the road", "road has a hole", "pit in the road", "cavity"],
        examples=["There is a deep hole in the middle of the road.", "Vehicles are getting damaged by the pits on this street."],
        max_area=0.60,
        hazard=1,
        lookalikes=["a closed manhole cover", "a shadow on a smooth road"],
    ),
    IssueType(
        id="road_crack",
        label="Road crack",
        plural="road cracks",
        department="Roads & Pavements",
        description="Cracking of the road or pavement surface (linear, block or alligator cracking).",
        default_action="Rout and seal the cracks; schedule resurfacing if cracking is interconnected (alligator pattern).",
        scene_prompts=["a cracked road surface", "cracks in the asphalt", "cracked pavement"],
        locate_prompts=["crack"],
        keywords=["crack", "cracked", "cracks", "cracking", "fissure", "broken road", "road is broken", "damaged road", "road damage", "uneven road"],
        examples=["The road surface is in a terrible state and breaking apart.", "The pavement is damaged and bumpy to drive on."],
        max_area=0.75,
        hazard=0,
        lookalikes=["a painted line on a smooth road"],
    ),
    IssueType(
        id="fallen_tree",
        label="Fallen tree",
        plural="fallen trees",
        department="Parks & Emergency Response",
        description="A tree or large branch that has fallen and is lying on or across a road or path.",
        default_action="Cordon off the area, check for trapped power lines, then cut and clear the tree from the carriageway.",
        scene_prompts=["a fallen tree blocking the road", "a tree that has fallen over", "an uprooted tree lying on the ground", "a fallen tree lying across a path"],
        locate_prompts=["fallen tree", "tree trunk"],
        keywords=["fallen tree", "tree fell", "tree has fallen", "tree fallen", "uprooted", "tree blocking", "tree on the road", "fallen branch", "branch fell", "tree down", "tree is down"],
        examples=["A tree came down in the storm and is lying across the street.", "A large branch broke off and landed on the footpath."],
        max_area=0.90,
        hazard=2,
        lookalikes=["a healthy standing tree"],
    ),
    IssueType(
        id="road_obstruction",
        label="Road obstruction",
        plural="road obstructions",
        department="Roads & Pavements",
        description="Debris, rubble, rocks or other material lying on the road and blocking traffic.",
        default_action="Remove the obstruction and inspect the surface underneath for damage.",
        scene_prompts=["debris scattered on the road", "rubble blocking the street", "rocks lying on the road"],
        locate_prompts=["debris", "rubble"],
        min_score=0.60,
        keywords=["debris", "rubble", "obstruction", "obstacle", "blocking the road", "road blocked", "road is blocked", "rocks on the road", "boulder", "landslide", "construction material"],
        examples=["Something is lying on the road and vehicles cannot pass.", "Construction material has been left in the middle of the street."],
        max_area=0.80,
        hazard=1,
    ),
    IssueType(
        id="broken_streetlight",
        label="Broken street light",
        plural="broken street lights",
        department="Electrical & Street Lighting",
        description="A street light that is damaged, bent, fallen, hanging loose or not working.",
        default_action="Isolate the circuit, inspect the pole, wiring and feeder panel, then repair or replace the luminaire.",
        scene_prompts=["a broken street light", "a damaged street lamp", "a fallen lamp post", "a bent light pole"],
        locate_prompts=["street light", "lamp post", "pole"],
        keywords=["street light", "streetlight", "street lamp", "lamp post", "lamppost", "light pole", "lights are not working", "light is not working", "light not working", "no light", "pitch dark", "lights are off", "flickering", "flickers", "flicker"],
        examples=["The lamp at the corner flickers and goes off at night.", "Our lane is completely dark at night because the lights are out."],
        max_area=0.70,
        hazard=1,
        lookalikes=["a working street light", "an intact lamp post standing upright"],
    ),
    IssueType(
        id="fallen_wire",
        label="Fallen / hanging wire",
        plural="fallen / hanging wires",
        department="Electrical & Street Lighting",
        description="A power or utility cable that has fallen, is hanging low or is lying on the ground.",
        default_action="Treat as live: keep people away, cut power to the line and re-string or remove the cable.",
        scene_prompts=["a fallen power line", "electrical wires hanging down", "a downed utility pole with cables"],
        locate_prompts=["utility pole", "power line"],
        keywords=["wire", "wires", "cable", "power line", "live wire", "hanging wire", "sparking", "electric pole", "electrical pole", "transformer"],
        examples=["An electric cable snapped and is lying on the ground.", "Loose wiring is dangling low over the footpath."],
        max_area=0.80,
        hazard=2,
        lookalikes=["overhead power lines on upright poles"],
    ),
    IssueType(
        id="water_leak",
        label="Water leak",
        plural="water leaks",
        department="Water Supply",
        description="Water escaping from a burst, broken or leaking pipe or main.",
        default_action="Shut the nearest valve, excavate and repair or replace the damaged pipe section, then reinstate the surface.",
        scene_prompts=["water gushing from a burst pipe", "a burst water main", "a leaking pipe"],
        locate_prompts=["water spray", "leaking pipe"],
        keywords=["leak", "leaking", "leakage", "burst pipe", "pipe burst", "broken pipe", "pipeline", "water main", "water is flowing", "water gushing", "water wastage", "pipe"],
        examples=["Drinking water is pouring out of the ground and being wasted.", "The supply line is damaged and water is spraying onto the street."],
        max_area=0.80,
        hazard=1,
        lookalikes=["a decorative fountain"],
    ),
    IssueType(
        id="waterlogging",
        label="Waterlogging",
        plural="waterlogged areas",
        department="Stormwater & Drainage",
        description="Standing water or flooding on a road or footpath, usually from blocked or overflowing drains.",
        default_action="Pump out standing water, de-silt the nearest drain and check the outfall for blockage.",
        scene_prompts=["a flooded street", "a waterlogged road", "standing water covering the road"],
        locate_prompts=["puddle", "flood water"],
        keywords=["waterlogging", "waterlogged", "water logging", "flood", "flooded", "flooding", "stagnant water", "standing water", "overflowing drain", "drain is overflowing", "drain overflow", "blocked drain", "clogged drain", "sewage", "sewer", "gutter", "puddle", "under water", "submerged", "water on the road"],
        examples=["The underpass is under two feet of water after the rain.", "Rainwater is not draining and the street is submerged."],
        max_area=0.90,
        hazard=1,
        lookalikes=["a river", "a lake", "a wet road after rain"],
    ),
    IssueType(
        id="open_manhole",
        label="Open manhole",
        plural="open manholes",
        department="Stormwater & Drainage",
        description="A manhole or drain opening with a missing, broken or displaced cover.",
        default_action="Barricade immediately and fit a replacement cover of the correct load class.",
        scene_prompts=["an open manhole", "a manhole with a missing cover", "an open manhole with no lid"],
        locate_prompts=["manhole"],
        keywords=["manhole", "man hole", "missing cover", "open drain", "drain cover", "uncovered drain"],
        examples=["The cover of the drain is missing and someone could fall in.", "There is an uncovered opening in the middle of the footpath."],
        max_area=0.50,
        hazard=2,
        lookalikes=["a manhole cover", "a closed manhole cover", "a pothole in the road", "a storm drain grate"],
        box_required=True,
    ),
    IssueType(
        id="garbage",
        label="Garbage dump",
        plural="garbage dumps",
        department="Solid Waste Management",
        description="Uncollected garbage, litter or illegally dumped waste in a public place.",
        default_action="Clear the waste, disinfect the spot and review the collection schedule for this location.",
        scene_prompts=["a pile of garbage on the street", "trash dumped on the roadside", "overflowing garbage bags"],
        locate_prompts=["garbage", "trash"],
        keywords=["garbage", "trash", "rubbish", "litter", "waste", "dump", "dumping", "dustbin", "bin is overflowing", "overflowing bin", "stink", "smell"],
        examples=["Rubbish has been piling up on the corner and nobody collects it.", "The area smells because of rotting refuse on the roadside."],
        max_area=0.90,
        hazard=0,
    ),
    IssueType(
        id="damaged_sign",
        label="Damaged sign",
        plural="damaged signs",
        department="Traffic Engineering",
        description="A traffic or street sign that is broken, bent or knocked over.",
        default_action="Replace or re-erect the sign and confirm it is visible to approaching traffic.",
        scene_prompts=["a broken traffic sign", "a knocked down road sign", "a road sign lying on the ground", "a bent traffic sign"],
        locate_prompts=["traffic sign", "road sign"],
        keywords=["traffic sign", "road sign", "street sign", "sign board", "signboard", "signal is not working", "traffic light", "traffic signal", "guard rail", "railing", "barrier", "divider"],
        examples=["The stop sign was knocked over by a truck.", "The crash barrier on the bridge is bent and loose."],
        max_area=0.60,
        hazard=1,
        lookalikes=["an intact traffic sign standing upright", "a guard rail"],
    ),
]

# Catch-all used when a written report clearly describes a problem we cannot classify.
OTHER = IssueType(
    id="other",
    label="Unclassified problem",
    plural="unclassified problems",
    department="Ward Inspection",
    description="A reported civic problem that does not fit a known category and needs an inspector to classify.",
    default_action="Send a ward inspector to assess the site and classify the problem.",
    scene_prompts=[],
    locate_prompts=[],
    keywords=[],
    hazard=0,
)

# What a picture with nothing wrong looks like. An issue is only reported when the
# scene classifier finds it more likely than every one of these.
NORMAL_SCENES = [
    "a clean road in good condition",
    "an ordinary street",
    "a normal city street scene",
    "a building",
    "a natural landscape",
    "a forest",
    "a vehicle",
    "people",
    "an object on a plain background",
]

BY_ID: Dict[str, IssueType] = {t.id: t for t in ISSUE_TYPES + [OTHER]}

SEVERITY_LABELS = {1: "Minor", 2: "Low", 3: "Moderate", 4: "High", 5: "Critical"}


def severity_from_area(issue: IssueType, area_fraction: float) -> int:
    """
    Estimate a 1-5 severity from how much of the frame the defect covers,
    raised for inherently dangerous issue types. This is a visual estimate,
    not a physical measurement.
    """
    pct = area_fraction * 100
    if pct < 0.5:
        size = 1
    elif pct < 2.5:
        size = 2
    elif pct < 8:
        size = 3
    elif pct < 20:
        size = 4
    else:
        size = 5
    return max(1, min(5, size + issue.hazard - 1))


def severity_from_hazard(issue: IssueType) -> int:
    """Severity when the size is unknown (written reports, roughly located detections)."""
    return max(1, min(5, 2 + issue.hazard))


def as_documents() -> List[dict]:
    """Taxonomy as MongoDB documents for the `issue_types` collection."""
    return [
        {
            "_id": t.id,
            "label": t.label,
            "department": t.department,
            "description": t.description,
            "default_action": t.default_action,
            "detector_prompts": t.scene_prompts + t.locate_prompts,
            "text_keywords": t.keywords,
        }
        for t in ISSUE_TYPES + [OTHER]
    ]
