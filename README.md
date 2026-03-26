```markdown
# Personal Finance Tracker

A full-stack personal finance application built with a modern web stack and containerized local development workflow.

## Live Environment

- Frontend (Azure Static Web Apps): [https://lemon-smoke-0b0525a00.1.azurestaticapps.net/login]

## Tech Stack

- Frontend: React + TypeScript + Vite
- Backend: ASP.NET Core Web API (.NET 9)
- Database: PostgreSQL
- Container Runtime: Podman + Podman Compose

## Project Structure

- `frontend/`: React TypeScript application and frontend container files
- `backend/src/PersonalFinanceTracker.Api/`: ASP.NET Core Web API source
- `backend/Dockerfile`: Backend container build file
- `database/init.sql`: PostgreSQL schema bootstrap script
- `podman-compose.yml`: Compose services for frontend, backend, and PostgreSQL

## Quick Start (Full Podman Deployment)

### 1. Start Podman Machine (Windows)

```bash
podman machine start
```

### 2. Build and Start All Services

```bash
podman compose -f podman-compose.yml up -d --build
```

### 3. Open the Application

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5298/api`
- Swagger UI: `http://localhost:5298/swagger`

### 4. Verify Running Containers

```bash
podman ps
```

Expected containers:
- `pft-postgres`
- `pft-backend`
- `pft-frontend`

### 5. Stop All Services

```bash
podman compose -f podman-compose.yml down
```

## Quick Start (Run Only PostgreSQL in Podman)

If you want to run frontend and backend locally but keep PostgreSQL in Podman:

```bash
podman compose -f podman-compose.yml up -d postgres
```

Then run backend and frontend from your local environment.

## API Modules

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`
- Dashboard Summary: `/api/dashboard/summary`
- Transactions CRUD: `/api/transactions`
- Categories CRUD: `/api/categories`
- Accounts + Transfer: `/api/accounts`, `/api/accounts/transfer`
- Budgets CRUD: `/api/budgets`
- Goals + Contribute/Withdraw: `/api/goals`
- Reports: `/api/reports/...`
- Recurring Transactions CRUD: `/api/recurring`

## Notes

- Local container orchestration uses Podman Compose.
- For production hardening, consider adding:
  - database migration strategy
  - centralized validation and error handling
  - refresh token rotation
  - recurring/scheduled job management
  - automated tests
  - audit logging

## Azure DevOps Pipeline Deployment

This repository includes `azure-pipelines.yml` to deploy:

- API (`backend/src/PersonalFinanceTracker.Api`) to Azure App Service (Linux)
- Frontend (`frontend`) to Azure Static Web Apps

### 1. Create Azure Resources

- Resource group (example: `finance-tracker-rg`)
- App Service (Linux) for API
- Azure Static Web App for frontend
- Azure Database for PostgreSQL Flexible Server

### 2. Create Azure DevOps Service Connection

In Azure DevOps:

- `Project Settings -> Service connections -> New service connection -> Azure Resource Manager`
- Connection name example: `sc-finance-azure`

### 3. Add Pipeline Variables

In the pipeline UI, add:

- `azureServiceConnection` = `sc-finance-azure`
- `resourceGroupName` = `finance-tracker-rg`
- `apiAppServiceName` = `<your-api-app-service-name>`
- `apiBaseUrl` = `https://<your-api-app-service-name>.azurewebsites.net/api`
- `frontendUrl` = `https://<your-static-web-app-url>`
- `jwtIssuer` = `finance-tracker`
- `jwtAudience` = `finance-tracker`
- `postgresConnectionString` = `Host=...;Database=...;Username=...;Password=...;SSL Mode=Require;Trust Server Certificate=true`
- `jwtKey` = `<strong-secret>`
- `swaDeploymentToken` = `<static-web-app-deployment-token>`

Mark these variables as **secret**:

- `postgresConnectionString`
- `jwtKey`
- `swaDeploymentToken`

### 4. Run the Pipeline

- Create a pipeline from existing YAML: `/azure-pipelines.yml`
- Run it on the `main` branch
- After deployment, verify:
  - API Swagger: `https://<api-app-service-name>.azurewebsites.net/swagger`
  - Frontend: `https://<your-static-web-app-url>`

### 5. CORS Reminder

The pipeline sets `Frontend__Url` on the API App Service.
This maps to backend CORS config (`Frontend:Url`), so keep it aligned with your deployed frontend URL.
```
