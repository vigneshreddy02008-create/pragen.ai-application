const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const os = require('os');

const PORT = 8000;
let DATA_DIR = path.join(__dirname, 'data');
let DATA_FILE = path.join(DATA_DIR, 'applications.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_PASSCODE = 'pragen2026';

// Fallback to temp directory if we are running in a read-only environment like Vercel
if (process.env.VERCEL || process.env.NOW_REGION) {
    DATA_DIR = path.join(os.tmpdir(), 'pragen-data');
    DATA_FILE = path.join(DATA_DIR, 'applications.json');
}

// Ensure data folder and file exist locally
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 4), 'utf8');
    }
} catch (err) {
    console.error('Failed to initialize local data store, falling back to temp:', err);
    try {
        DATA_DIR = path.join(os.tmpdir(), 'pragen-data');
        DATA_FILE = path.join(DATA_DIR, 'applications.json');
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 4), 'utf8');
        }
    } catch (tempErr) {
        console.error('Even temp data storage initialization failed:', tempErr);
    }
}

// Helper to load applications
function getApplications(callback) {
    fs.readFile(DATA_FILE, 'utf8', (err, fileData) => {
        if (err) {
            if (err.code === 'ENOENT') {
                callback(null, []);
            } else {
                callback(err, null);
            }
            return;
        }
        let applications = [];
        try {
            applications = JSON.parse(fileData);
        } catch (e) {
            applications = [];
        }
        callback(null, applications);
    });
}

// Helper to save applications
function saveApplications(applications, callback) {
    if (!fs.existsSync(DATA_DIR)) {
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        } catch (err) {
            callback(err);
            return;
        }
    }
    fs.writeFile(DATA_FILE, JSON.stringify(applications, null, 4), 'utf8', (err) => {
        callback(err);
    });
}

// Helper to serve static files
function serveStaticFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`500 Internal Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

// Create HTTP Server
const server = http.createServer((req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // API: Submit Application
    if (pathname === '/api/apply' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                
                // Validate fields
                const required = ['name', 'displayName', 'email', 'phone', 'state', 'city', 'collegeName', 'collegeState', 'branch', 'year'];
                const missing = required.filter(f => !data[f]);
                if (missing.length > 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Missing fields: ${missing.join(', ')}` }));
                    return;
                }

                // Load existing database
                getApplications((err, applications) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Database read error' }));
                        return;
                    }

                    // Check for spam duplicates
                    const lowerEmail = data.email.trim().toLowerCase();
                    const duplicate = applications.find(a => a.email === lowerEmail && (a.status === 'Pending' || a.status === 'Approved'));
                    if (duplicate) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'An application with this email is already being processed.' }));
                        return;
                    }

                    // Create submission entry
                    const newApp = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: data.name.trim(),
                        displayName: data.displayName.trim(),
                        email: lowerEmail,
                        phone: data.phone.trim(),
                        state: data.state.trim(),
                        city: data.city.trim(),
                        linkedin: (data.linkedin || '').trim(),
                        github: (data.github || '').trim(),
                        collegeName: data.collegeName.trim(),
                        collegeState: data.collegeState.trim(),
                        branch: data.branch.trim(),
                        year: data.year.trim(),
                        q1: (data.q1 || '').trim(),
                        q2: (data.q2 || '').trim(),
                        q3: (data.q3 || '').trim(),
                        q4: (data.q4 || '').trim(),
                        q5: (data.q5 || '').trim(),
                        status: 'Pending',
                        timestamp: new Date().toISOString()
                    };

                    applications.push(newApp);

                    saveApplications(applications, (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Database save error' }));
                            return;
                        }
                        res.writeHead(201, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Application received', id: newApp.id }));
                    });
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
        });
        return;
    }

    // API: Check Application Status (Public)
    if (pathname === '/api/status' && req.method === 'GET') {
        const phone = (parsedUrl.query.phone || '').trim();

        if (!phone) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Phone number is required' }));
            return;
        }

        getApplications((err, applications) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Database read error' }));
                return;
            }

            // Find matching applicant by phone
            const app = applications.find(a => a.phone === phone);

            if (app) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    name: app.name,
                    status: app.status,
                    timestamp: app.timestamp
                }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No application found with this phone number.' }));
            }
        });
        return;
    }

    // API: Retrieve All Applications (Admin)
    if (pathname === '/api/applications' && req.method === 'GET') {
        const authHeader = req.headers['authorization'];
        if (authHeader !== ADMIN_PASSCODE) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        getApplications((err, applications) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Database read error' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(applications));
        });
        return;
    }

    // API: Update Application Status
    if (pathname === '/api/applications/status' && req.method === 'POST') {
        const authHeader = req.headers['authorization'];
        if (authHeader !== ADMIN_PASSCODE) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { id, status } = data;

                if (!id || !['Pending', 'Approved', 'Rejected'].includes(status)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid ID or status' }));
                    return;
                }

                getApplications((err, applications) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Database read error' }));
                        return;
                    }

                    let found = false;

                    applications = applications.map(app => {
                        if (app.id === id) {
                            app.status = status;
                            found = true;
                        }
                        return app;
                    });

                    if (!found) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Applicant not found' }));
                        return;
                    }

                    saveApplications(applications, (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Database save error' }));
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: `Status updated to ${status}` }));
                    });
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON request' }));
            }
        });
        return;
    }

    // API: Delete Application
    if (pathname === '/api/applications/delete' && req.method === 'POST') {
        const authHeader = req.headers['authorization'];
        if (authHeader !== ADMIN_PASSCODE) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { id } = data;

                if (!id) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid ID' }));
                    return;
                }

                getApplications((err, applications) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Database read error' }));
                        return;
                    }

                    const originalLength = applications.length;
                    applications = applications.filter(app => app.id !== id);

                    if (applications.length === originalLength) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Applicant not found' }));
                        return;
                    }

                    saveApplications(applications, (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Database save error' }));
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Application deleted successfully' }));
                    });
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON request' }));
            }
        });
        return;
    }

    // Serve Static Files
    let reqPath = pathname;
    const lowerPath = reqPath.toLowerCase();
    if (reqPath === '/') {
        reqPath = '/index.html';
    } else if (reqPath === '/admin' || reqPath === '/admin/' || lowerPath === '/admin.html' || lowerPath === '/adminhtml') {
        reqPath = '/admin.html';
    }

    // Security check for directory traversal
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const finalPath = path.join(PUBLIC_DIR, safePath);

    // Verify it stays in public folder
    if (!finalPath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    serveStaticFile(res, finalPath);
});

server.listen(PORT, () => {
    console.log(`Pragen.ai Server running at http://localhost:${PORT}/`);
    console.log(`Open in browser to see the student form!`);
});
