#!/bin/bash
# sync-prod-db.sh - Download production database and restore locally
#
# Prerequisites:
#   - Railway CLI installed: npm install -g @railway/cli
#   - Railway CLI logged in: railway login
#   - Railway project linked: railway link
#   - Local PostgreSQL running
#   - pg_dump and psql available in PATH

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/db-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/prod_backup_${TIMESTAMP}.sql"

# Local database config (from .env.development)
LOCAL_DB_HOST="${DB_HOST:-localhost}"
LOCAL_DB_PORT="${DB_PORT:-5432}"
LOCAL_DB_USER="${DB_USER:-coffeebudget_user}"
LOCAL_DB_PASS="${DB_PASS:-coffeebudget_password}"
LOCAL_DB_NAME="${DB_NAME:-coffeebudget}"

# Load local env if available
if [ -f "${PROJECT_DIR}/.env.development" ]; then
    export $(grep -v '^#' "${PROJECT_DIR}/.env.development" | xargs)
    LOCAL_DB_HOST="${DB_HOST:-localhost}"
    LOCAL_DB_PORT="${DB_PORT:-5432}"
    LOCAL_DB_USER="${DB_USER:-coffeebudget_user}"
    LOCAL_DB_PASS="${DB_PASS:-coffeebudget_password}"
    LOCAL_DB_NAME="${DB_NAME:-coffeebudget}"
fi

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Production Database Sync to Local Environment       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"

    # Check Railway CLI
    if ! command -v railway &> /dev/null; then
        echo -e "${RED}✗ Railway CLI not found${NC}"
        echo "  Install with: npm install -g @railway/cli"
        exit 1
    fi
    echo -e "${GREEN}✓ Railway CLI found${NC}"

    # Check if logged in to Railway
    if ! railway whoami &> /dev/null; then
        echo -e "${RED}✗ Not logged in to Railway${NC}"
        echo "  Run: railway login"
        exit 1
    fi
    echo -e "${GREEN}✓ Logged in to Railway${NC}"

    # Check pg_dump
    if ! command -v pg_dump &> /dev/null; then
        echo -e "${RED}✗ pg_dump not found${NC}"
        echo "  Install PostgreSQL client tools"
        exit 1
    fi
    echo -e "${GREEN}✓ pg_dump found${NC}"

    # Check psql
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}✗ psql not found${NC}"
        echo "  Install PostgreSQL client tools"
        exit 1
    fi
    echo -e "${GREEN}✓ psql found${NC}"

    # Check local PostgreSQL connection
    if ! PGPASSWORD="${LOCAL_DB_PASS}" psql -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" -U "${LOCAL_DB_USER}" -d postgres -c "SELECT 1" &> /dev/null; then
        echo -e "${RED}✗ Cannot connect to local PostgreSQL${NC}"
        echo "  Ensure PostgreSQL is running on ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}"
        exit 1
    fi
    echo -e "${GREEN}✓ Local PostgreSQL connection OK${NC}"

    echo ""
}

# Function to show warning and get confirmation
confirm_action() {
    echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                        ⚠️  WARNING                         ║${NC}"
    echo -e "${RED}╠═══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${RED}║  This will OVERWRITE your local database with production  ║${NC}"
    echo -e "${RED}║  data. All local changes will be LOST!                    ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Local database: ${YELLOW}${LOCAL_DB_NAME}${NC} @ ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo -e "${YELLOW}Operation cancelled.${NC}"
        exit 0
    fi
    echo ""
}

# Function to dump production database
dump_production_db() {
    echo -e "${BLUE}Step 1: Dumping production database...${NC}"

    # Create backup directory if it doesn't exist
    mkdir -p "${BACKUP_DIR}"

    # Get production DATABASE_URL from Railway
    echo "  Getting production database URL from Railway..."

    # Use railway run to execute pg_dump with production credentials
    echo "  Creating backup (this may take a few minutes)..."

    railway run pg_dump --no-owner --no-acl --clean --if-exists > "${BACKUP_FILE}" 2>/dev/null

    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to dump production database${NC}"
        exit 1
    fi

    # Check if backup file has content
    if [ ! -s "${BACKUP_FILE}" ]; then
        echo -e "${RED}✗ Backup file is empty${NC}"
        exit 1
    fi

    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo -e "${GREEN}✓ Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})${NC}"
    echo ""
}

# Function to restore to local database
restore_local_db() {
    echo -e "${BLUE}Step 2: Restoring to local database...${NC}"

    # Drop and recreate database
    echo "  Dropping existing local database..."
    PGPASSWORD="${LOCAL_DB_PASS}" psql -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" -U "${LOCAL_DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${LOCAL_DB_NAME};" 2>/dev/null

    echo "  Creating fresh database..."
    PGPASSWORD="${LOCAL_DB_PASS}" psql -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" -U "${LOCAL_DB_USER}" -d postgres -c "CREATE DATABASE ${LOCAL_DB_NAME};" 2>/dev/null

    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to create database${NC}"
        exit 1
    fi

    # Restore backup
    echo "  Restoring data (this may take a few minutes)..."
    PGPASSWORD="${LOCAL_DB_PASS}" psql -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" < "${BACKUP_FILE}" 2>/dev/null

    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}⚠ Some warnings during restore (usually safe to ignore)${NC}"
    fi

    echo -e "${GREEN}✓ Database restored successfully${NC}"
    echo ""
}

# Function to show summary
show_summary() {
    echo -e "${BLUE}Step 3: Verifying restore...${NC}"

    # Count tables
    TABLE_COUNT=$(PGPASSWORD="${LOCAL_DB_PASS}" psql -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)

    # Count some key tables
    USER_COUNT=$(PGPASSWORD="${LOCAL_DB_PASS}" psql -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -c "SELECT COUNT(*) FROM \"user\";" 2>/dev/null | xargs)
    TX_COUNT=$(PGPASSWORD="${LOCAL_DB_PASS}" psql -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -c "SELECT COUNT(*) FROM transaction;" 2>/dev/null | xargs)
    CAT_COUNT=$(PGPASSWORD="${LOCAL_DB_PASS}" psql -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -c "SELECT COUNT(*) FROM category;" 2>/dev/null | xargs)

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    Sync Complete! ✓                       ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Tables restored:    ${TABLE_COUNT:-?}                                    ${NC}"
    echo -e "${GREEN}║  Users:              ${USER_COUNT:-?}                                     ${NC}"
    echo -e "${GREEN}║  Transactions:       ${TX_COUNT:-?}                                  ${NC}"
    echo -e "${GREEN}║  Categories:         ${CAT_COUNT:-?}                                    ${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Backup saved to:                                         ║${NC}"
    echo -e "${GREEN}║  ${BACKUP_FILE}${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Function to cleanup old backups (keep last 5)
cleanup_old_backups() {
    if [ -d "${BACKUP_DIR}" ]; then
        BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/prod_backup_*.sql 2>/dev/null | wc -l)
        if [ "$BACKUP_COUNT" -gt 5 ]; then
            echo -e "${YELLOW}Cleaning up old backups (keeping last 5)...${NC}"
            ls -1t "${BACKUP_DIR}"/prod_backup_*.sql | tail -n +6 | xargs rm -f
            echo -e "${GREEN}✓ Old backups cleaned up${NC}"
        fi
    fi
}

# Function to show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Download production database from Railway and restore locally."
    echo ""
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo "  -y, --yes       Skip confirmation prompt"
    echo "  -b, --backup-only  Only create backup, don't restore"
    echo "  -r, --restore FILE Restore from existing backup file"
    echo ""
    echo "Environment variables (from .env.development):"
    echo "  DB_HOST         Local database host (default: localhost)"
    echo "  DB_PORT         Local database port (default: 5432)"
    echo "  DB_USER         Local database user (default: coffeebudget_user)"
    echo "  DB_PASS         Local database password"
    echo "  DB_NAME         Local database name (default: coffeebudget)"
    echo ""
    echo "Examples:"
    echo "  $0              # Interactive mode with confirmation"
    echo "  $0 -y           # Skip confirmation"
    echo "  $0 -b           # Only backup, don't restore"
    echo "  $0 -r backup.sql # Restore from specific backup"
    echo ""
}

# Parse command line arguments
SKIP_CONFIRM=false
BACKUP_ONLY=false
RESTORE_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -y|--yes)
            SKIP_CONFIRM=true
            shift
            ;;
        -b|--backup-only)
            BACKUP_ONLY=true
            shift
            ;;
        -r|--restore)
            RESTORE_FILE="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
check_prerequisites

if [ -n "$RESTORE_FILE" ]; then
    # Restore from existing backup
    if [ ! -f "$RESTORE_FILE" ]; then
        echo -e "${RED}Backup file not found: $RESTORE_FILE${NC}"
        exit 1
    fi
    BACKUP_FILE="$RESTORE_FILE"
    if [ "$SKIP_CONFIRM" = false ]; then
        confirm_action
    fi
    restore_local_db
    show_summary
else
    # Full sync: dump + restore
    if [ "$SKIP_CONFIRM" = false ]; then
        confirm_action
    fi
    dump_production_db

    if [ "$BACKUP_ONLY" = true ]; then
        echo -e "${GREEN}Backup created: ${BACKUP_FILE}${NC}"
        echo -e "${YELLOW}Skipping restore (--backup-only mode)${NC}"
    else
        restore_local_db
        show_summary
    fi
fi

cleanup_old_backups

echo -e "${BLUE}Done!${NC}"
