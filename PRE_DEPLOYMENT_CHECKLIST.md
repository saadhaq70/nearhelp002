# Pre-Deployment Checklist for NearHelp

**Generated**: July 16, 2026

## 1. Security & Secrets ✓

### Environment Variables
- [ ] `.env` files are NOT committed to git
- [ ] `.env.example` files are up-to-date and committed
- [ ] All API keys are stored in `.env` files
- [ ] Production environment variables are configured on hosting platform

### API Keys to Configure on Deployment:
- **MISTRAL_API_KEY**: Mistral AI API key
- **DATABASE_URL**: NeonDB PostgreSQL connection string  
- **JWT_SECRET**: Secret for JWT token signing
- **CLIENT_URL**: Frontend URL (for CORS)
- **PORT**: Backend port (default: 5000)

---

## 2. Database & Prisma ✓

### Production Database Checklist
- [ ] Database migrations are synced
- [ ] Prisma client is generated
- [ ] Database connection uses SSL for production
- [ ] Database backup strategy is in place

### Run Before Deployment:
```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

---

## 3. Dependencies & Build ✓

### Audit Dependencies
```bash
# Backend
cd backend
npm audit

# Frontend  
cd frontend
npm audit
```

### Build Tests
```bash
# Backend syntax check
cd backend
node -c server.js

# Frontend build test
cd frontend
npm run build
```

---

## 4. Code Quality & Testing ✓

### Backend Tests
```bash
cd backend
node test-db-connection.js
node test-ai-chat.js
```

### Frontend Tests
```bash
cd frontend
npm run lint
```

---

## 5. Configuration Files ✓

### Backend `.env` (Production)
```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
MISTRAL_API_KEY=...
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-frontend-url.com
```

### Frontend `.env.local` (Production)
```env
NEXT_PUBLIC_API_URL=https://your-backend-url.com/api
```

---

## 6. CORS & Security ✓

### Backend CORS Configuration
File: `backend/server.js`
- [ ] CORS origin set to production frontend URL
- [ ] Credentials enabled: `credentials: true`

---

## 7. Git & Version Control ✓

### Pre-Commit Checks
```bash
# Check for sensitive files
git ls-files --others --exclude-standard | grep -E "\.(env|pem|key)"

# Review changes
git status
git diff

# Check for large files
find . -type f -size +10M ! -path "*/node_modules/*" ! -path "*/.git/*"
```

---

## 8. Deployment Platform Configuration ✓

### Backend (Node.js)
**Platforms**: Railway, Render, Heroku, DigitalOcean

**Configuration**:
- Node.js version: 18.x or 20.x
- Start command: `npm start`
- Build command: `npm install && npx prisma generate`
- Port: Use `process.env.PORT`

### Frontend (Next.js)
**Platforms**: Vercel, Netlify, Cloudflare Pages

**Configuration**:
- Framework: Next.js
- Build command: `npm run build`
- Output directory: `.next`
- Node.js version: 18.x or 20.x

---

## 9. Post-Deployment Verification ✓

### Test Critical Endpoints
```bash
# Health check
curl https://your-backend-url.com/api/health

# Test AI chat
curl -X POST https://your-backend-url.com/api/sos/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"system_instruction":{"parts":[{"text":"Emergency assistant"}]},"contents":[{"role":"user","parts":[{"text":"someone is bleeding"}]}]}'
```

### Frontend Verification
- [ ] Visit production URL
- [ ] Login flow works
- [ ] Dashboard loads
- [ ] AI chatbot responds
- [ ] Map displays
- [ ] SOS creation works

---

## 10. Final Deployment Steps

```bash
# 1. On main branch
git checkout main
git pull origin main

# 2. Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Run tests
cd backend && node test-ai-chat.js && cd ..

# 4. Build frontend
cd frontend && npm run build && cd ..

# 5. Check git status
git status

# 6. Commit and push
git add .
git commit -m "Production-ready build"
git push origin main

# 7. Deploy to hosting platform
```

---

## Deployment Status Tracker

- [ ] Security audit passed
- [ ] All tests passed
- [ ] Environment variables configured
- [ ] Database migrations deployed
- [ ] Backend deployed
- [ ] Frontend deployed
- [ ] End-to-end testing completed

**Deployed By**: _______________  
**Date**: _______________  
**Version**: _______________

---

## Emergency Rollback

```bash
# Database rollback
cd backend
npx prisma migrate rollback

# Git rollback
git revert HEAD
git push origin main
```

---

## Post-Deployment Monitoring (First 24h)

- [ ] Monitor error rates
- [ ] Check server logs
- [ ] Verify database connections
- [ ] Test user flows
- [ ] Monitor API response times
- [ ] Check AI chatbot functionality
