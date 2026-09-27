# Render SQLite Deployment Guide

I have prepared a custom Render blueprint (`render-sqlite.yaml`) that perfectly matches your current architecture. It spins up two services:
1. **Node Backend** (with a Persistent Disk mounted at `/data` to permanently store your `connected-opd.db` and patient documents).
2. **React Frontend** (as a blazing-fast Static Site).

## 1. Deploying to Render
1. Commit all your latest changes and push this repository to GitHub.
2. Go to your [Render Dashboard](https://dashboard.render.com/) and click **New > Blueprint**.
3. Connect your GitHub repository.
4. Render will detect the `render-sqlite.yaml` file. Click **Apply**.
5. *Note: If Render appends a random string to your URLs (e.g. `chettinad-care-api-a1b2.onrender.com`), you will need to update the `VITE_API_BASE_URL` on the frontend service and the `CORS_ORIGIN` on the backend service in the Render dashboard.*

## 2. Seeding the Production Database
Because your persistent disk will be completely blank, you won't be able to log in until you seed it!
1. In the Render Dashboard, go to your **chettinad-care-api** service.
2. Click on the **Shell** tab.
3. Run the following command to populate the database with the hospital demo data:
   `node opd/demo.cjs`
4. Once it finishes, you can log into the web app at your `chettinad-care-web` URL using `dr_prabha`!

## 3. Connecting the iOS App
To point your iOS app to the new live server:
1. Open `ChettinadCore/Networking/EnvironmentConfig.swift`.
2. Under the `.local` case (if you are running in the simulator via Xcode), replace `http://127.0.0.1:3001` with your new Render backend URL (e.g., `https://chettinad-care-api.onrender.com`).
3. Hit `Cmd + R` to build and run the iOS app, and it will now sync perfectly with the web!
