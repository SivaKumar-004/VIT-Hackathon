// --- State & Config ---
const GOOGLE_WEB_APP_URL = ""; // PATIENT: Paste your deployed Google Apps Script URL here to sync!
let currentUser = null;
let pollInterval = null;
let attachedMediaType = null;
let isEncrypting = false;

// Mock Doctor DB
const doctorsData = {
    dr_smith: { id: 'dr_smith', name: 'Dr. Smith', specialty: 'Cardiology' },
    dr_jones: { id: 'dr_jones', name: 'Dr. Jones', specialty: 'General' }
};

// --- Initialization & UI ---
document.addEventListener('DOMContentLoaded', () => {
    // Hide Loading Screen after 1.5s
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }, 1500);

    setupEventListeners();
    initLocalDB();
});

// Create Local DB if not exists
function initLocalDB() {
    if (!localStorage.getItem('tetherx_db')) {
        localStorage.setItem('tetherx_db', JSON.stringify([]));
    }
}

// --- LocalStorage "Backend" Engine ---
function getDB() {
    return JSON.parse(localStorage.getItem('tetherx_db') || '[]');
}
function saveDB(data) {
    localStorage.setItem('tetherx_db', JSON.stringify(data));
    // Hack: Sync to Google Sheet asynchronously if URL provided (fire & forget)
    syncToGoogleSheet(data);
}

// Simulate Google Sheet Sync
async function syncToGoogleSheet(fullData) {
    if (!GOOGLE_WEB_APP_URL) return;
    try {
        // Find last record
        const lastRec = fullData[0];
        await fetch(GOOGLE_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors', // Needed for unauthenticated Apps Script posts from browser
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save',
                id: lastRec.id,
                patient: lastRec.patient_name,
                type: lastRec.request_type,
                priority: lastRec.priority,
                status: lastRec.status,
                doc: lastRec.assigned_doctor
            })
        });
    } catch (e) { console.warn("Google Sheet Sync skipped"); }
}

// --- UI Navigation ---
const views = {
    login: document.getElementById('view-login'),
    patient: document.getElementById('view-patient'),
    doctor: document.getElementById('view-doctor')
};

function switchView(viewName) {
    // Add loading hack
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
                ? `<i class="fa-solid fa-user-doctor"></i> ${currentUser.name}`
                : `<i class="fa-solid fa-user"></i> ${currentUser.name}`;
        }
    }, 350);
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
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
            document.getElementById('media-label').innerHTML = `<i class="fa-solid ${icons[attachedMediaType]}"></i> ${attachedMediaType.toUpperCase()} SECURED`;
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
    }, 4000); // UI updates softly
}

// --- Business Logic ---
function inferRouting(queryStr) {
    const q = queryStr.toLowerCase();
    if (q.includes('heart') || q.includes('chest') || q.includes('cardio')) return { spec: 'Cardiology', doc: 'dr_smith' };
    return { spec: 'General', doc: 'dr_jones' };
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
        timeline: [
            { timestamp: new Date().toISOString(), action: "Query Created & Encrypted" },
            { timestamp: new Date().toISOString(), action: "AI Routing", note: `Routed to ${doctorsData[routingInfo.doc].name} (${routingInfo.spec})` }
        ]
    };

    if (attachedMediaType) {
        isEncrypting = true;
        submitBtn.disabled = true;
        overlay.classList.remove('hidden');
        document.querySelector('.progress-bar').style.width = '100%';

        await new Promise(r => setTimeout(r, 2000)); // 2s visual delay for "security"

        overlay.classList.add('hidden');
        document.querySelector('.progress-bar').style.width = '0%';
        isEncrypting = false;
        submitBtn.disabled = false;
    }

    // Save to Local DB
    const db = getDB();
    db.unshift(newReq); // Add to top
    saveDB(db);

    e.target.reset();
    attachedMediaType = null;
    document.getElementById('attached-media').classList.add('hidden');
    loadPatientDashboard();
    showToast("Query Submitted Securely");
}

// --- Renderers ---
function checkEscalation(req) {
    if (req.status === 'Completed' || req.is_escalated) return req;
    const ageMins = (new Date() - new Date(req.created_at)) / 60000;
    if ((req.priority === 'Emergency' && ageMins > 5) || ageMins > 60) {
        req.is_escalated = true;
        req.timeline.unshift({ timestamp: new Date().toISOString(), action: "ESCALATED: Overdue Alert" });
    }
    return req;
}

function processDB() {
    const db = getDB();
    const updated = db.map(r => checkEscalation(r));
    saveDB(updated);
    return updated;
}

function loadPatientDashboard(isBackground = false) {
    const reqs = processDB().filter(r => r.patient_name === currentUser.name);
    const list = document.getElementById('patient-queries-list');

    if (reqs.length === 0 && !isBackground) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);">No active health queries.</div>`;
        return;
    }

    const html = reqs.map(r => `
        <div class="req-card ${r.is_escalated ? 'escalated' : ''}" onclick='openModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
            <div class="req-header">
                <div>
                    <div class="req-title">${r.request_type}</div>
                    <div class="req-id">${r.id}</div>
                </div>
                <span class="badge-pill status-${r.status.replace(' ', '')}">${r.status}</span>
            </div>
            <div class="req-meta">
                <span><i class="fa-regular fa-clock"></i> ${new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span><i class="fa-solid fa-stethoscope"></i> ${r.specialty}</span>
                ${r.media_type ? `<span style="color:var(--primary)"><i class="fa-solid fa-shield-halved"></i> E2E Encrypted</span>` : ''}
            </div>
        </div>
    `).join('');

    if (list.innerHTML !== html) list.innerHTML = html;
}

function loadDoctorDashboard(isBackground = false) {
    const reqs = processDB().filter(r => r.assigned_doctor === currentUser.id);
    const list = document.getElementById('doctor-queue-list');

    document.getElementById('doc-total-req').textContent = reqs.filter(r => r.status !== 'Completed').length;

    if (reqs.length === 0 && !isBackground) {
        list.innerHTML = `<div style="text-align:center; grid-column: 1/-1; padding: 40px; color: var(--text-muted);">Your queue is empty.</div>`;
        return;
    }

    const html = reqs.map(r => `
        <div class="req-card ${r.is_escalated ? 'escalated' : ''}" onclick='openModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
            <div class="req-header">
                <div>
                    <div class="req-title">${r.patient_name} : ${r.request_type}</div>
                    <div class="req-id">${r.id} | Priority: <strong>${r.priority}</strong></div>
                </div>
                <span class="badge-pill status-${r.status.replace(' ', '')}">${r.status}</span>
            </div>
            <div class="req-desc-preview">${r.description}</div>
            <div class="req-meta">
                <span>Wait: ${Math.round((new Date() - new Date(r.created_at)) / 60000)} mins</span>
            </div>
        </div>
    `).join('');

    if (list.innerHTML !== html) list.innerHTML = html;
}

// --- Modals ---
function openModal(req) {
    document.getElementById('modal-req-id').textContent = req.id;
    document.getElementById('modal-status-badge').className = `badge-pill status-${req.status.replace(' ', '')}`;
    document.getElementById('modal-status-badge').textContent = req.status;
    document.getElementById('modal-title').textContent = req.request_type;

    let mediaUI = '';
    if (req.media_type) {
        mediaUI = `
        <div class="info-block" style="border-color: #34d399; background: #ecfdf5; text-align: center;">
            <i class="fa-solid fa-file-shield" style="font-size: 32px; color: #10b981; margin-bottom: 10px;"></i><br>
            <strong>Encrypted ${req.media_type.toUpperCase()} payload</strong>
            <div style="font-size: 13px; color: #065f46; margin-top: 5px;">Only authenticated endpoints can decrypt.</div>
        </div>
        `;
    }

    document.getElementById('modal-body').innerHTML = `
        <div class="info-block flex-between">
            <div><strong>Patient:</strong> ${req.patient_name}</div>
            <div><strong>Priority:</strong> <span style="color:${req.priority === 'Emergency' ? 'red' : ''}">${req.priority}</span></div>
        </div>
        <div class="info-block" style="background:#fff;">
            <strong>Medical Notes:</strong><br>
            ${req.description}
        </div>
        ${mediaUI}
        <div class="timeline">
            ${req.timeline.map(t => `
                <div class="timeline-item">
                    <div class="ti-time">${new Date(t.timestamp).toLocaleTimeString()}</div>
                    <div class="ti-action">${t.action}</div>
                    ${t.note ? `<div class="ti-note">${t.note}</div>` : ''}
                </div>
            `).join('')}
        </div>
    `;

    const actions = document.getElementById('modal-actions');
    actions.innerHTML = '';

    if (currentUser.type === 'doctor' && req.status !== 'Completed') {
        if (req.status === 'Assigned') {
            actions.innerHTML = `<button class="btn btn-primary btn-full" onclick="updateReq('${req.id}', 'In Progress')">Review Patient Data</button>`;
        } else if (req.status === 'In Progress') {
            actions.innerHTML = `<button class="btn btn-secondary btn-full" onclick="updateReq('${req.id}', 'Completed')">Resolve & Send Diagnosis</button>`;
        }
    }

    document.getElementById('details-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('details-modal').classList.add('hidden');
}

window.updateReq = function (id, newStatus) {
    const db = getDB();
    const req = db.find(r => r.id === id);
    if (req) {
        req.status = newStatus;
        req.timeline.unshift({ timestamp: new Date().toISOString(), action: `Status changed to ${newStatus}` });
        saveDB(db);
        closeModal();
        loadDoctorDashboard();
        showToast("Status Updated");
    }
}
