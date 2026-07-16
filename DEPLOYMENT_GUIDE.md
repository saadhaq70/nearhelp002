# Deployment Guide for NearHelp

Complete guide for deploying backend and frontend to production.

---

## Quick Deployment Options

### Backend (Node.js + Express + PostgreSQL)
- **Railway** (Recommended) - Easy, free tier, automatic deployments
- **Render** - Free tier, good documentation
- **Heroku** - Classic option, easy setup
- **DigitalOcean App Platform** - Good for scaling
- **AWS EC2** - Full control, more complex

### Frontend (Next.js)
- **Vercel** (Recommended) - Made by Next.js creators, optimized
- **Netlify** - Great free tier, easy setup
- **Cloudflare Pages** - Fast global CDN
- **Vercel** + Custom Domain

---

## Option 1: Railway (Backend) + Vercel (Frontend) ⭐ RECOMMENDED

### Step 1: Deploy Backend to Railway

1. **Create Railway Account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Choose "Deploy from GitHub repo"
   - Select `nearhelp` repository
   - Choose `backend` folder as root directory

3. **Configure Environment Variables**
   ```
   DATABASE_URL=your-neondb-connection-string
   JWT_SECRET=generate-random-secret-32-chars
   ACCESS_TOKEN_SECRET=generate-random-secret-32-chars
   REFRESH_TOKEN_SECRET=generate-random-secret-32-chars
   MISTRAL_API_KEY=your-mistral-api-key
   NODE_ENV=production
   CLIENT_URL=https://your-frontend-url.vercel.app
   ```

4. **Configure Build Settings**
   - Build Command: `npm install && npx prisma generate`
   - Start Command: `npm start`
   - Root Directory: `/backend`

5. **Deploy**
   - Railway will automatically deploy
   - Copy your backend URL (e.g., `https://nearhelp-backend.railway.app`)

### Step 2: Deploy Frontend to Vercel

1. **Create Vercel Account**
   - Go to https://vercel.com
   - Sign up with GitHub

2. **Import Project**
   - Click "New Project"
   - Import `nearhelp` repository
   - Choose `frontend` folder as root directory

3. **Configure Environment Variables**
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app/api
   ```

4. **Configure Build Settings**
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Root Directory: `/frontend`

5. **Deploy**
   - Click "Deploy"
   - Copy your frontend URL (e.g., `https://nearhelp.vercel.app`)

6. **Update Backend CORS**
   - Go back to Railway
   - Update `CLIENT_URL` environment variable with your Vercel URL
   - Redeploy backend

### Step 3: Run Database Migrations

```bash
# Connect to Railway database
railway login
railway link
cd backend
npx prisma migrate deploy
npx prisma generate
```

---

## Option 2: Render (Full Stack)

### Deploy Both on Render

1. **Create Render Account**
   - Go to https://render.com
   - Sign up with GitHub

2. **Create PostgreSQL Database**
   - Click "New +"
   - Select "PostgreSQL"
   - Choose free tier or paid plan
   - Copy connection string

3. **Deploy Backend**
   - Click "New +" → "Web Service"
   - Connect GitHub repo
   - Configure:
     - Name: `nearhelp-backend`
     - Root Directory: `backend`
     - Environment: Node
     - Build Command: `npm install && npx prisma generate`
     - Start Command: `npm start`
   - Add environment variables (same as Railway)
   - Deploy

4. **Deploy Frontend**
   - Click "New +" → "Static Site"
   - Connect GitHub repo
   - Configure:
     - Name: `nearhelp-frontend`
     - Root Directory: `frontend`
     - Build Command: `npm install && npm run build`
     - Publish Directory: `.next`
   - Add environment variables
   - Deploy

---

## Option 3: Vercel (Frontend) + Your Own Server (Backend)

### If you have a VPS (DigitalOcean, AWS EC2, etc.)

1. **SSH into your server**
   ```bash
   ssh user@your-server-ip
   ```

2. **Install Node.js and PM2**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

3. **Clone Repository**
   ```bash
   git clone https://github.com/yourusername/nearhelp.git
   cd nearhelp/backend
   ```

4. **Install Dependencies**
   ```bash
   npm install
   npx prisma generate
   ```

5. **Configure Environment**
   ```bash
   nano .env
   # Add all environment variables
   ```

6. **Run Migrations**
   ```bash
   npx prisma migrate deploy
   ```

7. **Start with PM2**
   ```bash
   pm2 start server.js --name nearhelp-backend
   pm2 startup
   pm2 save
   ```

8. **Configure Nginx (Optional)**
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

9. **Deploy Frontend to Vercel** (see Option 1)

---

## Environment Variables Reference

### Backend Required Variables
```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=your-jwt-secret-min-32-chars
ACCESS_TOKEN_SECRET=your-access-token-secret
REFRESH_TOKEN_SECRET=your-refresh-token-secret
MISTRAL_API_KEY=your-mistral-api-key
NODE_ENV=production
CLIENT_URL=https://your-frontend-url.com
PORT=5000  # Optional, most platforms auto-assign
```

### Frontend Required Variables
```env
NEXT_PUBLIC_API_URL=https://your-backend-url.com/api
```

---

## Post-Deployment Verification

### 1. Test Backend Health
```bash
curl https://your-backend-url.com/api/health
```

### 2. Test Authentication
```bash
# Signup
curl -X POST https://your-backend-url.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"testpass123","phone":"1234567890","age":25}'

# Login
curl -X POST https://your-backend-url.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

### 3. Test AI Chatbot
```bash
curl -X POST https://your-backend-url.com/api/sos/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"system_instruction":{"parts":[{"text":"Emergency assistant"}]},"contents":[{"role":"user","parts":[{"text":"someone is bleeding"}]}]}'
```

### 4. Test Frontend
- Visit your frontend URL
- Try signup/login
- Open dashboard
- Test AI chatbot
- Create a test SOS
- Check map display

---

## Common Issues & Solutions

### Issue: "CORS Error"
**Solution**: Update `CLIENT_URL` environment variable on backend to match your frontend URL exactly.

### Issue: "Database Connection Failed"
**Solution**: 
- Verify `DATABASE_URL` is correct
- Ensure `?sslmode=require` is at the end for Neon/Railway
- Check firewall allows connections from your hosting platform

### Issue: "AI Chatbot Not Working"
**Solution**:
- Verify `MISTRAL_API_KEY` is set correctly
- Check backend logs for API errors
- Test endpoint directly with curl

### Issue: "JWT Token Errors"
**Solution**:
- Generate new random secrets (32+ characters)
- Ensure `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` are all set
- Clear browser cookies and try again

### Issue: "Prisma Client Error"
**Solution**:
```bash
npx prisma generate
npx prisma migrate deploy
# Restart application
```

---

## Monitoring & Maintenance

### Recommended Tools
- **Error Tracking**: Sentry (https://sentry.io)
- **Logging**: LogRocket or Papertrail
- **Uptime Monitoring**: UptimeRobot (https://uptimerobot.com)
- **Analytics**: Vercel Analytics (frontend) or Google Analytics

### Set Up Alerts
- Monitor API response times
- Track error rates
- Watch database connections
- Alert on high memory/CPU usage

---

## Scaling Considerations

### When to Scale
- More than 1000 concurrent users
- Database queries taking >500ms
- API response times >1s
- Memory usage consistently >80%

### Scaling Options
- **Backend**: Add more Railway/Render instances
- **Database**: Upgrade NeonDB plan or migrate to managed PostgreSQL
- **Frontend**: Vercel automatically scales
- **CDN**: Add Cloudflare for global performance

---

## Backup Strategy

### Database Backups
```bash
# Automated daily backups (Railway does this automatically)
# Manual backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Code Backups
- Use git tags for production releases
- Keep at least 3 previous versions
- Document rollback procedures

---

## Security Best Practices

1. ✅ Use HTTPS only (both frontend and backend)
2. ✅ Enable rate limiting on API
3. ✅ Keep dependencies updated (`npm audit fix`)
4. ✅ Monitor error logs daily
5. ✅ Regular database backups
6. ✅ Use strong JWT secrets (32+ random characters)
7. ✅ Enable 2FA on hosting accounts
8. ✅ Review access logs weekly

---

## Support & Resources

- **Railway Docs**: https://docs.railway.app
- **Vercel Docs**: https://vercel.com/docs
- **Render Docs**: https://render.com/docs
- **Prisma Docs**: https://prisma.io/docs
- **Next.js Docs**: https://nextjs.org/docs
- **NeonDB Docs**: https://neon.tech/docs

---

## Quick Command Reference

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm start

# Frontend
cd frontend
npm install
npm run build
npm start

# Database
npx prisma studio  # Open database GUI
npx prisma migrate status  # Check migrations
npx prisma db push  # Push schema without migration

# PM2 (if using VPS)
pm2 start server.js
pm2 logs
pm2 restart all
pm2 stop all
```

---

**Need Help?** Check the `SECURITY_AUDIT_REPORT.md` and `PRE_DEPLOYMENT_CHECKLIST.md` files.
