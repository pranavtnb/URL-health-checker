
URL Health Monitor
A full-stack, Dockerized application for monitoring the health and uptime of multiple URLs. Get real-time status, response time metrics, historical trends, and instant email alerts for downtime—all in a modern, user-friendly dashboard.

Features
Add & Monitor URLs: Input any number of URLs to track their health (UP/DOWN) and response times.
Scheduled Checks: URLs are automatically checked at regular intervals (default: every 5 minutes).
Manual Checks: Instantly trigger a health check for all URLs with a single click.
Email Alerts: Receive email notifications when any monitored URL goes down.
Metrics Dashboard: Visualize response times and uptime history with interactive charts.
Monitoring Status Bar: See last/next scheduled check, email alert status, and control monitoring.
Robust Error Handling: Clear feedback for connectivity and API errors.
Fully Dockerized: Easy to run locally or deploy anywhere with Docker Compose.

Tech Stack
Frontend: React, Material-UI, Axios, Chart.js
Backend: FastAPI, SQLite, APScheduler, yagmail, python-dotenv
DevOps: Docker, Docker Compose
Getting Started

Prerequisites
Docker Desktop installed and running
Quick Start

Clone this repository:
git clone <your-repo-url>
cd url-health-monitor

Set up email alerts (optional):
Edit backend/.env with your email credentials and recipient:
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_password
ALERT_RECIPIENT=recipient_email@gmail.com

Start the app:
docker compose up --build


Open your browser:
Frontend: http://localhost:3000
Backend API docs: http://localhost:8000/docs


Usage
Add URLs to the dashboard and monitor their status.
Check metrics for response time trends and uptime history.
Configure email alerts to get notified of downtime.
View and test API endpoints using the FastAPI docs.


Project Structure
url-health-monitor/
├── backend/      # FastAPI backend, SQLite DB, email, scheduler
├── frontend/     # React frontend, Material-UI, charts
├── docker-compose.yml
Customization
Change check frequency: Edit the scheduler interval in backend/main.py.
Add authentication, advanced analytics, or more alerting logic as needed.
Contributing
Pull requests and suggestions are welcome!
Feel free to open issues for bugs, feature requests, or improvements.

License
MIT License
