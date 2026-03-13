# 🚀 Deployment Guide: Go Image Service

This guide explains how to deploy the `@ImageGenScrapes` folder as a separate microservice on Render and connect it to your bot.

## Step 1: Prepare the Repository

1.  **Create a new GitHub Repository** (e.g., `goten-image-service`).
2.  **Move the files** from `@ImageGenScrapes` to the root of this new repository.
    *   *Note:* You must copy your `rpgasset` folder from your bot into an `assets` folder in this new repo.
    *   Structure should look like:
        ```text
        /
        ├── assets/
        │   └── rpgasset/ ... (characters, enemies, etc.)
        ├── pkg/ ...
        ├── main.go
        ├── go.mod
        ├── Dockerfile
        └── ...
        ```
3.  **Push** the code to GitHub.

## Step 2: Deploy to Render

1.  Go to **dashboard.render.com**.
2.  Click **New +** -> **Web Service**.
3.  Connect your new GitHub repository.
4.  **Configuration:**
    *   **Name:** `goten-image-service` (or whatever you like)
    *   **Runtime:** `Docker` (Render should detect the Dockerfile automatically)
    *   **Instance Type:** `Free` (might be slow) or `Starter` ($7/mo - Recommended for stability).
5.  Click **Create Web Service**.
6.  Wait for the build to finish. Copy the **Service URL** (e.g., `https://goten-image-service.onrender.com`).

## Step 3: Connect Your Bot

1.  Open your bot's `.env` file (locally or on Render dashboard).
2.  Add the variable:
    ```env
    GO_IMAGE_SERVICE_URL=https://goten-image-service.onrender.com
    ```
3.  **Copy the Client:**
    *   Take the `node-client.js` file I created in `@ImageGenScrapes`.
    *   Place it in your bot's `core` folder (e.g., `core/goImageService.js`).

## Step 4: Update Your Code

Replace your old image generation calls with the new service.

**Example (Combat):**
```javascript
// core/combatIntegration.js
const GoImageService = require('./goImageService');
const goService = new GoImageService();

async function generateCombatScene(players, enemies, ...) {
    // ... existing logic ...
    
    // REPLACE THIS:
    // const result = await combatImageGen.generateCombatImage(...)
    
    // WITH THIS:
    const buffer = await goService.generateCombatImage({
        players, enemies, 
        combatType: 'PVE',
        background: 'forest1.png'
    });
    
    return { success: true, buffer: buffer };
}
```

**That's it! Your bot is now using a high-performance Go microservice.**
