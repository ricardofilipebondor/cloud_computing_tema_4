#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${1:-rg-task-manager}"
LOCATION="${2:-westeurope}"
STORAGE_NAME="${3:-taskmgrstorage$RANDOM}"
QUEUE_NAME="${4:-tasks-queue}"
CONTAINER_NAME="${5:-task-files}"
DB_SERVER="${6:-taskmgr-psql-$RANDOM}"
DB_ADMIN="${7:-taskadmin}"
DB_PASSWORD="${8:-ChangeMe123!}"

echo "Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

echo "Creating storage account..."
az storage account create \
  --name "$STORAGE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS

echo "Creating queue and blob container..."
az storage queue create --name "$QUEUE_NAME" --account-name "$STORAGE_NAME" --auth-mode login
az storage container create --name "$CONTAINER_NAME" --account-name "$STORAGE_NAME" --public-access blob --auth-mode login

echo "Creating Azure Database for PostgreSQL..."
az postgres flexible-server create \
  --name "$DB_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --admin-user "$DB_ADMIN" \
  --admin-password "$DB_PASSWORD" \
  --tier Burstable \
  --sku-name Standard_B1ms \
  --public-access all

echo "Azure bootstrap completed."
