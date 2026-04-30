# Azure Multi-Tier SaaS Task Manager

Production-ready example of a Task Manager SaaS app using multiple Azure services in one end-to-end flow.

## Architecture (Multi-Tier)

- **Frontend tier**: Next.js App Router UI (`app/page.tsx`)
- **Backend/API tier**: Next.js Route Handlers (`app/api/tasks/*`)
- **Data tier**: Azure Database for PostgreSQL + Prisma (`prisma/schema.prisma`)
- **File tier**: Azure Blob Storage (task attachments)
- **Async tier**: Azure Queue Storage + Azure Functions worker (`functions/`)

## Azure Services Used and Why

1. **Azure App Service** - hosts backend/API for reliable managed Node.js runtime.
2. **Azure Static Web Apps** (or App Service) - serves frontend globally.
3. **Azure Database for PostgreSQL** - managed relational persistence for tasks.
4. **Azure Blob Storage** - durable file attachment storage.
5. **Azure Queue Storage** - decouples task creation from background processing.
6. **Azure Functions** - event-driven queue consumer, marks tasks as processed.
7. **Azure Application Insights** - centralized telemetry for API and queue worker.

## Orchestration Flow

1. User creates task in frontend.
2. Frontend sends `POST /api/tasks` with title and optional file.
3. Backend:
   - uploads file to Blob (if provided),
   - saves task in PostgreSQL through Prisma,
   - sends `{ taskId, title }` message to Azure Queue.
4. Azure Function is triggered by queue message.
5. Function logs processing and updates task: `processed = true` in PostgreSQL.

## Project Structure

```text
saas-task-manager-azure/
├── app/
│   ├── api/
│   │   └── tasks/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── azure-storage.ts
│   ├── env.ts
│   └── prisma.ts
├── prisma/
│   └── schema.prisma
├── functions/
│   ├── src/functions/task-processor.ts
│   ├── src/index.ts
│   ├── host.json
│   └── local.settings.json.example
├── scripts/
│   ├── setup-local.ps1
│   └── bootstrap-azure.sh
└── .env.example
```

## Environment Variables

Copy `.env.example` to `.env`:

```env
DATABASE_URL=
AZURE_STORAGE_CONNECTION_STRING=
AZURE_QUEUE_NAME=
AZURE_BLOB_CONTAINER=
AZURE_FUNCTION_URL=
APPLICATIONINSIGHTS_CONNECTION_STRING=
```

> `AZURE_FUNCTION_URL` is included to support future HTTP-trigger integrations and monitoring hooks.

## Local Run

1. Install dependencies:
   - `npm install`
   - `npm install --prefix functions`
2. Configure `.env` at root and `functions/local.settings.json`.
3. Run Prisma migration:
   - `npm run prisma:generate`
   - `npm run prisma:migrate -- --name init`
4. Run Next.js app:
   - `npm run dev`
5. Run Azure Function worker (separate terminal):
   - `npm run function:build`
   - `npm run function:start`

## API Endpoints

- `POST /api/tasks` - create task, optional file upload, queue message send
- `GET /api/tasks` - list tasks
- `PATCH /api/tasks/:id` - mark task completed/uncompleted
- `DELETE /api/tasks/:id` - delete task

## Deployment Guide

### 1) Deploy Azure PostgreSQL

```bash
az postgres flexible-server create \
  --name <db-server> \
  --resource-group <rg> \
  --location <region> \
  --admin-user <admin> \
  --admin-password <password> \
  --tier Burstable --sku-name Standard_B1ms
```

Create DB and get `DATABASE_URL` in Prisma format.

### 2) Setup Blob + Queue Storage

```bash
az storage account create --name <storage> --resource-group <rg> --location <region> --sku Standard_LRS
az storage container create --name <container> --account-name <storage> --public-access blob
az storage queue create --name <queue> --account-name <storage>
```

Set:
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_BLOB_CONTAINER`
- `AZURE_QUEUE_NAME`
- `APPLICATIONINSIGHTS_CONNECTION_STRING` (for API + Functions telemetry)

### 3) Deploy Backend (Azure App Service)

1. Create App Service (Node.js runtime).
2. Deploy this Next.js app.
3. Configure app settings env vars from `.env.example`.
4. Run `prisma migrate deploy` during startup or CI/CD.

### 4) Deploy Frontend

Option A: **Azure Static Web Apps**
- Connect repo and deploy Next.js frontend.
- Configure API integration or run as single Next.js app via App Service.

Option B: **Azure App Service**
- Deploy fullstack Next.js app (UI + API routes).

### 5) Deploy Azure Function

1. Create Function App (Node 20).
2. Deploy `functions/` folder.
3. Set Function App settings:
   - `AzureWebJobsStorage` = storage connection string
   - `AZURE_QUEUE_NAME` = queue name
   - `DATABASE_URL` = same PostgreSQL URL
   - `APPLICATIONINSIGHTS_CONNECTION_STRING` = connection string from Application Insights
4. Build/start command should point to compiled output.

### 6) Verify End-to-End

1. Create a task from UI.
2. Confirm task appears in PostgreSQL (`processed=false` initially).
3. Check queue receives message.
4. Confirm Azure Function logs processing.
5. Refresh UI and verify `processed=true`.

## Notes for Production

- Restrict Blob container access and use SAS URLs if public files are not desired.
- Add retries/dead-letter strategy for queue failures.
- Add auth (Azure AD B2C or custom JWT) before production launch.
- Enable Application Insights on both App Service and Function App.
