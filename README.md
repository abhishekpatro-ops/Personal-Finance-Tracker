# Personal Finance Tracker

Full-stack starter implementation using:
- Frontend: React + TypeScript + Vite
- Backend: ASP.NET Core Web API (.NET 9)
- Database: PostgreSQL

## Project Structure

- `frontend/` React TypeScript application + frontend container build files
- `backend/src/PersonalFinanceTracker.Api/` ASP.NET Core API
- `backend/Dockerfile` backend container build file
- `database/init.sql` PostgreSQL schema bootstrap
- `podman-compose.yml` Podman Compose services for frontend, backend and PostgreSQL

## Quick Start (Full Podman Deployment)

### 1. Start Podman machine (Windows)

```bash
podman machine start
```

### 2. Build and run all services

```bash
podman compose -f podman-compose.yml up -d --build
```

### 3. Open the app

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5298/api`
- Swagger: `http://localhost:5298/swagger`

### 4. Check running containers

```bash
podman ps
```

Expected containers:
- `pft-postgres`
- `pft-backend`
- `pft-frontend`

### 5. Stop everything

```bash
podman compose -f podman-compose.yml down
```

## Quick Start (Only PostgreSQL in Podman)

If you want frontend/backend to run locally and only DB in Podman:

```bash
podman compose -f podman-compose.yml up -d postgres
```

Then run backend and frontend locally as before.

## API Modules Included

- Auth (`/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`)
- Dashboard summary (`/api/dashboard/summary`)
- Transactions CRUD (`/api/transactions`)
- Categories CRUD (`/api/categories`)
- Accounts + transfer (`/api/accounts`, `/api/accounts/transfer`)
- Budgets CRUD (`/api/budgets`)
- Goals + contribute/withdraw (`/api/goals`)
- Reports (`/api/reports/...`)
- Recurring transactions CRUD (`/api/recurring`)

## Notes

- Uses Podman Compose for local container runtime.
- For production hardening, add: migrations, centralized validation, refresh token rotation, recurring job scheduler, tests, and audit logs.

## Azure DevOps Pipeline Deployment

This repository includes `azure-pipelines.yml` to deploy:
- API (`backend/src/PersonalFinanceTracker.Api`) to Azure App Service (Linux)
- Frontend (`frontend`) to Azure Static Web Apps

### 1. Create Azure resources first

- Resource group (example: `finance-tracker-rg`)
- App Service (Linux) for API
- Azure Static Web App for frontend
- Azure Database for PostgreSQL Flexible Server

### 2. Create Azure DevOps service connection

In Azure DevOps:
- `Project Settings -> Service connections -> New service connection -> Azure Resource Manager`
- Name it (example): `sc-finance-azure`

### 3. Add pipeline variables

In the pipeline UI, add these variables:
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

Set these as secret variables:
- `postgresConnectionString`
- `jwtKey`
- `swaDeploymentToken`

### 4. Run pipeline

- Create pipeline from existing YAML: `/azure-pipelines.yml`
- Run on `main` branch
- After deploy, verify:
  - API swagger: `https://<api-app-service-name>.azurewebsites.net/swagger`
  - Frontend: `https://<your-static-web-app-url>`

### 5. CORS reminder

The pipeline sets `Frontend__Url` on the API App Service. This maps to backend CORS config (`Frontend:Url`), so keep it equal to your frontend URL.
