FROM node:18-bullseye

# Gerekli paketleri yükle
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --unsafe-perm

COPY . .

EXPOSE 3000
CMD [ "npm", "start" ]
