#!/usr/bin/env python3
"""
Simple HTTP server for testing the Dekereke Pivot Tables PWA locally.
Serves files from the docs/ directory with proper MIME types.
"""

# Copyright (C) 2025 Seth Johnston
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = "docs"

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add headers for PWA development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()

def main():
    # Check if docs directory exists
    if not os.path.isdir(DIRECTORY):
        print(f"Error: '{DIRECTORY}' directory not found!")
        print(f"Please run this script from the repository root.")
        sys.exit(1)
    
    # Create server
    Handler = MyHTTPRequestHandler
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("=" * 60)
        print(f"Dekereke Pivot Tables - Development Server")
        print("=" * 60)
        print(f"Server running at: http://localhost:{PORT}")
        print(f"Serving directory: {os.path.abspath(DIRECTORY)}")
        print(f"\nPress Ctrl+C to stop the server")
        print("=" * 60)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")
            sys.exit(0)

if __name__ == "__main__":
    main()
