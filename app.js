// --- State & Config ---
const GOOGLE_WEB_APP_URL = "";
let currentUser = null;
let pollInterval = null;
let attachedMediaType = null;
let isEncrypting = false;

// Expanded Mock Doctor DB
const doctorsData = {
    dr_smith: { id: 'dr_smith', name: 'Dr. Smith', specialty: 'Cardiology' },
    dr_jones: { id: 'dr_jones', name: 'Dr. Jones', specialty: 'General Medicine' },
    dr_chen: { id: 'dr_chen', name: 'Dr. Chen', specialty: 'Orthopedics' },
    dr_patel: { id: 'dr_patel', name: 'Dr. Patel', specialty: 'Dermatology' },
    dr_williams: { id: 'dr_williams', name: 'Dr. Williams', specialty: 'Pediatrics' }
};

// --- Initialization & UI ---
document.addEventListener('DOMContentLoaded', () => {
    // Hide Loading Screen 
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 600);
    }, 1800);

    setupEventListeners();
    initLocalDB();

    // Auto-login for hackathon testing convenience if desired
    // document.getElementById('p-login-email').value = "patient@health.com";
});

// Create Local DB if not exists
function initLocalDB() {
    if (!localStorage.getItem('tetherx_db')) {
        localStorage.setItem('tetherx_db', JSON.stringify([]));
    }
}

// --- LocalStorage Engine ---
function getDB() {
    return JSON.parse(localStorage.getItem('tetherx_db') || '[]');
}
function saveDB(data) {
    localStorage.setItem('tetherx_db', JSON.stringify(data));
    syncToGoogleSheet(data);
}

// Simulate Google Sheet Sync
async function syncToGoogleSheet(fullData) {
    if (!GOOGLE_WEB_APP_URL) return;
    try {
        const lastRec = fullData[0];
        await fetch(GOOGLE_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save',
                id: lastRec.id,
                patient: lastRec.patient_name,
                type: lastRec.request_type,
                priority: lastRec.priority,
                status: lastRec.status,
                doc: doctorsData[lastRec.assigned_doctor]?.name || 'Auto-Routing'
            })
        });
    } catch (e) { }
}

// --- UI Navigation ---
const views = {
    login: document.getElementById('view-login'),
    patient: document.getElementById('view-patient'),
    doctor: document.getElementById('view-doctor')
};

function switchView(viewName) {
    Object.values(views).forEach(v => {
        if (v.classList.contains('active')) {
            v.style.opacity = '0';
            setTimeout(() => { v.classList.remove('active', 'fade-in-up'); v.classList.add('hidden'); }, 300);
        }
    });

    setTimeout(() => {
        const target = views[viewName];
        target.classList.remove('hidden');
        target.classList.add('active', 'fade-in-up');
        target.style.opacity = '1';

        const controls = document.getElementById('user-controls');
        if (viewName === 'login') {
            controls.classList.add('hidden');
            if (pollInterval) clearInterval(pollInterval);
        } else {
            controls.classList.remove('hidden');
            controls.classList.add('slide-in-right');
            const badge = document.getElementById('current-user-display');
            badge.innerHTML = currentUser.type === 'doctor'
                ? `<i class="fa-solid fa-user-doctor text-primary"></i> ${currentUser.name}`
                : `<i class="fa-solid fa-user text-primary"></i> ${currentUser.name}`;
        }
    }, 350);
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerHTML = `<i class="fa-solid fa-circle-check text-primary"></i> ${msg}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Event Listeners ---
function setupEventListeners() {
    // Login Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            document.querySelector('#patient-login-form').style.display = 'none';
            document.querySelector('#doctor-login-form').style.display = 'none';
            document.getElementById(e.target.dataset.tab).style.display = 'block';
        });
    });

    // Login Submission
    document.getElementById('patient-login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        currentUser = { type: 'patient', name: document.getElementById('p-login-email').value.split('@')[0] };
        switchView('patient');
        loadPatientDashboard();
        startPolling();
    });

    document.getElementById('doctor-login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const docId = document.getElementById('d-login-email').value;
        currentUser = { type: 'doctor', ...doctorsData[docId] };

        document.getElementById('doc-greeting').textContent = `Welcome, ${currentUser.name}`;
        document.getElementById('doc-specialty').textContent = currentUser.specialty;

        switchView('doctor');
        loadDoctorDashboard();
        startPolling();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        currentUser = null; switchView('login');
    });

    // Forms & Media
    document.getElementById('patient-request-form').addEventListener('submit', handlePatientSubmit);

    document.querySelectorAll('.btn-upload').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            attachedMediaType = b.dataset.type;
            const icons = { 'image': 'fa-image', 'audio': 'fa-microphone', 'video': 'fa-video' };
            document.getElementById('media-label').innerHTML = `<i class="fa-solid ${icons[attachedMediaType]}"></i> Encrypted ${attachedMediaType.toUpperCase()}`;
            document.getElementById('attached-media').classList.remove('hidden');
        });
    });

    document.querySelector('.remove-media').addEventListener('click', () => {
        attachedMediaType = null; document.getElementById('attached-media').classList.add('hidden');
    });

    // Refresh Btn
    document.getElementById('refresh-patient-btn').addEventListener('click', () => {
        const i = document.querySelector('#refresh-patient-btn i');
        i.classList.add('fa-spin'); setTimeout(() => i.classList.remove('fa-spin'), 1000);
        loadPatientDashboard();
    });
    document.getElementById('refresh-doc-btn').addEventListener('click', () => {
        const i = document.querySelector('#refresh-doc-btn i');
        i.classList.add('fa-spin'); setTimeout(() => i.classList.remove('fa-spin'), 1000);
        loadDoctorDashboard();
    });

    // Modal
    document.querySelector('.close-modal').addEventListener('click', closeModal);
    document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
        if (currentUser.type === 'patient') loadPatientDashboard(true);
        if (currentUser.type === 'doctor') loadDoctorDashboard(true);

        // Auto-refresh modal if open
        const modalId = document.getElementById('modal-req-id').textContent;
        if (!document.getElementById('details-modal').classList.contains('hidden') && modalId !== "REQ-000") {
            const db = getDB();
            const req = db.find(r => r.id === modalId);
            if (req) openModal(req, true); // Update silently
        }
    }, 3000);
}

// --- Business Logic ---
function inferRouting(queryStr) {
    const q = queryStr.toLowerCase();
    if (q.includes('heart') || q.includes('chest') || q.includes('cardio') || q.includes('blood')) return { spec: 'Cardiology', doc: 'dr_smith' };
    if (q.includes('bone') || q.includes('joint') || q.includes('fracture') || q.includes('leg')) return { spec: 'Orthopedics', doc: 'dr_chen' };
    if (q.includes('skin') || q.includes('rash') || q.includes('acne') || q.includes('itch')) return { spec: 'Dermatology', doc: 'dr_patel' };
    if (q.includes('child') || q.includes('baby') || q.includes('kid') || q.includes('fever')) return { spec: 'Pediatrics', doc: 'dr_williams' };

    return { spec: 'General Medicine', doc: 'dr_jones' };
}

async function handlePatientSubmit(e) {
    e.preventDefault();
    if (isEncrypting) return;

    const submitBtn = document.getElementById('submit-req-btn');
    const overlay = document.getElementById('encryption-overlay');

    const routingInfo = inferRouting(document.getElementById('p-type').value);

    const newReq = {
        id: "REQ-" + Math.floor(Math.random() * 10000),
        patient_name: currentUser.name,
        request_type: document.getElementById('p-type').value,
        priority: document.querySelector('input[name="priority"]:checked').value,
        description: document.getElementById('p-desc').value,
        media_type: attachedMediaType,
        specialty: routingInfo.spec,
        assigned_doctor: routingInfo.doc,
        status: "Assigned",
        is_escalated: false,
        created_at: new Date().toISOString(),
        messages: [], // Secure messaging history
        timeline: [
            { timestamp: new Date().toISOString(), action: "Encrypted Query Submitted" },
            { timestamp: new Date().toISOString(), action: "AI Routing Matrix", note: `Matched by specialty to ${doctorsData[routingInfo.doc].name} (${routingInfo.spec})` }
        ]
    };

    if (attachedMediaType) {
        isEncrypting = true;
        submitBtn.disabled = true;
        overlay.classList.remove('hidden');
        document.querySelector('.progress-bar').style.width = '100%';

        // Slower 2.5s visual delay for "encryption security" feel
        await new Promise(r => setTimeout(r, 2500));

        overlay.classList.add('hidden');
        document.querySelector('.progress-bar').style.width = '0%';
        isEncrypting = false;
        submitBtn.disabled = false;
    }

    // Save to Local DB
    const db = getDB();
    db.unshift(newReq);
    saveDB(db);

    e.target.reset();
    attachedMediaType = null;
    document.getElementById('attached-media').classList.add('hidden');
    loadPatientDashboard();
    showToast("Secure Medical Query Submitted");
}

// --- Renderers ---
function checkEscalation(req) {
    if (req.status === 'Completed' || req.is_escalated) return req;
    const ageMins = (new Date() - new Date(req.created_at)) / 60000;
    if ((req.priority === 'Emergency' && ageMins > 5) || ageMins > 60) {
        req.is_escalated = true;
        req.timeline.unshift({ timestamp: new Date().toISOString(), action: "SYSTEM ALERT: Overdue Routing Escalation" });
    }
    return req;
}

function processDB() {
    const db = getDB();
    const updated = db.map(r => checkEscalation(r));
    saveDB(updated);
    return updated;
}

function renderBadge(status) {
    let style = "";
    if (status === 'Assigned') style = 'status-Assigned';
    else if (status === 'In Progress') style = 'status-InProgress';
    else if (status === 'Awaiting Response') style = 'status-AwaitingResponse';
    else if (status === 'Completed') style = 'status-Completed';
    return `<span class="badge-pill ${style}">${status}</span>`;
}

function loadPatientDashboard(isBackground = false) {
    const reqs = processDB().filter(r => r.patient_name === currentUser.name);
    const list = document.getElementById('patient-queries-list');

    if (reqs.length === 0 && !isBackground) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-heart-pulse fa-3x mb-2" style="color:#e2e8f0;"></i><br>No active medical queries.</div>`;
        return;
    }

    const html = reqs.map(r => `
        <div class="req-card ${r.is_escalated ? 'escalated' : ''} ${r.status === 'Awaiting Response' ? 'awaiting' : ''}" onclick='openModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
            <div class="req-header">
                <div>
                    <div class="req-title">${r.request_type}</div>
                    <div class="req-id"><i class="fa-solid fa-lock"></i> ${r.id}</div>
                </div>
                ${renderBadge(r.status)}
            </div>
            <div class="req-meta">
                <span><i class="fa-regular fa-clock"></i> ${new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span><i class="fa-solid fa-user-doctor"></i> ${doctorsData[r.assigned_doctor]?.name}</span>
                ${r.messages && r.messages.length > 0 ? `<span style="color:var(--secondary); font-weight:600;"><i class="fa-solid fa-envelope"></i> New Message</span>` : ''}
            </div>
        </div>
    `).join('');

    if (list.innerHTML !== html) list.innerHTML = html;
}

function loadDoctorDashboard(isBackground = false) {
    const reqs = processDB().filter(r => r.assigned_doctor === currentUser.id);
    const list = document.getElementById('doctor-queue-list');

    document.getElementById('doc-total-req').textContent = reqs.filter(r => r.status === 'Assigned' || r.status === 'In Progress').length;

    if (reqs.length === 0 && !isBackground) {
        list.innerHTML = `<div style="text-align:center; grid-column: 1/-1; padding: 40px; color: var(--text-muted);"><i class="fa-regular fa-folder-open fa-3x mb-2" style="color:#e2e8f0;"></i><br>Your queue is clear.</div>`;
        return;
    }

    const html = reqs.map(r => `
        <div class="req-card ${r.is_escalated ? 'escalated' : ''}" onclick='openModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
            <div class="req-header">
                <div>
                    <div class="req-title">${r.patient_name} : ${r.request_type}</div>
                    <div class="req-id">${r.id} | Priority: <strong>${r.priority}</strong></div>
                </div>
                ${renderBadge(r.status)}
            </div>
            <div class="req-desc-preview"><i class="fa-solid fa-quote-left" style="color:#cbd5e1; margin-right:5px;"></i> ${r.description}</div>
            <div class="req-meta">
                <span><i class="fa-solid fa-stopwatch"></i> Wait: ${Math.round((new Date() - new Date(r.created_at)) / 60000)} mins</span>
                ${r.media_type ? `<span style="color:var(--primary)"><i class="fa-solid fa-shield-halved"></i> Attachments</span>` : ''}
                ${r.status === 'Awaiting Response' ? `<span style="color:#6366f1"><i class="fa-solid fa-reply"></i> Sent to Patient</span>` : ''}
            </div>
        </div>
    `).join('');

    if (list.innerHTML !== html) list.innerHTML = html;
}

// --- Modals & Messaging ---
function openModal(req, isSilentUpdate = false) {
    // Basic Header
    document.getElementById('modal-req-id').innerHTML = `<i class="fa-solid fa-lock text-primary"></i> ${req.id}`;
    document.getElementById('modal-status-badge').innerHTML = renderBadge(req.status);
    document.getElementById('modal-title').textContent = req.request_type;

    let mediaUI = '';
    if (req.media_type) {
        mediaUI = `
        <div class="info-block flex-center" style="border-color: #34d399; background: #ecfdf5; gap: 15px;">
            <i class="fa-solid fa-file-shield" style="font-size: 32px; color: #10b981;"></i>
            <div>
                <strong style="color: #065f46">Encrypted ${req.media_type.toUpperCase()} Attached</strong>
                <div style="font-size: 13px; color: #059669; margin-top: 2px;">HIPAA-compliant E2E payload. Only you can view this.</div>
            </div>
        </div>
        `;
    }

    // Modal Body text
    document.getElementById('modal-body').innerHTML = `
        <div class="info-block flex-between" style="background:#fff;">
            <div><span class="text-muted">Patient:</span> <strong>${req.patient_name}</strong></div>
            <div>
                <span class="text-muted">Priority:</span> 
                <span style="font-weight:600; color:${req.priority === 'Emergency' ? 'red' : ''}">${req.priority}</span>
            </div>
        </div>
        <div class="info-block">
            <h4 class="mb-1 text-primary"><i class="fa-solid fa-file-medical"></i> Clinical Notes</h4>
            ${req.description}
        </div>
        ${mediaUI}
        
        <div class="timeline">
            ${req.timeline.map(t => `
                <div class="timeline-item">
                    <div class="ti-time">${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div class="ti-action">${t.action}</div>
                    ${t.note ? `<div class="ti-note">${t.note}</div>` : ''}
                </div>
            `).join('')}
        </div>
    `;

    // Advanced Doctor/Patient Messaging Controls
    const zone = document.getElementById('interaction-zone');
    const actions = document.getElementById('modal-actions');
    zone.innerHTML = '';
    actions.innerHTML = '';
    zone.classList.add('hidden');

    // Render existing messages
    if (req.messages && req.messages.length > 0) {
        zone.classList.remove('hidden');
        zone.innerHTML += `
            <div style="margin-bottom: 15px;">
                <h4 class="text-primary"><i class="fa-solid fa-message"></i> Secure Communication Channel</h4>
                <small class="text-muted"><i class="fa-solid fa-lock"></i> E2E Encrypted</small>
            </div>
        `;
        req.messages.forEach(msg => {
            const isDoc = msg.sender === 'Doctor';
            zone.innerHTML += `
                <div class="message-box" style="border-left-color: ${isDoc ? 'var(--primary)' : 'var(--secondary)'}; background: ${isDoc ? '#f0fdf4' : '#eff6ff'};">
                    <div class="message-header" style="color: ${isDoc ? 'var(--primary)' : 'var(--secondary)'}">
                        <i class="fa-solid ${isDoc ? 'fa-user-doctor' : 'fa-user'}"></i> 
                        ${isDoc ? doctorsData[req.assigned_doctor]?.name || 'Doctor' : req.patient_name}
                    </div>
                    <div class="message-content">${msg.text}</div>
                </div>
            `;
        });
    }

    // Doctor Controls
    if (currentUser.type === 'doctor' && req.status !== 'Completed') {
        if (req.status === 'Assigned') {
            actions.innerHTML = `<button class="btn btn-primary btn-full" onclick="updateReq('${req.id}', 'In Progress')">Begin Clinical Review</button>`;
        } else if (req.status === 'In Progress') {
            zone.classList.remove('hidden');
            zone.innerHTML += `
                <div class="mt-2" style="background:#f8fafc; padding:15px; border-radius:12px; border:1px solid var(--border);">
                    <label style="font-weight:600; font-size:14px; margin-bottom:10px; display:block;">Send Secure Message / Invite for OP</label>
                    <textarea id="doc-msg-input" class="form-control mb-1" rows="2" placeholder="e.g. 'I've reviewed this. Please book an OP appointment immediately.'"></textarea>
                    <div class="flex-between">
                        <small class="text-muted"><i class="fa-solid fa-lock"></i> Encrypted transmission</small>
                        <button class="btn btn-secondary btn-sm" onclick="sendMsg('${req.id}', 'Doctor')">Send to Patient</button>
                    </div>
                </div>
            `;
            actions.innerHTML = `<button class="btn btn-outline btn-full text-danger mt-1" style="border-color: var(--danger)" onclick="updateReq('${req.id}', 'Completed')"><i class="fa-solid fa-check"></i> Mark Case Closed</button>`;
        }
    }

    // Patient Controls (If receiving a message to book)
    if (currentUser.type === 'patient' && req.status === 'Awaiting Response') {
        zone.classList.remove('hidden');
        zone.innerHTML += `
            <div class="mt-2" style="background:#fff; padding:20px; border-radius:12px; border:2px dashed var(--secondary); text-align:center;">
                <h3 class="text-secondary mb-1"><i class="fa-regular fa-calendar-check text-secondary"></i> Action Required</h3>
                <p class="text-muted mb-2">The doctor has requested you to book an OP Consultation.</p>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button class="btn btn-secondary pulse-hover" onclick="bookOP('${req.id}')">Confirm OP Booking Now</button>
                    <button class="btn btn-outline" onclick="sendMsg('${req.id}', 'Patient', 'I cannot make an OP appointment at this time.')">Decline</button>
                </div>
            </div>
        `;
    }

    if (!isSilentUpdate) {
        document.getElementById('details-modal').classList.remove('hidden');
    }
}

function closeModal() {
    document.getElementById('details-modal').classList.add('hidden');
}

// Action Handlers
window.updateReq = function (id, newStatus, customNote = null) {
    const db = getDB();
    const req = db.find(r => r.id === id);
    if (req) {
        req.status = newStatus;
        req.timeline.unshift({
            timestamp: new Date().toISOString(),
            action: customNote || `Status updated to ${newStatus}`
        });
        saveDB(db);
        closeModal();
        if (currentUser.type === 'doctor') loadDoctorDashboard();
        if (currentUser.type === 'patient') loadPatientDashboard();
        showToast("System Updated");
    }
}

window.sendMsg = function (id, senderType, overrideText = null) {
    const text = overrideText || document.getElementById('doc-msg-input')?.value;
    if (!text || text.trim() === '') return;

    const db = getDB();
    const req = db.find(r => r.id === id);
    if (req) {
        req.messages = req.messages || [];
        req.messages.push({ sender: senderType, text: text, timestamp: new Date().toISOString() });

        // If Doctor sends message, change status to waiting
        if (senderType === 'Doctor') {
            req.status = 'Awaiting Response';
            req.timeline.unshift({ timestamp: new Date().toISOString(), action: "Secure OP Invite sent to patient" });
        }

        saveDB(db);
        openModal(req); // Re-render modal to show message
        if (senderType === 'Doctor') loadDoctorDashboard();
        showToast("Encrypted Message Sent");
    }
}

window.bookOP = function (id) {
    const db = getDB();
    const req = db.find(r => r.id === id);
    if (req) {
        req.messages.push({ sender: 'Patient', text: 'OP Appointment Confirmed.', timestamp: new Date().toISOString() });
        req.status = 'Completed'; // Conclude the workflow routing bit
        req.timeline.unshift({
            timestamp: new Date().toISOString(),
            action: "OP Appointment Confirmed by Patient",
            note: "Workflow concluded. Handing off to physical scheduling."
        });

        saveDB(db);

        // Success presentation animation
        document.getElementById('interaction-zone').innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--primary);">
                <i class="fa-solid fa-circle-check fa-4x mb-2 pulse-bg" style="border-radius:50%"></i>
                <h2>Booking Confirmed</h2>
                <p>Your secure OP appointment has been scheduled with ${doctorsData[req.assigned_doctor]?.name}.</p>
            </div>
        `;
        document.getElementById('modal-actions').innerHTML = '';

        loadPatientDashboard();
        setTimeout(closeModal, 3000);
    }
}
