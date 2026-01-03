# Security Cleanup Checklist for Public Repository

## 🚨 CRITICAL - Files Containing Real Credentials (TRACKED IN GIT)

### PayPal Backup Files - PERSONAL FINANCIAL DATA
**Status:** Currently tracked in git history
**Action Required:** Remove from git history using git-filter-repo or BFG

```
scripts/paypal-backup-1765533210604.json
scripts/paypal-backup-1765533287712.json  
scripts/paypal-backup-1765533380185.json
```

**Contains:**
- Real bank account IDs
- Transaction descriptions with personal purchases
- Transaction amounts and dates
- GoCardless account IDs

**Commands to remove:**
```bash
# Remove from git history
git filter-repo --path scripts/paypal-backup-1765533210604.json --invert-paths
git filter-repo --path scripts/paypal-backup-1765533287712.json --invert-paths
git filter-repo --path scripts/paypal-backup-1765533380185.json --invert-paths

# Or use BFG Repo-Cleaner (recommended for large repos)
bfg --delete-files 'paypal-backup-*.json'
```

## ⚠️ WARNING - Contains Credentials (NOT in git, but on disk)

### Environment Files
**Status:** Properly ignored by .gitignore (NOT tracked)
**Action Required:** Verify they're never committed

```
.env.development - Contains:
  - Auth0 production secret
  - GoCardless secret ID and key
  - OpenAI API key

.env.production - Contains:
  - Auth0 production secret
```

**Verification:**
```bash
# Verify these are ignored
git check-ignore .env.development .env.production

# Should output the filenames if ignored
```

## ✅ SAFE - Template Files (Can remain)

```
.env.production.template - Safe (uses placeholders)
```

## 📋 Additional Checks Needed

### 1. Check Git History for Accidentally Committed Secrets
```bash
# Search all git history for potential secrets
git log --all --full-history --source --all -- '*.env*'
git log -p --all | grep -i 'password\|secret\|key' | head -50
```

### 2. Add to .gitignore
Already properly configured, but ensure these patterns are present:
```
.env
.env.*
!.env.example
!.env.production.template
*-backup-*.json
paypal-backup-*.json
```

### 3. Rotate Compromised Credentials

If this repo has ever been public or will be made public, rotate:
- ✅ Auth0 client secret (both dev and prod)
- ✅ GoCardless secret ID and key
- ✅ OpenAI API key

## 🔧 Cleanup Commands

```bash
# 1. Remove PayPal backup files from current state
rm scripts/paypal-backup-*.json

# 2. Stage the deletions
git add scripts/paypal-backup-*.json

# 3. Commit the removal
git commit -m "chore: remove PayPal backup files containing personal financial data"

# 4. Remove from git history (CRITICAL for public repo)
git filter-repo --path scripts/paypal-backup-1765533210604.json --invert-paths
git filter-repo --path scripts/paypal-backup-1765533287712.json --invert-paths
git filter-repo --path scripts/paypal-backup-1765533380185.json --invert-paths

# 5. Force push (ONLY if repo is private or you coordinate with team)
git push origin main --force

# 6. Verify cleanup
git log --all --full-history -- "scripts/paypal-backup-*.json"
# Should return nothing
```

## 🎯 Before Making Repository Public

1. ✅ Remove PayPal backup files from git history
2. ✅ Verify .env files are not tracked
3. ✅ Rotate all credentials shown in this audit
4. ✅ Review all documentation for personal information
5. ✅ Check all markdown files for embedded credentials
6. ✅ Scan with git-secrets or gitleaks tools

## 🛡️ Recommended Tools

```bash
# Install gitleaks for automated secret scanning
brew install gitleaks  # macOS
# or
wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz

# Run scan
gitleaks detect --source . --verbose

# Install git-secrets
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
make install
```

## 📝 Notes

- The .env files are properly ignored and not in git history ✅
- PayPal backup files ARE in git history and contain personal data ❌
- No personal names found in markdown files ✅
- No obvious API keys in documentation ✅
- .gitignore is properly configured ✅
