docker compose down
git pull
docker compose build --no-cache
docker compose up -d
docker compose logs -f