// State
let currentUser = null; // { type: 'patient', name: 'Demo Patient' } or { type: 'doctor', id: 'dr_smith', name: 'Dr. Smith', specialty: 'Cardiology' }
let pollInterval = null;

// DOM Elements
const views = {
    login: document.getElementById('view-login'),
    patient: document.getElementById('view-patient'),
    doctor: document.getElementById('view-doctor')
};

const userControls = document.getElementById('user-controls');
const currentUserDisplay = document.getElementById('current-user-display');
const doctorSelect = document.getElementById('doctor-select');
const modal = document.getElementById('details-modal');

// media variables
let attachedMediaType = null;
let isEncrypting = false;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchDoctors();
    setupEventListeners();
});

// --- API Calls ---

async function fetchDoctors() {
    try {
        const res = await fetch('/doctors');
        const doctors = await res.json();
        
        doctorSelect.innerHTML = '<option value="">Select Doctor Profile...</option>';
        Object.values(doctors).forEach(doc => {
            const opt = document.createElement('option');
            opt.value = doc.id;
            opt.textContent = `${doc.name} - ${doc.specialty} ${doc.available ? '(Available)' : '(Unavailable)'}`;
            opt.dataset.doctor = JSON.stringify(doc);
            doctorSelect.appendChild(opt);
        });
    } catch (e) {
        console.error("Failed to fetch doctors", e);
    }
}

async function submitRequest(payload) {
    try {
        const res = await fetch('/create-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (e) {
        console.error("Failed to submit request", e);
        return null;
    }
}

async function fetchRequests(filters = {}) {
    try {
        const params = new URLSearchParams(filters);
        const res = await fetch(`/requests?${params}`);
        const data = await res.json();
        return data.data;
    } catch (e) {
        console.error("Failed to fetch requests", e);
        return [];
    }
}

async function updateStatus(reqId, status) {
    try {
        await fetch(`/update-status/${reqId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        return true;
    } catch (e) {
        console.error("Failed to update status", e);
        return false;
    }
}

// --- Navigation & Auth ---

function switchView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    
    if (viewName === 'login') {
        userControls.classList.add('hidden');
        if (pollInterval) clearInterval(pollInterval);
    } else {
        userControls.classList.remove('hidden');
        currentUserDisplay.innerHTML = currentUser.type === 'doctor' 
            ? `<i class="fa-solid fa-user-doctor"></i> ${currentUser.name}` 
            : `<i class="fa-solid fa-user-injured"></i> ${currentUser.name}`;
    }
}

function loginAsPatient() {
    currentUser = { type: 'patient', name: 'Demo Patient' };
    switchView('patient');
    loadPatientDashboard();
    startPolling();
}

function loginAsDoctor() {
    const selected = doctorSelect.options[doctorSelect.selectedIndex];
    if (!selected.value) return alert("Please select a doctor profile");
    
    currentUser = { type: 'doctor', ...JSON.parse(selected.dataset.doctor) };
    
    document.getElementById('doc-greeting').textContent = `${currentUser.name}'s Dashboard`;
    document.getElementById('doc-specialty').textContent = currentUser.specialty;
    
    switchView('doctor');
    loadDoctorDashboard();
    startPolling();
}

function logout() {
    currentUser = null;
    if (pollInterval) clearInterval(pollInterval);
    switchView('login');
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    // Poll every 3 seconds for real-time feel
    pollInterval = setInterval(() => {
        if (currentUser.type === 'patient') loadPatientDashboard(true);
        if (currentUser.type === 'doctor') loadDoctorDashboard(true);
    }, 3000);
}

// --- Event Listeners ---

function setupEventListeners() {
    document.getElementById('login-patient-btn').addEventListener('click', loginAsPatient);
    document.getElementById('login-doctor-btn').addEventListener('click', loginAsDoctor);
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // Patient Form
    document.getElementById('patient-request-form').addEventListener('submit', handlePatientSubmit);
    
    // Refresh Buttons
    document.getElementById('refresh-patient-btn').addEventListener('click', () => loadPatientDashboard());
    document.getElementById('refresh-doc-btn').addEventListener('click', () => loadDoctorDashboard());
    
    // Media Attachments
    document.querySelectorAll('.upload-buttons .btn-icon').forEach(btn => {
        btn.addEventListener('click', (e) => {
            attachedMediaType = e.target.closest('button').dataset.type;
            const icons = { 'image': 'fa-image', 'audio': 'fa-microphone', 'video': 'fa-video' };
            document.getElementById('media-label').innerHTML = `<i class="fa-solid ${icons[attachedMediaType]}"></i> ${attachedMediaType.toUpperCase()} ATTACHED`;
            document.getElementById('attached-media').classList.remove('hidden');
        });
    });
    
    document.querySelector('.remove-media').addEventListener('click', () => {
        attachedMediaType = null;
        document.getElementById('attached-media').classList.add('hidden');
    });

    // Modal
    document.querySelector('.close-modal').addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    window.addEventListener('click', (e) => {
        if (e.target == modal) modal.classList.add('hidden');
    });
}

// --- Specific Logic ---

async function handlePatientSubmit(e) {
    e.preventDefault();
    if (isEncrypting) return;
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const overlay = document.getElementById('encryption-overlay');
    
    const payload = {
        patient_name: document.getElementById('p-name').value,
        request_type: document.getElementById('p-type').value,
        priority: document.getElementById('p-priority').value,
        description: document.getElementById('p-desc').value,
        media_url: attachedMediaType ? `mock-url-to-s3-bucket/${uuidv4()}.${attachedMediaType}` : null,
        media_type: attachedMediaType
    };
    
    // Simulate Encryption Delay for Wow Factor
    if (attachedMediaType) {
        isEncrypting = true;
        submitBtn.disabled = true;
        overlay.classList.remove('hidden');
        
        await new Promise(r => setTimeout(r, 1500)); // 1.5s visual encryption delay
        
        overlay.classList.add('hidden');
        isEncrypting = false;
        submitBtn.disabled = false;
    }
    
    const res = await submitRequest(payload);
    if (res) {
        e.target.reset();
        attachedMediaType = null;
        document.getElementById('attached-media').classList.add('hidden');
        loadPatientDashboard();
        
        // Brief success flash
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Sent Securely!';
        setTimeout(() => submitBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Securely Submit Query', 2000);
    }
}

// --- UI Renderers ---

function getStatusBadge(status, isEscalated) {
    let html = `<span class="badge badge-status-${status.replace(/\s/g, '')}">${status}</span>`;
    if (isEscalated) {
        html += ` <span class="badge badge-escalated"><i class="fa-solid fa-triangle-exclamation"></i> OVERDUE / ESCALATED</span>`;
    }
    return html;
}

function renderTimeline(timeline) {
    return timeline.reverse().map(item => `
        <div class="timeline-item">
            <div class="ti-time">${new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</div>
            <div class="ti-action">${item.action}</div>
            ${item.note ? `<div class="ti-note">${item.note}</div>` : ''}
        </div>
    `).join('');
}

async function loadPatientDashboard(isBackground = false) {
    const list = document.getElementById('patient-queries-list');
    if (!isBackground) list.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    
    const reqs = await fetchRequests({ patient_name: currentUser.name });
    
    if (reqs.length === 0) {
        list.innerHTML = `<div class="req-card" style="text-align:center; color: var(--gray)">No queries found. Create one above!</div>`;
        return;
    }
    
    const newHtml = reqs.map(r => `
        <div class="req-card" onclick='openModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
            <div class="req-header">
                <div>
                    <div class="req-title">${r.request_type}</div>
                    <div class="req-id">#${r.id}</div>
                </div>
                <div>${getStatusBadge(r.status, r.is_escalated)}</div>
            </div>
            <div class="req-meta">
                <span><i class="fa-regular fa-clock"></i> ${new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                <span><i class="fa-solid fa-stethoscope"></i> ${r.specialty} Specialist</span>
                ${r.media_type ? `<span style="color:var(--secondary)"><i class="fa-solid fa-lock"></i> Encrypted Media</span>` : ''}
            </div>
        </div>
    `).join('');
    
    // Only update if DOM changed (prevents flicker on polling)
    if(list.innerHTML !== newHtml) list.innerHTML = newHtml;
}

async function loadDoctorDashboard(isBackground = false) {
    const list = document.getElementById('doctor-queue-list');
    if (!isBackground) list.innerHTML = '<div style="text-align:center; padding: 20px; grid-column: 1/-1;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    
    const reqs = await fetchRequests({ doctor_id: currentUser.id });
    
    document.getElementById('doc-total-req').textContent = reqs.filter(r => r.status !== 'Completed').length;
    
    if (reqs.length === 0) {
        list.innerHTML = `<div class="req-card" style="text-align:center; color: var(--gray); grid-column: 1/-1;">No pending queries in your queue.</div>`;
        return;
    }
    
    const newHtml = reqs.map(r => `
        <div class="req-card" style="${r.is_escalated ? 'border-color: var(--danger); box-shadow: 0 0 10px rgba(239, 68, 68, 0.2);' : ''}" onclick='openModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
            <div class="req-header">
                <div>
                    <div class="req-title">${r.patient_name} - ${r.request_type}</div>
                    <div class="req-id">#${r.id} | Priority: <strong>${r.priority}</strong></div>
                </div>
                <div>${getStatusBadge(r.status, r.is_escalated)}</div>
            </div>
            <div class="req-desc-preview">${r.description}</div>
            <div class="req-meta" style="justify-content: space-between">
                <span><i class="fa-regular fa-clock"></i> Wait: ${Math.round((new Date() - new Date(r.created_at))/60000)} mins</span>
                ${r.media_type ? `<span style="color:var(--secondary)"><i class="fa-solid fa-paperclip"></i> Attachment</span>` : ''}
            </div>
        </div>
    `).join('');
    
    if(list.innerHTML !== newHtml) list.innerHTML = newHtml;
}

function openModal(req) {
    document.getElementById('modal-title').innerHTML = `Query #${req.id}`;
    
    let mediaHtml = '';
    if (req.media_url) {
        mediaHtml = `
        <div class="secure-media-display">
            <i class="fa-solid fa-lock" style="color: #10b981; margin-bottom: 10px; font-size: 24px;"></i><br>
            <strong>End-to-End Encrypted Media</strong><br>
            <span style="font-size:12px; color:#94a3b8">Only you and the patient possess the decryption keys.</span><br>
            <button class="btn btn-outline btn-sm mt-2" style="border-color: #3b82f6; color: #3b82f6"><i class="fa-solid fa-key"></i> Decrypt & View ${req.media_type.toUpperCase()}</button>
        </div>
        `;
    }

    document.getElementById('modal-body').innerHTML = `
        <div style="display:flex; justify-content: space-between; margin-bottom: 15px;">
            <div>
                <strong>Patient:</strong> ${req.patient_name}<br>
                <strong>Type:</strong> ${req.request_type}<br>
                <strong>Priority:</strong> <span class="${req.priority === 'Emergency' ? 'badge badge-escalated' : ''}">${req.priority}</span>
            </div>
            <div style="text-align: right;">
                ${getStatusBadge(req.status, req.is_escalated)}<br>
                <small>Specialty: ${req.specialty}</small>
            </div>
        </div>
        
        <div style="background:var(--light); padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
            <strong>Description:</strong><br>
            ${req.description}
        </div>
        
        ${mediaHtml}

        <div style="margin-top: 20px;">
            <strong>Audit Timeline</strong>
            <div class="timeline">
                ${renderTimeline(req.timeline)}
            </div>
        </div>
    `;
    
    const actions = document.getElementById('modal-actions');
    actions.innerHTML = '';
    
    // Doctor Controls
    if (currentUser.type === 'doctor' && req.status !== 'Completed') {
        if (req.status === 'Assigned') {
            actions.innerHTML = `
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-primary btn-full" onclick="updateReqStatus('${req.id}', 'In Progress')">Accept Query & Start Review</button>
                </div>
            `;
        } else if (req.status === 'In Progress') {
             actions.innerHTML = `
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-secondary btn-full" onclick="updateReqStatus('${req.id}', 'Completed')">Mark as Resolved / Reply Sent</button>
                </div>
            `;
        }
    }
    
    modal.classList.remove('hidden');
}

async function updateReqStatus(id, status) {
    const success = await updateStatus(id, status);
    if (success) {
        modal.classList.add('hidden');
        loadDoctorDashboard();
    }
}

// Utils
function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}
