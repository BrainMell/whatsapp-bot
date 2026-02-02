# Use Node 18 with full system libraries
FROM node:18-bullseye

# Install the missing Linux libraries that sharp and pureimage need
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libvips42 \
    libnss3 \
    libatk1.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your code
COPY . .

# Expose the port your bot uses (if any)
EXPOSE 3000

# Start command
CMD ["node", "index.js"]