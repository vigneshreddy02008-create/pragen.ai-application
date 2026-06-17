// ─────────────────────────────────────────────────────────────
//  Pragen.ai Admin Dashboard – admin.js
//  All data operations go to Supabase first, fall back to API
// ─────────────────────────────────────────────────────────────

const ADMIN_PASS = 'pragen@2008'; // Admin passcode (also enforced server-side)

let applications = [];
let filteredApplications = [];
let activeApproveId = null;
let supabaseClient = null;

// ── Supabase Init ────────────────────────────────────────────
async function initSupabase() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) return;
        const config = await response.json();
        if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
            // window.supabase is loaded via CDN (defer so it may not be ready yet)
            const lib = window.supabase || (await waitForSupabase());
            if (lib) {
                supabaseClient = lib.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
                console.log('[Admin] Supabase client ready ✓');
            }
        } else {
            console.log('[Admin] No Supabase credentials – using local API fallback.');
        }
    } catch (err) {
        console.warn('[Admin] Could not init Supabase:', err.message);
    }
}

// Wait up to 3s for the deferred Supabase CDN script to load
function waitForSupabase(timeout = 3000) {
    return new Promise((resolve) => {
        if (window.supabase) { resolve(window.supabase); return; }
        const start = Date.now();
        const poll = setInterval(() => {
            if (window.supabase) { clearInterval(poll); resolve(window.supabase); }
            else if (Date.now() - start > timeout) { clearInterval(poll); resolve(null); }
        }, 100);
    });
}

// ── Page Load ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Enter key on passcode input
    const passInput = document.getElementById('adminPasscodeInput');
    if (passInput) {
        passInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') validatePasscode();
        });
        passInput.focus();
    }

    // If already logged in this session, skip gate
    const savedPass = sessionStorage.getItem('pragen_admin_pass');
    if (savedPass === ADMIN_PASS) {
        unlockDashboard();
    } else {
        sessionStorage.removeItem('pragen_admin_pass');
    }
});

// ── Passcode Gate ─────────────────────────────────────────────
function validatePasscode() {
    const input = document.getElementById('adminPasscodeInput').value.trim();
    const errorMsg = document.getElementById('passcodeError');
    const btn = document.querySelector('#passcodeGate button');

    if (!input) {
        errorMsg.textContent = 'Please enter the passcode.';
        errorMsg.style.display = 'block';
        return;
    }

    if (input === ADMIN_PASS) {
        sessionStorage.setItem('pragen_admin_pass', ADMIN_PASS);
        errorMsg.style.display = 'none';
        unlockDashboard();
    } else {
        errorMsg.textContent = 'Incorrect passcode. Please try again.';
        errorMsg.style.display = 'block';
        if (btn) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 400); }
        document.getElementById('adminPasscodeInput').value = '';
        document.getElementById('adminPasscodeInput').focus();
    }
}

async function unlockDashboard() {
    document.getElementById('passcodeGate').style.display = 'none';
    await initSupabase();
    fetchApplications();
}

function logoutAdmin() {
    sessionStorage.removeItem('pragen_admin_pass');
    location.reload();
}

// ── Fetch Applications ────────────────────────────────────────
async function fetchApplications() {
    const listElement = document.getElementById('applicantsList');
    listElement.innerHTML = '<div class="no-records">Loading applications…</div>';

    try {
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('applications')
                .select('*')
                .order('timestamp', { ascending: false });

            if (error) throw error;
            applications = data || [];
        } else {
            await fetchApplicationsViaAPI();
            return;
        }
    } catch (err) {
        console.error('[Admin] Supabase fetch failed, trying API:', err.message);
        try {
            await fetchApplicationsViaAPI();
            return;
        } catch (apiErr) {
            listElement.innerHTML = `<div class="no-records" style="color:var(--error);">⚠️ Failed to load applications. Check your connection and server.</div>`;
            return;
        }
    }

    calculateMetrics();
    populateStateFilter();
    applyFilters();
}

async function fetchApplicationsViaAPI() {
    const passcode = sessionStorage.getItem('pragen_admin_pass');
    const listElement = document.getElementById('applicantsList');

    const response = await fetch('/api/applications', {
        headers: { 'Authorization': passcode }
    });

    if (response.ok) {
        const data = await response.json();
        applications = data;
        // Sort newest first
        applications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        calculateMetrics();
        populateStateFilter();
        applyFilters();
    } else {
        listElement.innerHTML = `<div class="no-records" style="color:var(--error);">⚠️ Unauthorized or server error. Please refresh and re-enter your passcode.</div>`;
        setTimeout(logoutAdmin, 3000);
    }
}

// ── Metrics ───────────────────────────────────────────────────
function calculateMetrics() {
    const total = applications.length;
    const pending = applications.filter(a => a.status === 'Pending').length;
    const approved = applications.filter(a => a.status === 'Approved').length;
    const rejected = applications.filter(a => a.status === 'Rejected').length;

    document.getElementById('metricTotal').textContent = total;
    document.getElementById('metricPending').textContent = pending;
    document.getElementById('metricApproved').textContent = approved;
    document.getElementById('metricRejected').textContent = rejected;
}

// ── State Filter Dropdown ────────────────────────────────────
function populateStateFilter() {
    const stateSelect = document.getElementById('stateFilter');
    stateSelect.innerHTML = `<option value="All">All States</option>`;
    const states = [...new Set(applications.map(a => (a.state || '').trim()))].filter(Boolean).sort();
    states.forEach(state => {
        const opt = document.createElement('option');
        opt.value = state;
        opt.textContent = state;
        stateSelect.appendChild(opt);
    });
}

// ── Filter + Sort + Render ────────────────────────────────────
function applyFilters() {
    const query = document.getElementById('searchBar').value.trim().toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;
    const stateVal = document.getElementById('stateFilter').value;
    const sortVal = document.getElementById('sortOrder').value;

    filteredApplications = applications.filter(app => {
        if (statusVal !== 'All' && app.status !== statusVal) return false;
        if (stateVal !== 'All' && app.state !== stateVal) return false;
        if (query) {
            const fields = [app.name, app.collegeName, app.email, app.branch, app.state, app.city];
            return fields.some(f => (f || '').toLowerCase().includes(query));
        }
        return true;
    });

    filteredApplications.sort((a, b) => {
        const tA = new Date(a.timestamp).getTime();
        const tB = new Date(b.timestamp).getTime();
        return sortVal === 'newest' ? tB - tA : tA - tB;
    });

    renderApplicants();
}

// ── Render Cards ──────────────────────────────────────────────
function renderApplicants() {
    const container = document.getElementById('applicantsList');
    container.innerHTML = '';

    if (filteredApplications.length === 0) {
        container.innerHTML = `<div class="no-records">No applications match your search.</div>`;
        return;
    }

    filteredApplications.forEach(app => {
        const card = document.createElement('div');
        card.className = 'applicant-card';
        card.id = `card-${app.id}`;

        const dateStr = new Date(app.timestamp).toLocaleString();
        const linkedinLink = app.linkedin
            ? `<a href="${app.linkedin}" target="_blank" rel="noopener">LinkedIn</a>`
            : `<span style="color:var(--text-muted);">None</span>`;
        const githubLink = app.github
            ? `<a href="${app.github}" target="_blank" rel="noopener">GitHub</a>`
            : `<span style="color:var(--text-muted);">None</span>`;
        const displayNameMarkup = app.displayName
            ? `<span style="font-size:13.5px;font-weight:500;color:var(--text-secondary);margin-left:8px;">(${app.displayName})</span>`
            : '';

        card.innerHTML = `
            <div class="card-header-row">
                <div class="applicant-title">
                    <div class="applicant-name">${app.name}${displayNameMarkup}</div>
                    <div class="applicant-meta-tags">
                        <span class="badge-tag state-badge">${app.city}, ${app.state}</span>
                        <span class="badge-tag year-badge">${app.year} – ${app.branch}</span>
                    </div>
                </div>
                <div class="status-pill ${(app.status || 'pending').toLowerCase()}">${app.status || 'Pending'}</div>
            </div>

            <div class="applicant-info-grid">
                <div class="info-item">Email: <span>${app.email}</span></div>
                <div class="info-item">Phone: <span><a href="https://wa.me/91${app.phone}" target="_blank" rel="noopener">${app.phone} (WhatsApp)</a></span></div>
                <div class="info-item">LinkedIn: <span>${linkedinLink}</span></div>
                <div class="info-item">GitHub: <span>${githubLink}</span></div>
                <div class="info-item" style="grid-column:span 2;">College: <span>${app.collegeName} (${app.collegeCity ? app.collegeCity + ', ' : ''}${app.collegeState})</span></div>
            </div>

            <div class="interview-responses">
                <div class="interview-header" onclick="toggleInterviewBody('${app.id}')">
                    <span>Interview Mindset Review</span>
                    <span id="chevron-${app.id}" style="transition:transform 0.2s;">▼</span>
                </div>
                <div class="interview-body" id="interview-${app.id}" style="display:none;">
                    <div class="qa-block">
                        <div class="qa-q">Goal for the next 1-2 years:</div>
                        <div class="qa-a" style="border-left-color:var(--neon-blue);font-weight:600;">${app.q4 || 'Not specified'}</div>
                    </div>
                    <div class="qa-block">
                        <div class="qa-q">Why break away from rote learning & what hands-on skills to build?</div>
                        <div class="qa-a">${app.q1 || '—'}</div>
                    </div>
                    <div class="qa-block">
                        <div class="qa-q">Startup idea or real-world problem passionate about solving:</div>
                        <div class="qa-a">${app.q2 || '—'}</div>
                    </div>
                    <div class="qa-block">
                        <div class="qa-q">How will they contribute to the "students helping students" community?</div>
                        <div class="qa-a">${app.q3 || '—'}</div>
                    </div>
                    <div class="qa-block">
                        <div class="qa-q">What would you build with unlimited AI capabilities?</div>
                        <div class="qa-a">${app.q5 || 'Not answered'}</div>
                    </div>
                </div>
            </div>

            <div class="card-actions-row">
                <div class="card-timestamp">Applied on ${dateStr}</div>
                <div class="action-btns" id="actions-${app.id}">
                    ${renderActionButtons(app)}
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

function renderActionButtons(app) {
    const status = app.status || 'Pending';
    if (status === 'Pending') {
        return `
            <button class="btn btn-secondary btn-sm btn-delete" onclick="deleteApplication('${app.id}')">Delete</button>
            <button class="btn btn-secondary btn-sm btn-reject" onclick="updateStatus('${app.id}', 'Rejected')">Reject</button>
            <button class="btn btn-primary btn-sm btn-approve" onclick="openApproveModal('${app.id}')">Approve</button>
        `;
    } else if (status === 'Approved') {
        return `
            <span style="color:var(--success);font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;margin-right:12px;">✓ Approved</span>
            <button class="btn btn-secondary btn-sm btn-delete" onclick="deleteApplication('${app.id}')">Delete</button>
            <button class="btn btn-secondary btn-sm" onclick="updateStatus('${app.id}', 'Pending')">Re-review</button>
            <button class="btn btn-secondary btn-sm btn-reject" onclick="updateStatus('${app.id}', 'Rejected')">Reject</button>
        `;
    } else {
        return `
            <span style="color:var(--error);font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;margin-right:12px;">✗ Rejected</span>
            <button class="btn btn-secondary btn-sm btn-delete" onclick="deleteApplication('${app.id}')">Delete</button>
            <button class="btn btn-secondary btn-sm" onclick="updateStatus('${app.id}', 'Pending')">Re-review</button>
            <button class="btn btn-primary btn-sm btn-approve" onclick="openApproveModal('${app.id}')">Approve</button>
        `;
    }
}

function toggleInterviewBody(id) {
    const body = document.getElementById(`interview-${id}`);
    const chevron = document.getElementById(`chevron-${id}`);
    const open = body.style.display === 'none';
    body.style.display = open ? 'flex' : 'none';
    chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
}

// ── Status Update ────────────────────────────────────────────
async function updateStatus(id, status) {
    const passcode = sessionStorage.getItem('pragen_admin_pass');

    try {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('applications')
                .update({ status })
                .eq('id', id);
            if (error) throw error;
        } else {
            const res = await fetch('/api/applications/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': passcode },
                body: JSON.stringify({ id, status })
            });
            if (!res.ok) throw new Error(`API error: ${res.status}`);
        }

        // Update local state immediately (no refetch needed)
        const app = applications.find(a => a.id === id);
        if (app) app.status = status;
        calculateMetrics();
        applyFilters();
    } catch (err) {
        console.error('[Admin] updateStatus failed:', err);
        alert('Failed to update status. Please try again.');
    }
}

// ── Delete Application ────────────────────────────────────────
async function deleteApplication(id) {
    if (!confirm('Permanently delete this application?')) return;
    const passcode = sessionStorage.getItem('pragen_admin_pass');

    try {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('applications')
                .delete()
                .eq('id', id);
            if (error) throw error;
        } else {
            const res = await fetch('/api/applications/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': passcode },
                body: JSON.stringify({ id })
            });
            if (!res.ok) throw new Error(`API error: ${res.status}`);
        }

        applications = applications.filter(a => a.id !== id);
        calculateMetrics();
        applyFilters();
    } catch (err) {
        console.error('[Admin] deleteApplication failed:', err);
        alert('Failed to delete application. Please try again.');
    }
}

// ── Approve Modal (Discord + WhatsApp) ───────────────────────
function openApproveModal(id) {
    activeApproveId = id;
    document.getElementById('discordModal').classList.add('active');
    regenerateTemplate();
}

function closeApproveModal() {
    document.getElementById('discordModal').classList.remove('active');
    activeApproveId = null;
}

function regenerateTemplate() {
    if (!activeApproveId) return;
    const app = applications.find(a => a.id === activeApproveId);
    if (!app) return;

    const discordLink = document.getElementById('discordInviteUrl').value.trim();
    const templateBox = document.getElementById('whatsappTemplate');
    let firstName = (app.name || 'Student').trim().split(/\s+/)[0];
    firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

    templateBox.textContent =
        `🚀 Congratulations, ${firstName}.

We're pleased to inform you that you've been selected to join *Pragen AI*.

Your application stood out, and we're excited to welcome you into a community built for students who choose to take initiative, embrace curiosity, and create their own opportunities.

This is just the beginning.

Join the official Pragen AI Discord server below and start connecting with fellow builders, innovators, and future founders:

👉 ${discordLink}

Welcome to the ecosystem.

*Learn. Build. Grow.*

— Team Pragen AI`;
}

async function copyTemplateAndApprove() {
    const text = document.getElementById('whatsappTemplate').textContent;

    try {
        await navigator.clipboard.writeText(text);
    } catch (_) {
        // fallback: select the text for manual copy
        const box = document.getElementById('whatsappTemplate');
        const range = document.createRange();
        range.selectNodeContents(box);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    }

    if (activeApproveId) {
        const app = applications.find(a => a.id === activeApproveId);
        if (app) {
            const waUrl = `https://api.whatsapp.com/send?phone=91${app.phone}&text=${encodeURIComponent(text)}`;
            window.open(waUrl, '_blank');
        }
        await updateStatus(activeApproveId, 'Approved');
    }

    closeApproveModal();
}

// ── CSV Export ────────────────────────────────────────────────
function exportToCSV() {
    if (applications.length === 0) { alert('No data to export.'); return; }

    const headers = [
        'ID', 'Timestamp', 'Name', 'Display Name', 'Email', 'Phone',
        'State', 'City', 'LinkedIn', 'GitHub',
        'College', 'College City', 'College State', 'Branch', 'Year',
        'Goal (Q4)', 'Q1 – Rote Learning', 'Q2 – Startup Idea',
        'Q3 – Contribution', 'Q5 – AI Build', 'Status'
    ];

    const rows = applications.map(app => [
        app.id, app.timestamp, app.name, app.displayName || '',
        app.email, app.phone, app.state, app.city,
        app.linkedin || '', app.github || '',
        app.collegeName, app.collegeCity || '', app.collegeState,
        app.branch, app.year,
        app.q4 || '', app.q1 || '', app.q2 || '',
        app.q3 || '', app.q5 || '', app.status
    ]);

    const csv = 'data:text/csv;charset=utf-8,'
        + [headers, ...rows]
            .map(row => row.map(f => `"${String(f || '').replace(/"/g, '""')}"`).join(','))
            .join('\n');

    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `pragen_applicants_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
