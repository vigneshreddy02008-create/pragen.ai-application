const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const os = require('os');

// Load environment variables from .env file locally if it exists
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const parts = trimmed.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                    process.env[key] = value;
                }
            }
        });
    }
} catch (e) {
    console.error('Failed to parse .env file:', e);
}

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

const getSupabaseConfig = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
        return {
            url: supabaseUrl.replace(/\/$/, ''),
            key: supabaseKey
        };
    }
    return null;
};

function loadFromSupabase(config, callback) {
    const urlString = `${config.url}/rest/v1/applications?select=*`;
    const urlParsed = url.parse(urlString);
    const options = {
        hostname: urlParsed.hostname,
        path: urlParsed.path,
        method: 'GET',
        headers: {
            'apikey': config.key,
            'Authorization': `Bearer ${config.key}`,
            'Content-Type': 'application/json'
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    const parsed = JSON.parse(data);
                    callback(null, parsed);
                } catch (e) {
                    callback(e, null);
                }
            } else {
                callback(new Error(`Supabase load error: ${res.statusCode}`), null);
            }
        });
    });

    req.on('error', (err) => {
        callback(err, null);
    });

    req.end();
}

function saveToSupabase(config, newApplications, callback) {
    loadFromSupabase(config, (err, currentApps) => {
        if (err) {
            currentApps = [];
        }

        const newIds = new Set(newApplications.map(app => app.id));
        const idsToDelete = currentApps
            .map(app => app.id)
            .filter(id => !newIds.has(id));

        const proceedToUpsert = () => {
            if (newApplications.length === 0) {
                callback(null);
                return;
            }

            const urlString = `${config.url}/rest/v1/applications`;
            const payload = JSON.stringify(newApplications);
            const urlParsed = url.parse(urlString);

            const options = {
                hostname: urlParsed.hostname,
                path: urlParsed.path,
                method: 'POST',
                headers: {
                    'apikey': config.key,
                    'Authorization': `Bearer ${config.key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates, return=minimal',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        callback(null);
                    } else {
                        callback(new Error(`Supabase upsert error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (err) => {
                callback(err);
            });

            req.write(payload);
            req.end();
        };

        if (idsToDelete.length > 0) {
            const deleteUrlString = `${config.url}/rest/v1/applications?id=in.(${idsToDelete.join(',')})`;
            const deleteUrlParsed = url.parse(deleteUrlString);

            const deleteOptions = {
                hostname: deleteUrlParsed.hostname,
                path: deleteUrlParsed.path,
                method: 'DELETE',
                headers: {
                    'apikey': config.key,
                    'Authorization': `Bearer ${config.key}`,
                    'Content-Type': 'application/json'
                }
            };

            const deleteReq = https.request(deleteOptions, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    proceedToUpsert();
                });
            });

            deleteReq.on('error', (err) => {
                console.error('Supabase delete request error:', err);
                proceedToUpsert();
            });

            deleteReq.end();
        } else {
            proceedToUpsert();
        }
    });
}

// Helper to load applications
function getApplications(callback) {
    const supabaseConfig = getSupabaseConfig();
    if (supabaseConfig) {
        loadFromSupabase(supabaseConfig, (err, apps) => {
            if (err) {
                console.error('Supabase load failed, falling to Vercel KV/local:', err.message);
                loadFromKVOrLocal(callback);
            } else {
                callback(null, apps);
            }
        });
    } else {
        loadFromKVOrLocal(callback);
    }
}

function loadFromKVOrLocal(callback) {
    const kvUrl = (process.env.KV_REST_API_URL || '').replace(/\/$/, '');
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (kvUrl && kvToken) {
        const urlString = `${kvUrl}/get/applications`;
        const options = {
            headers: {
                'Authorization': `Bearer ${kvToken}`
            }
        };

        https.get(urlString, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed && parsed.result !== undefined && parsed.result !== null) {
                        callback(null, JSON.parse(parsed.result));
                    } else {
                        callback(null, []);
                    }
                } catch (e) {
                    callback(null, []);
                }
            });
        }).on('error', (err) => {
            console.error('Failed to fetch from Vercel KV, falling back to local file:', err);
            loadFromLocalFile(callback);
        });
    } else {
        loadFromLocalFile(callback);
    }
}

function loadFromLocalFile(callback) {
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
    const supabaseConfig = getSupabaseConfig();
    if (supabaseConfig) {
        saveToSupabase(supabaseConfig, applications, (err) => {
            if (err) {
                console.error('Supabase save failed, falling to Vercel KV/local:', err.message);
                saveToKVOrLocal(applications, callback);
            } else {
                callback(null);
            }
        });
    } else {
        saveToKVOrLocal(applications, callback);
    }
}

function saveToKVOrLocal(applications, callback) {
    const kvUrl = (process.env.KV_REST_API_URL || '').replace(/\/$/, '');
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (kvUrl && kvToken) {
        const urlString = `${kvUrl}/set/applications`;
        const payload = JSON.stringify(applications);
        const urlParsed = url.parse(urlString);

        const options = {
            hostname: urlParsed.hostname,
            path: urlParsed.path,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${kvToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                saveToLocalFile(applications, () => {
                    callback(null);
                });
            });
        });

        req.on('error', (err) => {
            console.error('Failed to save to Vercel KV, falling back to local file:', err);
            saveToLocalFile(applications, callback);
        });

        req.write(payload);
        req.end();
    } else {
        saveToLocalFile(applications, callback);
    }
}

function saveToLocalFile(applications, callback) {
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
                const required = ['name', 'displayName', 'email', 'phone', 'state', 'city', 'collegeName', 'collegeCity', 'collegeState', 'branch', 'year'];
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
                        collegeCity: data.collegeCity.trim(),
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
