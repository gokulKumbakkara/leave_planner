# Leave Planner

*A FastAPI backend application for tracking office leaves, planned leaves, and holidays throughout the year.*

It uses a SQLite database to store leave records and provides a simple, intuitive interface for users to manage their leave schedules.

## Features

- Tracks office leaves, planned leaves, and holidays
- Automatically initializes a SQLite database with tables for leaves, planned leaves, and holidays
- Supports leave accrual, with a configurable number of leaves per month (default: 2) and an accrual start month (default: January)
- Provides a RESTful API for interacting with the leave data
- Serves HTML templates using Jinja2 for a user-friendly interface

## Tech Stack

| Layer | Technology |
|---|---|
| Web framework | FastAPI |
| ASGI server | Uvicorn (standard extras) |
| Templating | Jinja2 |
| Database | SQLite |
| Language | Python 3.x |

Dependencies (`requirements.txt`): `fastapi`, `uvicorn[standard]`, `jinja2`, `python-multipart`.

## Getting Started

### Prerequisites

- Python 3.x
- pip

### Installation

```bash
pip install -r requirements.txt
```

## Usage

Start the application:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```
This starts the development server; access the application at `http://localhost:8000`.

## Contributing

To contribute to the Leave Planner project, please follow these steps:
1. Fork the repository to your GitHub account
2. Create a new branch for your feature or bug fix
3. Make your changes and commit them to the new branch
4. Open a pull request against the `main` branch
5. Ensure that your code is formatted correctly and includes any necessary tests or documentation
6. Wait for the maintainers to review and merge your pull request
