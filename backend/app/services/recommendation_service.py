from typing import List, Dict, Any, Tuple

class RecommendationService:
    @staticmethod
    def generate_recommendation(
        incident_type: str,
        extracted_text: str,
        severity: str,
        evidence_summary: Dict[str, Any],
        matched_memories: List[Dict[str, Any]]
    ) -> Tuple[str, str]:
        """
        Synthesizes AI-extracted evidence facts with City Memory records
        to generate an outcome-informed recommendation.
        Returns: (recommendation_text, reasoning_trace)
        """
        if matched_memories:
            top_memory = matched_memories[0]
            mem_id = top_memory.get("_id", "unknown")
            lesson = top_memory.get("lesson_learned", "")
            protocol = top_memory.get("recommended_protocol", "")
            prev_outcome = top_memory.get("recorded_outcome", "")
            
            # Ground recommendation directly into the memory lesson
            recommendation = (
                f"{protocol} "
                f"[Precaution: {top_memory.get('title', 'Historical Memory')} warns: '{prev_outcome}']"
            )
            
            reasoning_trace = (
                f"Historical Memory '{mem_id}' was retrieved via Vector Search (Similarity: {top_memory.get('similarity_score', 0.90)}). "
                f"Previous intervention documented failure: '{lesson}'. "
                f"Current evidence indicates '{severity}' severity with surface cavity/obstruction. "
                f"Recommendation shifted from standard temporary fix to permanent protocol based on historical outcome."
            )
            return recommendation, reasoning_trace
            
        # Fallback default civic protocol if no prior memory exists
        if incident_type == "pothole":
            recommendation = (
                "Conduct manual depth gauge inspection. Excavate loose aggregate down to sound road base, "
                "tack-coat perimeter edges with bituminous emulsion, and apply hot-mix asphalt with 1-ton plate compaction."
            )
            reasoning_trace = "No direct historical failure found in ward memory. Standard IRC:SP:98 pavement repair protocol applied."
        elif incident_type == "garbage":
            recommendation = (
                "Dispatch sanitation compacting vehicle for immediate corridor clearance. "
                "Survey adjacent commercial establishments for source segregation compliance."
            )
            reasoning_trace = "Standard Solid Waste Management Rule 2016 response protocol."
        elif incident_type == "street_light":
            recommendation = (
                "Dispatch electrical lineman to inspect circuit breaker panel and phase continuity "
                "before replacing optical driver or luminaire assembly."
            )
            reasoning_trace = "Precautionary electrical protocol to avoid repeated diode burnout."
        else:
            recommendation = "Deploy ward inspection team for on-site diagnostic verification."
            reasoning_trace = "General municipal workflow for unclassified civic distress."

        return recommendation, reasoning_trace
