import http.server
import socketserver
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime

import tempfile

PORT = 8000
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DATA_FILE = os.path.join(DATA_DIR, "applications.json")
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")
ADMIN_PASSCODE = "pragen2026"  # Secure passcode to access admin endpoints

# Fallback to temp directory if we are running in a read-only environment like Vercel
if os.environ.get("VERCEL") or os.environ.get("NOW_REGION"):
    DATA_DIR = os.path.join(tempfile.gettempdir(), "pragen-data")
    DATA_FILE = os.path.join(DATA_DIR, "applications.json")

# Ensure data directory and file exist locally
try:
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=4)
except Exception as err:
    print(f"Failed to initialize data folder, falling back to temp: {err}")
    try:
        DATA_DIR = os.path.join(tempfile.gettempdir(), "pragen-data")
        DATA_FILE = os.path.join(DATA_DIR, "applications.json")
        if not os.path.exists(DATA_DIR):
            os.makedirs(DATA_DIR)
        if not os.path.exists(DATA_FILE):
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump([], f, indent=4)
    except Exception as temp_err:
        print(f"Even temp data folder initialization failed: {temp_err}")

def get_supabase_config():
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if supabase_url and supabase_key:
        return {
            "url": supabase_url.rstrip("/"),
            "key": supabase_key
        }
    return None

def load_from_supabase(config):
    req_url = f"{config['url']}/rest/v1/applications?select=*"
    req = urllib.request.Request(req_url)
    req.add_header("apikey", config["key"])
    req.add_header("Authorization", f"Bearer {config['key']}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))

def delete_from_supabase(config, ids):
    if not ids:
        return
    ids_str = ",".join(ids)
    req_url = f"{config['url']}/rest/v1/applications?id=in.({ids_str})"
    req = urllib.request.Request(req_url, method="DELETE")
    req.add_header("apikey", config["key"])
    req.add_header("Authorization", f"Bearer {config['key']}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=5) as response:
        response.read()

def upsert_to_supabase(config, applications):
    if not applications:
        return
    req_url = f"{config['url']}/rest/v1/applications"
    payload = json.dumps(applications).encode("utf-8")
    req = urllib.request.Request(req_url, data=payload, method="POST")
    req.add_header("apikey", config["key"])
    req.add_header("Authorization", f"Bearer {config['key']}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates, return=minimal")
    with urllib.request.urlopen(req, timeout=5) as response:
        response.read()

def save_to_supabase(config, new_applications):
    try:
        current_apps = load_from_supabase(config)
    except Exception:
        current_apps = []

    new_ids = {app["id"] for app in new_applications}
    ids_to_delete = [app["id"] for app in current_apps if app["id"] not in new_ids]

    if ids_to_delete:
        try:
            delete_from_supabase(config, ids_to_delete)
        except Exception as e:
            print(f"Supabase delete failed: {e}")

    upsert_to_supabase(config, new_applications)

def get_applications():
    supabase_config = get_supabase_config()
    if supabase_config:
        try:
            return load_from_supabase(supabase_config)
        except Exception as e:
            print(f"Supabase load failed, falling back to Vercel KV or local: {e}")
            return load_from_kv_or_local()
    else:
        return load_from_kv_or_local()

def load_from_kv_or_local():
    kv_url = (os.environ.get("KV_REST_API_URL") or "").rstrip("/")
    kv_token = os.environ.get("KV_REST_API_TOKEN")

    if kv_url and kv_token:
        try:
            req_url = f"{kv_url}/get/applications"
            req = urllib.request.Request(req_url)
            req.add_header("Authorization", f"Bearer {kv_token}")
            with urllib.request.urlopen(req, timeout=5) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                result = res_data.get("result")
                if result:
                    return json.loads(result)
                return []
        except Exception as e:
            print(f"Error fetching from Vercel KV: {e}")
            return load_from_local_file()
    else:
        return load_from_local_file()

def load_from_local_file():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_applications(applications):
    supabase_config = get_supabase_config()
    if supabase_config:
        try:
            save_to_supabase(supabase_config, applications)
        except Exception as e:
            print(f"Supabase save failed, falling back to Vercel KV or local: {e}")
            save_to_kv_or_local(applications)
    else:
        save_to_kv_or_local(applications)

def save_to_kv_or_local(applications):
    kv_url = (os.environ.get("KV_REST_API_URL") or "").rstrip("/")
    kv_token = os.environ.get("KV_REST_API_TOKEN")

    if kv_url and kv_token:
        try:
            req_url = f"{kv_url}/set/applications"
            payload = json.dumps(applications).encode("utf-8")
            req = urllib.request.Request(req_url, data=payload, method="POST")
            req.add_header("Authorization", f"Bearer {kv_token}")
            req.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req, timeout=5) as response:
                response.read()
            save_to_local_file(applications)
        except Exception as e:
            print(f"Error saving to Vercel KV: {e}")
            save_to_local_file(applications)
    else:
        save_to_local_file(applications)

def save_to_local_file(applications):
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(applications, f, indent=4)

class PragenHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for easier testing
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        # Handle preflight CORS request
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/applications":
            # Admin check password
            auth_header = self.headers.get("Authorization")
            if auth_header != ADMIN_PASSCODE:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Unauthorized"}).encode("utf-8"))
                return

            try:
                applications = get_applications()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(applications).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        # Default static file serving from public directory
        # Map root path to index.html
        lower_path = path.lower()
        if path == "/":
            self.path = "/index.html"
        elif path == "/admin" or path == "/admin/" or lower_path == "/admin.html" or lower_path == "/adminhtml":
            self.path = "/admin.html"
        else:
            self.path = path

        # Resolve path to be inside public directory
        # Remove leading slash to make it relative to PUBLIC_DIR
        rel_path = self.path.lstrip("/")
        full_path = os.path.join(PUBLIC_DIR, rel_path)

        # Basic security check to prevent directory traversal
        if not os.path.commonpath([PUBLIC_DIR, os.path.abspath(full_path)]) == PUBLIC_DIR:
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"403 Forbidden")
            return

        if os.path.exists(full_path) and os.path.isfile(full_path):
            # Infer content type
            content_type = "text/plain"
            if full_path.endswith(".html"):
                content_type = "text/html; charset=utf-8"
            elif full_path.endswith(".css"):
                content_type = "text/css"
            elif full_path.endswith(".js"):
                content_type = "application/javascript"
            elif full_path.endswith(".png"):
                content_type = "image/png"
            elif full_path.endswith(".jpg") or full_path.endswith(".jpeg"):
                content_type = "image/jpeg"
            elif full_path.endswith(".svg"):
                content_type = "image/svg+xml"
            elif full_path.endswith(".ico"):
                content_type = "image/x-icon"

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(os.path.getsize(full_path)))
            self.end_headers()
            with open(full_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Get request body length
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data.decode("utf-8"))
        except Exception:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid JSON format"}).encode("utf-8"))
            return

        if path == "/api/apply":
            # Validate required fields
            required_fields = ["name", "email", "phone", "state", "city", "collegeName", "collegeCity", "collegeState", "branch", "year"]
            missing = [f for f in required_fields if not data.get(f)]
            if missing:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Missing required fields: {', '.join(missing)}"}).encode("utf-8"))
                return
 
            # Append metadata
            import uuid
            application = {
                "id": str(uuid.uuid4())[:8],
                "name": data["name"].strip(),
                "email": data["email"].strip().lower(),
                "phone": data["phone"].strip(),
                "state": data["state"].strip(),
                "city": data["city"].strip(),
                "linkedin": data.get("linkedin", "").strip(),
                "github": data.get("github", "").strip(),
                "collegeName": data["collegeName"].strip(),
                "collegeCity": data["collegeCity"].strip(),
                "collegeState": data["collegeState"].strip(),
                "branch": data["branch"].strip(),
                "year": data["year"].strip(),
                "q1": data.get("q1", "").strip(),  # mindset screeners
                "q2": data.get("q2", "").strip(),
                "q3": data.get("q3", "").strip(),
                "q4": data.get("q4", "").strip(),
                "status": "Pending",
                "timestamp": datetime.now().isoformat()
            }

            try:
                applications = get_applications()
                # Check for duplicate email in pending/approved to avoid spam
                for app in applications:
                    if app["email"] == application["email"] and app["status"] in ["Pending", "Approved"]:
                        self.send_response(400)
                        self.send_header("Content-Type", "application/json")
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": "An application with this email is already being processed."}).encode("utf-8"))
                        return

                applications.append(application)
                save_applications(applications)

                self.send_response(201)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Application submitted successfully", "id": application["id"]}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        elif path == "/api/applications/status":
            auth_header = self.headers.get("Authorization")
            if auth_header != ADMIN_PASSCODE:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Unauthorized"}).encode("utf-8"))
                return

            app_id = data.get("id")
            new_status = data.get("status")

            if not app_id or new_status not in ["Pending", "Approved", "Rejected"]:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Invalid application ID or status"}).encode("utf-8"))
                return

            try:
                updated = False
                applications = get_applications()
                for app in applications:
                    if app["id"] == app_id:
                        app["status"] = new_status
                        updated = True
                        break
                
                if updated:
                    save_applications(applications)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "message": f"Status updated to {new_status}"}).encode("utf-8"))
                else:
                    self.send_response(404)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Application not found"}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        elif path == "/api/applications/delete":
            auth_header = self.headers.get("Authorization")
            if auth_header != ADMIN_PASSCODE:
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Unauthorized"}).encode("utf-8"))
                return

            app_id = data.get("id")
            if not app_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Invalid application ID"}).encode("utf-8"))
                return

            try:
                deleted = False
                applications = get_applications()
                original_len = len(applications)
                applications = [app for app in applications if app["id"] != app_id]
                if len(applications) < original_len:
                    deleted = True
                
                if deleted:
                    save_applications(applications)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "message": "Application deleted successfully"}).encode("utf-8"))
                else:
                    self.send_response(404)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Application not found"}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        else:
            self.send_response(404)
            self.end_headers()

def run(server_class=http.server.HTTPServer, handler_class=PragenHandler):
    # Ensure public folder exists
    try:
        if not os.path.exists(PUBLIC_DIR):
            os.makedirs(PUBLIC_DIR)
    except Exception as e:
        print(f"Warning: Could not create public directory: {e}")
        
    server_address = ("", PORT)
    httpd = server_class(server_address, handler_class)
    print(f"Starting server on http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    run()
