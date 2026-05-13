# Quickstart: Cron Task Manager

**Feature**: 001-cron-task-manager
**Prerequisites**: Node.js ≥ 22.6, pnpm 9.x

---

## 1. Install dependencies

```sh
pnpm install
```

---

## 2. Configure the scheduler

Create `apps/scheduler/.env`:

```sh
PORT=3001
DATA_DIR=./data
JWT_SECRET=change-this-to-a-random-256-bit-secret
JWT_EXPIRY_HOURS=24

# Generate with: node -e "
#   const {scryptSync, randomBytes} = require('crypto');
#   const salt = randomBytes(16).toString('hex');
#   const hash = scryptSync('yourpassword', salt, 64).toString('hex');
#   console.log('scrypt:16384:8:1:' + salt + ':' + hash);
# "
ADMIN_PASSWORD_HASH=
```

The `data/` directory is created automatically on first run.

---

## 3. Configure the web app

Create `apps/web/.env.local`:

```sh
SCHEDULER_URL=http://localhost:3001/trpc
```

---

## 4. Start development

```sh
turbo dev
```

This starts:
- `apps/web` on `http://localhost:3000` (Next.js)
- `apps/scheduler` on `http://localhost:3001` (tRPC server)

---

## 5. Log in

Navigate to `http://localhost:3000`. You will be redirected to the login page.
Enter the password you used when generating `ADMIN_PASSWORD_HASH`.

---

## 6. Create your first task

1. Click **New Task**
2. Enter a name (e.g., "Hello World")
3. Set Command Type to **shell**
4. Set Command to `echo "hello from cronulent"`
5. Set Schedule to `* * * * *` (every minute)
   - The cron helper shows: *"Every minute"*
6. Click **Save**

The task appears in the task list with status **Enabled**. Within one minute, the first
execution appears in the history panel with exit code `0` and the stdout output.

---

## Production notes

- Run the scheduler with `node --experimental-strip-types src/index.ts` (Node 22.x) or
  `node src/index.ts` (Node 23.6+)
- Run the web app with `next start` after `next build`
- Use a process manager (systemd, PM2) for the scheduler in production
- The scheduler and web app can run on separate machines; set `SCHEDULER_URL` accordingly
