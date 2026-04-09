# Leave Planner
## Description
Leave Planner is a FastAPI backend application designed to track office leaves, planned leaves, and holidays throughout the year. It utilizes a SQLite database to store leave records and provides a simple, intuitive interface for users to manage their leave schedules.

## Features
* Tracks office leaves, planned leaves, and holidays
* Automatically initializes a SQLite database with tables for leaves, planned leaves, and holidays
* Supports leave accrual, with a configurable number of leaves per month (default: 2) and an accrual start month (default: January)
* Provides a RESTful API for interacting with the leave data
* Serves HTML templates using Jinja2 for a user-friendly interface

## Tech Stack
* FastAPI: Web framework for building the RESTful API
* Uvicorn: ASGI server for running the FastAPI application
* Jinja2: Templating engine for rendering HTML templates
* SQLite: Database management system for storing leave records
* Python 3.x: Programming language for the application

## Installation
To install the required dependencies, run the following command:
```bash
pip install -r requirements.txt
```

## Usage
To start the application, run the following command:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```
This will start the development server, and you can access the application at `http://localhost:8000`.

## Folder Structure
The repository has the following top-level structure:
* `main.py`: The entry point of the application
* `requirements.txt`: The file containing the dependencies required by the application
* `static`: The directory containing static files (e.g., CSS, JavaScript, images)
* `templates`: The directory containing HTML templates for the application

## Contributing
To contribute to the Leave Planner project, please follow these steps:
1. Fork the repository to your GitHub account
2. Create a new branch for your feature or bug fix
3. Make your changes and commit them to the new branch
4. Open a pull request against the `main` branch
5. Ensure that your code is formatted correctly and includes any necessary tests or documentation
6. Wait for the maintainers to review and merge your pull request