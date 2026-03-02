# 🏥 Smart Patient Request Routing & SLA Tracking System

## TetherX Hackathon Submission

This is a rule-based workflow automation backend that routes patient queries across hospital departments, tracks status changes, and intelligently escalates delayed requests (SLA tracking).

### 🚀 Getting Started (Under 1 Minute)

1. **Install dependencies:**
   ```bash
   pip install fastapi uvicorn pydantic
   ```

2. **Run the server:**
   ```bash
   uvicorn main:app --reload
   ```

3. **Open the Auto-Generated UI (Swagger)**
   Go to: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
   
   *You can test all endpoints directly from this browser UI—no Postman required!*

### 📋 Core Features Demo Script

When showing this to the judges, follow this flow:

1. **Show `GET /stats` or `GET /requests`** 
   - Point out that **REQ-1001** automatically escalated. Why? Because we simulated a 15-minute delay on an "Emergency" request, breaching the 10-minute SLA!
2. **Hit `POST /create-request`**
   - Submit a test report with `request_type`: "Blood Test", `priority`: "Medium". 
   - Notice how it automatically routes to the **"Lab"** department.
3. **Hit `PATCH /update-status/{id}`**
   - Copy the ID of the request you just made and update its status to "In Progress".
4. **Hit `GET /requests` again**
   - Show the `timeline` array. Explain: *"Our timeline logger provides complete accountability. You can see exactly when it was created, routed, and updated."*

### 🧠 Architecture
- **Framework:** FastAPI
- **Database:** In-Memory App State (Optimized for speed/demo)
- **Routing Engine:** Keyword/Rule-based inference
- **SLA Engine:** Dynamic evaluation on read/update hooks.
