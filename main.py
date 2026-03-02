from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import uuid

app = FastAPI(
    title="Smart Patient Request Routing", 
    description="TetherX Hackathon Backend - SLA Tracking & Routing System", 
    version="2.0.0"
)

# Optional: Mount the static directory to serve HTML/CSS/JS frontend
# Make sure the "static" folder exists in your directory!
import os
if not os.path.exists("static"):
    os.makedirs("static")
    
app.mount("/app", StaticFiles(directory="static", html=True), name="static")

# --- In-memory database (dictionary) ---
db = {}

doctors_db = {
    "dr_smith": {"id": "dr_smith", "name": "Dr. Smith", "specialty": "Cardiology", "available": True},
    "dr_jones": {"id": "dr_jones", "name": "Dr. Jones", "specialty": "General", "available": True},
    "dr_lee": {"id": "dr_lee", "name": "Dr. Lee", "specialty": "Orthopedics", "available": False},
}

# --- Pydantic Models ---
class RequestCreate(BaseModel):
    patient_name: str
    request_type: str  # e.g., "Heart Pain", "General Checkup", "Broken Leg"
    priority: str      # "Low", "Medium", "High", "Emergency"
    description: str
    media_url: Optional[str] = None # Mock URL to the uploaded image/audio/video
    media_type: Optional[str] = None # e.g. "image", "audio", "video"

class StatusUpdate(BaseModel):
    status: str        # e.g., "Assigned", "In Progress", "Completed"

# --- Helper Functions ---
def determine_specialty_and_doctor(req_type: str) -> dict:
    """Rule-based routing logic to find specialty and available doctor"""
    req_type_lower = req_type.lower()
    
    # Simple NLP rules
    if "heart" in req_type_lower or "cardio" in req_type_lower or "chest" in req_type_lower:
        specialty = "Cardiology"
    elif "bone" in req_type_lower or "fracture" in req_type_lower or "broken" in req_type_lower:
        specialty = "Orthopedics"
    else:
        specialty = "General"
        
    # Find available doctor
    assigned_doctor = None
    for doc in doctors_db.values():
        if doc["specialty"] == specialty and doc["available"]:
            assigned_doctor = doc["id"]
            break # Found an available doctor
            
    # Default to general if specialty doctor unavailable
    if not assigned_doctor and specialty != "General":
        for doc in doctors_db.values():
             if doc["specialty"] == "General" and doc["available"]:
                 assigned_doctor = doc["id"]
                 break
    
    return {
        "specialty": specialty,
        "assigned_doctor": assigned_doctor
    }

def check_sla(req: dict):
    """SLA Monitoring: Flags request if delayed based on rules."""
    if req["status"] == "Completed" or req["is_escalated"]:
        return # Skip if already done or escalated
    
    now = datetime.now()
    age_minutes = (now - req["created_at"]).total_seconds() / 60
    
    should_escalate = False
    
    # Delay detection logic
    if req["priority"] == "Emergency" and age_minutes > 10:
        should_escalate = True
    elif age_minutes > 120:
        should_escalate = True
        
    if should_escalate:
        req["is_escalated"] = True
        req["timeline"].append({
            "action": "AUTOMATIC ESCALATION",
            "timestamp": now.isoformat(),
            "note": f"SLA breached for priority {req['priority']}"
        })

def format_record(req: dict) -> dict:
    """Helper to format datetime objects for JSON response"""
    out = req.copy()
    out["created_at"] = req["created_at"].isoformat()
    out["updated_at"] = req["updated_at"].isoformat()
    return out


# --- Endpoints ---

@app.post("/create-request")
def create_request(req: RequestCreate):
    req_id = str(uuid.uuid4())[:8] # Short clean ID
    now = datetime.now()
    
    routing = determine_specialty_and_doctor(req.request_type)
    
    timeline = [{
        "action": "Request Created",
        "timestamp": now.isoformat(),
        "note": f"Inferred Specialty: {routing['specialty']}"
    }]
    
    if req.media_url:
         timeline.append({
             "action": "Media Attached & Encrypted",
             "timestamp": now.isoformat(),
             "note": f"Attached {req.media_type} using simulated E2E encryption."
         })
    
    status = "Created"
    doc_note = "Awaiting available doctor."
    if routing["assigned_doctor"]:
        status = "Assigned"
        doc_note = f"Automatically routed to {doctors_db[routing['assigned_doctor']]['name']}"
        timeline.append({
            "action": "Automatically Assigned",
            "timestamp": now.isoformat(),
            "note": doc_note
        })
    
    new_record = {
        "id": req_id,
        "patient_name": req.patient_name,
        "request_type": req.request_type,
        "priority": req.priority,
        "description": req.description,
        "media_url": req.media_url,
        "media_type": req.media_type,
        "specialty": routing["specialty"],
        "assigned_doctor": routing["assigned_doctor"],
        "status": status,
        "is_escalated": False,
        "created_at": now,
        "updated_at": now,
        "timeline": timeline
    }
    db[req_id] = new_record
    return {"message": "Request created successfully", "data": format_record(new_record)}

@app.get("/requests")
def get_requests(patient_name: str = None, doctor_id: str = None):
    # Update SLA dynamically for all active requests before returning
    for req in db.values():
        check_sla(req)
    
    results = db.values()
    if patient_name:
        results = [r for r in results if r["patient_name"].lower() == patient_name.lower()]
    if doctor_id:
        results = [r for r in results if r["assigned_doctor"] == doctor_id]
        
    # Sort by creation time (newest first)
    sorted_reqs = sorted(results, key=lambda x: x["created_at"], reverse=True)
    return {"data": [format_record(r) for r in sorted_reqs]}

@app.patch("/update-status/{req_id}")
def update_status(req_id: str, update: StatusUpdate):
    if req_id not in db:
        raise HTTPException(status_code=404, detail="Request not found")
        
    req = db[req_id]
    check_sla(req) # Check SLA before updating
    
    now = datetime.now()
    req["status"] = update.status
    req["updated_at"] = now
    req["timeline"].append({
        "action": f"Status updated to {update.status}",
        "timestamp": now.isoformat()
    })
    
    return {"message": "Status updated successfully", "data": format_record(req)}

@app.get("/stats")
def get_stats():
    total = len(db)
    pending = 0
    completed = 0
    escalated = 0
    
    for req in db.values():
        check_sla(req)  # Re-evaluate SLAs
        if req["is_escalated"]:
            escalated += 1
        
        if req["status"] == "Completed":
            completed += 1
        else:
            pending += 1
            
    return {
        "total_requests": total,
        "pending": pending,
        "completed": completed,
        "escalated": escalated
    }

@app.get("/doctors")
def get_doctors():
    return doctors_db

# --- Sample Data Seeding (Best for Demo!) ---
@app.on_event("startup")
def startup_event():
    # Seed 1: ER Request backdated 15 minutes (Will auto-escalate immediately on demo!)
    id1 = "REQ-1001"
    past_time1 = datetime.now() - timedelta(minutes=15)
    db[id1] = {
        "id": id1,
        "patient_name": "Demo Patient",
        "request_type": "Severe Chest Pain",
        "priority": "Emergency",
        "description": "Patient experiencing crushing chest pain.",
        "media_url": None,
        "media_type": None,
        "specialty": "Cardiology",
        "assigned_doctor": "dr_smith",
        "status": "In Progress",
        "is_escalated": False, 
        "created_at": past_time1,
        "updated_at": past_time1,
        "timeline": [{"action": "Automatically Assigned", "timestamp": past_time1.isoformat(), "note": "Routed to Dr. Smith"}]
    }
