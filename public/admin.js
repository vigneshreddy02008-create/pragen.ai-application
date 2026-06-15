let applications = [];
let filteredApplications = [];
let activeApproveId = null;

// Lock Gate check on load
document.addEventListener('DOMContentLoaded', () => {
    const savedPass = sessionStorage.getItem('pragen_admin_pass');
    if (savedPass) {
        document.getElementById('passcodeGate').style.display = 'none';
        fetchApplications();
    }
});

// Validate Administrator Passcode
async function validatePasscode() {
    const input = document.getElementById('adminPasscodeInput').value.trim();
    const errorMsg = document.getElementById('passcodeError');

    if (!input) return;

    try {
        const response = await fetch('/api/applications', {
            headers: { 'Authorization': input }
        });

        if (response.ok) {
            sessionStorage.setItem('pragen_admin_pass', input);
            document.getElementById('passcodeGate').style.display = 'none';
            errorMsg.style.display = 'none';
            fetchApplications();
        } else {
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        alert('Server network error. Ensure the backend Python server is running.');
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('pragen_admin_pass');
    location.reload();
}

// Fetch all application files from Backend API
async function fetchApplications() {
    const passcode = sessionStorage.getItem('pragen_admin_pass');
    const listElement = document.getElementById('applicantsList');
    
    try {
        const response = await fetch('/api/applications', {
            headers: { 'Authorization': passcode }
        });

        if (response.ok) {
            applications = await response.json();
            calculateMetrics();
            populateStateFilter();
            applyFilters();
        } else {
            logoutAdmin();
        }
    } catch (err) {
        listElement.innerHTML = `<div class="no-records" style="color:var(--error);">Failed to load database. Ensure Python server is running.</div>`;
    }
}

// Calculate Metrics Row values
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

// Populate State list in filters dropdown
function populateStateFilter() {
    const stateSelect = document.getElementById('stateFilter');
    // Keep standard "All States" option
    stateSelect.innerHTML = `<option value="All">All States</option>`;
    
    // Extract unique states sorted alphabetically
    const states = [...new Set(applications.map(a => a.state.trim()))].sort();
    
    states.forEach(state => {
        if (state) {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = state;
            stateSelect.appendChild(option);
        }
    });
}

// Filter, Sort, and trigger Render
function applyFilters() {
    const query = document.getElementById('searchBar').value.trim().toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;
    const stateVal = document.getElementById('stateFilter').value;
    const sortVal = document.getElementById('sortOrder').value;

    filteredApplications = applications.filter(app => {
        // Status filter
        if (statusVal !== 'All' && app.status !== statusVal) return false;
        
        // State filter
        if (stateVal !== 'All' && app.state !== stateVal) return false;

        // Search text matching name, college, email, branch
        if (query) {
            const matchName = app.name.toLowerCase().includes(query);
            const matchCollege = app.collegeName.toLowerCase().includes(query);
            const matchEmail = app.email.toLowerCase().includes(query);
            const matchBranch = app.branch.toLowerCase().includes(query);
            const matchState = app.state.toLowerCase().includes(query);
            const matchCity = app.city.toLowerCase().includes(query);
            return (matchName || matchCollege || matchEmail || matchBranch || matchState || matchCity);
        }

        return true;
    });

    // Sort by Date
    filteredApplications.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return sortVal === 'newest' ? (timeB - timeA) : (timeA - timeB);
    });

    renderApplicants();
}

// Render filtered applications
function renderApplicants() {
    const container = document.getElementById('applicantsList');
    container.innerHTML = '';

    if (filteredApplications.length === 0) {
        container.innerHTML = `<div class="no-records">No applications match your search query.</div>`;
        return;
    }

    filteredApplications.forEach(app => {
        const card = document.createElement('div');
        card.className = 'applicant-card';
        card.id = `card-${app.id}`;

        const dateStr = new Date(app.timestamp).toLocaleString();
        const linkedinLink = app.linkedin ? `<a href="${app.linkedin}" target="_blank" rel="noopener">LinkedIn</a>` : `<span style="color:var(--text-muted);">None</span>`;
        const githubLink = app.github ? `<a href="${app.github}" target="_blank" rel="noopener">GitHub</a>` : `<span style="color:var(--text-muted);">None</span>`;

        const displayNameMarkup = app.displayName ? `<span style="font-size:13.5px; font-weight:500; color:var(--text-secondary); margin-left: 8px;">(${app.displayName})</span>` : '';
        card.innerHTML = `
            <div class="card-header-row">
                <div class="applicant-title">
                    <div class="applicant-name">${app.name}${displayNameMarkup}</div>
                    <div class="applicant-meta-tags">
                        <span class="badge-tag state-badge">${app.city}, ${app.state}</span>
                        <span class="badge-tag year-badge">${app.year} - ${app.branch}</span>
                    </div>
                </div>
                <div class="status-pill ${app.status.toLowerCase()}">${app.status}</div>
            </div>

            <div class="applicant-info-grid">
                <div class="info-item">Email: <span>${app.email}</span></div>
                <div class="info-item">Phone: <span><a href="https://wa.me/91${app.phone}" target="_blank" rel="noopener">${app.phone} (WhatsApp)</a></span></div>
                <div class="info-item">LinkedIn: <span>${linkedinLink}</span></div>
                <div class="info-item">GitHub: <span>${githubLink}</span></div>
                <div class="info-item" style="grid-column: span 2;">College: <span>${app.collegeName} (${app.collegeState})</span></div>
            </div>

            <div class="interview-responses">
                <div class="interview-header" onclick="toggleInterviewBody('${app.id}')">
                    <span>Interview Mindset Review</span>
                    <span id="chevron-${app.id}" style="transition: transform 0.2s;">▼</span>
                </div>
                <div class="interview-body" id="interview-${app.id}" style="display: none;">
                    <div class="qa-block">
                        <div class="qa-q">Goal for the next 1-2 years:</div>
                        <div class="qa-a" style="border-left-color: var(--neon-blue); font-weight:600;">${app.q4 || 'Not specified'}</div>
                    </div>
                    <div class="qa-block">
                        <div class="qa-q">Why break away from traditional "byhearting" (rote learning) and what hands-on skills to build?</div>
                        <div class="qa-a">${app.q1}</div>
                    </div>
                    <div class="qa-block">
                        <div class="qa-q">Startup idea or real-world problem passionate about solving:</div>
                        <div class="qa-a">${app.q2}</div>
                    </div>
                    <div class="qa-block">
                        <div class="qa-q">How will they contribute to "students helping students" community?</div>
                        <div class="qa-a">${app.q3}</div>
                    </div>
                    <div class="qa-block">
                        <div class="qa-q">What would you build with unlimited, fully upgraded AI capabilities?</div>
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

// Render dynamic action buttons based on current status
function renderActionButtons(app) {
    if (app.status === 'Pending') {
        return `
            <button class="btn btn-secondary btn-sm btn-reject" onclick="updateStatus('${app.id}', 'Rejected')">Reject</button>
            <button class="btn btn-primary btn-sm btn-approve" onclick="openApproveModal('${app.id}')">Approve</button>
        `;
    } else if (app.status === 'Approved') {
        return `
            <span style="color:var(--success); font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:6px; margin-right:12px;">
                ✓ Approved
            </span>
            <button class="btn btn-secondary btn-sm" onclick="updateStatus('${app.id}', 'Pending')">Re-review</button>
            <button class="btn btn-secondary btn-sm btn-reject" onclick="updateStatus('${app.id}', 'Rejected')">Reject</button>
        `;
    } else {
        return `
            <span style="color:var(--error); font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:6px; margin-right:12px;">
                ✗ Rejected
            </span>
            <button class="btn btn-secondary btn-sm" onclick="updateStatus('${app.id}', 'Pending')">Re-review</button>
            <button class="btn btn-primary btn-sm btn-approve" onclick="openApproveModal('${app.id}')">Approve</button>
        `;
    }
}

// Toggle expansion of interview Q&A blocks
function toggleInterviewBody(id) {
    const body = document.getElementById(`interview-${id}`);
    const chevron = document.getElementById(`chevron-${id}`);
    if (body.style.display === 'none') {
        body.style.display = 'flex';
        chevron.style.transform = 'rotate(180deg)';
    } else {
        body.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
    }
}

// Update Status on Backend
async function updateStatus(id, status) {
    const passcode = sessionStorage.getItem('pragen_admin_pass');
    
    try {
        const response = await fetch('/api/applications/status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': passcode
            },
            body: JSON.stringify({ id, status })
        });

        if (response.ok) {
            // Update local object array
            const app = applications.find(a => a.id === id);
            if (app) app.status = status;
            
            calculateMetrics();
            applyFilters();
        } else {
            alert('Failed to update status. Check permissions.');
        }
    } catch (err) {
        alert('API error updating applicant status.');
    }
}

// Approve Invitation & WhatsApp Modal Logic
function openApproveModal(id) {
    activeApproveId = id;
    const modal = document.getElementById('discordModal');
    modal.classList.add('active');
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

    const message = `Hi ${app.name}! Great news! Your application to join Pragen.ai has been approved! 🚀\n\nWe love your drive to break away from traditional "byhearting" and build startups. Join our official student Discord server using the invitation link below to connect with fellow B.Tech builders and start collaborating:\n👉 ${discordLink}\n\nLet's Learn, Build, and Grow together!\n- Team Pragen.ai`;
    
    templateBox.textContent = message;
}

async function copyTemplateAndApprove() {
    const text = document.getElementById('whatsappTemplate').textContent;
    
    try {
        await navigator.clipboard.writeText(text);
        alert('Approved invitation message copied to clipboard! Opening WhatsApp link...');
    } catch (err) {
        alert('Could not auto-copy to clipboard. Please manually copy the text, then click approve.');
    }

    // Call update status to approved
    if (activeApproveId) {
        const app = applications.find(a => a.id === activeApproveId);
        // Open WhatsApp web pre-filled link
        const whatsappUrl = `https://api.whatsapp.com/send?phone=91${app.phone}&text=${encodeURIComponent(text)}`;
        window.open(whatsappUrl, '_blank');

        await updateStatus(activeApproveId, 'Approved');
    }

    closeApproveModal();
}

// Export Database to CSV format
function exportToCSV() {
    if (applications.length === 0) {
        alert('No data to export.');
        return;
    }

    // CSV Headers
    const headers = [
        "Application ID", "Timestamp", "Name", "Display Name", "Email", "Phone", "State", "City",
        "LinkedIn", "GitHub", "College Name", "College State", "Branch", "Year",
        "Primary Goal", "Q1: Escape Rote Learning", "Q2: Startup Idea/Problem", "Q3: Contribution", "Q5: Unlimited AI Tool Build", "Status"
    ];

    // Build Rows
    const rows = applications.map(app => [
        app.id,
        app.timestamp,
        app.name,
        app.displayName || '',
        app.email,
        app.phone,
        app.state,
        app.city,
        app.linkedin,
        app.github,
        app.collegeName,
        app.collegeState,
        app.branch,
        app.year,
        app.q4 || '',
        app.q1,
        app.q2,
        app.q3,
        app.q5 || '',
        app.status
    ]);

    // Format fields with double quotes escaping
    const csvContent = "data:text/csv;charset=utf-8," 
        + [headers, ...rows].map(row => 
            row.map(field => {
                const text = String(field || '').replace(/"/g, '""');
                return `"${text}"`;
            }).join(",")
          ).join("\n");

    // Download file link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    const timestampStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `pragen_applicants_${timestampStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
