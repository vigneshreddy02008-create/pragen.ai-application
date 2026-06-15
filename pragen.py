import http.server
import socketserver
import json
import os
import urllib.parse
from datetime import datetime

PORT = 8000
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DATA_FILE = os.path.join(DATA_DIR, "applications.json")
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")
ADMIN_PASSCODE = "pragen2026"  # Secure passcode to access admin endpoints

# Ensure data directory and file exist
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump([], f, indent=4)

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
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    applications = json.load(f)
                
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
        if path == "/":
            self.path = "/index.html"
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
            required_fields = ["name", "email", "phone", "state", "city", "collegeName", "collegeState", "branch", "year"]
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
                # Load existing, append, save
                with open(DATA_FILE, "r+", encoding="utf-8") as f:
                    applications = json.load(f)
                    # Check for duplicate email in pending/approved to avoid spam
                    for app in applications:
                        if app["email"] == application["email"] and app["status"] in ["Pending", "Approved"]:
                            self.send_response(400)
                            self.send_header("Content-Type", "application/json")
                            self.end_headers()
                            self.wfile.write(json.dumps({"error": "An application with this email is already being processed."}).encode("utf-8"))
                            return

                    applications.append(application)
                    f.seek(0)
                    json.dump(applications, f, indent=4)
                    f.truncate()

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
                with open(DATA_FILE, "r+", encoding="utf-8") as f:
                    applications = json.load(f)
                    for app in applications:
                        if app["id"] == app_id:
                            app["status"] = new_status
                            updated = True
                            break
                    
                    if updated:
                        f.seek(0)
                        json.dump(applications, f, indent=4)
                        f.truncate()
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

        else:
            self.send_response(404)
            self.end_headers()

def run(server_class=http.server.HTTPServer, handler_class=PragenHandler):
    # Ensure public folder exists
    if not os.path.exists(PUBLIC_DIR):
        os.makedirs(PUBLIC_DIR)
        
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
